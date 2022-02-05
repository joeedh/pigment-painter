import {
  simple, UIBase, Vector4, Vector3,
  Vector2, Quat, Matrix4, util, nstructjs,
  KeyMap, HotKey
} from '../path.ux/scripts/pathux.js';
import {getSearchOffs} from './canvas.js';

import './pigment_editor.js';
import {Optimizer} from './optimize.js';

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
    console.log("DIMEN", dimen);
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

    let strip = this.header.row();
    strip.useIcons(true);
    strip.prop("canvas.brush.tool");

    this.header.prop("canvas.brush.radius");
    this.header.prop("canvas.brush.strength");
    this.header.prop("canvas.brush.color");

    let sidebar = this.makeSideBar();
    sidebar.width = 400;
    let tab;

    tab = sidebar.tab("Brush");
    tab.prop("canvas.brush.radius");
    tab.prop("canvas.brush.strength");
    tab.prop("canvas.brush.color");
    tab.prop("canvas.brush.spacing");

    tab.useIcons(true);
    tab.row().prop("canvas.brush.tool");
    tab.useIcons(false);
    tab.prop("canvas.brush.flag[ACCUMULATE]");


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

    for (let i=0; i<4; i++) {
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

  execDot(x1, y1, dx, dy, t) {
    let r = this.ctx.canvas.brush.radius*devicePixelRatio;
    let dimen = this.ctx.canvas.dimen;

    if (x1 < -r*2 || y1 < -r*2 || x1 > dimen+r*2 || y1 > dimen+r*2) {
      //return;
    }

    this.ctx.canvas.execDot(x1, y1, dx, dy, t);
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

    this.mpos.load(this.getLocalMouse(e.x, e.y));
    this.last_mpos.load(this.mpos);
    this.last_stroke_mpos.load(this.mpos);

    this.stroke_t = this.last_stroke_t = 0.0;
    this.mdown = e.button === 0;

    this.ctx.canvas.beginStroke();
    this.execDot(this.mpos[0], this.mpos[1], 0.0, 0.0, 0.0);
    this.flagRedraw();
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

          this.execDot(mpos[0], mpos[1], dx, dy, this.last_stroke_t);

          this.last_stroke_t += brush.spacing;
          this.flagRedraw();
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
