import '../../wasm/wasm_api.js';

import {
  simple, Vector2, Vector3, Vector4,
  nstructjs, util, UIBase, ToolOp
} from '../path.ux/pathux.js';

import {Palette, palettes} from './palette.js';

import {theme} from './theme.js';

import {PlatformAPI} from '../path.ux/scripts/platforms/platform_base.js';
import {Canvas, Brush, getSearchOffs} from './canvas.js';
import {CanvasEditor} from './canvas_editor.js';
import {Icons} from './icon_enum.js';
import {init_webgl} from '../webgl/webgl.js';
import {WebGLPaint} from '../webgl/paint_webgl.js';
import {loadShaders} from '../webgl/shaders.js';
import {WEBGL_PAINTER} from './colormodel.js';

export class Context {
  get canvas() {
    return window._appstate.canvas;
  }

  get canvasEditor() {
    return simple.Editor.findEditor(CanvasEditor);
  }

  get brush() {
    return this.canvas.brush;
  }

  get palettes() {
    return palettes;
  }

  static defineAPI(api, strct) {
    strct.struct("canvas", "canvas", "Canvas", api.mapStruct(Canvas));
    strct.struct("canvasEditor", "canvasEditor", "Canvas Editor", api.mapStruct(CanvasEditor));
    strct.struct("brush", "brush", "Brush", api.mapStruct(Brush));

    strct.list("palettes", "palettes", {
      get(api, list, key) {
        return list[key];
      },
      getKey(api, list, obj) {
        return list.indexOf(obj);
      },
      getStruct(api, list, key) {
        return api.mapStruct(Palette, true);
      }
    });
  }
}

const LOCAL_STORAGE_KEY = "_pigment_paint";

export class AppState extends simple.AppState {
  constructor() {
    super(Context);

    this.rectCacheRing = new util.cachering(() => {
      return [new Vector2(), new Vector2()];
    }, 2048);

    this.haveDirtyRect = false;
    this.dirtyRects = [];
    this.dirtyRect = [new Vector2(), new Vector2()];

    this.glcanvas = document.createElement("canvas");
    this.gl = init_webgl(this.glcanvas, {}, true);

    document.body.appendChild(this.glcanvas);
    this.glcanvas.style["padding"] = "0px";
    this.glcanvas.style["margin"] = "0px";
    this.glcanvas.style["position"] = "absolute";
    this.glcanvas.style["z-index"] = "-10";

    loadShaders(this.gl);

    this.canvas = WEBGL_PAINTER ? new WebGLPaint() : new Canvas();

    if (WEBGL_PAINTER) {
      this.canvas.init(this.gl);
    }
    //this.canvas = new Canvas();
  }

  updateSize() {
    let canvas = this.glcanvas;

    let dpi = UIBase.getDPI();

    let w = ~~(this.screen.size[0]*dpi);
    let h = ~~(this.screen.size[1]*dpi);

    if (w === canvas.width && h === canvas.height) {
      return;
    }

    console.warn("updating canvas size", w, h);

    canvas.width = w;
    canvas.height = h;

    canvas.style["width"] = (w/dpi) + "px";
    canvas.style["height"] = (h/dpi) + "px";
  }

  resetDirtyRect() {
    this.dirtyRect[0].zero().addScalar(1e17);
    this.dirtyRect[1].zero().addScalar(-1e17);
    this.dirtyRects.length = 0;
    this.haveDirtyRect = false;

    return this;
  }

  addDirtyRect(min, max) {
    let r = this.rectCacheRing.next();

    r[0].load(min);
    r[1].load(max);

    this.dirtyRects.push(r);
    this.haveDirtyRect = true;

    this.dirtyRect[0].min(min);
    this.dirtyRect[1].max(max);

    return r;
  }

  save() {
    let data = JSON.stringify(this.saveFile({useJSON: true}));
    localStorage[LOCAL_STORAGE_KEY] = data;

    console.log("saved localstorage data:", (data.length/1024.0).toFixed(2) + "kb");
  }

  saveFile(args = {}) {
    return super.saveFile([this.canvas], args);
  }

  loadFile(data, args = {}) {
    let file = super.loadFile(data, args);

    this.canvas = file.objects[0];

    if (!!WEBGL_PAINTER !== !!(this.canvas instanceof WebGLPaint)) {
      let brushes = this.canvas.brushes;

      this.canvas = WEBGL_PAINTER ? new WebGLPaint() : new Canvas();
      this.canvas.brushes = brushes;

      if (WEBGL_PAINTER) {
        this.canvas.init(this.gl);
      }
    }
    //console.log("re-executing canvas strokes. . .");
    //this.canvas.reexec();
  }

  start() {
    let iconsheet = document.createElement("img");
    iconsheet.src = PlatformAPI.resolveURL("/assets/iconsheet.svg");

    super.start({
      iconsheet,
      icons: Icons,
      theme
    });

    if (LOCAL_STORAGE_KEY in localStorage) {
      let data = localStorage[LOCAL_STORAGE_KEY];

      try {
        this.loadFile(data, {useJSON: true})
      } catch (error) {
        console.error(error.stack);
        console.error("Failed to load startup file", error.message);
      }
    }
  }
}

export function start() {
  let animReq = undefined;

  function draw() {
    animReq = undefined;

    if (!window._appstate || !_appstate.screen) {
      return;
    }

    _appstate.updateSize();

    let screen = _appstate.screen;
    for (let sarea of screen.sareas) {
      let area = sarea.area;

      if (area instanceof CanvasEditor) {
        area.push_ctx_active();
        area.draw();
        area.pop_ctx_active();
      }
    }

    _appstate.resetDirtyRect();
  }


  window.redraw_all = function (min, max) {
    if (min && max) {
      _appstate.addDirtyRect(min, max);
    }

    if (animReq !== undefined) {
      return;
    }

    animReq = requestAnimationFrame(draw);
  }

  window._appstate = new AppState();
  _appstate.start();

  window.setInterval(() => {
    _appstate.save();
  }, 750);
}

