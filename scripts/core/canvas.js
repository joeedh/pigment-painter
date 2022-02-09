import {
  simple, util, nstructjs, math, UIBase, Vector3, Vector4, Curve1D, FloatProperty, Vec3Property, Vec4Property
} from '../path.ux/scripts/pathux.js';
import './colormodel.js';
import {getLUTImage, Pigment, PigmentSet, USE_LUT_IMAGE} from './colormodel.js';
import {Icons} from './icon_enum.js';
import {hsv_to_rgb} from './color.js';
import {ImageSlots, makeSharedImageData, wasmModule, wasmReady} from '../../wasm/wasm_api.js';

let soffs = new Array(2048);

export function getSearchOffs(n, falloffKey, falloffCB) {
  let key = n;

  if (falloffKey) {
    key = "" + n + ":" + falloffKey;
  }

  if (soffs[key]) {
    return soffs[key];
  }

  console.warn("Creating search offs of radius", n);

  let list = soffs[key] = [];

  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      let w = Math.sqrt(i*i + j*j);

      if (w >= n) {
        continue;
      }

      let ni = w !== 0.0 ? i/w : 0.0;
      let nj = w !== 0.0 ? j/w : 0.0;

      w /= n;

      w = 1.0 - w;

      if (falloffCB) {
        w = falloffCB(w);
      }

      list.push([i, j, w, ni, nj]);
    }
  }

  return list;
}

export class DotSample {
  constructor(x, y, dx, dy, t, pressure) {
    this.x = x;
    this.y = y;
    this.dx = dx;
    this.dy = dy;
    this.t = t;
    this.pressure = pressure;
  }

  copyTo(b) {
    b.x = this.x;
    b.y = this.y;
    b.dx = this.dx;
    b.dy = this.dy;
    b.t = this.t;
    b.pressure = this.pressure;
  }

  copy() {
    let ret = new DotSample();
    this.copyTo(ret);
    return ret;
  }
}

DotSample.STRUCT = `
DotSample {
  x           : float;
  y           : float;
  dx          : float;
  dy          : float;
  t           : float;
  pressure    : float;
}
`;
nstructjs.register(DotSample);

let brush_hash = new util.HashDigest();

export const BrushTools = {
  DRAW : 0,
  SMEAR: 1,
  ERASE: 2
};

export const CanvasCommands = {
  SETBRUSH   : 0,
  DOT        : 1,
  BEGINSTROKE: 2
};
export const CommandFormat = {
  [CanvasCommands.SETBRUSH]   : {args: 9},
  [CanvasCommands.DOT]        : {args: 6},
  [CanvasCommands.BEGINSTROKE]: {args: 0},
}

let {SETBRUSH, DOT, BEGINSTROKE} = CanvasCommands;

export const BrushFlags = {
  ACCUMULATE: 1
};

export const BrushMixModes = {
  PIGMENT : 0,
  SIMPLE  : 1,
  CMYK_HSV: 2,
  HSV     : 3,
};

export const DynamicFlags = {
  ENABLED : 1<<0
};

export class InputDynamic {
  constructor(name) {
    this.curve = new Curve1D();
    this.name = "" + name;

    this.flag = 0;
    this.inputMin = 0.0;
    this.inputMax = 1.0;
    this.outputMin = 0.0;
    this.outputMax = 1.0;
  }

  evaluate(f) {
    if (!this.enabled) {
        return f;
    }

    f = Math.min(Math.max(f, this.inputMin), this.inputMax);
    f = (f - this.inputMin) / (this.inputMax - this.inputMin);

    f = this.curve.evaluate(f);

    f = f*(this.outputMax - this.outputMin) + this.outputMin;
    return f;
  }

