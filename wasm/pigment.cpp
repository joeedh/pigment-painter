#include "curve.h"
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>

#include "cie10.h"
#include "cie65.h"
#include "color.h"

#if 0
#define PRINTF(...) printf(__VA_ARGS__)
#else
#define PRINTF(fmt, ...)
#endif

using namespace color::cie65;

float g(float x, float mu, float o1, float o2) {
  if (x < mu) {
    return expf((-0.5 * (x - mu) * (x - mu)) / o1 * o1);
  } else {
    return expf((-0.5 * (x - mu) * (x - mu)) / o2 * o2);
  }
}

#if 0
// xyz cie 2 degree chromiticty functions
float xhat(float wlen) {
  return 1.056 * g(wlen, 599.8, 37.9, 31.0) + 0.362 * g(wlen, 442.0, 16.0, 26.7) -
         0.065 * g(wlen, 501.1, 20.4, 26.2);
}

float yhat(float wlen) {
  return 0.821 * g(wlen, 568.8, 46.9, 40.5) + 0.286 * g(wlen, 530.9, 16.3, 31.1);
}

float zhat(float wlen) {
  return 1.217 * g(wlen, 437.0, 11.8, 36.0) + 0.681 * g(wlen, 459.0, 26.0, 13.0);
}
#else
using color::cie10::xhat;
using color::cie10::yhat;
using color::cie10::zhat;
#endif

struct Pigment {
  Pigment(int size, float _k1, float _k2, float _colorScale, float wmin, float wmax)
      : length(size), k1(_k1), k2(_k2), colorScale(_colorScale) {
    K = new float[size * 2];
    S = new float[size * 2];

    range[0] = wmin;
    range[1] = wmax;
  }

  ~Pigment() {
    delete[] K;
    delete[] S;
  }

  float range[2]; // wavelength range
  int length;
  float *K, *S;
  float k1, k2;
  float colorScale;

  float evalTable(int k_or_s, float s) {
    float *ps = k_or_s ? S : K;
    float ki = (s - range[0]) / (range[1] - range[0]);

    PRINTF("sr: %.4f %.2f %.2f %.2f %d\n", ki, s, range[0], range[1], length);

    ki *= length * 0.9999f;

    float t = ki - floorf(ki);

    int i1 = (int)ki;
    int i2 = i1 + 1;

    return ps[i1];

    if (i1 >= length - 1) {
      return ps[length - 1];
    } else {
      float a = ps[i1];
      float b = ps[i2];

      return a + (b - a) * t;
    }
  }
};

extern "C" Pigment *
makePigmentData(int size, float k1, float k2, float colorScale, float wmin, float wmax) {
  return new Pigment(size, k1, k2, colorScale, wmin, wmax);
}

extern "C" void updatePigment(Pigment *p, float k1, float k2, float colorScale) {
  PRINTF("updatePigment: %p: %.3f %.3f %.3f\n", p, k1, k2, colorScale);

  p->colorScale = colorScale;
  p->k1 = k1;
  p->k2 = k2;
}

extern "C" void setColorScale(Pigment *p, float colorScale) {
  p->colorScale = colorScale;
}

extern "C" void setK1K2(Pigment *p, float k1, float k2) {
  p->k1 = k1;
  p->k2 = k2;
}

extern "C" void freePigmentData(Pigment *p) {
  delete p;
}

extern "C" float *getPigmentK(Pigment *p) {
  return p->K;
}

extern "C" float *getPigmentS(Pigment *p) {
  return p->S;
}

extern "C" float evalTable(Pigment *p, int k_or_s, float s) {
  return p->evalTable(k_or_s, s);
}

extern "C" float evalR(Pigment *ps[4], float ws[4], float f) {
  float tot = 0.0, K = 0.0, S = 0.0;

  for (int i = 0; i < 4; i++) {
    float w = ws[i];

    float k = evalTable(ps[i], 0, f);
    float s = evalTable(ps[i], 1, f);

    PRINTF("ks: %.2f %.2f %.2f\n", k, s, w);

    K += k * w;
    S += s * w;

    tot += w;
  }

  if (tot == 0.0f) {
    return 0.0f;
  }

  K /= tot;
  S /= tot;

  PRINTF("S,K %.4f, %.4f\n", S, K);

  const float limit = 0.00001;
  if (S < limit && S > -limit) {
    return 0.0;
  }

  float ratio = K / S;
  return 1.0f + ratio - sqrtf(fabsf(ratio * ratio + 2.0f * ratio));
}

