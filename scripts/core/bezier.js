import {util, Vector2, Vector3, Vector4} from '../path.ux/pathux.js';

export function icubic(k1, k2, k3, k4, s) {
  return (-(((3*s - 4)*k3 - k4*s)*s**2 + (s**2 - 2*s + 2)*
    (s - 2)*k1 - (3*s**2 - 8*s + 6)*k2*s)*s)/4;
}

export function cubic(k1, k2, k3, k4, s) {
  return -(k1*s**3 - 3.0*k1*s**2 + 3.0*k1*s - k1 - 3.0*k2*s**3 + 6.0*k2*s**2 -
    3.0*k2*s + 3.0*k3*s**3 - 3.0*k3*s**2 - k4*s**3);
}

let c2rets = util.cachering.fromConstructor(Vector2, 64);

export function cubic2(k1, k2, k3, k4, s) {
  let r = c2rets.next();

  for (let i = 0; i < 2; i++) {
    r[i] = cubic(k1[i], k2[i], k3[i], k4[i], s);
  }

  return r;
}

let c3rets = util.cachering.fromConstructor(Vector3, 64);

export function cubic3(k1, k2, k3, k4, s) {
  let r = c3rets.next();

  for (let i = 0; i < 3; i++) {
    r[i] = cubic(k1[i], k2[i], k3[i], k4[i], s);
  }

  return r;
}

/*

on factor;
off period;

f  := -(k1*s**3 - 3.0*k1*s**2 + 3.0*k1*s - k1 - 3.0*k2*s**3 + 6.0*k2*s**2 -
    3.0*k2*s + 3.0*k3*s**3 - 3.0*k3*s**2 - k4*s**3);

on fort;

if1 := int(f, s);
dv := df(f, s);

off fort;

fx := sub(k1=ax, k2=bx, k3=cx, k4=dx, f);
fy := sub(k1=ay, k2=by, k3=cy, k4=dy, f);
fz := sub(k1=az, k2=bz, k3=cz, k4=dz, f);

f1 := sub(s=s1, fx) - x1;
f2 := sub(s=s1, fy) - y1;
f3 := sub(s=s1, fz) - z1;
f4 := sub(s=s2, fx) - x2;
f5 := sub(s=s2, fy) - y2;
f6 := sub(s=s2, fz) - z2;

s1 := 1.0/3.0;
s2 := 2.0/3.0;

ff := solve({f1, f2, f3, f4, f5, f6}, {bx, by, bz, cx, cy, cz});

on fort;
part(ff, 1, 1);
part(ff, 1, 2);
part(ff, 1, 3);
part(ff, 1, 4);
part(ff, 1, 5);
part(ff, 1, 6);
off fort;

*/

export function fitCubic3(a, b_out, c_out, d, p1, p2) {
  let ax = a[0], ay = a[1], az = a[2], dx = d[0], dy = d[1], dz = d[2];
  let x1 = p1[0], y1 = p1[1], z1 = p1[2];
  let x2 = p2[0], y2 = p2[1], z2 = p2[2];

  b_out[0] = (9*(2*x1 - x2) + 2*dx - 5*ax)/6;
  b_out[1] = (9*(2*y1 - y2) + 2*dy - 5*ay)/6;
  b_out[2] = (9*(2*z1 - z2) + 2*dz - 5*az)/6;
  c_out[0] = (-(9*(x1 - 2*x2) + 5*dx) + 2*ax)/6;
  c_out[1] = (-(9*(y1 - 2*y2) + 5*dy) + 2*ay)/6;
  c_out[2] = (-(9*(z1 - 2*z2) + 5*dz) + 2*az)/6;

}

let dist_temps = util.cachering.fromConstructor(Vector3, 64);

