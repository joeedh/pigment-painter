import {
  Curve1D, EnumProperty, FloatProperty, nstructjs,
  simple, util, Vec3Property, Vec4Property, Vector3,
  Vector4, ToolProperty, IntProperty, FlagProperty, Vec2Property, StringProperty, ListProperty, CurveConstructors
} from '../path.ux/scripts/pathux.js';
import {Pigment} from './colormodel.js';
import {Icons} from './icon_enum.js';
import {makeSharedImageData} from '../../wasm/wasm_api.js';
import {ImageSlots} from './canvas_base.js';
import {wasmModule, wasmReady} from '../../wasm/wasm_api.js';
import {Texture} from '../webgl/webgl.js';
import {Preset} from './presets.js';

let brush_hash = new util.HashDigest();

export const BrushTools = {
  DRAW : 0,
  SMEAR: 1,
  ERASE: 2,
  TEST : 3
};

export const BrushFlags = {
  ACCUMULATE: 1,
  FOLLOW    : 2, //rotate to follow stroke direction
};

export const BrushMixModes = {
  PIGMENT : 0,
  SIMPLE  : 1,
  CMYK_HSV: 2,
  HSV     : 3,
};

export const DynamicFlags = {
  ENABLED     : 1<<0,
  NOT_MY_CURVE: 1<<1,
  PERIODIC    : 1<<2,
};

export const BrushAlphaFlags = {
  READY: 1
};

export class BrushAlpha {
  constructor(name, image, tilesize) {
    this.imageName = name;
    this.image = image;
    this.tilesize = tilesize
    this.flag = 0;
    this.id = this.constructor.idgen++;
    this.wasmLoaded = false;

    this.gltex = undefined;
  }

  get ready() {
    return this.flag & BrushAlphaFlags.READY;
  }

  set ready(v) {
    if (v) {
      this.flag |= BrushAlphaFlags.READY;
    } else {
      this.flag &= ~BrushAlphaFlags.READY;
    }
  }

  static wasmLoad(id_or_name) {
    let name = id_or_name;

    if (typeof id_or_name === "number") {
      name = this.getAlphaFromId(id_or_name).name;
    }

    let image = this.images[name];

    let data = makeSharedImageData(image.image.width, image.image.height, ImageSlots.ALPHA, image.tilesize, false, image.id);
    data.data.set(image.image.data);

    wasmModule.asm.makeMipMaps(ImageSlots.ALPHA);

    image.wasmLoaded = true;
  }

  static checkWasmLoaded(id_or_name) {
    let name = id_or_name;

    if (typeof id_or_name === "number") {
      name = this.getAlphaFromId(id_or_name).name;
    }

    if (!wasmReady()) {
      return;
    }

    let image = this.images[name];

    if (!image.wasmLoaded || wasmModule.asm.getImageId(ImageSlots.ALPHA) !== image.id) {
      this.wasmLoad(name);
    }
  }

  static defineAPI(api, st) {

  }

  static register(name, image, tilesize) {
    this.images[name] = new BrushAlpha(name, image, tilesize);

    let k = name;
    let v = this.images[name].id;

    this.prop.values[k] = v;
    this.prop.keys[v] = k;
    this.prop.ui_value_names[k] = ToolProperty.makeUIName(name);
  }

  static loadAlpha(name, url, tilesize) {
    let img = document.createElement("img");
    img.src = url;

    return new Promise((accept, reject) => {
      img.onload = (e) => {
        let canvas = document.createElement("canvas");
        let g = canvas.getContext("2d");

        g.globalCompositeOperation = "copy";
        g.globalAlpha = 0.0;

        canvas.width = img.width;
        canvas.height = img.height;
        g.drawImage(img, 0, 0);
        let idata = g.getImageData(0, 0, canvas.width, canvas.height);

        this.register(name, idata, tilesize);

        console.warn("Loaded alpha!");
        accept(this.images[name]);
      }
    });
  }

  static getAlphaFromId(id) {
    for (let k in this.images) {
      if (this.images[k].id === id) {
        return this.images[k];
      }
    }
  }