template <bool linear_lut, int steps = 16> void toRGBIntern(float *ret, Pigment *ps[4], float *ws) {
  PRINTF("a %p %p %p %p\n", ps[0], ps[1], ps[2], ps[3]);

  float w1 = ps[0]->range[0];
  float w2 = ps[0]->range[1];
  PRINTF("b %p %p\n", ret, ws);
  float k1 = ps[0]->k1;
  float k2 = ps[1]->k2;
  PRINTF("c %.2f %.2f %.2f %.2f\n", ws[0], ws[1], ws[2], ws[3]);
  float f = w1, df = (w2 - w1) / steps;
  PRINTF("d k1,k2 %.3f %.3f\n", k1, k2);
  float sumx = 0, sumy = 0, sumz = 0;
  float sumn = 0.0;
  PRINTF("e\n");
  for (int i = 0; i < steps; i++, f += df) {
    float freq = waveLengthToFreq(f);
    PRINTF("f\n");

    float cie[3];
    getCie65(cie, freq);
    PRINTF("g\n");

    float illum = cie[0];
    float r = evalR(ps, ws, f);
    PRINTF("h %.2f %.2f %.2f\n", r, illum, f);

    // modified reflectance
    r = ((1.0 - k1) * (1.0 - k2) * r) / (1.0 - k2 * r);
    PRINTF("h2 %.2f\n", r);

    float s = r * illum;

    sumn += yhat(f) * illum * df;

    sumx += xhat(f) * s * df;
    PRINTF("i %.2f %.2f %.2f\n", xhat(f), s, df);
    sumy += yhat(f) * s * df;
    PRINTF("j\n");
    sumz += zhat(f) * s * df;
    PRINTF("k %.2f: %.2f %.2f %.2f\n", f, xhat(f), yhat(f), zhat(f));
  }

  float mul = sumn != 0.0f ? 1.0f / sumn : 0.0f;

  PRINTF("l %.2f: %.2f %.2f %.2f %.2f\n", mul, sumx, sumy, sumz, sumn);

  ret[0] = sumx * mul;
  ret[1] = sumy * mul;
  ret[2] = sumz * mul;

  PRINTF("m %.2f: %.2f %.2f %.2f\n", mul, ret[0], ret[1], ret[2]);
  float tmp1[3] = {ret[0], ret[1], ret[2]};
  xyz_to_rgb<true>(ret, tmp1);
  PRINTF("n\n");

  ret[3] = 0.0;

  PRINTF("o %p\n", ps[0]);
  const float colorScale = ps[0]->colorScale;
  PRINTF("p\n");

  PRINTF("colorScale: %p %.3f\n", ps[0], ps[0]->colorScale);

  PRINTF("qpre: %.2f %.2f %.2f\n", ret[0], ret[1], ret[2]);

#if 1
  ret[0] *= colorScale;
  ret[1] *= colorScale;
  ret[2] *= colorScale;
#else
  ret[0] = powf(fabs(ret[0]), colorScale);
  ret[1] = powf(fabs(ret[1]), colorScale);
  ret[2] = powf(fabs(ret[2]), colorScale);
#endif

  PRINTF("qpost: %.2f: %.2f %.2f %.2f\n", colorScale, ret[0], ret[1], ret[2]);

  if (!linear_lut) {
    PRINTF("t");
    linear_to_rgb(ret);
  }

  PRINTF("q2 %.2f: %.2f %.2f %.2f\n", colorScale, ret[0], ret[1], ret[2]);

  PRINTF("u\n");
}

extern "C" void toRGBInternLinear(float ret[3], Pigment *ps[4], float ws[4]) {
  PRINTF("S1\n");
  toRGBIntern<true>(ret, ps, ws);
}

extern "C" void toRGBInternSRGB(float ret[3], Pigment *ps[4], float ws[4]) {
  PRINTF("S2\n");
  toRGBIntern<false>(ret, ps, ws);
}
