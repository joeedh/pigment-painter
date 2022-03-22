/*whether to use optimized spectral data
* that doesn't just fit inside the rgb cube,
* but is also optimized to stretch to fill
* it*/
import {Camera} from '../webgl/webgl.js';

export const WIDE_GAMUT = true;

export const USE_LUT_IMAGE = true;
export const LINEAR_LUT = false;
export const WEBGL_PAINTER = true;

export const TRILINEAR_LUT = false;

import {simple, util, nstructjs, math, UIBase, Vector3, Vector4, Matrix4, platform} from '../path.ux/scripts/pathux.js';
import * as color from './color.js';
import {freqToWaveLength, getCie65, waveLengthToFreq} from './cie65.js';
import {linear_to_rgb, sRGBMatrix} from './color.js';

import * as pigment_data_physical from './pigment_data.js';
import * as pigment_data_wide from './pigment_data_wide.js';
import {getSearchOffs, ImageSlots} from './canvas.js';

export const pigment_data = WIDE_GAMUT ? pigment_data_wide : pigment_data_physical;

export const lightWaveLengths = [380, 750];
export const lightFreqRange = [waveLengthToFreq(lightWaveLengths[0]), waveLengthToFreq(lightWaveLengths[1])];

let lutImages = {};

let insideSolver = false;

export function setInsideSolver(val) {
  insideSolver = !!val;
}

let torgbtmp = [0, 0, 0, 0];

export async function getLUTImage() {
  await platform.getPlatformAsync();

  let url = WIDE_GAMUT ? "lut_wide_256.png" : "lut_physical_3_257.png";
  url = platform.platform.resolveURL("assets/" + url);

  let img;

  if (url in lutImages) {
    img = lutImages[url];
  } else {
    img = lutImages[url] = document.createElement("img");
    img.src = url;
  }

  let i = url.length - 1;
  while (i > 1 && url[i - 1] !== "_") {
    i--;
  }

  let dimen = url.slice(i, url.length);
  if (dimen.search(/\./) >= 0) {
    dimen = dimen.slice(0, dimen.search(/\./)).trim();
  }

  if (isNaN(parseFloat(dimen))) {
    console.error("dimen:", dimen);
    throw new Error("could not get tile size from lut name, should be lut_DIMEN.png, e.g. lut_256.png");
  }

  dimen = parseInt(dimen);

  await new Promise((accept, reject) => {
    if (!img.width) {
      img.onload = () => {
        accept();
      }
    } else {
      accept();
    }
  });

  let canvas = document.createElement("canvas");
  let g = canvas.getContext("2d");

  canvas.width = img.width;
  canvas.height = img.height;

  g.drawImage(img, 0, 0);
  let image = g.getImageData(0, 0, canvas.width, canvas.height);

  return {
    image,
    dimen
  };
}

Math.tent = f => 1.0 - Math.abs(Math.fract(f) - 0.5)*2.0;
let mat_temps = util.cachering.fromConstructor(Matrix4, 32);

window.COLOR_SCALE = WIDE_GAMUT ? 1.0 : 1.0;
window.REFL_K1 = 0.030;
window.REFL_K2 = 0.650;

export const START_REFL_K1 = REFL_K1;
export const START_REFL_K2 = REFL_K2;

function g(x, mu, o1, o2) {
  if (x < mu) {
    return Math.exp((-0.5*(x - mu)**2)/o1**2);
  } else {
    return Math.exp((-0.5*(x - mu)**2)/o2**2);
  }
}

import {xhat, yhat, zhat} from './cie10.js';
import {makeSharedImageData, wasmModule, wasmReady} from '../../wasm/wasm_api.js';
import {cubic, icubic} from './bezier.js';
import {WasmPigment} from './wasmPigment.js';

/*
//xyz cie 2 degree chromiticty functions
function xhat(wlen) {
  return 1.056*g(wlen, 599.8, 37.9, 31.0) + 0.362*g(wlen, 442.0, 16.0, 26.7)
    - 0.065*g(wlen, 501.1, 20.4, 26.2);
}

function yhat(wlen) {
  return 0.821*g(wlen, 568.8, 46.9, 40.5) + 0.286*g(wlen, 530.9, 16.3, 31.1);
}

function zhat(wlen) {
  return 1.217*g(wlen, 437.0, 11.8, 36.0) + 0.681*g(wlen, 459.0, 26.0, 13.0);

}

window.xhat = xhat;
window.yhat = yhat;
window.zhat = zhat;

//*/

let wdigest = new util.HashDigest();

let lightWaveLengthMul = 1.0/(lightWaveLengths[1] - lightWaveLengths[0]);

export class PigmentWaveletUNUSED {
  constructor(freq = 300, decay = 300, mag = 300) {
    this.freq = freq;
    this.decay = decay;
    this.mag = mag;
    this.exp = 2.0;
    this.offy = 0.0;

    this.haveLoadedTable = false;

    this._last_update_key = undefined;
    this.useTables = true;

    this.needTableGen = true;
    this.table = new Float64Array(1024);
  }

  static defineAPI(api, st) {
    st.float("freq", "t", "t").expRate(1.5).step(0.5).range(lightWaveLengths[0], lightWaveLengths[1]).noUnits();
    st.float("decay", "decay", "Decay").step(5).range(0.001, lightWaveLengths[1] - lightWaveLengths[0]).noUnits();
    st.float("mag", "mag", "Magnitude").step(5).range(0.001, 50000.0).noUnits();
    st.float("exp", "exp", "Exp").range(0.1, 100.0).noUnits();
    st.float("offy", "offy", "y").range(0.0, 1000).noUnits().step(2.5);
  }

  hash(digest = wdigest.reset()) {
    digest.add(this.freq);
    digest.add(this.decay);
    digest.add(this.mag);
    digest.add(this.exp);
    digest.add(this.offy);

    return digest.get();
  }

  checkTable() {
    if (this.haveLoadedTable) {
      return;
    }

    let hash = this.hash();

    if (hash !== this._last_update_key) {
      this._last_update_key = hash;
      this.needTableGen = true;
    }
  }

  genTable() {
    this.needTableGen = false;
    let tab = this.table;

    for (let i = 0; i < tab.length; i++) {
      let s = i/(tab.length);
      let f = lightWaveLengths[0]*(1.0 - s) + lightWaveLengths[1]*s;

      tab[i] = this._evaluate(f);
    }
  }

  evaluate(f) {
    if (!this.useTables) {
      return this._evaluate(f);
    }

    if (this.needTableGen) {
      this.genTable();
    }

    f = (f - lightWaveLengths[0])*lightWaveLengthMul;
    f = Math.min(Math.max(f, 0.0), 1.0)*0.99999;

    let tab = this.table;
    let t = f*1024;

    let i = Math.floor(t);
    t -= i;

    if (i === 1023) {
      return tab[i];
    } else {
      return tab[i]*(1.0 - t) + tab[i + 1]*t;
    }
  }

  _evaluate(f) {
    const w = this;
    const freq = w.freq;
    const decay = w.decay;
    const mag = w.mag;
    const exp = w.exp;
    const offy = w.offy;

    let t = Math.abs(freq - f)/decay;
    t = Math.exp(-Math.pow(t, exp)*5.0);

    //t = 1.0 - Math.min(t, 1.0);
    //t = t*t*(3.0 - 2.0*t);

    return mag*t + offy;
  }

  loadJSON(json) {
    this.freq = json.freq;
    this.decay = json.decay;
    this.mag = json.mag;
    this.exp = json.exp || 2.0;
    this.offy = json.offy !== undefined ? json.offy : 0.0;

    return this;
  }

  toJSON() {
    return {
      freq : this.freq,
      decay: this.decay,
      mag  : this.mag,
      exp  : this.exp,
      offy : this.offy
    }
  }

  copy() {
    let w = new PigmentWaveletUNUSED();

    w.freq = this.freq;
    w.decay = this.decay;
    w.mag = this.mag;
    w.exp = this.exp;
    w.offy = this.offy;

    return w;
  }
}

PigmentWaveletUNUSED.STRUCT = `
PigmentWavelet {
  freq      : double;
  decay     : double;
  mag       : double;
  exp       : double;
  offy      : double;
}
`;
simple.DataModel.register(PigmentWaveletUNUSED);

let pdigest = new util.HashDigest();
let arrtmp1 = [0];

let mixRGBRets = util.cachering.fromConstructor(Vector4, 512);
let toRGBRets = util.cachering.fromConstructor(Vector4, 512);

let arrtemps = new Array(512);

function getTempArray(n) {
  if (arrtemps[n]) {
    return arrtemps[n].next();
  }

  arrtemps[n] = new util.cachering(() => new Array(n), 32);
  return arrtemps[n].next();
}

//note that ITOT must be same as KTOT
export const IA = 0, IB = 1, IC = 2, ISUM = 3, ITOT = 4;

//ktmp is used by integration table
export const KA = 0, KDA = 1, KFREQ = 2, KTMP = 3, KTOT = 4;

export class Pigment {
  constructor() {
    this.useWavelets = false;
    this.pigmentSet = undefined;
    this.updateGen = 0;

    this.wasm = undefined;

    this.name = "Pigment";

    this.errorLimit = 1.0;
    this.solveFac = 0.5;
    this.origHermite = true;

    this.randfac = 1.0;
    this.pigment = 0; //see pigment_data.js

    this._last_pigment = 0;
    this._last_int_key = undefined;

    this.useHermite = false;

    this.k_hermite = [];
    this.s_hermite = [];
    this.ik_hermite = [];
    this.is_hermite = [];

    this.reset();
  }

  static defineAPI(api, st) {
    st.string("name", "name", "Name");
    st.float("randfac", "randfac", "Rand").range(0.0, 100.0).noUnits();
    st.float("errorLimit", "errorLimit", "Error Limit", "Error limit for hermite optimization")
      .noUnits().range(0.0, 5.0).slideSpeed(5.0);
    st.float("solveFac", "solveFac", "Factor", "Optimization 2 factor")
      .noUnits().range(0.0, 5.0).slideSpeed(5.0);

    st.bool("useHermite", "useHermite", "Use Hermite").on('change', function () {
      this.dataref.updateGen++;
    });

    st.bool("origHermite", "origHermite", "Use Original", "Use Stored Original").on('change', function () {
      this.dataref.updateGen++;
    });

    let enumDef = {};
    let i = 0;
    for (let p of pigment_data.pigmentKS) {
      let k = p.name.replace(/[ \t()]/g, "_");
      enumDef[k] = i++;
    }

    window.Pigments = enumDef;
    console.error(enumDef);

    st.enum("pigment", "pigment", enumDef, "Pigment");

    function makeList(list) {
      st.list(list, list, {
        get(api, list, key) {
          return list[key];
        },
        getKey(api, list, obj) {
          return list.indexOf(obj);
        },
        getStruct(api, list, key) {
          return api.mapStruct(PigmentWavelet);
        },
        getLength(api, list) {
          return list.length;
        },
        getIter(api, list) {
          return list[Symbol.iterator]();
        }
      });
    }


    return st;
  }

  static R2(wavelen, pigments, ws) {
    let tot = 0.0, K = 0.0, S = 0.0;

    for (let i = 0; i < pigments.length; i++) {
      let pigment = pigments[i];
      let w = ws ? ws[i] : 1.0;

      K += pigment.K(wavelen)*w;
      S += pigment.S(wavelen)*w;

      tot += w;
    }

    if (tot !== 0.0) {
      K /= tot;
      S /= tot;
    }

    let a = 1.0 + K/S;
    let b = Math.sqrt(a*a - 1.0);

    function coth(f) {
      return Math.cosh(f)/Math.sinh(f);
    }

    let substrate_refl = 0.1;
    let paint_thickness = 0.001;

    let R = 1.0 - substrate_refl*(a - b*coth(b)*S*paint_thickness);
    R /= a - substrate_refl + b*coth(b)*S*paint_thickness;

    return R;
  }

