import {
  util, nstructjs, Vector2, Vector3,
  Vector4, Matrix4, Quat, math, keymap
} from '../path.ux/scripts/pathux.js';
import {Pigment, pigment_data, WIDE_GAMUT} from './colormodel.js';

import '../util/numeric.js';

window.fftTables = function(scale=0.01) {
  let ps = _appstate.canvas.pigments;

  for (let p of ps) {
    p.updateGen++;
    let lists = [pigment_data.pigmentKS[p.pigment].S, pigment_data.pigmentKS[p.pigment].K];

    for (let i=0; i<lists.length; i++) {
      let a = lists[i];
      let n = a.length;
      let mid = a.mid;

      if (a.phase) {
        for (let j=0; j<a.length; j++) {
          a[j] /= scale;
        }

        numeric.ifftpow2(a, a.phase);

        for (let j=0; j<a.length; j++) {
          a[j] += mid;
        }

        //a.length = n;
        a.phase = undefined;
      } else {
        let b = [];
        for (let j=0; j<n; j++) {
          b.push(j);
        }
        let mid = 0.0;

        for (let j=0; j<a.length; j++) {
          mid += a[j];
        }
        mid /= a.length;

        for (let j=0; j<a.length; j++) {
          a[j] -= mid;
        }

        numeric.fftpow2(a, b);

        for (let j=0; j<a.length; j++) {
          a[j] *= scale;
        }

        //a.length = n;
        //b.length = n;

        a.mid = mid;
        a.phase = b;
      }

      //a.length = b.length = n;
    }
  }
}
let kstemps = util.cachering.fromConstructor(Vector4, 64);
let cstemps = util.cachering.fromConstructor(Vector3, 64);

const MAXIMIZE_GAMUT = WIDE_GAMUT;

window.GRAD_FAC = 1.0;

window.DECAY = 1.0;
window.RANDFAC = 1.0;
window.RANDDECAY = 1.0;
window.HIGH_PASS = 1.0;
window.SOLVERS = 3; //bitmask, 1 is gradient descent, 2 is annealing

/*
window.DECAY = 0.02; window.RANDFAC = 0.4; window.RANDDECAY=0.005; window.HIGH_PASS = 0.001; window.SOLVERS = 2
*/

let last_times = new Map();

function doprint(idx) {
  let time = last_times.get(idx);

  if (time === undefined) {
    time = util.time_ms();
    last_times.set(idx, time);
  }

  if (util.time_ms() - time > 450) {
    let arguments2 = util.list(arguments).slice(1, arguments.length);
    console.log(...arguments2);
    last_times.set(idx, util.time_ms());
  }
}

export class Optimizer {
  constructor(pigments) {
    this.pigments = pigments;
    this.last_log = util.time_ms();
    this.rand = new util.MersenneRandom();
    this.rand2 = new util.MersenneRandom();
    this.stepi = 0;

    this.cdimen = 8;
    this.cube = new Int8Array(this.cdimen**3);
  }

  start() {
    if (this.timer) {
      this.stop();
    }

    console.warn("starting timer");

    this.timer = window.setInterval(() => {
      let time = util.time_ms();

      while (util.time_ms() - time < 60) {
        this.step();
      }
    }, 70);

    this.keydown = (e) => {
      if (e.keyCode === keymap["Escape"]) {
        this.stop();
      }
    }

    window.addEventListener("keydown", this.keydown);
  }

