import {
  util, Vector2, Vector3, Vector4, Matrix4, Quat,
  nstructjs, math, ToolOp, ToolProperty, ToolFlags,
  PropFlags, PropTypes, IntProperty, BoolProperty, FloatProperty
} from '../path.ux/pathux.js';

import {
  cubic2, cubic, dcubic, dcubic2, kcubic2,
  d3cubic2, d2cubic2, d3cubic, d2cubic, cubic2len
} from '../core/bezier.js';

import {StrokeProperty, ImageOp, getPressure} from './paint.js';
import {BrushFlags, DotSample} from '../core/canvas.js';
import {Icons} from '../core/icon_enum.js';

export class ResetCanvasOp extends ImageOp {
  constructor() {
    super();
  }

  static tooldef() {
    return {
      uiname  : "Reset Canvas",
      toolpath: "canvas.reset",
      icon    : Icons.TRASH,
    }
  }

  exec(ctx) {
    let canvas = ctx.canvas;

    this.undoCheck(ctx, 0, 0, canvas.width, canvas.height);

    if (canvas.image) {
      canvas.image.data.fill(255);
    } else {
      canvas.reset();
    }

    window.redraw_all([0, 0], [canvas.width, canvas.height]);
  }
}

ToolOp.register(ResetCanvasOp);

export class BrushStrokeOp extends ImageOp {
  constructor() {
    super();

    this.lastTime = util.time_ms();

    this.wasFirst = false;

    this.skipi = 0;

    this.T = 0.0;
    this.rect = [new Vector2(), new Vector2()];
    this.last_mpos = new Vector2();
    this.mpos = new Vector2();
    this.start_mpos = new Vector2();
    this.first = true;
    this.last_stroke_pressure = 1.0;
    this.last_stroke_squish = 0.0;
    this.last_stroke_angle = 0.0;
    this.last_stroke_soft = 0.0;
    this.last_stroke_alphaLighting = 0.0;
    this.last_stroke_mpos = new Vector2();
    this.last_stroke_mpos2 = new Vector2();
    this.last_stroke_mpos3 = new Vector2();
    this.t = 0.0;
    this.last_t = 0.0;

    this.dv = new Vector2();
    this.last = {};
  }

  static tooldef() {
    return {
      uiname  : "Stroke",
      toolpath: "brush.stroke",
      inputs  : {
        stroke  : new StrokeProperty(),
        x       : new IntProperty(),
        y       : new IntProperty(),
        pressure: new FloatProperty(),
        initial : new BoolProperty(),
        dpi     : new FloatProperty(),
      },
      outputs : {},
      is_modal: true
    }
  }

  static invoke(ctx, args) {
    let tool = super.invoke(ctx, args);

    if (!("dpi" in args)) {
      tool.inputs.dpi.setValue(window.devicePixelRatio);
    }

    return tool;
  }

  finish() {
    this.modalEnd(false);
  }

  modalStart(ctx) {
    this.last_stroke_pressure = 1.0;
    this.first = true;
    this.t = 0.0;
    this.dv = new Vector2();
    this.skipi = 0;

    ctx.canvas.beginStroke();

    if (this.inputs.initial.getValue()) {
      let x = this.inputs.x.getValue();
      let y = this.inputs.y.getValue();
      let pressure = this.inputs.pressure.getValue();

      this.on_pointermove(new PointerEvent("pointermove", {
        x, y, pageX: x, pageY: y, clientX: x, clientY: y,
        tiltX      : 0, tiltY: 0, pressure
      }), pressure);
    }

    return super.modalStart(ctx);
  }

  on_mousedown(e) {
    let ctx = this.modal_ctx;

    //console.log("mouse down in BrushStrokeOp!");
    //this.finish();
  }

  on_pointercancel(e) {
    console.error("POINTER CANCEL!");

    let ctx = this.modal_ctx;
    this.modalEnd(false);
    ctx.toolstack.undo();

    window.redraw_all();
  }