  static R(wavelen, pigments, ws) {
    let tot = 0.0, K = 0.0, S = 0.0;

    for (let i = 0; i < pigments.length; i++) {
      let pigment = pigments[i];
      let w = ws ? ws[i] : 1.0;

      K += pigment.K(wavelen)*w;
      S += pigment.S(wavelen)*w;

      tot += w;
    }

    if (tot !== 0.0) {
      K /= tot;
      S /= tot;
    }

    if (Math.abs(S) < 0.00001) {
      return 0.0;
    }

    let ratio = K/S;
    return 1.0 + ratio - Math.sqrt(Math.abs(ratio*ratio + 2.0*ratio));
  }

  static mixRGB_CMYK(pigments, cs, ws, dither = false) {
    let cs2 = getTempArray(cs.length);
    let hs2 = getTempArray(cs.length);

    let i = 0;
    let alpha = 0.0;

    for (let c of cs) {
      alpha += c[3]*ws[i];
      c = color.rgb_to_linear(c[0], c[1], c[2]);

      cs2[i] = color.rgb_to_cmyk(c[0], c[1], c[2]);
      hs2[i] = color.rgb_to_hsv(c[0], c[1], c[2]);

      i++;
    }

    i = 0;
    let cmyk = mixRGBRets.next().zero();
    for (let c of cs2) {
      cmyk.addFac(c, ws[i]);
      i++;
    }

    let c1 = cmyk.load(color.cmyk_to_rgb(cmyk[0], cmyk[1], cmyk[2], cmyk[3]));
    c1.load(linear_to_rgb(c1[0], c1[1], c1[2]));

    c1[3] = alpha;

    let hsv = color.rgb_to_hsv(c1[0], c1[1], c1[2]);

    //hsv[1] += hsv1[1] * (1.0 - w)*0.5;

    i = 0;
    let sat = 0.0, tot = 0.0;

    if (window.DD === undefined) {
      window.DD = 2.0;
    }

    if (1) {
      for (let h of hs2) {
        let w = ws[i];

        let w2 = 1.0 - Math.pow(h[1]*h[2], DD);

        let sfac = w2*(1.0 - w);
        sfac = Math.pow(sfac, 0.25);

        let sat2 = Math.pow(hsv[1], (1.0 - sfac)*0.9 + 0.1);
        let l = 0.2;

        sat += sat2*w;
        tot += w;

        i++;
      }


      hsv[1] = tot !== 0.0 ? sat/tot : 0.0;
      hsv[1] = Math.min(Math.max(hsv[1], 0.0), 1.0);

      //*
      let c = color.hsv_to_rgb(hsv[0], hsv[1], hsv[2]);

      c1[0] = c[0];
      c1[1] = c[1];
      c1[2] = c[2];
      //*/
    }

    return c1;
  }

  static mixRGB_Simple(pigments, colors, ws, dither = false) {
    let ret = mixRGBRets.next();
    ret[0] = ret[1] = ret[2] = 0.0;

    let alpha = 0.0;

    for (let i = 0; i < colors.length; i++) {
      let c = colors[i];

      let linear = color.rgb_to_linear(c[0], c[1], c[2]);

      ret.addFac(linear, ws[i]);
      alpha += c[3]*ws[i];
    }

    ret.load(color.linear_to_rgb(ret[0], ret[1], ret[2]));
    ret[3] = alpha;

    if (dither) {
      ret[0] += (Math.random() - 0.5)/255.0;
      ret[1] += (Math.random() - 0.5)/255.0;
      ret[2] += (Math.random() - 0.5)/255.0;
      ret[3] += (Math.random() - 0.5)/255.0;
    }

    return ret;
  }

  static mixRGB_HSV(pigments, colors, ws, dither = false) {
    let ret = mixRGBRets.next();
    ret[0] = ret[1] = ret[2] = 0.0;

    let alpha = 0.0;

    for (let i = 0; i < colors.length; i++) {
      let c = colors[i];
      let hsv = color.rgb_to_hsv(c[0], c[1], c[2], true);

      hsv[0] = Math.pow(hsv[0], 5.0);

      ret.addFac(hsv, ws[i]);
      alpha += c[3]*ws[i];
    }

    ret[0] = Math.pow(ret[0], 1.0/5.0);

    ret.load(color.hsv_to_rgb(ret[0], ret[1], ret[2], true));
    ret[3] = alpha;

    if (dither) {
      ret[0] += (Math.random() - 0.5)/255.0;
      ret[1] += (Math.random() - 0.5)/255.0;
      ret[2] += (Math.random() - 0.5)/255.0;
      ret[3] += (Math.random() - 0.5)/255.0;
    }

    return ret;
  }

  static mixRGB(pigments, colors, ws, dither = false, bilinear = true, errorCorrect = true) {
    //return this.mixRGB_Simple(pigments, colors, ws, dither);
    //return this.mixRGB_CMYK(pigments, colors, ws, dither);
    //return this.mixRGB_HSV(pigments, colors, ws, dither);

    let cs2 = getTempArray(colors.length);
    let wsb = getTempArray(colors.length);
    let ks = getTempArray(colors.length);
    let cs3 = getTempArray(colors.length);
    let ps = pigments;
    let alpha = 0.0;

    let delta = mixRGBRets.next().zero();

    for (let i = 0; i < cs2.length; i++) {
      let c = cs2[i] = mixRGBRets.next().load(colors[i]);

      if (LINEAR_LUT) {
        c.load(color.rgb_to_linear(c[0], c[1], c[2]));
      }

      wsb[i] = ws ? ws[i] : 1.0/cs2.length;
      ks[i] = ps.sampleLUT(c[0], c[1], c[2], undefined, bilinear);

      alpha += colors[i][3]*wsb[i];

      cs3[i] = Pigment.toRGB_intern(pigments, ks[i], bilinear);
      cs3[i].sub(cs2[i]);

      delta.addFac(cs3[i], -wsb[i]);
    }

    let ks2 = ks[0];
    ks2.mulScalar(wsb[0]);

    for (let i = 1; i < ks.length; i++) {
      ks2.addFac(ks[i], wsb[i]);
    }

    let w = ks2[0] + ks2[1] + ks2[2] + ks2[3];
    if (w !== 0.0) {
      ks2.mulScalar(1.0/w);
    }

    let res = Pigment.toRGB_intern(pigments, ks2, bilinear);
    let color2 = mixRGBRets.next().load(res);

    if (errorCorrect) {
      color2.add(delta);
    }

    if (LINEAR_LUT) {
      color2.load(linear_to_rgb(color2[0], color2[1], color2[2]));
    }

    color2[3] = alpha;

    if (dither) {
      color2[0] += (Math.random() - 0.5)/255.0;
      color2[1] += (Math.random() - 0.5)/255.0;
      color2[2] += (Math.random() - 0.5)/255.0;
      color2[3] += (Math.random() - 0.5)/255.0;
    }

    return color2;
  }

  static toRGB_intern(pigments, ks2, bilinear = false) {
    if (pigments.rlut) {
      let r = ks2[0];
      let g = ks2[1];
      let b = ks2[2];
      let h = ks2[3];

      return pigments.sampleLUT(r, g, b, pigments.rlut, bilinear);
    } else {
      return Pigment.toRGB(pigments, ks2);
    }
  }

  static toRGB(pigments, ws, steps = 64) {
    if (ws === undefined && pigments.length === 1) {
      ws = [1.0];
    }

    if (pigments.length === 4 && pigments[0].wasm) {//pigments.checkWasm()) {
      return pigments[0].wasm.toRGB(pigments, ws);
    }

    let w1 = lightWaveLengths[0];
    let w2 = lightWaveLengths[1];

    let k1 = window.REFL_K1, k2 = window.REFL_K2;

    let f = w1, df = (w2 - w1)/steps;

    let sumx = 0, sumy = 0, sumz = 0;
    let sumn = 0.0;

    for (let i = 0; i < steps; i++, f += df) {
      let freq = waveLengthToFreq(f);

      let illum = getCie65(freq).s1;
      let r = Pigment.R(f, pigments, ws);

      //modified reflectance
      r = ((1.0 - k1)*(1.0 - k2)*r)/(1.0 - k2*r);

      let s = r*illum;

      sumn += yhat(f)*illum*df;

      sumx += xhat(f)*s*df;
      sumy += yhat(f)*s*df;
      sumz += zhat(f)*s*df;
    }

    let mul = sumn !== 0.0 ? 1.0/sumn : 0.0;

    let ret = toRGBRets.next();

    ret[0] = sumx;
    ret[1] = sumy;
    ret[2] = sumz;
    ret[3] = 0.0;

    ret.mulScalar(mul);
    ret.load(color.xyz_to_rgb(ret[0], ret[1], ret[2], true));

    ret[3] = 0.0;

    //if (WIDE_GAMUT) {
    ret.mulScalar(COLOR_SCALE*pigments.colorScale);
    //}

    if (!LINEAR_LUT) {
      ret.load(color.linear_to_rgb(ret[0], ret[1], ret[2]));
      ret[3] = 0.0;
    }

    return ret;
  }

  updateWasm(ps) {
    if (this.wasm) {
      if (ps.useCustomKs) {
        this.wasm.update(ps.k1, ps.k2, ps.colorScale);
      } else {
        this.wasm.update(START_REFL_K1, START_REFL_K2, ps.colorScale);
      }
    }
  }

  loadSTRUCT(reader) {
    reader(this);
    this.sort();
  }

  toJSON() {
    return JSON.stringify({
      name   : this.name,
      pigment: this.pigment
    });
  }

  loadJSON(json) {
    this.name = json.name;

    return this;
  }

  hash(digest = pdigest.reset()) {
    digest.add(this.name);
    digest.add(this.pigment);
    digest.add(this.updateGen);

    return digest.get();
  }

  reset(k = 0.7, decayk = 0.3, s = 0.2, decays = 0.1) {
    return this;
  }

  optimizePigmentData() {

  }

  randomize(fac = 1.0) {
    return this;
  }

  sort() {

  }

  checkTables() {

  }

  copy() {
    let ret = new Pigment();
    let lists = [];

    ret.solveFac = this.solveFac;
    ret.errorLimit = this.errorLimit;
    ret.randfac = this.randfac;
    ret.useHermite = this.useHermite;
    ret.origHermite = this.origHermite;

    for (let list of [this.s_hermite, this.k_hermite]) {
      let list2 = [];

      for (let w of list) {
        list2.push(w.copy());
      }

      lists.push(list2);
    }

    ret.pigment = this.pigment;

    return ret;
  }

  randHermite(ws) {
    for (let ki = 0; ki < ws.length; ki += KTOT) {
      let rx = (Math.random() - 0.5);
      //let ry = (Math.random() - 0.5)*0.01;

      ws[ki + KA] += rx;
      ws[ki + KDA] += rx;
    }

    this.updateGen++;
  }

  randHermites() {
    this.randHermite(this.s_hermite);
    this.randHermite(this.k_hermite);
  }

  resetHermite(ws) {
    ws.length = 0;
    ws.range = [1e17, -1e17];

    let pdata = pigment_data.pigmentKS[this.pigment];
    let ks = ws === this.k_hermite ? pdata.K : pdata.S;

    for (let i = 0; i < ks.length; i++) {
      let i2 = Math.min(i + 1, ks.length - 1);

      let k1 = ks[i];
      let k2 = ks[i2];
      let wavelen = pigment_data.wavelengths[i];
      let wavelen2 = pigment_data.wavelengths[i2];

      let ki = ws.length;
      ws.length += KTOT;

      ws[ki + KA] = k1;
      ws[ki + KDA] = i === ks.length - 1 ? 0.0 : (k2 - k1);
      ws[ki + KFREQ] = wavelen;
      ws[ki + KTMP] = 0;

      ws.range[0] = Math.min(ws.range[0], wavelen);
      ws.range[1] = Math.max(ws.range[1], wavelen);
    }

    this.updateGen++;
  }