  genPoints() {
    let ps = this.pigments;

    let points = [];
    let totpoint = 256;

    for (let i = 0; i < totpoint; i++) {
      let a = this.rand.random();
      let b = this.rand.random();
      let c = this.rand.random();
      let d = 1.0 - a - b - c;

      if (d < 0.0 || d > 1.0) {
        i--;
        continue;
      }

      points.push(a);
      points.push(b);
      points.push(c);
      points.push(d);
    }

    for (let i = 0; i < 4; i++) {
      points.push(0.0);
      points.push(0.0);
      points.push(0.0);
      points.push(0.0);

      points[points.length - 1 - i] = 1.0;
    }

    for (let i = 0; i < points.length; i += 4) {
      let a = points[i], b = points[i + 1], c = points[i + 2], d = points[i + 3];

      let tot = (a + b + c + d);
      if (tot === 0.0) {
        continue;
      }

      tot = 1.0/tot;

      points[i + 0] *= tot;
      points[i + 1] *= tot;
      points[i + 2] *= tot;
      points[i + 3] *= tot;
    }

    window.points = points;

    return points;
  }

  error(points) {
    let ks = kstemps.next();

    let ps = this.pigments;

    let min = cstemps.next().addScalar(1e17);
    let max = cstemps.next().addScalar(-1e17);

    let cube = this.cube;
    let cdimen = this.cdimen;

    if (MAXIMIZE_GAMUT) {
      cube.fill(0);
    }

    let totcube = 0;

    for (let i = 0; i < points.length; i += 4) {
      ks[0] = points[i];
      ks[1] = points[i + 1];
      ks[2] = points[i + 2];
      ks[3] = points[i + 3];

      let rgb = Pigment.toRGB(ps, ks);

      min.min(rgb);
      max.max(rgb);

      if (MAXIMIZE_GAMUT) {
        let x = ~~(rgb[0]*cdimen);
        let y = ~~(rgb[1]*cdimen);
        let z = ~~(rgb[2]*cdimen);

        if (x >= 0 && y >= 0 && z >= 0 && x < cdimen && y < cdimen && z < cdimen) {
          let idx = z*cdimen*cdimen + y*cdimen + x;

          if (!cube[idx]) {
            cube[idx] = 1;
            totcube++;
          }
        }
      }
    }

    totcube /= cdimen**3;

    let err = 0.0;

    for (let i = 0; i < 3; i++) {
      if (!MAXIMIZE_GAMUT) {
        if (min[i] < 0) {
          err += -min[i];
        }

        if (max[i] > 1.0) {
          err += (max[i] - 1.0);
        }
      } else {
        err += Math.abs(min[i]);
        err += Math.abs(max[i] - 1.0);
      }
    }

    if (MAXIMIZE_GAMUT) {
      err += 2.0*(1.0 - totcube)**2;
    }

    return err;
  }

  gradientDescent(points) {
    let ps = this.pigments;

    let origs;

    if (MAXIMIZE_GAMUT) {
      origs = this.saveOrig(ps);
    }

    let df = MAXIMIZE_GAMUT ? 0.001 : 0.0001;
    let oneDf = 1.0/df;

    let gs = [];
    let r1 = this.error(points);
    let totg = 0.0;

    let gk = MAXIMIZE_GAMUT ? 0.2 : 1.0;
    gk *= window.GRAD_FAC ?? 1.0;

    for (let p of ps) {
      let grads = [[], []];
      gs.push(grads);

      let pdata = pigment_data.pigmentKS[p.pigment];
      let tables = [pdata.K, pdata.S];

      let tablei = 0;
      for (let table of tables) {
        grads[tablei].length = table.length;
        let gs2 = grads[tablei];

        for (let i = 0; i < table.length; i++) {
          let orig = table[i];
          table[i] += df;
          let r2 = this.error(points);
          table[i] = orig;

          let g = gs2[i] = (r2 - r1)*oneDf;
          totg += g*g;
        }

        tablei++;
      }
    }

    if (totg === 0.0) {
      return;
    }

    let scale_g;

    if (MAXIMIZE_GAMUT) {
      let orig = window.COLOR_SCALE;
      window.COLOR_SCALE += df;

      let r2 = this.error(points);
      let g = scale_g = (r2 - r1) / df;

      window.COLOR_SCALE = orig;
      totg += g*g*0.2*0.2;
    }

    r1 /= totg;
    let fac = -r1*0.875*gk;

    for (let i = 0; i < ps.length; i++) {
      let pdata = pigment_data.pigmentKS[ps[i].pigment];
      let tables = [pdata.K, pdata.S];
      let grads = gs[i];

      for (let tablei = 0; tablei < 2; tablei++) {
        let table = tables[tablei];
        let gs2 = grads[tablei];

        for (let j = 0; j < table.length; j++) {
          table[j] += gs2[j]*fac;
          table[j] = Math.max(table[j], 0.0);
        }
      }
    }

    if (MAXIMIZE_GAMUT && r1 < this.error(points)) {
      this.loadOrig(ps, origs);
    }

    if (MAXIMIZE_GAMUT) {
      //window.COLOR_SCALE += fac*scale_g*0.05;
    }

    doprint(0, "totg:", totg, gs);
  }

