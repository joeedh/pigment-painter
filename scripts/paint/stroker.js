import { nstructjs, util, Vector2, Solver, Constraint, Vector4, Vector3 } from './pathux.js';

class Curve {
  evaluate(s) {
    throw new Error("implement me!");
  }

  derivative(s) {
    throw new Error("implement me!");
  }

  derivative2(s) {
    throw new Error("implement me!");
  }

  curvature(s) {
    let dv1 = this.derivative(s);
    let dv2 = this.derivative2(s);

    return (dv1[0]*dv2[1] - dv1[1]*dv2[0]) / Math.pow(dv1.dot(dv1), 3.0/2.0);
  }

  distanceTo(s) {
    throw new Error("implement me!");
  }

  get length() {
    throw new Error("implement me!");
  }
}

const BSplineFlags = {};

class BSplinePoint {
  constructor() {
    this.index = 0;
    this.flag = 0;
    this.co = new Vector2();
    this.k = 1.0;
  }
}

BSplinePoint.STRUCT = `
BSplinePoint {
  co    : vec2;
  k     : float;
  flag  : int;
  index : int;
}
`;
nstructjs.register(BSplinePoint);

function safe_inv(n) {
  return n === 0 ? 100000.0 : 1.0/n;
}

let bs_evalrets = util.cachering.fromConstructor(Vector2, 512);
let bs_dvrets = util.cachering.fromConstructor(Vector2, 512);
util.cachering.fromConstructor(Vector2, 512);

function basis(ks, s, i, n) {
  let len = ks.length;
  let kn = Math.min(Math.max(i + 1, 0), len - 1);
  let knn = Math.min(Math.max(i + n, 0), len - 1);
  let knn1 = Math.min(Math.max(i + n + 1, 0), len - 1);
  let ki = Math.min(Math.max(i, 0), len - 1);

  if (n === 0) {
    return s >= ks[ki] && s < ks[kn] ? 1 : 0;
  } else {

    let a = (s - ks[ki])*safe_inv(ks[knn] - ks[ki] + 0.0001);
    let b = (ks[knn1] - s)*safe_inv(ks[knn1] - ks[kn] + 0.0001);

    return a*basis(ks, s, i, n - 1) + b*basis(ks, s, i + 1, n - 1);
  }
}

const BSplineRecalc = {
  KNOTS : 1,
  TABLES: 2,
  FULL  : 1 | 2,
};

class BSpline extends Curve {
  constructor(v1, v2, points = 4, degree = 3) {
    super();

    this.v1 = v1;
    this.v2 = v2;

    this.degree = degree;
    this.points = []; //extra points

    this.knots = [];
    this._points = [];

    for (let i = 0; i < points; i++) {
      this.points.push(new BSplinePoint());
    }

    this.points[0].co.load(v1);
    this.points[this.points.length - 1].co.load(v2);

    this.prefix = this.degree;

    this.regen = BSplineRecalc.FULL;

    this.arcTable = undefined;
    this.table = undefined;
  }

  get length() {
    return 1.0; //should be arc length!
  }

  derivative(s) {
    let knots = this.knots;
    let ps = this.points;
    let degree = this.degree;

    let ret = bs_dvrets.next().zero();
    let dv = bs_dvrets.next().zero();

    /* multiplicity decreases by one */
    for (let i = 1; i < knots.length - 1; i++) {
      let i0 = i - 2;
      let i1 = i - 1;
      let i2 = i;
      let i3 = i + 1;
      let i4 = i + 2;
      let ip1 = i + degree + 1;
      let ip2 = i + degree + 2;
      let ip0 = i + degree;

      i0 = Math.min(Math.max(i0, 0), ps.length - 1);
      i1 = Math.min(Math.max(i1, 0), ps.length - 1);
      i2 = Math.min(Math.max(i2, 0), ps.length - 1);
      i3 = Math.min(Math.max(i3, 0), ps.length - 1);
      i4 = Math.min(Math.max(i4, 0), ps.length - 1);
      ip0 = Math.min(Math.max(ip0, 0), ps.length - 1);
      ip1 = Math.min(Math.max(ip1, 0), ps.length - 1);
      ip2 = Math.min(Math.max(ip2, 0), ps.length - 1);

      Math.min(Math.max(i - 1, 0), knots.length - 1);
      Math.min(Math.max(i + 1, 0), knots.length - 1);

      let w;
      //w = dbasis(knots, s, i2, degree-1);
      1.0/this.points.length;

      w = basis(knots, s, i, degree -1);

      dv.load(ps[i2].co).sub(ps[i1].co);
      dv.mulScalar((this.degree-1)*safe_inv((knots[ip1] - knots[i1])));
      //dv = ps[i3].co;
      //dv.load(ps[i2].co);

      ret.addFac(dv, w);
    }

    //ret.normalize();

    return ret;
  }

  regenKnots() {
    this.degree = 2;
    this.prefix = this.degree;

    this.regen &= ~BSplineRecalc.KNOTS;

    this.knots.length = 0;
    let knots = this.knots;

    let p = this.points[0];
    let k = -p.k;//*(this.prefix);

    k = 0.0;
    for (let i = 0; i < this.prefix; i++) {
      knots.push(k);
      //k += p.k;
    }

    k = 0.0;
    let sumk = 0.0;
    for (let p of this.points) {
      knots.push(k);

      k += p.k;
      sumk += p.k;
    }

    p = this.points[this.points.length - 1];

    let mulk = 1.0/(sumk);

    //k += p.k;

    for (let i = 0; i < this.prefix; i++) {
      knots.push(sumk);

      //lastk = k;
      //k += p.k;
    }

    //mulk = 1.0 / (lastk);

    for (let i = 0; i < knots.length; i++) {
      knots[i] *= mulk;
    }
  }

  update() {
    this.flag |= BSplineRecalc.FULL;
    return this;
  }

  init(e) {
    let ps = this.points;

    if (this.regen & BSplineRecalc.KNOTS) {
      this.regenKnots();
    }

    ps[0].co.load(e.v1);
    ps[ps.length - 1].co.load(e.v2);

    let ewalk;

    function walk(v) {
      let e2 = v.otherEdge(ewalk);

      if (e2) {
        ewalk = e2;
        return ewalk.otherVertex(v);
      } else {
        return v;
      }
    }

    ewalk = e;
    let pv1 = walk(e.v1);
    walk(pv1);

    ewalk = e;
    let nv1 = walk(e.v2);
    walk(nv1);

    e.v1.vectorDistance(e.v2);

    for (let i = 1; i < ps.length - 1; i++) {
      let p = ps[i];
      let s = i/(ps.length - 1);

      p.co.load(e.v1).interp(e.v2, s);
    }

    let t1 = new Vector2();
    let t2 = new Vector2();

    t1.load(e.v2).sub(e.v1);
    t2.load(e.v1).sub(pv1);
    t1.interp(t2, 0.5);

    ps[1].co.load(e.v1).addFac(t1, 1.0/3.0);

    t1.load(nv1).sub(e.v2);
    t2.load(e.v2).sub(e.v1);
    t1.interp(t2, 0.5);

    ps[ps.length - 2].co.load(e.v2).addFac(t1, -1.0/3.0);

  }

  evaluate(s) {
    if (this.regen & BSplineRecalc.KNOTS) {
      this.regenKnots();
    }

    let ret = bs_evalrets.next().zero();
    let knots = this.knots;
    let ps = this.points;
    this.prefix;
    let degree = this.degree;

    for (let i = 0; i < knots.length; i++) {
      let pi = Math.min(Math.max(i, 0), ps.length - 1);
      let p = ps[pi];

      let w = basis(knots, s, i, degree);

      ret.addFac(p.co, w);
    }

    return ret;
  }

