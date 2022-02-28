import '../../wasm/wasm_api.js';
import '../util/numeric.js';
import './settings_editor.js';

import {
  simple, Vector2, Vector3, Vector4,
  nstructjs, util, UIBase, ToolOp
} from '../path.ux/pathux.js';

import {Palette, palettes} from './palette.js';

import {theme} from './theme.js';

import {PlatformAPI} from '../path.ux/scripts/platforms/platform_base.js';
import {Canvas, Brush, getSearchOffs, BrushTools} from './canvas.js';
import {CanvasEditor} from './canvas_editor.js';
import {Icons} from './icon_enum.js';
import {init_webgl} from '../webgl/webgl.js';
import {WebGLPaint} from '../webgl/paint_webgl.js';
import {loadShaders} from '../webgl/shaders.js';
import {PigmentSet, WEBGL_PAINTER} from './colormodel.js';

import {ColorTripletSet, colorTripletSet} from './pairlut.js';
import {BrushCommandStack} from '../webgl/brush_webgl.js';
import {presetManager, startPresets} from './presets.js';

export class Context {
  get canvas() {
    return window._appstate.canvas;
  }

  get canvasEditor() {
    return simple.Editor.findEditor(CanvasEditor);
  }

  get menuBar() {
    return simple.Editor.findEditor(simple.MenuBarEditor);
  }

  get colorTriplets() {
    return colorTripletSet;
  }

  get brushstack() {
    return this.state.brushstack;
  }

  get state() {
    return _appstate;
  }

  get brush() {
    return this.canvas.brush;
  }

  get pigments() {
    return this.canvas.pigments;
  }

  get palettes() {
    return palettes;
  }

  static defineAPI(api, strct) {
    strct.struct("canvas", "canvas", "Canvas", api.mapStruct(Canvas));
    strct.struct("canvasEditor", "canvasEditor", "Canvas Editor", api.mapStruct(CanvasEditor));
    strct.struct("brush", "brush", "Brush", api.mapStruct(Brush));
    strct.struct("colorTriplets", "colorTriplets", "Color Triplets", api.mapStruct(ColorTripletSet));
    strct.struct("brushstack", "brushstack", "Brush Stack", api.mapStruct(BrushCommandStack));

    strct.struct("pigments", "pigments", "Pigments", api.mapStruct(PigmentSet, true));

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

function makeMenuBar(ctx, container, editor) {
  container.menu("File", [
    "app.new()",
    "app.open()",
    simple.Menu.SEP,
    "app.save()",
    "app.save(forceDialog=true)|Save As",
  ]);

  container.menu("Edit", []);
  container.menu("Session", []);
}

simple.Editor.registerAppMenu(makeMenuBar);

const LOCAL_STORAGE_KEY = "_pigment_paint";

export class AppState extends simple.AppState {
  constructor() {
    super(Context);

    this.fileVersion = [0, 0, 2];

    this.defaultEditorClass = CanvasEditor;

    this.brushstack = new BrushCommandStack();

    this.toolstack.enforceMemLimit = true;
    //this.toolstack.memLimit = 8*1024*1024;

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

    this.fileExt = "png";
    //this.canvas = new Canvas();
  }

  createNewFile() {
    this.toolstack.reset();
    this.currentFileRef = undefined;

    this.canvas.reset();
    window.redraw_all();
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
    this.saveFile({useJSON: true}).then(data => {
      data = JSON.stringify(data);
      localStorage[LOCAL_STORAGE_KEY] = data;

      console.log("saved localstorage data:", (data.length/1024.0).toFixed(2) + "kb");
    });
  }

  saveFile(args = {}) {
    return new Promise((accept, reject) => {
      super.saveFile([this.canvas], args).then(buffer => {
        if (args.fromFileOp) {
          let canvas;

          canvas = document.createElement("canvas");
          canvas.width = this.canvas.width;
          canvas.height = this.canvas.height;
          let g = canvas.getContext("2d");

          let image = WEBGL_PAINTER ? this.canvas.getImageData() : this.canvas.image;
          g.putImageData(image, 0, 0);

          canvas.toBlob(blob => {
            blob.arrayBuffer().then(buffer2 => {
              accept(buffer2);
            });
          });
        } else {
          accept(buffer);
        }
      });
    });
  }

  loadFile(data, args = {}) {
    return new Promise((accept, reject) => {
      if (args.fromFileOp) {
        let s = '';
        let buf = new Uint8Array(data);

        for (let i = 0; i < buf.length; i++) {
          s += String.fromCharCode(buf[i]);
        }

        s = "data:image/png;base64," + btoa(s);
        let img = document.createElement("img");
        img.src = s;
        img.onload = () => {
          let canvas = document.createElement("canvas");
          let g = canvas.getContext("2d");

          canvas.width = img.width;
          canvas.height = img.height;

          g.drawImage(img, 0, 0);
          let image = g.getImageData(0, 0, canvas.width, canvas.height);

          this.canvas.putImageData(image);
        }
      } else {
        super.loadFile(data, args).then(file => {
          this.canvas = file.objects[0];

          console.error("FILE", file);

          this.doVersions(file);

          if (!!WEBGL_PAINTER !== !!(this.canvas instanceof WebGLPaint)) {
            let brushes = this.canvas.brushes;

            this.canvas = WEBGL_PAINTER ? new WebGLPaint() : new Canvas();
            this.canvas.brushes = brushes;

            if (WEBGL_PAINTER) {
              this.canvas.init(this.gl);
            }
          }

          accept();
        });
      }
    });
    //console.log("re-executing canvas strokes. . .");
    //this.canvas.reexec();
  }

  doVersions(file) {
    function lessThan(a, b, c) {
      let va = file.version_major*500*500 + file.version_minor*500 + file.version_micro;
      let vb = a*500*500 + b*500 + c;

      return va < vb;
    }

    console.error("THAN", lessThan(0,0,2));

    if (lessThan(0, 0, 2)) {
      console.error("Adding old brushes to preset manager");

      let canvas = file.objects[0];
      for (let brush of canvas._oldslots) {
        let name = "(unnamed brush)";

        for (let k in BrushTools) {
          if (BrushTools[k] === brush.tool) {
            name = ToolProperty.makeUIName(k);
          }
        }

        brush.name = name;
        presetManager.add(brush);
      }
    }
  }

  start() {
    let iconsheet = document.createElement("img");
    iconsheet.src = PlatformAPI.resolveURL("/assets/iconsheet.svg");

    super.start({
      iconsheet,
      icons: Icons,
      theme
    });

    startPresets();

    if (LOCAL_STORAGE_KEY in localStorage) {
      let data = localStorage[LOCAL_STORAGE_KEY];

      try {
        this.loadFile(data, {useJSON: true}).catch(error => {
          console.error(error.stack);
          console.error("Failed to load startup file", error.message);
        });
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
    presetManager.checkForNewVersions();
    presetManager.saveChangedPresets();
  }, 2750);
}

