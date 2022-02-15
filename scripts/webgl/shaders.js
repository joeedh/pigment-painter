import {ShaderProgram} from './webgl.js';

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

void main() {
  vec4 c = texture(rgba, vUv);
  
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

in vec2 co;
in vec2 uv;
in float strength;
in vec2 dv;
in float radius;
in vec4 smear;
in float squish;
in float angle;
in float soft;

out vec4 vSmear;
out vec2 vUv;
out vec2 vCo;
out float vStrength;
out vec2 vDv;
out float vRadius;
out float vAngle;
out float vSquish;
out float vSoft;

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
  
  vCo = co;
  vUv = uv2;
  vStrength = strength;
  vDv = normalize(dv) * invSize;
  vRadius = radius;
  vSmear = smear;
  vSoft = soft + 0.001;
}
`,
  fragment  : `#version 300 es
precision highp float;

uniform vec2 size;
uniform float aspect;
uniform sampler2D rgba;
uniform vec4 color;
uniform float pass;

uniform vec2 invSize;

uniform sampler2D lut;
uniform vec2 lutSize;
uniform vec2 lutInvSize;
uniform float lutDimen;
uniform float lutRowSize;
uniform float lutTexelSize;
uniform float seed;
uniform vec4 smearPickup;

in vec2 vCo;
in vec2 vUv;
in float vStrength;
in vec2 vDv;
in float vRadius;
in vec4 vSmear;
in float vAngle;
in float vSquish;
in float vSoft;

out vec4 fragColor;

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

vec3 sampleLut(vec3 p, float zoff) {
  p.r = min(max(p.r, 0.0), 1.0)*(1.0 - lutTexelSize);
  p.g = min(max(p.g, 0.0), 1.0)*(1.0 - lutTexelSize);
  p.b = min(max(p.b, 0.0), 1.0)*(1.0 - lutTexelSize);
  
  float x = p.r * lutDimen;
  float y = p.g * lutDimen;
  float z = p.b * lutDimen;
  
  x = floor(x + 0.00);
  y = floor(y + 0.00);
  z = floor(z + 0.00);

  z += zoff;
  
  float col = mod(z, lutRowSize) * lutDimen;
  float row = floor(z/lutRowSize + 0.00) * lutDimen;
  
  float u = (x + col) / lutSize[0];
  float v = (y + row) / lutSize[0];
  
  //float ff = -lutTexelSize*0.005;
  //u += ff;
  //v += ff;
  
  vec4 r = texture(lut, vec2(u, v));
  
  return vec3(r.r, r.b, r.g);
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
  
  pigment.r += hash(vCo, 0.2342)*d;
  pigment.g += hash(vCo, 0.7342)*d;
  pigment.b += hash(vCo, 1.5342)*d; 

  vec3 r = sampleLut(pigment.rgb, lutDimen + 0.0001);

  return r;
}

float clamp255(float f) {
  f = min(max(f, 0.0), 1.0);
  return floor(f*255.0)/255.0;
}

vec3 clamp2553(vec3 v) {
  return vec3(clamp255(v[0]), clamp255(v[1]), clamp255(v[2]));
}

float det(vec2 a, vec2 b) {
  return a[0]*b[1] - a[1]*b[0];
}

vec4 pigmentMix(vec4 a, vec4 b, float fac) {
  vec4 r;
  
  //a.rgb = clamp2553(a.rgb);
  //b.rgb = clamp2553(b.rgb);

#if 0
  float d = 0.01;
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
  
  //return vec4(pigmentToColor(p2), 1.0);
  
  vec3 err1 = a.rgb - pigmentToColor(p1);
  vec3 err2 = b.rgb - pigmentToColor(p2);
  
  vec4 p3 = mix(p1, p2, fac);
  float tot = p3[0] + p3[1] + p3[2] + p3[3];
  
  if (tot > 0.0001) {
    p3 *= 1.0 / tot;
  }
  
  vec3 err = mix(err1, err2, fac);
  
  r.rgb = pigmentToColor(p3);
  r.rgb += err;
  
#if 1
  r.r += hash(vCo, 0.2342)*0.002;
  r.g += hash(vCo, 0.7342)*0.002;
  r.b += hash(vCo, 1.5342)*0.002; //about 1/255
#endif

  r.rgb = clamp(r.rgb, 0.0, 1.0);
  
  r.a = 1.0; //max(a.a, b.a);
  
  return r;
}

void main() {
  float f = pass * 0.2;
  vec4 c;
  c.a = 1.0;
  
  vec4 a = texture(rgba, vCo);
  c = vec4(vUv, 1.0, 1.0);
  //c.r = fract(f*2.23423 + 0.324);
  //c.g = fract(f*5.23423 + 0.724);
  //c.b = fract(f*7.23423 + 0.124);
  //c.rgb *= 0.3;
  
  //c = texture(lut, vCo);
  vec2 cent = vUv - 0.5;
  
#if 0
  c = texture(lut, vCo);
  fragColor = c;
  return;
#endif

  float w = 1.0 - length(cent)*2.0;
  if (w <= 0.0) {
    fragColor = a;
    return;
  }
  
  w = w < vSoft ? w/vSoft : 1.0;
  w *= w*w*w;
  
  float fac = vStrength*w;

#if TOOL == 0 || TOOL == 2
  c = pigmentMix(a, color, fac);
#elif TOOL == 1
  vec2 dv = vDv*4.0;
  
  float det1 = -det(vDv*size, (vUv-0.5));
  dv += vec2(vDv.y, -vDv.x)*det1*12.0;
  
  dv.x += hash(vCo, 0.23423)*vSmear[0]*2.0;
  dv.y += hash(vCo, 1.23432)*vSmear[0]*2.0;
  
  dv *= vRadius; //*vSmear[2];
  
  vec4 a2 = texture(rgba, vCo - dv);

#ifdef SMEAR_PICKUP
  float w2 = vSmear[1];
  
  a2 = pigmentMix(a2, smearPickup, w2);  
#endif

  c = pigmentMix(a, a2, fac);
  
#endif

  fragColor = c;
}
`,
  uniforms  : {},
  attributes: ["co", "uv", "strength", "dv", "radius", "smear", "squish", "angle", "soft"]
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
