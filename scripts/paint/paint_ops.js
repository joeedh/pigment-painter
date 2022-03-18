import {
  util, Vector2, Vector3, Vector4, Matrix4, Quat,
  nstructjs, math, ToolOp, ToolProperty, ToolFlags,
  PropFlags, PropTypes, IntProperty, BoolProperty, FloatProperty, UIBase
} from '../path.ux/pathux.js';

import {Stroker} from './stroker.js';

import {
  cubic2, cubic, dcubic, dcubic2, kcubic2,
  d3cubic2, d2cubic2, d3cubic, d2cubic, cubic2len
} from '../core/bezier.js';

import {StrokeProperty, ImageOp, getPressure} from './paint.js';
import {BrushFlags, DotSample} from '../core/canvas.js';
import {Icons} from '../core/icon_enum.js';
import {hsv_to_rgb} from '../core/color.js';

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
    this.last = undefined;
    this.cur = {};

    this.s = 0;

    this.rect = [new Vector2(), new Vector2()];

    this.brush = undefined;
    this.deviceInputs = undefined;

    this.mpos = new Vector2();
    this.lastMpos = new Vector2();
  }

  static tooldef() {
    return {
      uiname  : "Stroke",
      toolpath: "brush.stroke",
      inputs  : {
        stroke  : new StrokeProperty(),
        x       : new FloatProperty(),
        y       : new FloatProperty(),
        tiltX   : new FloatProperty(),
        tiltY   : new FloatProperty(),
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
      tool.inputs.dpi.setValue(UIBase.getDPI());
    }

    return tool;
  }

  on_pointercancel(e) {
    console.error("POINTER CANCEL!");

    let ctx = this.modal_ctx;
    this.modalEnd(false);
    ctx.toolstack.undo();

    window.redraw_all();
  }

  modalStart(ctx) {
    let ret = super.modalStart(ctx);

    this.s = 0;

    let {x, y, initial, pressure, tiltX, tiltY, dpi} = this.getInputs();

    let brush = this.brush = ctx.canvas.brush;

    ctx.canvas.beginStroke();

    if (initial) {
      let editor = ctx.canvasEditor;

      [x, y] = editor.getLocalMouse(x, y);

      let inputs = this.deviceInputs = this.getMappings(pressure, tiltX, tiltY, 0, 0);

      this.last = {};
      this.storeParams(this.last, brush, inputs);
      this.storeParams(this.cur, brush, inputs);

      this.lastMpos.loadXY(x, y);
      this.mpos.loadXY(x, y);

      let radius = brush.channels.evaluate("radius", inputs)*dpi;
      let spacing = brush.channels.evaluate("spacing", inputs);
      this.stroker = new Stroker(this.pointCallback.bind(this), true, x, y, radius, spacing);
    } else {
      this.stroker = new Stroker(this.pointCallback.bind(this), false);
    }

    this.stroker.lag = 1.0;

    return ret;
  }

  resetStroke() {
    let ctx = this.modal_ctx;
    ctx.canvas.beginStroke();
    this.stroker = new Stroker(this.pointCallback.bind(this), false);
  }

  pointCallback(x, y, dx, dy, t, dt, deltaS) {
    dx *= deltaS/dt;
    dy *= deltaS/dt;

    let ds = new DotSample(x, y, dx, dy);

    let brush = this.brush;
    let continuous = brush.continuous;

    let {last, cur} = this;

    for (let k in last) {
      let a = last[k];
      let b = cur[k];

      if (typeof a === "object") {
        ds[k] = b;
      } else {
        ds[k] = a + (b - a)*t;

        if (brush.channels.has(k)) {
          ds[k] = brush.channels.get(k).evaluate(this.deviceInputs, ds[k]);
        }
      }
    }

    let rdx = 0.25*ds.random*(Math.random() - 0.5)*ds.radius*2.0;
    let rdy = 0.25*ds.random*(Math.random() - 0.5)*ds.radius*2.0;

    ds.x += rdx;
    ds.y += rdy;
    ds.dx += rdx;
    ds.dy += rdy;

    ds.angle *= Math.PI/180.0;

    ds.t = this.s;
    ds.deltaS = dt; /* again with the wrong name, S is supposed to be arc length,*/

    //ds.angle = brush.channels.evaluate("angle", inputs)/180.0*Math.PI;

    let th = Math.atan2(dy, dx) + Math.PI*0.5;
    ds.followAngle = th;

    if ((brush.flag & BrushFlags.FOLLOW) && !continuous) {
      ds.angle += ds.followAngle;
    }
    //console.log(x, y, dx, dy, t, ds);

    this.s += deltaS/(2.0*ds.radius);

    this.execDot(this.modal_ctx, ds);
  }

  getMappings(pressure, tiltX, tiltY, dx, dy) {
    let tiltx = tiltX/180.0 + 0.5;
    let tilty = tiltY/180.0 + 0.5;
    let tilt = Math.sqrt((tiltx*2.0 - 1.0)**2 + (tilty*2.0 - 1.0))**2;

    //tiltx = Math.cos(this.T)*0.5 + 0.5;

    let tilt_len = Math.sqrt(tiltx*tiltx + tilty*tilty);
    let tilt_angle = tilt_len < 0.05 ? 0.0 : (Math.atan2(tiltY, tiltX)/Math.PI/2.0 + 0.5);

    let angle = Math.atan2(dy, dx)/Math.PI/2.0 + 0.5;

    return {pressure, tiltx, tilty, tilt_angle, angle, tilt, distance: this.s*0.05};
  }

  storeParams(params, brush, inputs, s = this.s) {
    params.pressure = inputs.pressure;
    params.t = s; /* wrong name! t is for normalize subsegment position, s is arc length stroke distance!*/

    for (let ch of brush.channels) {
      params[ch.name] = ch.getValue();
    }

    params.radius *= this.inputs.dpi.getValue();
  }

  on_pointermove(e) {
    let ctx = this.modal_ctx;
    let editor = ctx.canvasEditor;
    let brush = ctx.canvas.brush;
    let [x, y] = editor.getLocalMouse(e.x, e.y);

    let {dpi} = this.getInputs();

    this.mpos.loadXY(x, y);

    let dx = x - this.lastMpos[0];
    let dy = y - this.lastMpos[1];

    let inputs = this.deviceInputs = this.getMappings(e.pressure, e.tiltX, e.tiltY, dx, dy);

    if (!this.last) {
      this.last = {};
      this.storeParams(this.last, brush, inputs);
    }

    this.storeParams(this.cur, brush, inputs);

    let radius = brush.channels.evaluate("radius", inputs)*dpi;
    let spacing = brush.channels.evaluate("spacing", inputs);
    this.stroker.onInput(x, y, radius, spacing);

    this.lastMpos.loadXY(x, y);
    this.storeParams(this.last, brush, inputs);
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

  finish() {
    this.modalEnd(false);
  }

  exec(ctx) {
    for (let ds of this.inputs.stroke) {
      this.execDot(ctx, ds);
    }
  }

  execPost(ctx) {
  }

  on_pointerup(e) {
    console.log("mouse up in paint op!");

    let ctx = this.modal_ctx;
    this.finish();
  }
}

export class _BrushStrokeOp extends ImageOp {
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

    this.brush = ctx.canvas.brush;

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

export class CanvasTestOp extends BrushStrokeOp {
  constructor() {
    super();

    this.timer = undefined;
    this.iter = undefined;
  }

  static tooldef() {
    return {
      uiname  : "Test",
      toolpath: "canvas.test",
      is_modal: true,
      inputs  : ToolOp.inherit({}),
      outputs : {},
    }
  }

  modalStart(ctx) {
    let ret = super.modalStart(ctx);

    this.iter = this.task();

    this.timer = window.setInterval(() => {
      let time = util.time_ms();
      while (util.time_ms() - time < 10) {
        let next;

        try {
          next = this.iter.next();
        } catch (error) {
          util.print_stack(error);
          this.modalEnd();

          return;
        }

        if (next.done) {
          this.modalEnd();
        }
      }

      window.redraw_all();
    }, 35);

    return ret;
  }

  modalEnd() {
    if (this.timer !== undefined) {
      window.clearInterval(this.timer);
    }

    this.timer = undefined;

    return super.modalEnd();
  }

  on_pointermove(e, enabled = false) {
    if (enabled) {
      //console.log(e.x, e.y, e.pressure, e);
      return super.on_pointermove(e);
    }
  }

  * task() {
    let ctx = this.modal_ctx;
    let brush = this.brush;
    let r = brush.radius*UIBase.getDPI()*1.5;
    let canvas = ctx.canvas;
    let ed = ctx.canvasEditor;
    let gen = ed.drawGen;

    let cols = ~~(canvas.width/r);

    console.log("cols:", cols);

    let evt = {
      pressure: 1.0,
      tiltX   : 1.0,
      tiltY   : 1.0,
      type    : "mouse",
      button  : 0,
      x       : 0,
      y       : 0,
      force   : 1.0,
    };

    let startColor = new Vector4(brush.color);
    let dpi = window.devicePixelRatio;

    for (let i=0; i<2; i++) {
      let c = startColor;
      let hsv = new Vector3(rgb_to_hsv(c[0], c[1], c[2]));
      hsv[0] = i ? -0.2 : -0.2;

      let dh = 2.0 / cols;

      for (let x = 1; x < cols; x++, hsv[0] += dh) {
        hsv[0] = Math.fract(hsv[0]);

        let color = hsv_to_rgb(hsv[0], hsv[1], hsv[2]);
        brush.color.loadXYZ(color[0], color[1], color[2]);

        let u = x/(cols - 1);
        this.resetStroke();

        for (let y = 0; y < cols; y++) {
          let v = y/(cols - 1);

          evt.x = u*canvas.width;
          evt.y = v*canvas.height;

          if (i) {
            let tmp = evt.x;
            evt.x = evt.y;
            evt.y = tmp;
          }

          this.on_pointermove(evt, true);

          if (y%55 === 0) {
            yield;
          }
        }

        for (let i=0; i<2; i++) {
          window.redraw_all();

          while (gen === ed.drawGen) {
            yield;
          }
        }

        gen = ed.drawGen;
        yield;
      }
    }

    brush.color.load(startColor);
  }
}

ToolOp.register(CanvasTestOp);