  resetHermites() {
    this.resetHermite(this.k_hermite);
    this.resetHermite(this.s_hermite);
  }

  genIntTable(ws) {
    let iws = new Float64Array(ws.length);

    console.log("Generating integration table");

    let sum = 0.0;

    for (let ki = 0; ki < ws.length; ki++) {
      let ki2 = Math.min(ki + KTOT, ws.length - KTOT);

      let a = ws[ki + KA];
      let d = ws[ki2 + KA];
      let b = a + ws[ki + KDA]/3.0;
      let c = d - ws[ki2 + KDA]/3.0;

      let ia = icubic(a, b, c, d, 1.0);

      iws[ki + IA] = ia;
      iws[ki + IB] = b;
      iws[ki + IC] = c;
      iws[ki + ISUM] = sum;

      sum += ia;
    }

    console.log("iws", iws);

    return iws;
  }

  regenIntTables(freq) {
    this.is_hermite = this.genIntTable(this.s_hermite);
    this.ik_hermite = this.genIntTable(this.k_hermite);
  }

  intHermite(ws, freq) {
    if (this._last_int_key !== this.updateGen) {
      this._last_int_key = this.updateGen;
      this.regenIntTables();
    }

    let iws = ws === this.s_hermite ? this.is_hermite : this.ik_hermite;

    let ki;
    for (let ki2 = 0; ki2 < ws.length - KTOT; ki2 += KTOT) {
      if (ws[ki2 + KFREQ] > freq) {
        break;
      }
    }

    if (!ki) {
      return iws[iws.length - KTOT + KA];
    }

    let t = (freq - ws[ki + KFREQ])/(ws[ki + KTOT + KFREQ] - ws[ki + KFREQ]);

    let ki1 = ki;
    let ki2 = ki + 1;

    let a = iws[ki1 + IA];
    let b = iws[ki1 + IB];
    let c = iws[ki1 + IC];
    let d = iws[ki2 + IA];

    let sum = iws[ki1 + ISUM];
    return sum + icubic(a, b, c, d, t);
  }

  evalHermite(ws, freq) {
    if (ws.length === 0) {
      this.resetHermite(ws);
    }

    if (!ws.range) {
      let ls = pigment_data.wavelengths
      ws.range = [ls[0], ls[ls.length - 1]];
    }

    let ki;

    if (1) { //binary search
      let start = 0;
      let end = ws.length - KTOT;
      let mid;
      let i;

      for (i = 0; (end - start) > KTOT && i < 100; i++) {
        mid = (start/KTOT + end/KTOT)>>1;
        mid *= KTOT;

        if (ws[mid + KFREQ] === freq) {
          ki = mid;
          break;
        } else if (ws[mid + KFREQ] < freq) {
          start = mid;
        } else {
          end = mid;
        }
      }

      if (mid > 0 && ws[mid + KFREQ] > freq) {
        mid -= KTOT;
      }

      ki = mid < ws.length - KTOT ? mid : undefined;
    } else {
      for (let i = 0; i < ws.length - 1; i += KTOT) {
        if (ws[i + KTOT + KFREQ] > freq) {
          ki = i;
          break;
        }
      }
    }

    if (ki === undefined) {
      ki = ws.length - KTOT;
      return ws[ki];
    }

    let t = (freq - ws[ki + KFREQ])/(ws[ki + KTOT + KFREQ] - ws[ki + KFREQ]);

    let a = ws[ki];
    let b = a + ws[ki + KDA]/3.0;
    let d = ws[ki + KTOT];
    let c = d - ws[ki + KTOT + KDA]/3.0;

    let c1 = a + (b - a)*t;
    let c2 = b + (c - b)*t;
    let c3 = c + (d - c)*t;

    let d1 = c1 + (c2 - c1)*t;
    let d2 = c2 + (c3 - c2)*t;

    return d1 + (d2 - d1)*t;
  };

  optimizeHermite(ws, errorLimit = 0.05) {
    console.log("Optimize!");

    let mean = 0.0, tot = 0.0, vari = 0;
    let pdata = pigment_data.pigmentKS[this.pigment];
    let origws = ws === this.k_hermite ? pdata.K : pdata.S;

    for (let f of origws) {
      mean += f;
      tot++;
    }

    if (tot) {
      mean /= tot;
    }

    for (let f of origws) {
      vari += (f - mean)**2;
    }

    vari /= tot;
    vari = Math.sqrt(vari);

    errorLimit *= vari*this.errorLimit;

    let removePoint = (ki) => {
      for (let j = ki; j < ws.length - KTOT; j++) {
        ws[j] = ws[j + KTOT];
      }

      ws.length -= KTOT;
    }

    let totpoint = (ws.length/KTOT)>>1;

    for (let i = 1; i < totpoint; i++) {
      let ki = i*KTOT;

      if (ki >= ws.length - KTOT) {
        break;
      }

      let s1 = Math.sign(ws[ki - KTOT + KDA]);
      let s2 = Math.sign(ws[ki + KDA]);
      let s3 = Math.sign(ws[ki + KTOT + KDA]);
      if (s2 !== s3) {
        continue;
      }

      let startws = ws.concat([]);

      let freq = ws[ki + KFREQ];
      let r1 = this.evalHermite(ws, freq);

      let dmul = 1.0;

      if (ki > 0 && dmul !== 0.0) {
        let da = ws[ki + KTOT + KFREQ] - ws[ki + KFREQ];
        let db = ws[ki + KFREQ] - ws[ki - KTOT + KFREQ];

        dmul = (da + db)/db;
      }

      removePoint(ki);

      if (ki > 0) {
        ws[ki - KTOT + KDA] *= dmul;
      }

      let r2 = this.evalHermite(ws, freq);

      let err = Math.abs(r1 - r2);

      if (err > errorLimit) {
        ws.length = startws.length;
        ws.set(startws);
      }

      //console.log(err);
    }

    console.log("mean", mean, "variance", vari);

    //this.optimizeStage2(ws);
    this.updateGen++;
  }

  optimizeStage2(ws) {
    let grads = [];

    let rand = new util.MersenneRandom();
    let freqRand = (Math.random() - 0.5) + 5.0;

    let error = (freq) => {
      let err = 0.0;

      rand.seed(~~(freq*16.0));

      let d = 25 + freqRand;// + (rand.random() - 0.5)*25.0;
      let i1 = freq - d;
      let i2 = freq + d + 1;

      i1 = Math.max(i1, ws.range[0]);
      i2 = Math.min(i2, ws.range[1] + 1);
      let tot = 0;

      for (let i = i1; i < i2; i += 0.25) {
        let err2 = this.evaluate(ws, i, true) - this.evaluate(ws, i, false);

        err += err2*err2;//Math.abs(err2);
        tot++;
      }

      //return err;
      return tot ? err : 0.0;
    }

    let df = 0.0001;
    let solve = (freq) => {
      let r1 = error(freq);
      let totg = 0.0;
      grads.length = 0;

      for (let ki = 0; ki < ws.length; ki += KTOT) {
        for (let i = 0; i < KTOT; i++) {
          let orig = ws[ki + i];

          ws[ki + i] += df;
          let r2 = error(freq);
          ws[ki + i] = orig;

          let g = (r2 - r1)/df;
          totg += g*g;

          grads.push(g);
        }
      }

      if (totg < 0.00001) {
        return r1;
      }

      r1 /= totg;

      let gk = 1.0;

      gk = r1*this.solveFac; //0.01 / Math.sqrt(totg);

      for (let ki = 0; ki < ws.length; ki += KTOT) {
        for (let j = 0; j < KTOT; j++) {
          let bad = false;//ki === 0 || ki === ws.length - KTOT;
          //bad = bad && (j === KFREQ || j === KA);

          //bad = bad || j === KFREQ;

          //bad = bad || j !== KA;

          if (bad) {
            continue;
          }

          ws[ki + j] += -grads[ki + j]*gk;
        }

        //ws[ki+KFREQ] = Math.min(Math.max(ws[ki+KFREQ], ws.range[0]), ws.range[1]);
      }

      //console.log(grads.map(f => f.toFixed(3)));
      return error(freq);
    }

    for (let step = 0; step < 5; step++) {
      let err = 0.0;

      for (let ki = KTOT; ki < ws.length; ki += KTOT) {
        let err2 = solve(ws[ki + KFREQ]);
        //console.log(ws[ki + KFREQ].toFixed(4), err2);

        err += Math.abs(err2);
      }

      err /= ws.length/KTOT;
      console.log("err: ", err.toFixed(3));
    }

    this.updateGen++;
  }

  fullSolveHermite() {
    for (let i = 0; i < 2; i++) {
      this.optimizeHermite(this.s_hermite);
      this.optimizeHermite(this.k_hermite);
    }

    for (let j = 0; j < 5; j++) {
      this.optimizeStage2(this.s_hermite);
      this.optimizeStage2(this.k_hermite);
    }
  }

  integrate(ws, freq, useHermite = this.useHermite) {
    if (useHermite) {
      let f = this.intHermite(ws, freq);

      if (isNaN(f)) {
        console.error("NaN!");
        debugger;

        return 0.0;
      }

      return f;
    }

    let steps = 32;
    let s = pigment_data.wavelengths[0], ds = (freq - s)/steps;
    let sum = 0.0;

    for (let i = 0; i < steps; i++, s += ds) {
      sum += this.evaluate(ws, s, useHermite)*ds;
    }

    return sum;
  }

  evaluate(ws, freq, useHermite = this.useHermite, origHermite = this.origHermite) {
    if (useHermite) {
      if (origHermite && !insideSolver) {
        for (let h of pigment_data.pigmentHermite) {
          if (h.pigment === this.pigment) {
            ws = ws === this.k_hermite ? h.K : h.S;
          }
        }
      }

      let f = this.evalHermite(ws, freq);

      if (isNaN(f)) {
        console.error("NaN!");
        debugger;

        return 0.0;
      }

      return f;
    }

    freq *= 0.1;
    freq = Math.min(Math.max(freq, 38), 75);
    freq -= 38;

    let pdata = pigment_data.pigmentKS[this.pigment];

    let i1 = ~~freq;
    let t = Math.fract(freq);

    if (i1 >= pigment_data.wavelengths.length - 1) {
      i1 = pigment_data.wavelengths.length - 1;
      return ws === this.k_hermite ? pdata.K[i1] : pdata.S[i1];
    } else {
      let a = ws === this.k_hermite ? pdata.K[i1] : pdata.S[i1];
      let b = ws === this.k_hermite ? pdata.K[i1 + 1] : pdata.S[i1 + 1];

      return a + (b - a)*t;
    }
  }

  K(wavelen, extras, ws) { //absorbance
    return this.evaluate(this.k_hermite, wavelen);
  }

  S(wavelen) { //scattering
    return this.evaluate(this.s_hermite, wavelen);
  }

  R(wavelen, extras) {
    let K = this.K(wavelen);
    let S = this.S(wavelen);

    if (Math.abs(S) < 0.00001) {
      return 0.0;
    }

    let ratio = K/S;
    return 1.0 + ratio - Math.sqrt(Math.abs(ratio*ratio + 2.0*ratio));
  }

  iR(wavelen) {
    /*

    on factor;
    off period;

    operator K, S1, iK, iS1;

    forall s let int(K(s), s) = iK(s);
    forall s let int(S1(s), s) = iS1(s);

    ratio := K(w) / S1(w);
    fr := 1.0 + ratio - sqrt(ratio*ratio + 2.0*ratio);

    int(fr, w);

    * */
  }

  toRGB() {
    let arr = new PigmentSet();

    arr.push(this);
    arr.colorScale = this.pigmentSet.colorScale;

    return Pigment.toRGB(arr);
  }
}

Pigment.STRUCT = `
Pigment {
  name          : string; 
  k_hermite     : array(float);
  s_hermite     : array(float);
  randfac       : double;
  pigment       : int;
  useHermite    : bool;
  origHermite   : bool;
  errorLimit    : float;
  solveFac      : float;
}
`;
simple.DataModel.register(Pigment);

