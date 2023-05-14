import {
  util, nstructjs, Vector2, Vector3,
  Vector4, Matrix4, Quat, math, keymap, simple
} from '../path.ux/scripts/pathux.js';
import {KTOT, Pigment, pigment_data, PigmentSet, setInsideSolver, START_REFL_K1, START_REFL_K2} from './colormodel.js';

import '../util/numeric.js';

import * as pigment_data_orig from './pigment_data_original.js';
import {distToCubic3, fitCubic3} from './bezier.js';

export const SolverFlags = {
  NEWTON   : 1,
  ANNEALING: 2,
  //NELDER_MEAD: 4,
  HIGH_PASS  : 8,
  STRETCH    : 16,
  WIDE_GAMUT : 32,
  FIXED_PATHS: 64,
}

let K1 = 0, K2 = 2, KCOLORSCALE = 3, VKTOT = 4;

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
    st.flags("flag", "flag", SolverFlags, "Solver Flags").descriptions({
      STRETCH   : "Try to stretch gamut to cover more of rgb space",
      WIDE_GAMUT: "More aggresive version of stretch"
    });

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

let origPigments = undefined;

export class Optimizer {
  constructor(pigments, settings) {
    this.pigments = pigments;
    this.last_log = util.time_ms();
    this.rand = new util.MersenneRandom();
    this.rand2 = new util.MersenneRandom();
    this.stepi = 0;

    this.wideGamut = settings.flag & SolverFlags.WIDE_GAMUT;

    this.startseed = Math.random();

    this.settings = settings;
    this.cdimen = 8;
    this.cube = new Int8Array(this.cdimen**3);

    this.origPigments = new PigmentSet();
    this.origPigments.copyTo(this.origPigments);
    this.origPigments.length = 0;

    this.origPigments.checkWasm();
    this.origPigments.pigment_data = pigment_data_orig;

    this.kvec = new Float64Array(VKTOT);

    this.kvec[K1] = pigments.k1;
    this.kvec[K2] = pigments.k2;
    this.kvec[KCOLORSCALE] = pigments.colorScale;

    for (let p of pigments) {
      let p2 = p.copy();

      p2.pigment_data = pigment_data_orig;
      p2.wasm = undefined;

      this.origPigments.push(p2);
    }

    if (0 && origPigments) {
      for (let i = 0; i < origPigments.length; i++) {
        if (this.origPigments[i].pigment === origPigments[i].pigment) {
          this.origPigments[i].wasm = origPigments[i].wasm;
        }
      }
    } else {
      origPigments = this.origPigments;
      origPigments.checkWasm();
    }
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
      if (!this.wideGamut) {
        err *= 1.0 + 0.15*(1.0 - totcube)**2
      } else {
        err += 2.0*(1.0 - totcube)**2;
      }
    }

    if (this.settings.flag & SolverFlags.FIXED_PATHS) {
      err += this.origPathError([0, 0, 1, 0], [1, 0, 0, 0]);
      err += this.origPathError([0, 1, 0, 0], [1, 0, 0, 0]);

      err += this.origPathError([1, 0, 0, 0], [0, 1, 0, 0]);
      err += this.origPathError([0, 0, 1, 0], [0, 1, 0, 0]);

      err += this.origPathError([1, 0, 0, 0], [0, 0, 1, 0]);
      err += this.origPathError([0, 1, 0, 0], [0, 0, 1, 0]);

      err += this.origPathError([0, 0, 0, 1], [1, 1, 1, 0]);
    }

