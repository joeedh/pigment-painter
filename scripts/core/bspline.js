import {
  Vector3, Vector2, Vector4, Matrix4,
  Quat, util, nstructjs, math, binomial
} from '../path.ux/scripts/pathux.js';

/* Bezier */
export const USE_BERNSTEIN_BASIS = true;

const eval_cachering = util.cachering.fromConstructor(Vector3, 256);
const basis_temps = util.cachering.fromConstructor(Vector3, 64);

let otherAxisMap = [
  [1, 2],
  [2, 0],
  [0, 1]
];

export class VolumePatch {
  constructor(n, degree = 2) {
    this.n = n;
    this.degree = degree;
    this.pad = this.degree;
    this.dimen = n + this.pad*2;

    let ks = this.ks = [];
    this.ps = [];

    this.basisTables = [];

    let dimen = this.dimen;
    let pad = this.pad;

    for (let i = 0; i < dimen*dimen*dimen; i++) {
      ks.push(1.0);
    }

    let tot = dimen**3;
    let _ks = this._ks = [new Array(tot), new Array(tot), new Array(tot)];

    for (let iz = 0; iz < dimen; iz++) {
      for (let iy = 0; iy < dimen; iy++) {
        for (let ix = 0; ix < dimen; ix++) {
          let ix2 = ix;
          let iy2 = iy;
          let iz2 = iz;

          let idx = iz2*dimen*dimen + iy2*dimen + ix2;

          _ks[0][idx] = ix - pad;
          _ks[1][idx] = iy - pad;
          _ks[2][idx] = iz - pad;
        }
      }
    }

    let ps = this.ps = new Array(this.n**3);
    let r = new Vector3();

    for (let iz = 0; iz < n; iz++) {
      for (let iy = 0; iy < n; iy++) {
        for (let ix = 0; ix < n; ix++) {
          let u = ix/(n - 1);
          let v = iy/(n - 1);
          let t = iz/(n - 1);

          r[0] = (Math.random() - 0.5);
          r[1] = (Math.random() - 0.5);
          r[2] = (Math.random() - 0.5);

          let idx = iz*n*n + iy*n + ix;
          ps[idx] = new Vector3().loadXYZ(u, v, t)
          ps[idx].addFac(r, .5);
        }
      }
    }

    this.regenKs();
  }

  regenKs() {
    let dimen = this.dimen;

    let ks = this.ks;

    let tmp = new Vector3();

    function getidx(tmp, axis) {
      let axis2 = otherAxisMap[axis][0];
      let axis3 = otherAxisMap[axis][1];

      return tmp[axis3]*dimen*dimen + tmp[axis2]*dimen + tmp[axis];
    }

    for (let axis = 0; axis < 3; axis++) {
      let ks2 = this._ks[axis];

      for (let iz = 0; iz < dimen; iz++) {
        for (let iy = 0; iy < dimen; iy++) {
          let sum = -this.pad;

          for (let ix = 0; ix < dimen; ix++) {
            tmp[0] = ix;
            tmp[1] = iy;
            tmp[2] = iz;

            let idx = getidx(tmp, axis);

            if (isNaN(idx)) {
              throw new Error("NaN!");
            }

            ks2[idx] = sum;
            sum += ks[idx];
          }
        }
      }
    }
  }

  basis(s, axis, uvw, i, n) {
    if (USE_BERNSTEIN_BASIS) {
      return this.basisBSpline(...arguments);
    } else {
      return this.basisBernstein(...arguments);
    }
  }

  basisBernstein(s, axis, uvw, i, n) {
    return binomial(n, v)*s**v*(1.0 - s)**(n - v);
  }

  basisBSpline(s, axis, uvw, i, n) {

    let len = this.n;
    let ks = this._ks[axis];
    let pad = this.pad;


    let kn = Math.min(Math.max(i + 1, -pad), len - 1 + pad);
    let knn = Math.min(Math.max(i + n, -pad), len - 1 + pad);
    let knn1 = Math.min(Math.max(i + n + 1, -pad), len - 1 + pad);
    let ki = Math.min(Math.max(i, -pad), len - 1 + pad);


    let xaxis = axis;
    let yaxis = otherAxisMap[axis][0];
    let zaxis = otherAxisMap[axis][1];

    let dimen = this.dimen;

    function getk(ki) {
      let axis = 0;
      let tmp = uvw[axis];
      uvw[axis] = ki;

      let ix = uvw[xaxis] + pad;
      let iy = uvw[yaxis] + pad;
      let iz = uvw[zaxis] + pad;

      uvw[axis] = tmp;

      return iz*dimen*dimen + iy*dimen + ix;
    }

    ki = getk(ki);
    kn = getk(kn);
    knn = getk(knn);
    knn1 = getk(knn1);

    function safe_inv(f) {
      return f ? 1.0/f : 1000000.0;
    }

    if (n === 0) {
      return s >= ks[ki] && s < ks[kn] ? 1.0 : 0.0;
    } else {

      let a = (s - ks[ki])*safe_inv(ks[knn] - ks[ki] + 0.0001);
      let b = (ks[knn1] - s)*safe_inv(ks[knn1] - ks[kn] + 0.0001);

      return a*this.basis(s, axis, uvw, i, n - 1) + b*this.basis(s, axis, uvw, i + 1, n - 1);
    }

  }

  makeBasisTables() {

  }

  evaluate(u, v, t) {

    let sum = eval_cachering.next().zero();

    let xyz = eval_cachering.next();

    let n = this.n;
    let pad = this.pad;

    u *= n;
    v *= n;
    t *= n;

    let degree = this.degree;

    let time = util.time_ms();
    //pad = pad-1;
    pad = pad - 1;

    for (let iz = -pad; iz < n + pad; iz++) {
      for (let iy = -pad; iy < n + pad; iy++) {
        for (let ix = -pad; ix < n + pad; ix++) {
          xyz.loadXYZ(ix, iy, iz);

          let ix2 = Math.min(Math.max(ix, 0), n - 1);
          let iy2 = Math.min(Math.max(iy, 0), n - 1);
          let iz2 = Math.min(Math.max(iz, 0), n - 1);

          let idx = iz2*n*n + iy2*n + ix2;
          let p = this.ps[idx];

          //debugger;

          xyz.loadXYZ(ix, iy, iz);
          let w1 = this.basis(u, 0, xyz, ix, degree);
          let w2 = this.basis(v, 1, xyz, iy, degree);
          let w3 = this.basis(t, 2, xyz, iz, degree);

          let w = w1*w2*w3;
          sum.addFac(p, w);
        }
      }
    }

    return sum;
  }
}