import {
  simple, UIBase, Vector4, Vector3,
  Vector2, Quat, Matrix4, util, nstructjs,
  KeyMap, HotKey, eventWasTouch
} from '../path.ux/scripts/pathux.js';
import {getSearchOffs, DotSample} from './canvas.js';

import './pigment_editor.js';
import {Optimizer} from './optimize.js';

import '../paint/paint_ops.js';
import {getPressure} from '../paint/paint.js';
import {Icons} from './icon_enum.js';

export class CanvasEditor extends simple.Editor {
  constructor() {
    super();

    this.animReq = undefined;
    this.drawParam = true;
    this.canvas = document.createElement("canvas");
    this.g = this.canvas.getContext("2d");

    this.stroke_t = 0.0;
    this.last_stroke_t = 0.0;

    this.last_stroke_mpos = new Vector2();
    this.last_mpos = new Vector2();
    this.start_mpos = new Vector2();
    this.mpos = new Vector2();

    this.strokeTimer = undefined;
    this.strokeJob = undefined;
    this.strokeQueue = [];
    this.strokeQueueCur = 0;
    this.shadow.appendChild(this.canvas);

    this.keymap = undefined;
    this.defineKeyMap();
  }

  static define() {
    return {
      tagname : "simple-canvas-x",
      areaname: "simple-canvas",
      uiname  : "Canvas"
    }
  }

  static defineAPI(api, st) {
    st.bool("drawParam", "drawParam", "Draw Param");

    return st;
  }

  flagRedraw() {
    window.redraw_all();
    return;

    if (this.animReq) {
      return;
    }

    this.animReq = requestAnimationFrame(() => this.draw());
  }

  draw() {
    this.animReq = undefined;

    let dpi = UIBase.getDPI();

    let w = ~~((this.size[0])*dpi);
    let h = ~~(this.size[1]*dpi)

    this.canvas.width = w;
    this.canvas.height = h;
    this.canvas.style["width"] = (w/dpi) + "px";
    this.canvas.style["height"] = (h/dpi) + "px";

    let g = this.g;

    g.putImageData(this.ctx.canvas.image, 0, 0);

    g.beginPath();
    let dimen = this.ctx.canvas.dimen;

    g.rect(0, 0, dimen, dimen);
    g.stroke();
  }

  init() {
    super.init();

    this.addEventListener("mousedown", (e) => this.on_mousedown(e));
    this.addEventListener("mousemove", (e) => this.on_mousemove(e));
    this.addEventListener("mouseup", (e) => this.on_mouseup(e));

    this.addEventListener("blur", () => {
      this.mdown = false;
    });

    this.flagRedraw();

    let header = this.header.col();


    let strip = header.row();
    strip.useIcons(true);

    strip.prop("canvas.activeBrush");

    strip.iconbutton(Icons.UNDO, "Undo", () => {
      this.ctx.toolstack.undo(this.ctx);
    });
    strip.iconbutton(Icons.REDO, "Redo", () => {
      this.ctx.toolstack.redo(this.ctx);
    });

    header = header.row();

    header.prop("canvas.brush.color");
    header.prop("canvas.brush.radius");
    header.prop("canvas.brush.strength");

    let sidebar = this.makeSideBar();
    sidebar.width = 400;
    let tab;

    tab = sidebar.tab("Brush");
    tab.prop("canvas.brush.radius");
    tab.prop("canvas.brush.strength");
    tab.prop("canvas.brush.color");
    tab.prop("canvas.brush.spacing");
    tab.prop("canvas.brush.scatter");
    tab.prop("canvas.brush.smear");

    tab.useIcons(true);
    tab.row().prop("canvas.activeBrush");
    tab.useIcons(false);
    tab.prop("canvas.brush.flag[ACCUMULATE]");

    tab.prop("canvas.brush.mixMode");

    let names = ["C", "M", "Y", "K"];

    tab = sidebar.tab("Pigment");

    this.solver = undefined;

    let button2 = tab.button("Optimize", () => {
      if (this.solver) {
        this.solver.stop();
        this.solver = undefined;
        button2.name = "Optimize";
      } else {
        this.solver = new Optimizer(this.ctx.brush.pigments);
        this.solver.start();
        button2.name = "Stop";
      }
    });
    button2.description = "Optimize pigment spectral at a data level";

    for (let i = 0; i < 4; i++) {
      let panel = tab.panel(names[i]);

      let pedit = document.createElement("pigment-editor-x");
      panel.add(pedit);
      pedit.setAttribute("datapath", `canvas.brush.pigments[${i}]`);

      panel.closed = true;
    }
  }

  defineKeyMap() {
    this.keymap = new KeyMap([
      new HotKey("R", [], () => {
        console.log("reset!");
        this.ctx.canvas.reset();
        this.flagRedraw();
      })
    ]);
  }