  draw(g) {
    let w = 5;
    g.beginPath();
    g.fillStyle = "rgba(255, 175, 55, 0.5)";
    for (let p of this.points) {
      g.rect(p.co[0] - w/2, p.co[1] - w/2, w, w);
    }
    g.fill();

    g.fillStyle = "green";
    g.beginPath();
    let steps = 16;
    let s = 0.0, ds = 1.0/(steps - 1);
    for (let i = 0; i < steps; i++, s += ds) {
      let p = this.evaluate(s);

      g.rect(p[0] - w*0.5, p[1] - w*0.5, w, w);

    }
    g.fill();

    const yScale = 0.2;
    let ps = this.points;

    let elen = this.points[0].co.vectorDistance(this.points[this.points.length - 1].co);

    let p1 = this.points[0].co;
    let p2 = this.points[this.points.length - 1].co;
    let dx = p2[0] - p1[0];
    let dy = p2[1] - p1[1];

    let th = Math.atan2(dy, dx);
    let knots = this.knots;
    this.prefix;


    function tok(s) {
      return s*(knots[knots.length - 1] - knots[0]) + knots[0];
    }

    function fromk(k) {
      return (k - knots[0])/(knots[knots.length - 1] - knots[0]);
    }

    let drawBasis = (knoti => {
      let steps = 32;
      let s = 0.0, ds = 1.0/(steps - 1);

      let co = new Vector2();

      for (let i = 0; i < steps; i++, s += ds) {
        let x = s*elen;
        let y = elen*yScale;

        let w = basis(this.knots, tok(s), knoti, this.degree);

        y *= w;

        co[0] = x;
        co[1] = y;
        co.rot2d(th);
        co.add(this.points[0].co);

        if (i === 0) {
          g.moveTo(co[0], co[1]);
        } else {
          g.lineTo(co[0], co[1]);
        }
      }

    });

    g.strokeStyle = 'grey';
    g.beginPath();
    let totk = this.knots.length;
    for (let i = 0; i < totk; i++) {
      drawBasis(i);
    }
    g.stroke();

    steps = 32;
    s = 0;
    ds = 1.0/(steps - 1);
    let co = new Vector2();

    //0/1 markers
    g.beginPath();
    co.loadXY(fromk(0.0)*elen, 0.0).rot2d(th).add(ps[0].co);
    g.moveTo(co[0], co[1]);
    co.loadXY(fromk(0.0)*elen, elen*yScale).rot2d(th).add(ps[0].co);
    g.lineTo(co[0], co[1]);
    co.loadXY(fromk(1.0)*elen, 0.0).rot2d(th).add(ps[0].co);
    g.moveTo(co[0], co[1]);
    co.loadXY(fromk(1.0)*elen, elen*yScale).rot2d(th).add(ps[0].co);
    g.lineTo(co[0], co[1]);
    g.stroke();

    g.beginPath();
    g.strokeStyle = "green";
    for (let i = 0; i < steps - 1; i++, s += ds) {
      let w = 0.0;

      let x = s*elen;
      let y = elen*yScale;

      for (let j = 0; j < knots.length; j++) {
        w += basis(knots, s, j, this.degree);
      }

      y *= w;
      co[0] = x;
      co[1] = y;
      co.rot2d(th);
      co.add(this.points[0].co);

      if (i === 0) {
        g.moveTo(co[0], co[1]);
      } else {
        g.lineTo(co[0], co[1]);
      }
    }

    g.stroke();

    g.beginPath();
    g.strokeStyle = "rgba(0,0,0,0.5)";
    s = 0.0;
    for (let i = 0; i < steps - 1; i++, s += ds) {

      let x = s*elen;
      let y = elen*yScale;

      co[0] = x;
      co[1] = y;
      co.rot2d(th);
      co.add(this.points[0].co);

      if (i === 0) {
        g.moveTo(co[0], co[1]);
      } else {
        g.lineTo(co[0], co[1]);
      }
    }
    g.stroke();
  }

  loadStruct(reader) {
    this.regen |= BSplineFlags.FULL;
    reader(this);
  }

  afterSTRUCT(v1, v2) {
    this.v1 = v1;
    this.v2 = v2;
    this.regen = BSplineRecalc.FULL;

    return this;
  }
}

BSpline.STRUCT = `
BSpline {
  points : array(BSplinePoint);
  degere : int;
}
`;
nstructjs.register(BSpline);

const KORDER = 12;
const KSCALE = 16;
const KTH = 17;
const KOFFX = 18;
const KOFFY = 19;
const KARCSCALE = 20;
const KTOT = 21;

function step(ks, klen, s) {
  //s = eps + s * (1.0 - eps*2.0);

  let i1 = s*(klen - 1);
  //let i1 = s*klen*0.9999;
  let t = Math.fract(i1);
  i1 = ~~(i1 + 0.00001);

  let i2 = i1 + 1;

  if (i2 < klen - 1) {
    return ks[i1] + (ks[i2] - ks[i1])*t;
  } else {
    return ks[i1];
  }
}

function dstep(ks, klen, s) {
  let df = 0.00001;

  return (step(ks, klen, s + df) - step(ks, klen, s))/df;
  //return ks[~~(s*(klen*0.9999))];
}

function imix(a, b, s) {
  return -((s - 2.0)*a - b*s)*s*0.5;
}

function istep2(ks, klen, s) {

  let klen2 = klen - 1;
  //s = eps + s * (1.0 - eps*2.0);

  let i1 = s*(klen - 1);
  //let i1 = s*klen*0.9999;
  let t = Math.fract(i1);
  i1 = ~~(i1 + 0.00001);
  let i2 = i1 + 1;

  let sum = 0.0;
  for (let i = 0; i < i1; i++) {
    sum += imix(ks[i], ks[i + 1], 1.0)/klen2;
  }

  i2 = Math.min(Math.max(i2, 0), klen - 1);
  if (i2 !== i1) {
    sum += imix(ks[i1], ks[i2], t)/klen2;
  }

  return sum;
}

function istep(ks, klen, s) {
  return istep2(ks, klen, s);
}


let piecewise_linear = [dstep, step, istep];

//let funcs = circle_arc;
let funcs = piecewise_linear;

/*

operator k, th, dk;
operator isin, icos;

x := icos(th(s));
y := isin(th(s));

forall s let df(icos(th(s)), s) = cos(th(s));
forall s let df(isin(th(s)), s) = sin(th(s));

let df(th(s), s) = k(s);
let df(k(s), s) = dk(s);
let df(dk(s), s) = 0;

dx2 := df(x, s, 2);
dy2 := df(y, s, 2);

dx3 := df(x, s, 3);
dy3 := df(y, s, 3);

dx := cos(th(s))*ds*0.5 + dx2*ds*ds*(1.0/6.0) + dx3*ds*ds*ds*(1.0/24.0);
dy := sin(th(s))*ds*0.5 + dy2*ds*ds*(1.0/6.0) + dy3*ds*ds*ds*(1.0/24.0);

dx/ds;
dy/ds;

*/

let rets = util.cachering.fromConstructor(Vector2, 128);
util.cachering.fromConstructor(Vector2, 128);
let dvrets = util.cachering.fromConstructor(Vector2, 128);
let dv2rets = util.cachering.fromConstructor(Vector2, 128);

function quadrature(ks, klen, s) {
  let steps = 19;
  let s2 = 0.0, ds = s/steps;

  let ret = rets.next().zero();
  let x = 0.0;
  let y = 0.0;

  for (let i = 0; i < steps; i++, s2 += ds) {
    let s3 = s2 + 0.5;
    s3 = Math.min(Math.max(s3, 0.0), 1.0);

    let dk = funcs[0](ks, klen, s3);
    let k = funcs[1](ks, klen, s3);
    let th = funcs[2](ks, klen, s3);

    let cos = Math.cos(th);
    let sin = Math.sin(th);

    let dx = -cos*k*k*ds*ds + 12*cos - dk*sin*ds*ds - 4*k*sin*ds;
    dx *= 0.25;

    let dy = cos*dk*ds*ds + 4*cos*k*ds - k*k*sin*ds*ds + 12*sin;
    dy /= 24.0;

    dx = cos - k*sin*ds*0.5 - (cos*k*k + dk*sin)*ds*ds*(1.0/6.0);
    dy = sin + k*cos*ds*0.5 + (cos*dk - k*k*sin)*ds*ds*(1.0/6.0);

    x += dx;
    y += dy;
  }

  ret[0] = x*ds;
  ret[1] = y*ds;

  return ret;
}

class Clothoid extends Curve {
  constructor(v1, v2) {
    super();

    this.order = KORDER;

    this.ks = new Float64Array(KTOT);
    this.ks.fill(0);
    this._ks = new Float64Array(this.ks.buffer, 0, this.order);

    this.v1 = v1;
    this.v2 = v2;

    this.recalc = 1;
  }

  get length() {
    if (this.recalc) {
      this._update();
    }

    return this.ks[KSCALE];
  }

  init(e) {
    this.v1 = e.v1;
    this.v2 = e.v2;
  }

  update(e) {
    if (e) {
      this.v1 = e.v1;
      this.v2 = e.v2;
    }

    this.recalc = 1;
    return this;
  }