export function distToCubic3(p, a, b, c, d) {
  let mindis = 1e17;

  let steps = 5;
  let s = 0, ds = 1.0/(steps - 1);

  let t1 = dist_temps.next();
  let t2 = dist_temps.next();

  let sign = 0;

  for (let i = 0; i < steps; i++, s += ds) {
    let p2 = cubic3(a, b, c, d, s);
    let d2 = dcubic3(a, b, c, d, s);

    mindis = Math.min(mindis, p2.vectorDistanceSqr(p));

    t1.load(p2).sub(p);
    let sign2 = Math.sign(t1.dot(d2));

    if (i === 0 || sign === sign2) {
      sign = sign2;
      continue;
    }

    let start = s - ds;
    let end = s;

    for (let j = 0; j < 5; j++) {
      let mid = (start + end)*0.5;

      p2 = cubic3(a, b, c, d, mid);
      d2 = dcubic3(a, b, c, d, mid);

      mindis = Math.min(mindis, p2.vectorDistanceSqr(p));

      t1.load(p2).sub(p);
      let sign2 = Math.sign(t1.dot(d2));

      if (sign2 !== sign) {
        start = mid;
      } else {
        end = mid;
      }
    }
  }

  return mindis;
}

export function dcubic(k1, k2, k3, k4, s) {
  //return 3.0*((2.0*(k2 - k3)*(s - 1.0) - (k3 - k4)*s)*s - (k1 - k2)*(s - 1.0)**2);
  return -3*(((3*s - 2)*k3 - k4*s)*s - (3*s - 1)*(s - 1)*k2 + (s - 1)**2*k1);
  //return -3.0*((s - 1.0)**2*k1 - k4*s**2 + (3.0*s - 2.0)*k3*s - (3.0*s - 1.0)*(s - 1.0)*k2);
}


let dc2rets = util.cachering.fromConstructor(Vector2, 64);

export function dcubic2(k1, k2, k3, k4, s) {
  let r = dc2rets.next();

  for (let i = 0; i < 2; i++) {
    r[i] = dcubic(k1[i], k2[i], k3[i], k4[i], s);
  }

  return r;
}

let dc3rets = util.cachering.fromConstructor(Vector3, 64);

export function dcubic3(k1, k2, k3, k4, s) {
  let r = dc3rets.next();

  for (let i = 0; i < 3; i++) {
    r[i] = dcubic(k1[i], k2[i], k3[i], k4[i], s);
  }

  return r;
}

export function d2cubic(k1, k2, k3, k4, s) {
  return -6.0*(k1*s - k1 - 3.0*k2*s + 2.0*k2 + 3.0*k3*s - k3 - k4*s);
}


let d2c2rets = util.cachering.fromConstructor(Vector2, 64);

export function d2cubic2(k1, k2, k3, k4, s) {
  let r = d2c2rets.next();

  for (let i = 0; i < 2; i++) {
    r[i] = dcubic2(k1[i], k2[i], k3[i], k4[i], s);
  }

  return r;
}

export function kcubic2(k1, k2, k3, k4, s) {
  let dv1 = dcubic2(k1, k2, k3, k4, s);
  let dv2 = d2cubic2(k1, k2, k3, k4, s);

  return (dv1[0]*dv2[1] - dv1[10]*dv2[0])/Math.pow(dv1.dot(dv1), 3.0/2.0);
}

export function d3cubic(k1, k2, k3, k4, s) {
  return -6.0*(k1 - 3.0*k2 + 3.0*k3 - k4);
}

export function d3cubic2(k1, k2, k3, k4, s) {
  let r = d2c2rets.next();

  for (let i = 0; i < 2; i++) {
    r[i] = d3cubic(k1[i], k2[i], k3[i], k4[i], s);
  }

  return r;
}

export function cubic2len(k1, k2, k3, k4) {
  let steps = 16.0;
  let s = 0.0, ds = 1.0/steps;
  let f = 0.0;

  for (let i = 0; i < steps; i++, s += ds) {
    f += dcubic2(k1, k2, k3, k4, s).vectorLength()*ds;
  }

  return f;
}

//export function arcifyCubic(

/*
on factor;

procedure bez(a, b);
  a + (b - a)*s;

lin := bez(k1, k2);
quad := bez(lin, sub(k2=k3, k1=k2, lin));
cubic := bez(quad, sub(k3=k4, k2=k3, k1=k2, quad));

df(cubic, s);

dx1 := x1-cx;
dy1 := y1-cy;
dx2 := x2-cx;
dy2 := y2-cy;

f1 := (x1-cx)**2 + (y1-cy)**2 - r;
f2 := (x2-cx)**2 + (y2-cy)**2 - r;
f3 := tany1 / tanx1 - (-dx1/dy1);

ff := solve({f1, f2, f3}, {cx, cy, r});

on fort;
part(ff, 1, 1);
part(ff, 1, 2);
part(ff, 1, 3);
off fort;


**/