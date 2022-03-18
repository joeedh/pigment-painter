import {
  simple, UIBase, Vector4, Vector3,
  Vector2, Quat, Matrix4, util, nstructjs,
  KeyMap, HotKey, eventWasTouch, PackFlags,
  Container, saveUIData, loadUIData, pushModalLight, popModalLight, keymap, sendNote
} from '../path.ux/scripts/pathux.js';

import './pigment_editor.js';
import {Optimizer} from './optimize.js';

import '../paint/paint_ops.js';
import {getPressure} from '../paint/paint.js';
import {Icons} from './icon_enum.js';

import './palette.js';
import {Shaders} from '../webgl/shaders.js';
import {START_REFL_K1, START_REFL_K2, WEBGL_PAINTER} from './colormodel.js';
import './widgets.js';

export class PaletteEditor extends Container {
  constructor() {
    super();

    this.needRebuild = true;
    this._last_update_key = 0;

    this.active = -1;

    this.label("Palette Editor");
  }

  static define() {
    return {
      tagname: "palette-editor-x",
      style  : "palette-editor"
    }
  }

  rebuild() {
    if (!this.ctx) {
      return;
    }

    let path = this.getAttribute("datapath");
    if (!path) {
      return;
    }

    let pal = this.ctx.api.getValue(this.ctx, path);
    if (!pal) {
      console.log("failed to find palette at path " + path);
      return;
    }

    let uidata = saveUIData(this, "palette");

    this.needRebuild = false;
    this.clear();
    let row;

    row = this.row();
    row.label(pal.name);
    row.iconbutton(Icons.SMALL_PLUS, "Add Color", () => {
      pal.push(new Vector4(this.ctx.canvas.brush.color));
      pal.save();
    });

    row = this.row();

    this.overrideClassDefault("colorpickerbutton", "width", 24);
    this.overrideClassDefault("colorpickerbutton", "height", 24);
    this.overrideClassDefault("colorpickerbutton", "border-radius", 2);

    let makeButton = (i) => {
      let path2 = `${path}.colors[${i}].color`;

      let button = row.colorbutton(path2);
      button.label = "";
      button.noLabel = true;

      let click = button.click;
      button.click = (e) => {
        let color = this.ctx.api.getValue(this.ctx, this.getAttribute("colorpath"));

        this.active = i;

        if (pal[i].vectorDistance(color) > 0.001) {
          this.ctx.api.setValue(this.ctx, this.getAttribute("colorpath"), pal[i]);
        } else {
          click.call(button, e);

        }
      }
    }
    for (let i = 0; i < pal.length; i++) {
      if (i > 0 && (i%5) === 0) {
        row = this.row();
      }

      makeButton(i);
    }

    loadUIData(this, uidata);

    for (let i = 0; i < 3; i++) {
      this.flushUpdate();
    }
  }

  update() {
    if (!this.ctx) {
      return;
    }

    let pal = this.ctx.api.getValue(this.ctx, this.getAttribute("datapath"));
    let key = pal.length;
    if (key !== this._last_update_key) {
      this._last_update_key = key;
      this.needRebuild = true;
    }

    if (this.needRebuild) {
      this.rebuild();
    }
  }
}

UIBase.register(PaletteEditor);

