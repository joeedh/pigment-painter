import {
  Vector2, Vector3, Vector4,
  Matrix4
} from '../path.ux/scripts/util/vectormath.js';
import * as util from '../path.ux/scripts/util/util.js';

export const ColorSpaces = {
  XYZ: 0,
  LAB: 1,
  RGB: 2
};

//very crappy palette generator (it excludes purple, purple is evil!)

let rgb_to_hsv_rets = new util.cachering(() => [0, 0, 0], 512);

export function rgb_to_hsv(r, g, b, do_linear = true) {
  if (do_linear) {
    let rgb = rgb_to_linear(r, g, b);
    r = rgb[0];
    g = rgb[1];
    b = rgb[2];
  }

  let computedH = 0;
  let computedS = 0;
  let computedV = 0;

  if (r == null || g == null || b == null ||
    isNaN(r) || isNaN(g) || isNaN(b)) {
    throw new Error('Please enter numeric RGB values!');
    return;
  }
  /*
  if (r<0 || g<0 || b<0 || r>1.0 || g>1.0 || b>1.0) {
   throw new Error('RGB values must be in the range 0 to 1.0');
   return;
  }//*/

  let minRGB = Math.min(r, Math.min(g, b));
  let maxRGB = Math.max(r, Math.max(g, b));

  // Black-gray-white
  if (minRGB === maxRGB) {
    computedV = minRGB;

    let ret = rgb_to_hsv_rets.next();
    ret[0] = 0, ret[1] = 0, ret[2] = computedV;
    return ret;
  }

  // Colors other than black-gray-white:
  let d = (r === minRGB) ? g - b : ((b === minRGB) ? r - g : b - r);
  let h = (r === minRGB) ? 3 : ((b === minRGB) ? 1 : 5);

  computedH = (60*(h - d/(maxRGB - minRGB)))/360.0;
  computedS = (maxRGB - minRGB)/maxRGB;
  computedV = maxRGB;

  let ret = rgb_to_hsv_rets.next();
  ret[0] = computedH, ret[1] = computedS, ret[2] = computedV;
  return ret;
}

window.rgb_to_hsv = rgb_to_hsv;

let hsv_to_rgb_rets = new util.cachering(() => [0, 0, 0], 512);

export function hsv_to_rgb(h, s, v, do_linear = true) {
  let c = 0, m = 0, x = 0;
  let ret = hsv_to_rgb_rets.next();

  ret[0] = ret[1] = ret[2] = 0.0;
  h *= 360.0;

  c = v*s;
  x = c*(1.0 - Math.abs(((h/60.0)%2) - 1.0));
  m = v - c;
  let color;

  function RgbF_Create(r, g, b) {
    ret[0] = r;
    ret[1] = g;
    ret[2] = b;

    return ret;
  }

  if (h >= 0.0 && h < 60.0) {
    color = RgbF_Create(c + m, x + m, m);
  } else if (h >= 60.0 && h < 120.0) {
    color = RgbF_Create(x + m, c + m, m);
  } else if (h >= 120.0 && h < 180.0) {
    color = RgbF_Create(m, c + m, x + m);
  } else if (h >= 180.0 && h < 240.0) {
    color = RgbF_Create(m, x + m, c + m);
  } else if (h >= 240.0 && h < 300.0) {
    color = RgbF_Create(x + m, m, c + m);
  } else if (h >= 300.0 && h < 360.0) {
    color = RgbF_Create(c + m, m, x + m);
  } else {
    color = RgbF_Create(m, m, m);
  }

  if (do_linear) {
    return linear_to_rgb(color[0], color[1], color[2]);
  }

  return color;
}

let rgb_to_xyz_rets = util.cachering.fromConstructor(Vector3, 512);
let xyz_to_rgb_rets = util.cachering.fromConstructor(Vector3, 512);
let xyz_to_lab_rets = util.cachering.fromConstructor(Vector3, 512);
let lab_to_xyz_rets = util.cachering.fromConstructor(Vector3, 512);
let lab_to_labch_rets = util.cachering.fromConstructor(Vector3, 512);
let labch_to_lab_rets = util.cachering.fromConstructor(Vector3, 512);
let rgb_to_lab_rets = util.cachering.fromConstructor(Vector3, 512);
let lab_to_rgb_rets = util.cachering.fromConstructor(Vector3, 512);
let rgb_to_cmyk_rets = util.cachering.fromConstructor(Vector4, 512);
let cmyk_to_rgb_rets = util.cachering.fromConstructor(Vector3, 512);
let rgb_to_linear_rets = util.cachering.fromConstructor(Vector3, 512);
let linear_to_rgb_rets = util.cachering.fromConstructor(Vector3, 512);
let p65rgb_to_xyz_rets = util.cachering.fromConstructor(Vector3, 512);
let xyz_to_p65rgb_rets = util.cachering.fromConstructor(Vector3, 512);

