import {
  nstructjs, util, Vector2, math, UIBase, Vector4,
  simple, EnumProperty
} from '../path.ux/scripts/pathux.js';
import {Presets} from '../presets/brush_presets.js';

export const PresetClasses = [];
import {appLocalStorage} from './localStorage.js';

const DIR_KEY = "p_preset_dir";

export class PresetList extends Array {
  constructor(typeName) {
    super();

    this.typeName = typeName;
    this.nameMap = new Map();
    this.idMap = new Map();
    this.prop = new EnumProperty(undefined, {__nothing__: 0});
  }

  getEnumProp() {
    return this.prop;
  }

  updateProp() {
    let prop = this.prop;

    if (this.length === 0) {
      prop.keys = {__nothing__: 0};
      prop.values = {0: "__nothing__"};

      return;
    }

    prop.keys = {};
    prop.values = {};
    prop.ui_value_names = {};
    prop.iconmap = {};
    prop.iconmap2 = {};
    prop.descriptions = {};

    for (let preset of this) {
      prop.values[preset.name] = preset.presetId;
      prop.keys[preset.presetId] = preset.name;
      prop.ui_value_names[preset.name] = preset.name;
    }
  }

  push(preset) {
    this.nameMap.set(preset.name, preset);
    this.idMap.set(preset.presetId, preset);

    super.push(preset);
  }

  remove(preset) {
    this.nameMap.delete(preset.name);
    this.idMap.delete(preset.presetId);

    super.remove(preset);
  }

  has(preset_or_name) {
    if (typeof preset_or_name === "object") {
      preset_or_name = preset_or_name.name;
    }

    return this.nameMap.has(preset_or_name);
  }

  get(name) {
    if (typeof name === "number") {
      return this.idMap.get(name);
    }

    return this.nameMap.get(name);
  }
}

export class PresetManager {
  constructor() {
    this.lists = new Map();
  }

  loadBuiltin(preset, k) {
    let Brush = Preset.getClass("brush");
    let list = this.getList("brush");

    preset = Brush.applyDeltaSave(preset);

    let brush;

    try {
      brush = Brush.loadSave(preset);
    } catch (error) {
      console.error("Failed to load builtin brush preset " + k);
      return;
    }

    brush.sourcePreset = preset.name;

    if (!list.has(brush.name)) {
      this.add(brush);
    }

    brush.save();
  }

  loadBuiltins() {
    let Brush = Preset.getClass("brush");
    let list = this.getList("brush");

    for (let k in Presets) {
      this.loadBuiltin(Presets[k], k);
    }
  }

  resetBuiltin(builtin) {
    let list = this.getList("brush");
    let Brush = Preset.getClass("brush");

    let preset = list.get(builtin.name);
    if (preset) {
      list.remove(preset);
    }

    this.loadBuiltin(builtin, builtin.name);
  }

  checkForNewVersions() {
    this.mergeDirectory(true);

    for (let preset of this) {
      let lskey = preset.lsKey();
      if (lskey in appLocalStorage) {
        let json = JSON.parse(appLocalStorage[lskey]);
        let date = new Date(json.date);

        if (date > preset.date) {
          console.log("updated preset", preset.name, preset, date, preset.date);

          let preset2 = preset.constructor.loadSave(json);
          preset2.copyTo(preset);
          preset.date = preset2.date;
        }
      }
    }
  }

  * [Symbol.iterator]() {
    for (let list of this.lists.values()) {
      for (let preset of list) {
        yield preset;
      }
    }
  }

  saveChangedPresets() {
    for (let preset of this) {
      let hash = preset.hash();

      if (hash !== preset._last_changed_hash) {
        preset._last_changed_hash = hash;
        console.log("saving preset");
        preset.save();
      }
    }
  }

  saveAllPresets() {
    for (let preset of this) {
      preset.save();
    }
  }

  getListEnum(typeName) {
    return this.getList(typeName).prop;
  }

  getList(typeName) {
    let list = this.lists.get(typeName);

    if (!list) {
      list = new PresetList(typeName);
      this.lists.set(typeName, list);
    }

    return list;
  }

