import {
  util, nstructjs, Vector2, Vector3,
  Vector4, Matrix4, Quat, math, keymap, simple
} from '../path.ux/scripts/pathux.js';
import {KTOT, Pigment, pigment_data, setInsideSolver, START_REFL_K1, START_REFL_K2, WIDE_GAMUT} from './colormodel.js';

import '../util/numeric.js';


export const SolverFlags = {
  NEWTON   : 1,
  ANNEALING: 2,
  HIGH_PASS: 4,
  STRETCH  : 8,
}

export class SolverSettings {
  constructor() {
    this.flag = SolverFlags.NEWTON | SolverFlags.ANNEALING;
    this.randFac = 0.5;
    this.newtonStep = 0.5;
    this.subPoints = 256;
    this.highPassFac = 0.5;
    this.errorOut = 0.0;
    this.pointSubSteps = 5;
  }

  static defineAPI(api, st) {
    st.flags("flag", "flag", SolverFlags, "Solver Flags");
    st.float("randFac", "randFac", "Random")
      .noUnits()
      .range(0.0, 5.0);
    st.float("newtonStep", "newtonStep", "NewtonStep")
      .noUnits()
      .range(0.0, 1.0);
    st.int("subPoints", "subPoints", "Subpoints")
      .noUnits()
      .range(8, 8192)
      .step(15);
    st.float("highPassFac", "highPassFac", "High Pass")
      .noUnits()
      .range(0.0, 1.0);
    st.float("errorOut", "errorOut", "Error")
      .readOnly()
      .noUnits()
      .decimalPlaces(4);
    st.int("pointSubSteps", "pointSubSteps", "Point Steps", "How many iterations to use the same point set")
      .noUnits()
      .range(1, 100)
      .slideSpeed(3);
  }
}

SolverSettings.STRUCT = `
SolverSettings {
  flag           : int;
  randFac        : float;
  newtonStep     : float;
  subPoints      : int;
  highPassFac    : float;
  pointSubSteps  : int;
}
`;
simple.DataModel.register(SolverSettings);

