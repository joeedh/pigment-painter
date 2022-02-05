import {
  util, nstructjs, Vector2, Vector3,
  Vector4, Matrix4, Quat, math, keymap
} from '../path.ux/scripts/pathux.js';
import {Pigment} from './colormodel.js';

import * as pigment_data from './pigment_data.js';

let kstemps = util.cachering.fromConstructor(Vector4, 64);
let cstemps = util.cachering.fromConstructor(Vector3, 64);

export class Optimizer {
  constructor(pigments) {
    this.pigments = pigments;
    this.last_log = util.time_ms();
    this.rand = new util.MersenneRandom();
    this.stepi = 0;
  }

  log() {
    if (util.time_ms() - this.last_log < 150) {
      return;
    }

    console.log(...arguments);
    this.last_log = util.time_ms();
  }

  start() {
    if (this.timer) {
      this.stop();
    }

    console.warn("starting timer");

    this.timer = window.setInterval(() => {
      let time = util.time_ms();

      while (util.time_ms() - time < 15) {
        this.step();
      }
    }, 30);

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
    let totpoint = 64;

    for (let i = 0; i < 4*totpoint; i++) {
      points.push(this.rand.random());
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

    for (let i = 0; i < points.length; i += 4) {
      ks[0] = points[i];
      ks[1] = points[i + 1];
      ks[2] = points[i + 2];
      ks[3] = points[i + 3];

      let rgb = Pigment.toRGB(ps, ks);

      min.min(rgb);
      max.max(rgb);
    }

    let err = 0.0;

    for (let i = 0; i < 3; i++) {
      if (min[i] < 0) {
        err += -min[i];
      }

      if (max[i] > 1.0) {
        err += (max[i] - 1.0);
      }
    }

    return err;
  }

  gradientDescent(points) {
    let ps = this.pigments;

    let df = 0.001;
    let oneDf = 1.0/df;

    let gs = [];
    let r1 = this.error(points);
    let totg = 0.0;

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

    r1 /= totg;
    let fac = -r1*0.5;

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
    console.log("totg:", totg, gs);
  }

  step() {
    this.rand.seed(~~(this.stepi/4));

    let points = this.genPoints();

    this.gradientDescent(points);

    let err = this.error(points);
    console.log("error:", err);

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
