import {simple, util, nstructjs, math, UIBase, Vector3, Vector4, Matrix4} from '../path.ux/scripts/pathux.js';
import * as color from './color.js';
import {freqToWaveLength, getCie65, waveLengthToFreq} from './cie65.js';
import {linear_to_rgb} from './color.js';

import * as pigment_data from './pigment_data.js';

export const lightWaveLengths = [380, 750];
export const lightFreqRange = [waveLengthToFreq(lightWaveLengths[0]), waveLengthToFreq(lightWaveLengths[1])];

Math.tent = f => 1.0 - Math.abs(Math.fract(f) - 0.5)*2.0;
let mat_temps = util.cachering.fromConstructor(Matrix4, 32);

function g(x, mu, o1, o2) {
  if (x < mu) {
    return Math.exp((-0.5*(x - mu)**2)/o1**2);
  } else {
    return Math.exp((-0.5*(x - mu)**2)/o2**2);
  }
}

//xyz chromiticty functions
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

let wdigest = new util.HashDigest();

let lightWaveLengthMul = 1.0/(lightWaveLengths[1] - lightWaveLengths[0]);

export class PigmentWavelet {
  constructor(freq = 300, decay = 300, mag = 300) {
    this.freq = freq;
    this.decay = decay;
    this.mag = mag;
    this.exp = 2.0;
    this.offy = 0.0;

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
    let w = new PigmentWavelet();

    w.freq = this.freq;
    w.decay = this.decay;
    w.mag = this.mag;
    w.exp = this.exp;
    w.offy = this.offy;

    return w;
  }
}

PigmentWavelet.STRUCT = `
PigmentWavelet {
  freq      : double;
  decay     : double;
  mag       : double;
  exp       : double;
  offy      : double;
}
`;
simple.DataModel.register(PigmentWavelet);

let pdigest = new util.HashDigest();
let arrtmp1 = [0];

let mixRGBRets = util.cachering.fromConstructor(Vector4, 512);

let arrtemps = new Array(512);

function getTempArray(n) {
  if (arrtemps[n]) {
    return arrtemps[n].next();
  }

  arrtemps[n] = new util.cachering(() => new Array(n), 32);
  return arrtemps[n].next();
}

export class Pigment {
  constructor() {
    this.useWavelets = false;

    this.updateGen = 0;

    this.k_wavelets = [];
    this.s_wavelets = [];
    this.name = "Pigment";

    this.randfac = 1.0;
    this.pigment = 0; //see pigment_data.js

    this.reset();
  }

  static defineAPI(api, st) {
    st.string("name", "name", "Name");
    st.float("randfac", "randfac", "Rand").range(0.0, 100.0).noUnits();

    st.bool("useWavelets", "useWavelets", "Wavelets");

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

    let lists = ["s_wavelets", "k_wavelets"];

    for (let list of lists) {
      makeList(list);
    }

    return st;
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
    return 1.0 + ratio - Math.sqrt(ratio*ratio + 2.0*ratio);
  }

