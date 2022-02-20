import {
  simple, UIBase, Vector4, Vector3,
  Vector2, Quat, Matrix4, util, nstructjs,
  KeyMap, HotKey, eventWasTouch, PackFlags,
  Container, saveUIData, loadUIData, pushModalLight,
  popModalLight, keymap, exportTheme
} from '../path.ux/scripts/pathux.js';

import * as ui_base from '../path.ux/scripts/core/ui_base.js';

export class SettingsEditor extends simple.Editor {
  constructor() {
    super();

    this.tabbar = this.container.tabs("top");

  }

  static define() {
    return {
      tagname : "settings-editor-x",
      areaname: "settings-editor-x",
      uiname  : "Settings",
    }
  }

  init() {
    super.init();

    this.style["overflow"] = "scroll";

    let tabs = this.tabbar;
    let tab;

    tab = tabs.tab("Settings");
    tab = tabs.tab("Theme");

    let editor = UIBase.createElement("theme-editor-x");

    tab.button("Export Theme", () => {
      let buf = exportTheme(ui_base.theme, false);

      buf = `
/* WARNING: auto-generated file! *
 * Copy to scripts/core/theme.js */
 
import {CSSFont} from '../path.ux/pathux.js';

export const theme = ${buf}`.trim() + "\n";

      console.log(buf);

      let blob = new Blob([buf], {type : "application/javascript"});
      let url = URL.createObjectURL(blob);

      window.open(url);

      /*
      let a = document.createElement("a");

      a.setAttribute("target", "_blank");
      a.target = "_blank";
      a.download = "theme.js";
      a.href = url;
      a.click(); //*/
    });
    tab.add(editor);

  }
}

SettingsEditor.STRUCT = nstructjs.inherit(SettingsEditor, simple.Editor, "SettingsEditor") + `
}`;
simple.Editor.register(SettingsEditor);