  _update() {
    this.recalc = 0;

    let s = quadrature(this.ks, this.order, -0.5);
    let e = quadrature(this.ks, this.order, 0.5);

    let ks = this.ks;

    ks[KOFFX] = -s[0];
    ks[KOFFY] = -s[1];

    ks[KSCALE] = this.v1.vectorDistance(this.v2)/s.vectorDistance(e);
    ks[KARCSCALE] = 1.0/ks[KSCALE];
    e.sub(s);

    let th1 = Math.atan2(this.v2[1] - this.v1[1], this.v2[0] - this.v1[0]);
    let th2 = Math.atan2(e[1], e[0]);
    ks[KTH] = th1 - th2;
  }

  evaluate(s) {
    if (this.recalc) {
      this._update();
    }

    let ks = this.ks;
    s *= ks[KARCSCALE];

    s = Math.min(Math.max(s, 0.0), 1.0);
    s -= 0.5;

    let p = quadrature(ks, this.order, s);

    p[0] += ks[KOFFX];
    p[1] += ks[KOFFY];

    p.rot2d(ks[KTH]).mulScalar(ks[KSCALE]).add(this.v1);

    return p;
  }

  derivative(s) {
    if (this.recalc) {
      this._update();
    }

    let ks = this.ks;
    s *= ks[KARCSCALE];

    s = Math.min(Math.max(s, 0.0), 1.0);

    let th = funcs[2](this.ks, this.order, s);
    th += ks[KTH];

    let ret = dvrets.next();
    ret[0] = Math.cos(th);
    ret[1] = Math.sin(th);

    return ret;
  }

  derivative2(s) {
    let df = 0.0001;
    let a = this.derivative(s);
    let b = this.derivative(s + df);
    b.sub(a).mulScalar(1.0/df);

    return dv2rets.next().load(b);
  }

  curvature(s) {

    let dv1 = this.derivative(s);
    let dv2 = this.derivative2(s);

    return (dv1[0]*dv2[1] - dv1[1]*dv2[0])/Math.pow(dv1.dot(dv1), 3.0/2.0);
  }

  afterSTRUCT(v1, v2) {
    this.v1 = v1;
    this.v2 = v2;
    this.regen = 1;
  }

  loadSTRUCT(reader) {
    reader(this);

    while (this.ks.length < KTOT) {
      this.ks.push(0.0);
    }

    this.ks = new Float64Array(this.ks);
    this._ks = new Float64Array(this.ks.buffer, 0, this.order);
  }

  normal() {
    return dv2rets.next().zero();
  }

  draw(g) {

  }
}

Clothoid.STRUCT = `
Clothoid {
  ks   : array(float); 
}
`;
nstructjs.register(Clothoid);

class ClothoidSolver {
  constructor(mesh) {
    this.mesh = mesh;
  }

  solve() {
    let mesh = this.mesh;

    new Array(32);

    let solver = new Solver();
    solver.threshold = 0.001;

    for (let e of mesh.edges) {
      if (!(e.curve.ks instanceof Float64Array)) {
        e.curve.ks = new Float64Array(e.curve.ks);
        e.curve._ks = new Float64Array(e.curve.ks.buffer, 0, e.order);
      }

      e.curve.ks.fill(0.001);
      e.curve.update(e);
    }

    function tan_c(params) {
      let [v, e1, e2] = params;

      e1.update();
      e2.update();

      let s1 = v === e1.v1 ? 0 : e1.length;
      let s2 = v === e2.v1 ? 0 : e2.length;

      let t1 = e1.derivative(s1);
      let t2 = e2.derivative(s2);

      if (!(v === e1.v1) === !(v === e2.v1)) {
        t2.negate();
      }

      t1.normalize();
      t2.normalize();

      //return t1.vectorDistanceSqr(t2);
      return Math.acos(t1.dot(t2));
    }

    function curv_c(params) {
      let [v, e1, e2, disabled] = params;

      let k1, k2;

      if (disabled) {
        for (let i=0; i<e1.order; i++) {
          e1.ks[i] *= 0.98;
          e2.ks[i] *= 0.98;
        }
        return 0.0;
      }

      for (let i=0; i<e1.order; i++) {
        //e1.ks[i] *= 0.98;
       // e2.ks[i] *= 0.98;
      }
      //return 0.0;

      //return 0.0;
      k1 = v === e1.v1 ? e1.ks[0] : e1.ks[e1.order - 1];
      k2 = v === e2.v1 ? e2.ks[0] : e2.ks[e2.order - 1];

      let scale1 = e1.ks[KSCALE];
      let scale2 = e2.ks[KSCALE];

      const flip = (v === e1.v1) !== (v === e2.v1);

      if (flip) {
        k2 = -k2;
      }

      k1 /= scale1;
      k2 /= scale2;

      let k = (k1 + k2)*0.5;

      const fac = 0.5;
      k1 += (k - k1)*fac;
      k2 += (k - k2)*fac;

      if (flip) {
        k2 = -k2;
      }

      if (v === e1.v1) {
        e1.ks[0] = k1*scale1;
      } else {
        e1.ks[e1.order - 1] = k1*scale1;
      }

      if (v === e2.v1) {
        e2.ks[0] = k2*scale2;
      } else {
        e2.ks[e2.order - 1] = k2*scale2;
      }

      e1.update();
      e2.update();

      return 0.0;
    }

    const order = mesh.order;

    let badvs = new Set();

    for (let v of mesh.verts) {
      if (v.edges.length !== 2) {
        continue;
      }

      let [e1, e2] = v.edges;
      let v1 = e1.otherVertex(v);
      let v2 = e2.otherVertex(v);

      e1 = e1.curve;
      e2 = e2.curve;


      let t1 = new Vector2(v1).sub(v).normalize();
      let t2 = new Vector2(v2).sub(v).normalize();
      let th = Math.acos(t1.dot(t2)*0.99999);
      if (th < Math.PI*0.2) {
        badvs.add(v);
        continue;
      }

      let ks1 = e1._ks, ks2 = e2._ks;

      let con;

      con = new Constraint("curv_c", curv_c, [ks1, ks2], [v, e1, e2, false], 1.0);
      //solver.add(con);

      con = new Constraint("tan_c", tan_c, [ks1, ks2], [v, e1, e2], 1.0);
      solver.add(con);
    }

    {
      //changeOrder(3);
      //err = solver.solve(15, 0.7, Math.random() > 0.9);
      //changeOrder(KORDER);
      solver.solve(55, 0.7);// Math.random() > 0.9);
    }

    for (let e of mesh.edges) {
      e.curve.update();
    }

    for (let v of badvs) {
      let [e1, e2] = v.edges;
      if (v === e1.v1) {
        e1.curve.ks[0] = 0.0;
      } else {
        e1.curve.ks[order-1] = 0.0;
      }
      if (v === e2.v1) {
        e2.curve.ks[0] = 0.0;
      } else {
        e2.curve.ks[order-1] = 0.0;
      }
    }
    //console.log("error:", err.toFixed(3));
  }
}

const evalrets = util.cachering.fromConstructor(Vector2, 512);

function cubic(a, b, c, d, t) {
  let k1 = a + (b - a)*t;
  let k2 = b + (c - b)*t;
  let k3 = c + (d - c)*t;

  let ka = k1 + (k2 - k1)*t;
  let kb = k2 + (k3 - k2)*t;

  return ka + (kb - ka)*t;
}

class CubicBezier {
  constructor(v1, h1, h2, v2) {
    this.v1 = new Vector2(v1);
    this.v2 = new Vector2(v2);
    this.h1 = new Vector2(h1);
    this.h2 = new Vector2(h2);

    this.regen = 1;
    this.stable = new Array(1024);
    this.arcLength = 0;
  }

  get length() {
    if (this.regen) {
      this.genTable();
    }

    return this.arcLength;
  }

  _evaluate(t) {
    let ret = evalrets.next();

    let {v1, h1, h2, v2} = this;

    for (let i = 0; i < 2; i++) {
      ret[i] = cubic(v1[i], h1[i], h2[i], v2[i], t);
    }

    return ret;
  }

  afterSTRUCT() {
    this.regen = 1;
  }