export function srgb_gamma_to_linear(c) {
  if (c < 0.04045) {
    return (c < 0.0) ? 0.0 : c*(1.0/12.92);
  } else {
    return Math.pow((c + 0.055)/1.055, 2.4)
  }
}

export function srgb_linear_to_gamma(c) {
  if (c < 0.0031308) {
    return (c < 0.0) ? 0.0 : c*12.92;
  } else {
    return 1.055*Math.pow(c, 1.0/2.4) - 0.055;
  }
}

let gamma2linear = new Array(8192);
let linear2gamma = new Array(8192);
let needTables = true;

export function makeGammaTables() {
  let steps = gamma2linear.length, s = 0, ds = 1.0/(steps - 1);

  for (let i = 0; i < steps; i++, s += ds) {
    gamma2linear[i] = srgb_gamma_to_linear(s);
    linear2gamma[i] = srgb_linear_to_gamma(s);
  }
}

function checkTables() {
  if (needTables) {
    needTables = false;
    makeGammaTables();
  }
}

export function rgb_to_linear(r, g, b) {
  let ret = rgb_to_linear_rets.next();

  checkTables();

  ret[0] = r;
  ret[1] = g;
  ret[2] = b;

  for (let i = 0; i < ret.length; i++) {
    if (0) {
      let c = ret[i];

      c = Math.min(Math.max(c, 0.0), 0.99999);
      c = ~~(c*8191);

      ret[i] = gamma2linear[c];
    } else {
      ret[i] = srgb_gamma_to_linear(ret[i]);
    }
  }

  return ret;
}

export function linear_to_rgb(r, g, b) {
  let ret = rgb_to_linear_rets.next();

  checkTables();

  ret[0] = r;
  ret[1] = g;
  ret[2] = b;

  for (let i = 0; i < ret.length; i++) {
    if (0) {

      let c = ret[i];

      c = Math.min(Math.max(c, 0.0), 0.99999);
      c = ~~(c*8191);

      ret[i] = linear2gamma[c];
    } else {
      ret[i] = srgb_linear_to_gamma(ret[i]);
    }
  }

  return ret;
}

export function xyz_to_intensity(x, y, z) {
  return xyz_to_lab(x, y, z)[0];
  let f = 0.5;
  x = x**f;
  y = y**f;
  z = z**f;

  return (x + y + z)/3.0;
}

export function xyz_to_saturation(x, y, z) {
  let avg = (x + y + z)/3.0;

  let dr = Math.abs(x - avg);
  let dg = Math.abs(y - avg);
  let db = Math.abs(z - avg);

  return (dr + dg + db)/3.0;
}

//sRGBMatrix.transpose();

export function rgb_to_xyz(r, g, b) {
  let var_R = r;
  let var_G = g;
  let var_B = b;

  if (var_R > 0.04045) var_R = Math.pow((var_R + 0.055)/1.055, 2.4);
  else var_R = var_R/12.92;
  if (var_G > 0.04045) var_G = Math.pow((var_G + 0.055)/1.055, 2.4);
  else var_G = var_G/12.92;
  if (var_B > 0.04045) var_B = Math.pow((var_B + 0.055)/1.055, 2.4);
  else var_B = var_B/12.92;

  /*
    on factor;
    off period;

    f1 := var_R * 0.4124 + var_G * 0.3576 + var_B * 0.1805 - X;
    f2 := var_R * 0.2126 + var_G * 0.7152 + var_B * 0.0722 - Y;
    f3 := var_R * 0.0193 + var_G * 0.1192 + var_B * 0.9505 - Z;

    f := solve({f1, f2, f3}, {var_r, var_g, var_b});
  */

  //Observer. = 2°, Illuminant = D65
  let X = var_R*0.4124 + var_G*0.3576 + var_B*0.1805;
  let Y = var_R*0.2126 + var_G*0.7152 + var_B*0.0722;
  let Z = var_R*0.0193 + var_G*0.1192 + var_B*0.9505;

  let ret = rgb_to_xyz_rets.next();
  ret[0] = X;
  ret[1] = Y;
  ret[2] = Z;

  return ret;
}

