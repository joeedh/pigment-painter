import {
  util, Vector2, Vector3, Vector4, Matrix4, Quat,
  nstructjs, math, ToolOp, ToolProperty, ToolFlags,
  PropFlags, PropTypes, IntProperty, BoolProperty, FloatProperty
} from '../path.ux/pathux.js';

import {cubic2, cubic, dcubic, dcubic2, d3cubic2, d2cubic2, d3cubic, d2cubic, cubic2len} from '../core/bezier.js';

import {StrokeProperty, ImageOp, getPressure} from './paint.js';
import {DotSample} from '../core/canvas.js';
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
    
    window.redraw_all([0,0], [canvas.width, canvas.height]);
  }
}

ToolOp.register(ResetCanvasOp);

export class BrushStrokeOp extends ImageOp {
  constructor() {
    super();

    this.rect = [new Vector2(), new Vector2()];
    this.last_mpos = new Vector2();
    this.mpos = new Vector2();
    this.start_mpos = new Vector2();
    this.first = true;
    this.last_stroke_pressure = 1.0;
    this.last_stroke_mpos = new Vector2();
    this.last_stroke_mpos2 = new Vector2();
    this.last_stroke_mpos3 = new Vector2();
    this.t = 0.0;
    this.last_t = 0.0;
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

    if (this.inputs.initial.getValue()) {
      let x = this.inputs.x.getValue();
      let y = this.inputs.y.getValue();

      console.log("XY", x, y);

      this.on_mousemove(new MouseEvent("mousemove", {
        x, y, pageX: x, pageY: y, clientX: x, clientY: y
      }), this.inputs.pressure.getValue());
    }

    return super.modalStart(ctx);
  }

  on_mousedown(e) {
    let ctx = this.modal_ctx;

    //console.log("mouse down in BrushStrokeOp!");
    //this.finish();
  }