  static mixRGB_CMYK(cs, ws, dither = true) {
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

  static mixRGB_Simple(pigments, colors, ws, dither = true) {
    let ret = mixRGBRets.next().zero();
    let alpha = 0.0;

    for (let i = 0; i < colors.length; i++) {
      let c = colors[i];

      let linear = color.rgb_to_linear(c[0], c[1], c[2]);

      ret.addFac(linear, ws[i]);
      alpha += c[3]*ws[i];
    }

    ret.load(color.linear_to_rgb(color[0], color[1], color[2]));
    ret[3] = alpha;

    if (dither) {
      ret[0] += (Math.random() - 0.5)/255.0;
      ret[1] += (Math.random() - 0.5)/255.0;
      ret[2] += (Math.random() - 0.5)/255.0;
      ret[3] += (Math.random() - 0.5)/255.0;
    }

    return ret;
  }

  static mixRGB_HSV(colors, ws, dither = true) {
    let ret = mixRGBRets.next().zero();
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

  static mixRGB(pigments, colors, ws, dither = true) {
    //return this.mixRGB_Simple(pigments, colors, ws, dither);
    //return this.mixRGB_CMYK(colors, ws, dither);
    //return this.mixRGB_HSV(colors, ws, dither);

    let cs2 = getTempArray(colors.length);
    let wsb = getTempArray(colors.length);
    let ks = getTempArray(colors.length);
    let ps = pigments;
    let alpha = 0.0;

    for (let i = 0; i < cs2.length; i++) {
      let c = cs2[i] = mixRGBRets.next().load(colors[i]);

      wsb[i] = ws ? ws[i] : 1.0/cs2.length;
      ks[i] = ps.sampleLUT(c[0], c[1], c[2]);

      alpha += colors[i][3]*wsb[i];
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

    let res;

    if (pigments.rlut) {
      let r = ks2[0];
      let g = ks2[1];
      let b = ks2[2];
      let h = ks2[3];

      function error(n) {
        let [r, g, b, h] = n;

        let x = Math.tent(r) + Math.tent(g + 0.5);
        let y = Math.tent(g) + Math.tent(b + 0.5);
        let z = Math.tent(b) + Math.tent(h + 0.5);
        let w = Math.tent(h) + Math.tent(r + 0.5);

        x *= 0.25;
        y *= 0.25;
        z *= 0.25;
        w *= 0.25;

        return (x-ks2[0])**2 + (y-ks2[1])**2 + (z-ks2[2])**2 + (w-ks2[2])**2;
      }

      let dfac = 0.01;

      function error1(n) {
        let [r, g, b, h] = n;
        r *= dfac, g *= dfac, b *= dfac, h *= dfac;
        return ((Math.tent(r) + Math.tent(g + 0.5)) - ks2[0])**2;
      }
      function error2(n) {
        let [r, g, b, h] = n;
        r *= dfac, g *= dfac, b *= dfac, h *= dfac;
        return ((Math.tent(g) + Math.tent(b + 0.5)) - ks2[1])**2;
      }
      function error3(n) {
        let [r, g, b, h] = n;
        r *= dfac, g *= dfac, b *= dfac, h *= dfac;
        return ((Math.tent(b) + Math.tent(h + 0.5)) - ks2[2])**2;
      }

      let gs = getTempArray(4);
      let gs1 = getTempArray(4);
      let gs2 = getTempArray(4);
      let gs3 = getTempArray(4);
      let n = mixRGBRets.next();
      let e = mixRGBRets.next();

      n[0] = ks2[0];
      n[1] = ks2[1];
      n[2] = ks2[2];
      n[3] = ks2[3];

      let doprint = Math.random() > 0.999;
      let mat = mat_temps.next();
      let mat2 = mat_temps.next();
      let mat3 = mat_temps.next();

      for (let step=0; step<25; step++) {
        let r1 = error(n);
        let totg = 0.0;
        let df = 0.000001;

        for (let i=0; i<4; i++) {
          let orig = n[i];
          n[i] += df;
          gs[i] = (error(n) - r1) / df;
          n[i] = orig;
          totg = gs[i]**2;

          n[i] += df;
          gs1[i] = (error1(n) - r1) / df;
          n[i] = orig;
          n[i] += df;
          gs2[i] = (error2(n) - r1) / df;
          n[i] = orig;
          n[i] += df;
          gs3[i] = (error3(n) - r1) / df;
          n[i] = orig;
        }

        if (totg === 0.0) {
          continue;
        }

        let m = mat.$matrix;
        mat.makeIdentity();

        m.m11 = gs1[0];
        m.m21 = gs1[1];
        m.m31 = gs1[2];
        m.m41 = gs1[3];

        m.m12 = gs2[0];
        m.m22 = gs2[1];
        m.m32 = gs2[2];
        m.m42 = gs2[3];

        m.m13 = gs3[0];
        m.m23 = gs3[1];
        m.m33 = gs3[2];
        m.m43 = gs3[3];

        m.m44 = 1.0;

        mat2.load(mat).transpose();
        mat3.load(mat2);

        mat2.multiply(mat);
        let det = mat2.determinant();
        mat2.invert();
        mat2.multiply(mat3);

        if (doprint) {
          //console.log(gs1, gs2, gs3);
          console.log("DET", det);
          console.log("MAT", mat3.toString());
        }

        r1 = -r1/totg*0.9875;

        e[3] = 0.0;
        e.loadXYZ(error1(n), error2(n), error3(n)).multVecMatrix(mat2);
        n.addFac(e, -1.0);

        for (let i=0; i<4; i++) {
        //  n[i] += gs[i]*r1;
        }

        if (doprint) {
          console.log("ERR", error1(n)**2 + error2(n)**2 + error3(n)**2);
        }
      }

      if (doprint) {
        console.log("");
      }

      r = n[0];
      g = n[1];
      b = n[2];

      res = pigments.sampleLUT(r, g, b, pigments.rlut);
    } else {
      res = Pigment.toRGB(ps, ks2);
    }

    let color = mixRGBRets.next().load(res);
    color[3] = alpha;

    return color;
    `
    let c1b = Pigment.toRGB(ps, ws1);
    let c2b = Pigment.toRGB(ps, ws2);

    c1b.sub(c1).negate();
    c2b.sub(c2).negate();
    c2b.interp(c1b, w);

    ws2.interp(ws1, w);

    let mul = ws2[0] + ws2[1] + ws2[2] + ws2[3];
    if (mul !== 0.0) {
      ws2.mulScalar(1.0/mul);
    }

    if (0) {
      ws2.zero();
      ws2[0] = 1.0 - w;
      ws2[2] = w;
      ws2[3] = 0.1;

      let mul = ws2[0] + ws2[1] + ws2[2] + ws2[3];
      ws2.mulScalar(1.0/mul);
    }

    let a = c2[3] + (c1[3] - c2[3])*w;
    c2.load(Pigment.toRGB(ps, ws2));
    c2[3] = a;

    for (let k = 0; k < 3; k++) {
      c2[k] += c2b[k];
      c2[k] = Math.min(Math.max(c2[k], 0.0), 1.0);
    }

    return c2;
    `;
  }

  static toRGB(pigments, ws) {
    let steps = 16;
    let w1 = lightWaveLengths[0];
    let w2 = lightWaveLengths[1];

    let k1 = 0.030, k2 = 0.650;

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

    let K = 1.0;
    let mul = sumn !== 0.0 ? K/sumn : 0.0;

    sumx *= mul;
    sumy *= mul;
    sumz *= mul;

    //return [sumx, sumy, sumz];

    return color.xyz_to_rgb(sumx, sumy, sumz);
  }

  checkTables() {
    for (let list of [this.k_wavelets, this.s_wavelets]) {
      for (let w of list) {
        w.checkTable();
      }
    }

    return this;
  }

  sort() {
    this.s_wavelets.sort((a, b) => a.freq - b.freq);
    this.k_wavelets.sort((a, b) => a.freq - b.freq);
  }

  loadSTRUCT(reader) {
    reader(this);
    this.sort();
  }

  toJSON() {
    return JSON.stringify({
      name       : this.name,
      ks         : this.k_wavelets,
      ss         : this.s_wavelets,
      useWavelets: this.useWavelets,
      pigment    : this.pigment
    });
  }

  loadJSON(json) {
    this.name = json.name;
    this.k_wavelets.length = 0;
    this.s_wavelets.length = 0;

    for (let w of json.ks) {
      this.k_wavelets.push(new PigmentWavelet().loadJSON(w));
    }

    for (let w of json.ss) {
      this.s_wavelets.push(new PigmentWavelet().loadJSON(w));
    }

    return this;
  }

  hash(digest = pdigest.reset()) {
    digest.add(this.name);
    digest.add(this.pigment);
    digest.add(this.useWavelets);
    digest.add(this.updateGen);

    for (let w of this.k_wavelets) {
      w.hash(digest);
    }

    for (let w of this.s_wavelets) {
      w.hash(digest);
    }

    return digest.get();
  }

  reset(k = 0.7, decayk = 0.3, s = 0.2, decays = 0.1) {
    this.k_wavelets.length = 0;
    this.s_wavelets.length = 0;

    //C.brush.pigment.reset(0.7, 0.3, 0.2, 0.1).scaleS(1.0);

    let wid = lightWaveLengths[1] - lightWaveLengths[0];
    this.addWavelet(this.s_wavelets, lightWaveLengths[0] + wid*s, wid*decays, 100.0);
    this.addWavelet(this.k_wavelets, lightWaveLengths[0] + wid*k, wid*decayk, 10.0);

    s += 0.05;
    k += 0.05;
    this.addWavelet(this.s_wavelets, lightWaveLengths[0] + wid*s, wid*decays, 100.0);
    //this.addWavelet(this.k_wavelets, lightWaveLengths[0] + wid*k, wid*decayk, 100.0);

    return this;
  }

  optimizePigmentData() {

  }

  findClosestRGB(steps = 10, rgb) {
    if (rgb) {
      let hsv = color.rgb_to_hsv(rgb[0], rgb[1], rgb[2]);
      let hue = 1.0 - hsv[0];
      hue = hue*0.2 + 0.6;

      hue = lightWaveLengths[1]*(1.0 - hue) + lightWaveLengths[0]*hue;
      console.log("HUE", hue);

      this.s_wavelets[0].freq = hue - 0.1;
      this.s_wavelets[1].freq = hue + 0.1;
      //this.k_wavelets[0].mag = 0.5;
      //this.k_wavelets[1].mag = 0.5;
    }

    for (let i = 0; i < steps; i++) {
      this.findClosestRGB_intern(rgb, i);
    }
  }

  randomize(fac = 1.0) {
    let lists = [this.k_wavelets, this.s_wavelets];

    for (let ws of lists) {
      for (let w of ws) {
        w.freq += (Math.random() - 0.5)*fac*20.0;
        w.decay += (Math.random() - 0.5)*fac*10.0;
        w.mag += (Math.random() - 0.5)*fac;

        w.mag = Math.max(w.mag, 0.0001);
        w.decay = Math.max(w.decay, 0.0001);
        w.freq = Math.max(w.freq, 0.0001);

        w.freq = Math.min(w.freq, lightWaveLengths[1]);
      }
    }

    return this;
  }

  findClosestRGB_intern(rgb, stepi) {
    let errorf1 = () => {
      let rgb = this.toRGB();

      let err = 0.0;

      for (let i = 0; i < 3; i++) {
        if (rgb[i] < 0.0) {
          err += -rgb[i];
        } else if (rgb[i] > 1.0) {
          err += rgb[i] - 1.0;
        }
      }

      err /= Math.min(0.001 + rgb[0]*rgb[0] + rgb[1]*rgb[1] + rgb[2]*rgb[2], 1.0);

      return err;
    }

    let errorf2 = () => {
      let rgb2 = this.toRGB();

      let dx = rgb[0] - rgb2[0];
      let dy = rgb[1] - rgb2[1];
      let dz = rgb[2] - rgb2[2];

      let f = dx*dx + dy*dy + dz*dz;

      if (isNaN(f)) {
        console.error(dx, dy, dz, rgb, rgb2);
        this.toRGB();

        throw new Error("NaN!");
        return 0.0;
      }

      return Math.sqrt(f);
    }

    let lists = [this.s_wavelets, this.k_wavelets];
    let pdata = pigment_data.pigmentKS[this.pigment];
    let plists = [pdata.S, pdata.K];
    let wavelens = pigment_data.wavelengths;

    let errorf3 = () => {
      let i = 0;
      let err = 0.0;

      for (let list of lists) {
        for (let j = 0; j < plists[i].length; j++) {
          let f2 = plists[i][j];
          let f1 = this.evalWavelets(list, wavelens[j]);
          err += (f1 - f2)**2;
        }

        i++;
      }

      return err;
    }


    for (let ws of lists) {
      for (let w of ws) {
        w.useTables = false;
      }
    }

    let errorf = errorf3; //rgb ? errorf2 : errorf1;
    let starterr;

    let r1 = starterr = errorf();
    //console.log("err", r1);


    let gs = [];
    let df = 0.0025;

    let lists2 = [];
    for (let list of lists) {
      let list2 = [];
      lists2.push(list2);

      for (let w of list) {
        list2.push(w.copy());
      }
    }

    for (let ws of lists) {
      for (let w of ws) {
        let orig;

        orig = w.freq;
        w.freq += df;
        gs.push((errorf() - r1)/df);
        w.freq = orig;

        orig = w.decay;
        w.decay += df;
        gs.push((errorf() - r1)/df);
        w.decay = orig;

        orig = w.mag;
        w.mag += df;
        gs.push((errorf() - r1)/df);
        w.mag = orig;

        orig = w.exp;
        w.exp += df;
        gs.push((errorf() - r1)/df);
        w.exp = orig;

        orig = w.offy;
        w.offy += df;
        gs.push((errorf() - r1)/df);
        w.offy = orig;
      }
    }


    let totg = 0.0;
    for (let g of gs) {
      totg += g*g;
    }

    //console.log(gs, totg, totg === 0.0);

    if (totg === 0.0) {
      r1 = 1.0; //will have to rely purely on stochastic
    } else {
      r1 /= totg;
    }

    if (isNaN(totg)) {
      throw new Error("NaN!");
    }

    //console.log(gs);
    let gi = 0;

    //console.log(totg, r1);

    let rk = Math.exp(-stepi*0.00005)*3.0*this.randfac;
    let prob = Math.exp(-stepi*0.00025);

    for (let ws of lists) {
      let fac2 = ws === lists[1] ? 1.0 : 1.0;
      let fac = -r1*0.75;

      for (let w of ws) {
        w.freq += gs[gi++]*fac*1.5 + fac2*(Math.random() - 0.5)*rk*4.0;
        w.decay += gs[gi++]*fac + fac2*(Math.random() - 0.5)*rk*2.0;
        w.mag += gs[gi++]*fac*0.5 + fac2*(Math.random() - 0.5)*rk;
        w.exp += gs[gi++]*fac + fac2*(Math.random() - 0.5)*rk*0.5;
        w.offy += gs[gi++]*fac*0.1 + fac2*(Math.random() - 0.5)*rk*0.1;

        w.decay = Math.min(w.decay, (lightWaveLengths[1] - lightWaveLengths[0])*0.5);
        w.decay = Math.max(w.decay, 25.0);

        w.offy = Math.max(w.offy, 0.0);
        w.freq = Math.min(Math.max(w.freq, lightWaveLengths[0]), lightWaveLengths[1]);
        w.mag = Math.max(w.mag, 0.00001);
        w.exp = Math.min(Math.max(w.exp, 1.5), 100.0);
      }
    }

    let err = errorf();
    if (Math.random() > 0.95) {
      console.log("err", err.toFixed(3), rk.toFixed(4), prob.toFixed(4));
    }

    let bad = err > starterr;
    bad = bad && Math.random() > prob;

    if (bad) {// || this.toRGB().vectorLength() < 0.01) {
      this.s_wavelets = lists2[0];
      this.k_wavelets = lists2[1];
    }

    for (let ws of lists) {
      for (let w of ws) {
        w.useTables = true;
      }
    }

    //this.sort();
  }

  scaleK(mul = 1.0) {
    for (let w of this.k_wavelets) {
      w.mag *= mul;
    }

    return this;
  }

  scaleS(mul = 1.0) {
    for (let w of this.s_wavelets) {
      w.mag *= mul;
    }

    return this;
  }

  copy() {
    let ret = new Pigment();
    let lists = [];

    for (let list of [this.s_wavelets, this.k_wavelets]) {
      let list2 = [];

      for (let w of list) {
        list2.push(w.copy());
      }

      lists.push(list2);
    }

    ret.s_wavelets = lists[0];
    ret.k_wavelets = lists[1];
    ret.pigment = this.pigment;
    ret.useWavelets = this.useWavelets;

    return ret;
  }

  addWavelet(wavelets, freq, decay, mag) {
    wavelets.push(new PigmentWavelet(freq, decay, mag));
  }

  evalWavelet(wavelets, wi, f) {
    let w = wavelets[wi];
    return w.evaluate(f);
  }

  evalWavelets(ws, freq) {
    if (!this.useWavelets) {
      freq *= 0.1;
      freq = Math.min(Math.max(freq, 38), 75);
      freq -= 38;

      let pdata = pigment_data.pigmentKS[this.pigment];

      let i1 = ~~freq;
      let t = Math.fract(freq);

      if (i1 >= pigment_data.wavelengths.length - 1) {
        i1 = pigment_data.wavelengths.length - 1;
        return ws === this.k_wavelets ? pdata.K[i1] : pdata.S[i1];
      } else {
        let a = ws === this.k_wavelets ? pdata.K[i1] : pdata.S[i1];
        let b = ws === this.k_wavelets ? pdata.K[i1 + 1] : pdata.S[i1 + 1];

        return a + (b - a)*t;
      }
    }

    let f = 0.0;
    let tot = 0.0;

    for (let wi = 0; wi < ws.length; wi++) {
      f += this.evalWavelet(ws, wi, freq);
      tot += 1.0;
    }

    f = tot !== 0.0 ? f/tot : 0.0;

    if (isNaN(f)) {
      debugger;
      console.error("NaN!");
      return 0.0;
    }

    return f;
  }

  K(wavelen, extras, ws) { //absorbance
    return this.evalWavelets(this.k_wavelets, wavelen);
  }

  S(wavelen) { //scattering
    return this.evalWavelets(this.s_wavelets, wavelen);
  }

  R(wavelen, extras) {
    let K = this.K(wavelen);
    let S = this.S(wavelen);

    if (Math.abs(S) > 0.00001) {
      return 0.0;
    }

    let ratio = K/S;
    return 1.0 + ratio - Math.sqrt(ratio*ratio + 2.0*ratio);
  }

  toRGB() {
    let arr = arrtmp1;
    arr[0] = this;

    return Pigment.toRGB(arr);
  }
}

Pigment.STRUCT = `
Pigment {
  name          : string; 
  k_wavelets    : array(PigmentWavelet);
  s_wavelets    : array(PigmentWavelet);
  randfac       : double;
  pigment       : int;
  useWavelets   : bool;
}
`;
simple.DataModel.register(Pigment);

let LC = 0, LM = 1, LY = 2, LK = 3, LTOT = 4;

let sampleRets = util.cachering.fromConstructor(Vector4, 1024);

export class PigmentSet extends Array {
  constructor() {
    super();

    this._last_hash = undefined;
    this.lut = undefined;
  }

  loadSTRUCT(reader) {
    reader(this);
  }

  copy() {
    let ret = new PigmentSet();

    for (let item of this) {
      ret.push(item.copy());
    }

    return ret;
  }

  checkLUT() {
    if (!this.lut) {
      this.makeLUTs();
      return;
    }

    let hash = new util.HashDigest();
    for (let p of this) {
      p.hash(hash);
    }

    hash = hash.get();
    if (hash !== this._last_hash) {
      this._last_hash = hash;
      this.makeLUTs();
    }
  }

  sampleLUT(r, g, b, lut = this.lut) {
    if (!lut) {
      this.makeLUTs();
      lut = this.lut;
    }

    r = Math.min(Math.max(r, 0.0), 1.0)*0.9999;
    g = Math.min(Math.max(g, 0.0), 1.0)*0.9999;
    b = Math.min(Math.max(b, 0.0), 1.0)*0.9999;

    let dimen = this.dimen;

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

    //return c1;

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

    let mul = r1[0] + r1[1] + r1[2] + r1[3];
    if (mul !== 0.0) {
      r1.mulScalar(1.0/mul);
    }

    return r1;
  }

  _sampleLUT(x, y, z, lut) {
    let dimen = this.dimen;

    x = Math.min(Math.max(x, 0), dimen - 1);
    y = Math.min(Math.max(y, 0), dimen - 1);
    z = Math.min(Math.max(z, 0), dimen - 1);

    let idx = (z*dimen*dimen + y*dimen + x)*4;

    let ret = sampleRets.next();
    ret[0] = lut[idx];
    ret[1] = lut[idx + 1];
    ret[2] = lut[idx + 2];
    ret[3] = lut[idx + 3];

    return ret;
  }

  makeLUTImage(lut = this.lut, dimen, makeRev = false) {
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
      lut = this.lut;
    }

    if (!dimen) {
      dimen = this.dimen;
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

          idata[idx] = lut[li]*255;
          idata[idx + 1] = lut[li + 1]*255;
          idata[idx + 2] = lut[li + 2]*255;
          idata[idx + 3] = 255; //they all sum to one, can afford to use alpha at one
        }
      }

      sx += dimen;
    }

    g.putImageData(image, 0, 0);

    console.log(tilei);

    canvas.toBlob((blob) => {
      let url = URL.createObjectURL(blob);

      console.log(url);
      window.open(url);
    });

  }