const mulx = 1.0/95.047;
const muly = 0.01
const mulz = 1.0/108.08883;

export const sRGBMatrix = new Matrix4();
let m = sRGBMatrix.$matrix;

m.m11 = 3.2406;
m.m21 = -1.5372;
m.m31 = -0.4986;

m.m12 = -0.9689;
m.m22 = 1.8758;
m.m32 = 0.0415;

m.m13 = 0.0557;
m.m23 = -0.2040;
m.m33 = 1.0570;

m.m44 = 0.0;

/*uses srgb gamma function*/
export function p65rgb_to_xyz(r, g, b) {
  r = srgb_gamma_to_linear(r);
  g = srgb_gamma_to_linear(g);
  b = srgb_gamma_to_linear(b);

  let x = r*0.4866 + g*0.2657 + b*0.1982;
  let y = r*0.2290 + g*0.6917 + b*0.0793;
  let z = r*-0.0000 + g*0.0451 + b*1.0439;

  let ret = p65rgb_to_xyz_rets.next();
  ret[0] = x;
  ret[1] = y;
  ret[2] = z;

  return ret;
}

export function xyz_to_p65rgb(x, y, z) {
  let r = x*2.4935 + y*-0.9314 + z*-0.4027;
  let g = x*-0.8295 + y*1.7627 + z*0.0236;
  let b = x*0.0358 + y*-0.0762 + z*0.9569;

  r = srgb_linear_to_gamma(r);
  g = srgb_linear_to_gamma(g);
  b = srgb_linear_to_gamma(b);

  let ret = xyz_to_p65rgb_rets.next();
  ret[0] = r;
  ret[1] = g;
  ret[2] = b;

  return ret;
}

export function xyz_to_rgb(X, Y, Z, noGamma=false) {

  let var_X = X;       //X from 0 to  95.047      (Observer = 2°, Illuminant = D65)
  let var_Y = Y;      //Y from 0 to 100.000
  let var_Z = Z;       //Z from 0 to 108.883

  let var_R = var_X*3.240625 + var_Y* -1.53720797 + var_Z* -0.498628
  let var_G = var_X* -0.9689307 + var_Y*1.87575606 + var_Z*0.04151752
  let var_B = var_X*0.0557101 + var_Y* -0.204021 + var_Z*1.05699

  if (!noGamma) {
    if (var_R > 0.003130807)
      var_R = 1.055*(Math.pow(var_R, 1.0/2.4)) - 0.055;
    else
      var_R = 12.92*var_R;

    if (var_G > 0.003130807)
      var_G = 1.055*(Math.pow(var_G, 1.0/2.4)) - 0.055;
    else
      var_G = 12.92*var_G;

    if (var_B > 0.003130807)
      var_B = 1.055*(Math.pow(var_B, 1.0/2.4)) - 0.055;
    else
      var_B = 12.92*var_B;
  }

  let ret = xyz_to_rgb_rets.next();

  ret[0] = var_R;
  ret[1] = var_G;
  ret[2] = var_B;

  return ret;
}


export function lab_to_xyz(L, a, b) {
  L *= 100.0;
  a *= 100.0;
  b *= 100.0;

  let var_Y = (L + 16)/116;
  let var_X = a/500 + var_Y;
  let var_Z = var_Y - b/200;

  let X3 = var_X*var_X*var_X;
  let Y3 = var_Y*var_Y*var_Y;
  let Z3 = var_Z*var_Z*var_Z;

  if (Y3 > 0.008856) var_Y = Y3
  else var_Y = (var_Y - 16/116)/7.787
  if (X3 > 0.008856) var_X = X3
  else var_X = (var_X - 16/116)/7.787
  if (Z3 > 0.008856) var_Z = Z3
  else var_Z = (var_Z - 16/116)/7.787

  let X = 0.95047*var_X;     //ref_X =  95.047     Observer= 2°, Illuminant= D65
  let Y = var_Y;     //ref_Y = 100.000
  let Z = 1.08883*var_Z;     //ref_Z = 108.883

  let ret = lab_to_xyz_rets.next();

  ret[0] = X;
  ret[1] = Y;
  ret[2] = Z;

  return ret;
}