  on_pointermove(e, customPressure) {
    let ctx = this.modal_ctx;

    let editor = ctx.canvasEditor;
    let mpos = editor.getLocalMouse(e.x, e.y);

    let brush = ctx.canvas.brush;

    this.mpos.load(mpos);
    let was_first = false;

    if (this.first) {
      this.last = {
        mpos    : new Vector2(mpos),
        mpos2   : new Vector2(mpos),
        mpos3   : new Vector2(mpos),
        spos    : new Vector2(mpos),
        spos2   : new Vector2(mpos),
        spos3   : new Vector2(mpos),
        dv      : new Vector2(),
        dv2     : new Vector2(),
        dv3     : new Vector2(),
        t       : 0,
        stroke_t: 0
      }

      this.curve = [
        new Vector2(mpos),
        new Vector2(mpos),
        new Vector2(mpos),
        new Vector2(mpos)
      ];

      this.t = 0;
      this.last_t = 0;
      this.last_stroke_t = 0;
      this.skipi = 0;

      this.first = false;
      was_first = true;

      ctx.canvas.beginStroke();
      this.wasFirst = true;
    }

    const continuous = brush.continuous;

    let pressure = customPressure !== undefined ? customPressure : e.pressure;
    let tiltx = e.tiltX/180.0 + 0.5;
    let tilty = e.tiltY/180.0 + 0.5;
    let tilt = Math.sqrt((tiltx*2.0 - 1.0)**2 + (tilty*2.0 - 1.0))**2;

    //tiltx = Math.cos(this.T)*0.5 + 0.5;

    let dx = mpos[0] - this.last.mpos[0];
    let dy = mpos[1] - this.last.mpos[1];

    this.dv.loadXY(dx, dy);

    let tilt_len = Math.sqrt(tiltx*tiltx + tilty*tilty);
    let tilt_angle = tilt_len < 0.05 ? 0.0 : (Math.atan2(e.tiltY, e.tiltX)/Math.PI/2.0 + 0.5);

    let angle = Math.atan2(dy, dx)/Math.PI/2.0 + 0.5;

    const mappings = {pressure, tiltx, tilty, tilt_angle, angle, tilt, distance: this.t*0.05};
    let radius = brush.channels.evaluate("radius", mappings)*devicePixelRatio;

    if (was_first) {
      this.last.dv.load(this.dv);

      for (let ch of brush.channels) {
        this.last[ch.name] = ch.evaluate(mappings);
      }
    }

    /* update curve */
    let cv = this.curve;

    //cv[0].load(this.last.spos2);
    //cv[3].load(this.last.spos);
    let setCurve = () => {
      cv[0].load(this.last.spos2);
      cv[3].load(this.last.spos);

      let a = new Vector2();
      let b = new Vector2();
      let l1, l2;

      a.load(this.last.spos2).sub(this.last.spos3);
      b.load(this.last.spos).sub(this.last.spos2);
      l1 = a.vectorLength();
      l2 = b.vectorLength();

      a.interp(b, 0.5);//.normalize().mulScalar(l1 + l2);

      cv[1].load(a).mulScalar(1.0/3.0).add(cv[0]);

      a.load(this.last.spos).sub(this.last.spos2);
      b.load(this.mpos).sub(this.last.spos);
      l1 = a.vectorLength();
      l2 = b.vectorLength();

      a.interp(b, 0.5);//.normalize().mulScalar(l1 + l2);

      cv[2].load(a).mulScalar(-1.0/3.0).add(cv[3]);
    }

    if (!window.DD1) {
      window.DD1 = 0.5;
    }
    let skip;

    let makeDotSample = (s, radius, t, deltaS) => {
      //let p = new Vector2(this.last.mpos).interp(this.mpos, s);
      //let dv = new Vector2(this.last.dv).interp(this.dv, s);
      let cv = this.curve;

      let p = cubic2(cv[0], cv[1], cv[2], cv[3], s);
      let dv = dcubic2(cv[0], cv[1], cv[2], cv[3], s);

      //dv.mulScalar(deltaS);
      //p.load(cv[0]).interp(cv[3], s);

      let ds = new DotSample(p[0], p[1], dv[0], dv[1], t, pressure, radius);
      ds.deltaS = deltaS*skip;

      for (let ch of brush.channels) {
        if (ch.name === "radius") {
          continue;
        }

        if (ds[ch.name] !== undefined) {
          ds[ch.name] = this.last[ch.name];
          ds[ch.name] += (ch.evaluate(mappings) - ds[ch.name])*s;
        } else {
          console.warn("DotSample is missing a field:", ch.name);
        }
      }

      let rdx = (Math.random() - 0.5)*radius*0.5*ds.random;
      let rdy = (Math.random() - 0.5)*radius*0.5*ds.random;

      dv[0] += rdx;
      dv[1] += rdy;

      ds.x += rdx;
      ds.y += rdy;

      ds.dx = dv[0];
      ds.dy = dv[1];

      ds.angle = brush.channels.evaluate("angle", mappings)/180.0*Math.PI;

      //dv = dcubic2(cv[0], cv[1], cv[2], cv[3], s2);
      //dv = dcubic2(cv[0], cv[1], cv[2], cv[3], Math.max(s - subspace*0.5, 0));

      //dv[0] = dx;
      //dv[1] = dy;

      let th = Math.atan2(dv[1], dv[0]) + Math.PI*0.5;
      ds.followAngle = th;

      if ((brush.flag & BrushFlags.FOLLOW) && !continuous) {
        ds.angle += ds.followAngle;
      }

      return ds;
    }

    let subspace = brush.channels.evaluate("spacing", mappings);

    if (subspace > 0.1) {
      let goalsubspace = 0.1;

      skip = Math.max(Math.ceil(subspace/goalsubspace), 1);
      subspace /= skip;
    } else {
      skip = 1;
    }

    let execDot = (ctx, ds) => {
      if (this.skipi%skip === 0) {
        this.execDot(ctx, ds);
      }

      this.skipi++;
    }

    //console.log("Skip", skip, subspace, brush.channels.evaluate("spacing", mappings));

    if (subspace === 0.0) {
      console.error("spacing was 0!");
      return;
    }

    let tscale = 1.0/(radius*2.0);

    let testdis = this.mpos.vectorDistance(this.last.spos);
    let test_dt = testdis*tscale;

    if (test_dt >= subspace*3.0) {
      //let dis = this.last.mpos.vectorDistance(this.last.mpos2);
      let dis = this.last.spos.vectorDistance(this.last.spos2);

      if (dis*tscale < subspace) {
        //this.last.spos.load(this.last.mpos);
        //dis = this.last.spos.vectorDistance(this.last.spos2);
      }

      setCurve();

      let idis = (dis*tscale)/subspace;
      idis = Math.floor(idis);

      let dt = idis*subspace;

      let t = this.last_t;
      let goalt = this.last_t + dt;

      let s = 0.0;

      let _i = 0;
      let first = 1;

      let skip = t >= goalt;

      let ds = subspace/(goalt - this.last_t);

      while (t < goalt) {
        if (_i++ > 10000) {
          console.error("Infinite loop error!");
          break;
        }

        s = (t - this.last_t)/(goalt - this.last_t);

        if (first) {//t < this.last_t + subspace) {
          first--;
        } else {
          execDot(ctx, makeDotSample(s, radius, t, ds));
        }

        t += subspace;
      }


      if (s < 1.0 - subspace/(dt + subspace)) {
        execDot(ctx, makeDotSample(1.0, radius, goalt, ds));
      }

      /* set last values */
      let lastds = makeDotSample(1.0, radius, t, ds);
      for (let k in lastds) {
        this.last[k] = lastds[k];
      }

      this.last_t = goalt;
      this.t = goalt;

      //this.t = t;
      /*this.t might be bigger then t, so we keep it*/
      //this.t = t;

      this.last.spos3.load(this.last.spos2);

      //this.last.spos2.loadXY(lastds.x, lastds.y);
      this.last.spos2.load(this.last.spos);

      this.last.spos.load(this.mpos);

      this.last.dv3.load(this.last.dv2);
      this.last.dv2.load(this.last.dv);
      this.last.dv.load(this.dv);
    }

    this.last.mpos3.load(this.last.mpos2);
    this.last.mpos2.load(this.last.mpos);
    this.last.mpos.load(this.mpos);
  }

  execDot(ctx, ds) {
    let radius = Math.ceil(ds.radius*this.inputs.dpi.getValue()*1.1);

    let [min, max] = this.rect;

    min.loadXY(ds.x, ds.y);
    max.load(min);
    min.addScalar(~~(-radius*1.25));
    max.addScalar(~~(radius*1.25));

    this.undoCheck(ctx, ds.x, ds.y, 2*radius);

    for (let step of ctx.canvas.execDot(ds)) {
    }

    window.redraw_all(min, max);
  }

  exec(ctx) {
    for (let ds of this.inputs.stroke) {
      this.execDot(ctx, ds);
    }
  }

  execPost(ctx) {
  }

  on_mouseup(e) {
    console.log("mouse up in paint op!");

    let ctx = this.modal_ctx;
    this.finish();
  }
}

ToolOp.register(BrushStrokeOp);