  genTable() {
    this.regen = 0;

    let stable = this.stable;
    stable.fill(undefined);

    let t = 0, dt = 1.0/(stable.length - 1);
    let lastp;
    let s = 0.0;

    let ss = [];

    stable[0] = 0;

    for (let i = 0; i < stable.length; i++, t += dt) {
      let p = this._evaluate(t);

      if (lastp) {
        s += p.vectorDistance(lastp);
      }

      ss.push(s);
      ss.push(t);

      lastp = p;
    }

    let tots = new Array(this.stable.length);
    tots.fill(0);

    let len = this.arcLength = s;

    let ilen = len !== 0.0 ? 1.0/len : 0.0;
    let tsize = this.stable.length;

    for (let i = 0; i < ss.length; i += 2) {
      let s = ss[i], t = ss[i + 1];

      let si = ~~(s*ilen*(tsize - 1));

      if (!tots[si]) {
        stable[si] = t;
      } else {
        stable[si] += t;
      }

      tots[si]++;
    }

    for (let i = 0; i < stable.length; i++) {
      if (tots[i]) {
        stable[i] /= tots[i];
      }
    }

    /* figure out endpoint */
    let si = stable.length - 1;
    while (si >= 0 && stable[si] === undefined) {
      si--;
    }

    s = stable[si] ?? 1.0;
    while (si < stable.length) {
      stable[si] = s;
      si++;
    }

    /*interpolate empty space*/
    for (let i = 0; i < stable.length - 1; i++) {
      if (stable[i + 1] !== undefined) {
        continue;
      }

      let i1 = i;
      let i2 = i + 1;

      while (stable[i2] === undefined) {
        i2++;
      }

      let dt = 1.0/(i2 - i1);
      let t = dt;

      let a = stable[i1];
      let b = stable[i2];

      for (let j = i1 + 1; j <= i2; j++, t += dt) {
        stable[j] = a + (b - a)*t;
      }
    }
  }

  evaluate(s) {
    if (this.regen) {
      this.genTable();
    }

    s = Math.min(Math.max(s, 0.0), this.arcLength);
    s /= this.arcLength;

    let si = s*(this.stable.length - 1);
    let i1 = ~~si;
    let i2 = i1 + 1;

    si = Math.fract(si);

    let t;
    if (i2 < this.stable.length) {
      t = this.stable[i1] + (this.stable[i2] - this.stable[i1])*si;
    } else {
      t = this.stable[i1];
    }

    return this._evaluate(t);
  }

  update() {
    this.regen = 1;
    return this;
  }

  derivative(s) {
    let df = 0.0001;

    let a = this.evaluate(s);
    let b = this.evaluate(s + df);

    b.sub(a).divScalar(df);
    return b;
  }

  derivative2(s) {
    let df = 0.0001;

    let a = this.derivative(s);
    let b = this.derivative(s + df);

    b.sub(a).divScalar(df);
    return b;
  }

  curvature(s) {
    let dv1 = this.derivative(s);
    let dv2 = this.derivative2(s);

    return (dv1[0]*dv2[1] - dv1[1]*dv2[0]) / Math.pow(dv1.dot(dv1), 3.0/2.0);
  }

  normal(s) {
    let dv1 = this.derivative(s);
    let tmp = dv1[0];

    dv1[0] = -dv1[1];
    dv1[1] = tmp;

    dv1.normalize();
    return dv1;
  }

  draw() {

  }
}

CubicBezier.STRUCT = `
CubicBezier {
  v1 : vec2;
  h1 : vec2;
  h2 : vec2;
  v2 : vec2;
}
`;
nstructjs.register(CubicBezier);

const MeshTypes = {
  VERTEX  : 1,
  EDGE    : 2,
  HANDLE  : 4,
  LOOP    : 8,
  LOOPLIST: 16,
  FACE    : 32
};

const MeshFlags = {
  SELECT: 1,
  HIDE  : 2
};

const sel = [1, 0.8, 0, 1];
const high = [1, 0.8, 0.7, 1];
const act = [0, 0.3, 0.8, 1];
const actsel = [0.5, 0.3, 0.8, 1];

let mix = (a, b, fac) => new Vector4(a).interp(b, fac);

const ElemColors = [
  [0, 0, 0, 1], //0    0
  sel, //001  1 Select
  act, //010  2 Active
  mix(sel, actsel, 0.25), //011  3 Select+Active
  high, //100  4 Highlight
  mix(high, sel, 0.5), //101  5 Highlight+Select
  mix(high, actsel, 0.5), //110  6 Highlight+Active
  new Vector4(high).add(sel).add(actsel).mulScalar(0.3333), //111  7 Highlight+Select+Active
];

for (let i = 0; i < ElemColors.length; i++) {
  ElemColors[i] = new Vector4(ElemColors[i]);
}

console.log(ElemColors);

class Element {
  constructor(type) {
    this.type = type;
    this.flag = this.index = 0;
    this.eid = -1;
  }

  [Symbol.keystr]() {
    return this.eid;
  }

  toJSON() {
    return {
      type : this.type,
      flag : this.flag,
      index: this.index,
      eid  : this.eid
    };
  }

  loadJSON(obj) {
    this.type = obj.type;
    this.flag = obj.flag;
    this.index = obj.index;
    this.eid = obj.eid;

    return this;
  }
}

Element.STRUCT = `
mesh.Element {
  type     : int;
  flag     : int;
  index    : int;
  eid      : int;
}
`;
nstructjs.register(Element);

function mixinVector3(cls) {
  let parent = Vector3;
  let lastparent;

  while (parent && parent !== lastparent && parent.prototype) {
    for (let k of Reflect.ownKeys(parent.prototype)) {
      if (k === "buffer" || k === "byteLength" || k === "byteOffset" || k === "length") {
        continue;
      }

      if (!cls.prototype[k]) {
        try {
          cls.prototype[k] = parent.prototype[k];
        } catch (error) {
          util.print_stack(error);
          console.warn("Failed to inherit Vector prototype property " + k);
          continue;
        }
      }
    }

    lastparent = parent;
    parent = parent.__proto__;
  }

  cls.prototype.initVector3 = function () {
    this.length = 3;
    this[0] = this[1] = this[2] = 0.0;
  };

  cls.prototype.load = function (b) {
    this[0] = b[0];
    this[1] = b[1];
    this[2] = b[2];

    return this;
  };
}

//has Vector3 mixin
class Vertex extends Element {
  constructor(co) {
    super(MeshTypes.VERTEX);
    this.initVector3();

    if (co !== undefined) {
      this.load(co);
    }

    this.edges = [];
  }

  toJSON() {
    let edges = [];
    for (let e of this.edges) {
      edges.push(e.eid);
    }

    return util.merge(super.toJSON(), {
      0    : this[0],
      1    : this[1],
      2    : this[2],
      edges: edges
    });
  }

  otherEdge(e) {
    if (this.edges.length !== 2) {
      throw new Error("otherEdge only works on 2-valence vertices");
    }

    if (e === this.edges[0])
      return this.edges[1];
    else if (e === this.edges[1])
      return this.edges[0];
    else {
      return undefined;
    }
  }

  loadJSON(obj) {
    super.loadJSON(obj);

    this.edges = obj.edges;
    this[0] = obj[0];
    this[1] = obj[1];
    this[2] = obj[2];

    return this;
  }
}

mixinVector3(Vertex);

Vertex.STRUCT = nstructjs.inherit(Vertex, Element, "mesh.Vertex") + `
  0           : float;
  1           : float;
  2           : float;
  edges       : array(e, int) | e.eid;
}
`;
nstructjs.register(Vertex);

//has Vector3 mixin
class Handle extends Element {
  constructor(co) {
    super(MeshTypes.HANDLE);
    this.initVector3();

    if (co !== undefined) {
      this.load(co);
    }

    this.owner = undefined;
  }

  toJSON() {
    return Object.assign({
      0    : this[0],
      1    : this[1],
      owner: this.owner ? this.owner.eid : -1
    }, super.toJSON());
  }

  loadJSON(obj) {
    super.loadJSON(obj);

    this[0] = obj[0];
    this[1] = obj[1];
    this.owner = obj.owner;

    return this;
  }
}

mixinVector3(Handle);

Handle.STRUCT = nstructjs.inherit(Handle, Element, "mesh.Handle") + `
  0           : float;
  1           : float;
  2           : float;
  owner       : int | this.owner ? this.owner.eid : -1;
}
`;
nstructjs.register(Handle);

util.cachering.fromConstructor(Vector3, 64);

class Edge extends Element {
  constructor() {
    super(MeshTypes.EDGE);

    this.h1 = this.h2 = undefined;
    this.v1 = this.v2 = undefined;
    this.l = undefined;

    this.curve = undefined;
  }

  update() {
    this.curve.update();
    return this;
  }

  get length() {
    return this.curve.length;
  }