  getGLTex(gl) {
    if (this.gltex) {
      return this.gltex;
    }

    let tex = new Texture(gl.createTexture(), gl);
    tex.load(gl, this.image.width, this.image.height, this.image.data);

    this.gltex = tex;
    return tex;
  }

  load() {
    if (this.ready) {
      return;
    }

    if (this.imageName in BrushAlpha.images) {
      let {image, tilesize} = BrushAlpha.images[this.imageName];

      this.image = image;
      this.tilesize = tilesize;
      this.ready = true;
    }
  }
}

BrushAlpha.prop = new EnumProperty(0, {NONE: 0});
BrushAlpha.idgen = 1;
BrushAlpha.images = {};

BrushAlpha.STRUCT = `
BrushAlpha {
  imageName : string;
  flag      : int | this.flag & ~1;
}
`;
simple.DataModel.register(BrushAlpha);

window._BrushAlpha = BrushAlpha;

BrushAlpha.loadAlpha("brush1", "/assets/brush1.png", 512);

export const PeriodicFuncs = {
  TENT  : 0,
  SMOOTH: 1,
  SAW   : 2,
  STEP  : 3
};

let period_funcs = [
  function (n) {
    return Math.tent(n);
  },
  function (n) {
    n = Math.tent(n);
    return n*n*(3.0 - 2.0*n);
  },
  function (n) {
    return Math.fract(n);
  },
  function (n) {
    return Math.fract(n) > 0.5;
  }
];

export class InputDynamic {
  constructor(name, curve = new Curve1D()) {
    this.curve = curve;
    this.name = "" + name;

    this.flag = 0;
    this.inputMin = 0.0;
    this.inputMax = 1.0;
    this.outputMin = 0.0;
    this.outputMax = 1.0;

    this.periodFunc = PeriodicFuncs.TENT;

    this.scale = 1.0;
    this.factor = 1.0;
  }

  get enabled() {
    return this.flag & DynamicFlags.ENABLED;
  }

  set enabled(v) {
    if (v) {
      this.flag |= DynamicFlags.ENABLED;
    } else {
      this.flag &= ~DynamicFlags.ENABLED;
    }
  }

  static defineAPI(api, st) {
    st.string("name", "name", "Name").readOnly();
    st.curve1d("curve", "curve", "Curve");
    st.flags("flag", "flag", DynamicFlags).icons({
      ENABLED: Icons.ENABLE_PRESSURE
    });

    st.enum("periodFunc", "periodFunc", PeriodicFuncs, "Wave Type");

    st.float("scale", "scale", "Scale")
      .noUnits()
      .range(-50.0, 50.0)
      .step(0.1);

    st.float("inputMin", "inputMin", "Input Min")
      .range(-10.0, 10.0)
      .noUnits();

    st.float("inputMax", "inputMax", "Input Max")
      .range(-10.0, 10.0)
      .noUnits();

    st.float("outputMin", "outputMin", "Output Min")
      .range(-10.0, 10.0)
      .noUnits();

    st.float("outputMax", "outputMax", "Output Max")
      .range(-10.0, 10.0)
      .noUnits();

    st.float("factor", "factor", "Factor")
      .range(0.0, 1.0)
      .noUnits();
  }

  hash(digest = new util.HashDigest()) {
    digest.add(this.flag);
    digest.add(this.inputMin);
    digest.add(this.inputMax);
    digest.add(this.outputMin);
    digest.add(this.outputMax);
    digest.add(this.flag & ~DynamicFlags.NOT_MY_CURVE);

    this.curve.calcHashKey(digest);

    digest.add(this.periodFunc);
    digest.add(this.scale);
    digest.add(this.factor);

    return digest.get();
  }

  evaluate(f) {
    if (!this.enabled) {
      return 1.0;
    }

    f *= this.scale;

    if (this.flag & DynamicFlags.PERIODIC) {
      f = period_funcs[this.periodFunc](f);
    }

    f = Math.min(Math.max(f, this.inputMin), this.inputMax);
    f = (f - this.inputMin)/(this.inputMax - this.inputMin);

    f = this.curve.evaluate(f);

    f = f*(this.outputMax - this.outputMin) + this.outputMin;

    return f*this.factor + 1.0 - this.factor;
  }

