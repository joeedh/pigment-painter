import {ShaderProgram} from './webgl.js';

export const LutCode = {
  pre : `
uniform sampler2D lut;
uniform vec2 lutSize;
uniform vec2 lutInvSize;
uniform float lutDimen;
uniform float lutRowSize;
uniform float lutTexelSize;
  `,
  code : `
#ifdef TRILINEAR_LUT
#define DITHER_FAC 0.002
#else
#define DITHER_FAC 0.004;
#endif

vec3 sampleLutIntern(vec3 p, float zoff) {
  p.r = min(max(p.r, 0.0), 1.0)*(1.0 - lutTexelSize);
  p.g = min(max(p.g, 0.0), 1.0)*(1.0 - lutTexelSize);
  p.b = min(max(p.b, 0.0), 1.0)*(1.0 - lutTexelSize);
  
  float x = p.r * lutDimen;
  float y = p.g * lutDimen;
  float z = p.b * lutDimen;
  
#ifndef TRILINEAR_LUT
  x = floor(x);
  y = floor(y);
#endif

  z = floor(z);

  z += zoff;
  
#ifdef TRILINEAR_LUT
  //z = min(max(z, 0.0), lutDimen - 1.0);
#endif

  float col = mod(z, lutRowSize) * lutDimen;
  float row = floor(z/lutRowSize + 0.00) * lutDimen;
  
  float u = (x + col) / (lutSize[0]-1.0);
  float v = (y + row) / (lutSize[1]-1.0);
  
  //float ff = -lutTexelSize*0.005;
  //u += ff;
  //v += ff;
  
  vec4 r = texture(lut, vec2(u, v));
  
  return vec3(r.r, r.b, r.g);
}

vec3 sampleLut(vec3 p, float zoff) {
#ifdef TRILINEAR_LUT
  vec3 a = sampleLutIntern(p, zoff);
  vec3 b = sampleLutIntern(p, zoff + 1.00001);
  
  float t = fract(p.z * (lutDimen));
  
  return mix(a, b, t);
#else
  return sampleLutIntern(p, zoff);
#endif
}

vec4 colorToPigment(vec3 rgb) {
  vec4 c = vec4(sampleLut(rgb, 0.0), 0.0);
  c[3] = 1.0 - c[0] - c[1] - c[2];
  
  float tot = c[0]+c[1]+c[2]+c[3];
  if (tot > 0.0001) {
    c *= 1.0 / tot;
  }
  
  return c;
}

vec3 pigmentToColor(vec4 pigment) {
  //about 1/255
  float d = 0.002;
  
#if 0
  pigment.r += hash(vCo, 0.2342)*DITHER_FAC;
  pigment.g += hash(vCo, 0.7342)*DITHER_FAC;
  pigment.b += hash(vCo, 1.5342)*DITHER_FAC; 
#endif

  vec3 r = sampleLut(pigment.rgb, lutDimen + 0.0001);

  return r;
}
  `
};

/* blit: uses vUv for texture lookup */
export let BlitShader = {
  vertex    : `#version 300 es
precision highp float;

uniform vec2 size;
uniform float aspect;
uniform sampler2D rgba;

in vec2 co;
in vec2 uv;

out vec2 vUv;
out vec2 vCo;

void main() {
  gl_Position = vec4(co*2.0 - 1.0, 0.0, 1.0);
  
  vUv = uv;
  vCo = co;
}
`,
  fragment  : `#version 300 es
precision highp float;

uniform vec2 size;
uniform float aspect;
uniform sampler2D rgba;

#ifdef PAINT_DIRECT
${LutCode.pre}
#endif

in vec2 vCo;
in vec2 vUv;

out vec4 fragColor;

float gamma(float c) {
  if (c < 0.0031308) {
    return (c < 0.0) ? 0.0 : c*12.92;
  } else {
    return 1.055*pow(c, 1.0/2.4) - 0.055;
  }
}

float ungamma(float c) {
  if (c < 0.04045) {
    return (c < 0.0) ? 0.0 : c*(1.0/12.92);
  } else {
    return pow((c + 0.055)/1.055, 2.4);
  }
}

vec3 gamma(vec3 p) {
  return vec3(gamma(p.x), gamma(p.y), gamma(p.z));
}


vec3 ungamma(vec3 p) {
  return vec3(ungamma(p.x), ungamma(p.y), ungamma(p.z));
}


#ifdef PAINT_DIRECT
${LutCode.code}
#endif

void main() {
  vec4 c = texture(rgba, vUv);
  
  #ifdef PAINT_DIRECT
  vec4 p = vec4(c.rgb, 1.0 - c.r - c.g - c.b);
  p /= (p.r + p.g + p.b + p.a + 0.00001);
  
  c.rgb = pigmentToColor(p);
  c.a = 1.0;
  #endif
  
  //c[0] = gamma(c[0]);
  //c[1] = gamma(c[1]);
  //c[2] = gamma(c[2]);
  
  fragColor = c;
}
`,
  uniforms  : {},
  attributes: ["co", "uv"]
}

