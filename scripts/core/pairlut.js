import {
  simple, util, Vector2, Vector3, Vector4,
  Matrix4, Quat, nstructjs, math, UIBase
} from '../path.ux/scripts/pathux.js';

import {LTOT} from './colormodel.js';
import {getSearchOffs} from './canvas.js';
import {rgb_to_linear} from './color.js';
import {VolumePatch} from './bspline.js';

export const TripletFlags = {};

const localStorageKey = "_colortriplets";
const TRIPLET_JSON_VERSION = 0;

export const LutFillIns = {
  NONE   : 0,
  RGBA   : 1,
  CLOSEST: 2,
};

/*actually, triplets*/
export class ColorTriplet {
  constructor() {
    this.color1 = new Vector4([0, 0, 0, 1]);
    this.color2 = new Vector4([1, 0, 0, 1]);
    this.color3 = new Vector4([1, 1, 0, 1]);

    this.id = -1;
    this.flag = 0;
  }

  static defineAPI(api, st) {

    function onchange() {
      this.ctx.colorTriplets.onChanged();
    }

    st.color4("color1", "color1", "A").on('change', onchange);
    st.color4("color2", "color2", "B").on('change', onchange);
    st.color4("color3", "color3", "C").on('change', onchange);
    st.enum("flag", "flag", TripletFlags, "Flags");
  }

  loadSTRUCT(reader) {
    reader(this);
  }
}

ColorTriplet.STRUCT = `
ColorTriplet {
  color1  : vec4;
  color2  : vec4;
  color3  : vec4;
  flag    : int;
  id      : int; 
}
`
simple.DataModel.register(ColorTriplet);

export class ColorTripletSet extends Array {
  constructor() {
    super();

    this._flag_update = false;

    this.idMap = new Map();
    this.idgen = 0;

    this.upscaleLevels = 1;
    this.dimen = 64;

    this.updateGen = 0;
    this.blurCount = 0;

    this.lutFillIn = LutFillIns.RGBA;
  }

  static defineAPI(api, st) {
    st.list("", "triplets", {
      get(api, list, key) {
        return list.idMap.get(key);
      },
      getKey(api, list, obj) {
        return obj.id;
      },
      getStruct(api, list, key) {
        return api.mapStruct(ColorTriplet, true);
      },
      getIter(api, list) {
        return list[Symbol.iterator]();
      },
      getLength(api, list) {
        return list.length;
      }
    });

    let onchange = function () {
      this.ctx.colorTriplets.flagSave();
    };

    st.int("dimen", "dimen", "Dimen").noUnits().range(8, 258).on('change', onchange);
    st.int("upscaleLevels", "upscaleLevels", "UpScaleLevels").noUnits().range(0, 5).on('change', onchange);
    st.int("blurCount", "blurCount", "BlurRepeat").noUnits().step(2).range(0, 3550).on('change', onchange);
    st.enum("lutFillIn", "lutFillIn", LutFillIns, "Fill In Lut").on('change', onchange);
  }

  /** note that this does *not* make a deep copy */
  copyTo(b) {
    b.idgen = this.idgen;
    b.length = this.length;
    b.idMap = this.idMap;
    b.dimen = this.dimen;
    b.upscaleLevels = this.upscaleLevels;
    b.blurCount = this.blurCount;
    b.lutFillIn = this.lutFillIn;

    for (let i = 0; i < this.length; i++) {
      b[i] = this[i];
    }
  }