  makeReverseLut(dimen = 8) {
    let lut = this.rlut = new Float32Array(dimen*dimen*dimen*LTOT);

    lut.dimen = dimen;

    let c = new Vector4();
    c[3] = 1.0;

    let ps = this;
    let time = util.time_ms();
    let itot = dimen*dimen*dimen;
    let tot = 0;

    let cos = Math.cos, sin = Math.sin, atan = Math.atan;
    let sqrt = Math.sqrt, pow = Math.pow, atan2 = Math.atan2;
    let fract = Math.fract, tent = Math.tent;

    for (let x = 0; x < dimen; x++) {
      for (let y = 0; y < dimen; y++) {
        for (let z = 0; z < dimen; z++) {
          let r = x/dimen, g = y/dimen, b = z/dimen;

          let dfac = 0.5;
          r *= dfac;
          g *= dfac;
          b *= dfac;

          //r *= Math.PI*dfac;
          //g *= Math.PI*dfac;
          //b *= Math.PI*dfac;

          //c[3] = 0.0;

          /*
          on factor;
          load_package trigsimp;

          f1 := cos(r) + sin(g);
          f2 := cos(g) + sin(b);
          f3 := cos(b) + sin(h);
          f4 := cos(h) + sin(r);
          f5 := 4.0 - (f1+f2+f3+f4);

          ff := solve(f5, h);

          on fort;
          part(ff, 1, 2);
          part(ff, 2, 2);
          off fort;

          * */
          //c[3] = 1.0 - (r + g + b);

          let h1 = 2.0*atan2((sqrt(-2.0*(sin(r) - 4.0 + sin(g) +
                sin(b) + cos(r) + cos(g))*cos(b) - 2.0*(sin(r) - 4.0 + sin(g) + sin(b) + cos(r))
              *cos(g) - 2.0*(sin(r) - 4.0 + sin(g) + sin(b))*cos(r) - 2.0*(sin(r) -
                4.0 + sin(g))*sin(b) - 2.0*(sin(r) - 4.0)*sin(g) + 8.0*sin(r) - 17.0)
            - 1.0), (sin(r) - 5.0 + sin(g) + sin(b) + cos(r) + cos(g) + cos(b)));

          let h2 = 2.0*atan2((sqrt(-2.0*(sin(r) - 4.0 + sin(g) +
                sin(b) + cos(r) + cos(g))*cos(b) - 2.0*(sin(r) - 4.0 + sin(g) + sin(b) + cos(r))
              *cos(g) - 2.0*(sin(r) - 4.0 + sin(g) + sin(b))*cos(r) - 2.0*(sin(r) -
                4.0 + sin(g))*sin(b) - 2.0*(sin(r) - 4.0)*sin(g) + 8.0*sin(r) - 17.0)
            + 1.0), (sin(r) - 5.0 + sin(g) + sin(b) + cos(r) + cos(g) + cos(b)));

          let h = h1;

          c[0] = Math.tent(r) + Math.tent(g+0.5);
          c[1] = Math.tent(g) + Math.tent(b+0.5);
          c[2] = Math.tent(b) + Math.tent(h+0.5);
          c[3] = Math.tent(h) + Math.tent(r+0.5);

          /*
          x = tent(r) + tent(g+0.5);
          y = tent(g) + tent(b+0.5);
          z = tent(b) + tent(w+0.5);
          w = tent(w) + tent(r+0.5);
          dx = 2;
          dy = 2;
          dz = 2;
          dw = 2;


          */
          c.mulScalar(1.0/4.0);
          //c.mul(c);
          //c.normalize();

          /*
          on factor;
          off period;

          fw := 1.0 - (x+y+z)/1.0;

          tot := x + y + z + fw;

          fx := x / tot;
          fy := y / tot;
          fz := z / tot;

          f1 := ix - fx;
          f2 := iy - fy;
          f3 := iz - fz;

          ff := solve({f1, f2, f3}, {x, y, z});

          on fort;
          part(ff, 1, 1);
          part(ff, 1, 2);
          part(ff, 1, 3);
          off fort;

          sub(ix=1, iy=0, iz=0, part(ff, 1, 1));

          **/
          if (0) {
            c[0] = x/dimen;
            c[1] = y/dimen;
            c[2] = z/dimen;
            c[3] = 1.0 - (c[0] + c[1] + c[2])/3.0;

            let tot = (c[0] + c[1] + c[2] + c[3]);
            tot = tot !== 0.0 ? 1.0/tot : 0.0;

            c.mulScalar(tot);
          }

          //c.abs();

          if (Math.abs((c[0] + c[1] + c[2] + c[3]) - 1.0) > 0.01) {
            continue;
          }

          //c.mulScalar(0.5).addScalar(0.5);

          let c2 = Pigment.toRGB(ps, c);

          let li = (z*dimen*dimen + y*dimen + x)*LTOT;

          lut[li] = c2[0];
          lut[li + 1] = c2[1];
          lut[li + 2] = c2[2];

          if (util.time_ms() - time > 500) {
            time = util.time_ms();
            let perc = (100.0*tot/itot).toFixed(3) + "%";

            console.log(`${perc}: doing ${tot + 1} of ${itot}`);
          }

          tot++;
        }
      }
    }

    console.log("Made reverse LUT");
  }