/* blit2: uses vCo for texture lookup */
export let BlitShader2 = {
  vertex    : `#version 300 es
precision highp float;

uniform vec2 size;
uniform float aspect;
uniform sampler2D rgba;

in vec2 co;
in vec2 uv;

out vec2 vUv;
out vec2 vCo;

void main() {
  gl_Position = vec4(co*2.0 - 1.0, 0.0, 1.0);
  
  vUv = uv;
  vCo = co;
}
`,
  fragment  : `#version 300 es
precision highp float;

uniform vec2 size;
uniform float aspect;
uniform sampler2D rgba;

in vec2 vCo;
in vec2 vUv;

out vec4 fragColor;

float seed = 0.0;

float hash2(vec2 p, float seed2) {
  seed2 += seed;
  p += seed2;

  float f = fract(p.x*12323.32432 + seed2) + fract(p.y*12335.23423);
  f = f + 0.1*f*fract(p.x*p.y*21320.23432 + seed2);
  
  return fract(f + seed2) - 0.5;
}

float hash(vec2 p, float seed2)
{
  p *= 1231200.0;
  seed2 += seed;
  seed2 *= 2320034.0;
  
  p += seed2;
  
  vec3 p3  = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract(seed2 + (p3.x + p3.y) * p3.z) - 0.5;
}

float gamma(float c) {
  if (c < 0.0031308) {
    return (c < 0.0) ? 0.0 : c*12.92;
  } else {
    return 1.055*pow(c, 1.0/2.4) - 0.055;
  }
}

float ungamma(float c) {
  if (c < 0.04045) {
    return (c < 0.0) ? 0.0 : c*(1.0/12.92);
  } else {
    return pow((c + 0.055)/1.055, 2.4);
  }
}

void main() {
  vec4 c = texture(rgba, vCo);
  
  //c = vec4(hash(vUv, 0.1), hash2(vCo, 0.2), hash(vCo, 0.3), 1.0);
  
  //c[0] = gamma(c[0]);
  //c[1] = gamma(c[1]);
  //c[2] = gamma(c[2]);
  
  fragColor = c;
}
`,
  uniforms  : {},
  attributes: ["co", "uv"]
}


/* blit2: uses vCo for texture lookup */
export let UndoBlitShader = {
  vertex    : `#version 300 es
precision highp float;

uniform vec2 size;
uniform float aspect;
uniform sampler2D rgba;

in vec2 co;
in vec2 uv;

out vec2 vUv;
out vec2 vCo;

void main() {
  gl_Position = vec4(co*2.0 - 1.0, 0.0, 1.0);
  
  vUv = uv;
  vCo = co;
}
`,
  fragment  : `#version 300 es
precision highp float;

uniform vec2 size;
uniform float aspect;
uniform sampler2D rgba;

in vec2 vCo;
in vec2 vUv;

out vec4 fragColor;

uniform float seed;
uniform float id;

float hash2(vec2 p, float seed2) {
  seed2 += seed;
  p += seed2;

  float f = fract(p.x*12323.32432 + seed2) + fract(p.y*12335.23423);
  f = f + 0.1*f*fract(p.x*p.y*21320.23432 + seed2);
  
  return fract(f + seed2) - 0.5;
}

float hash(vec2 p, float seed2)
{
  p *= 1231200.0;
  seed2 += seed;
  seed2 *= 2320034.0;
  
  p += seed2;
  
  vec3 p3  = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract(seed2 + (p3.x + p3.y) * p3.z) - 0.5;
}

void main() {
  vec4 c = texture(rgba, vUv);

#if 0
  c = vec4(hash(vUv, 0.1), hash2(vCo, 0.2), hash(vCo, 0.3), 1.0);
  vec4 cid = vec4(fract(id*3.234), fract(id*5.234), fract(id*9.12312), 1.0);
  c = mix(c, cid, 0.9);
#endif

  fragColor = c;
}
`,
  uniforms  : {},
  attributes: ["co", "uv"]
}