  ensureWrite() {
    if (this.flag & DynamicFlags.NOT_MY_CURVE) {
      this.curve = this.curve.copy();
      this.flag &= ~DynamicFlags.NOT_MY_CURVE;
    }
  }

  copyTo(b) {
    b.name = this.name;
    b.curve = this.curve;
    b.flag = this.flag | DynamicFlags.NOT_MY_CURVE;
    b.inputMin = this.inputMin;
    b.inputMax = this.inputMax;
    b.outputMin = this.outputMin;
    b.outputMax = this.outputMax;
    b.factor = this.factor;
    b.scale = this.scale;
    b.periodFunc = this.periodFunc;
  }

  copy() {
    let ret = new InputDynamic(undefined, undefined);
    this.copyTo(ret);
    return ret;
  }

  loadSTRUCT(reader) {
    reader(this);

    this.flag &= ~DynamicFlags.NOT_MY_CURVE;
  }
}

InputDynamic.STRUCT = `
InputDynamic {
  name      : string;
  curve     : Curve1D;
  flag      : int;
  inputMin  : float;
  inputMax  : float;
  outputMin : float;
  outputMax : float;
  factor    : float;
  scale     : float;
  periodFunc: int;
}
`;
nstructjs.register(InputDynamic);
simple.DataModel.register(InputDynamic);

export class BrushDynamics {
  constructor() {
    this.mappings = new Map();
  }

  static defineAPI(api, st) {

    return st;
  }

  hash(digest = new util.HashDigest()) {
    for (let map of this.mappings.values()) {
      map.hash(digest);
    }

    return digest.get();
  }

  [Symbol.iterator]() {
    return this.mappings.values()[Symbol.iterator]();
  }

  copy() {
    let ret = new BrushDynamics();

    for (let dyn of this.mappings.values()) {
      ret.mappings.set(dyn.name, dyn.copy());
    }

    return ret;
  }

  ensure(name) {
    return this.add(name);
  }

  add(name) {
    let ret = this.mappings.get(name);
    if (ret) {
      return ret;
    }

    ret = new InputDynamic(name);
    this.mappings.set(name, ret);
    return ret;
  }

  get(name) {
    return this.mappings.get(name);
  }

  has(name) {
    return this.get(name) !== undefined;
  }

  evaluate(name, value) {
    return this.mappings.get(name).evaluate(value);
  }

  loadSTRUCT(reader) {
    reader(this);

    let mappings = new Map();

    for (let map of this.mappings) {
      mappings.set(map.name, map);
    }
    this.mappings = mappings;
  }
}

BrushDynamics.STRUCT = `
BrushDynamics {
  mappings : iter(InputDynamic) | this.mappings.values();
}`
;
simple.DataModel.register(BrushDynamics);

let ch_ret_vec3s = util.cachering.fromConstructor(Vector3, 64);
let ch_ret_vec4s = util.cachering.fromConstructor(Vector4, 512);

export class BrushChannel {
  constructor(name, propcls = FloatProperty) {
    this.name = name;
    this.uiName = name;
    this.propClass = propcls;

    this.prop = new propcls();
    this.prop.name = name;
    this.prop.uiName = this.uiName;

    this.prop.range = [0.0, 1.0];
    this.prop.baseUnit = this.prop.displayUnit = "none";

    this.dynamics = new BrushDynamics();
    this.dynamics.add("pressure");
    this.dynamics.add("tilt");
    this.dynamics.add("tiltx");
    this.dynamics.add("tilty");
    this.dynamics.add("tilt_angle");
    this.dynamics.add("angle");

    let dyn = this.dynamics.add("distance");

    dyn.flag |= DynamicFlags.PERIODIC;
    dyn.scale = 0.25;
  }

  get value() {
    return this.getValue();
  }

  set value(v) {
    this.setValue(v);
  }