export function xyz_to_lab(X, Y, Z) {
  let var_X = X/0.95047          //ref_X =  95.047   Observer= 2°, Illuminant= D65
  let var_Y = Y//100.000         //ref_Y = 100.000
  let var_Z = Z/1.08883         //ref_Z = 108.883

  if (var_X > 0.008856) var_X = Math.cbrt(var_X);
  else var_X = (7.787*var_X) + (16/116)
  if (var_Y > 0.008856) var_Y = Math.cbrt(var_Y);
  else var_Y = (7.787*var_Y) + (16/116)
  if (var_Z > 0.008856) var_Z = Math.cbrt(var_Z);
  else var_Z = (7.787*var_Z) + (16/116)

  let ret = xyz_to_lab_rets.next();

  let L = (1.16*var_Y) - .016
  let a = 5.00*(var_X - var_Y)
  let b = 2.00*(var_Y - var_Z)

  ret[0] = L;
  ret[1] = a;
  ret[2] = b;

  return ret;
}

export function xyz_colordis(c1, c2) {
  let dx = Math.abs(c1[0] - c2[0]);
  let dy = Math.abs(c1[1] - c2[1]);
  let dz = Math.abs(c1[2] - c2[2]);

  let f = Math.sqrt(dx*dx + dy*dy + dz*dz)/(3**0.5);
  //let f = (dx+dy+dz)/3.0;

  return f;
}

export function lab_to_labch(L, a, b) {
  L *= 100.0;
  a *= 100.0;
  b *= 100.0;

  let var_H = Math.atan2(b, a)  //Quadrant by signs

  if (var_H > 0) var_H = (var_H/Math.PI)*180
  else var_H = 360 - (Math.abs(var_H)/Math.PI)*180

  //L = L;
  let C = Math.sqrt(a*a + b*b)
  let H = var_H;

  let ret = lab_to_labch_rets.next();

  ret[0] = L*0.01;
  ret[1] = C*0.01;
  ret[2] = H*0.01;

  return ret;
  //var L = L
  //var C = sqrt( CIEa ** 2 + CIEb ** 2 )
  //var H = var_H
}

export function labch_to_lab(L, c, h) {
  let ret = labch_to_lab_rets.next();

  L *= 100.0;
  c *= 100.0;
  h *= 100.0;

  h = (h/180)*Math.PI;

  ret[0] = L;
  ret[1] = Math.cos(h)*c;
  ret[2] = Math.sin(h)*c;

  return ret;
}

export function rgb_to_lab(r, g, b) {
  let xyz = rgb_to_xyz(r, g, b);
  //return xyz;

  return xyz_to_lab(xyz[0], xyz[1], xyz[2]);
}

export function lab_to_rgb(l, a, b) {
  //return xyz_to_rgb(l, a, b);

  let xyz = lab_to_xyz(l, a, b);
  return xyz_to_rgb(xyz[0], xyz[1], xyz[2]);
}

export function lab_to_intensity(l, a, b) {
  return l;
}

export function lab_to_saturation(l, a, b) {
  let labch = lab_to_labch(l, a, b);
  return labch[1];
}

export function rgb_to_labch(r, g, b) {
  let lab = rgb_to_lab(r, g, b);
  //return xyz;

  return lab_to_labch(lab[0], lab[1], lab[2]);
}

export function cmyk_to_rgb(c, m, y, k) {
  let ret = cmyk_to_rgb_rets.next();

  if (k === 1.0) {
    ret.zero();
    return ret;
  }

  c = c - c*k + k;
  m = m - m*k + k;
  y = y - y*k + k;

  ret[0] = 1.0 - c;
  ret[1] = 1.0 - m;
  ret[2] = 1.0 - y;

  return ret;
}

export function rgb_to_cmyk(r, g, b) {
  //CMYK and CMY values from 0 to 1
  let ret = rgb_to_cmyk_rets.next();

  let C = 1.0 - r;
  let M = 1.0 - g;
  let Y = 1.0 - b;

  let var_K = 1

  if (C < var_K) var_K = C
  if (M < var_K) var_K = M
  if (Y < var_K) var_K = Y
  if (var_K === 1) { //Black
    C = 0
    M = 0
    Y = 0
  } else {
    C = (C - var_K)/(1 - var_K)
    M = (M - var_K)/(1 - var_K)
    Y = (Y - var_K)/(1 - var_K)
  }

  let K = var_K

  ret[0] = C;
  ret[1] = M;
  ret[2] = Y;
  ret[3] = K;

  return ret;
}

export function labch_to_rgb(l, c, h) {
  let labch = labch_to_lab(l, c, h);

  return lab_to_rgb(labch[0], labch[1], labch[2]);
}