export class CanvasEditor extends simple.Editor {
  constructor() {
    super();

    this.drawGen = 0;

    this.genDimen = 40;
    this.fillInLut = true;
    this.createReverseLut = true;
    this.upscaleGoal = 128;
    this.lutQuality = 0.5;

    this.glSize = new Vector2();
    this.glPos = new Vector2();

    this.animReq = undefined;
    this.drawParam = true;
    this.canvas = document.createElement("canvas");
    this.g = this.canvas.getContext("2d");

    this.start_mpos = new Vector2();
    this.mpos = new Vector2();

    if (!WEBGL_PAINTER) {
      this.shadow.appendChild(this.canvas);
    }

    this.keymap = undefined;
    this.defineKeyMap();

    this.sidebar = this.makeSideBar();
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

    if (0) {
      st.int("genDimen", "genDimen", "Size", "Base size of LUT")
        .noUnits()
        .range(0, 375);

      st.bool("blurFilledInPixels", "blurFilledInPixels", "Blur Filled In", "Blur filled in pixels");
      st.bool("optimizeFilledIn", "optimizeFilledIn", "Opt Filled In", "Optimize filled in pixels to be more accurate");

      st.float("colorScale", "colorScale", "Output Scale", "Unphysically scale pigment colors in LUT generation")
        .noUnits().range(0.0, 5.0);

      st.int("optSteps", "optSteps", "Opt Steps").noUnits().range(1, 32).slideSpeed(1.5);

      st.int("blurRadius", "blurRadius", "Blur Radius").noUnits().range(1, 32);

      st.bool("fillInLut", "fillInLut", "Fill in empty in LUT");
      st.bool("createReverseLut", "createReverseLut", "Inverse Too", "Also create inverse LUT");

      st.int("upscaleGoal", "upscaleGoal", "Upscale", "Upscale to nearest power of 2 that is greater then or equal to this number")
        .noUnits()
        .range(0, 512);

      st.float("lutQuality", "lutQuality", "Quality", "Quality of LUT")
        .noUnits()
        .range(0.01, 25.0)
        .step(0.2);
    }

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

  drawGl() {
    let dpi = UIBase.getDPI();

    this.glSize.load(this.size).mulScalar(dpi).floor();
    this.glPos.load(this.pos).mulScalar(dpi).floor();

    let tmat = new Matrix4();

    let r = this.header.getBoundingClientRect();
    let offy = 0.0;
    if (r) {
      this.glPos[1] += ~~(r.height*dpi);
      this.glSize[1] -= ~~(r.height*dpi);
      //offy = -r.height*dpi/this.glSize[1]*2.0;
      //offy = offy ? 1.0 / offy : 0.0;
      //offy = 0.0;
      //offy /= this.glSize[1]*2.0;
    }

    let w = this.ctx.canvas.width;
    let h = this.ctx.canvas.height;

    let gl = _appstate.gl;

    this.glPos[1] += this.glSize[1];
    this.glPos[1] = gl.canvas.height - this.glPos[1];

    let matrix = new Matrix4();
    this.drawMatrix = matrix;

    let aspect = this.glSize[1]/this.glSize[0];
    const d = 1.0;
    matrix.scale(1.0/this.glSize[0]*d, 1.0/this.glSize[1]*d, 1.0);

    tmat.translate(0.0, offy*d, 0.0);
    matrix.preMultiply(tmat);

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    //gl.enable(gl.SCISSOR_TEST);

    gl.depthMask(false);

    gl.scissor(this.glPos[0], this.glPos[1], this.glSize[0], this.glSize[1]);
    //gl.viewport(this.glPos[0], this.glPos[1], this.glSize[0], this.glSize[1]);
    gl.viewport(this.glPos[0], this.glPos[1], this.glSize[0], this.glSize[1]);

    gl.clearColor(1.0, 0.7, 0.4, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.ctx.canvas.draw(gl, this);
  }

  draw() {
    this.animReq = undefined;

    if (WEBGL_PAINTER) {
      this.drawGen++;
      this.drawGl();
      return;
    }

    this.drawGen++;

    let dpi = UIBase.getDPI();

    let w = ~~((this.size[0])*dpi);
    let h = ~~(this.size[1]*dpi)

    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }

    this.canvas.style["width"] = (w/dpi) + "px";
    this.canvas.style["height"] = (h/dpi) + "px";

    let g = this.g;

    if (_appstate.haveDirtyRect) {
      let [min, max] = _appstate.dirtyRect;

      min.floor();
      max.ceil();

      if (isNaN(min.dot(min)) || isNaN(max.dot(max))) {
        g.putImageData(this.ctx.canvas.image, 0, 0);
      } else {
        let m = new Vector2().load(max).sub(min);
        console.log(m, _appstate.haveDirtyRect);

        g.putImageData(this.ctx.canvas.image, 0, 0, min[0], min[1], max[0] - min[0], max[1] - min[1]);
      }
    } else {
      g.putImageData(this.ctx.canvas.image, 0, 0);
    }

    g.beginPath();
    let dimen = this.ctx.canvas.dimen;

    g.rect(0, 0, dimen, dimen);
    g.stroke();
  }

  init() {
    super.init();

    let sidebar = this.sidebar;

    this.addEventListener("pointerdown", (e) => this.on_mousedown(e));
    this.addEventListener("pointermove", (e) => this.on_mousemove(e));
    this.addEventListener("pointerup", (e) => this.on_mouseup(e));
    //this.addEventListener("pointercancel", (e) => this.on_mouseup(e));

    this.addEventListener("blur", () => {
      this.mdown = false;
    });

    this.flagRedraw();

    let header = this.header.col();
    let panel;

    let strip = header.row();
    strip.useIcons(true);

    strip.prop("canvas.activeBrush");

    strip.iconbutton(Icons.UNDO, "Undo", () => {
      this.ctx.toolstack.undo(this.ctx);
    });
    strip.iconbutton(Icons.REDO, "Redo", () => {
      this.ctx.toolstack.redo(this.ctx);
    });

    strip.tool("canvas.reset()");

    strip.useIcons(false);
    strip.tool("canvas.test()");

    header = header.row();

    header.prop("canvas.brush.color");
    header.tool("brush.swap_colors");
    header.prop("canvas.brush.color2");
    header.prop("canvas.brush.radius");
    header.prop("canvas.brush.strength");

    sidebar.width = 340;
    let tab;

    let _proptab, _proprow, _i = 0;
    let makeBrushProp = (con, name) => {
      if (!_proptab) {
        _proptab = con;
      }

      if (_i%2 === 0) {
        con = _proprow = _proptab.row();
      } else {
        con = _proprow;
      }
      _i++;

      con = con.row();
      con.noMarginsOrPadding();

      con.overrideClassDefault("panel", "TitleBackground", "transparent");
      con.overrideClassDefault("panel", "TitleBorder", "transparent");
      con.overrideClassDefault("panel", "background-color", "transparent");
      con.overrideClassDefault("panel", "border-color", "transparent");
      con.overrideClassDefault("panel", "margin-top", 1);
      con.overrideClassDefault("panel", "margin-bottom", 1);
      con.overrideClassDefault("panel", "padding-top", 1);
      con.overrideClassDefault("panel", "padding-bottom", 1);

      let panel = con.panel("");
      let row = panel.titleframe;

      /* bypass panel's update bypassing when closed */

      sidebar.update.after(() => {
        row.flushUpdate(true);
      });

      row.overrideClassDefault("numslider", "labelOnTop", false);
      row.overrideClassDefault("numslider_textbox", "labelOnTop", false);
      row.overrideClassDefault("numslider_simple", "labelOnTop", false);

      let path = `canvas.brush.channels['${name}']`;

      row.useIcons(true);
      row.prop(path + ".dynamics['pressure'].flag[ENABLED]").iconsheet = 0;

      let ch = this.ctx.api.getValue(this.ctx, path);

      row.slider(path + ".value", {
        packflag: PackFlags.NO_NUMSLIDER_TEXTBOX
      });

      panel.iconcheck.remove();
      panel.titleframe.add(panel.iconcheck);

      for (let dyn of ch.dynamics) {
        let path2 = `${path}.dynamics['${dyn.name}']`;
        let row = panel.row();

        let panel2 = panel.panel(dyn.name);
        panel2.titleframe.useIcons(true);
        let icon = panel2.titleframe.prop(path2 + ".flag[ENABLED]");

        icon._icon = Icons.LARGE_UNCHECKED;
        icon._icon_pressed = Icons.LARGE_CHECK;

        sidebar.update.after(() => {
          panel2.titleframe.flushUpdate(true);
        });

        panel2.curve1d(path2 + ".curve");
        panel2.prop(path2 + ".factor");
        panel2.prop(path2 + ".scale");
        panel2.prop(path2 + ".flag[PERIODIC]");
        panel2.prop(path2 + ".periodFunc");

        panel2.closed = true;
      }

      panel.closed = true;
    }

    tab = sidebar.tab("Brush");

    tab.useIcons(true);
    tab.row().prop("canvas.activeBrush");
    tab.useIcons(false);

    let selector = UIBase.createElement("brush-selector-x");
    //delay initialization of selector
    //this.doOnce(() => {
    selector.setAttribute("datapath", "canvas.brush");
    selector.setAttribute("slotpath", "canvas.activeBrush");
    //});
    tab.add(selector);

    makeBrushProp(tab, "radius");
    makeBrushProp(tab, "strength");

    let crow = tab.row();
    crow.prop("canvas.brush.color");
    crow.prop("canvas.brush.color2");

    let cpreview = UIBase.createElement("color-preview-x");
    cpreview.setAttribute("datapath", "canvas.brush");
    tab.add(cpreview);

    let pal = UIBase.createElement("palette-editor-x");
    pal.setAttribute("datapath", "palettes[0]");
    pal.setAttribute("colorpath", "canvas.brush.color");

    tab.add(pal);

    makeBrushProp(tab, "soft");
    makeBrushProp(tab, "spacing");
    makeBrushProp(tab, "hue");
    makeBrushProp(tab, "scatter");
    makeBrushProp(tab, "random");
    makeBrushProp(tab, "smear");
    makeBrushProp(tab, "smearLen");
    makeBrushProp(tab, "smearRate");
    makeBrushProp(tab, "angle");
    makeBrushProp(tab, "squish");

    //tab.prop("canvas.brush.radius");
    tab.prop("canvas.brush.mask");

    makeBrushProp(tab, "alphaLighting");

    makeBrushProp(tab, "param1");
    makeBrushProp(tab, "param2");
    makeBrushProp(tab, "param3");

    tab.prop("canvas.brush.strokeMode");
    tab.prop("canvas.brush.flag[FOLLOW]");
    tab.prop("canvas.brush.flag[ACCUMULATE]");
    tab.prop("canvas.brush.mixMode");
    tab.prop("canvas.paintPigmentsDirect");
    tab.prop("canvas.triLinearSample");

    tab = sidebar.tab("Pigments");

    let col = tab.col();

    col.style["align-self"] = "flex-start";
    col.style["min-width"] = "400px";

    let name = "CMYK";
    for (let i = 0; i < 4; i++) {
      let panel = col.panel(name[i]);

      let ped = UIBase.createElement("pigment-editor-x");
      ped.setAttribute("datapath", `pigments.pigments[${i}]`);
      panel.add(ped);

      panel.closed = true;
    }

    tab = sidebar.tab("Pigment LUT");
    let led = UIBase.createElement("pigment-lut-editor-x");
    tab.add(led);

    tab = sidebar.tab("Triplet LUT");

    let tripletEditor = UIBase.createElement("color-triplet-editor-x");
    tripletEditor.setAttribute("datapath", "colorTriplets");
    tripletEditor.ctx = this.ctx;
    tripletEditor._init();

    console.log("tripletEditor", tripletEditor);

    tab.add(tripletEditor);

    tab = sidebar.tab("Brush Editor");
    let bedit = UIBase.createElement("brush-stack-editor-x");
    bedit.setAttribute("datapath", "brushstack");
    tab.add(bedit);

    for (let i = 0; i < 3; i++) {
      this.flushSetCSS();
      this.flushUpdate();
    }
  }


  defineKeyMap() {
    this.keymap = new KeyMap([
      new HotKey("R", [], () => {
        console.log("reset!");
        //this.ctx.canvas.reset();
        this.ctx.api.execTool(this.ctx, "canvas.reset()");
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
    if (e.y < this.ctx.menuBar.pos[1]) {
      return true;
    }

    let elems = [this.header, this.sidebar];
    for (let elem of elems) {
      let rect = elem.getBoundingClientRect();

      if (!rect) {
        continue;
      }

      if (e.x >= rect.x && e.y >= rect.y && e.x <= rect.x + rect.width && e.y <= rect.y + rect.height) {
        return true;
      }
    }

    return false;
  }

  on_mousedown(e) {
    if (this.uiHasEvents(e)) {
      return;
    }

    console.log("mouse event!", e);

    this.start_mpos.load(this.getLocalMouse(e.x, e.y));

    this.ctx.api.execTool(this.ctx, `brush.stroke()`, {
      initial : true,
      x       : e.x,
      y       : e.y,
      pressure: e.pressure
    });
  }

  getLocalMouse(x, y) {
    let ret = new Vector2();

    let dpi = UIBase.getDPI();
    let r = this.header.getBoundingClientRect();
    //let r = this.canvas.getBoundingClientRect();
    //ret[0] = (x - r.x)*dpi;
    //ret[1] = (y - r.y)*dpi;

    let gly = _appstate.gl.canvas.height - this.glPos[1];
    gly -= this.glSize[1];

    ret[0] = x*dpi - this.glPos[0];
    ret[1] = y*dpi - gly + r.height;

    return ret;
  }

  on_mousemove(e) {
    this.mpos.load(this.getLocalMouse(e.x, e.y));
  }

  getKeyMaps() {
    return this.keymap ? [this.keymap] : [];
  }

  update() {
    super.update();

    this.ctx.pigments.updateWasm();

    if (this.ctx && this.ctx.canvas) {
      this.ctx.canvas.checkWasmImage();
    }
  }

  on_mouseup(e) {
    this.mpos.load(this.getLocalMouse(e.x, e.y));
    this.mdown = false;
  }

  setCSS() {
    super.setCSS();

    this.canvas.style["position"] = "fixed";
    this.canvas.style["z-index"] = "0";
    this.canvas.style["left"] = this.pos[0] + "px";
    this.canvas.style["top"] = (this.pos[1] + 100) + "px";

    this.flagRedraw();
  }
}

CanvasEditor.STRUCT = nstructjs.inherit(CanvasEditor, simple.Editor) + `
}`;
simple.Editor.register(CanvasEditor);
