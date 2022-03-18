#pragma once

#include <cmath>
#include <cstdio>
#include <algorithm>

#define SRGB_TABLE_SIZE 8192

extern float gammaToLinear[SRGB_TABLE_SIZE];
extern float linearToGamma[SRGB_TABLE_SIZE];

/* have to handle f being outside 0...1 range
   for pigment optimizer */
static float srgb_gamma_to_linear(float f) {
  float sign = f < 0.0f ? -1.0f : 1.0f;
  f *= sign;

  if (f >= 0.0f && f < 1.0f) {
    int i = (int)(f * SRGB_TABLE_SIZE);

    return gammaToLinear[i]*sign;
  } else {
    if (f < 0.04045) {
      return ((f < 0.0) ? 0.0 : f * (1.0 / 12.92))*sign;
    } else {
      return powf((f + 0.055) / 1.055, 2.4f)*sign;
    }
  }
}

static float srgb_linear_to_gamma(float f) {
  float sign = f < 0.0f ? -1.0f : 1.0f;
  f *= sign;

  //f = std::min(std::max(f, 0.0f), 0.99999f);
  if (f >= 0.0f && f < 1.0f) {
    int i = (int)(f * SRGB_TABLE_SIZE);

    return linearToGamma[i] * sign;
  } else {
    if (f < 0.0031308) {
      return (f < 0.0) ? 0.0 : f * 12.92 * sign;
    } else {
      return (1.055 * powf(f, 1.0 / 2.4) - 0.055) * sign;
    }
  }
}

static void rgb_to_linear(float c[4]) {
  c[0] = srgb_gamma_to_linear(c[0]);
  c[1] = srgb_gamma_to_linear(c[1]);
  c[2] = srgb_gamma_to_linear(c[2]);
}

static void linear_to_rgb(float c[4]) {
  c[0] = srgb_linear_to_gamma(c[0]);
  c[1] = srgb_linear_to_gamma(c[1]);
  c[2] = srgb_linear_to_gamma(c[2]);
}

template <bool noGamma = false> void rgb_to_xyz(float xyz[3], float rgb[3]) {
  float var_R = rgb[0];
  float var_G = rgb[1];
  float var_B = rgb[2];

  if constexpr (!noGamma) {
    if (var_R > 0.04045)
      var_R = powf((var_R + 0.055) / 1.055, 2.4);
    else
      var_R = var_R / 12.92;
    if (var_G > 0.04045)
      var_G = powf((var_G + 0.055) / 1.055, 2.4);
    else
      var_G = var_G / 12.92;
    if (var_B > 0.04045)
      var_B = powf((var_B + 0.055) / 1.055, 2.4);
    else
      var_B = var_B / 12.92;
  }

  /*
    on factor;
    off period;

    f1 := var_R * 0.4124 + var_G * 0.3576 + var_B * 0.1805 - X;
    f2 := var_R * 0.2126 + var_G * 0.7152 + var_B * 0.0722 - Y;
    f3 := var_R * 0.0193 + var_G * 0.1192 + var_B * 0.9505 - Z;

    f := solve({f1, f2, f3}, {var_r, var_g, var_b});
  */

  // Observer. = 2��, Illuminant = D65
  float X = var_R * 0.4124 + var_G * 0.3576 + var_B * 0.1805;
  float Y = var_R * 0.2126 + var_G * 0.7152 + var_B * 0.0722;
  float Z = var_R * 0.0193 + var_G * 0.1192 + var_B * 0.9505;

  xyz[0] = X;
  xyz[1] = Y;
  xyz[2] = Z;
}

template <bool noGamma = false> void xyz_to_rgb(float rgb[3], float xyz[3]) {
  float var_X = xyz[0]; // X from 0 to  95.047   (Observer = 2��, Illuminant = D65)
  float var_Y = xyz[1]; // Y from 0 to 100.000
  float var_Z = xyz[2]; // Z from 0 to 108.883

  float var_R = var_X * 3.240625 + var_Y * -1.53720797 + var_Z * -0.498628;
  float var_G = var_X * -0.9689307 + var_Y * 1.87575606 + var_Z * 0.04151752;
  float var_B = var_X * 0.0557101 + var_Y * -0.204021 + var_Z * 1.05699;

  if (!noGamma) {
    if (var_R > 0.003130807)
      var_R = 1.055 * (powf(var_R, 1.0 / 2.4)) - 0.055;
    else
      var_R = 12.92 * var_R;

    if (var_G > 0.003130807)
      var_G = 1.055 * (powf(var_G, 1.0 / 2.4)) - 0.055;
    else
      var_G = 12.92 * var_G;

    if (var_B > 0.003130807)
      var_B = 1.055 * (powf(var_B, 1.0 / 2.4)) - 0.055;
    else
      var_B = 12.92 * var_B;
  }

  rgb[0] = var_R;
  rgb[1] = var_G;
  rgb[2] = var_B;
}

// nanometers
static float waveLengthToFreq(float w) {
  w *= 1e-9; // to meters

  return 299792458.0 / w;
}

static float freqToWaveLength(float f) {
  f = 299792458.0 / f;
  f /= 1e-9; // to nanometers

  return f;
}

#define MIN(a, b) ((a) < (b) ? (a) : (b))
#define MAX(a, b) ((a) > (b) ? (a) : (b))