export function test_lab_xyz() {
  util.seed(0);

  for (let i = 0; i < 5; i++) {
    //var rgb = [0.9, 0.1, 0.2];
    let rgb = [util.random(), util.random(), util.random()];

    let lab = rgb_to_lab(rgb[0], rgb[1], rgb[2]);

    console.log(rgb);
    //console.log(xyz);
    console.log(lab);
    //console.log(xyz_to_rgb(xyz[0], xyz[1], xyz[2]));

    rgb = lab_to_rgb(lab[0], lab[1], lab[2]);
    console.log(rgb);

    console.log("\n")
  }
}


let twentyfive7 = Math.pow(25, 7.0);

function safe_sqrt(n) {
  return n > 0 ? Math.sqrt(n) : 0;
}

export function lab_saturation(l, a, b) {
  let ch = lab_to_labch(l, a, b);

  return ch[1];
}

export function lab_colordis(c1, c2) {
  if (1) {
    let dl = Math.abs(c1[0] - c2[0]);
    let da = Math.abs(c1[1] - c2[1]);
    let db = Math.abs(c1[2] - c2[2]);

    return Math.sqrt(dl**2 + da**2 + db**2)/(3**0.5);
    //return (dl+da+db);
  }

  let pow = Math.pow, cos = Math.cos, sin = Math.sin, atan2 = Math.atan2;
  let abs = Math.abs, exp = Math.exp, sqrt = safe_sqrt;

  //from wikipedia:
  //
  //https://en.wikipedia.org/wiki/Color_difference#CIEDE2000
  let l1 = c1, l2 = c2;

  c1 = lab_to_labch(c1[0], c1[1], c1[2]);
  c2 = lab_to_labch(c2[0], c2[1], c2[2]);

  c1.mulScalar(100.0);
  c2.mulScalar(100.0);

  let kL = 1.0, kC = 1.0, kH = 1.0;

  let dL = c1[0] - c2[0];
  let L_ = (c1[0] + c2[0])*0.5;
  let C_ = (c1[1] + c2[1])*0.5;
  let C_7 = pow(C_, 7.0);

  let da1 = l1[1] + 0.5*l1[1]*(1.0 - sqrt(C_7/(C_7 + twentyfive7)));
  let da2 = l2[1] + 0.5*l2[1]*(1.0 - sqrt(C_7/(C_7 + twentyfive7)));
  let dC1 = sqrt(c1[1]*c1[1] + c1[2]*c1[2]);
  let dC2 = sqrt(c2[1]*c2[1] + c2[2]*c2[2]);
  let dC_ = (dC1 + dC2)*0.5;
  let h1deg = (atan2(l1[1], l1[0])/Math.PI + 1.0)*180;
  let h2deg = (atan2(l2[1], l2[0])/Math.PI + 1.0)*180;
  let dC = dC2 - dC1;

  let dhdeg;
  let hdif = abs(h1deg, h2deg);
  if (hdif < 180) {
    dhdeg = h2deg - h1deg;
  } else if (hdif > 180 && h1deg < h2deg) {
    dhdeg = h2deg - h1deg + 360;
  } else {
    dhdeg = h2deg - h1deg - 360;
  }

  let dH = 2*sqrt(dC1*dC2)*sin(Math.PI*(dhdeg*0.5)/180);
  let H_;

  if (hdif > 180) {
    H_ = ((h1deg + h2deg + 360)*0.5);
  } else {
    H_ = (h1deg + h2deg)*0.5;
  }

  if (dC1 === 0 || dC2 === 0) {
    H_ *= (h1deg + h2deg);
  }

  let T = 1.0 - 0.17*cos(Math.PI*(H_ - 30)/180);
  T += 0.24*cos(Math.PI*(2*H_)/180);
  T += 0.32*cos(Math.PI*(3*H_ + 6)/180);
  T += -0.20*cos(Math.PI*(4*H_ - 63)/180);

  let SL = 1 + (0.015*(L_ - 50.0)*(L_ - 50.0))/(sqrt(20 + (L_ - 50)*(L_ - 50)));
  let SC = 1 + 0.045*C_;
  let SH = 1 + 0.015*C_*T;
  let RT = -2*sqrt((C_7/(C_7 + twentyfive7)));
  RT *= sin(Math.PI*(60*exp(-(H_ - 275)/25))/180);

  let a = (dL/(kL*SL));
  let b = (dC/(kC*SC));
  let c = (dH/(kH*SH));
  let d = RT*(dC/(kC*SC))*(dH/(kH*SH));

  let dE00 = sqrt(a*a + b*b + c*c + d);
  return dE00/360.0;
}