  on_mousemove(e, customPressure) {
    let ctx = this.modal_ctx;

    let editor = ctx.canvasEditor;
    let image = ctx.canvas.image;
    let mpos = editor.getLocalMouse(e.x, e.y);

    this.mpos.load(mpos);
    let was_first = false;

    let pressure = customPressure !== undefined ? customPressure : getPressure(e);

    if (this.first) {
      this.last_stroke_pressure = pressure;
      this.last_mpos.load(mpos);
      this.start_mpos.load(mpos);
      this.last_stroke_mpos.load(mpos);
      this.last_stroke_mpos2.load(mpos);
      this.last_stroke_mpos3.load(mpos);
      this.first = false;
      was_first = true;

      ctx.canvas.beginStroke();
    }

    let dpi = this.inputs.dpi.getValue();
    let brush = ctx.canvas.brush;
    let radius = brush.channels.evaluate("radius", {pressure})*dpi;
    let spacing = brush.channels.evaluate("spacing", {pressure});
    let strength = brush.channels.evaluate("strength", {pressure});

    let dx = mpos[0] - this.last_stroke_mpos[0];
    let dy = mpos[1] - this.last_stroke_mpos[1];

    let dis = Math.sqrt(dx*dx + dy*dy);
    let dt = dis/(2.0*radius);

    this.t = this.last_t + dt;

    if (was_first) {
      console.log("FIRST", mpos[0], mpos[1]);

      let ds = new DotSample(mpos[0], mpos[1], dx, dy, 0.0, pressure, radius, spacing, strength);

      this.inputs.stroke.push(ds);
      this.last_mpos.load(mpos);
      this.last_stroke_mpos.load(mpos);

      this.execDot(ctx, ds);
      return;
    }

    //let spacing = brush.channels.get("spacing").evaluate({pressure});

    let a = new Vector2();
    let b = new Vector2();
    let c = new Vector2();
    let d = new Vector2();

    if (this.t - this.last_t > spacing) {
      let steps = Math.floor((this.t - this.last_t)/spacing + 0.0001);
      let dt = spacing;
      let t = this.last_t + dt;

      let ds = dt/(this.t - this.last_t);

      let dx = (this.mpos[0] - this.last_stroke_mpos[0])*ds;
      let dy = (this.mpos[1] - this.last_stroke_mpos[1])*ds;

      let dx2 = (this.last_stroke_mpos[0] - this.last_stroke_mpos2[0]);
      let dy2 = (this.last_stroke_mpos[1] - this.last_stroke_mpos2[1]);

      let dx3 = (this.last_stroke_mpos2[0] - this.last_stroke_mpos3[0]);
      let dy3 = (this.last_stroke_mpos2[1] - this.last_stroke_mpos3[1]);

      let dv1 = new Vector2(this.mpos).sub(this.last_stroke_mpos);
      let dv2 = new Vector2(this.last_stroke_mpos).sub(this.last_stroke_mpos2);
      let dv3 = new Vector2(this.last_stroke_mpos2).sub(this.last_stroke_mpos3);

      let l1 = dv1.vectorLength();
      let l2 = dv2.vectorLength();
      let l3 = dv3.vectorLength();

      dv1.interp(dv2, 0.5).normalize().mulScalar(l1 + l2).mulScalar(0.5);
      dv2.interp(dv3, 0.5).normalize().mulScalar(l2 + l3).mulScalar(0.5);

      a.load(this.last_stroke_mpos2);
      d.load(this.last_stroke_mpos);
      b.load(a).addFac(dv2, 1.0/3.0);
      c.load(d).addFac(dv1, -1.0/3.0);

      let blen = cubic2len(a, b, c, d);

      const CIRC = false;
      let circ=[[0,0],0], th1, th2;

      if (CIRC) {
        //dv1.interp(dv2, 0.5);

        circ = math.circ_from_line_tan_2d(this.last_stroke_mpos2, this.last_stroke_mpos, dv1);

        let p1 = new Vector2(this.last_stroke_mpos2).sub(circ[0]);
        let p2 = new Vector2(this.last_stroke_mpos).sub(circ[0]);
        th1 = Math.atan2(p1[1], p1[0]);
        th2 = Math.atan2(p2[1], p2[0]);

        if (th2 < th1) {
          let tmp = th2;
          th2 = th1;
          th1 = tmp;
        }

        if (Math.abs(th2 - th1) > Math.PI) {
          th2 -= Math.PI*2.0;
        }

        if (th2 < th1) {
          let tmp = th2;
          th2 = th1;
          th1 = tmp;
        }

        blen = circ[1]*Math.abs(th2 - th1);
      }

      this.t = this.last_t + blen / radius;

      steps = Math.floor(blen/(2.0*radius*spacing) + 0.0001);

      ds = 1.0/steps;
      let s = ds;

      //console.log(circ[0], circ[1], th1, th2, blen, steps, t, dt);

      for (let i = 0; i < steps + 1; i++, t += dt, s += ds) {
        if (t >= this.t) {
          break;
        }

        //let s = (t - this.last_t)/(this.t - this.last_t);

        //mpos.load(this.last_stroke_mpos).interp(this.mpos, s);

        if (CIRC) {
          let th = th1 + (th2 - th1)*s;
          mpos[0] = Math.cos(th)*circ[1] + circ[0][0];
          mpos[1] = Math.sin(th)*circ[1] + circ[0][1];

          let s2 = Math.tent(s);
          s2 = s2*s2*(3.0 - 2.0*s2);
          s2 = 1.0;
          //mpos.interp(cubic2(a, b, c, d, s), s2);
        } else {
          mpos.load(cubic2(a, b, c, d, s));
        }
        mpos.floor();

        let dv = dcubic2(a, b, c, d, s);
        dx = dv[0]*ds;
        dy = dv[1]*ds;


        let pressure2 = this.last_stroke_pressure;

        let skip = mpos[0] < -radius*2 || mpos[0] >= ctx.canvas.width + radius*2;
        skip = skip || (mpos[1] < -radius*2 || mpos[1] >= ctx.canvas.height + radius*2);

        if (skip) {
          continue;
        }

        let t2 = this.last_t + (this.t - this.last_t)*s;

        pressure2 += (pressure - pressure2)*s;
        let ds1 = new DotSample(mpos[0], mpos[1], dx, dy, t2, pressure2, radius, spacing, strength);

        this.inputs.stroke.push(ds1);
        this.execDot(ctx, ds1);
      }

      this.last_t = t;
      this.last_stroke_pressure = pressure;
      this.last_stroke_mpos3.load(this.last_stroke_mpos2);
      this.last_stroke_mpos2.load(this.last_stroke_mpos);
      this.last_stroke_mpos.load(this.mpos);
    }

    //console.log(this.inputs.stroke.getValue());

    this.last_mpos.load(mpos);
  }

  execDot(ctx, ds) {
    let radius = ctx.brush.radius*this.inputs.dpi.getValue();

    let [min, max] = this.rect;
    
    min.loadXY(ds.x, ds.y);
    max.load(min);
    min.addScalar(-radius*1.25);
    max.addScalar(radius*1.25);
    
    window.redraw_all(min, max);
    
    this.undoCheck(ctx, ds.x, ds.y, radius);

    for (let step of ctx.canvas.execDot(ds)) {

    }
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