  * execDot(ds) {
    let x1 = ds.x, y1 = ds.y;

    let r = this.ctx.canvas.brush.radius*devicePixelRatio;
    let dimen = this.ctx.canvas.dimen;

    if (x1 < -r*2 || y1 < -r*2 || x1 > dimen + r*2 || y1 > dimen + r*2) {
      //return;
    }

    for (let item of this.ctx.canvas.execDot(ds)) {
      yield item;
    }
  }

  uiHasEvents(e) {
    if (this.ctx && this.ctx.screen) {
      let elem = this.ctx.screen.pickElement(e.x, e.y);
      //console.log(elem.id);
      if (elem !== this) {
        return true;
      }
    }

    return false;
  }

  on_mousedown(e) {
    if (this.uiHasEvents(e)) {
      return;
    }

    this.ctx.api.execTool(this.ctx, `brush.stroke()`, {
      initial : true,
      x       : e.x,
      y       : e.y,
      pressure: getPressure(e)
    });
    return;

    this.mpos.load(this.getLocalMouse(e.x, e.y));
    this.last_mpos.load(this.mpos);
    this.last_stroke_mpos.load(this.mpos);

    this.stroke_t = this.last_stroke_t = 0.0;
    this.mdown = e.button === 0;

    this.ctx.canvas.beginStroke();
    this.queue(this.mpos[0], this.mpos[1], 0.0, 0.0, 0.0, getPressure(e));
    this.flagRedraw();
  }


  _startStrokeTimer() {
    if (this.strokeTimer !== undefined) {
      return;
    }

    this.strokeTimer = window.setInterval(() => {
      let time = util.time_ms();

      while (util.time_ms() - time < 30) {
        if (!this.strokeJob) {
          if (this.strokeQueueCur >= this.strokeQueue.length) {
            window.clearInterval(this.strokeTimer);
            this.strokeTimer = undefined;

            this.strokeQueueCur = 0;
            this.strokeQueue.length = 0;

            this.flagRedraw();
            return;
          }

          let si = this.strokeQueueCur;
          let q = this.strokeQueue;

          let x = q[si++], y = q[si++], dx = q[si++], dy = q[si++];
          let t = q[si++], pressure = q[si++];

          this.strokeQueueCur = si;

          let ds = new DotSample(x, y, dx, dy, t, pressure);
          this.strokeJob = this.execDot(ds)[Symbol.iterator]();
        }

        let item = this.strokeJob.next();
        if (item.done) {
          this.strokeJob = undefined;
        }
      }

      this.flagRedraw();
    }, 50);
  }

  queue(x, y, dx, dy, t, pressure) {
    this.strokeQueue.push(x);
    this.strokeQueue.push(y);
    this.strokeQueue.push(dx);
    this.strokeQueue.push(dy);
    this.strokeQueue.push(t);
    this.strokeQueue.push(pressure);

    if (!this.strokeTimer) {
      this._startStrokeTimer();
    }
  }

  getLocalMouse(x, y) {
    let ret = new Vector2();

    let dpi = UIBase.getDPI();
    let r = this.canvas.getBoundingClientRect();
    ret[0] = (x - r.x)*dpi;
    ret[1] = (y - r.y)*dpi;

    return ret;
  }

  on_mousemove(e) {
    this.mpos.load(this.getLocalMouse(e.x, e.y));

    if (this.mdown) {
      let brush = this.ctx.canvas.brush;
      let r = brush.radius*UIBase.getDPI();

      let dis = this.mpos.vectorDistance(this.last_mpos)/r;
      this.stroke_t += dis;

      if (this.stroke_t - this.last_stroke_t >= brush.spacing) {
        let dx = this.mpos[0] - this.last_stroke_mpos[0];
        let dy = this.mpos[1] - this.last_stroke_mpos[1];

        let steps = (this.stroke_t - this.last_stroke_t)/brush.spacing;
        steps = Math.floor(steps + 0.001);

        let dt = 1.0/steps;
        let t = dt;

        dx /= steps;
        dy /= steps;

        for (let i = 0; i < steps; i++) {
          let mpos = new Vector2(this.last_stroke_mpos);
          mpos.interp(this.mpos, t);

          this.queue(mpos[0], mpos[1], dx, dy, this.last_stroke_t, getPressure(e));

          this.last_stroke_t += brush.spacing;
          t += dt;
        }

        this.last_stroke_t = this.stroke_t;
        this.last_stroke_mpos.load(this.mpos);
      }
    }

    this.last_mpos.load(this.mpos);
  }

  getKeyMaps() {
    return this.keymap ? [this.keymap] : [];
  }

  on_mouseup(e) {
    this.mpos.load(this.getLocalMouse(e.x, e.y));
    this.last_mpos.load(this.mpos);
    this.mdown = false;
  }

  setCSS() {
    super.setCSS();

    this.canvas.style["position"] = "fixed";
    this.canvas.style["z-index"] = "0";

    this.flagRedraw();
  }
}

simple.Editor.register(CanvasEditor);