  laplacian(lut, swaplut, used, energyGoal) {
    let dimen = lut.dimen;

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

          if (!used[idx]) {
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

          mul = totw !== 0.0 ? 1.0 / totw : 0.0;

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

  makeTriplet() {
    let p = new ColorTriplet();
    p.id = this.idgen++;

    this.idMap.set(p.id, p);
    this.onChanged();

    super.push(p);
  }

  flagSave() {
    if (this._flag_update) {
      return;
    }

    this._flag_update = true;
    window.setTimeout(() => {
      this._flag_update = false;

      this.save();
    }, 200);
  }

  onChanged() {
    this.updateGen++;
    this.save();
  }

  has(p) {
    return this.idMap.has(p.id);
  }

  get(id) {
    return this.idMap.get(id);
  }

  remove(p) {
    if (p.id === -1) {
      throw new Error("triplet was already deleted");
    }

    p.id = -1;
    this.idMap.delete(p);
    super.remove(p);

    this.onChanged();
  }

  loadSave(json) {
    let istruct = new nstructjs.STRUCT();
    istruct.parse_structs(json.schema);

    let obj = istruct.readJSON(json.json, ColorTripletSet);

    obj.copyTo(this);

    console.error("Loaded");
    this.updateGen++;
  }

  load() {
    if (!(localStorageKey in localStorage)) {
      return;
    }

    try {
      let json = localStorage[localStorageKey];
      json = JSON.parse(json);

      this.loadSave(json);
    } catch (error) {
      console.error(error.stack);
      console.error(error.message);
      console.error("Failed to load color triplet set");
    }
  }

  loadSTRUCT(reader) {
    reader(this);

    for (let item of this) {
      this.idMap.set(item.id, item);
    }
  }

  makeSave() {
    let istruct = new nstructjs.STRUCT();
    istruct.registerGraph(nstructjs.manager, ColorTripletSet);
    let schema = nstructjs.write_scripts(istruct);

    let json = istruct.writeJSON(this);
    json = {
      schema,
      json,
      version: TRIPLET_JSON_VERSION
    };

    return json;
  }

  save() {
    localStorage[localStorageKey] = JSON.stringify(this.makeSave());
  }


  makePatchLUTs(ctx, dimen = this.dimen, fillIn = true, upscaleLevels = this.upscaleLevels) {
    let ps = ctx.canvas.pigments;

    let lut = new Float32Array(dimen*dimen*dimen*LTOT);
    let rlut = new Float32Array(dimen*dimen*dimen*LTOT);
    lut.dimen = dimen;
    rlut.dimen = dimen;

    lut.fill(0.0);
    rlut.fill(0.0);

    lut.used = new Uint16Array(dimen*dimen*dimen);
    rlut.used = new Uint16Array(dimen*dimen*dimen);

    lut.used.fill(0);
    rlut.used.fill(0);

    let patch = new VolumePatch(3);

    for (let p of patch.ps) {
      let rfac = 2.5/dimen;

      for (let i = 0; i < 3; i++) {
        p[i] += (Math.random() - 3.5)*rfac;
        p[i] = Math.min(Math.max(p[i], 0.0), 1.0);
      }
    }

    console.log(patch);
    window.patch = patch;


    for (let ix = 0; ix < dimen; ix++) {
      for (let iy = 0; iy < dimen; iy++) {
        for (let iz = 0; iz < dimen; iz++) {
          let u = ix/(dimen - 1);
          let v = iy/(dimen - 1);
          let t = iz/(dimen - 1);

          let p = patch.evaluate(u, v, t);

          let idx = (iz*dimen*dimen + iy*dimen + ix)*LTOT;

          if (isNaN(p.dot(p))) {
            console.error("NaN!", p, ix, iy, iz, idx, u, v, t);
            throw new Error("NaN!");
          }

          lut[idx] = p[0];
          lut[idx + 1] = p[1];
          lut[idx + 2] = p[2];
        }
      }
    }

    this.makeReverseLut(lut, rlut, ps);

    lut.isPairLut = true;
    rlut.isPairLut = true;

    ps.lut = lut;
    ps.rlut = rlut;

    ps.makeLUTImage();
  }

  makeLUTs(ctx, dimen = this.dimen, fillIn = true, upscaleLevels = this.upscaleLevels) {
    //return this.makePatchLUTs(...arguments);

    /* hrm, I wonder if this is a use case for a nice, large linear least squares matrix*/
    let ps = ctx.canvas.pigments;

    let lut = new Float32Array(dimen*dimen*dimen*LTOT);
    let rlut = new Float32Array(dimen*dimen*dimen*LTOT);
    lut.dimen = dimen;
    rlut.dimen = dimen;

    lut.fill(0.0);
    rlut.fill(0.0);

    lut.used = new Uint16Array(dimen*dimen*dimen);
    rlut.used = new Uint16Array(dimen*dimen*dimen);

    lut.used.fill(0);
    rlut.used.fill(0);

    //let offs = getSearchOffs(1);

    let dt = 1.0/(dimen - 1);
    let tmp = new Vector4();

    function report() {
      console.log(...arguments);
    }


    let sdimen = dimen*0.005;

    function doPointIntern(r, g, b, w, x = r, y = g, z = b, lut2 = lut) {
      x = ~~(x*(dimen - 1) + 0.5 + (Math.random() - 0.5)*sdimen);
      y = ~~(y*(dimen - 1) + 0.5 + (Math.random() - 0.5)*sdimen);
      z = ~~(z*(dimen - 1) + 0.5 + (Math.random() - 0.5)*sdimen);

      x = Math.min(Math.max(x, 0), dimen - 1);
      y = Math.min(Math.max(y, 0), dimen - 1);
      z = Math.min(Math.max(z, 0), dimen - 1);


      let idx = (z*dimen*dimen + y*dimen + x)*LTOT;

      lut2[idx] += r*w;
      lut2[idx + 1] += g*w;
      lut2[idx + 2] += b*w;
      lut2[idx + 3] += w;
    }

    function doPoint(r, g, b, w, x = r, y = g, z = b) {
      doPointIntern(r, g, b, w, x, y, z, lut);
      doPointIntern(x, y, z, w, r, g, b, rlut);
    }

    report("Setting up boundary conditions");

    const extra = true;

    /*set up boundary conditions*/
    if (extra) {
      for (let x = 0, u = 0; x < dimen; x++, u += dt) {
        for (let y = 0, v = 0; y < dimen; y++, v += dt) {
          const w2 = 1.0;

          continue;

          doPoint(u, v, 0, w2);
          doPoint(u, v, 1.0, w2);
          doPoint(u, 0.0, v, w2);
          doPoint(u, 1.0, v, w2);
          doPoint(0.0, u, v, w2);
          doPoint(1.0, u, v, w2);
        }
      }

      //doPoint(1.0, 1.0, 1.0, 0.1);
      //doPoint(0.0, 0.0, 0.0, 0.1);

      if (1) {
        const w2 = 0.1;
        doPoint(1.0, 1.0, 1.0, w2);
        doPoint(0.0, 0.0, 0.0, w2);
        doPoint(1.0, 0.0, 0.0, w2);
        doPoint(0.0, 1.0, 0.0, w2);
        doPoint(0.0, 0.0, 1.0, w2);
        doPoint(0.0, 1.0, 1.0, w2);
        doPoint(1.0, 1.0, 0.0, w2);
        doPoint(1.0, 0.0, 1.0, w2);
      }
    }

    let tmp2 = new Vector4();

    let color1 = new Vector3();
    let color2 = new Vector3();
    let color3 = new Vector3();
    let color1a = new Vector3();

    for (let pair of this) {
      let steps2 = dimen*2+5;
      let ds = 1.0 / (steps2 - 1);
      let scale = 1.0;

      let c1 = pair.color1, c2 = pair.color2, c3 = pair.color3;

      color1a.load(rgb_to_linear(c1[0], c1[1], c1[2]));
      color2.load(rgb_to_linear(c2[0], c2[1], c2[2]));
      color3.load(rgb_to_linear(c3[0], c3[1], c3[2]));

      for (let si=0; si<steps2; si++, scale -= ds) {
        //color1.load(color1a).mulScalar(scale);
        color1.load(color1a).interp(color3, 1.0-scale).mulScalar(scale);

        tmp.load(color1).interp(color3, 0.5);

        doPoint(color2[0], color2[1], color2[2], 1.0, tmp[0], tmp[1], tmp[2]);

        let steps = dimen*40.0;
        let s = 0.0, ds = 1.0/(steps - 1);

        for (let i = 0; i < steps; i++, s += ds) {
          if (s < 0.5) {
            tmp.load(color1).interp(color2, s*2.0);
          } else {
            tmp.load(color2).interp(color3, (s - 0.5)*2.0);
          }

          tmp2.load(color1).interp(color3, s);
          doPoint(tmp[0], tmp[1], tmp[2], 1.0, tmp2[0], tmp2[1], tmp2[2]);
        }

        let swaptmp = color1a;
        color1a = color3;
        color3 = swaptmp;
      }
    }

    //normalize
    for (let lut2 of [lut, rlut]) {
      let used = lut2.used;

      for (let i = 0; i < lut2.length; i += LTOT) {
        let n = lut2[i + 3];

        let idx = i/LTOT;
        used[idx] = n > 0.0;

        if (n === 0.0) {
          continue;
        }

        n = 1.0/n;

        lut2[i] *= n;
        lut2[i + 1] *= n;
        lut2[i + 2] *= n;
        lut2[i + 3] = 1.0;
      }
    }

    function fillInRGBA(lut) {
      let used = lut.used;

      for (let x = 0; x < dimen; x++) {
        for (let y = 0; y < dimen; y++) {
          for (let z = 0; z < dimen; z++) {
            let r = x/(dimen - 1);
            let g = y/(dimen - 1);
            let b = z/(dimen - 1);
            let idx = (z*dimen*dimen + y*dimen + x);
            let li = idx*LTOT;

            if (used[idx]) {
              continue;
            }

            lut[li] = r;
            lut[li + 1] = g;
            lut[li + 2] = b;
            lut[li + 3] = 1.0;
          }
        }
      }
    }

    if (this.lutFillIn === LutFillIns.RGBA) {
      fillInRGBA(lut);
    } else if (this.lutFillIn === LutFillIns.CLOSEST) {
      ps.fillInLut(lut, new Uint16Array(lut.used), false, false);
    }

    /*

    on factor;

    f1 := int(x, x);
    f1 := sub(x=1, f1) - sub(x=0, f1);

    f2 := int(f1, x);
    f2 := sub(x=1, f2) - sub(x=0, f2);

    no need to go further; looks like it also
    integrates to 0.5.
    **/

    let energyGoal = 0.5;
    let energyR = 0.0;
    let energyG = 0.0;
    let energyB = 0.0

    let ratioR, ratioG, ratioB;

    let totused = 0.0;
    let de = 1.0/(dimen*dimen*dimen);

    let normalize = (lut) => {
      energyR = energyG = energyB = 0.0;

      let totused = 0;
      let usedR = 0.0;
      let usedG = 0.0;
      let usedB = 0.0;

      for (let li = 0; li < lut.length; li += LTOT) {
        energyR += de*lut[li];
        energyG += de*lut[li + 1];
        energyB += de*lut[li + 2];

        let idx = li/LTOT;
        if (!lut.used[idx]) {
          totused++;
          continue;
        }

        usedR += de*lut[li];
        usedG += de*lut[li + 1];
        usedB += de*lut[li + 2];
      }

      let usedmul = totused === 0.0 ? 0.0 : (lut.length/LTOT)/totused;
      usedmul = 1.0;

      let usedmulR = usedmul;
      let usedmulG = usedmul;
      let usedmulB = usedmul;

      //usedmulR = usedR ? energyR / usedR : 0.0;
      //usedmulG = usedG ? energyG / usedG : 0.0;
      //usedmulB = usedB ? energyB / usedB : 0.0;

      //usedmulR = energyR ? usedR / energyR : 0.0;
      //usedmulG = energyG ? usedG / energyG : 0.0;
      //usedmulB = energyB ? usedB / energyB : 0.0;

      ratioR = energyR ? usedmulR*energyGoal/energyR : 0.0;
      ratioG = energyG ? usedmulG*energyGoal/energyG : 0.0;
      ratioB = energyB ? usedmulB*energyGoal/energyB : 0.0;

      for (let li = 0; li < lut.length; li += LTOT) {
        let idx = li/LTOT;
        if (!lut.used[idx]) {
          continue;
        }
        lut[li] *= ratioR;
        lut[li + 1] *= ratioG;
        lut[li + 2] *= ratioB;
      }
    }

    //ps.fillInLut(rlut, new Uint16Array(rlut.used), false, false);

    report("Blurring");

    let n = Math.ceil(dimen*0.1);
    n = dimen>>4;
    n = Math.max(n, 2);
    n = 5;

    let used = lut.used;

    for (let i = 0; i < used.length; i++) {
      used[i] = !used[i];
    }

    for (let i=0; i<5; i++) {
      normalize(lut);
      console.error("ENERGIES", energyR, energyG, energyB);
      console.log("RATIOS", ratioR.toFixed(3), ratioG.toFixed(3), ratioB.toFixed(3));
    }

    let lutb = new Float32Array(lut);
    lutb.used = lut.used;
    lutb.dimen = lut.dimen;

    for (let step = 0; step < this.blurCount; step++) {
      //window.__blur3d(lut2, used, false, n);
      lut = this.laplacian(lut, lutb, used, energyGoal);
      let tmp = lut;
      lut = lutb;
      lutb = tmp;

      if (step%9 === 0) {
        normalize(lut);
      }
    }

    for (let i=0; i<4; i++) {
      normalize(lut);
      console.error("ENERGIES", energyR, energyG, energyB);
      console.log("RATIOS", ratioR.toFixed(3), ratioG.toFixed(3), ratioB.toFixed(3));
    }

    /*forcibly clamp*/
    for (let li = 0; li < lut.length; li++) {
      lut[li] = Math.min(Math.max(lut[li], 0.0), 1.0);
    }

    let totpoint = dimen*dimen*dimen*8;
    let rused = rlut.used;

    rused.fill(0.0);
    rlut.fill(0.0);

    /*
    for (let i = 0; i < rlut.length; i += LTOT) {
      rlut[i + 3] = 0.0;
    }//*/

    this.makeReverseLut(lut, rlut, ps);

    lut = ps.upscaleLUT(lut, upscaleLevels);
    rlut = ps.upscaleLUT(rlut, upscaleLevels);

    lut.isPairLut = true;
    rlut.isPairLut = true;

    ps.lut = rlut;
    ps.rlut = lut;

    console.log(lut);
    ps.makeLUTImage();

    report("Done");
  }

  makeReverseLut(lut, rlut, ps) {
    let rused = rlut.used;
    let used = lut.used;
    let dimen = rlut.dimen;
    let totpoint = 5*dimen**3;

    for (let i = 0; i < totpoint; i++) {
      let x = ~~(Math.random()*(dimen - 1));
      let y = ~~(Math.random()*(dimen - 1));
      let z = ~~(Math.random()*(dimen - 1));

      let idx = z*dimen*dimen + y*dimen + x;
      let li = idx*LTOT;

      let r = lut[li];
      let g = lut[li + 1];
      let b = lut[li + 2];

      let x2 = ~~(r*(dimen - 1));
      let y2 = ~~(g*(dimen - 1));
      let z2 = ~~(b*(dimen - 1));

      let idx2 = z2*dimen*dimen + y2*dimen + x2;
      let li2 = idx2*LTOT;

      rused[idx2] = 1;

      rlut[li2 + 0] += x/(dimen - 1);
      rlut[li2 + 1] += y/(dimen - 1);
      rlut[li2 + 2] += z/(dimen - 1);
      rlut[li2 + 3] += 1.0;
    }

    for (let i = 0; i < rlut.length; i += LTOT) {
      let n = rlut[i + 3];

      if (n === 0) {
        rlut[i + 3] = 0.0;
        continue;
      }

      n = 1.0/n;

      rlut[i] *= n;
      rlut[i + 1] *= n;
      rlut[i + 2] *= n;
    }

    if (this.lutFillIn !== LutFillIns.NONE) {
      ps.fillInLut(rlut, new Uint16Array(rlut.used), false, false);
    }

    for (let i = 0; i < rused.length; i++) {
      rused[i] = !rused[i];
    }

    let count = (this.blurCount>>1) + 3;

    let rlutb = new Float32Array(rlut);
    rlutb.dimen = lut.dimen;
    rlutb.used = rlut.used;

    for (let step = 0; step < count; step++) {
      rlut = this.laplacian(rlut, rlutb, used, 0.5);

      let tmp = rlut;
      rlut = rlutb;
      rlutb = tmp;
    }
  }
}

ColorTripletSet.STRUCT = `
ColorTripletSet {
  this          : array(ColorTriplet);
  idgen         : int;
  dimen         : int;
  blurCount     : int;
  upscaleLevels : int;
  lutFillIn     : int;
}
`;
simple.DataModel.register(ColorTripletSet);

export const colorTripletSet = new ColorTripletSet();
colorTripletSet.load();