let LC = 0, LM = 1, LY = 2, LK = 3;
export let LTOT = 4;

let sampleRets = util.cachering.fromConstructor(Vector4, 1024);

export class PigmentSet extends Array {
  constructor() {
    super();

    this.colorScale = 1.0;

    this.blurAll = false;
    this.genDimen = 64;
    this.blurFilledInPixels = true;
    this.optimizeFilledIn = true;
    this.blurRadius = 6;
    this.optSteps = 5;
    this.doFillInLut = true;
    this.createReverseLut = true;
    this.lutQuality = 3.0;
    this.upscaleGoal = 128;

    this.useCustomKs = false;
    this.k1 = REFL_K1;
    this.k2 = REFL_K2;

    this.initRenderCamera();
    this._cameraDragging = false;

    this.haveLoadedTable = false;

    this._last_hash = undefined;
    this.lut = undefined;
  }

  static defineAPI(api, st) {
    st.int("genDimen", "genDimen", "Size", "Base size of LUT")
      .noUnits()
      .range(0, 375)
      .slideSpeed(3.0);

    st.bool("blurAll", "blurAll", "Blur All");

    st.bool("blurFilledInPixels", "blurFilledInPixels", "Blur Filled In");
    st.bool("optimizeFilledIn", "optimizeFilledIn", "Opt Filled In");
    st.int("optSteps", "optSteps", "Opt Steps").noUnits().range(1, 32).slideSpeed(1.5);

    st.bool("doFillInLut", "fillInLut", "Fill in empty in LUT");
    st.bool("createReverseLut", "createReverseLut", "Inverse Too", "Also create inverse LUT");

    st.int("upscaleGoal", "upscaleGoal", "Upscale", "Upscale to nearest power of 2 that is greater then or equal to this number")
      .noUnits()
      .range(0, 512);

    st.float("lutQuality", "lutQuality", "Quality", "Quality of LUT")
      .noUnits()
      .range(0.01, 25.0)
      .step(0.2);

    st.int("blurRadius", "blurRadius", "Blur Radius").noUnits().range(1, 32);

    st.bool("useCustomKs", "useCustomKs", "Custom Specular Ks");
    st.float("k1", "k1", "K1").noUnits().range(0.0, 1.0).step(0.01);
    st.float("k2", "k2", "K2").noUnits().range(0.0, 1.0).step(0.01);

    st.float("colorScale", "colorScale", "Output Scale", "Unphysically scale pigment colors in LUT generation")
      .noUnits()
      .range(0.0, 5.0)
      .on('change', function () {
        for (let p of this.dataref) {
          p.updateGen++;
        }
      });

    st.list("", "pigments", {
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

  checkWasm() {
    if (wasmReady() && this.length === 4) {
      for (let i = 0; i < this.length; i++) {
        let p = this[i];

        if (!p.wasm || p.pigment !== p.wasm.pigment) {
          let scale = this.colorScale ?? 1.0;
          p.wasm = WasmPigment.get(pigment_data, p.pigment, this.k1 ?? 0.03, this.k2 ?? 0.65, scale);
        }
      }

      return true;
    }

    return false;
  }

  updateWasm() {
    this.checkWasm();

    for (let p of this) {
      p.updateWasm(this);
    }
  }

  push(p) {
    super.push(p);
    p.pigmentSet = this;
  }

  loadSTRUCT(reader) {
    reader(this);

    for (let p of this) {
      p.pigmentSet = this;
    }
  }

  copy() {
    let ret = new PigmentSet();

    ret.blurFilledInPixels = this.blurFilledInPixels;
    ret.blurRadius = this.blurRadius;
    ret.optimizeFilledIn = this.optimizeFilledIn;
    ret.colorScale = this.colorScale;
    ret.blurAll = this.blurAll;
    ret.doFillInLut = this.doFillInLut;

    for (let item of this) {
      ret.push(item.copy());
    }

    return ret;
  }

  checkLUT() {
  }

  upscaleLUT2(lut, newdimen, isNormed = false) {
    let iter = this.upscaleLUT2Job(lut, newdimen, isNormed);

    while (1) {
      let next = iter.next();

      if (next.done) {
        return next.value;
      }
    }
  }

  * upscaleLUT2Job(lut, newdimen, isNormed = false, reporter = function (msg, percent) {
  }) {
    if (newdimen <= lut.dimen) {
      return lut;
    }

    let lut2 = new Float32Array(newdimen**3*LTOT);
    lut2.fill(0.0);
    lut2.dimen = newdimen;

    let dimen = lut.dimen;
    let dmul = 1.0/(newdimen - 1);
    let time = util.time_ms(), yieldtime = util.time_ms();
    let count = 0, tot = newdimen**3 - 1;

    let size1 = Math.ceil(Math.sqrt(dimen))*dimen;
    let size2 = Math.ceil(Math.sqrt(newdimen))*newdimen;

    if (1) {
      let tmp1 = makeSharedImageData(size1, size1, ImageSlots.UPSCALE1, dimen, false);
      let tmp2 = makeSharedImageData(size2, size2, ImageSlots.UPSCALE2, newdimen, false);

      let idata1 = tmp1.data;
      let idata2 = tmp2.data;

      let itot = lut.length/LTOT;

      for (let i = 0; i < itot; i++) {
        idata1[i*4] = lut[i*LTOT]*255.0;
        idata1[i*4 + 1] = lut[i*LTOT + 1]*255.0;
        idata1[i*4 + 2] = lut[i*LTOT + 2]*255.0;
        idata1[i*4 + 3] = lut[i*LTOT + 3]*255.0;
      }

      wasmModule.asm.upscaleImage(ImageSlots.UPSCALE1, ImageSlots.UPSCALE2, dimen, newdimen);

      itot = lut2.length/LTOT;
      let one255 = 1.0/255.0;

      for (let i = 0; i < itot; i++) {
        lut2[i*LTOT] = idata2[i*4]*one255;
        lut2[i*LTOT + 1] = idata2[i*4 + 1]*one255;
        lut2[i*LTOT + 2] = idata2[i*4 + 2]*one255;
        lut2[i*LTOT + 3] = idata2[i*4 + 3]*one255;
      }

      return lut2;
    }
    console.error("NEWDIMEN", newdimen);

    for (let iz = 0; iz < newdimen; iz++) {
      for (let iy = 0; iy < newdimen; iy++) {
        if (util.time_ms() - yieldtime > 150) {
          yield;
          yieldtime = util.time_ms();
        }

        if (util.time_ms() - time > 300) {
          reporter("Upscale", count/tot);
          time = util.time_ms();
        }

        for (let ix = 0; ix < newdimen; ix++) {
          let x = dmul*ix;
          let y = dmul*iy;
          let z = dmul*iz;

          let val = this.sampleLUT(x, y, z, lut, true, isNormed, false);

          let idx = (iz*newdimen*newdimen + iy*newdimen + ix)*LTOT;

          lut2[idx] = val[0];
          lut2[idx + 1] = val[1];
          lut2[idx + 2] = val[2];
          lut2[idx + 3] = val[3];

          count++;
        }
      }
    }

    reporter("Upscale", 1.0);

    return lut2;
  }

  upscaleLUT(lut, levels = 1) {
    let dimen = lut.dimen;
    let newdimen = lut.dimen<<levels;
    let cellsize = 1<<levels;

    //return lut;

    console.warn("Upscaling. . .");

    let lut2 = new Float32Array(newdimen*newdimen*newdimen*LTOT);

    lut2.dimen = newdimen;

    let dt = 1.0/cellsize;

    let gret = [0, 0, 0];

    let x, y, z;

    function get(x1, y1, z1) {
      x1 += x;
      y1 += y;
      z1 += z;

      x1 = Math.min(Math.max(x1, 0), dimen - 1);
      y1 = Math.min(Math.max(y1, 0), dimen - 1);
      z1 = Math.min(Math.max(z1, 0), dimen - 1);

      gret[0] = x1;
      gret[1] = y1;
      gret[2] = z1;

      return gret;
    }

    for (x = 0; x < dimen - 0; x++) {
      for (y = 0; y < dimen - 0; y++) {
        for (z = 0; z < dimen - 0; z++) {
          let [ix1, iy1, iz1] = get(0, 0, 0);
          let [ix2, iy2, iz2] = get(0, 1, 0);
          let [ix3, iy3, iz3] = get(1, 1, 0);
          let [ix4, iy4, iz4] = get(1, 0, 0);

          let [ix5, iy5, iz5] = get(0, 0, 1);
          let [ix6, iy6, iz6] = get(0, 1, 1);
          let [ix7, iy7, iz7] = get(1, 1, 1);
          let [ix8, iy8, iz8] = get(1, 0, 1);

          let li1 = (iz1*dimen*dimen + iy1*dimen + ix1)*LTOT;
          let li2 = (iz2*dimen*dimen + iy2*dimen + ix2)*LTOT;
          let li3 = (iz3*dimen*dimen + iy3*dimen + ix3)*LTOT;
          let li4 = (iz4*dimen*dimen + iy4*dimen + ix4)*LTOT;
          let li5 = (iz5*dimen*dimen + iy5*dimen + ix5)*LTOT;
          let li6 = (iz6*dimen*dimen + iy6*dimen + ix6)*LTOT;
          let li7 = (iz7*dimen*dimen + iy7*dimen + ix7)*LTOT;
          let li8 = (iz8*dimen*dimen + iy8*dimen + ix8)*LTOT;

          /*
          let li1 = (z*dimen*dimen + y*dimen + x)*LTOT;
          let li2 = (z*dimen*dimen + (y + 1)*dimen + x)*LTOT;
          let li3 = (z*dimen*dimen + (y + 1)*dimen + x + 1)*LTOT;
          let li4 = (z*dimen*dimen + y*dimen + x + 1)*LTOT;

          let li5 = ((z + 1)*dimen*dimen + y*dimen + x)*LTOT;
          let li6 = ((z + 1)*dimen*dimen + (y + 1)*dimen + x)*LTOT;
          let li7 = ((z + 1)*dimen*dimen + (y + 1)*dimen + x + 1)*LTOT;
          let li8 = ((z + 1)*dimen*dimen + y*dimen + x + 1)*LTOT;
          //*/

          let x1 = x<<levels;
          let y1 = y<<levels;
          let z1 = z<<levels;

          x1 = Math.min(Math.max(x1, 0), newdimen - cellsize);
          y1 = Math.min(Math.max(y1, 0), newdimen - cellsize);
          z1 = Math.min(Math.max(z1, 0), newdimen - cellsize);

          let fx = 0.0;
          for (let x2 = x1; x2 < x1 + cellsize; x2++, fx += dt) {

            let fy = 0.0;
            for (let y2 = y1; y2 < y1 + cellsize; y2++, fy += dt) {

              let fz = 0.0;
              for (let z2 = z1; z2 < z1 + cellsize; z2++, fz += dt) {
                let li = (z2*newdimen*newdimen + y2*newdimen + x2)*LTOT;

                for (let i = 0; i < LTOT; i++) {
                  let a = lut[li1 + i] + (lut[li2 + i] - lut[li1 + i])*fy;
                  let b = lut[li4 + i] + (lut[li3 + i] - lut[li4 + i])*fy;
                  let c = a + (b - a)*fx;

                  let d = lut[li5 + i] + (lut[li6 + i] - lut[li5 + i])*fy;
                  let e = lut[li8 + i] + (lut[li7 + i] - lut[li8 + i])*fy;
                  let f = d + (e - d)*fx;

                  lut2[li + i] = c + (f - c)*fz;
                }
              }
            }
          }
        }
      }
    }

    return lut2;
  }

  sampleLUT(r, g, b, lut = this.lut, bilinear = TRILINEAR_LUT, isNormed = true, sampleUnified = true) {
    if (!lut) {
      return new Vector4();

      //this.makeLUTs();
      //lut = this.lut;
    }

    if (sampleUnified && this.unifiedLut) {
      //return this._sampleUnifiedLut(r, g, b, lut !== this.lut);
    }

    r = Math.min(Math.max(r, 0.0), 1.0)*0.9999;
    g = Math.min(Math.max(g, 0.0), 1.0)*0.9999;
    b = Math.min(Math.max(b, 0.0), 1.0)*0.9999;

    let dimen = lut.dimen;

    let ir = r*dimen;
    let ig = g*dimen;
    let ib = b*dimen;

    let u = Math.fract(ir);
    let v = Math.fract(ig);
    let w = Math.fract(ib);

    ir = ~~ir;
    ig = ~~ig;
    ib = ~~ib;

    let c1, c2, c3, c4

    c1 = this._sampleLUT(ir, ig, ib, lut);

    if (!bilinear) {
      return c1;
    }

    c2 = this._sampleLUT(ir, ig + 1, ib, lut);
    c3 = this._sampleLUT(ir + 1, ig + 1, ib, lut);
    c4 = this._sampleLUT(ir + 1, ig, ib, lut);

    let k1 = sampleRets.next(), k2 = sampleRets.next();
    k1.load(c1).interp(c2, v);
    k2.load(c4).interp(c3, v);

    let r1 = sampleRets.next().load(k1).interp(k2, u);

    c1 = this._sampleLUT(ir, ig, ib + 1, lut);
    c2 = this._sampleLUT(ir, ig + 1, ib + 1, lut);
    c3 = this._sampleLUT(ir + 1, ig + 1, ib + 1, lut);
    c4 = this._sampleLUT(ir + 1, ig, ib + 1, lut);

    k1.load(c1).interp(c2, v);
    k2.load(c4).interp(c3, v);

    let r2 = sampleRets.next().load(k1).interp(k2, u);

    r1.interp(r2, w);

    if (isNormed) {
      let mul = r1[0] + r1[1] + r1[2] + r1[3];
      if (mul !== 0.0) {
        r1.mulScalar(1.0/mul);
      }
    }

    return r1;
  }

  _sampleUnifiedLut(x, y, z, isRev) {
    let ret = sampleRets.next();

    let dimen = this.lut.dimen;

    x *= dimen - 1;
    y *= dimen - 1;
    z *= dimen - 1;

    x = ~~x;
    y = ~~y;
    z = ~~z;

    x = Math.min(Math.max(x, 0), dimen - 1);
    y = Math.min(Math.max(y, 0), dimen - 1);
    z = Math.min(Math.max(z, 0), dimen - 1);

    if (isRev) {
      z += dimen;
    }

    let ulut = this.unifiedLut;

    let cellw = ~~(ulut.width/dimen);

    let col = z%cellw;
    let row = ~~(z/cellw);

    let ix = col*dimen + x;
    let iy = row*dimen + y;

    let idx = (iy*ulut.width + ix)*4;
    let idata = ulut.data;

    ret[0] = idata[idx]/255;
    ret[1] = idata[idx + 2]/255;
    ret[2] = idata[idx + 1]/255;
    ret[3] = 1.0 - ret[0] - ret[1] - ret[2];

    //if (!isRev && Math.random() > 0.998) {
    //console.log(ret);
    //}

    if (!isRev) {
      if (ret[3] > 1.0) {
        ret.mulScalar(1.0/ret[3]);
        ret[3] = 1.0;
      }
    }

    return ret;
  }

  _sampleLUT(x, y, z, lut) {
    let dimen = lut.dimen;

    x = Math.min(Math.max(x, 0), dimen - 1);
    y = Math.min(Math.max(y, 0), dimen - 1);
    z = Math.min(Math.max(z, 0), dimen - 1);

    let idx = (z*dimen*dimen + y*dimen + x)*4;

    let ret = sampleRets.next();
    ret[0] = lut[idx + 0];
    ret[1] = lut[idx + 1];
    ret[2] = lut[idx + 2];
    ret[3] = 1.0 - ret[0] - ret[1] - ret[2]; //lut[idx + 3];

    return ret;
  }

  loadLUTImage(image, dimen) {
    let idata = image.data;

    this.unifiedLut = image;

    let tottile = dimen*2;

    let klut = new Float32Array(dimen*dimen*dimen*LTOT);
    let rlut = new Float32Array(dimen*dimen*dimen*LTOT);

    klut.dimen = rlut.dimen = dimen;

    let width = image.width;

    let lut = klut;
    let ti2 = 0;

    let sx = 0, sy = 0;

    for (let ti = 0; ti < tottile; ti++, ti2++) {
      if (ti === dimen) {
        lut = rlut;
        ti2 = 0;
      }

      let dz = ti2;

      let x2 = 0;
      for (let x1 = sx; x1 < sx + dimen; x1++, x2++) {

        let y2 = 0
        for (let y1 = sy; y1 < sy + dimen; y1++, y2++) {
          let i1 = (y1*width + x1)*4;
          let li = (dz*dimen*dimen + y2*dimen + x2)*LTOT;

          lut[li] = idata[i1]/255.0;
          lut[li + 1] = idata[i1 + 2]/255.0;
          lut[li + 2] = idata[i1 + 1]/255.0;
          lut[li + 3] = 1.0 - lut[li] - lut[li + 1] - lut[li + 2];
        }
      }

      sx += dimen;
      if (sx >= width) {
        sy += dimen;
        sx = 0.0;
      }
    }

    for (let pigment of this) {
      pigment.haveLoadedTable = true;
    }

    this.lut = klut;
    this.rlut = rlut;

    this.haveLoadedTable = true;
  }

  initRenderCamera() {
    let origin = new Vector3([2.5, 1.5, 2.0]);
    let target = new Vector3([0.5, 0.5, 0.5]);
    let ray = new Vector3(target).sub(origin).normalize();

    origin.mulScalar(1.0);
    origin.addFac(ray, 0.0);

    let up = new Vector3([0, 0, 1]);
    up.cross(ray).normalize();

    let cam = new Camera();

    cam.near = 0.0001;
    cam.far = 10.0;
    cam.fov = 45.0;
    cam.pos.load(origin);
    cam.up.load(up);
    cam.target.load(target);
    cam.aspect = 1.0;

    this.renderCamera = cam;
  }

  renderLUTCube(useRlut, dist = 1.0, ortho = false, sensor = 1.0, startz = 0.05) {
    let lut = useRlut ? this.rlut : this.lut;

    let dimen = lut.dimen;
    let dimen2 = dimen*2;

    let image = new ImageData(dimen2, dimen2);
    let idata = image.data;
    let idimen2 = 1.0/dimen2;

    let cam = this.renderCamera;
    let origin = new Vector3(cam.pos);
    let target = cam.target;
    let p = new Vector3();

    let ray = new Vector3(target).sub(origin).normalize();
    let ray2 = new Vector3();

    cam.regen_mats(1.0);

    let mat = cam.rendermat
    let imat = new Matrix4(mat);
    imat.invert();

    ray.normalize();

    let start = new Vector3(origin);
    let end = new Vector3();

    //origin + ray*t = 1
    //ray*t = 1-origin;
    //t = 1-origin / ray

    let axis;
    if (Math.abs(ray[0]) <= Math.abs(ray[1]) && Math.abs(ray[0]) < Math.abs(ray[2])) {
      axis = 0;
    } else if (Math.abs(ray[2]) <= Math.abs(ray[1]) && Math.abs(ray[2]) < Math.abs(ray[1])) {
      axis = 2;
    } else {
      axis = 1;
    }

    let t1 = (1.0 - origin[axis])/ray[axis];
    let t2 = -(origin[axis] + 1.0)/ray[axis];
    let startt;

    if (t1 > 0.0 && t2 > 0.0) {
      startt = Math.min(t1, t2);
      //startt = (t1+t2)*0.5;
    } else if (t2 > 0.0) {
      startt = t2;
    } else {
      startt = t1;
    }

    //startt *= 0.25;
    startt = 1.0;
    //startt = Math.abs(origin[axis] - 1.0);

    let p2 = new Vector3();

    //console.log("T", startt.toFixed(3), t1.toFixed(3), t2.toFixed(3));
    //console.log("ORIGIN", cam.pos);

    //startt = 0.0;

    if (ortho) {
      sensor *= 1.0 + dist;
    }

    let steps = this._cameraDragging ? 4 : 55;
    let dt = 1.0/(steps - 1);

    for (let iy = 0; iy < dimen2; iy++) {
      for (let ix = 0; ix < dimen2; ix++) {
        let x = (ix*idimen2 - 0.5)*2.0*sensor;
        let y = (iy*idimen2 - 0.5)*2.0*sensor;

        //ray2.zero().addFac(up, y*sensor).addFac(side, x*sensor);
        //ray2.addFac(ray, depth);
        //ray2.normalize().mulScalar(1.75).add(origin);

        ray2.loadXYZ(x, y, startz);
        ray2.multVecMatrix(imat);

        p2.load(ray2);

        const rdist = 5.25;
        /*
                if (!cam.isPerspective) {
                  start.load(origin).addFac(ray, startt);
                  end.load(ray2).addFac(ray, rdist);
                  ray2.normalize();
                } else {*/
        ray2.sub(origin).normalize();

        start.load(origin).addFac(ray2, startt);
        end.load(ray2).mulScalar(rdist).add(origin);
        //}

        let t = 0.0;

        let sum = 0.0;
        let sumr = 0.0;
        let sumg = 0.0;
        let sumb = 0.0;

        let first = true;

        for (let i = 0; i < steps; i++, t += dt) {
          let t2 = t + (Math.random() - 0.5)*dt;

          p.load(start).interp(end, t2);

          //p.mulScalar(0.5).addScalar(0.5);
          p.addScalar(0.5);

          if (p[0] < 0.0 || p[1] < 0.0 || p[2] < 0.0 || p[0] >= 1.0 || p[1] >= 1.0 || p[2] >= 1.0) {
            continue;
          }

          let x = ~~(p[0]*dimen + 0.5);
          let y = ~~(p[1]*dimen + 0.5);
          let z = ~~(p[2]*dimen + 0.5);

          let idx = (z*dimen*dimen + y*dimen + x)*LTOT;

          let r = lut[idx]*4.0;
          let g = lut[idx + 1]*4.0;
          let b = lut[idx + 2]*4.0;

          let w = (r*r + g*g + b*b);
          sum += w;

          if (w > 0.1) {
            sumr = r;
            sumg = g;
            sumb = b;

            first = false;
            break;
          }

          //break;
        }

        let idx = (iy*dimen2 + ix)*4;

        if (!sum) {
          //p2.mulScalar(0.1);
          idata[idx] = Math.fract(p2[0]*500)*100.0;
          idata[idx + 1] = Math.fract(p2[1]*500)*100.0;
          idata[idx + 2] = Math.fract(p2[2]*500)*100.0;
          idata[idx + 3] = 255;
          continue;
        }

        if (sum === 0.0) {
          idata[idx] = idata[idx + 1] = idata[idx + 2] = 0.0;
          idata[idx + 3] = 255;
          continue;
        }

        idata[idx] = sumr*255;
        idata[idx + 1] = sumg*255;
        idata[idx + 2] = sumb*255;
        idata[idx + 3] = 255;
      }
    }

    let canvas = document.createElement("canvas");
    let g = canvas.getContext("2d");
    canvas.width = canvas.height = dimen2;
    g.putImageData(image, 0, 0);

    let rect = [
      [0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0],
      [0, 0, 1], [0, 1, 1], [1, 1, 1], [1, 0, 1],
    ];

    rect = rect.map(f => {
      f = new Vector4(f);
      f.subScalar(0.5);

      f[3] = 1.0;
      f.multVecMatrix(mat);

      if (f[3] !== 0.0) {
        f.mulScalar(1.0/f[3]);
      }

      f.mulScalar(1.0/sensor);
      f.mulScalar(0.5).addScalar(0.5);
      f.mulScalar(dimen2);

      return f;
    });

    let r = rect;

    g.beginPath();
    g.moveTo(r[0][0], r[0][1]);
    g.lineTo(r[1][0], r[1][1]);
    g.lineTo(r[2][0], r[2][1]);
    g.lineTo(r[3][0], r[3][1]);
    g.lineTo(r[0][0], r[0][1]);

    g.moveTo(r[4][0], r[4][1]);
    g.lineTo(r[5][0], r[5][1]);
    g.lineTo(r[6][0], r[6][1]);
    g.lineTo(r[7][0], r[7][1]);
    g.lineTo(r[4][0], r[4][1]);

    g.moveTo(r[0][0], r[0][1]);
    g.lineTo(r[4][0], r[4][1]);
    g.moveTo(r[1][0], r[1][1]);
    g.lineTo(r[5][0], r[5][1]);
    g.moveTo(r[2][0], r[2][1]);
    g.lineTo(r[6][0], r[6][1]);
    g.moveTo(r[3][0], r[3][1]);
    g.lineTo(r[7][0], r[7][1]);

    g.strokeStyle = "orange";
    g.stroke();

    if (0) {
      //console.log(r);
      canvas.toBlob(blob => {
        let url = URL.createObjectURL(blob);

        console.log(url);
        //window.open(url);
      });
    }

    window.renderedLut = canvas;
  }

  makeLUTImage(lut, dimen, makeRev = false) {
    if (!lut && this.lut && this.rlut && this.lut.dimen === this.rlut.dimen) {
      return this.makeUnifiedLUTImage();
    } else {
      console.error("SINGLE LUT!", lut, this.rlut, this.lut.dimen, this.rlut ? this.rlut.dimen : undefined);
    }

    if (!lut) {
      lut = this.lut;
    }

    /*
    if (dimen !== undefined) {
      if (!makeRev) {
        this.makeLUTs(dimen)
        lut = this.lut;
      } else {
        this.makeReverseLut(dimen);
        lut = this.rlut;
      }
    }

    if (!lut) {
      this.makeLUTs();
      lut = makeRev ? this.rlut : this.lut;
    }*/

    if (!dimen) {
      dimen = lut ? lut.dimen : 32;
    }

    let tilesize = dimen;
    let sd = Math.ceil(Math.sqrt(dimen));

    let width = dimen*sd;
    let height = dimen*sd;

    let image = new ImageData(width, height);
    let canvas = document.createElement("canvas");
    let idata = image.data;
    let g = canvas.getContext("2d");
    canvas.width = width;
    canvas.height = height;

    console.log(width, height);

    let c = [0, 0, 0];

    let sx = 0, sy = 0;
    let tilei = 0;
    for (let z = 0; z < dimen; z++) {
      if (sx >= width) {
        sx = 0;
        sy += dimen;
      }

      for (let x = 0; x < dimen; x++) {
        for (let y = 0; y < dimen; y++) {
          let x2 = sx + x;
          let y2 = sy + y;

          let idx = (y2*width + x2)*4;
          let li = (z*dimen*dimen + y*dimen + x)*LTOT;

          c[0] = lut[li];
          c[1] = lut[li + 1];
          c[2] = lut[li + 2];

          //this is applied earlier in toRGB
          //if (LINEAR_LUT) {
          //c = color.linear_to_rgb(c[0], c[1], c[2]);
          //}
          //

          //try to be compatible with mixbox?
          idata[idx] = c[0]*255;
          idata[idx + 1] = c[2]*255;
          idata[idx + 2] = c[1]*255;
          idata[idx + 3] = 255; //they all sum to one, can afford to use alpha at one
        }
      }

      sx += dimen;
    }

    g.putImageData(image, 0, 0);

    console.log(tilei);

    canvas.toBlob((blob) => {
      let url = URL.createObjectURL(blob);

      let a = document.createElement("a");
      a.setAttribute("href", url);
      a.href = url;
      a.setAttribute("download", "lut.png");

      a.click();

      console.log(url);
      window.open(url);
    });

  }

  makeUnifiedLUTImage() {
    let dimen = this.lut.dimen;
    let luts = [this.lut, this.rlut];

    let tilesize = dimen;
    let sd = Math.ceil(Math.sqrt(dimen*2.0));

    let width = dimen*sd;
    let height = dimen*sd;

    let image = new ImageData(width, height);
    let canvas = document.createElement("canvas");
    let idata = image.data;
    let g = canvas.getContext("2d");
    canvas.width = width;
    canvas.height = height;

    console.log(width, height);

    console.warn("Making unified lookup table. . .");

    let lut = luts[0];
    let c = [0, 0, 0];

    let sx = 0, sy = 0;
    let tilei = 0;

    for (let lut of luts) {
      for (let z = 0; z < dimen; z++) {
        if (sx >= width) {
          sx = 0;
          sy += dimen;
        }

        for (let x = 0; x < dimen; x++) {
          for (let y = 0; y < dimen; y++) {
            let x2 = sx + x;
            let y2 = sy + y;

            let idx = (y2*width + x2)*4;
            let li = (z*dimen*dimen + y*dimen + x)*LTOT;

            c[0] = lut[li];
            c[1] = lut[li + 1];
            c[2] = lut[li + 2];

            if (lut !== luts[1]) {
              //  c = color.linear_to_rgb(c[0], c[1], c[2]);
            }

            idata[idx] = c[0]*255;
            idata[idx + 1] = c[2]*255;
            idata[idx + 2] = c[1]*255;
            idata[idx + 3] = 255; //they all sum to one, can afford to use alpha at one
          }
        }

        sx += dimen;
      }
    }

    if (_appstate.ctx.canvas) {
      _appstate.ctx.canvas.updateUnifiedLut(image, dimen);
    }

    g.putImageData(image, 0, 0);

    console.log(tilei);

    canvas.toBlob((blob) => {
      let url = URL.createObjectURL(blob);

      let a = document.createElement("a");
      a.setAttribute("href", url);
      a.href = url;
      a.setAttribute("download", "lut.png");

      a.click();

      console.log(url);
      window.open(url);
    });

  }

  makeReverseLut(dimen, fillInEmptySpace, upscaleDimen) {
    for (let step of this.makeReverseLutJob(dimen, fillInEmptySpace, upscaleDimen)) {

    }
  }

  * makeReverseLutJob(dimen            = 8,
                      fillInEmptySpace = false,
                      upscaleDimen     = 128,
                      reporter         = function (msg, percent) {
                      }) {
    fillInEmptySpace = false; //doesn't work properly

    let lut = this.rlut = new Float32Array(dimen*dimen*dimen*LTOT);
    let used = new Uint8Array(dimen*dimen*dimen);

    lut.dimen = dimen;

    let c = new Vector4();
    c[3] = 1.0;

    let yieldtime = util.time_ms();

    let ps = this;
    let time = util.time_ms();
    let itot = dimen*dimen*dimen;
    let tot = 0;

    let cos = Math.cos, sin = Math.sin, atan = Math.atan;
    let sqrt = Math.sqrt, pow = Math.pow, atan2 = Math.atan2;
    let fract = Math.fract, tent = Math.tent;

    const dimen2 = dimen; //-1;

    function doPixel(x, y, z) {
      if (1) {
        c[0] = (x/(dimen2))**1;
        c[1] = (y/(dimen2))**1;
        c[2] = (z/(dimen2))**1;

        c[3] = 1.0 - (c[0] + c[1] + c[2]);

        c[3] = Math.max(c[3], 0.0);
      }

      //c.abs();

      if (Math.abs((c[0] + c[1] + c[2] + c[3]) - 1.0) > 0.2) {
        return;
      }

      used[z*dimen*dimen + y*dimen + x] = 1;


      //c.mulScalar(0.5).addScalar(0.5);

      let c2 = Pigment.toRGB(ps, c);

      let li = (z*dimen*dimen + y*dimen + x)*LTOT;

      lut[li + 0] = c2[0];
      lut[li + 1] = c2[1];
      lut[li + 2] = c2[2];
      lut[li + 3] = 0.0;
    }

    for (let x = 0; x < dimen; x++) {
      for (let y = 0; y < dimen; y++) {
        for (let z = 0; z < dimen; z++) {
          doPixel(x, y, z);

          if (util.time_ms() - yieldtime > 50) {
            yield;
            yieldtime = util.time_ms();
          }

          if (util.time_ms() - time > 500) {
            time = util.time_ms();
            let perc = (100.0*tot/itot*4.0).toFixed(3) + "%";

            reporter("Inverse LUT", tot/itot);

            console.log(`${perc}: doing ${tot + 1} of ${itot}`);
          }

          tot++;
        }
      }
    }

    reporter("Inverse LUT", 1.0);

    /*

    on factor;
    operator wave;
    clear wave;

    procedure cos1(f);
      cos(f);

    comment: cos(f/pi)*0.5 + 0.5;

    procedure wave(a, b, c, d);
      cos1(a)*cos1(b + k)*cos1(c + 2*k)*cos1(d + 3*k);

    f1 := wave(a, b, c, d) + wave(b, c, d, a) + wave(c, d, a, b) + wave(d, a, b, c) - 1.0;


    * */
    if (fillInEmptySpace) {
      this.fillInLut(lut, used, false, false);
    }

    if (1) {
      lut = this.rlut = yield* this.upscaleLUT2Job(lut, upscaleDimen, true, reporter);
    } else {
      let levels = this.getUpscaledLevels(dimen, upscaleDimen);
      if (levels > 0) {
        lut = this.rlut = this.upscaleLUT(lut, levels);
      }
    }

    console.log("Made reverse LUT");

    return lut;
  }

  laplacian(lut, swaplut, used) {
    let dimen = lut.dimen;

    const blurAll = this.blurAll;

    let DVTOT = 4;

    if (!lut.dv) {
      lut.dv = new Float64Array(dimen*dimen*dimen*DVTOT);
      lut.dv.fill(0.0);
    }

    let dv = lut.dv;
    let lut2 = swaplut;

    let offs = [
      [0, 0, 0],

      [-1, 0, 0],
      [1, 0, 0],

      [0, 1, 0],
      [0, -1, 0],

      [0, 0, 1],
      [0, 0, -1]
    ];

    let mul = 1.0/offs.length;
    let dimen1 = dimen - 1;

    for (let x = 0; x < dimen; x++) {
      for (let y = 0; y < dimen; y++) {
        for (let z = 0; z < dimen; z++) {
          let idx = z*dimen*dimen + y*dimen + x;
          let li = idx*LTOT;

          if (!blurAll && !used[idx]) {
            continue;
          }

          let sumr = 0.0, sumg = 0.0, sumb = 0.0;
          let totw = 0.0;

          for (let off of offs) {
            let x2 = x + off[0];
            let y2 = y + off[1];
            let z2 = z + off[2];

            x2 = Math.min(Math.max(x2, 0.0), dimen1);
            y2 = Math.min(Math.max(y2, 0.0), dimen1);
            z2 = Math.min(Math.max(z2, 0.0), dimen1);

            let idx2 = z2*dimen*dimen + y2*dimen + x2;
            let li2 = idx2*LTOT;

            let w = 1.0;

            if (!used[idx2]) {
              w = 10000.0;
            }

            sumr += lut2[li2]*w;
            sumg += lut2[li2 + 1]*w;
            sumb += lut2[li2 + 2]*w;
            totw += w;
          }

          mul = totw !== 0.0 ? 1.0/totw : 0.0;

          sumr *= mul
          sumg *= mul;
          sumb *= mul;

          if (0) {
            let di = idx*DVTOT;

            let dr1 = dv[di];
            let dg1 = dv[di + 1];
            let db1 = dv[di + 2];

            let fac = 0.5;

            sumr += dr1*fac;
            sumg += dg1*fac;
            sumb += db1*fac;

            //sumr = Math.min(Math.max(sumr, 0.0), 1.0);
            //sumg = Math.min(Math.max(sumg, 0.0), 1.0);
            //sumb = Math.min(Math.max(sumb, 0.0), 1.0);

            let dr2 = sumr - lut[li];
            let dg2 = sumg - lut[li + 1];
            let db2 = sumb - lut[li + 2];

            let fac2 = 0.5;
            dr2 += (dr1 - dr2)*fac2;
            dg2 += (dg1 - dg2)*fac2;
            db2 += (db1 - db2)*fac2;

            dv[di] = dr2;
            dv[di + 1] = dg2;
            dv[di + 2] = db2;
          }

          lut[li] = sumr;
          lut[li + 1] = sumg;
          lut[li + 2] = sumb;
        }
      }
    }

    return lut;
  }

  swapLUTs() {
    let tmp = this.lut;
    this.lut = this.rlut;
    this.rlut = tmp;

    this.makeLUTImage();
  }

  makeLUTs(dimen            = 32,
           fillInEmptySpace = true,
           upscaleDimen     = 128,
           stepMul          = 5.0,
           noReverse        = false) {

    for (let step of this.makeLUTsJob(dimen, fillInEmptySpace, upscaleDimen, stepMul, noReverse)) {

    }
  }

  * makeLUTsJob(dimen            = 32,
                fillInEmptySpace = true,
                upscaleDimen     = 128,
                stepMul          = 5.0,
                noReverse        = false,
                reporter         = function (msg, percent) {
                }) {
    let ds = 1.0/(dimen - 1);

    this.updateWasm();

    if (this.useCustomKs) {
      window.REFL_K1 = this.k1;
      window.REFL_K2 = this.k2;
    } else {
      window.REFL_K1 = START_REFL_K1;
      window.REFL_K2 = START_REFL_K2;
    }

    let lut = this.lut = new Float32Array(dimen*dimen*dimen*LTOT);
    for (let i = 0; i < lut.length; i++) {
      lut[i] = 0.0;
    }

    lut.dimen = dimen;
    let tot = 0;

    let used = new Uint16Array(dimen*dimen*dimen);

    let time = util.time_ms();
    let ws = new Vector4();
    let min = new Vector3(), max = new Vector3();

    min.addScalar(1e17);
    max.subScalar(1e17);
    let rgb = new Vector3();
    let itot = dimen*dimen*dimen*dimen;

    let hitrate = 0;

    let totsteps = ~~(dimen*dimen*dimen*stepMul);

    let yieldtime = util.time_ms();

    let dopixel = (c, m, y, k) => {
      ws[0] = c;
      ws[1] = m;
      ws[2] = y;
      ws[3] = k;

      rgb.load(Pigment.toRGB(this, ws));
      min.min(rgb);
      max.max(rgb);

      for (let i = 0; i < 3; i++) {
        rgb[i] = Math.min(Math.max(rgb[i], 0.0), 1.0)*0.99999;
      }

      let ir = ~~(rgb[0]*dimen);
      let ig = ~~(rgb[1]*dimen);
      let ib = ~~(rgb[2]*dimen);

      let idx = (ib*dimen*dimen + ig*dimen + ir)*4;

      if (used[idx/4] === 0) {
        hitrate++;
      } else {
        hitrate = 0;
      }

      used[idx/4]++;

      lut[idx] += ws[0];
      lut[idx + 1] += ws[1];
      lut[idx + 2] += ws[2];
      lut[idx + 3] += ws[3];
    }

    for (let step = 0; step < totsteps; step++) {
      /*
      for (let c = 0; c < dimen; c++) {
        for (let m = 0; m < dimen; m++) {
          for (let y = 0; y < dimen; y++) {
            for (let k = 0; k < dimen; k++) {
       */
      let c = Math.random();
      let m = Math.random();
      let y = Math.random();
      let k;
      //let k = Math.fom();

      if (1) {
        /* lower sample bias by throwing away invalid samples */
        if (c + m + y > 1.0) {
          step--;
          continue;
        }

        /* k is derived */
        k = 1.0 - c - m - y;
      } else {
        k = Math.random();

        let mul = 1.0/(c + m + y + k);
        c *= mul;
        m *= mul;
        y *= mul;
        k *= mul;
      }

      dopixel(c, m, y, k);

      if (util.time_ms() - yieldtime > 50) {
        yield;
        yieldtime = util.time_ms();
      }

      if (isNaN(ws.dot(ws))) {
        console.warn(ws);
        throw new Error("NaN!");
      }

      if (isNaN(rgb.dot(rgb))) {
        console.warn(rgb, ws);
        throw new Error("NaN!");
      }

      if (util.time_ms() - time > 225) {
        //console.log(rgb, idx, ws, ir, ig, ib);
        console.log(ws, step);
        let perc = (100.0*step/totsteps).toFixed(3) + "%";

        reporter("LUT", step/totsteps);

        console.warn(`${perc}: doing ${tot + 1} of ${itot}`);
        time = util.time_ms();
      }

      tot++;
      /*
    }
  }
}*/
    }

    for (let i = 0; i < lut.length; i += 4) {
      if (!used[i/4]) {
        continue;
      }

      let w = lut[i] + lut[i + 1] + lut[i + 2] + lut[i + 3];
      used[i/4] = 1;

      if (w) {
        w = 1.0/w;

        lut[i] *= w;
        lut[i + 1] *= w;
        lut[i + 2] *= w;
        lut[i + 3] *= w;
      }
    }

    reporter("LUT", 1.0);

    console.log("max", min, "max", max);

    let usedcpy = new Uint16Array(used);

    if (fillInEmptySpace) {
      const doBlur = this.blurFilledInPixels;

      console.log("propegating into empty spaces. . .");
      for (let step of this.fillInLutJob(lut, used, true, doBlur, reporter)) {
        yield;
      }
    }

    if (this.optimizeFilledIn) {
      for (let step of this.optimizeLutFillIn(lut, usedcpy, reporter)) {
        yield;
      }
    }

    if (this.blurFilledInPixels) {
      console.log("Blurring");
      reporter("Blur", 0);

      let swapLut = new Float32Array(lut);
      swapLut.dimen = dimen;

      let steps = this.blurRadius*32;
      let used2 = new Uint16Array(usedcpy);

      for (let i = 0; i < usedcpy.length; i++) {
        used2[i] = !used2[i];
      }

      for (let i = 0; i < steps; i++) {
        this.laplacian(lut, swapLut, used2);

        if (i !== steps - 1) {
          let tmp = swapLut;
          swapLut = lut;
          lut = tmp;

          this.lut = lut;
        }

        reporter("Blur", (i + 1)/steps);
        yield;
      }

      lut.dv = undefined;
      reporter("Blur", 1.0);
    }

    if (1) {
      lut = this.lut = yield* this.upscaleLUT2Job(lut, upscaleDimen, true, reporter);
    } else {
      let levels = this.getUpscaledLevels(dimen, upscaleDimen);
      if (levels >= 1) {
        lut = this.lut = this.upscaleLUT(lut, levels);
      }
    }

    console.log("TOT", tot);
    if (!noReverse) {
      yield* this.makeReverseLutJob(dimen, fillInEmptySpace, upscaleDimen, reporter);
    }

    return lut;
  }

  findMapping(mix, color, tmp1, tmp2) {
    let err;

    for (let i = 0; i < this.optSteps; i++) {
      err = this.findMapping_solve(mix, color, tmp1, tmp2);
    }

    return err;
  }

  findMapping_solve(mix, color, tmp1, tmp2) {
    let error = () => {
      let rgb = Pigment.toRGB(this, mix, 8);

      let dx = Math.abs(rgb[0] - color[0]);
      let dy = Math.abs(rgb[1] - color[1]);
      let dz = Math.abs(rgb[2] - color[2]);

      let f;
      //f = dx+dy+dz;
      //f = Math.sqrt(dx**2 + dy**2 + dz**2);
      f = dx**2 + dy**2 + dz**2;

      return f;
    }

    let r1 = error();
    let df = 0.00025;

    let gs = tmp1;
    let totg = 0.0;

    for (let i = 0; i < 4; i++) {
      let orig = mix[i];
      mix[i] += df;

      gs[i] = (error() - r1)/df;

      mix[i] = orig;
      totg += gs[i]*gs[i];
    }

    if (totg === 0.0) {
      return;
    }

    r1 /= totg;

    let tot = 0.0;

    for (let i = 0; i < 4; i++) {
      mix[i] += -r1*gs[i]*0.35;
      mix[i] = Math.max(mix[i], 0.0);
      tot += mix[i];
    }

    if (tot) {
      tot = 1.0/tot;
      for (let i = 0; i < 4; i++) {
        mix[i] *= tot;
      }
    }

    return error();
  }

  * optimizeLutFillIn(lut, used, reporter) {
    reporter("Optimize", 0.0);


    let dimen = lut.dimen;
    let mix = new Vector4();
    let color = new Vector4();

    color[3] = 1.0;

    let tmp1 = new Vector4();
    let tmp2 = new Vector4();

    for (let z = 0; z < dimen; z++) {
      for (let y = 0; y < dimen; y++) {
        for (let x = 0; x < dimen; x++) {
          let idx = z*dimen*dimen + y*dimen + x;

          if (used[idx]) {
            continue;
          }

          color[0] = x/(dimen - 1) + (Math.random() - 0.5)/dimen;
          color[1] = y/(dimen - 1) + (Math.random() - 0.5)/dimen;
          color[2] = z/(dimen - 1) + (Math.random() - 0.5)/dimen;

          let li = idx*LTOT;
          mix[0] = lut[li];// + Math.random()*0.001;
          mix[1] = lut[li + 1];// + Math.random()*0.001;
          mix[2] = lut[li + 2];// + Math.random()*0.001;
          mix[3] = 1.0 - mix[0] - mix[1] - mix[2];

          let err = this.findMapping(mix, color, tmp1, tmp2);

          lut[li] = mix[0];
          lut[li + 1] = mix[1];
          lut[li + 2] = mix[2];
        }
      }

      if (z%4 === 0) {
        reporter("Optimize", (z + 1)/dimen);
        yield;
      }
    }

    reporter("Optimize", 1.0);
  }

  getUpscaledLevels(dimen, goal) {
    let delta = goal/dimen;

    let levels = Math.ceil(Math.log(delta)/Math.log(2.0));
    console.log(goal, "LEVELS", delta, levels, dimen<<levels);

    return levels;
  }

  fillInLut(lut, used, isNormed = false, blur = true) {
    for (let step of this.fillInLutJob(lut, used, isNormed, blur)) {

    }
  }

  * fillInLutJob(lut, used, isNormed = false, blur = true, reporter = function (msg, percent) {
  }) {
    /*

    on factor;

    x1 := 0;
    y1 := 0;
    x2 := 1;
    y2 := 0;

    f1 := (x1 - px)**2 + (y1 - py)**2 - dis1;
    f2 := (x2 - px)**2 + (y2 - py)**2 - dis2;

    ff := solve({f1, f2}, {px, py});

    on fort;
    part(ff, 1, 1);
    part(ff, 1, 2);
    part(ff, 2, 1);
    part(ff, 2, 2);
    off fort;

    */

    let sqrt = Math.sqrt;

    /*given two distance dis1 and dis2, derives a point
    * source and returns two more distances*/
    let geodesic_dist_ret = [0, 0];

    function geodesic_dist(dis1, dis2) {
      if (dis1 === dis2) {
        let ret = geodesic_dist_ret;

        ret[0] = dis1 + 1.0;
        ret[1] = dis1 + 1.0;

        return ret;
      }

      dis1 *= dis1;
      dis2 *= dis2;

      let val = 2.0*(dis2 + 1.0)*dis1 - (dis2 - 1.0)**2 - dis1**2;

      val = Math.abs(val);
      console.log("VAL", val);

      let px2 = (-(dis2 - 1.0) + dis1)/2.0;
      let py2 = sqrt(val)/2.0;

      let x2 = 0;
      let y2 = 1;
      let x3 = 1;
      let y3 = 1;

      let dx2 = x2 - px2;
      let dy2 = y2 - py2;
      let dx3 = x3 - px2;
      let dy3 = y3 - py2;

      dy2 = dy2*dy2 < (y3 + py2)**2 ? y3 + py2 : dy2;
      dy3 = dy3*dy3 < (y3 + py2)**2 ? y3 + py2 : dy3;

      let ret = geodesic_dist_ret;

      ret[0] = Math.sqrt(dx2*dx2 + dy2*dy2);
      ret[1] = Math.sqrt(dx3*dx3 + dy3*dy3);

      return ret;
    }

    window.geodesic_dist = geodesic_dist;

    const dimen = lut.dimen;
    let queue = [];
    let offs = [];

    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          let dis = Math.sqrt(x*x + y*y + z*z);

          offs.push([x, y, z, dis]);
        }
      }
    }

    let DX = 0, DY = 1, DZ = 2, DDIS = 3, DTOT = 4;
    let dis2 = new Float32Array(used.length*DTOT);
    dis2.fill(0.0);

    for (let x = 0; x < dimen; x++) {
      for (let y = 0; y < dimen; y++) {
        for (let z = 0; z < dimen; z++) {
          let idx = dimen*dimen*z + dimen*y + x;

          if (!used[idx]) {
            continue;
          }

          dis2[idx*DTOT] = x;
          dis2[idx*DTOT + 1] = y;
          dis2[idx*DTOT + 2] = z;
          dis2[idx*DTOT + 3] = 0.0;

          queue.push(x);
          queue.push(y);
          queue.push(z);
        }
      }
    }

    //XXX
    //queue.length = 0;

    let used2 = new Uint8Array(used.length);
    let mask = new Uint8Array(used.length);
    let queue2 = [];

    for (let i = 0; i < used.length; i++) {
      used2[i] = used[i];
      mask[i] = !used[i];
    }

    /*
    const offs2 = [
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
      [1, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [1, 1, 1],
      [1, 0, 1],
    ];

    let doStep2 = (step) => {
      let rect = [0, 0, 0, 0];
      let recttmp = [0, 0, 0, 0];

      function rotate(rect, temp, n) {
        for (let i=0; i<rect.length; i++) {
          temp[i] = rect[i];
        }

        for (let i=i; i<rect.length; i++) {
          rect[i] = temp[(i + n) % rect.length];
        }

        return rect;
      }

      for (let i = 0; i < queue.length; i += 3) {
        let x = queue[i], y = queue[i + 1], z = queue[i + 2];
        let idx = dimen*dimen*z + dimen*y + x;

        if (idx < 0 || idx >= lut.length) {
          throw new Error("error!");
        }

        if (!used2[idx]) {
          continue;
        }

        for (let off of offs2) {
          let x2 = x + off[0];
          let y2 = y + off[1];
          let z2 = y + off[2];

          x2 = Math.min(Math.max(x2, 0), dimen-1);
          y2 = Math.min(Math.max(y2, 0), dimen-1);
          z2 = Math.min(Math.max(z2, 0), dimen-1);
        }
      }

      for (let i = 0; i < queue2.length; i += 3) {
        let x = queue2[i], y = queue2[i + 1], z = queue2[i + 2];
        let idx = dimen*dimen*z + dimen*y + x;

        if (!used2[idx]) {
          continue;
        }

        used[idx] = 1;

        if (0) {
          let mul = lut[idx*4] + lut[idx*4 + 1] + lut[idx*4 + 2] + lut[idx*4 + 3];

          if (mul > 0.0) {
            mul = 1.0/mul;
          } else {
            continue;
          }

          lut[idx*4] *= mul;
          lut[idx*4 + 1] *= mul;
          lut[idx*4 + 2] *= mul;
          lut[idx*4 + 3] *= mul;

          used[idx] = 1;
          used2[idx] = 1;
        }
      }

      let tmp = used;
      used = used2;
      used2 = tmp;

      tmp = queue;
      queue = queue2;
      queue2 = tmp;
    } //*/

    let doStep = (step) => {
      for (let i = 0; i < queue.length; i += 3) {
        let x = queue[i], y = queue[i + 1], z = queue[i + 2];
        let idx = dimen*dimen*z + dimen*y + x;

        if (idx < 0 || idx >= lut.length) {
          throw new Error("error!");
        }

        for (let off of offs) {
          let x2 = x + off[0], y2 = y + off[1], z2 = z + off[2];

          if (isNaN(x2) || isNaN(y2) || isNaN(z2)) {
            throw new Error("NaN!");
          }

          if (x2 < 0 || y2 < 0 || z2 < 0 || x2 >= dimen || y2 >= dimen || z2 >= dimen) {
            continue;
          }

          let idx2 = dimen*dimen*z2 + dimen*y2 + x2;

          let srcx = dis2[idx*DTOT];
          let srcy = dis2[idx*DTOT + 1];
          let srcz = dis2[idx*DTOT + 2];

          let dist2 = Math.sqrt((srcx - x2)**2 + (srcy - y2)**2 + (srcz - z2)**2);

          if (!used[idx2]) {
            if (!used2[idx2]) {
              queue2.push(x2);
              queue2.push(y2);
              queue2.push(z2);
            } else if (dist2 > dis2[idx2*DTOT + DDIS]) {
              continue;
            }

            /* transfer source coordinates */
            dis2[idx2*DTOT] = srcx;
            dis2[idx2*DTOT + 1] = srcy;
            dis2[idx2*DTOT + 2] = srcz;

            dis2[idx2*DTOT + DDIS] = dist2;

            used2[idx2] = 1;

            if (isNaN(lut[idx*4])) {
              console.log(lut[idx*4], lut[idx*4 + 1], lut[idx*4 + 2], lut[idx*4 + 3]);

              throw new Error("NaN!");
            }

            let ff = dist2*0.00675;

            if (1) {
              lut[idx2*4] = lut[idx*4];
              lut[idx2*4 + 1] = lut[idx*4 + 1];
              lut[idx2*4 + 2] = lut[idx*4 + 2];
              lut[idx2*4 + 3] = lut[idx*4 + 3];
            } else {
              lut[idx2*4] = ff;
              lut[idx2*4 + 1] = ff;
              lut[idx2*4 + 2] = ff;
              lut[idx2*4 + 3] = ff;
            }
          }
        }
      }

      for (let i = 0; i < queue2.length; i += 3) {
        let x = queue2[i], y = queue2[i + 1], z = queue2[i + 2];
        let idx = dimen*dimen*z + dimen*y + x;

        if (!used2[idx]) {
          continue;
        }

        used[idx] = 1;

        if (0) {
          let mul = lut[idx*4] + lut[idx*4 + 1] + lut[idx*4 + 2] + lut[idx*4 + 3];

          if (mul > 0.0) {
            mul = 1.0/mul;
          } else {
            continue;
          }

          lut[idx*4] *= mul;
          lut[idx*4 + 1] *= mul;
          lut[idx*4 + 2] *= mul;
          lut[idx*4 + 3] *= mul;

          used[idx] = 1;
          used2[idx] = 1;
        }
      }

      let tmp = used;
      used = used2;
      used2 = tmp;

      tmp = queue;
      queue = queue2;
      queue2 = tmp;
    }

    let startlen = queue.length*1.25;

    for (let step = 0; step < 1000; step++) {
      if (queue.length === 0) {
        break;
      }

      queue2.length = 0;
      console.log(queue.length);

      reporter("Fill", queue.length/startlen);
      yield;

      doStep(step);
    }

    reporter("Fill", 1.0);

    return; //XXX

    if (!blur) {
      return;
    }

    console.log("blurring filled in voxels. . .");

    if (!window.__blur3d) {
      this.makeVoxelBlurCode();
    }

    reporter("Blur", 0.5);
    window.__blur3d(lut, mask, isNormed, this.blurRadius);
    reporter("Blur", 1.0);

    return;
    for (let x = 0; x < dimen; x++) {
      for (let y = 0; y < dimen; y++) {
        for (let z = 0; z < dimen; z++) {
          let idx = y*dimen + x;

          if (used[idx] > 0) {
            continue;
          }

          let r = 0, g = 0, b = 0, a = 0;
          let tot = 0.0;

          for (let off of offs) {
            let x2 = x + off, y2 = y + off, z2 = z + off;

            if (x2 < 0 || y2 < 0 || z2 < 0 || x2 >= dimen || y2 >= dimen || z2 >= dimen) {
              continue;
            }

            let li = (z2*dimen*dimen + y2*dimen + x2)*LTOT;

            r += lut[li + 0];
            g += lut[li + 1];
            b += lut[li + 2];
            a += lut[li + 3];

            tot++;
          }

          if (isNormed) {
            tot = r + g + b + a;
          }

          if (!tot) {
            continue;
          }

          tot = 1.0/tot;
          r *= tot;
          g *= tot;
          b *= tot;
          a *= tot;

          let li = (z*dimen*dimen + y*dimen + x)*LTOT;

          lut[li + 0] = r;
          lut[li + 1] = g;
          lut[li + 2] = b;
          lut[li + 1] = a;
        }
      }
    }
  }

