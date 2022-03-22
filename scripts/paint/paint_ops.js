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
import {BrushFlags, BrushTools, DotSample} from '../core/canvas.js';
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

      let radius = brush.channels.evaluate("radius", inputs, ctx.defaults)*dpi;
      let spacing = brush.channels.evaluate("spacing", inputs, ctx.defaults);
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
    let defaults = this.modal_ctx.defaults;

    dx *= deltaS/dt;
    dy *= deltaS/dt;

    let ds = new DotSample(x, y, dx, dy);

    let brush = this.brush;
    let continuous = brush.continuous;

    let {last, cur} = this;

    for (let k in last) {
      if (brush.tool === BrushTools.ERASE && k === "color") {
        k = "color2";
      }

      let a = last[k];
      let b = cur[k];

      if (typeof a === "object") {
        ds[k] = b;
      } else {
        ds[k] = a + (b - a)*t;

        if (brush.channels.has(k)) {
          ds[k] = brush.channels.get(k).evaluate(this.deviceInputs, ds[k], defaults);
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

    let radius = brush.channels.evaluate("radius", inputs, ctx.defaults)*dpi;
    let spacing = brush.channels.evaluate("spacing", inputs, ctx.defaults);
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