  makeLUTs(dimen = 8) {
    let ds = 1.0/(dimen - 1);

    let lut = this.lut = new Float32Array(dimen*dimen*dimen*LTOT);
    for (let i = 0; i < lut.length; i++) {
      lut[i] = 0.0;
    }

    this.dimen = dimen;
    let tot = 0;

    let used = new Uint16Array(dimen*dimen*dimen);

    let time = util.time_ms();
    let ws = new Vector4();
    let min = new Vector3(), max = new Vector3();

    min.addScalar(1e17);
    max.subScalar(1e17);
    let rgb = new Vector3();
    let itot = dimen*dimen*dimen*dimen;

    for (let c = 0; c < dimen; c++) {
      for (let m = 0; m < dimen; m++) {
        for (let y = 0; y < dimen; y++) {
          for (let k = 0; k < dimen; k++) {
            let i = k*dimen*dimen*dimen + y*dimen*dimen + m*dimen + c;

            let mul = (c + m + y + k);
            if (mul === 0.0) {
              continue;
            }

            mul = 1.0/mul;

            ws[0] = c*mul;
            ws[1] = m*mul;
            ws[2] = y*mul;
            ws[3] = k*mul;

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
            used[idx/4]++;

            lut[idx] += ws[0];
            lut[idx + 1] += ws[1];
            lut[idx + 2] += ws[2];
            lut[idx + 3] += ws[3];

            if (isNaN(ws.dot(ws))) {
              console.warn(ws);
              throw new Error("NaN!");
            }

            if (isNaN(rgb.dot(rgb))) {
              console.warn(rgb, i, ws);
              throw new Error("NaN!");
            }

            if (util.time_ms() - time > 225) {
              //console.log(rgb, idx, ws, ir, ig, ib);
              console.log(ws, i);
              let perc = (100.0*tot/itot).toFixed(3) + "%";

              console.log(`${perc}: doing ${tot + 1} of ${itot}`);
              time = util.time_ms();
            }

            tot++;
          }
        }
      }
    }

    for (let i = 0; i < lut.length; i += 4) {
      if (!used[i>>2]) {
        continue;
      }

      let w = lut[i] + lut[i + 1] + lut[i + 2] + lut[i + 3];
      used[i>>2] = 1.0;

      if (w) {
        w = 1.0/w;

        lut[i] *= w;
        lut[i + 1] *= w;
        lut[i + 2] *= w;
        lut[i + 3] *= w;
      }
    }

    let offs = [];

    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          offs.push([x, y, z]);
        }
      }
    }

    console.log("max", min, "max", max);
    console.log("propegating into empty spaces. . .");

    let queue = [];

    for (let x = 0; x < dimen; x++) {
      for (let y = 0; y < dimen; y++) {
        for (let z = 0; z < dimen; z++) {
          let idx = dimen*dimen*z + dimen*y + x;

          if (!used[idx]) {
            continue;
          }

          queue.push(x);
          queue.push(y);
          queue.push(z);
        }
      }
    }

    let used2 = new Uint16Array();
    let queue2 = [];

    for (let i = 0; i < used.length; i++) {
      used[i] = used2[i];
    }

    for (let step = 0; step < 1000; step++) {
      if (queue.length === 0) {
        break;
      }

      queue2.length = 0;
      console.log(queue.length);

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

          if (!used[idx2]) {
            if (!used2[idx2]) {
              queue2.push(x2);
              queue2.push(y2);
              queue2.push(z2);
            }

            used2[idx2] += 1;

            if (isNaN(lut[idx*4])) {
              console.log(lut[idx*4], lut[idx*4 + 1], lut[idx*4 + 2], lut[idx*4 + 3]);

              throw new Error("NaN!");
            }

            let f = 0.001;

            lut[idx2*4] += lut[idx*4]*f;
            lut[idx2*4 + 1] += lut[idx*4 + 1]*f;
            lut[idx2*4 + 2] += lut[idx*4 + 2]*f;
            lut[idx2*4 + 3] += lut[idx*4 + 3]*f;
          }
        }
      }

      for (let i = 0; i < queue2.length; i += 3) {
        let x = queue2[i], y = queue2[i + 1], z = queue2[i + 2];
        let idx = dimen*dimen*z + dimen*y + x;

        if (!used2[idx]) {
          continue;
        }

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

        used2[idx] = 1;
      }

      let tmp = used;
      used = used2;
      used2 = tmp;

      tmp = queue;
      queue = queue2;
      queue2 = tmp;
    }

    console.log("TOT", tot);
    this.makeReverseLut(dimen);

    return lut;
  }
}

PigmentSet.STRUCT = `
PigmentSet {
  this : array(Pigment);
}
`;
nstructjs.register(PigmentSet);

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