  uniqueName(typeName, name, preset) {
    if (name.trim().length === 0) {
      name = "unnamed";
    }

    let i = 1;
    let newname = name;

    let name2 = name;
    name2 = name2.trim().split(" ");

    let last = name2[name2.length - 1];
    if (last.search(/[0-9]+$/) === 0) {
      i = parseInt(last);
      name2.pop();

      name = name2.join(" ");
    }

    let list = this.getList(typeName);
    while (list.nameMap.has(newname) && list.nameMap.get(newname) !== preset) {
      newname = name + " " + (i++);
    }

    return newname;
  }

  create(typeName) {
    let cls = Preset.getClass(typeName);
    let preset = new cls();

    this.add(preset);

    return preset;
  }

  add(preset) {
    let typeName = preset.constructor.presetDefine().typeName;
    let list = this.getList(typeName);

    preset.name = this.uniqueName(typeName, preset.name, preset);

    if (preset.presetId === -1) {
      /* create ID from initial name */
      preset.presetId = util.strhash(preset.name);

      while (list.idMap.has(preset.presetId)) {
        preset.presetId++;
      }
    }

    list.push(preset);

    let dir = this.getDirectory();

    if (!(typeName in dir)) {
      dir[typeName] = [];
    }

    if (dir[typeName].indexOf(preset.presetId) < 0) {
      dir[typeName].push(preset.presetId);
    }

    this.saveDirectory(dir);
    list.updateProp();

    preset.save();
  }

  recoverDirectory() {
    delete appLocalStorage[DIR_KEY];

    let recover = (json) => {
      json = JSON.parse(json);
      if (!json.typeName) {
        console.warn("invalid preset " + json);
        return;
      }

      let cls = Preset.getClass(json.typeName);

      if (!cls) {
        console.warn("invalid preset " + json);
        return;
      }

      let preset = cls.loadSave(json);
      this.add(preset);
    }

    for (let k in appLocalStorage) {
      if (k.startsWith("_preset_")) {
        try {
          recover(appLocalStorage[k]);
        } catch (error) {
          util.print_stack(error);
        }
      }
    }
  }

  get(name, typeName) {
    return this.getList(typeName).get(name);
  }

  remove(preset) {
    let typeName = preset.constructor.presetDefine().typeName;
    let lskey = preset.lsKey();
    let list = this.getList(typeName);

    list.remove(preset);

    let dir = this.getDirectory();

    if (typeName in dir && dir[typeName].indexOf(preset.presetId) >= 0) {
      dir[typeName].remove(preset.presetId);
      delete appLocalStorage[lskey];
    }

    this.saveDirectory(dir);
    list.updateProp();
  }

  has(preset_or_name, typeName = preset_or_name.constructor.presetDefine().typeName) {
    return this.getList(typeName).has(preset_or_name);
  }

  loadPresets() {
    try {
      this.loadPresetsIntern();
    } catch (error) {
      util.print_stack(error);

      //attempt to recover directory
      this.recoverDirectory();
      this.loadPresetsIntern();
    }
  }

  loadPresetsIntern() {
    let dir = this.getDirectory();

    for (let cls of PresetClasses) {
      let typeName = cls.presetDefine().typeName;

      if (typeName in dir) {
        let list = this.getList(typeName);

        for (let id of dir[typeName]) {
          let preset = cls.load(id);

          if (!preset) {
            debugger;
            preset = cls.load(id);
          }

          preset._last_changed_hash = preset.hash();

          if (this.has(preset.name, typeName)) {
            list.remove(this.get(preset.name, typeName));
          }

          list.push(preset);
        }

        list.updateProp();
      }
    }

    /* merge directory */
    this.mergeDirectory();
  }

  mergeDirectory(loadExtraPresets = false) {
    let dir = this.getDirectory();

    for (let list of this.lists.values()) {
      if (!(list.typeName in dir)) {
        dir[list.typeName] = [];
      }

      let dirlist = dir[list.typeName];

      for (let item of list) {
        if (dirlist.indexOf(item.presetId) < 0) {
          dirlist.push(item.presetId);
        }
      }

      if (loadExtraPresets) {
        for (let id of dirlist) {
          if (!list.idMap.has(id)) {
            let preset = Preset.getClass(list.typeName).load(id);
            this.add(preset);
          }
        }
      }
    }

    this.saveDirectory(dir);
  }