  static defineAPI(api, st) {
    st.string("name", "name", "Name").readOnly();
    st.string("uiName", "uiName", "Display Name").readOnly();
    st.float("value", "value", "Value").noUnits().decimalPlaces(3)
      .customPropCallback(function (prop) {
        let ch = this.dataref;

        //console.log(ch.name, ch.prop.decimalPlaces, ch.prop.unit);

        prop.decimalPlaces = ch.prop.decimalPlaces;
        prop.range = ch.prop.range;
        prop.step = ch.prop.step;

        if (ch.prop.unit) {
          prop.baseUnit = prop.displayUnit = ch.prop.unit;
        }
        prop.baseUnit = ch.prop.baseUnit || "none";
        prop.displayUnit = ch.prop.displayUnit || "none";

        prop.expRate = ch.prop.expRate;
        prop.stepIsRelative = ch.prop.stepIsRelative;

        return prop;
      })
      .uiNameGetter(function () {
        return this.dataref.uiName || this.dataref.name;
      });

    st.list("dynamics", "dynamics", {
      get(api, list, key) {
        return list.get(key);
      },
      getKey(api, list, obj) {
        return obj.name;
      },
      getLength(api, list) {
        return list.mappings.size;
      },
      getIter(api, list) {
        return list.values()[Symbol.iterator]();
      },
      getStruct(api, list, key) {
        return api.mapStruct(InputDynamic);
      }
    });
    //st.struct("dynamics", "dynamics", "Dynamics", api.mapStruct(BrushDynamics, true));
  }

  hash(digest = new util.HashDigest()) {
    digest.add(this.value);

    for (let dyn of this.dynamics) {
      dyn.hash(digest);
    }

    return digest.get();
  }

  copyTo(b) {
    b.name = this.name;
    b.uiName = this.uiName;
    b.propClass = this.propClass;
    b.prop = this.prop.copy();
    b.dynamics = this.dynamics.copy();
  }

  copy() {
    let ret = new BrushChannel();

    this.copyTo(ret);

    return ret;
  }

  getValue() {
    return this.prop.getValue();
  }

  setValue(v) {
    this.prop.setValue(v);
  }

  evaluate(inputs = {}) {
    let f = this.getValue();

    if (typeof f === "object") {
      f = f.length === 3 ? ch_ret_vec3s.next().load(f) : ch_ret_vec4s.next().load(f);

      for (let d of this.dynamics) {
        if (d.name in inputs) {
          for (let i = 0; i < f.length; i++) {
            f[i] *= d.evaluate(inputs[d.name]);
          }
        }
      }

      return f;
    }

    for (let d of this.dynamics) {
      if (d.name in inputs) {
        f *= d.evaluate(inputs[d.name]);
      }
    }

    let range = this.prop.range;
    return Math.min(Math.max(f, range[0]), range[1]);
  }

  loadSTRUCT(reader) {
    let dynamics = util.list(this.dynamics.mappings.keys());

    let oldprop = this.prop;

    reader(this);

    this.propClass = this.prop.constructor;

    for (let key of dynamics) {
      this.dynamics.ensure(key);
    }

    if (0) {
      /*restore ui limits*/
      this.prop.range = oldprop.range;
      this.prop.baseUnit = oldprop.baseUnit;
      this.prop.displayUnit = oldprop.displayUnit;
      this.prop.step = oldprop.step;
      this.prop.expRate = oldprop.expRate;
      this.prop.decimalPlaces = oldprop.decimalPlaces;
      this.prop.stepIsRelative = oldprop.stepIsRelative;
    }
  }

  uiName(name) {
    this.prop.uiName = name;
    return this;
  }

  range(a, b) {
    this.prop.range[0] = a;
    this.prop.range[1] = b;

    return this;
  }

  min(f) {
    this.prop.range[0] = f;
    return this;
  }

  max(f) {
    this.prop.range[1] = f;
    return this;
  }

  baseUnit(u) {
    this.prop.baseUnit = u;
    return this;
  }

  displayUnit(u) {
    this.prop.displayUnit = u;
  }

  expRate(rate) {
    this.prop.expRate = rate;
    return this;
  }

  step(s) {
    this.prop.step = s;
    return this;
  }

  stepIsRelative(b) {
    this.prop.stepIsRelative = !!b;
    return this;
  }

  decimalPlaces(c) {
    this.prop.decimalPlaces = c;
    return this;
  }
}

BrushChannel.STRUCT = `
BrushChannel {
  name     : string;
  uiName   : string;
  prop     : abstract(ToolProperty);
  dynamics : BrushDynamics;
}
`;
simple.DataModel.register(BrushChannel);

