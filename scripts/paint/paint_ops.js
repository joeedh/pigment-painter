import {
  util, Vector2, Vector3, Vector4, Matrix4, Quat,
  nstructjs, math, ToolOp, ToolProperty, ToolFlags,
  PropFlags, PropTypes, IntProperty, BoolProperty, FloatProperty
} from '../path.ux/pathux.js';

import {StrokeProperty, ImageOp, getPressure} from './paint.js';
import {DotSample} from '../core/canvas.js';

export class BrushStrokeOp extends ImageOp {
  constructor() {
    super();

    this.last_mpos = new Vector2();
    this.mpos = new Vector2();
    this.start_mpos = new Vector2();
    this.first = true;
    this.last_stroke_pressure = 1.0;
    this.last_stroke_mpos = new Vector2();
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
      this.first = false;
      was_first = true;

      ctx.canvas.beginStroke();
    }

    let dpi = this.inputs.dpi.getValue();
    let brush = ctx.canvas.brush;
    let radius = brush.radius*dpi;

    let dx = mpos[0] - this.last_stroke_mpos[0];
    let dy = mpos[1] - this.last_stroke_mpos[1];

    let dis = Math.sqrt(dx*dx + dy*dy);
    let dt = dis/(2.0*radius);

    this.t = this.last_t + dt;

    if (was_first) {
      console.log("FIRST", mpos[0], mpos[1]);

      let ds = new DotSample(mpos[0], mpos[1], dx, dy, 0.0, pressure);

      this.inputs.stroke.push(ds);
      this.last_mpos.load(mpos);
      this.last_stroke_mpos.load(mpos);

      this.execDot(ctx, ds);
      window.redraw_all();
      return;
    }

    if (this.t - this.last_t > brush.spacing) {
      let steps = Math.ceil((this.t - this.last_t)/brush.spacing + 0.5);
      let ds = 1.0/steps
      let s = ds;

      let dx = (this.mpos[0] - this.last_stroke_mpos[0])*ds;
      let dy = (this.mpos[1] - this.last_stroke_mpos[1])*ds;

      for (let i = 0; i < steps; i++, s += ds) {
        mpos.load(this.last_stroke_mpos).interp(this.mpos, s);
        mpos.floor();

        let pressure2 = this.last_stroke_pressure;

        let skip = mpos[0] < -radius*2 || mpos[0] >= image.width + radius*2;
        skip = skip || (mpos[1] < -radius*2 || mpos[1] >= image.height + radius*2);

        if (skip) {
          continue;
        }

        let t2 = this.last_t + (this.t - this.last_t)*s;

        pressure2 += (pressure - pressure2)*s;
        let ds = new DotSample(mpos[0], mpos[1], dx, dy, t2, pressure2);

        this.inputs.stroke.push(ds);
        this.execDot(ctx, ds);
        window.redraw_all();
      }

      this.last_t = this.t;
      this.last_stroke_pressure = pressure;
      this.last_stroke_mpos.load(this.mpos);
    }

    //console.log(this.inputs.stroke.getValue());

    this.last_mpos.load(mpos);
  }

  execDot(ctx, ds) {
    let radius = ctx.brush.radius*this.inputs.dpi.getValue();

    this.undoCheck(ctx, ds.x, ds.y, radius);

    for (let step of ctx.canvas.execDot(ds)) {

    }
  }

  exec(ctx) {
    for (let ds of this.inputs.stroke) {
      this.execDot(ctx, ds);
    }
  }

  on_mouseup(e) {
    console.log("mouse up in paint op!");

    let ctx = this.modal_ctx;
    this.finish();
  }
}

ToolOp.register(BrushStrokeOp);