    return err;
  }

  origPathError(ws1, ws2) {
    ws1 = new Vector4(ws1);
    ws2 = new Vector4(ws2);
    let ws = new Vector4();

    let err = 0.0;
    let steps = 16;
    let t = 0.0, dt = 1.0/(steps - 1);

    ws.load(ws1).interp(ws2, 1.0/3.0);
    let c1 = Pigment.toRGB(this.origPigments, ws);

    ws.load(ws1).interp(ws2, 2.0/3.0);
    let c2 = Pigment.toRGB(this.origPigments, ws);

    let a = new Vector4();
    let b = new Vector4();
    let c = new Vector4();
    let d = new Vector4();

    a.loadXYZ(c1[0], c1[1], c1[2]);
    d.loadXYZ(c2[0], c2[1], c2[2]);

    a[3] = d[3] = 0.0;
    fitCubic3(a, b, c, d, c1, c2);

    for (let i = 0; i < steps; i++, t += dt) {
      ws.load(ws1).interp(ws2, t);

      let sum = ws[0] + ws[1] + ws[2] + ws[3];
      sum = sum > 0.0 ? 1.0/sum : sum;
      ws.mulScalar(sum);

      let c1 = Pigment.toRGB(this.pigments, ws);
      let c2 = Pigment.toRGB(this.origPigments, ws);

      if (0) {
        let bad = false;

        for (let j = 0; j < 3; j++) {
          if (c2[j] < 0 || c2[j] >= 1.0) {
            bad = true;
            break;
          }
        }

        if (bad) {
          continue;
        }
      }

      c2.sub(c1);
      let dis = c2.dot(c2);

      let dis2 = distToCubic3(c1, a, b, c, d);

      return dis;

      /* stretch points to prevent clustering in a single point*/
      let t2 = Math.tent(t);
      dis += (dis2 - dis)*t2;

      err += dis*dt;
    }

    return err*2.5;
  }

  gradientDescent(points) {
    let ps = this.pigments;

    let origs;

    if (this.wideGamut) {
      origs = this.saveOrig(ps);
    }

    //let df = this.wideGamut ? 0.001 : 0.0001;
    let df = 0.005;
    let oneDf = 1.0/df;

    let gs = [];
    let r1 = this.error(points);
    let totg = 0.0;

    let gk = this.wideGamut ? 0.2 : 1.0;
    gk *= window.GRAD_FAC ?? 1.0;
    gk *= this.settings.newtonStep;

    for (let p of ps) {
      let grads = [[], [], []];
      gs.push(grads);

      let {tables, steps, stepRanges} = this.getTables(p);

      let tablei = 0;
      for (let table of tables) {
        let step = steps[tablei], stepRange = stepRanges[tablei];

        grads[tablei].length = table.length;
        let gs2 = grads[tablei];

        for (let i = 0; i < table.length; i += step) {
          for (let j = 0; j < stepRange; j++) {
            let orig = table[i + j];
            table[i + j] += df;

            this.updateKVec();

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

    const SOLVE_COLOR_SCALE = false; //this.wideGamut;

    if (SOLVE_COLOR_SCALE) {
      let orig = ps.colorScale;
      ps.colorScale += df;

      this.updateKVec();

      let r2 = this.error(points);
      let g = scale_g = (r2 - r1)/df;

      ps.colorScale = orig;
      totg += g*g*0.2*0.2;
    }

    r1 /= totg;
    let fac = -r1*0.875*gk;

    for (let i = 0; i < ps.length; i++) {
      let {tables, steps, stepRanges} = this.getTables(ps[i]);
      let grads = gs[i];

      console.log(grads[2]);

      for (let tablei = 0; tablei < tables.length; tablei++) {
        let step = steps[tablei], stepRange = stepRanges[tablei];

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

    this.updateKVec();

    if (this.wideGamut && r1 < this.error(points)) {
      this.loadOrig(ps, origs);
      this.updateKVec();
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

      let orig = [util.list(pdata.K), util.list(pdata.S), util.list(this.kvec)];
      origs.push(orig);
    }

    return origs;
  }

  loadOrig(ps, origs) {
    for (let i = 0; i < ps.length; i++) {
      let pdata = pigment_data.pigmentKS[ps[i].pigment];
      let tables = [pdata.K, pdata.S];
      let orig = origs[i];

      for (let tablei = 0; tablei < tables.length; tablei++) {
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
        tables    : [pigment.k_hermite, pigment.s_hermite, this.kvec],
        steps     : [KTOT, KTOT, 1],
        stepRanges: [2, 2, 1], //value and derivative
      }
    } else {
      let pdata = pigment_data.pigmentKS[pigment.pigment];

      return {
        tables    : [pdata.K, pdata.S, this.kvec],
        steps     : [1, 1, 1],
        stepRanges: [1, 1, 1],
      }
    }
  }

  nelderMead(points) {
    let ps = this.pigments;

    let origs = [];
    let tables = [];

    for (let i = 0; i < ps.length; i++) {
      let data = this.getTables(ps[i]);

      for (let table of data.tables) {
        origs.push(util.list(table));
        tables.push(table);
      }
    }

    for (let i = 0; i < tables.length; i++) {
      this.nelderMeadStep(points, tables[i], origs[i]);
    }
  }

  nelderMeadStep(points, table, orig) {
    const totsample = 35;
    const expand = 1.5;

    let r1 = this.error(points);

    let cent = 0;
    let dcent = 1.0/table.length;

    for (let i = 0; i < table.length; i++) {
      cent += table[i]*dcent;
    }

    for (let i = 0; i < totsample; i++) {
      let ri = ~~(Math.random()*table.length*0.99999);

      let f = table[i];
      f = 2.0*cent - f;

      let origf = f;

      table[ri] = f;

      let r2 = this.error(points);

      if (r2 < r1) {
        f = (f - cent)*expand + cent;
      } else {
        f = (f - cent)/expand + cent;
      }

      table[ri] = f;

      let r3 = this.error(points);
      if (r3 >= r2) {
        f = (orig[ri] - cent)*1.1 + cent;

        table[ri] = f;
      } else {
        r2 = r3;
      }

      //table[ri] += (orig[ri] - table[ri]) * 0.5;

      r1 = r2;
    }
  }

  annealing(points) {
    let ps = this.pigments;

    this.updateKVec();
    let r1 = this.error(points);

    let decay = this.wideGamut ? 0.005 : 0.005;

    decay *= window.DECAY;

    let rdecay = window.RANDDECAY ?? 1.0;

    let rfac = Math.exp(-this.stepi*0.001*rdecay)*0.2*(window.RANDFAC ?? 1.0);
    let prob = Math.exp(-this.stepi*decay)*0.41;

    rfac *= this.settings.randFac;

    doprint(1, "  ", rfac.toFixed(4), prob.toFixed(4));
    let origs = [];

    let rand2 = this.rand2;

    for (let i = 0; i < ps.length; i++) {
      let {tables, steps, stepRanges} = this.getTables(ps[i]);
      let orig = tables.map(f => util.list(f));

      origs.push(orig);

      for (let tablei = 0; tablei < tables.length; tablei++) {
        let table = tables[tablei];
        let step = steps[tablei], stepRange = stepRanges[tablei];

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

    this.updateKVec();

    let r2 = this.error(points);
    let bad = r2 > r1 && rand2.random() > prob;

    if (bad) {
      for (let i = 0; i < ps.length; i++) {
        let {tables, step} = this.getTables(ps[i]);
        let orig = origs[i];

        for (let tablei = 0; tablei < tables.length; tablei++) {
          let table = tables[tablei];
          let otable = orig[tablei];

          table.set(otable);
        }
      }

      this.updateKVec();
    }
  }

  highPassFilter(err = 1.0) {
    const ps = this.pigments;
    const fac = this.settings.highPassFac*0.0015;

    for (let i = 0; i < ps.length; i++) {
      let {tables, steps, stepRanges} = this.getTables(ps[i]);

      for (let tablei = 0; tablei < tables.length; tablei++) {
        let table = tables[tablei];

        let step = steps[tablei], stepRange = stepRanges[tablei];

        let mas = util.list(new Array(stepRange)).map(ma => new util.MovingAvg(8));

        let t = fac*err;

        for (let j = 0; j < table.length; j += step) {
          for (let k = 0; k < stepRange; k++) {
            table[j + k] = mas[k].add(table[j])*t + table[j]*(1.0 - t);
          }
        }
      }
    }

    this.updateKVec();
  }

  updateKVec() {
    if (this.pigments.useCustomKs) {
      this.kvec[K1] = Math.min(Math.max(this.kvec[K1], 0.001), 0.999);
      this.kvec[K2] = Math.min(Math.max(this.kvec[K2], 0.001), 0.999);

      this.pigments.k1 = this.kvec[K1];
      this.pigments.k2 = this.kvec[K2];
    }

    this.pigments.colorScale = this.kvec[KCOLORSCALE];
    this.pigments.updateWasm();
  }

  step() {
    let rate = this.settings.pointSubSteps;
    //rate *= 8;

    this.kvec[K1] = this.pigments.k1;
    this.kvec[K2] = this.pigments.k2;
    this.kvec[KCOLORSCALE] = this.pigments.colorScale;

    this.wideGamut = this.settings.flag & SolverFlags.WIDE_GAMUT;

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

    //if (this.settings.flag & SolverFlags.NELDER_MEAD) {
    //  this.nelderMead(points);
    //}

    let err = this.error(points);

    this.settings.errorOut = err;

    if (this.settings.flag & SolverFlags.HIGH_PASS) {
      this.highPassFilter(err);
    }

    if (this.wideGamut) {
      doprint(2, `error: ${err.toFixed(4)} [${this.stepi%rate}]`, "COLOR_SCALE:", ps.colorScale.toFixed(3));
    } else {
      doprint(2, `error: ${err.toFixed(4)} [${this.stepi%rate}]`);
    }

    for (let p of this.pigments) {
      p.updateGen++;
    }

    this.stepi++;

    this.updateKVec();
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