  makeVoxelBlurCode() {
    function makeCode(axis1, axis2) {
      let idx = 'let i = ';
      let axis3;

      let axes = [0, 1, 2];
      axes.remove(axis1);
      axes.remove(axis2);

      axis3 = axes[0];

      axes = [axis1, axis2, axis3];

      for (let i = 0; i < 3; i++) {
        let axis = axes[i];
        idx += ("xyz")[i];

        for (let j = 0; j < axis; j++) {
          idx += "*dimen";
        }

        if (i !== 2) {
          idx += " + ";
        }
      }

      idx += ";"


      let s = `
      for (let z=0; z<dimen; z++) {
        for (let x=0; x<dimen; x++) {
          mr.reset();
          mg.reset();
          mb.reset();
          ma.reset();
    
          for (let y=0; y<dimen; y++) {
            ${idx}
    
            let skip = !mask[i];
            
            i *= LTOT;
    
            let r = mr.add(lut[i]);
            let g = mg.add(lut[i+1]);
            let b = mb.add(lut[i+2]);
            let a = ma.add(lut[i+3]);
  
            if (skip) {
              continue;
            }
            
            if (isNormed) {
              let tot = r + g + b + a;
              
              if (tot != 0.0) {
                tot = 1.0 / tot;
                
                r *= tot;
                g *= tot;
                b *= tot;
                a *= tot;
              }
            }
            
            lut[i] = r;
            lut[i+1] = g;
            lut[i+2] = b;
            lut[i=3] = a;
          }
        }
      }
    `;

      return s;
    }

    if (!window.__blur3d) {
      let s = `
window.__blur3d = function __blur3d(lut, mask, isNormed, n=4) {
  const mr = new util.MovingAvg(n);
  const mg = new util.MovingAvg(n);
  const mb = new util.MovingAvg(n);
  const ma = new util.MovingAvg(n);
  
  const dimen = lut.dimen;
  
  ${makeCode(0, 1)}
  ${makeCode(1, 0)}
  ${makeCode(0, 2)}
  ${makeCode(2, 0)}
  ${makeCode(1, 2)}
  ${makeCode(2, 1)}
}
`.trim();

      eval(s);
    }
  }
}

PigmentSet.STRUCT = `
PigmentSet {
  this               : array(Pigment);
  renderCamera       : Camera;
  useCustomKs        : bool;
  k1                 : float;
  k2                 : float;
  blurFilledInPixels : bool;
  blurRadius         : int;
  optimizeFilledIn   : bool;
  optSteps           : int;
  colorScale         : float;
  
  genDimen           : int;
  fillInLut          : bool;
  createReverseLut   : bool;
  upscaleGoal        : int;
  lutQuality         : float;
  doFillInLut        : bool;
  
  blurAll            : bool;
}
`;
simple.DataModel.register(PigmentSet);

export class ColorModel {
  constructor() {
    this.pigments = [];

  }

  static defineAPI(api, st) {

  }
}

ColorModel.STRUCT = `
ColorModel {
  pigments : array(Pigment);
}
`;
simple.DataModel.register(ColorModel);