  get loops() {
    let this2 = this;

    return (function* () {
      if (!this2.l) {
        return;
      }

      let l = this2.l;
      let _i = 0;

      do {
        if (_i++ > 100) {
          console.warn("Infinite loop detected!", this2.eid);
          break;
        }

        yield l;

        l = l.radial_next;
      } while (l !== this2.l);
    })();
  }

  evaluate(s) {
    return this.curve.evaluate(s);
    //return _evaluate_vs.next().load(this.v1).interp(this.v2, t);
  }

  derivative(s) {
    let eps = 0.00005;
    s = s * (1.0 - eps*2.0) + eps;

    return this.curve.derivative(s);
  }

  derivative2(t) {
    let df = 0.0001;
    let a = this.derivative(t - df);
    let b = this.derivative(t + df);

    return b.sub(a).mulScalar(0.5/df);
  }

  normal(s) {
    let dv1 = this.derivative(s);
    //dv1.normalize();

    dv1.mulScalar(0.01);

    let tmp = dv1[0];
    dv1[0] = dv1[1];
    dv1[1] = -tmp;

    return dv1;
  }

  curvature(t) {
    return this.curve.curvature(t);
  }

  toJSON() {
    return util.merge(super.toJSON(), {
      v1: this.v1.eid,
      v2: this.v2.eid,

      h1: this.h1.eid,
      h2: this.h2.eid,
      l : this.l ? this.l.eid : -1
    });
  }

  handle(v) {
    return v === this.v1 ? this.h1 : this.h2;
  }

  vertex(h) {
    return h === this.h1 ? this.v1 : this.v2;
  }

  loadJSON(obj) {
    super.loadJSON(obj);

    this.v1 = obj.v1;
    this.v2 = obj.v2;

    this.h1 = obj.h1;
    this.h2 = obj.h2;
    this.l = obj.l;

    return this;
  }

  otherVertex(v) {
    if (v === undefined)
      throw new Error("v cannot be undefined in Edge.prototype.otherVertex()");

    if (v === this.v1)
      return this.v2;
    if (v === this.v2)
      return this.v1;

    throw new Error("vertex " + v.eid + " not in edge");
  }
}

Edge.STRUCT = nstructjs.inherit(Edge, Element, "mesh.Edge") + `
  v1           : int | this.v1.eid;
  v2           : int | this.v2.eid;
  h1           : int | this.h1.eid;
  h2           : int | this.h2.eid;
  l            : int | this.l ? this.l.eid : -1;
  curve        : ${Clothoid.structName};
}`;
nstructjs.register(Edge);

class Loop extends Element {
  constructor() {
    super(MeshTypes.LOOP);

    this.f = undefined;
    this.radial_next = undefined;
    this.radial_prev = undefined;
    this.v = undefined;
    this.e = undefined;
    this.next = undefined;
    this.prev = undefined;
    this.list = undefined;
  }

  toJSON() {
    return Object.assign({
      v          : this.v.eid,
      e          : this.e.eid,
      f          : this.f.eid,
      radial_next: this.radial_next.eid,
      radial_prev: this.radial_prev.eid,
      next       : this.next.eid,
      prev       : this.prev.eid,
      list       : this.list.eid
    }, super.toJSON());
  }

  loadJSON(obj) {
    super.loadJSON(obj);

    this.v = obj.v;
    this.e = obj.e;
    this.f = obj.f;

    this.radial_next = obj.radial_next;
    this.radial_prev = obj.radial_prev;

    this.next = obj.next;
    this.prev = obj.prev;

    this.list = obj.list;

    return this;
  }
}

Loop.STRUCT = nstructjs.inherit(Loop, Element, "mesh.Loop") + `
  v : int | this.v.eid;
  e : int | this.e.eid;
}`;
nstructjs.register(Loop);

class LoopListIter {
  constructor() {
    this.ret = {done : false, value : undefined};
    this.stack = undefined;
    this.l = undefined;
    this.list = undefined;
    this.done = false;
    this.i = 0;
  }

  [Symbol.iterator]() {
    return this;
  }

  reset(list, stack) {
    this.stack = stack;
    this.list = list;
    this.done = false;
    this.l = list.l;
    this.i = 0;

    return this;
  }

  next() {
    let ret = this.ret;

    let l = this.l;

    if (this.i++ > 100000) {
      console.warn("Infinite loop error!");
      return this.finish();
    }

    if (!l) {
      return this.finish();
    }

    this.l = this.l.next;
    if (this.l === this.list.l) {
      this.l = undefined;
    }

    ret.value = l;
    ret.done = false;

    return ret;
  }

  finish() {
    if (!this.done) {
      this.list = undefined;
      this.l = undefined;
      this.ret.value = undefined;
      this.ret.done = true;
      this.stack.cur--;
      this.done = true;
    }

    return this.ret;
  }

  return() {
    return this.finish();
  }
}

let loopstack = new Array(1024);
loopstack.cur = 0;
for (let i=0; i<loopstack.length; i++) {
  loopstack[i] = new LoopListIter();
}

class LoopList extends Element {
  constructor() {
    super(MeshTypes.LOOPLIST);

    this.length = 0;

    this.l = undefined;
    this._loops = undefined; //used by serialization
  }

  get verts() {
    let this2 = this;
    return (function* () {
      for (let l of this2) {
        yield l.v;
      }
    })();
  }

  [Symbol.iterator]() {
    return loopstack[loopstack.cur++].reset(this, loopstack);
  }

  toJSON() {
    return Object.assign({
      l: this.l.eid,
    }, super.toJSON());
  }

  loadJSON(obj) {
    super.loadJSON(obj);

    this.l = obj.l;

    return this;
  }

  _save_loops() {
    return util.list(this).map(l => l.eid);
  }
}

LoopList.STRUCT = nstructjs.inherit(LoopList, Element, "mesh.LoopList") + `
  _loops : iter(int) | this._save_loops();
}
`;
nstructjs.register(LoopList);

class Face extends Element {
  constructor() {
    super(MeshTypes.FACE);
    this.lists = [];
    this.blur = 0.0;
    this.center = new Vector3();
    this.fillColor = new Vector4([0.5, 0.5, 0.5, 1]);
  }

  get loops() {
    let this2 = this;
    let ret = (function* () {
      for (let list of this2.lists) {
        for (let l of list) {
          yield l;
        }
      }
    })();
    Object.defineProperty(ret, "length", {
      get: function () {
        let count = 0;
        for (let list of this2.lists) {
          for (let l of list) {
            count++;
          }
        }

        return count;
      }
    });

    return ret;
  }

  get verts() {
    let this2 = this;
    let ret = (function* () {
      for (let list of this.lists) {
        for (let l of list) {
          yield l.v;
        }
      }
    })();

    Object.defineProperty(ret, "length", {
      get: function () {
        let count = 0;
        for (let list of this2.lists) {
          for (let l of list) {
            count++;
          }
        }

        return count;
      }
    });

    return ret;
  }

  toJSON() {
    let lists = [];

    for (let list of this.lists) {
      lists.push(list.eid);
    }

    return Object.assign({
      lists    : lists,
      center   : this.center,
      blur     : this.blur,
      fillColor: this.fillColor
    }, super.toJSON());
  }

  calcCenter() {
    this.center.zero();
    let tot = 0;

    for (let l of this.loops) {
      this.center.add(l.v);
      tot++;
    }

    if (tot) {
      this.center.mulScalar(1.0/tot);
    }

    return this.center;
  }

  loadJSON(obj) {
    super.loadJSON(obj);

    this.center = new Vector3(obj.center);
    if (isNaN(this.center[2])) {
      this.center[2] = 0.0;
    }

    this.lists = obj.lists;
    this.blur = obj.blur || 0.0;
    this.fillColor = new Vector4(obj.fillColor);

    return this;
  }
}

Face.STRUCT = nstructjs.inherit(Face, Element, "mesh.Face") + `
  lists     : iter(list, int) | list.eid;
  fillColor : vec4;
  blur      : float;
}
`;
nstructjs.register(Face);

class ElementSet extends Set {
  constructor(type) {
    super();
    this.type = type;
  }

  get editable() {
    let this2 = this;
    return (function* () {
      for (let item of this2) {
        if (!(item.flag & MeshFlags.HIDE)) {
          yield item;
        }
      }
    })();
  }

  get length() {
    return this.size;
  }

  remove(item) {
    this.delete(item);
  }
}

class ElementArray {
  constructor(type) {
    this.list = [];
    this.length = 0;
    this.type = type;
    this.selected = new ElementSet(type);
    this.on_selected = undefined;
    this.highlight = this.active = undefined;
    this.freelist = [];
  }

