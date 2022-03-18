import {
  util, nstructjs, math, Vector2, Vector3,
  Vector4, Matrix4, Quat, UIBase, simple,
  FloatProperty
} from '../path.ux/pathux.js';
import {Pigment, PigmentSet} from './colormodel.js';
import {Brush} from './brush.js';
import {PlatformAPI} from '../path.ux/scripts/platforms/platform_base.js';
import {Icons} from './icon_enum.js';
import {theme} from './theme.js';

import './pigment_editor.js';
import {AppSettings} from './app.js';

export class TestEditor extends simple.Editor {
  constructor() {
    super();
  }

  static define() {
    return {
      tagname : "test-editor-x",
      areaname: "test-editor-x",
      uiname  : "Test",
    }
  }

  static defineAPI(api, st) {

  }

  init() {
    super.init();

    let row = this.container.row();
    row.background = this.getDefault("AreaHeaderBG");
    row.style["width"] = "100%";

    let col1 = row.col();
    col1.style["align-self"] = "flex-start";
    col1.style["min-width"] = "400px";

    let col2 = row.col();
    col2.style["align-self"] = "flex-start";

    let name = "CMYK";
    this.style["overflow"] = "scroll";

    for (let i = 0; i < 4; i++) {
      let panel = col1.panel(name[i]);

      let p = document.createElement("pigment-editor-x");
      p.setAttribute("datapath", `pigments.pigments[${i}]`);
      panel.add(p);
      panel.closed = true;
    }

    let tabs = col2.tabs("left");
    let tab;

    tab = tabs.tab("LUT");
    let luted = document.createElement("pigment-lut-editor-x");
    tab.add(luted);
  }

  update() {
    super.update();
  }
}

TestEditor.STRUCT = nstructjs.inherit(TestEditor, simple.Editor) + `
}`;
simple.Editor.register(TestEditor);

export class TestState {
  constructor() {
    this.pigments = new PigmentSet();
    this.brush = new Brush();
    this.settings = new AppSettings();

    let p = (idx) => {
      let ret = new Pigment();
      ret.pigment = idx;

      return ret;
    }

    this.pigments.push(p(14)); //c
    this.pigments.push(p(8));  //m
    this.pigments.push(p(1));  //y
    this.pigments.push(p(23)); //k (actually white)
  }

  static defineAPI(api, st) {

  }
}

TestState.STRUCT = `
TestState {
  pigments : PigmentSet;
  brush    : Brush;
  settings : AppSettings;
}
`;
simple.DataModel.register(TestState);

export class TestContext {
  constructor(state) {
    this.state = state;
  }

  get settings() {
    return this.state.test.settings;
  }

  get pigments() {
    return this.state.test.pigments;
  }

  get brush() {
    return this.state.test.brush;
  }

  static defineAPI(api, st) {
    st.struct("pigments", "pigments", "Pigments", api.mapStruct(PigmentSet));
    st.struct("brush", "brush", "Brush", api.mapStruct(Brush));
    st.struct("settings", "settings", "Settings", api.mapStruct(AppSettings));
  }
}

export const LSKEY = "_startup_test1";

export class TestApp extends simple.AppState {
  constructor() {
    super(TestContext);

    this.test = new TestState();
    this.saveFilesInJSON = true;
    this.defaultEditorClass = TestEditor;

    window.setInterval(() => {
      let save = JSON.stringify(this.saveFileSync());

      localStorage[LSKEY] = save;

      console.log("Saved", (save.length/1024).toFixed(2) + "kb");
    }, 2000);
  }

  createNewFile() {
    this.toolstack.reset();
  }

  saveFileSync(args = {}) {
    args.useJSON = args.useJSON ?? true;
    return super.saveFileSync([this.test], args);
  }

  loadFileSync(data, args = {}) {
    args.useJSON = args.useJSON ?? true;
    let file = super.loadFileSync(data, args);

    this.test = file.objects[0];
  }

  start() {
    let iconsheet = document.createElement("img");
    iconsheet.src = PlatformAPI.resolveURL("assets/iconsheet.svg");

    super.start({
      iconsheet,
      icons: Icons,
      //simpleNumSliders : true,
      theme,
      menusCanPopupAbove: true,
      DEBUG             : {
        modalEvents: true
      }
    })

    if (LSKEY in localStorage) {
      try {
        this.loadFileSync(JSON.parse(localStorage[LSKEY]));
      } catch (error) {
        util.print_stack(error);
        console.error("Failed to load startup file");
      }
    }
  }
}

export function start() {
  console.log("Start!");

  window._appstate = new TestApp();
  _appstate.start();
}