  getDirectory() {
    if (DIR_KEY in appLocalStorage) {
      return JSON.parse(appLocalStorage[DIR_KEY]);
    }

    appLocalStorage[DIR_KEY] = JSON.stringify({
      version: 0,
    });
    return {};
  }

  saveDirectory(dir) {
    appLocalStorage[DIR_KEY] = JSON.stringify(dir);
  }
}

export class PresetRef {
  constructor(type, name, id) {
    this.typeName = type;
    this.name = name;
    this.id = id;
  }

  static create(preset) {
    return new PresetRef(preset.constructor.presetDefine().typeName, preset.name, preset.presetId);
  }

  set(preset) {
    this.typeName = preset.constructor.presetDefine().typeName;
    this.name = preset.name;
    this.id = preset.presetId;

    return this;
  }

  getPreset() {
    if (this.id === undefined) {
      return undefined;
    }

    let list = presetManager.getList(this.typeName);
    let preset = list.idMap.get(this.id);

    if (!preset) {
      preset = list.nameMap.get(this.name);
    }

    return preset;
  }
}

PresetRef.STRUCT = `
PresetRef {
  typeName : string;
  id       : int;
  name     : string;
}
`;
nstructjs.register(PresetRef);


export class Preset {
  constructor() {
    this._last_changed_hash = undefined;

    this.sourcePreset = "";
    this.name = "unnamed";
    this.date = new Date();
    this.iconColor = new Vector4([1, 1, 1, 1]);
    this.presetId = -1;
  }

  static presetDefine() {
    throw new Error("implement me");
    return {
      typeName: "",
      uiName  : "",
      flag    : 0,
      icon    : -1,
    }
  }

  static register(cls) {
    PresetClasses.push(cls);
  }

  static getClass(typeName) {
    for (let cls of PresetClasses) {
      if (cls.presetDefine().typeName === typeName) {
        return cls;
      }
    }
  }

  static lsKey(id) {
    let type = this.presetDefine().typeName;

    let key = `_preset_${type}_${id}`;
    return key;
  }

  static loadSave(json) {
    let istruct = new nstructjs.STRUCT();
    istruct.parse_structs(json.schema);

    let preset = istruct.readJSON(json.json, this);

    preset.presetId = json.presetId;
    preset.date = new Date(json.date);

    return preset;
  }

  static load(id) {
    let lskey = this.lsKey(id);
    let json;

    if (lskey in appLocalStorage) {
      json = appLocalStorage[lskey];

      try {
        json = JSON.parse(json);
      } catch (error) {
        util.print_stack(error);
        return;
      }
    } else {
      return;
    }

    return this.loadSave(json);
  }

  static defineAPI(api, st) {
    st.color4("iconColor", "iconColor", "Icon Color");
    st.string("name", "name", "Name");
    st.int("presetId", "ID", "Unique ID").readOnly();
  }

  hash(digest = new util.HashDigest()) {
    return digest.get();
  }

  copyTo(b) {
    b.name = this.name;
    b.date = this.date;
  }

  lsKey() {
    return this.constructor.lsKey(this.presetId);
  }

  addExtraStructs(istruct) {

  }

  createSave() {
    let istruct = new nstructjs.STRUCT();
    istruct.registerGraph(nstructjs.manager, this.constructor);

    this.addExtraStructs(istruct);

    let json = {
      version : 0,
      date    : new Date(),
      name    : this.name,
      presetId: this.presetId,
      typeName: this.constructor.presetDefine().typeName,
      schema  : nstructjs.write_scripts(istruct),
      json    : istruct.writeJSON(this)
    };

    return json
  }

  save() {
    let lskey = this.lsKey();

    let json = this.createSave()
    this.date = json.date;
    appLocalStorage[lskey] = JSON.stringify(json);
  }

  loadSTRUCT(reader) {
    reader(this);

    if (typeof this.date === "string") {
      this.date = new Date(this.date);
    }
  }
}

Preset.STRUCT = `
PresetBase {
  sourcePreset : string;
  iconColor    : vec4;
  name         : string;
  date         : string;
}
`;
simple.DataModel.register(Preset);

export const presetManager = new PresetManager();

export function startPresets() {
  presetManager.loadPresets();

  presetManager.loadBuiltins();
}

window._presetManager = presetManager;