export class BrushChannelSet extends Array {
  constructor() {
    super();

    this.nameMap = new Map();
  }

  static defaultTemplate() {
    return {
      strength     : {value: 0.5, range: [0.0, 1.0], penPressure: true},
      radius       : {value: 35.0, range: [0.25, 5000.0], unit: "pixel"},
      hue          : {value: 0.0, range: [-1.0, 1.0]},
      scatter      : {value: 2.75, range: [0.0, 100.0]},
      smear        : {value: 0.33, range: [0.0, 5.0]},
      smearLen     : {value: 3.5, range: [0.0, 50.0]},
      smearRate    : {value: 1.2, uiName: "Rate"},
      spacing      : {value: 0.25, range: [0.001, 5.0]},
      alphaLighting: {value: 0.25, range: [0.0, 1.0], uiName: "light"},
      color        : new Vector4([0.0, 0.0, 0.0, 1.0]),
      angle        : {value: 0.0, range: [-360.0, 360.0], unit: "degree", decimalPlaces: 1, step: 1},
      squish       : {value: 0.0, range: [0.0, 1.0]},
      soft         : {value: 0.25, range: [0.0, 1.0], step: 0.05, decimalPlaces: 3},
    }
  }

  static defineAPI(api, st) {

  }

  copy() {
    let ret = new BrushChannelSet();

    for (let ch of this) {
      ret.push(ch.copy());
    }

    return ret;
  }

  push(ch) {
    super.push(ch);
    this.nameMap.set(ch.name, ch);
  }

  ensure(name, propClass) {
    let ch = this.nameMap.get(name);

    if (!ch) {
      ch = new BrushChannel(name, propClass);
      this.nameMap.set(name, ch);
      this.push(ch);
    }

    return ch;
  }

  remove(name_or_ch) {
    if (typeof name_or_ch === "string") {
      let ch = this.nameMap.get(name_or_ch);

      if (!ch) {
        throw new Error("unknown channel " + name_or_ch);
      }

      super.remove(ch);
      this.nameMap.delete(name_or_ch);
    } else {
      super.remove(name_or_ch);
    }
  }

  evaluate(name, inputs) {
    if (!this.nameMap.has(name)) {
      throw new Error("unknown channel " + name);
    }

    return this.get(name).evaluate(inputs);
  }

  getValue(name) {
    return this.get(name).getValue();
  }

  setValue(name, val, warn_on_error) {
    if (warn_on_error && !this.has(name)) {
      console.warn("Warning: unknown brush channel " + name + "!");
      return;
    }

    this.get(name).setValue(val);
  }

  get(name) {
    return this.nameMap.get(name);
  }

  has(name_or_ch) {
    if (typeof name_or_ch === "object") {
      return this.nameMap.get(name_or_ch.name) === name_or_ch;
    } else {
      return nameMap.has(name_or_ch);
    }
  }

  ensureTemplate(def) {
    let def2 = {};

    for (let k in def) {
      if (!this.nameMap.has(k)) {
        def2[k] = def[k];
      }
    }

    this.fromTemplate(def2);

    let keys = ["range", "step", "decimalPlaces", "expRate", "stepIsRelative", "baseUnit", "displayUnit"];

    for (let k in def) {
      let v = def[k];
      let ch = this.get(k);

      if (typeof v === "object") {
        if (v.uiName) {
          ch.uiName = v.uiName;
        }

        if (v.unit) {
          ch.prop.baseUnit = ch.prop.displayUnit = v.unit;
        }

        if (v.range) {
          ch.prop.range = v.range;
        }

        if (v.min) {
          ch.prop.range[0] = v.min;
        }

        if (v.max) {
          ch.prop.range[1] = v.min;
        }

        for (let key of keys) {
          if (key in v) {
            ch.prop[key] = v[key];
          }
        }
      }
    }
  }