  static defineAPI(api, st) {
    st.string("name", "name", "Name").readOnly();
    st.curve1d("curve", "curve", "Curve");
    st.flags("flag", "flag", DynamicFlags);

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

  copyTo(b) {
    b.name = this.name;
    b.curve.load(this.curve);
    b.flag = this.flag;
    b.inputMin = this.inputMin;
    b.inputMax = this.inputMax;
    b.outputMin = this.outputMin;
    b.outputMax = this.outputMax;
  }

  copy() {
    let ret = new InputDynamic();
    this.copyTo(ret);
    return ret;
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
}
`;
nstructjs.register(InputDynamic);
simple.DataModel.register(InputDynamic);

export class BrushDynamics {
  constructor() {
    this.mappings = new Map();
  }

  static defineAPI(api, st) {
    st.list("mappings", "mappings", {
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
    return st;
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

  get value() {
    return this.getValue();
  }

  static defineAPI(api, st) {
    st.string("name", "name", "Name").readOnly();
    st.string("uiName", "uiName", "Display Name").readOnly();
    st.float("value", "value", "Value");
    st.struct("dynamics", "dynamics", "Dynamics", api.mapStruct(BrushDynamics, true));
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

    return f;
  }

  loadSTRUCT(reader) {
    reader(this);

    this.propClass = this.prop.constructor;

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
      strength : {value: 0.5, range: [0.0, 1.0], penPressure : true},
      radius   : {value: 25.0, range: [0.001, 5000.0]},
      scatter  : {value: 0.0, range: [0.0, 100.0]},
      smear    : {value: 0.2, range: [0.0, 5.0]},
      smearLen : {value: 6.0, range: [0.0, 50.0]},
      smearRate: 0.2,
      spacing  : {value: 0.0, range: [0.0, 5.0]},
      color    : new Vector4([0.0, 0.0, 0.0, 1.0]),
    }
  }

  copy() {
    let ret = new BrushChannelSet();

    for (let ch of this) {
      ret.push(ch.copy());
    }

    return ret;
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

    this.get(name).evaluate(inputs);
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

    return this.fromTemplate(def2);
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
  fromTemplate(def ) {
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

  static defineAPI(api, st) {
    st.list("channels", "channels", {
      get(api, list, key) {
        return list.nameMap.get(key);
      },

      getKey(api, list, obj) {
        return key.name;
      },

      getStruct(api, list, key) {
        return api.mapStruct(BrushChannel, true);
      }
    });
  }
}

BrushChannelSet.STRUCT = `
BrushChannelSet {
  this  :  array(BrushChannel);
}
`;
simple.DataModel.register(BrushChannelSet);

export class Brush {
  constructor() {
    this.channels = new BrushChannelSet();
    this.channels.fromTemplate(BrushChannelSet.defaultTemplate());

    //this.color = new Vector4([0.2, 0.0, 0.6, 1.0]); //c
    this.color = new Vector4([0.6, 0.0, 0.2, 1.0]); //m
    //this.color = new Vector4([1.0, 1.0, 0.0, 1.0]); //y
    //this.color = new Vector4([1.0, 1.0, 0.0, 1.0]);

    this.mixMode = BrushMixModes.PIGMENT;
    this.tool = BrushTools.DRAW;

    this.smearLen = 0.5;
    this.smearRate = 1.0;

    this.strength = 0.5;
    this.radius = 15;
    this.scatter = 1.0;
    this.smear = 0.2;
    this.spacing = 0.25;
    this.flag = 0;

    this.pigments = undefined;
    this.pigment = undefined;
  }

  asApplied(inputs) {
    let ret = this.copy();

    ret.channels.applyAllDynamics(inputs);

    return ret;
  }

  static defineAPI(api, st) {
    st.color4("color", "color", "Color");
    st.float("radius", "radius", "Radius").noUnits().range(1, 512);
    st.float("strength", "strength", "Strength").noUnits().range(0.0, 1.0);
    st.float("spacing", "spacing", "Spacing").noUnits().range(0.005, 4.0);
    st.struct("pigment", "pigment", "Pigment", api.mapStruct(Pigment, true));
    st.float("scatter", "scatter", "Scatter").range(0.0, 10.0).noUnits();
    st.float("smear", "smear", "smear", "Smear color pickup factor").range(0.0, 1.0).noUnits();
    st.float("smearLen", "smearLen", "Smear Len", "Smear Length").range(0.0, 50.0).noUnits();
    st.float("smearRate", "smearRate", "Smear Rate", "Smear Rate").range(0.0, 50.0).noUnits();

    st.struct("channels", "channels", "Channels", api.mapStruct(BrushChannelSet, true));

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

  copyTo(b) {
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
    digest.add(this.color);
    digest.add(this.strength);
    digest.add(this.radius);
    digest.add(this.spacing);
    digest.add(this.mixMode);
    digest.add(this.scatter);
    digest.add(this.smear);
    digest.add(this.smearLen);
    digest.add(this.smearRate);

    return digest.get();
  }

  loadSTRUCT(reader) {
    reader(this);

    this.channels.ensureTemplate(BrushChannelSet.defaultTemplate());
  }
}

Brush.STRUCT = `
Brush {
  radius   : float;
  strength : float;
  color    : vec4;
  tool     : int;
  spacing  : float;
  flag     : int;
  mixMode  : int;
  scatter  : float;
  smear    : float;
  smearLen : float;
  smearRate: float;
  channels : BrushChannelSet;
}
`;
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

let white = new Vector4([1, 1, 1, 1]);

//origdata
const OR = 0, OG = 1, OB = 2, OA = 3, OID = 4, OMASK = 5, OTOT = 6;

let execVecTemps = util.cachering.fromConstructor(Vector4, 512);
let execArrTemps = new util.cachering(() => [0, 0], 512);

export class Canvas {
  constructor(dimen = 700) {
    this.image = undefined;
    this.origImage = undefined;
    this.tempImage = undefined;
    this.dimen = undefined;

    this.haveWasmImage = false;

    this.smearPickup = new Vector4();
    this.smearPickupFirst = true;

    this.pigments = new PigmentSet();
    for (let i = 0; i < 4; i++) {
      this.pigments.push(new Pigment());
    }

    /*
      Arylide__Hansa__yellow: 1
      Biz_vanadate_yellow: 17
      Bone_black: 0
      Cadmium_orange: 3
      Diarylide_yellow: 2
      PH_G_and_Biz_Y_mix: 20
      Phathalo_blue_green_shade_tints: 14
      Phathlo_Green_blue_shade: 15
      Phathlo_green_yellow_shade: 16
      Phthalo_B__GS__and_Phthalo_G__BS_: 21
      Phthalo_blue_red_shade: 13
      Pyrrole_orange: 4
      Quin_Mag_and_Dioxazine_P: 22
      Titanium_White: 23
      dioxazine_purple_tints: 9
      k_cadmium_red: 5
      k_cerulean_blue: 12
      k_cobalt_blue: 11
      k_pyrrole_red: 6
      k_quinacridone_magenta: 8
      k_quinacridone_red: 7
      k_ultramarine_blue: 10
    */
    this.pigments[0].pigment = 14;
    this.pigments[1].pigment = 8;
    this.pigments[2].pigment = 1;
    this.pigments[3].pigment = 23;

    this.stroke_id = 0;

    this.activeBrush = BrushTools.DRAW;

    this.slots = new Array();

    this._last_brush_hash = undefined;
    this.commands = [];

    this.reset(dimen);
    this.genImage();
  }

  get brush() {
    return this.getBrush(this.activeBrush);
  }

  set brush(v) {
    //ensure brush in slot exists
    this.getBrush(this.activeBrush);

    v.pigments = this.pigments;
    v.pigment = this.pigments[0];

    this.slots[this.activeBrush] = v;
  }

  static defineAPI(api, st) {
    st.struct("brush", "brush", "Brush", api.mapStruct(Brush, true));

    st.enum("activeBrush", "activeBrush", BrushTools, "Tool")
      .icons({
        DRAW : Icons.BRUSH_DRAW,
        ERASE: Icons.BRUSH_ERASE,
        SMEAR: Icons.BRUSH_SMEAR
      });
  }

  getBrush(slot = this.activeBrush) {
    while (this.slots.length <= slot) {
      let b = new Brush();

      b.pigments = this.pigments;
      b.pigment = this.pigments[0];

      b.tool = this.slots.length;
      this.slots.push(b);
    }

    return this.slots[slot];
  }

  genImage() {
    //pattern
    let dimen = this.dimen;
    let idata = this.image.data;

    for (let i = 0; i < dimen*dimen; i++) {
      let ix = i%dimen, iy = ~~(i/dimen);
      let x = ix/dimen - 0.5, y = iy/dimen - 0.5;

      let len = x*x + y*y;

      //let f = Math.fract(Math.atan2(y, x) + len*5.0);
      let f = Math.cos(x*5.0)*0.5 + 0.5;

      let h = f;
      let s = Math.tent(f*2.0);
      let v = (1.0 - s)*0.5 + 0.5;

      let rgb = hsv_to_rgb(h, s, v, false);

      let idx = i*4;
      idata[idx] = rgb[0]*255;
      idata[idx + 1] = rgb[1]*255;
      idata[idx + 2] = rgb[2]*255;
      idata[idx + 3] = 255;
    }
  }

  pushCommand() {
    let commands = this.commands;

    commands.push(arguments[0]);
    commands.push(arguments.length - 1);

    for (let i = 1; i < arguments.length; i++) {
      commands.push(arguments[i]);
    }
  }

  pushSetBrush(brush = this.brush) {
    this.pushCommand(SETBRUSH, brush.color[0], brush.color[1], brush.color[2], brush.color[3],
      brush.strength, brush.radius, brush.spacing, brush.tool, brush.mixMode);
  }

  beginStroke() {
    if (wasmReady()) {
      wasmModule.asm.onStrokeStart();
    }

    this.smearPickup.zero();
    this.smearPickupFirst = true;
    this.pushCommand(BEGINSTROKE);
    this.stroke_id++;
  }

  getOrigPixel(x, y, orig = this.origImage) {
    let idx = y*this.dimen + x;

    let oi = idx*OTOT;

    if (orig[oi + OID] !== this.stroke_id) {
      let mul = 1.0/255.0;
      let idata = this.image.data;

      orig[oi + OID] = this.stroke_id;

      idx *= 4;

      orig[oi + OMASK] = 0.0;

      orig[oi + OR] = idata[idx + 0]*mul;
      orig[oi + OG] = idata[idx + 1]*mul;
      orig[oi + OB] = idata[idx + 2]*mul;
      orig[oi + OA] = idata[idx + 3]*mul;
    }

    return oi;
  }

  * execDot(ds) {
    let brush = this.brush;
    let hash = brush.hash()

    if (hash !== this._last_brush_hash) {
      this._last_brush_hash = hash;
      this.pushSetBrush();
    }

    this.pushCommand(DOT, ds.x, ds.y, ds.dx, ds.dy, ds.t, ds.pressure);

    this.execDotIntern(ds, brush);
  }

  execDotSmear(ds, brush) {
    let {dx, dy, t, pressure} = ds;
    let x1 = ds.x, y1 = ds.y;

    let dpi = UIBase.getDPI();

    let mixRGB = brush.getMixFunc();

    //update orig data every dab
    this.stroke_id++;

    x1 += (Math.random() - 0.5)*4.0;
    y1 += (Math.random() - 0.5)*4.0;

    let radius = Math.max(~~(brush.radius*dpi), 1.0);
    let dimen = this.dimen;
    let idata = this.image.data;

    let sradius = radius*brush.spacing*2.0;
    sradius = Math.max(sradius, 1.0);

    let c1 = new Vector4();
    let c2 = new Vector4();

    let w1 = (pressure*brush.strength)**2;

    let ps = brush.pigments;

    if (brush.mixMode === BrushMixModes.PIGMENT) {
      for (let p of ps) {
        p.checkTables();
      }

      ps.checkLUT();
    }

    //normalize
    let dlen = Math.sqrt(dx*dx + dy*dy);
    dlen = dlen !== 0.0 ? 1.0/dlen : 0.0;

    //dlen *= 1.0 + w1*2.0;

    let nx = dx*dlen;
    let ny = dy*dlen;

    dx = -nx*sradius;
    dy = -ny*sradius;

    let brushcolor = brush.tool === BrushTools.ERASE ? white : brush.color;
    let colors = [0, 0];
    let ws = [0, 0];
    let offs = getSearchOffs(1);
    let cs = new Array(offs.length);

    let odata = this.origImage;
    const scatter = brush.scatter, smear = brush.smear;
    let smearPickup = this.smearPickup;
    let avg = new Vector4();
    let avgtot = 0.0;

    for (let off of getSearchOffs(radius)) {
      let nx2 = off[3], ny2 = off[4];

      let x = ~~(x1 + off[0]);
      let y = ~~(y1 + off[1]);

      if (x < 0 || y < 0 || x >= dimen || y >= dimen) {
        continue;
      }

      let w = off[2];
      if (w < 0.25) {
        w *= 4.0;
        w = w*w*(3.0 - 2.0*w);
      } else {
        w = 1.0;
      }

      //w = 1.0;

      //w = Math.min(Math.max(w, 0.0), 1.0);

      let det = -(nx*ny2 - ny*nx2)*sradius*w*0.25;
      //let sdet = Math.sign(det);
      //det = Math.abs(det);
      //det = det*det*(3.0 - 2.0*det);
      //det *= sdet;

      w *= w1;

      if (isNaN(det)) {
        throw new Error("nan!");
      }

      let dx2 = dx;
      let dy2 = dy;

      dx2 += -ny*det;
      dy2 += nx*det;

      let rfac = sradius*brush.scatter;
      dx2 += (Math.random() - 0.5)*rfac;
      dy2 += (Math.random() - 0.5)*rfac;

      let x2 = ~~(x1 + dx2 + off[0]);
      let y2 = ~~(y1 + dy2 + off[1]);

      x2 = Math.min(Math.max(x2, 0), dimen - 1);
      y2 = Math.min(Math.max(y2, 0), dimen - 1);

      let idx = (y*dimen + x)*4;

      c1[0] = idata[idx + 0]/255.0;
      c1[1] = idata[idx + 1]/255.0;
      c1[2] = idata[idx + 2]/255.0;
      c1[3] = idata[idx + 3]/255.0;

      let oi = this.getOrigPixel(x2, y2);

      c2[0] = odata[oi + 0];
      c2[1] = odata[oi + 1];
      c2[2] = odata[oi + 2];
      c2[3] = odata[oi + 3];

      if (this.smearPickupFirst) {
        this.smearPickupFirst = false;
        this.smearPickup.load(c2);
      }

      if (smear > 0.0) {
        ws[0] = 1.0 - smear;
        ws[1] = smear;
        colors[0] = c2;
        colors[1] = smearPickup;

        c2.load(mixRGB(ps, colors, ws));
      }

      avg.add(c2);
      avgtot++;

      odata[oi + OMASK] = Math.max(odata[oi + OMASK] + w);

      ws[0] = 1.0 - w;
      ws[1] = w;

      colors[0] = c1;
      colors[1] = c2;

      let c3 = mixRGB(ps, colors, ws);

      //let c3 = c2.interp(c1, 1.0 - w);

      //make sure current pixel's original data isn't overwritten
      this.getOrigPixel(x, y);

      idata[idx + 0] = c3[0]*255;
      idata[idx + 1] = c3[1]*255;
      idata[idx + 2] = c3[2]*255;
      idata[idx + 3] = c3[3]*255;
    }

    if (smear > 0.0 && avgtot > 0) {
      let w = ((1.0 - smear)**2)*0.8;

      avg.mulScalar(1.0/avgtot);

      colors[0] = smearPickup;
      colors[1] = avg;

      ws[0] = 1.0 - w;
      ws[1] = w;

      smearPickup.load(mixRGB(ps, colors, ws));
    }
  }

  execDotNoAccum(ds, brush) {
    let {dx, dy, t, pressure} = ds;
    let x1 = ds.x, y1 = ds.y;

    pressure *= pressure;

    let dpi = UIBase.getDPI();

    let radius = Math.max(~~(brush.radius*dpi), 1.0);
    let dimen = this.dimen;
    let idata = this.image.data;
    let odata = this.origImage;
    let tdata = this.tempImage;
    const stroke_id = this.stroke_id;

    let c1 = new Vector4();
    let c2 = new Vector4();

    let w1 = brush.strength*pressure;
    let alphaw = w1*w1;

    let ps = brush.pigments;

    if (brush.mixMode === BrushMixModes.PIGMENT) {
      for (let p of ps) {
        p.checkTables();
      }

      ps.checkLUT();
    }

    let mixRGB = brush.getMixFunc();

    let brushcolor = brush.tool === BrushTools.ERASE ? white : brush.color;
    let colors = [0, 0];
    let ws = [0, 0];

    for (let off of getSearchOffs(radius)) {
      let x = ~~(x1 + off[0]);
      let y = ~~(y1 + off[1]);

      if (x < 0 || y < 0 || x >= dimen || y >= dimen) {
        continue;
      }

      let w = off[2];
      w = w*w;
      //w = w*w*(3.0 - 2.0*w);
      //w = w*w*(3.0 - 2.0*w);

      let idx = (y*dimen + x)*4;

      //abuse original image to store accumulation buffer

      let oi = this.getOrigPixel(x, y);

      c1[0] = odata[oi];
      c1[1] = odata[oi + 1];
      c1[2] = odata[oi + 2];
      c1[3] = odata[oi + 3];

      if (tdata[oi + OID] !== stroke_id) {
        tdata[oi + OID] = stroke_id;
        tdata[oi] = tdata[oi + 1] = tdata[oi + 2];
        tdata[oi + 3] = 1.0;
        tdata[oi + OMASK] = 0.0;
      }

      tdata[oi + 0] += (brushcolor[0] - tdata[oi + 0])*w;
      tdata[oi + 1] += (brushcolor[1] - tdata[oi + 1])*w;
      tdata[oi + 2] += (brushcolor[2] - tdata[oi + 2])*w;
      tdata[oi + OMASK] = Math.min(tdata[oi + OMASK] + w, 1.0);

      c2[0] = tdata[oi];
      c2[1] = tdata[oi + 1];
      c2[2] = tdata[oi + 2];
      c2[3] = tdata[oi + 3];

      colors[0] = c1;
      colors[1] = brushcolor;

      w = tdata[oi + OMASK]*w1;

      ws[0] = 1.0 - w;
      ws[1] = w;

      c2.load(mixRGB(ps, colors, ws));

      //c2.interp(c1, 1.0 - alphaw);

      idata[idx + 0] = c2[0]*255;
      idata[idx + 1] = c2[1]*255;
      idata[idx + 2] = c2[2]*255;
      idata[idx + 3] = c2[3]*255;
    }
  }

  execDotInternWasm(ds, brush) {
    const dpi = UIBase.getDPI();

    wasmModule.asm.setBrush(
      brush.color[0],
      brush.color[1],
      brush.color[2],
      brush.color[3],
      brush.radius*dpi,
      brush.strength,
      brush.spacing,
      brush.scatter,
      brush.smear,
      brush.smearLen,
      brush.smearRate,
      brush.flag,
      brush.tool);

    wasmModule.asm.execDot(ds.x, ds.y, ds.dx, ds.dy, ds.t, ds.pressure);
  }

  execDotIntern(ds, brush) {
    if (wasmReady()) {
      this.checkWasmImage();
      this.execDotInternWasm(ds, brush);
      return;
    }

    let {dx, dy, t, pressure} = ds;
    let x1 = ds.x, y1 = ds.y;

    pressure *= pressure;

    if (brush.tool === BrushTools.SMEAR) {
      this.execDotSmear(ds, brush);
      return;
    }

    if (!(brush.flag & BrushFlags.ACCUMULATE)) {
      this.execDotNoAccum(ds, brush);
      return;
    }

    let dpi = UIBase.getDPI();

    let radius = Math.max(~~(brush.radius*dpi), 1.0);
    let dimen = this.dimen;
    let idata = this.image.data;

    let c1 = execVecTemps.next().zero();
    let c2 = execVecTemps.next().zero();

    let w1 = (pressure*brush.strength)**2;
    let alphaw = w1*w1;

    let ps = brush.pigments;

    if (brush.mixMode === BrushMixModes.PIGMENT) {
      for (let p of ps) {
        p.checkTables();
      }

      ps.checkLUT();
    }

    let mixRGB = brush.getMixFunc();

    let brushcolor = brush.tool === BrushTools.ERASE ? white : brush.color;
    let colors = execArrTemps.next();
    let ws = execArrTemps.next();

    function weightcb(w) {
      w = w*w*(3.0 - 2.0*w);
      w = w*w*(3.0 - 2.0*w);

      return w;
    }

    for (let off of getSearchOffs(radius, "draw", weightcb)) {
      let x = ~~(x1 + off[0]);
      let y = ~~(y1 + off[1]);

      if (x < 0 || y < 0 || x >= dimen || y >= dimen) {
        continue;
      }

      let w = off[2]*w1;

      let idx = (y*dimen + x)*4;

      ws[0] = 1.0 - w;
      ws[1] = w;

      c1[0] = idata[idx]/255.0;
      c1[1] = idata[idx + 1]/255.0;
      c1[2] = idata[idx + 2]/255.0;
      c1[3] = idata[idx + 3]/255.0;

      colors[0] = c1;
      colors[1] = brushcolor;

      c2 = mixRGB(ps, colors, ws);

      //c2.interp(c1, 1.0 - alphaw);

      idata[idx + 0] = c2[0]*255;
      idata[idx + 1] = c2[1]*255;
      idata[idx + 2] = c2[2]*255;
      idata[idx + 3] = c2[3]*255;
    }
  }

  checkWasmImage() {
    if (!this.haveWasmImage && wasmReady()) {
      console.log("converting to wasm image. . .");

      let image1 = this.image;
      let image2 = makeSharedImageData(image1.width, image1.height);

      image2.data.set(image1.data);
      this.image = image2;

      if (this.unifiedLut) {
        let dimen;

        if (this.pigments.lut) {
          dimen = this.pigments.lut.dimen;
        } else {
          dimen = 256;
        }

        let unifiedLut = makeSharedImageData(this.unifiedLut.width, this.unifiedLut.height, ImageSlots.LUT, dimen);
        unifiedLut.data.set(this.unifiedLut.data);

        this.unifiedLut = unifiedLut;
      }

      this.haveWasmImage = true;
    }
  }

  makeImage(width, height) {
    if (wasmReady()) {
      this.haveWasmImage = true;
      return makeSharedImageData(width, height);
    } else {
      this.haveWasmImage = false;
      return new ImageData(width, height);
    }
  }

  reset(dimen) {
    if (dimen !== undefined) {
      this.dimen = dimen;
      this.image = this.makeImage(dimen, dimen);
      this.origImage = new Float32Array(dimen*dimen*OTOT);
      this.tempImage = new Float32Array(dimen*dimen*OTOT);
    }

    let idata = this.image.data;
    for (let i = 0; i < idata.length; i++) {
      idata[i] = 255;
    }

    //this.brush = new Brush();

    this._last_brush_hash = undefined;
    this.commands.length = 0;
  }

  reexec() {
    let idata = this.image.data;
    for (let i = 0; i < idata.length; i++) {
      idata[i] = 255;
    }

    let brush = this.brush.copy();

    let cmds = this.commands;
    let _i = 0;

    for (let i = 0; i < cmds.length; i += cmds[i + 1] + 2) {
      let cmd = cmds[i], totarg = cmds[i + 1];
      let j = i + 2;

      switch (cmd) {
        case SETBRUSH:
          brush.color[0] = cmds[j++];
          brush.color[1] = cmds[j++];
          brush.color[2] = cmds[j++];
          brush.color[3] = cmds[j++];
          brush.strength = cmds[j++];
          brush.radius = cmds[j++];
          brush.spacing = cmds[j++];
          break;
        case DOT: {
          let x = cmds[j++];
          let y = cmds[j++];
          let dx = cmds[j++];
          let dy = cmds[j++];
          let t = cmds[j++];

          this.execDotIntern(x, y, dx, dy, t, brush);
          break;
        }
      }
    }
  }

  loadLutImage() {
    getLUTImage().then((res) => {
      if (wasmReady()) {
        let dimen;

        if (this.pigments.lut) {
          dimen = this.pigments.lut.dimen;
        } else {
          dimen = 256;
        }

        this.unifiedLut = makeSharedImageData(res.image.width, res.image.height, ImageSlots.LUT, dimen);
        this.unifiedLut.data.set(res.image.data);
      } else {
        this.unifiedLut = res.image;
      }

      console.log("loaded image lookup data", res);
      this.pigments.loadLUTImage(res.image, res.dimen);
    });
  }

  loadSTRUCT(reader) {
    reader(this);

    this.reset(this.dimen);
    this.genImage();

    for (let b of this.slots) {
      b.pigments = this.pigments;
      b.pigment = b.pigments[0];
    }

    if (USE_LUT_IMAGE) {
      this.loadLutImage();
    }

    /* ensure commands are in right format */

    let cmds = this.commands;
    let cmds2 = [];

    for (let i = 0; i < cmds.length; i += cmds[i + 1] + 2) {
      let cmd = [cmds[i]], totarg = cmds[i + 1] + 1;

      for (let j = 0; j < totarg; j++) {
        cmd.push(cmds[i + 1 + j]);
      }

      cmds2.push(cmd);
    }

    for (let cmd of cmds2) {
      let totarg = CommandFormat[cmd[0]].args + 2;

      while (cmd.length < totarg) {
        cmd.push(0.0);
      }
    }

    this.commands = cmds2.flat();
  }
}

Canvas.STRUCT = `
Canvas {
  dimen       : int; 
  pigments    : PigmentSet;
  slots       : array(Brush);
  activeBrush : int; 
}
`;
simple.DataModel.register(Canvas);
