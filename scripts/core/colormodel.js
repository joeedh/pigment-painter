import {simple, util, nstructjs, math, UIBase, Vector3, Vector4} from '../path.ux/scripts/pathux.js';
import * as color from './color.js';
import {freqToWaveLength, getCie65, waveLengthToFreq} from './cie65.js';
import {linear_to_rgb} from './color.js';

export const lightWaveLengths = [300, 830];
export const lightFreqRange = [waveLengthToFreq(lightWaveLengths[0]), waveLengthToFreq(lightWaveLengths[1])];

Math.tent = f => 1.0 - Math.abs(Math.fract(f) - 0.5)*2.0;

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
    this.k_wavelets = [];
    this.s_wavelets = [];
    this.name = "Pigment";

    this.randfac = 1.0;

    this.reset();
  }

  static defineAPI(api, st) {
    st.string("name", "name", "Name");
    st.float("randfac", "randfac", "Rand").range(0.0, 100.0).noUnits();

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

        let sfac = w2*(1.0-w);
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
      ks2.mulScalar(1.0 / w);
    }

    let color = mixRGBRets.next().load(Pigment.toRGB(ps, ks2));
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
    let steps = 8;
    let w1 = lightWaveLengths[0];
    let w2 = lightWaveLengths[1];

    let k1 = -0.3, k2 = 0.4;

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
      name: this.name,
      ks  : this.k_wavelets,
      ss  : this.s_wavelets
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

    for (let ws of lists) {
      for (let w of ws) {
        w.useTables = false;
      }
    }

    let errorf = rgb ? errorf2 : errorf1;
    let starterr;

    let r1 = starterr = errorf();
    //console.log("err", r1);


    let gs = [];
    let df = 0.001;

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
    let prob = Math.exp(-stepi*0.000055);

    for (let ws of lists) {
      let fac2 = ws === lists[1] ? 1.0 : 0.25;
      let fac = -r1*0.2*fac2;

      for (let w of ws) {
        w.freq += gs[gi++]*fac + fac2*(Math.random() - 0.5)*rk*4.0;
        w.decay += gs[gi++]*fac + fac2*(Math.random() - 0.5)*rk*2.0;
        w.mag += gs[gi++]*fac + fac2*(Math.random() - 0.5)*rk;
        w.exp += gs[gi++]*fac*0.1 + fac2*(Math.random() - 0.5)*rk*0.01;
        w.offy += gs[gi++]*fac*0.1 + fac2*(Math.random() - 0.5)*rk*0.01;

        w.decay = Math.min(w.decay, (lightWaveLengths[1] - lightWaveLengths[0])*0.5);
        w.decay = Math.max(w.decay, 0.0001);

        w.offy = Math.max(w.offy, 0.0);
        w.freq = Math.min(Math.max(w.freq, lightWaveLengths[0]), lightWaveLengths[1]);
        w.mag = Math.max(w.mag, 0.00001);
        w.exp = Math.min(Math.max(w.exp, 0.1), 100.0);
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

  sampleLUT(r, g, b) {
    if (!this.lut) {
      this.makeLUTs();
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

    c1 = this._sampleLUT(ir, ig, ib);

    //return c1;

    c2 = this._sampleLUT(ir, ig + 1, ib);
    c3 = this._sampleLUT(ir + 1, ig + 1, ib);
    c4 = this._sampleLUT(ir + 1, ig, ib);

    let k1 = sampleRets.next(), k2 = sampleRets.next();
    k1.load(c1).interp(c2, v);
    k2.load(c4).interp(c3, v);

    let r1 = sampleRets.next().load(k1).interp(k2, u);

    c1 = this._sampleLUT(ir, ig, ib + 1);
    c2 = this._sampleLUT(ir, ig + 1, ib + 1);
    c3 = this._sampleLUT(ir + 1, ig + 1, ib + 1);
    c4 = this._sampleLUT(ir + 1, ig, ib + 1);

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

  _sampleLUT(x, y, z, out) {
    let dimen = this.dimen;
    let lut = this.lut;

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
              console.log(`doing ${i + 1} of ${itot}`);
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
