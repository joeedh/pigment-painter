import {util, Vector2} from '../path.ux/pathux.js';

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

/*

on factor;
off period;

f1 := -(k1*s**3 - 3.0*k1*s**2 + 3.0*k1*s - k1 - 3.0*k2*s**3 + 6.0*k2*s**2 -
    3.0*k2*s + 3.0*k3*s**3 - 3.0*k3*s**2 - k4*s**3);

dv := df(f1, s);

*/
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

export function d3cubic(k1, k2, k3, k4, s) {
  return -6.0*(k1 - 3.0*k2 + 3.0*k3 - k4);
}

export function d3cubic2(k1, k2, k3, k4, s) {
  let r = d2c2rets.next();

  for (let i = 0; i < 2; i++) {
    r[i] = dcubic3(k1[i], k2[i], k3[i], k4[i], s);
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