  saveOrig(ps) {
    let origs = [];

    for (let i = 0; i < ps.length; i++) {
      let pdata = pigment_data.pigmentKS[ps[i].pigment];
      let tables = [pdata.K, pdata.S];

      let orig = [pdata.K.concat([]), pdata.S.concat([])];
      origs.push(orig);
    }

    return origs;
  }

  loadOrig(ps, origs) {
    for (let i = 0; i < ps.length; i++) {
      let pdata = pigment_data.pigmentKS[ps[i].pigment];
      let tables = [pdata.K, pdata.S];
      let orig = origs[i];

      for (let tablei = 0; tablei < 2; tablei++) {
        let table = tables[tablei];
        let otable = orig[tablei];

        for (let j = 0; j < table.length; j++) {
          table[j] = otable[j];
        }
      }
    }
  }

  annealing(points) {
    let ps = this.pigments;

    let r1 = this.error(points);

    let decay = MAXIMIZE_GAMUT ? 0.005 : 0.0005;

    decay *= window.DECAY;

    let rdecay = window.RANDDECAY ?? 1.0;

    let rfac = Math.exp(-this.stepi*0.001*rdecay)*0.2*(window.RANDFAC ?? 1.0);
    let prob = Math.exp(-this.stepi*decay)*0.41;

    doprint(1, rfac.toFixed(4), prob.toFixed(4));
    let origs = [];

    let rand2 = this.rand2;

    for (let i = 0; i < ps.length; i++) {
      let pdata = pigment_data.pigmentKS[ps[i].pigment];
      let tables = [pdata.K, pdata.S];

      let orig = [pdata.K.concat([]), pdata.S.concat([])];
      origs.push(orig);

      for (let tablei = 0; tablei < 2; tablei++) {
        let table = tables[tablei];

        for (let j = 0; j < table.length; j++) {
          if (rand2.random() > 0.1) {
            continue;
          }

          table[j] += (rand2.nrandom() - 0.5)*rfac;
          table[j] = Math.max(table[j], 0.0);
        }
      }
    }

    let r2 = this.error(points);
    let bad = r2 > r1 && rand2.random() > prob;

    if (bad) {
      for (let i = 0; i < ps.length; i++) {
        let pdata = pigment_data.pigmentKS[ps[i].pigment];
        let tables = [pdata.K, pdata.S];
        let orig = origs[i];

        for (let tablei = 0; tablei < 2; tablei++) {
          let table = tables[tablei];
          let otable = orig[tablei];

          for (let j = 0; j < table.length; j++) {
            table[j] = otable[j];
          }
        }
      }
    }
  }

  highPassFilter(err=1.0) {
    let ps = this.pigments;

    for (let i = 0; i < ps.length; i++) {
      let pdata = pigment_data.pigmentKS[ps[i].pigment];
      let tables = [pdata.K, pdata.S];

      for (let tablei = 0; tablei < 2; tablei++) {
        let table = tables[tablei];

        let ma = new util.MovingAvg(8);

        let t = window.HIGH_PASS*0.001*err;

        for (let j = 0; j < table.length; j++) {
          table[j] = ma.add(table[j])*t + table[j]*(1.0-t);
        }
      }
    }
  }

