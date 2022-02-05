import {
  simple, Vector2, Vector3, Vector4,
  nstructjs, util, UIBase
} from '../path.ux/pathux.js';

import {PlatformAPI} from '../path.ux/scripts/platforms/platform_base.js';
import {Canvas, Brush, getSearchOffs} from './canvas.js';
import {CanvasEditor} from './canvas_editor.js';
import {Icons} from './icon_enum.js';

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

  static defineAPI(api, strct) {
    strct.struct("canvas", "canvas", "Canvas", api.mapStruct(Canvas));
    strct.struct("canvasEditor", "canvasEditor", "Canvas Editor", api.mapStruct(CanvasEditor));
    strct.struct("brush", "brush", "Brush", api.mapStruct(Brush));
  }
}

const LOCAL_STORAGE_KEY = "_pigment_paint";

export class AppState extends simple.AppState {
  constructor() {
    super(Context);

    this.canvas = new Canvas();
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

    //console.log("re-executing canvas strokes. . .");
    //this.canvas.reexec();
  }

  start() {
    let iconsheet = document.createElement("img");
    iconsheet.src = PlatformAPI.resolveURL("/assets/iconsheet.svg");

    super.start({
      iconsheet,
      icons : Icons
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
  window._appstate = new AppState();
  _appstate.start();

  window.setInterval(() => {
    _appstate.save();
  }, 750);
}