window.fftTables = function (scale = 0.01) {
  let ps = _appstate.canvas.pigments;

  for (let p of ps) {
    p.updateGen++;
    let lists = [pigment_data.pigmentKS[p.pigment].S, pigment_data.pigmentKS[p.pigment].K];

    for (let i = 0; i < lists.length; i++) {
      let a = lists[i];
      let n = a.length;
      let mid = a.mid;

      if (a.phase) {
        for (let j = 0; j < a.length; j++) {
          a[j] /= scale;
        }

        numeric.ifftpow2(a, a.phase);

        for (let j = 0; j < a.length; j++) {
          a[j] += mid;
        }

        //a.length = n;
        a.phase = undefined;
      } else {
        let b = [];
        for (let j = 0; j < n; j++) {
          b.push(j);
        }
        let mid = 0.0;

        for (let j = 0; j < a.length; j++) {
          mid += a[j];
        }
        mid /= a.length;

        for (let j = 0; j < a.length; j++) {
          a[j] -= mid;
        }

        numeric.fftpow2(a, b);

        for (let j = 0; j < a.length; j++) {
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
  constructor(pigments, settings) {
    this.pigments = pigments;
    this.last_log = util.time_ms();
    this.rand = new util.MersenneRandom();
    this.rand2 = new util.MersenneRandom();
    this.stepi = 0;

    this.startseed = Math.random();

    this.settings = settings;
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
    const ps = this.pigments;

    let points = [];
    const totpoint = this.settings.subPoints;

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

    let optMode = 0;
    if (this.settings.flag & SolverFlags.STRETCH) {
      optMode = 1;
    }

    let ps = this.pigments;

    let min = cstemps.next().addScalar(1e17);
    let max = cstemps.next().addScalar(-1e17);

    let cube = this.cube;
    let cdimen = this.cdimen;

    if (optMode) {
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

      if (optMode) {
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
      if (!optMode) {
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

    if (optMode) {
      if (!MAXIMIZE_GAMUT) {
        err *= 1.0 + 0.15*(1.0 - totcube)**2
      } else {
        err += 2.0*(1.0 - totcube)**2;
      }
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
    gk *= this.settings.newtonStep;

    for (let p of ps) {
      let grads = [[], []];
      gs.push(grads);

      let {tables, step, stepRange} = this.getTables(p);

      let tablei = 0;
      for (let table of tables) {
        grads[tablei].length = table.length;
        let gs2 = grads[tablei];

        for (let i = 0; i < table.length; i += step) {
          for (let j = 0; j < stepRange; j++) {
            let orig = table[i + j];
            table[i + j] += df;
            let r2 = this.error(points);
            table[i + j] = orig;

            let g = gs2[i + j] = (r2 - r1)*oneDf;
            totg += g*g;
          }
        }

        tablei++;
      }
    }

    if (totg === 0.0) {
      return;
    }

    let scale_g;

    const SOLVE_COLOR_SCALE = false; //MAXIMIZE_GAMUT;

    if (SOLVE_COLOR_SCALE) {
      let orig = ps.colorScale;
      ps.colorScale += df;

      let r2 = this.error(points);
      let g = scale_g = (r2 - r1)/df;

      ps.colorScale = orig;
      totg += g*g*0.2*0.2;
    }

    r1 /= totg;
    let fac = -r1*0.875*gk;

    for (let i = 0; i < ps.length; i++) {
      let {tables, step, stepRange} = this.getTables(ps[i]);
      let grads = gs[i];

      for (let tablei = 0; tablei < 2; tablei++) {
        let table = tables[tablei];
        let gs2 = grads[tablei];

        for (let j = 0; j < table.length; j += step) {
          for (let k = 0; k < stepRange; k++) {
            table[j + k] += gs2[j + k]*fac;
            table[j + k] = Math.max(table[j + k], 0.0);
          }
        }
      }
    }

    if (MAXIMIZE_GAMUT && r1 < this.error(points)) {
      this.loadOrig(ps, origs);
    }

    if (SOLVE_COLOR_SCALE) {
      ps.colorScale += fac*scale_g*0.05;
    }

    doprint(0, "  totg:", totg, gs);
  }

  saveOrig(ps) {
    let origs = [];

    for (let i = 0; i < ps.length; i++) {
      let pdata = pigment_data.pigmentKS[ps[i].pigment];
      let tables = [pdata.K, pdata.S];

      let orig = [util.list(pdata.K), util.list(pdata.S)];
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

  getTables(pigment) {
    if (pigment.useHermite) {
      return {
        tables   : [pigment.k_hermite, pigment.s_hermite],
        step     : KTOT,
        stepRange: 2, //value and derivative
      }
    } else {
      let pdata = pigment_data.pigmentKS[pigment.pigment];

      return {
        tables   : [pdata.K, pdata.S],
        step     : 1,
        stepRange: 1,
      }
    }
  }

  annealing(points) {
    let ps = this.pigments;

    let r1 = this.error(points);

    let decay = MAXIMIZE_GAMUT ? 0.005 : 0.005;

    decay *= window.DECAY;

    let rdecay = window.RANDDECAY ?? 1.0;

    let rfac = Math.exp(-this.stepi*0.001*rdecay)*0.2*(window.RANDFAC ?? 1.0);
    let prob = Math.exp(-this.stepi*decay)*0.41;

    rfac *= this.settings.randFac;

    doprint(1, "  ", rfac.toFixed(4), prob.toFixed(4));
    let origs = [];

    let rand2 = this.rand2;

    for (let i = 0; i < ps.length; i++) {
      let {tables, step, stepRange} = this.getTables(ps[i]);
      let orig = [util.list(tables[0]), util.list(tables[1])];
      origs.push(orig);

      for (let tablei = 0; tablei < 2; tablei++) {
        let table = tables[tablei];

        for (let j = 0; j < table.length; j += step) {
          for (let k = 0; k < stepRange; k++) {
            if (rand2.random() > 0.1) {
              continue;
            }

            table[j + k] += (rand2.nrandom() - 0.5)*rfac;
            table[j + k] = Math.max(table[j + k], 0.0);
          }
        }
      }
    }

    let r2 = this.error(points);
    let bad = r2 > r1 && rand2.random() > prob;

    if (bad) {
      for (let i = 0; i < ps.length; i++) {
        let {tables, step} = this.getTables(ps[i]);
        let orig = origs[i];

        for (let tablei = 0; tablei < 2; tablei++) {
          let table = tables[tablei];
          let otable = orig[tablei];

          table.set(otable);
        }
      }
    }
  }

  highPassFilter(err = 1.0) {
    const ps = this.pigments;
    const fac = this.settings.highPassFac*0.001;

    for (let i = 0; i < ps.length; i++) {
      let {tables, step, stepRange} = this.getTables(ps[i]);

      for (let tablei = 0; tablei < 2; tablei++) {
        let table = tables[tablei];

        let mas = new Array(stepRange).map(ma => new util.MovingAvg(8));

        let t = fac*err;

        for (let j = 0; j < table.length; j += step) {
          for (let k = 0; k < stepRange; k++) {
            table[j + k] = mas[k].add(table[j])*t + table[j]*(1.0 - t);
          }
        }
      }
    }
  }

  step() {
    let rate = this.settings.pointSubSteps;
    //rate *= 8;

    let ps = this.pigments;
    ps.updateWasm();

    setInsideSolver(true);

    this.rand.seed(~~(this.stepi/rate + this.startseed*1024.0));

    let points = this.genPoints();

    //this.highPassFilter();

    if ((this.settings.flag & SolverFlags.NEWTON) && (this.settings.flag & SolverFlags.ANNEALING)) {
      if (this.stepi%2 === 0) {
        this.annealing(points);
      } else {
        this.gradientDescent(points);
      }
    } else if (this.settings.flag & SolverFlags.NEWTON) {
      this.gradientDescent(points);
    } else if (this.settings.flag & SolverFlags.ANNEALING) {
      this.annealing(points);
    }

    let err = this.error(points);

    this.settings.errorOut = err;

    if (this.settings.flag & SolverFlags.HIGH_PASS) {
      this.highPassFilter(err);
    }

    if (MAXIMIZE_GAMUT) {
      doprint(2, `error: ${err.toFixed(4)} [${this.stepi%rate}]`, "COLOR_SCALE:", ps.colorScale.toFixed(3));
    } else {
      doprint(2, `error: ${err.toFixed(4)} [${this.stepi%rate}]`);
    }

    for (let p of this.pigments) {
      p.updateGen++;
    }

    this.stepi++;

    setInsideSolver(false);
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
  function myStringify(obj, replacer, decimalPlaces = 5, ws, depth = 0) {
    let tab = '';
    for (let i = 0; i < depth; i++) {
      tab += "  ";
    }

    if (typeof obj === "number") {
      return "" + obj.toFixed(decimalPlaces);
    } else if (typeof obj === "boolean") {
      return obj ? "true" : "false";
    } else if (typeof obj === "string") {
      return `"${obj}"`;
    } else if (typeof obj === "object") {
      if (obj === null) {
        return "null";
      }

      if (obj.toJSON) {
        return myStringify(obj.toJSON(), replacer, decimalPlaces, ws, depth);
      }

      if (Array.isArray(obj) || obj instanceof Float32Array || obj instanceof Float64Array) {
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

          let chunk = myStringify(obj[i], replacer, decimalPlaces, ws, depth + 1);
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

          s += tab + `  "${k}" : ${myStringify(v, replacer, decimalPlaces, ws, depth + 1)},\n`
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

  let colorScale = COLOR_SCALE*_appstate.ctx.pigments.colorScale;

  let hermite = pigment_data.pigmentHermite;
  let ps = _appstate.ctx.pigments;

  for (let pigment of ps) {
    let h;

    for (let h2 of hermite) {
      if (h2.pigment === pigment.pigment) {
        h = h2;
        break;
      }
    }

    if (!h) {
      h = {
        pigment: pigment.pigment
      };

      hermite.push(h);
    }

    h.K = pigment.k_hermite;
    h.S = pigment.s_hermite;
  }

  let code = `/* WARNING: auto-generated file! color scale: ${colorScale} */
export const wavelengths = ${JSON.stringify(pigment_data.wavelengths)};
export const pigmentKS = ${myStringify(pigment_data.pigmentKS, replacer, undefined, 1)};

/*
hermite format:

value deltaValue wavelength (unused parameter) 
*/

export const pigmentHermite = ${myStringify(hermite, undefined, 3, 1)};

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