  /**
   * set up channels from a template
   *
   * example:
   *
   * {
   *   strength: 0.5,
   *   radius  : {value : 25.0, range : [0, 15]}}
   * */
  fromTemplate(def) {
    for (let k in def) {
      let v = def[k];

      if (typeof v === "number" || (Array.isArray(v) || v instanceof Vector3 || v instanceof Vector4)) {
        v = {value: v};
      }

      let cls = FloatProperty;

      if (Array.isArray(v.value)) {
        cls = v.value.length === 3 ? Vec3Property : Vec4Property;
      }

      let ch = this.ensure(k, cls);

      if (v.value !== undefined) {
        ch.setValue(v.value);
      }

      if ("uiName" in v) {
        ch.uiName = v.uiName;
      }

      if ("range" in v) {
        ch.range(v.range[0], v.range[1]);
      }
      if ("min" in v) {
        ch.min(v.min);
      }
      if ("max" in v) {
        ch.max(v.max);
      }
      if ("expRate" in v) {
        ch.expRate(v.expRate);
      }
      if ("step" in v) {
        ch.step(v.step);
      }

      if (v.penPressure) {
        ch.dynamics.ensure("pressure").enabled = true;
      }
    }
  }

  applyAllDynamics(inputs) {
    for (let ch of this) {
      let val = ch.evaluate(inputs);

      for (let dyn of ch.dynamics) {
        dyn.enabled = false;
      }

      ch.setValue(val);
    }
  }

  loadSTRUCT(reader) {
    reader(this);

    for (let ch of this) {
      this.nameMap.set(ch.name, ch);
    }
  }
}

BrushChannelSet.STRUCT = `
BrushChannelSet {
  this  :  array(BrushChannel);
}
`;
simple.DataModel.register(BrushChannelSet);

export const StrokeModes = {
  DAB       : 0,
  SMOOTH_DAB: 1,
  SMOOTH    : 2
};

export class Brush extends Preset {
  constructor() {
    super();

    this.channels = new BrushChannelSet();
    this.channels.fromTemplate(BrushChannelSet.defaultTemplate());

    //this.color = new Vector4([0.2, 0.0, 0.6, 1.0]); //c
    this.color = new Vector4([0.6, 0.0, 0.2, 1.0]); //m
    //this.color = new Vector4([1.0, 1.0, 0.0, 1.0]); //y
    //this.color = new Vector4([1.0, 1.0, 0.0, 1.0]);

    this.strokeMode = StrokeModes.SMOOTH_DAB;
    this.mixMode = BrushMixModes.PIGMENT;
    this.tool = BrushTools.DRAW;

    this.mask = 0; //brush alpha, 0 means none

    this.flag = 0;

    this.pigments = undefined;
    this.pigment = undefined;
  }

  get continuous() {
    return this.strokeMode === StrokeModes.SMOOTH_DAB || this.strokeMode === StrokeModes.SMOOTH;
  }

  static presetDefine() {
    return {
      typeName: "brush",
      uiName  : "Brush",
      flag    : 0,
      icon    : Icons.BRUSH_DRAW
    }
  }

  static defineAPI(api, st) {
    super.defineAPI(api, st);

    let def = st.enum("mask", "mask", BrushAlpha.prop, "Brush Alpha");
    def.data = BrushAlpha.prop;

    st.enum("strokeMode", "strokeMode", StrokeModes, "Stroke Mode");

    st.float("hue", "hue", "Hue").noUnits().range(-1.0, 1.0);

    st.color4("color", "color", "Color");
    st.float("radius", "radius", "Radius").noUnits().range(1, 512).step(0.5);
    st.float("strength", "strength", "Strength").noUnits().range(0.0, 1.0);
    st.float("spacing", "spacing", "Spacing").noUnits().range(0.005, 4.0);
    st.struct("pigment", "pigment", "Pigment", api.mapStruct(Pigment, true));
    st.float("scatter", "scatter", "Scatter").range(0.0, 10.0).noUnits();
    st.float("smear", "smear", "smear", "Smear color pickup factor").range(0.0, 1.0).noUnits();
    st.float("smearLen", "smearLen", "Smear Len", "Smear Length").range(0.0, 50.0).noUnits();
    st.float("smearRate", "smearRate", "Rate", "Smear Rate").range(0.0, 50.0).noUnits();

    //st.struct("channels", "channelSet", "Channels", api.mapStruct(BrushChannelSet, true));
    st.list("channels", "channels", {
      get(api, list, key) {
        return list.get(key);
      },

      getKey(api, list, obj) {
        return key.name;
      },

      getStruct(api, list, key) {
        return api.mapStruct(BrushChannel, true);
      },

      getLength(api, list) {
        return list.nameMap.size;
      }
    });

    st.flags("flag", "flag", BrushFlags, "Flags");

    st.enum("mixMode", "mixMode", BrushMixModes, "Mode");

    st.enum("tool", "tool", BrushTools, "Tool")
      .icons({
        DRAW : Icons.BRUSH_DRAW,
        ERASE: Icons.BRUSH_ERASE,
        SMEAR: Icons.BRUSH_SMEAR
      });

    st.list("pigments", "pigments", {
      get(api, list, key) {
        return list[key];
      },
      getKey(api, list, obj) {
        return list.indexOf(obj);
      },
      getStruct(api, list, key) {
        return api.mapStruct(Pigment);
      },
      getIter(api, list) {
        return list[Symbol.iterator]();
      }
    })
  }