  get visible() {
    let this2 = this;

    return (function* () {
      for (let item of this2) {
        if (!(item.flag & MeshFlags.HIDE)) {
          yield item;
        }
      }
    })();
  }

  get editable() {
    return this.visible;
  }

  [Symbol.iterator]() {
    let this2 = this;

    return (function* () {
      let list = this2.list;

      for (let i = 0; i < list.length; i++) {
        if (list[i] !== undefined) {
          yield list[i];
        }
      }
    })();
  }

  concat(b) {
    let ret = [];

    for (let item of this) {
      ret.push(item);
    }

    for (let item of b) {
      ret.push(item);
    }

    return ret;
  }

  toJSON() {
    let arr = [];

    for (let item of this) {
      arr.push(item);
    }

    let sel = [];
    for (let v of this.selected) {
      sel.push(v.eid);
    }

    return {
      type     : this.type,
      array    : arr,
      selected : sel,
      active   : this.active !== undefined ? this.active.eid : -1,
      highlight: this.highlight !== undefined ? this.highlight.eid : -1
    };
  }

  loadJSON(obj) {
    this.list.length = [];
    this.length = 0;
    this.freelist.length = 0;
    this.selected = new util.set();
    this.active = this.highlight = undefined;
    this.type = obj.type;

    for (let e of obj.array) {
      let e2 = undefined;

      switch (e.type) {
        case MeshTypes.VERTEX:
          e2 = new Vertex();
          break;
        case MeshTypes.HANDLE:
          e2 = new Handle();
          break;
        case MeshTypes.EDGE:
          e2 = new Edge();
          break;
        case MeshTypes.LOOP:
          e2 = new Loop();
          break;
        case MeshTypes.LOOPLIST:
          e2 = new LoopList();
          break;
        case MeshTypes.FACE:
          e2 = new Face();
          break;
        default:
          console.log(e);
          throw new Error("bad element " + e);
      }

      e2.loadJSON(e);
      e2._index = this.list.length;
      this.list.push(e2);
      this.length++;

      if (e2.flag & MeshFlags.SELECT) {
        this.selected.add(e2);
      }

      if (e2.eid === obj.active) {
        this.active = e2;
      } else if (e2.eid === obj.highlight) {
        this.highlight = e2;
      }
    }
  }

  push(v) {
    v._index = this.list.length;
    this.list.push(v);
    this.length++;

    if (v.flag & MeshFlags.SELECT) {
      this.selected.add(v);
    }

    return this;
  }

  remove(v) {
    if (this.selected.has(v)) {
      this.selected.remove(v);
    }

    if (this.active === v)
      this.active = undefined;
    if (this.highlight === v)
      this.highlight = undefined;

    if (v._index < 0 || this.list[v._index] !== v) {
      throw new Error("element not in array");
    }

    this.freelist.push(v._index);

    this.list[v._index] = undefined;
    v._index = -1;
    this.length--;

    //super.remove(v);

    return this;
  }

  selectNone() {
    for (let e of this) {
      this.setSelect(e, false);
    }
  }

  selectAll() {
    for (let e of this) {
      this.setSelect(e, true);
    }
  }

  setSelect(v, state) {
    if (state) {
      v.flag |= MeshFlags.SELECT;

      this.selected.add(v);
    } else {
      v.flag &= ~MeshFlags.SELECT;

      this.selected.remove(v, true);
    }

    return this;
  }

  loadSTRUCT(reader) {
    reader(this);

    for (let elem of this) {
      if (elem.flag & MeshFlags.SELECT) {
        this.selected.add(elem);
      }
    }
  }
}

ElementArray.STRUCT = `
mesh.ElementArray {
  this        : iter(abstract(mesh.Element));
  highlight   : int | this.highlight ? this.highlight.eid : -1;
  active      : int | this.active ? this.active.eid : -1;
  type        : int;
}
`;
nstructjs.register(ElementArray);

const RecalcFlags = {
  SOLVE : 1
};

class Mesh {
  constructor() {
    this.eidgen = new util.IDGen();
    this.eidMap = new Map();

    this.recalc = RecalcFlags.SOLVE;

    this.CurveCls = Clothoid;
    this.SolverCls = ClothoidSolver;

    this.verts = undefined;
    this.lists = undefined;
    this.handles = undefined;
    this.edges = undefined;
    this.loops = undefined;
    this.faces = undefined;

    this.elists = {};

    this.makeElists();
  }

  ensureSolve() {
    if (this.recalc & RecalcFlags.SOLVE) {
      this.solve();
    }
  }

  switchSplineType(CurveCls, SolverCls) {
    this.CurveCls = CurveCls;
    this.SolverCls = SolverCls;

    for (let e of this.edges) {
      e.curve = new CurveCls();
    }

    this.regenSolve();
  }

  solve() {
    this.recalc &= ~RecalcFlags.SOLVE;

    let solver = new this.SolverCls(this);
    solver.solve();

    return this;
  }

  regenSolve() {
    this.recalc |= RecalcFlags.SOLVE;
    return this;
  }

  get elements() {
    return this.eidMap.values();
  }

  get hasHighlight() {
    for (let k in this.elists) {
      if (this.elists[k].highlight) {
        return true;
      }
    }

    return false;
  }

  getElists() {
    let ret = [];

    for (let k in this.elists) {
      ret.push(this.elists[k]);
    }

    return ret;
  }

  addElistAliases() {
    this.verts = this.elists[MeshTypes.VERTEX];
    this.handles = this.elists[MeshTypes.HANDLE];
    this.edges = this.elists[MeshTypes.EDGE];
    this.loops = this.elists[MeshTypes.LOOP];
    this.lists = this.elists[MeshTypes.LOOPLIST];
    this.faces = this.elists[MeshTypes.FACE];
  }

  makeElists() {
    for (let k in MeshTypes) {
      let type = parseInt(MeshTypes[k]);

      this.elists[type] = new ElementArray(type);
    }

    this.addElistAliases();
  }

  _element_init(e) {
    e.eid = this.eidgen.next();
    this.eidMap.set(e.eid, e);
  }

  setActive(elem) {
    if (!elem) {
      for (let k in this.elists) {
        this.elists[k].active = undefined;
      }
    } else {
      this.elists[elem.type].active = elem;
    }

    return this;
  }

  setHighlight(elem) {
    let ret = false;

    if (!elem) {
      for (let k in this.elists) {
        ret = ret || this.elists[k].highlight;
        this.elists[k].highlight = undefined;
      }
    } else {
      ret = this.elists[elem.type].highlight !== elem;
      this.elists[elem.type].highlight = elem;
    }

    return ret;
  }

  makeVertex(co) {
    let v = new Vertex(co);

    this._element_init(v);
    this.verts.push(v);

    return v;
  }

  makeHandle(co) {
    let h = new Handle(co);
    this._element_init(h);
    this.handles.push(h);
    return h;
  }

  reverseEdge(e) {
    let v = e.v1;
    e.v1 = e.v2;
    e.v2 = v;

    let h = e.h1;
    e.h1 = e.h2;
    e.h2 = h;
  }

  getEdge(v1, v2) {
    for (let e of v1.edges) {
      if (e.otherVertex(v1) === v2)
        return e;
    }

    return undefined;
  }

  makeEdge(v1, v2) {
    let e = new Edge();

    e.v1 = v1;
    e.v2 = v2;

    e.h1 = this.makeHandle(v1);
    e.h1.interp(v2, 1.0/2.0);
    e.h1.owner = e;

    e.h2 = this.makeHandle(v1);
    e.h2.interp(v2, 2.0/3.0);
    e.h2.owner = e;

    e.curve = new this.CurveCls(v1, v2);

    v1.edges.push(e);
    v2.edges.push(e);

    this._element_init(e);
    this.edges.push(e);

    return e;
  }

  killVertex(v) {
    if (v.eid === -1) {
      console.trace("Warning: vertex", v.eid, "already freed", v);
      return;
    }

    let _i = 0;

    while (v.edges.length > 0) {
      this.killEdge(v.edges[0]);

      if (_i++ >= 100) {
        console.warn("mesh integrity warning, infinite loop detected in killVertex");
      }
    }

    this.eidMap.delete(v.eid);
    this.verts.remove(v);

    v.eid = -1;
  }

