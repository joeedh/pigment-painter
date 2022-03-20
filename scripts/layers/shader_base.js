export const ShaderLib = `

float vec4_to_float(vec4 v) {
  return length(v);
}

float vec3_to_float(vec3 v) {
  return length(v);
}

float vec2_to_float(vec2 v) {
  return length(v);
}

vec2 vec4_to_vec2(vec4 v) {
  return v.xy;
}
vec2 vec3_to_vec2(vec3 v) {
  return v.xy;
}
vec2 float_to_vec2(float f) {
  return vec2(f, f);
}

vec3 vec4_to_vec3(vec4 v) {
  return v.xyz;
}
vec3 vec2_to_vec3(vec2 v) {
  return v.xy;
}
vec3 float_to_vec3(float f) {
  return vec3(f, f, f);
}

vec4 vec3_to_vec4(vec3 v) {
  return vec4(v, 1.0);
}
vec4 vec2_to_vec4(vec2 v) {
  return vec4(v, 0.0, 1.0);
}
vec4 float_to_vec4(float f) {
  return vec4(f, f, f, f);
}

`;