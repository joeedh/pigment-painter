//#define THREADS

#include <functional>

#ifdef THREADS
#include <pthread.h>

#if 0
// Foreground thread and main entry point
int main(int argc, char *argv[]) {
    int         fg_val = 54;
    int         bg_val = 42;
    pthread_t   bg_thread;

    // Create the background thread
    if (pthread_create(&bg_thread, NULL, bg_func, &bg_val)) {
        perror("Thread create failed");
        return 1;
    }
    // Calculate on the foreground thread
    fg_val = fibonacci(fg_val);
    // Wait for background thread to finish
    if (pthread_join(bg_thread, NULL)) {
        perror("Thread join failed");
        return 2;
    }
    // Show the result from background and foreground threads
    printf("Fib(42) is %d, Fib(6 * 9) is %d\n", bg_val, fg_val);

    return 0;
}
#endif

class ThreadPool {
public:
    ThreadPool(int n) {
    }

    template <class T>
    void parallel_for_t(int blocksize, int start, int end, std::function<void(int, T)> threadfunc, T userdata) {
        for (int i=start; i<end; i++) {
            threadfunc(i, userdata);
        }
    }

    void parallel_for(int blocksize, int start, int end, std::function<void(int)> threadfunc) {
        for (int i=start; i<end; i++) {
            threadfunc(i);
        }
    }
private:
};

#else

class ThreadPool {
public:
    ThreadPool(int n) {
    }

    template <class T>
    void parallel_for_t(int blocksize, int start, int end, std::function<void(int, T)> threadfunc, T userdata) {
        for (int i=start; i<end; i++) {
            threadfunc(i, userdata);
        }
    }

    void parallel_for(int blocksize, int start, int end, std::function<void(int)> threadfunc) {
        for (int i=start; i<end; i++) {
            threadfunc(i);
        }
    }
private:
};

#endif

ThreadPool threadPool(5);

#include <cstdio>
#include <cmath>
#include <cstring>

#include <vector>

class FastRand {
public:
  FastRand() {
  }

  float random() {
    i = (i*32234 + 123432) % 65535;

    return (float)i / 65535.0f;
  }
private:
  int i = 0;
};

FastRand ditherRand;

struct OffsetType {
    float off[5]; //dx, dy, w, normalizedx, normalizedy
};

using OffsetList = std::vector<OffsetType>;
std::vector<OffsetList*> offsetLists;

OffsetList &getSearchOffsets(int n) {
    if (offsetLists.size() > n && offsetLists[n]) {
        return *offsetLists[n];
    }

    printf("allocating search offsts of size %d\n", n);

    while (offsetLists.size() <= n) {
        offsetLists.push_back(nullptr);
    }

    OffsetList *list = offsetLists[n] = new OffsetList();

    for (int i=-n; i<=n; i++) {
        for (int j=-n; j<=n; j++) {
            OffsetType offset;

            if (i*i + j*j >= n*n) {
                continue;
            }

            offset.off[0] = (float)i;
            offset.off[1] = (float)j;

            float dx = (float)i / (float)n;
            float dy = (float)j / (float)n;

            offset.off[2] = 1.0f - std::sqrt(dx*dx + dy*dy);

            float len = dx*dx + dy*dy;

            if (len > 0.0f) {
                dx /= len;
                dy /= len;

                offset.off[3] = dx;
                offset.off[4] = dy;
            }

            list->push_back(offset);
        }
    }

    return *list;
}