  killEdge(e) {
    if (e.eid === -1) {
      console.trace("Warning: edge", e.eid, "already freed", e);
      return;
    }

    let _i = 0;
    while (e.l) {
      this.killFace(e.l.f);

      if (_i++ > 1000) {
        console.log("infinite loop detected");
        break;
      }
    }

    this.edges.remove(e);
    this.eidMap.delete(e.eid);

    this.eidMap.delete(e.h1.eid);
    this.handles.remove(e.h1);

    this.eidMap.delete(e.h2.eid);
    this.handles.remove(e.h2);

    e.eid = -1;

    e.v1.edges.remove(e);
    e.v2.edges.remove(e);
  }

  radialLoopRemove(e, l) {
    if (e.l === l) {
      e.l = e.l.radial_next;
    }

    if (e.l === l) {
      e.l = undefined;
      return;
    }

    l.radial_next.radial_prev = l.radial_prev;
    l.radial_prev.radial_next = l.radial_next;
  }

  radialLoopInsert(e, l) {
    if (!e.l) {
      e.l = l;
      l.radial_next = l.radial_prev = l;
    } else {
      l.radial_prev = e.l;
      l.radial_next = e.l.radial_next;

      e.l.radial_next.radial_prev = l;
      e.l.radial_next = l;
    }
  }

  _killList(list) {
    this.eidMap.delete(list.eid);
    this.lists.remove(list);
    list.eid = -1;
  }

  killFace(f) {
    for (let list of f.lists) {
      for (let l of list) {
        this.radialLoopRemove(l.e, l);

        this._killLoop(l);
      }

      this._killList(list);
    }

    this.eidMap.delete(f.eid);
    this.faces.remove(f);
    f.eid = -1;
  }

  addLoopList(f, vs) {
    let list = new LoopList();
    this._element_init(list);
    this.lists.push(list);

    let lastl, firstl;

    for (let i = 0; i < vs.length; i++) {
      let v1 = vs[i], v2 = vs[(i + 1)%vs.length];

      let e = this.getEdge(v1, v2);
      if (!e) {
        e = this.makeEdge(v1, v2);
      }

      let l = new Loop();
      this._element_init(l);
      this.loops.push(l);

      l.v = v1;
      l.e = e;
      l.f = f;
      l.list = list;

      this.radialLoopInsert(e, l);

      if (!firstl) {
        firstl = l;
      } else {
        lastl.next = l;
        l.prev = lastl;
      }

      lastl = l;
    }

    firstl.prev = lastl;
    lastl.next = firstl;

    list.l = firstl;

    f.lists.push(list);
  }

  makeFace(vs) {
    let f = new Face();
    this._element_init(f);
    this.faces.push(f);

    let list = new LoopList();
    this._element_init(list);
    this.lists.push(list);

    let lastl, firstl;

    for (let i = 0; i < vs.length; i++) {
      let v1 = vs[i], v2 = vs[(i + 1)%vs.length];

      let e = this.getEdge(v1, v2);
      if (!e) {
        e = this.makeEdge(v1, v2);
      }

      let l = new Loop();
      this._element_init(l);
      this.loops.push(l);

      l.v = v1;
      l.e = e;
      l.f = f;
      l.list = list;

      this.radialLoopInsert(e, l);

      if (!firstl) {
        firstl = l;
      } else {
        lastl.next = l;
        l.prev = lastl;
      }

      lastl = l;
      list.length++;
    }

    firstl.prev = lastl;
    lastl.next = firstl;

    list.l = firstl;

    f.lists.push(list);
    return f;
    /*
      f           : this.f.eid,
      radial_next : this.radial_next.eid,
      radial_prev : this.radial_prev.eid,
      v           : this.v.eid,
      e           : this.e.eid,
      next        : this.next.eid,
      prev        : this.prev.eid,
      list        : this.list.eid
    */
  }

  selectFlush(selmode) {
    if (selmode & MeshTypes.VERTEX) {
      this.edges.selectNone();
      let set_active = this.edges.active === undefined;
      set_active = set_active || !(this.edges.active && ((this.edges.active.v1.flag | this.edges.active.v2.flag) & MeshFlags.SELECT));

      for (let e of this.edges) {
        if ((e.v1.flag & MeshFlags.SELECT) && (e.v2.flag & MeshFlags.SELECT)) {
          this.edges.setSelect(e, true);

          this.handles.setSelect(e.h1, true);
          this.handles.setSelect(e.h2, true);

          if (set_active) {
            this.edges.active = e;
          }
        }
      }

      for (let f of this.faces) {
        let ok = true;

        for (let l of f.loops) {
          if (!(l.e.flag & MeshFlags.SELECT)) {
            ok = false;
            break;
          }
        }

        if (ok) {
          this.faces.setSelect(f, true);
        }
      }
    } else if (selmode & MeshTypes.EDGE) {
      this.verts.selectNone();

      for (let v of this.verts) {
        for (let e of v.edges) {
          if (e.flag & MeshFlags.SELECT) {
            this.verts.setSelect(v, true);
            break;
          }
        }
      }
    }
  }

  splitEdge(e, t = 0.5) {
    let nv = this.makeVertex(e.v1).interp(e.v2, t);
    let ne = this.makeEdge(nv, e.v2);

    e.v2.edges.remove(e);
    e.v2 = nv;
    nv.edges.push(e);

    let vector = e.v1.length === 2 ? Vector2 : Vector3;

    new vector(e.h1);
    new vector(e.h2);

    //e.h.interp(e.v1, 1.0/3.0);
    //ne.h.load(h).interp(ne.v2, 0.5);
    //nv.interp(h, 0.5);

    ne.h1.load(nv).interp(ne.v2, 1.0/3.0);
    ne.h1.load(nv).interp(ne.v2, 2.0/3.0);

    e.h2.load(e.v1).interp(nv, 2.0/3.0);

    if (e.flag & MeshFlags.SELECT) {
      this.edges.setSelect(ne, true);
      this.verts.setSelect(nv, true);
    }

    if (e.l) {
      let l = e.l;
      let ls = [];
      let _i = 0;
      do {
        if (_i++ > 10) {
          console.warn("infinite loop detected");
          break;
        }

        ls.push(l);
        l = l.radial_next;
      } while (l !== e.l);

      for (let l of ls) {
        let l2 = new Loop();
        this._element_init(l2);
        this.loops.push(l2);

        l2.f = l.f;
        l2.list = l.list;

        if (l.e === e) {
          l2.v = nv;
          l2.e = ne;
          l2.prev = l;
          l2.next = l.next;
          l.next.prev = l2;
          l.next = l2;

          this.radialLoopInsert(ne, l2);
        } else {
          this.radialLoopRemove(e, l);

          l2.v = nv;
          l.e = ne;
          l2.e = e;

          this.radialLoopInsert(ne, l);
          this.radialLoopInsert(e, l2);

          l.next.prev = l2;
          l2.prev = l;
          l2.next = l.next;
          l.next = l2;

          /*
         v1 <--l2--<--l--- v2
             --e1--|--ne--
             --l--->--l2-->

          */
        }
      }
    }

    return [ne, nv];
  }

  clearHighlight() {
    let exist = this.hasHighlight;

    for (let k in this.elists) {
      this.elists[k].highlight = undefined;
    }

    return exist;
  }

  unlinkFace(f) {
    for (let list of f.lists) {
      for (let l of list) {
        this.radialLoopRemove(l.e, l);
      }
    }
  }

  linkFace(f, forceRelink=true) {
    for (let list of f.lists) {
      for (let l of list) {
        if (forceRelink || !l.e) {
          l.e = this.getEdge(l.v, l.next.v);

          if (!l.e) {
            l.e = this.makeEdge(l.v, l.next.v);
          }
        }

        this.radialLoopInsert(l.e, l);
      }
    }
  }

  _killLoop(l) {
    this.eidMap.delete(l.eid);
    this.loops.remove(l);
    l.eid = -1;
  }

  dissolveVertex(v) {
    if (v.edges.length !== 2) {
      throw new Error("can't dissolve vertex with more than two edges");
    }

    let loops = new Set();
    let faces = new Set();

    for (let e of v.edges) {
      for (let l of e.loops) {
        if (l.v !== v) {
          l = l.next;
        }

        loops.add(l);
        faces.add(l.f);
      }
    }

    for (let f of faces) {
      this.unlinkFace(f);
    }

    for (let l of loops) {
      if (l.v !== v) {
        l = l.next;
      }

      l.prev.next = l.next;
      l.next.prev = l.prev;

      if (l === l.list.l) {
        l.list.l = l.list.l.next;
      }

      if (l === l.list.l) {
        console.warn("Destroying face");

        l.f.lists.remove(l.list);
        this._killList(l.list);

        if (l.f.lists.length === 0) {
          faces.delete(l.f);
          this.killFace(l.f);
          continue;
        }
      } else {
        l.list.length--;
      }

      this._killLoop(l);
    }

    let e1 = v.edges[0], e2 = v.edges[1];
    let v1 = e1.otherVertex(v), v2 = e2.otherVertex(v);

    let flag = (e1.flag | e2.flag) & ~MeshFlags.HIDE;

    this.killVertex(v);
    {
      let e3 = this.makeEdge(v1, v2);

      if (flag & MeshFlags.SELECT) {
        this.edges.setSelect(e3, true);
      }

      e3.flag |= flag;
    }

    for (let f of faces) {
      this.linkFace(f, true);
    }
  }