  addExtraStructs(istruct) {
    for (let cls of CurveConstructors) {
      istruct.registerGraph(nstructjs.manager, cls);
    }
    istruct.registerGraph(nstructjs.manager, Curve1D);

    istruct.register(FloatProperty)
    istruct.register(IntProperty);
    istruct.register(EnumProperty);
    istruct.register(FlagProperty);
    istruct.registerGraph(nstructjs.manager, Vec2Property);
    istruct.registerGraph(nstructjs.manager, Vec3Property);
    istruct.registerGraph(nstructjs.manager, Vec4Property);
    istruct.register(StringProperty);
    istruct.register(ListProperty);
  }

  asApplied(inputs) {
    let ret = this.copy();

    ret.channels.applyAllDynamics(inputs);

    return ret;
  }

  copyTo(b) {
    super.copyTo(b);

    b.channels = this.channels.copy();

    b.color.load(this.color);
    b.smear = this.smear;
    b.smearLen = this.smearLen;
    b.smearRate = this.smearRate;
    b.strength = this.strength;
    b.radius = this.radius;
    b.scatter = this.scatter;
    b.spacing = this.spacing;
    b.tool = this.tool;
    b.pigments = this.pigments;
    b.mixMode = this.mixMode;
    b.strokeMode = this.strokeMode;
    b.mask = this.mask;

    b.flag = this.flag;
  }

  getMixFunc() {
    switch (this.mixMode) {
      case BrushMixModes.PIGMENT:
        return Pigment.mixRGB;
      case BrushMixModes.SIMPLE:
        return Pigment.mixRGB_Simple;
      case BrushMixModes.CMYK_HSV:
        return Pigment.mixRGB_CMYK;
      case BrushMixModes.HSV:
        return Pigment.mixRGB_HSV;
    }
  }

  copy() {
    let ret = new Brush();
    this.copyTo(ret);
    return ret;
  }

  hash(digest = brush_hash.reset()) {
    for (let ch of this.channels) {
      ch.hash(digest);
    }

    digest.add(this.mask);
    digest.add(this.flag);
    digest.add(this.mixMode);
    digest.add(this.strokeMode);

    return digest.get();
  }

  loadSTRUCT(reader) {
    super.loadSTRUCT(reader);
    reader(this);

    this.channels.ensureTemplate(BrushChannelSet.defaultTemplate());
  }
}

Brush.STRUCT = nstructjs.inherit(Brush, Preset, "Brush") + `
  radius     : float;
  strength   : float;
  color      : vec4;
  tool       : int;
  spacing    : float;
  flag       : int;
  mixMode    : int;
  scatter    : float;
  smear      : float;
  smearLen   : float;
  smearRate  : float;
  channels   : BrushChannelSet;
  mask       : int;
  strokeMode : int;
}
`;
Preset.register(Brush);
simple.DataModel.register(Brush);

/* add brush channels as getters/settings to Brush */
function makeBrushProp(k) {
  Object.defineProperty(Brush.prototype, k, {
    get() {
      return this.channels.getValue(k);
    },

    set(v) {
      this.channels.setValue(k, v, false);
    }
  });
}

for (let k in BrushChannelSet.defaultTemplate()) {
  makeBrushProp(k);
}