export function rgb_colordis(c1, c2) {
  let w1 = 1, w2 = 0.8, w3 = 0.6;
  w1 = w2 = w3 = 1.0;

  let totw = 1.0/(w1 + w2 + w3);

  let dr = Math.abs(c1[0] - c2[0])*w1*totw;
  let dg = Math.abs(c1[1] - c2[1])*w2*totw;
  let db = Math.abs(c1[2] - c2[2])*w3*totw;

  return dr + dg + db;
}

let _closest_color2_tmp = [0, 0, 0];
let closest_color2_rets = new util.cachering(function () {
  return [0, 0, 0];
}, 256);

let _cwc = [0, 0, 0];
/*
  on factor;
  off period;

  f1 := w1*r1 + w2*r2 + w3*r3 = cr;
  f2 := w1*g1 + w2*g2 + w3*g3 = cg;
  f3 := w1*b1 + w2*b2 + w3*b3 = cb;
  f := solve({f1, f2, f3}, {w1, w2, w3});

  part(f, 1, 1, 2);
  part(f, 1, 2, 2);

*/

let _cc_tmp1 = new Array();
let _cc_tmp2 = new Array();
_cwc = [0, 0, 0];
/*
  on factor;
  off period;

  f1 := w1*r1 + w2*r2 + w3*r3 = cr;
  f2 := w1*g1 + w2*g2 + w3*g3 = cg;
  f3 := w1*b1 + w2*b2 + w3*b3 = cb;
  f := solve({f1, f2, f3}, {w1, w2, w3});

  part(f, 1, 1, 2);
  part(f, 1, 2, 2);

*/

let barycentric_rets = new util.cachering(function () {
  return [0, 0, 0];
}, 32);

export function barycentric(c, c1, c2, c3) {
  let r1 = c1[0], g1 = c1[1], b1 = c1[2];
  let r2 = c2[0], g2 = c2[1], b2 = c2[2];
  let r3 = c3[0], g3 = c3[1], b3 = c3[2];
  let cr = c[0], cg = c[1], cb = c[2];

  let w1 = ((cg*r3 - cr*g3)*b2 - (g2*r3 - g3*r2)*cb - (cg*r2 - cr*g2)*b3)/(0.00001 + (g1*
    r3 - g3*r1)*b2 - (g2*r3 - g3*r2)*b1 - (g1*r2 - g2*r1)*b3);
  let w2 = (-((cg*r3 - cr*g3)*b1 - (g1*r3 - g3*r1)*cb) + (cg*r1 - cr*g1)*b3)/(0.00001 + (
    g1*r3 - g3*r1)*b2 - (g2*r3 - g3*r2)*b1 - (g1*r2 - g2*r1)*b3);
  let w3 = ((cg*r2 - cr*g2)*b1 - (g1*r2 - g2*r1)*cb - (cg*r1 - cr*g1)*b2)/(0.00001 + (g1*
    r3 - g3*r1)*b2 - (g2*r3 - g3*r2)*b1 - (g1*r2 - g2*r1)*b3);

  let ret = barycentric_rets.next();

  ret[0] = w1;
  ret[1] = w2;
  ret[2] = w3;

  return ret;
}

export function rgb_to_intensity(r, g, b) {
  //const w1 = 0.8, s2 = 1.0, w3 = 0.6;
  const w1 = 0.4026, w2 = 0.405, w3 = 0.2022;
  return (r*w1 + g*w2 + b*w3)/(w1 + w2 + w3);
}

let rgb_to_rgb_rets = util.cachering.fromConstructor(Vector3, 512);
let rgb_to_rgb = function (r, g, b) {
  let c = rgb_to_rgb_rets.next();

  c[0] = r;
  c[1] = g;
  c[2] = b;

  return c;
};


export function rgb_to_saturation(r, g, b) {
  let w1 = 1, w2 = 0.8, w3 = 0.7;
  let totw = 1.0/(w1 + w2 + w3);

  r *= w1*totw;
  g *= w2*totw;
  b *= w3*totw;

  let avg = (r + g + b)/3.0;

  let dr = Math.abs(r - avg);
  let dg = Math.abs(g - avg);
  let db = Math.abs(b - avg);

  return (dr + dg + db)/3.0;
}