  getList(type) {
    return this.elists[type];
  }

  setSelect(e, state) {
    this.getList(e.type).setSelect(e, state);
  }

  selectNone() {
    for (let k in this.elists) {
      this.elists[k].selectNone();
    }
  }

  selectAll() {
    for (let k in this.elists) {
      this.elists[k].selectAll();
    }
  }

  regen_render() {
    window.redraw_all();
  }

  loadSTRUCT(reader) {
    reader(this);

    this.recalc = 0;

    let elists = this.elists;
    this.elists = {};

    for (let elist of elists) {
      this.elists[elist.type] = elist;
    }

    this.addElistAliases();

    let eidMap = this.eidMap = new Map();

    for (let list of this.getElists()) {
      for (let elem of list) {
        eidMap.set(elem.eid, elem);
      }
    }

    for (let v of this.verts) {
      for (let i = 0; i < v.edges.length; i++) {
        v.edges[i] = eidMap.get(v.edges[i]);
      }
    }

    for (let h of this.handles) {
      h.owner = eidMap.get(h.owner);
    }

    let eloops = new Map();

    for (let e of this.edges) {
      e.v1 = eidMap.get(e.v1);
      e.v2 = eidMap.get(e.v2);
      e.h1 = eidMap.get(e.h1);
      e.h2 = eidMap.get(e.h2);
      eloops.set(e, eidMap.get(e.l));
      e.l = undefined;
    }

    for (let l of this.loops) {
      l.v = eidMap.get(l.v);
      l.e = eidMap.get(l.e);
    }

    for (let list of this.lists) {
      let loops = list._loops;
      list._loops = undefined;

      loops = loops.map(l => eidMap.get(l));

      list.l = loops[0];

      for (let i = 0; i < loops.length; i++) {
        let l1 = loops[(i - 1 + loops.length)%loops.length];
        let l2 = loops[i];
        let l3 = loops[(i + 1)%loops.length];

        l1.next = l2;
        l2.prev = l1;
        l2.next = l3;
        l3.prev = l2;
      }
    }

    for (let f of this.faces) {
      for (let i = 0; i < f.lists.length; i++) {
        f.lists[i] = eidMap.get(f.lists[i]);
      }

      for (let list of f.lists) {
        list.length = 0;

        for (let l of list) {
          l.f = f;
          l.list = list;
          this.radialLoopInsert(l.e, l);
          list.length++;
        }
      }
    }

    for (let [e, l] of eloops) {
      e.l = l;
    }

    for (let elist of this.getElists()) {
      elist.active = eidMap.get(elist.active);
      elist.highlight = eidMap.get(elist.highlight);
    }

    for (let e of this.edges) {
      if (e.curve) {
        e.curve.afterSTRUCT(e.v1, e.v2);
      } else {
        e.curve = new Clothoid(e.v1, e.v2);
      }

      e.update();
    }

    this.switchSplineType(Clothoid, ClothoidSolver);
  }
}

Mesh.STRUCT = `
mesh.Mesh {
  elists : array(mesh.ElementArray) | this.getElists();
  eidgen : IDGen;  
}
`;
nstructjs.register(Mesh);

class Stroker {
  /** callback(x, y, dx, dy, interpT, deltaT, deltaS) */
  constructor(callback, doFirst, firstX, firstY, radius, spacing) {
    this.mpos = new Vector2();

    this.lag = 1.0;

    this.last = {
      mpos1: new Vector2(),
      mpos2: new Vector2(),
      mpos3: new Vector2(),
      mpos4: new Vector4(),
      mpos5: new Vector4(),
      mpos6: new Vector4(),
      time1: util.time_ms(),
      time2: util.time_ms(),
      time3: util.time_ms(),
      v1 : 0,
      v2 : 0,
      v3 : 0,
      v4 : 0,
    };

    this.lastMpos = new Vector2();
    this.callback = callback;
    this.x = undefined;
    this.y = undefined;
    this.haveXY = false;

    this.first = true;
    this.first2 = true;

    if (firstX !== undefined) {
      //this.x = firstX;
      //this.y = firstY;
      //this.haveXY = true;
      console.log(firstX, firstY, radius, spacing);

      if (doFirst) {
        this.callback(firstX, firstY, 0, 0, 0, 0, 0);
      }

      this.onInput(firstX, firstY, radius, spacing);

    }
  }

  onInput(x, y, radius, spacing) {
    let mpos = new Vector2().loadXY(x, y);
    this.mpos.load(mpos);

    if (this.first) {
      this.lasts1 = 0;

      this.lastMpos.load(mpos);
      this.last.mpos1.load(mpos);

      this.first = false;
      return;
    }


    let dis = mpos.vectorDistance(this.last.mpos1);
    let dt = dis/(radius*2.0);

    if (dt > spacing*this.lag) {
      /*
      let v = mesh.makeVertex(mpos);
      v[2] = 0.0;

      if (this.lastV) {
        mesh.makeEdge(this.lastV, v);
        mesh.regenSolve();
      }

      mesh.ensureSolve();
      */

      let v = true;
      this.lastV = v;

      let ok = this.last.v4;
      ok = ok || (this.first2 && this.last.v3);

      if (ok) {
        let ds = spacing*(2.0*radius);

        let mesh = new Mesh();
        let v1, v2, v3, v4, v5;
        let e;

        if (!this.first2) {
          v1 = mesh.makeVertex(this.last.mpos4);
          v2 = mesh.makeVertex(this.last.mpos3);
          v3 = mesh.makeVertex(this.last.mpos2);
          v4 = mesh.makeVertex(this.last.mpos1);
          v5 = mesh.makeVertex(mpos);

          v1[2] = v2[2] = v3[2] = v4[2] = v5[2] = 0.0;

          mesh.makeEdge(v1, v2);
          e = mesh.makeEdge(v2, v3);
          mesh.makeEdge(v3, v4);
          mesh.makeEdge(v4, v5);
        } else if (this.first2) {
          this.first2 = false;

          v1 = mesh.makeVertex(this.last.mpos4);
          v2 = mesh.makeVertex(this.last.mpos3);
          v3 = mesh.makeVertex(this.last.mpos2);
          v4 = mesh.makeVertex(mpos);

          this.lasts1 = ds;

          v1[2] = v2[2] = v3[2] = v4[2] = 0.0;
          console.log("DIS", v1.vectorDistance(v2));

          e = mesh.makeEdge(v1, v3);
          mesh.makeEdge(v3, v4);
        }

        mesh.solve();

        let s = this.lasts1;
        let elen = e.length;

        if (isNaN(elen) || isNaN(ds)) {
          console.error("NaN!");
          return;
        }

        if (ds === 0.0) {
          console.error("Spacing was zero!");
          return;
        }

        if (!e) {
          debugger;
          console.error("Missing edge");
          return;
        }

        while (s < elen) {
          let p = e.evaluate(s);
          let dv = e.derivative(s);

          let t = s/elen;

          this.callback(p[0], p[1], dv[0], dv[1], t, ds / elen, ds);
          s += ds;
        }

        this.lasts1 = s - elen;
      }

      this.last.v6 = this.last.v5;
      this.last.v5 = this.last.v4;
      this.last.v4 = this.last.v3;
      this.last.v3 = this.last.v2;
      this.last.v2 = this.last.v1;
      this.last.v1 = true;

      this.last.mpos6.load(this.last.mpos5);
      this.last.mpos5.load(this.last.mpos4);
      this.last.mpos4.load(this.last.mpos3);
      this.last.mpos3.load(this.last.mpos2);
      this.last.mpos2.load(this.last.mpos1);
      this.last.mpos1.load(mpos);

      this.last.time3 = this.last.time2;
      this.last.time2 = this.last.time1;
      this.last.time1 = this.time;
    }

    this.time = util.time_ms();
    this.lastMpos.load(mpos);
    window.redraw_all();
  }
}

export { Stroker };