extern "C" {

struct ImageData {
    int width;
    int height;
    unsigned char *data;
    int tilesize;
    int rowsize; //tiles per row
    int channels; //ImageSlots::ORIG has 6, rgba plus a stroke_id short
    bool isLinear;
    int id;

    unsigned char *mipmaps[16];
    int totmips;
};

enum BrushFlags {
    ACCUMULATE = 1<<0
};

enum BrushTools {
    DRAW = 0,
    SMEAR = 1,
    ERASE = 2
};

enum ImageSlots {
    MAIN,
    LUT,
    ORIG, //scratch image for origdata
};

struct Brush {
    float color[4];
    float strength, radius;
    float scatter, spacing;

    float smearPickup, smearLen, smearRate;
    float smearColor[4];

    int tool, flag;
    bool first;

    unsigned short stroke_id;
};

Brush brush = {{0.0f,0.0f,0.0f,1.0f}, 1.0f, 25.0f, 0.0f, 0.0f, 0.2f, 0};

void setBrush(float r, float g, float b, float a,
              float radius, float strength, float spacing,
              float scatter, float smearPickup, float smearLen,
              float smearRate, int flag, int tool)
{
   brush.color[0] = r;
   brush.color[1] = g;
   brush.color[2] = b;
   brush.color[3] = a;
   brush.radius = radius;
   brush.strength = strength;
   brush.spacing = spacing;
   brush.smearPickup = smearPickup;
   brush.smearLen = smearLen;
   brush.smearRate = smearRate;
   brush.scatter = scatter;
   brush.flag = flag;
   brush.tool = tool;
}

//up to five images at a time
ImageData images[5] = {0};

int getImageId(int slot) {
    return images[slot].id;
}

void freeMipMaps(int slot) {
  for (int i=0; i<image->totmips; i++) {
    free(image->mipmaps[i]);
    image->mipmaps[i] = nullptr;
  }

  image->totmips = 0;
}

void makeMipMaps(int slot) {
  ImageData *image = images + slot;
  int dimen = std::min(image->width, image->height);

  int levels = (int)ceil(log(dimen) / log(2.0));
  levels = std::min(levels, (int)(sizeof(image->mipmaps) / sizeof(*image->mipmaps)));
  
}

void *getImageData(int slot, int width, int height, int tilesize, int channels, int isLinear, int id) {
    ImageData *image = images + slot;

    if (image->width == width && image->height == height && image->data) {
        return image->data;
    }

    if (image->data) {
        free(image->data);
        freeMipMaps(slot);
    }

    image->data = (unsigned char*)malloc(width*height*channels);

    image->id = id;
    image->isLinear = isLinear;
    image->width = width;
    image->height = height;
    image->tilesize = tilesize;
    image->rowsize = width / tilesize;

    return image->data;
}

#define SRGB_TABLE_SIZE 8192

float gammaToLinear[8192];
float linearToGamma[8192];

float srgb_gamma_to_linear(float f) {
    f = std::min(std::max(f, 0.0f), 0.99999f);

#if 1
    int i = (int)(f * SRGB_TABLE_SIZE);

    return gammaToLinear[i];
#else
  if (f < 0.04045) {
    return (f < 0.0) ? 0.0 : f*(1.0/12.92);
  } else {
    return powf((f + 0.055)/1.055, 2.4f);
  }
#endif
}

float srgb_linear_to_gamma(float f) {
    f = std::min(std::max(f, 0.0f), 0.99999f);
#if 1
    int i = (int)(f * SRGB_TABLE_SIZE);

    return linearToGamma[i];
#else
  if (f < 0.0031308) {
    return (f < 0.0) ? 0.0 : f*12.92;
  } else {
    return 1.055*powf(f, 1.0/2.4) - 0.055;
  }
#endif
}

void rgb_to_linear(float c[4]) {
    c[0] = srgb_gamma_to_linear(c[0]);
    c[1] = srgb_gamma_to_linear(c[1]);
    c[2] = srgb_gamma_to_linear(c[2]);
}

void linear_to_rgb(float c[4]) {
    c[0] = srgb_linear_to_gamma(c[0]);
    c[1] = srgb_linear_to_gamma(c[1]);
    c[2] = srgb_linear_to_gamma(c[2]);
}

void test() {
    if (!images[0].data) {
        return;
    }

    int itot = images[0].width*images[0].height*4;
    unsigned char *data = images[0].data;

    for (int i=0; i<itot; i += 4) {
        data[i] += 5;
        data[i+1] += 5;
        data[i+2] += 5;
    }
}


static void zero_v4(float *f) {
    f[0] = f[1] = f[2] = f[3] = 0.0;
}

static void sub_v4_v4(float *dst, float *b) {
    dst[0] -= b[0];
    dst[1] -= b[1];
    dst[2] -= b[2];
    dst[3] -= b[3];
}

static void add_v4_v4(float *dst, float *b) {
    dst[0] += b[0];
    dst[1] += b[1];
    dst[2] += b[2];
    dst[3] += b[3];
}

static void mul_v4_fl(float *dst, float fac) {
    dst[0] *= fac;
    dst[1] *= fac;
    dst[2] *= fac;
    dst[3] *= fac;
}

static void madd_v4_v4fl(float *dst, float *a, float fac) {
    dst[0] += a[0]*fac;
    dst[1] += a[1]*fac;
    dst[2] += a[2]*fac;
    dst[3] += a[3]*fac;
}

static void copy_v4_v4(float *dst, float *src) {
    dst[0] = src[0];
    dst[1] = src[1];
    dst[2] = src[2];
    dst[3] = src[3];
}

static void sampleLUT(float *dest, float x, float y, float z, int zoff) {
    const ImageData *lut = images + ImageSlots::LUT;

    x *= (float)(lut->tilesize - 1);
    y *= (float)(lut->tilesize - 1);
    z *= (float)(lut->tilesize - 1);

    int ix = (int)(x+0.5);
    int iy = (int)(y+0.5);
    int iz = (int)(z+0.5);

    iz += zoff;

    int col = iz % lut->rowsize;
    int row = iz / lut->rowsize;

    ix += col*lut->tilesize;
    iy += row*lut->tilesize;

    int idx = (iy*images[1].width + ix)<<2;

    const unsigned char *data = lut->data;

    /* flip blue/green for (possible) compatibility with mixbox */
    dest[0] = (float)data[idx] / 255.0f;
    dest[2] = (float)data[idx+1] / 255.0f;
    dest[1] = (float)data[idx+2] / 255.0f;
}

static void colorToPigments(float color[4], float mix[4]) {

    if (images[ImageSlots::LUT].isLinear) {
        float color2[4];
        copy_v4_v4(color2, color);

        rgb_to_linear(color2);
        sampleLUT(mix, color2[0], color2[1], color2[2], 0);
    } else {
        sampleLUT(mix, color[0], color[1], color[2], 0);
    }


    mix[3] = 1.0f - mix[0] - mix[1] - mix[2];

    float mul = mix[0] + mix[1] + mix[2] + mix[3];
    if (mul > 0.0) {
        mul_v4_fl(mix, 1.0f / mul);
    }
}

static void pigmentToColor(float color[4], float mix[4]) {
    float rr = (ditherRand.random()-0.5f) / 255.0f;
    float rg = (ditherRand.random()-0.5f) / 255.0f;
    float rb = (ditherRand.random()-0.5f) / 255.0f;

    sampleLUT(color, mix[0]+rr, mix[1]+rg, mix[2]+rb, images[1].tilesize);

    if (images[ImageSlots::LUT].isLinear) {
        linear_to_rgb(color);
    }
}

static void mixColorsPigment(float dest[4], float *cs[], float ws[], int totcolor) {
    float delta[4], alpha = 0.0, mix[4];

    zero_v4(delta);
    zero_v4(mix);

    //printf("totcolor: %d\n", totcolor);

    for (int i=0; i<totcolor; i++) {
        float mix2[4];
        float color[4];

        colorToPigments(cs[i], mix2);
        pigmentToColor(color, mix2);

        sub_v4_v4(color, cs[i]);

        madd_v4_v4fl(delta, color, ws[i]);
        madd_v4_v4fl(mix, mix2, ws[i]);
        alpha += cs[i][3] * ws[i];
    }

    for (int j=0; j<4; j++) {
        mix[j] += (ditherRand.random()-0.5)/255.0f;
        mix[j] = mix[j] < 0.0 ? 0.0 : mix[j];
    }

    float tot = mix[0] + mix[1] + mix[2] + mix[3];
    if (tot > 0.0f) {
        mul_v4_fl(mix, 1.0f / tot);
    }

    pigmentToColor(dest, mix);
    madd_v4_v4fl(dest, delta, -1.0f);

    dest[3] = alpha;

    for (int i=0; i<4; i++) {
        dest[i] = std::min(std::max(dest[i], 0.0f), 1.0f);
    }
}

void mixColors(float dest[4], float *cs[], float ws[], int totcolor) {
    if (images[1].data) {
        mixColorsPigment(dest, cs, ws, totcolor);
        return;
    }

    zero_v4(dest);

    for (int i=0; i<totcolor; i++) {
        madd_v4_v4fl(dest, cs[i], ws[i]);
    }
}

void execDraw(float x, float y, float dx, float dy, float t, float pressure)
{
    //printf("linear lut: %s\n", images[ImageSlots::LUT].isLinear ? "true" : "false");

    //for (int i=-12; i<48; i++) {
        //printf("  %.3f %.3f\n", srgb_gamma_to_linear((float)i/32.0f), (float)i/32.0f);
    //}

    float radius = brush.radius;
    int n = (int)ceilf(radius);

    ImageData *image = images;

    const float strength = brush.strength * pressure * pressure;

    auto &offsets = getSearchOffsets(n);

    threadPool.parallel_for(8, 0, offsets.size(), [&](int n){
        OffsetType &offset = offsets[n];

        int ix = (int)(x + offset.off[0]);
        int iy = (int)(y + offset.off[1]);

        if (ix < 0 || iy < 0 || ix >= image->width || iy >= image->height) {
            return;
        }

        float w = offset.off[2];

        w = w*w*(3.0 - 2.0 * w);
        w = w*w*(3.0 - 2.0 * w);
        w *= strength;

        int idx = (iy * image->width + ix)*4;

        float c1[4];
        float c2[4];
        float *colors[2], ws[2];

        for (int i=0; i<4; i++) {
            c1[i] = (float)image->data[idx + i] / 255.0f;
        }

        ws[0] = 1.0 - w;
        ws[1] = w;

        colors[0] = c1;
        colors[1] = brush.color;

        mixColors(c2, colors, ws, 2);

        for (int i=0; i<4; i++) {
            image->data[idx+i] = (int)(c2[i] * 255.0f);
        }
    });

}

FastRand smearRand;

static void checkOrigPixel(int stroke_id, int x, int y) {
    const ImageData *main = images + ImageSlots::MAIN;
    ImageData *orig = images + ImageSlots::ORIG;

    int oidx = (y * main->width + x)*6;
    int midx = (y * main->width + x)<<2;

    int stroke_id2 = orig->data[oidx+4] | (orig->data[oidx+5] << 8);

    if (stroke_id2 != stroke_id) {
        orig->data[oidx] = main->data[midx];
        orig->data[oidx+1] = main->data[midx+1];
        orig->data[oidx+2] = main->data[midx+2];
        orig->data[oidx+3] = main->data[midx+3];

        orig->data[oidx+4] = stroke_id & 255;
        orig->data[oidx+5] = (stroke_id>>8) & 255;
    }
}

void getOrigPixel(float *color, int stroke_id, int x, int y) {
    ImageData *orig = images + ImageSlots::ORIG;

    int oidx = (y * orig->width + x)*6;
    int midx = (y * orig->width + x)<<2;

    checkOrigPixel(stroke_id, x, y);

    color[0] = (float)orig->data[oidx] / 255.0f;
    color[1] = (float)orig->data[oidx+1] / 255.0f;
    color[2] = (float)orig->data[oidx+2] / 255.0f;
    color[3] = (float)orig->data[oidx+3] / 255.0f;
}

void setStrokeId(int id) {
    brush.stroke_id = id;
}

void incStrokeId() {
    brush.stroke_id++;
}

int getStrokeId() {
    return brush.stroke_id;
}

void execSmear(float x, float y, float dx, float dy, float t, float pressure)
{
    float radius = brush.radius;
    int n = (int)ceilf(radius);

    ImageData *image = images + ImageSlots::MAIN;

    incStrokeId();

    const float strength = brush.strength * pressure; //std::sqrt(pressure);
    const float smear = brush.smearPickup;
    const float smearLen = brush.smearLen;
    const float scatter = brush.scatter;
    float avg[4], totavg = 0.0f;

    zero_v4(avg);

    float nx = dx;
    float ny = dy;

    float len = nx*nx + ny*ny;
    if (len > 0.0f) {
        nx /= len;
        ny /= len;
    }

    nx = -nx;
    ny = -ny;

    const float sradius = brush.radius * brush.smearLen;

    dx = nx * sradius;
    dy = ny * sradius;

    int idx = (int)(dx + 0.5f);
    int idy = (int)(dy + 0.5f);

    const float scatterfac = brush.scatter * sradius * 0.1f;

    for (const OffsetType &offset : getSearchOffsets(n)) {
        int ix = (int)(x + offset.off[0]);
        int iy = (int)(y + offset.off[1]);

        if (ix < 0 || iy < 0 || ix >= image->width || iy >= image->height) {
            continue;
        }

        float w = offset.off[2];

        if (w < 0.25f) {
          w *= 4.0f;
          w = w*w*(3.0 - 2.0*w);
        } else {
          w = 1.0f;
        }

        w *= strength;

        float nx2 = offset.off[3], ny2 = offset.off[4];

        float det = (nx*ny2 - ny*nx2)*sradius*w*0.25;

        float dx2 = dx;
        float dy2 = dy;

        dx2 += ny*det;
        dy2 += -nx*det;

        if (brush.scatter > 0.0f) {
            dx2 += (smearRand.random()-0.5) * scatterfac;
            dy2 += (smearRand.random()-0.5) * scatterfac;
        }

        int ix2 = ix + (int)floorf(dx2);
        int iy2 = iy + (int)floorf(dy2);

        ix2 = std::min(std::max(ix2, 0), image->width-1);
        iy2 = std::min(std::max(iy2, 0), image->height-1);

        int idx = (iy * image->width + ix)*4;

        float c1[4];
        float c2[4];
        float c3[4];
        float *colors[2], ws[2];

        for (int i=0; i<4; i++) {
            c1[i] = (float)image->data[idx + i] / 255.0f;
        }

        checkOrigPixel(brush.stroke_id, ix, iy);
        getOrigPixel(c2, brush.stroke_id, ix2, iy2);

        if (brush.first) {
            copy_v4_v4(brush.smearColor, c2);
            brush.first = false;
        }

        if (smear > 0.0f) {
            ws[0] = 1.0 - smear;
            ws[1] = smear;

            colors[0] = c2;
            colors[1] = brush.smearColor;

            mixColors(c2, colors, ws, 2);

            add_v4_v4(avg, c1);
            totavg += 1.0f;
        }

        ws[0] = 1.0 - w;
        ws[1] = w;

        colors[0] = c1;
        colors[1] = c2;

        mixColors(c3, colors, ws, 2);

        for (int i=0; i<4; i++) {
            image->data[idx+i] = (int)(c3[i] * 255.0f);
        }
    }

    if (smear > 0.0f && totavg > 0.0f) {
      float *colors[2], ws[2];

      //float w2 = ((1.0f - smear)*(1.0f - smear))*brush.smearRate*0.5;
      float w2 = brush.smearRate*0.5;

      //w2 = std::min(std::max(w2, 0.0f), 1.0f);
      //w2 = 1.0f;

      mul_v4_fl(avg, 1.0f / totavg);

      ws[0] = 1.0f - w2;
      ws[1] = w2;

      colors[0] = brush.smearColor;
      colors[1] = avg;

      mixColors(brush.smearColor, colors, ws, 2);
    }

}

void onStrokeStart() {
    incStrokeId();

    brush.first = true;
}

void execDot(float x, float y, float dx, float dy, float t, float pressure)
{
    switch (brush.tool) {
      case BrushTools::DRAW:
        execDraw(x, y, dx, dy, t, pressure);
        break;
      case BrushTools::SMEAR:
        execSmear(x, y, dx, dy, t, pressure);
        break;
    }
}

void initTables() {
    int steps = SRGB_TABLE_SIZE;
    float s=0, ds = 1.0 / (steps - 1);

    for (int i=0; i<steps; i++, s += ds) {
        float c = s;

        if (c < 0.04045) {
          c = (c < 0.0) ? 0.0 : c*(1.0/12.92);
        } else {
          c = powf((c + 0.055f)/1.055f, 2.4f);
        }

        gammaToLinear[i] = c;

        c = s;
        if (c < 0.0031308) {
          c = (c < 0.0) ? 0.0 : c*12.92;
        } else {
          c = 1.055*powf(c, 1.0f/2.4f) - 0.055f;
        }

        linearToGamma[i] = c;
    }
}

int main(int argc, const char **argv) {
    initTables();
}

}