export let PaintShader = {
  vertex    : `#version 300 es
precision highp float;

uniform vec2 size;
uniform float aspect;
uniform sampler2D rgba;
uniform vec2 invSize;
uniform vec2 uvOff;

in vec2 co;
in vec2 uv;
in float strength;
in vec2 dv;
in float radius;
in vec4 smear;
in float squish;
in float angle;
in float soft;
in float strokeT;
in float light;
in vec4 color;
in vec4 params;

out vec4 vSmear;
out vec2 vUv;
out vec2 vCo;
out float vStrength;
out vec2 vDv;
out float vRadius;
out float vAngle;
out float vSquish;
out float vSoft;
out float vStrokeT;
out float vLighting;
out vec4 vColor;
out vec4 vParams;

vec2 rot2d(vec2 p, float th) {
  float costh = cos(th);
  float sinth = sin(th);

  return vec2(
    costh*p.x + sinth*p.y,
    costh*p.y - sinth*p.x    
  );
}

void main() {
  gl_Position = vec4(co*2.0 - 1.0, 0.0, 1.0);
  
    
  vec2 uv2 = uv - 0.5;
  
  uv2 = rot2d(uv2, -angle);
  uv2.x /= (1.0 - squish*0.99);
  uv2 += 0.5;
  
  vLighting = light;
  vCo = co;
  vUv = uv2 + uvOff;
  vStrength = strength;
  vDv = normalize(dv) * invSize;
  vRadius = radius;
  vSmear = smear;
  vSoft = soft + 0.001;
  vStrokeT = strokeT;
  vColor = color;
  vParams = params;
}
`,
  fragment  : `#version 300 es
precision highp float;


uniform vec2 size;
uniform float aspect;
uniform sampler2D rgba;
uniform float pass;

uniform vec2 invSize;

uniform float seed;
uniform vec4 smearPickup;

${LutCode.pre}

uniform sampler2D brushAlpha;
uniform vec2 alphaSize;
uniform vec2 alphaInvSize;
uniform float alphaTileSize;
uniform float alphaInvTileSize;
uniform float alphaLighting;
uniform float alphaRowSize;
uniform float alphaInvRowSize;
uniform float alphaLightingMul;

in vec2 vCo;
in vec2 vUv;
in float vStrength;
in vec2 vDv;
in float vRadius;
in vec4 vSmear;
in float vAngle;
in float vSquish;
in float vSoft;
in float vStrokeT;
in float vLighting;
in vec4 vColor;
in vec4 vParams;

out vec4 fragColor;

vec2 rot2d(vec2 p, float th) {
  float costh = cos(th);
  float sinth = sin(th);

  return vec2(
    costh*p.x + sinth*p.y,
    costh*p.y - sinth*p.x    
  );
}

float hash1(float p)
{
  return fract(1.0 / (0.00001 + 0.000001*fract(p)));
}


float gamma(float c) {
  if (c < 0.0031308) {
    return (c < 0.0) ? 0.0 : c*12.92;
  } else {
    return 1.055*pow(c, 1.0/2.4) - 0.055;
  }
}

float ungamma(float c) {
  if (c < 0.04045) {
    return (c < 0.0) ? 0.0 : c*(1.0/12.92);
  } else {
    return pow((c + 0.055)/1.055, 2.4);
  }
}

vec3 gamma(vec3 p) {
  return vec3(gamma(p.x), gamma(p.y), gamma(p.z));
}


vec3 ungamma(vec3 p) {
  return vec3(ungamma(p.x), ungamma(p.y), ungamma(p.z));
}

float hash2(vec2 p, float seed2) {
  seed2 += seed;
  p += seed2;

  float f = fract(p.x*12323.32432 + seed2) + fract(p.y*12335.23423);
  f = f + 0.1*f*fract(p.x*p.y*21320.23432 + seed2);
  
  return fract(f + seed2) - 0.5;
}

float hash(vec2 p, float seed2)
{
  p *= 1231200.0;
  seed2 += seed;
  seed2 *= 2320034.0;
  
  p += seed2;
  
  vec3 p3  = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract(seed2 + (p3.x + p3.y) * p3.z) - 0.5;
}

float det(vec2 a, vec2 b) {
  return a[0]*b[1] - a[1]*b[0];
}

float saturation(vec3 c) {
  c = ungamma(c);
   
  float l = c[0]*0.5 + c[1]*0.35 + c[2]*0.15;
  
  c = abs(c - l);
  return c[0] + c[1] + c[2];
}

float saturation_linear(vec3 c) {
  float l = c[0]*0.5 + c[1]*0.35 + c[2]*0.15;
  
  c = abs(c - l);
  return c[0] + c[1] + c[2];
}

//bias weight toward the less saturation of two colors
float saturate_weight(vec3 a, vec3 a2, float w) {
  float s1 = saturation(a.rgb);
  float s2 = saturation(a2.rgb);
  float s_exp = 1.0 + 0.5*(s1 - s2);
  
  return pow(w, s_exp);
}


vec4 rgb_to_cmyk(float r, float g, float b) {
  vec4 ret;

  float C = 1.0 - r;
  float M = 1.0 - g;
  float Y = 1.0 - b;

  float var_K = 1.0;

  if (C < var_K) var_K = C;
  if (M < var_K) var_K = M;
  if (Y < var_K) var_K = Y;
  
  if (var_K == 1.0) { //Black
    C = 0.0;
    M = 0.0;
    Y = 0.0;
  } else {
    C = (C - var_K)/(1.0 - var_K);
    M = (M - var_K)/(1.0 - var_K);
    Y = (Y - var_K)/(1.0 - var_K);
  }

  float K = var_K;

  ret[0] = C;
  ret[1] = M;
  ret[2] = Y;
  ret[3] = K;

  return ret;
}

vec3 cmyk_to_rgb(float c, float m, float y, float k) {
  vec3 ret;

  if (k == 1.0) {
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

vec3 rgb_to_hsv(float r, float g, float b) {
  float computedH = 0.0;
  float computedS = 0.0;
  float computedV = 0.0;
  
  float minRGB = min(r, min(g, b));
  float maxRGB = max(r, max(g, b));

  // Black-gray-white
  if (minRGB == maxRGB) {
    computedV = minRGB;

    vec3 ret;
    ret[0] = 0.0, ret[1] = 0.0, ret[2] = computedV;
    return ret;
  }

  // Colors other than black-gray-white:
  float d = (r == minRGB) ? g - b : ((b == minRGB) ? r - g : b - r);
  float h = (r == minRGB) ? 3.0 : ((b == minRGB) ? 1.0 : 5.0);

  computedH = (60.0*(h - d/(maxRGB - minRGB)))/360.0;
  computedS = (maxRGB - minRGB)/maxRGB;
  computedV = maxRGB;

  vec3 ret;
  ret[0] = computedH, ret[1] = computedS, ret[2] = computedV;
  return ret;
}


vec3 hsv_to_rgb(float h, float s, float v) {
  float c = 0.0, m = 0.0, x = 0.0;
  vec3 ret;
  
  h *= 360.0;

  c = v*s;
  x = c*(1.0 - abs((mod(h/60.0, 2.0)) - 1.0));
  m = v - c;
  vec3 color;
  
  if (h >= 0.0 && h < 60.0) {
    color = vec3(c + m, x + m, m);
  } else if (h >= 60.0 && h < 120.0) {
    color = vec3(x + m, c + m, m);
  } else if (h >= 120.0 && h < 180.0) {
    color = vec3(m, c + m, x + m);
  } else if (h >= 180.0 && h < 240.0) {
    color = vec3(m, x + m, c + m);
  } else if (h >= 240.0 && h < 300.0) {
    color = vec3(x + m, m, c + m);
  } else if (h >= 300.0 && h < 360.0) {
    color = vec3(c + m, m, x + m);
  } else {
    color = vec3(m, m, m);
  }
  
  return color;
}

#if MIX_MODE == 0

${LutCode.code}

float clamp255(float f) {
  f = min(max(f, 0.0), 1.0);
  return floor(f*255.0)/255.0;
}

vec3 clamp2553(vec3 v) {
  return vec3(clamp255(v[0]), clamp255(v[1]), clamp255(v[2]));
}


#ifndef WITH_PAIR_LUT
//#define HAVE_SEPARABLE_MIX

#ifdef HAVE_SEPARABLE_MIX
vec4 pigmentMix(vec4 a, vec4 b, vec4 fac) {
#else
vec4 pigmentMix(vec4 a, vec4 b, float fac) {
#endif

  //fac = saturate_weight(a.rgb, b.rgb, fac);

  vec4 r;
    
  //a.rgb = clamp2553(a.rgb);
  //b.rgb = clamp2553(b.rgb);

#if 0
  float d = 0.04;
  a.r += hash(vCo, 0.3342)*d;
  a.g += hash(vCo, 0.5342)*d;
  a.b += hash(vCo, 1.4342)*d;
  
  b.r += hash(vCo, 0.9342)*d;
  b.g += hash(vCo, 0.8342)*d;
  b.b += hash(vCo, 1.7342)*d;
#endif
  
  fac = max(fac, 0.01);
  
  vec4 p1 = colorToPigment(a.rgb);
  vec4 p2 = colorToPigment(b.rgb);
  
  vec3 err1 = a.rgb - pigmentToColor(p1);
  vec3 err2 = b.rgb - pigmentToColor(p2);
  
  vec4 p3 = p1 + (p2 - p1) * fac;
  float tot = p3[0] + p3[1] + p3[2] + p3[3];
  
  if (tot > 0.0001) {
    p3 *= 1.0 / tot;
  }
  
  float fac2;
#ifdef HAVE_SEPARABLE_MIX
  fac2 = (fac[0]+fac[1]+fac[2]+fac[3])*0.25;
#else
  fac2 = fac;
#endif

  vec3 err = err1 + (err2 - err1) * fac2;
  
  r.rgb = pigmentToColor(p3);
  r.rgb += err;
  
#if 0
  r.r += hash(vCo, 0.2342)*0.5*DITHER_FAC;
  r.g += hash(vCo, 0.7342)*0.5*DITHER_FAC;
  r.b += hash(vCo, 1.5342)*0.5*DITHER_FAC;
#endif

  r.rgb = clamp(r.rgb, 0.0, 1.0);
  
  r.a = 1.0; //max(a.a, b.a);
  
  return r;
}

#ifdef HAVE_SEPARABLE_MIX
vec4 pigmentMix(vec4 a, vec4 b, float fac) {
  return pigmentMix(a, b, vec4(fac, fac, fac, fac));
}
#endif

#else
vec4 pigmentMix(vec4 a, vec4 b, float fac) {
  float alpha = max(a.a, b.a);

  a.rgb = ungamma(a.rgb);
  b.rgb = ungamma(b.rgb);

#if 0
  float d = 0.0045;
  a.r += hash(vCo, 0.3342)*d;
  a.g += hash(vCo, 0.5342)*d;
  a.b += hash(vCo, 1.4342)*d;
  
  b.r += hash(vCo, 0.9342)*d;
  b.g += hash(vCo, 0.8342)*d;
  b.b += hash(vCo, 1.7342)*d;
#endif

  vec3 a2 = sampleLut(a.rgb*0.9999, 0.0);
  vec3 b2 = sampleLut(b.rgb*0.9999, 0.0);
  
  //return vec4(sampleLut(b2, lutDimen + 0.00001), 1.0);
  
  vec3 da = a.rgb - sampleLut(a2, lutDimen + 0.00001);
  vec3 db = b.rgb - sampleLut(b2, lutDimen + 0.00001);
   
  vec3 delta = da + (db - da) * fac;
  vec3 c2 = a2 + (b2 - a2) * fac;
    
  c2 = sampleLut(c2, lutDimen + 0.00001);
  c2 += delta;
  
  c2 = gamma(c2);
  return vec4(c2, 1.0); //, alpha)
}
#endif
#elif MIX_MODE == 1

vec4 pigmentMix(vec4 a, vec4 b, float fac)
{
  return mix(a, b, fac);
} 

#elif MIX_MODE == 2

float calcsat(vec3 hsv, vec3 hsvc, float w) {  
  float w2 = 1.0 - pow(hsv[1]*hsv[2], 2.0); // + vParams[2]);
  
  float expfac = 1.25;// + vParams[0];
  float expfac2 = 0.3;// + vParams[1];
  
  float sfac = w2*(1.0 - w);
  sfac = pow(sfac, expfac);
  
  float sat2 = pow(hsvc[1], (1.0 - sfac)*(1.0-expfac2) + expfac2);
  
  return sat2*w;
}

vec4 pigmentMix(vec4 a, vec4 b, float fac)
{
  a.rgb = ungamma(a.rgb);
  b.rgb = ungamma(b.rgb);
  
  float sat1 = saturation_linear(a.rgb);
  float sat2 = saturation_linear(b.rgb);

  vec3 hsva = rgb_to_hsv(a.r, a.g, a.b);
  vec3 hsvb = rgb_to_hsv(b.r, b.g, b.b);

  a = rgb_to_cmyk(a.r, a.g, a.b);
  b = rgb_to_cmyk(b.r, b.g, b.b);
  
  vec4 c = mix(a, b, fac);
  
  float satc = saturation_linear(c.rgb);
  
  c.rgb = cmyk_to_rgb(c.r, c.g, c.b, c.a);
  vec3 hsvc = rgb_to_hsv(c.r, c.g, c.b);
  
  float newsat = calcsat(hsva, hsvc, 1.0 - fac);
  newsat += calcsat(hsvb, hsvc, fac);
  
  hsvc[1] = min(max(newsat, 0.0), 1.0);
  c.rgb = hsv_to_rgb(hsvc[0], hsvc[1], hsvc[2]);
  
  c.rgb = gamma(c.rgb);
  c.a = 1.0;
   
  return c;
} 
#elif MIX_MODE == 3
vec4 pigmentMix(vec4 a, vec4 b, float fac)
{
  a.rgb = ungamma(a.rgb);
  b.rgb = ungamma(b.rgb);
  
  a.rgb = rgb_to_hsv(a.r, a.g, a.b);
  b.rgb = rgb_to_hsv(b.r, b.g, b.b);
  
  vec4 c = mix(a, b, fac);
  
  c.rgb = hsv_to_rgb(c.r, c.g, c.b);
  c.rgb = gamma(c.rgb);
  c.a = 1.0;
  
  //c[0] = vParams[0];
  //c[1] = vParams[1];
  //c[2] = vParams[2];
  
  return c;
}
#endif

#ifdef HAVE_BRUSH_ALPHA
vec4 get_brush_mask(vec2 finalUv) {
  //float u = finalUv[0] * alphaSize[0] * alphaInvTileSize;
  //float v = finalUv[1] * alphaSize[1] * alphaInvTileSize; 
  
  float f = hash1(vStrokeT);
  
  float fx = floor(hash1(vStrokeT)*alphaSize[0]*alphaInvTileSize)*alphaTileSize;
  float fy = floor(hash1(vStrokeT+23.432)*alphaSize[1]*alphaInvTileSize)*alphaTileSize;
  
  fx *= alphaInvSize[0];
  fy *= alphaInvSize[1];
  
  //fx *= alphaRowSize;
  //fy *= alphaRowSize;
  
  fx += finalUv.x*alphaInvRowSize;
  fy += finalUv.y*alphaInvRowSize;
  
  return texture(brushAlpha, vec2(fx, fy));
}
#endif

void main() {
  float f = pass * 0.2;
  vec4 c;
  c.a = 1.0;

#ifdef CONTINUOUS
  vec2 finalUv = fract(vUv);
#else 
  vec2 finalUv = vUv;
#endif

  vec4 a = texture(rgba, vCo);
  c = vec4(finalUv, 1.0, 1.0);
  //c.r = fract(f*2.23423 + 0.324);
  //c.g = fract(f*5.23423 + 0.724);
  //c.b = fract(f*7.23423 + 0.124);
  //c.rgb *= 0.3;
  
  //c = texture(lut, vCo);
  vec2 cent = finalUv - 0.5;
  
#if 0
  c = texture(lut, vCo);
  fragColor = c;
  return;
#endif

  float w = 1.0 - length(cent)*2.0;
  w = max(w, 0.0);
  
#if TOOL != 3
  if (w <= 0.0) {
    fragColor = a;
    return;
  }
#endif
  
  w = w < vSoft ? w/vSoft : 1.0;
  w *= w*w*w;
  
  float fac = vStrength*w;

#if TOOL == 3 //test tool
  w = 1.0;
#elif TOOL == 0 || TOOL == 2
#ifdef HAVE_BRUSH_ALPHA
  {
    vec4 mask = get_brush_mask(finalUv);
  
    c = pigmentMix(a, vColor, fac*mask[3]);
    
    if (mask[3] > 0.001) {
      vec3 n = mask.rgb*2.0 - 1.0;
      n.xy = rot2d(n.xy, -vAngle);
      
      float light = dot(n, vec3(1.0, 1.0, 0.2));
      //light = pow(abs(light), 4.0)*vLighting*0.04;
      light = (abs(light)-1.25*alphaLightingMul)*vLighting*0.4;
      
      vec4 lc = vec4(light, light, light, 1.0);  
      //lc.rgb *= c.rgb;
      
      c.rgb += lc.rgb;
      //c = pigmentMix(c, lc, fac);
    }
  }
#else
  c = pigmentMix(a, vColor, fac);
#endif
#elif TOOL == 1
  vec2 dv = vDv*4.0;
  
#ifdef HAVE_SEPARABLE_MIX
  float dd = 0.8;
  //vec4 fac2 = vec4(fac, pow(fac, 1.5), pow(fac, 2.0), pow(fac, 2.5));
  vec4 fac2 = vec4(fac*dd*dd, fac*dd, fac*dd*dd*dd, fac);
#else
  float fac2 = fac; 
#endif

  float det1 = -det(vDv*size, (finalUv-0.5));
  dv += vec2(vDv.y, -vDv.x)*det1*12.0;
  
  dv.x += hash(vCo, 0.23423)*vSmear[0]*2.0;
  dv.y += hash(vCo, 1.23432)*vSmear[0]*2.0;
  
  dv *= vRadius; //*vSmear[2];
  
  vec4 a2 = texture(rgba, vCo - dv);

#ifdef SMEAR_PICKUP
#ifdef HAVE_SEPARABLE_MIX
  float ww = vSmear[1];
  //vec4 w2 = vec4(ww, pow(ww, 1.5), pow(ww, 2.0), pow(ww, 2.5));
  vec4 w2 = vec4(ww*dd*dd, ww*dd, ww*dd*dd*dd, ww);
#else
  float w2 = vSmear[1];
#endif

#endif

#ifdef HAVE_BRUSH_ALPHA
    vec4 mask = get_brush_mask(finalUv);
    
    {
      float wfac = mask[2];
      float f = alphaLighting;

      fac2 = pow(fac2, 1.0 - pow(wfac, 1.0 - f*0.5)*f + 0.05);
      
#ifdef SMEAR_PICKUP
      //w2 = pow(w2, 1.0 - pow(wfac, vParams[1]) + vParams[0]);
      w2 = pow(w2, 1.0 - pow(wfac, 1.0 - f*0.5)*f + 0.05);
#endif
    }
#endif

#ifdef SMEAR_PICKUP
  a2 = pigmentMix(a2, smearPickup, w2);  
#endif

  c = pigmentMix(a, a2, fac2);
  
#ifdef HAVE_BRUSH_ALPHA
  {
    if (mask[3] > 0.001) {
      vec3 n = mask.rgb*2.0 - 1.0;
      n.xy = rot2d(n.xy, -vAngle);
      
      float light = dot(n, vec3(0.675, 0.675, 0.135));
      light = (abs(light)-0.75*alphaLightingMul)*vLighting*0.2;
      
      vec4 lc = vec4(light, light, light, 1.0);  
      //lc.rgb *= c.rgb;
      
      c.rgb += lc.rgb;
    } else {
      c = a;
    }
  }
#endif
#endif

  fragColor = c;
}
`,
  uniforms  : {},
  defines   : {MIX_MODE: 0},
  attributes: ["co", "uv", "strength", "dv", "radius",
               "smear", "squish", "angle", "soft", "strokeT",
               "light", "color", "params"]
}


export const ShaderDef = {
  BlitShader,
  PaintShader,
  BlitShader2,
  UndoBlitShader
};

export const Shaders = {};

export function loadShaders(gl) {
  for (let k in ShaderDef) {
    let def = ShaderDef[k];

    Shaders[k] = ShaderProgram.fromDef(gl, def);
  }
}

window._Shaders = Shaders;