  step() {
    let rate = MAXIMIZE_GAMUT ? 4 : 8;
    rate *= 8;

    this.rand.seed(~~(this.stepi/rate));

    let points = this.genPoints();

    //this.highPassFilter();

    if ((window.SOLVERS & 2) && (this.stepi%2 === 0)) {
      this.annealing(points);
    } else if (window.SOLVERS & 1) {
      this.gradientDescent(points);
    }

    let err = this.error(points);

    this.highPassFilter(err);

    if (MAXIMIZE_GAMUT) {
      doprint(2, "error:", this.stepi%rate, err, "COLOR_SCALE:", window.COLOR_SCALE.toFixed(3));
    } else {
      doprint(2, "error:", this.stepi%rate, err);
    }

    for (let p of this.pigments) {
      p.updateGen++;
    }

    this.stepi++;
  }

  stop() {
    if (this.keydown) {
      window.removeEventListener("keydown", this.keydown);
      this.keydown = undefined;
    }

    if (this.timer) {
      window.clearInterval(this.timer);
      this.timer = undefined;
      console.warn("stopping timer");
    }
  }
}

export function writeTables() {
  function myStringify(obj, replacer, ws, depth = 0) {
    let tab = '';
    for (let i = 0; i < depth; i++) {
      tab += "  ";
    }

    if (typeof obj === "number") {
      return "" + obj;
    } else if (typeof obj === "boolean") {
      return obj ? "true" : "false";
    } else if (typeof obj === "string") {
      return `"${obj}"`;
    } else if (typeof obj === "object") {
      if (obj.toJSON) {
        return myStringify(obj.toJSON(), replacer, ws, depth);
      }

      if (obj instanceof Array) {
        let s = "[";

        let addNewline = false;

        if (obj.length > 0 && typeof obj[0] !== "number") {
          s += "\n";
          addNewline = true;
        }

        for (let i = 0; i < obj.length; i++) {
          if (i > 0) {
            s += ",";
            s += addNewline ? "\n" : " ";
          }

          let chunk = myStringify(obj[i], replacer, ws, depth + 1);
          if (chunk.endsWith("\n")) {
            chunk = chunk.slice(0, chunk.length - 1);
          }

          s += chunk;
        }

        if (addNewline) {
          s += "\n";
        }
        s += "]";

        return s;
      } else {
        let s = tab + "{\n";

        for (let k in obj) {
          let v = obj[k];

          if (typeof v === "function" || v instanceof Function) {
            continue;
          }

          s += tab + `  "${k}" : ${myStringify(v, replacer, ws, depth + 1)},\n`
        }

        s += tab + "}\n";
        return s;
      }
    }

    return "" + obj;
  }

  function replacer(key, val) {
    if (Array.isArray(val) && typeof val[0] === "number") {
      let ret = JSON.stringify(val);

      return ret;
    } else {
      return val;
    }
  }

  let code = `/* WARNING: auto-generated file! */
export const wavelengths = ${JSON.stringify(pigment_data.wavelengths)};
export const pigmentKS = ${myStringify(pigment_data.pigmentKS, replacer, 1)};


export function getPigment(name) {
  for (let pigment of pigmentKS) {
    if (pigment.name === name) {
      return name;
    }
  }
}

`;

  console.log(code);
  //return code;
}

window.writeTables = writeTables;

window.randomizeTables = function () {
  for (let t of pigment_data.pigmentKS) {
    let seed = Math.random();

    for (let i = 0; i < t.K.length; i++) {
      t.K[i] = Math.tent(i*0.05 + seed)*0.5;
    }
    for (let i = 0; i < t.S.length; i++) {
      t.S[i] = Math.tent(i*0.05 + seed + 0.5)*0.5;
    }
  }

  for (let p of _appstate.ctx.canvas.pigments) {
    p.updateGen++;
  }
}