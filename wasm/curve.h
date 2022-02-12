#include <vector>

namespace curve {
template <int AXES, typename SplineFloat = float> class FloatVec {
public:
  FloatVec(SplineFloat *src) {
    for (int i = 0; i < AXES; i++) {
      m_data[i] = src[i];
    }
  }

  FloatVec(const FloatVec &src) {
    for (int i = 0; i < AXES; i++) {
      m_data[i] = src.m_data[i];
    }
  }

  FloatVec() {
  }

  FloatVec(SplineFloat f) {
    for (int i = 0; i < AXES; i++) {
      m_data[i] = f;
    }
  }

  FloatVec &zero() {
    for (int i = 0; i < AXES; i++) {
      m_data[i] = 0.0;
    }

    return *this;
  }

  FloatVec &negate() {
    for (int i = 0; i < AXES; i++) {
      m_data[i] = -m_data[i];
    }

    return *this;
  }

  SplineFloat dot(const FloatVec b) {
    SplineFloat ret = 0.0;

    for (int i = 0; i < AXES; i++) {
      ret += m_data[i] * b.m_data[i];
    }

    return ret;
  }

  FloatVec &normalize() {
    SplineFloat len = dot(*this);

    if (len < 0.000001) {
      return;
    }

    len = 1.0 / len;

    for (int i = 0; i < AXES; i++) {
      m_data[i] *= len;
    }

    return *this;
  }

  SplineFloat normalizedDot(const FloatVec &b) {
    FloatVec temp = *this;

    return temp.normalize().dot(b);
  }

  FloatVec &operator=(const FloatVec &a) {
    for (int i = 0; i < AXES; i++) {
      m_data[i] = a.m_data[i];
    }

    return *this;
  }

  FloatVec &operator*=(const SplineFloat f) {
    for (int i = 0; i < AXES; i++) {
      m_data[i] *= f;
    }

    return *this;
  }
  FloatVec &operator/=(const SplineFloat f) {
    for (int i = 0; i < AXES; i++) {
      m_data[i] /= f;
    }

    return *this;
  }
  FloatVec &operator+=(const SplineFloat f) {
    for (int i = 0; i < AXES; i++) {
      m_data[i] += f;
    }

    return *this;
  }
  FloatVec &operator-=(const SplineFloat f) {
    for (int i = 0; i < AXES; i++) {
      m_data[i] -= f;
    }

    return *this;
  }

  FloatVec &operator-=(const FloatVec &a) {
    for (int i = 0; i < AXES; i++) {
      m_data[i] -= a.m_data[i];
    }

    return *this;
  }
  FloatVec &operator+=(const FloatVec &a) {
    for (int i = 0; i < AXES; i++) {
      m_data[i] += a.m_data[i];
    }

    return *this;
  }
  FloatVec &operator*=(const FloatVec &a) {
    for (int i = 0; i < AXES; i++) {
      m_data[i] *= a.m_data[i];
    }

    return *this;
  }
  FloatVec &operator/=(const FloatVec &a) {
    for (int i = 0; i < AXES; i++) {
      m_data[i] /= a.m_data[i];
    }

    return *this;
  }

  FloatVec &operator=(const SplineFloat *a) {
    for (int i = 0; i < AXES; i++) {
      m_data[i] = a[i];
    }

    return *this;
  }

  SplineFloat &operator[](int idx) {
    return m_data[idx];
  }

  FloatVec operator*(SplineFloat f) {
    FloatVec v2;

    for (int i = 0; i < AXES; i++) {
      v2[i] = m_data[i] * f;
    }

    return v2;
  }

  FloatVec operator*(FloatVec &b) {
    FloatVec v2;

    for (int i = 0; i < AXES; i++) {
      v2[i] = m_data[i] * b.m_data[i];
    }

    return v2;
  }

  FloatVec operator/(SplineFloat f) {
    FloatVec v2;

    for (int i = 0; i < AXES; i++) {
      v2[i] = m_data[i] / f;
    }

    return v2;
  }

  FloatVec operator/(FloatVec &b) {
    FloatVec v2;

    for (int i = 0; i < AXES; i++) {
      v2[i] = m_data[i] / b.m_data[i];
    }

    return v2;
  }

  FloatVec operator+(SplineFloat f) {
    FloatVec v2;

    for (int i = 0; i < AXES; i++) {
      v2[i] = m_data[i] + f;
    }

    return v2;
  }

  FloatVec operator+(FloatVec &b) {
    FloatVec v2;

    for (int i = 0; i < AXES; i++) {
      v2[i] = m_data[i] + b.m_data[i];
    }

    return v2;
  }

  FloatVec operator-(SplineFloat f) {
    FloatVec v2;

    for (int i = 0; i < AXES; i++) {
      v2[i] = m_data[i] - f;
    }

    return v2;
  }

  FloatVec operator-(FloatVec &b) {
    FloatVec v2;

    for (int i = 0; i < AXES; i++) {
      v2[i] = m_data[i] - b.m_data[i];
    }

    return v2;
  }

  SplineFloat *data() {
    return m_data;
  }

private:
  SplineFloat m_data[AXES];
};

template <int AXES, typename SplineFloat = float>
FloatVec<AXES, SplineFloat> operator+(float f, FloatVec<AXES, SplineFloat> v) {
  return v + f;
}
template <int AXES, typename SplineFloat = float>
FloatVec<AXES, SplineFloat> operator-(float f, FloatVec<AXES, SplineFloat> v) {
  return v.negate() + f;
}
template <int AXES, typename SplineFloat = float>
FloatVec<AXES, SplineFloat> operator*(float f, FloatVec<AXES, SplineFloat> v) {
  return v * f;
}
template <int AXES, typename SplineFloat = float>
FloatVec<AXES, SplineFloat> operator/(float f, FloatVec<AXES, SplineFloat> v) {
  FloatVec<AXES, SplineFloat> tmp(f);

  return tmp / v;
}

using float3 = FloatVec<3, float>;
using float4 = FloatVec<4, float>;
using float2 = FloatVec<2, float>;

enum SplineFlag { HANDLE_LINEAR = 1 << 0 };

template <int AXES, typename SplineFloat = float> class Spline {
  using Vec = FloatVec<AXES, SplineFloat>;

  struct SplineSegment;

  struct SplinePoint {
    Vec co;
    Vec no;
    int totsegment;
    int _segments[2];
    int index, id;
    SplineFlag flag;

    SplinePoint(Spline<AXES, SplineFloat> *spline) : _spline(spline) {
    }

    SplineSegment &otherSegment(const SplineSegment s) {
      if (s == operator[](0)) {
        return operator[](1);
      } else {
        return operator[](0);
      }
    }

    bool operator==(const SplinePoint &b) {
      return &b == this;
    }

    SplinePoint(const SplinePoint &b) {
      co = b.co;
      no = b.no;
      flag = b.flag;
      totsegment = b.totsegment;
      _segments[0] = b._segments[0];
      _segments[1] = b._segments[1];
      _spline = b._spline;
    }

    SplineSegment &operator[](int idx) {
      return _spline->segments[_segments[idx]];
    }

  private:
    Spline<AXES, SplineFloat> *_spline;
  };

  class SplineSegment {
  public:
    int index;
    int id;

    SplineSegment(Spline<AXES, SplineFloat> *spline, int v1, int v2, int h1, int h2)
        : _spline(spline), id(-1), _v1(v1), _v2(v2), _h1(h1), _h2(h2) {
    }

    SplinePoint &otherVertex(const SplinePoint &b) {
      if (b == v1()) {
        return v2();
      } else {
        return v1();
      }
    }

    SplineSegment(const SplineSegment &b) {
      _v1 = b._v1;
      _v2 = b._v2;
      _h1 = b._h1;
      _h2 = b._h2;
      _spline = b._spline;
      id = b.id;
      index = b.index;
    }

    bool operator==(const SplineSegment &b) {
      return &b == this;
    }

    SplineSegment &prev() {
      if (v1().totsegments == 2) {
        return v1().otherSegment(*this);
      }

      return *this;
    }

    SplineSegment &next() {
      if (v2().totsegments == 2) {
        return v2().otherSegment(*this);
      }

      return *this;
    }

    SplinePoint &v1() {
      return _spline->points[_v1];
    }

    SplinePoint &v2() {
      return _spline->points[_v2];
    }

    SplinePoint &h1() {
      return _spline->points[_h1];
    }

    SplinePoint &h2() {
      return _spline->points[_h2];
    }

  private:
    int _v1, _v2;
    int _h1, _h2;
    Spline<AXES, SplineFloat> *_spline;
  };

public:
  Spline() {
  }

  int addPoint(Vec p[3]) {
    SplinePoint sp(this);

    sp.co = p;
    sp.no.zero();
    sp.id = _idgen++;

    int last = points.size() - 1;

    points.push_back(sp);

    int ret = points.size() - 1;

    if (last >= 0) {
      SplineSegment s(this, last, ret, makeHandle(), makeHandle());
      segments.push_back(s);
    }

    return ret;
  }

  void initHandles() {
    for (auto &s : segments) {
      SplineSegment &prev = s.prev();
      SplineSegment &next = s.next();
    }
  }

  int makeHandle() {
    SplinePoint h(this);

    h.id = _idgen++;
    handles.push_back(h);

    return handles.size();
  }

private:
  std::vector<SplinePoint> points;
  std::vector<SplinePoint> handles;
  std::vector<SplineSegment> segments;
  int _idgen = 1;
};
} // namespace curve
