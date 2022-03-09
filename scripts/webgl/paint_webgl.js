import {ShaderProgram, Texture, FBO, RenderBuffer} from './webgl.js';
import {BrushAlpha, BrushMixModes, BrushTools, Canvas} from '../core/canvas.js';
import {
  util, math, nstructjs, Vector2, Vector3,
  Vector4, Matrix4, Quat, UIBase
} from '../path.ux/scripts/pathux.js';

import {ImageSlots} from '../core/canvas.js';
import {GPUMesh} from './gpumesh.js';
import {Shaders} from './shaders.js';
import {TRILINEAR_LUT} from '../core/colormodel.js';
import {cubic2, dcubic2} from '../core/bezier.js';

export const FBOSlots = {
  MAIN1: 0,
  MAIN2: 1,
  ORIG : 2,
  ACCUM: 3
};


let block_idgen = 0;
let FreedSymbol = Symbol("fbo-freed");

let _temps = new Array(1024);

export function getTempArray(n) {
  //return new Array(n);

  if (_temps[n]) {
    return _temps[n].next();
  }

  _temps[n] = new util.cachering(() => new Array(n), 64);
  return _temps[n].next();
}

class MeshArray extends Array {
  constructor(elemSize, key) {
    super();

    this.key = key;
    this.elemSize = elemSize
    this.vertex_i = 0;
  }
}

class MeshData {
  constructor() {
    this.arrays = new Map();

    /*
          m.mesh.setLayer(2, "co", m.cos);
      m.mesh.setLayer(2, "uv", m.uvs);
      m.mesh.setLayer(1, "strength", m.ss);
      m.mesh.setLayer(2, "dv", m.dvs);
      m.mesh.setLayer(1, "radius", m.rs);
      m.mesh.setLayer(4, "smear", m.smear);
      m.mesh.setLayer(1, "angle", m.angle);
      m.mesh.setLayer(1, "squish", m.squish);
      m.mesh.setLayer(1, "soft", m.soft);
      m.mesh.setLayer(1, "strokeT", m.strokeT);
      m.mesh.setLayer(1, "light", m.light);

     */
    this.cos = this.getArray("co", 2);
    this.uvs = this.getArray("uv", 2);
    this.ss = this.getArray("strength", 1);
    this.dvs = this.getArray("dv", 2);
    this.rs = this.getArray("radius", 1);
    this.smear = this.getArray("smear", 4);
    this.angle = this.getArray("angle", 1);
    this.squish = this.getArray("squish", 1);
    this.soft = this.getArray("soft", 1);
    this.strokeT = this.getArray("strokeT", 1);
    this.light = this.getArray("light", 1);
    this.color = this.getArray("color", 4);
    this.params = this.getArray("params", 4);

    this.tottri = 0;
    this.vertex_i = 0; //current vertex

    this.mesh = undefined;
  }

  setLayers(mesh) {
    this.mesh = mesh;

    for (let array of this.arrays.values()) {
      mesh.setLayer(array.elemSize, array.key, array);
    }

    return this;
  }

  getArray(name, elemSize) {
    let ret = this.arrays.get(name);

    if (!ret) {
      ret = new MeshArray(elemSize, name);
      this.arrays.set(name, ret);
    }

    return ret;
  }

  finish() {
    for (let array of this.arrays.values()) {
      array.length = this.vertex_i*array.elemSize;
    }

    return this;
  }

  reset() {
    this.tottri = this.vertex_i = 0;

    for (let array of this.arrays.values()) {
      array.vertex_i = 0;
    }
  }

  join(array, b, totelem = 1) {
    let elemsize = array.elemSize;
    let tot = totelem*elemsize;

    let i = array.vertex_i*elemsize;

    if (array.length <= i + tot) {
      let newlen = i + tot;
      newlen += newlen>>1;

      array.length = newlen;
    }

    for (let j = 0; j < tot; j++) {
      array[i++] = b[j];
    }

    array.vertex_i += totelem;

    return this;
  }
}

export class FboUndoCache {
  constructor() {
    this.freelists = new Map();
  }

  getFreeList(w, h) {
    let key = w + ":" + h;
    let list = this.freelists.get(key);

    if (!list) {
      list = [];
      this.freelists.set(key, list);
    }
    return list;
  }

  get(gl, w, h) {
    let list = this.getFreeList(w, h);

    if (list.length > 0) {
      let fbo = list.pop();
      fbo[FreedSymbol] = false;
      return fbo;
    }

    return new FBO(gl, w, h);
  }

  free(fbo) {
    if (fbo[FreedSymbol]) {
      console.error("fbo was already freed!", fbo);
      return;
    }

    //console.error("fbo cache free");

    fbo[FreedSymbol] = true;
    this.getFreeList(fbo.size[0], fbo.size[1]).push(fbo);
  }
}

export const fboUndoCache = new FboUndoCache();
window._fboUndoCache = fboUndoCache;

export class WebGLPaint extends Canvas {
  constructor(dimen = 900) {
    dimen *= UIBase.getDPI();
    dimen = ~~dimen;

    super(dimen);

    this.meshCache = [];
    this.gpuMeshCache = new Array(8192);

    this.lastds = undefined;

    this.strokeFirst = false;
    this.smearColor = new Vector4();

    this.image = undefined;
    this.animreq = undefined;

    this.width = dimen;
    this.height = dimen;
    this.fbos = [];
    this.gl = undefined;

    this.queue = [];

    this.lutTex = undefined;
    this.lutDimen = undefined;
    this.lutWidth = undefined;
    this.lutHeight = undefined;


    this.drawmesh = undefined;
    this.drawIntern = this.drawIntern.bind(this);
  }

  init(gl) {
    this.gl = gl;

    for (let fbo of this.fbos) {
      fbo.destroy(gl);
    }

    this.fbos.length = 0;

    gl.disable(gl.SCISSOR_TEST);

    for (let k in FBOSlots) {
      let fbo = new FBO(gl, this.width, this.height);
      this.fbos.push(fbo);
      fbo.create(gl);

      fbo.bind(gl);
      gl.clearColor(1.0, 1.0, 1.0, 1.0);
      //gl.clearBufferfv(gl.COLOR, gl.COLOR_ATTACHMENT0, new Float32Array([1.0, 1.0, 0.0, 1.0]));
      gl.clear(gl.COLOR_BUFFER_BIT);
      fbo.unbind(gl);
    }

    this.checkWasmImage();
  }

  swap() {
    let tmp = this.fbos[0];
    this.fbos[0] = this.fbos[1];
    this.fbos[1] = tmp;
  }

  checkWasmImage() {
    if (!this.unifiedLut || this.lutTex) {
      return;
    }

    if (!this.gl && window._appstate && _appstate.gl) {
      this.init(_appstate.gl);
    }

    let dimen;

    if (this.pigments.lut) {
      dimen = this.pigments.lut.dimen;
    } else {
      dimen = 256;
    }

    this.updateUnifiedLut(this.unifiedLut, dimen);
  }

  makeMeshes(gl) {
    let d = 1.0;

    let data = [
      0, 0, 0, d, d, d,
      0, 0, d, d, d, 0
    ];

    let tottri = 2;

    for (let i = 0; i < 0; i++) {
      data.push(0.0);
      data.push(0.0);

      data.push(1.0);
      data.push(1.0);

      data.push(1.0);
      data.push(0.0);
      //data[i] = (Math.random() - 0.5)*200.0;
      //data[i] = (Math.random() - 0.5)*200.0;
      //data[i] = (Math.random() - 0.5)*200.0;
      tottri++;
    }

    this.drawmesh = new GPUMesh(gl, gl.TRIANGLES, tottri);

    this.drawmesh.addLayer(2, "uv", data);
    this.drawmesh.addLayer(2, "co", data);
  }

  drawIntern(queue) {
    this.animreq = undefined;
    //console.log("QUEUE", this.queue.length, this.queue);

    //ensure shader can compile for attrloc in gpumesh
    Shaders.PaintShader.defines.TOOL = 0;

    this.checkWasmImage();

    if (this.queue.length === 0) {
      return;
    }

    let gl = this.gl;
    let brush = this.brush;
    let continuous = brush.continuous;

    let alpha = BrushAlpha.getAlphaFromId(brush.mask);

    let width = this.width, height = this.height;

    if (brush.tool === BrushTools.SMEAR) {
      this.fbos[0].bind(gl);

      let x = ~~this.queue[0].x;
      let y = this.fbos[0].size[1] - (~~this.queue[0].y);

      let data = new Float32Array(4*4);
      gl.readPixels(x, y, 2, 2, gl.RGBA, gl.FLOAT, data);

      this.fbos[0].unbind(gl);

      let color = new Vector4();
      for (let i = 0; i < data.length; i++) {
        color[i%4] += data[i]
      }
      color.mulScalar(1.0/4.0);

      if (this.strokeFirst) {
        this.smearColor.load(color);
      } else {
        this.smearColor.interp(color, brush.smearRate*0.5);
      }

      //console.log("PIXELS", data);
    }

    this.strokeFirst = false;

    function rect(x, y, w, h, scale = true) {
      let box = getTempArray(12);

      if (scale) {
        w /= width;
        h /= height;
        x /= width;
        y /= height;

        y = 1.0 - y - h;
      }

      //box[0] = x, box[1] = y, box[2] = x, box[3] = y + h, box[4] = x + w, box[5] = y + h;
      //box[6] = x, box[7] = y, box[8] = x + w, box[9] = y + h, box[10] = x + w, box[11] = y;

      let a = 0;
      let b = box;

      b[a++] = x, b[a++] = y, b[a++] = x, b[a++] = y + h, b[a++] = x + w, b[a++] = y + h;
      b[a++] = x, b[a++] = y, b[a++] = x + w, b[a++] = y + h, b[a++] = x + w, b[a++] = y;

      return b;
      //return [
      //x, y, x, y + h, x + w, y + h,
      //x, y, x + w, y + h, x + w, y
      //];
    }

    function join(a, b) {
      for (let item of b) {
        a.push(item);
      }
    }

    let tottri = 0;

    let overlap = Math.max(Math.ceil(1.0/brush.spacing), 1) + 1;

    if (continuous) {
      overlap = 1;
    }

    //overlap = this.queue.length;

    let cubicvec = [new Vector2(), new Vector2(), new Vector2(), new Vector2()];


    let meshes = [];
    for (let i = 0; i < overlap; i++) {
      let m;

      if (this.meshCache.length > i) {
        m = this.meshCache[i];
        m.reset();
      } else {
        m = new MeshData();
        this.meshCache.push(m);
      }

      meshes.push(m);
    }

    function six(f) {
      let ret = getTempArray(6);

      for (let i = 0; i < 6; i++) {
        ret[i] = f;
      }

      return ret;
    }

    let i = 0;
    let lastds = this.lastds;
    let color3 = new Vector4();
    let color4 = new Vector4();

    for (let ds of this.queue) {
      let x = ds.x, y = ds.y;

      if (!lastds) {
        lastds = ds;
      }

      let color1 = lastds.getColor(brush.color);
      let color2 = ds.getColor(brush.color);

      let s = ds.strength;
      let r = ds.radius;
      let rad = 100.0*ds.radius/this.width;

      //console.log("R", rad);
      if (isNaN(rad)) {
        throw new Error("NAN!");
      }

      let {dx, dy} = ds;
      //dy = -dy;

      let dvs = getTempArray(12);
      dvs[0] = dx, dvs[1] = -dy, dvs[2] = dx, dvs[3] = -dy, dvs[4] = dx, dvs[5] = -dy;
      dvs[6] = dx, dvs[7] = -dy, dvs[8] = dx, dvs[9] = -dy, dvs[10] = dx, dvs[11] = -dy;

      //let dvs = [dx, -dy, dx, -dy, dx, -dy];
      //dvs = dvs.concat(dvs);
      let box;

      if (continuous) {
        let lx = lastds.x, ly = lastds.y;
        let dx1, dy1, dx2, dy2;

        let [k1, k2, k3, k4] = cubicvec;

        let r1 = lastds.radius;
        let r2 = ds.radius;

        dx1 = lastds.dx;
        dy1 = lastds.dy;
        dx2 = ds.dx;
        dy2 = ds.dy;

        let sfac = 1.0;
        //sfac = (ds.t - lastds.t)*10.0;

        k1.loadXY(lx, ly);
        k4.loadXY(x, y);
        k2.loadXY(dx1, dy1).mulScalar(sfac*lastds.deltaS/3.0).add(k1);
        k3.loadXY(dx2, dy2).mulScalar(-sfac*ds.deltaS/3.0).add(k4);

        //k2.load(k1).interp(k4, 1.0/3.0);
        //k3.load(k1).interp(k4, 2.0/3.0);

        let lastp, lastdv;

        //lastp = [lx, ly];
        // /lastdv = [dx1, dy1];

        let steps = 28;
        let dt = 1.0/(steps - 1), t = 0.0;

        let angle1 = lastds.angle, angle2 = ds.angle;

        for (let stepi = 0; stepi < steps; stepi++, t += dt) {
          let p = cubic2(k1, k2, k3, k4, t);
          let dv = dcubic2(k1, k2, k3, k4, t);

          //p.load(k1).interp(k4, t);
          //dv.load(k4).sub(k1);

          let angle = angle1 + (angle2 - angle1)*t;
          angle -= Math.PI*0.5;

          let tt = t*t*(3.0 - 2.0*t);

          let r3 = r1 + (r2 - r1)*tt;

          color3.load(color1).interp(color2, t - dt);
          color4.load(color1).interp(color2, t);

          //angle -= Math.PI*0.5;

          //dv[0] = dx1 + (dx2 - dx1) * t;
          //dv[1] = dy1 + (dy2 - dy1) * t;

          dv.normalize().mulScalar(r3);

          let tmp = dv[0];
          dv[0] = -dv[1];
          dv[1] = tmp;

          if (lastp && lastdv) {
            let box = getTempArray(12);
            let a = 0;
            //box = [
            box[a++] = lastp[0] - lastdv[0], box[a++] = lastp[1] - lastdv[1];
            box[a++] = lastp[0] + lastdv[0], box[a++] = lastp[1] + lastdv[1];
            box[a++] = p[0] + dv[0], box[a++] = p[1] + dv[1];

            box[a++] = lastp[0] - lastdv[0], box[a++] = lastp[1] - lastdv[1];
            box[a++] = p[0] + dv[0], box[a++] = p[1] + dv[1];
            box[a++] = p[0] - dv[0], box[a++] = p[1] - dv[1];
            //];

            for (let j = 0; j < box.length; j += 2) {
              box[j] /= width;
              box[j + 1] /= height;
              box[j + 1] = 1.0 - box[j + 1];
            }


            let du = ds.t - lastds.t;
            let u1 = lastds.t + du*t;
            let u2 = lastds.t + du*(t + dt);

            //u1 *= 0.3333;
            //u2 *= 0.3333;

            let uvs = getTempArray(12);
            a = 0;

            uvs[a++] = u1, uvs[a++] = 0, uvs[a++] = u1, uvs[a++] = 1.0, uvs[a++] = u2, uvs[a++] = 1.0;
            uvs[a++] = u1, uvs[a++] = 0, uvs[a++] = u2, uvs[a++] = 1.0, uvs[a++] = u2, uvs[a++] = 0.0;

            /* remember that stroke_t is constant across a dab */
            let stroket = Math.floor(u1);

            let m = meshes[i];

            //let {smear, smearLen, smearRate, scatter} = ds;
            let smear = lastds.smear + (ds.smear - lastds.smear)*t;
            let smearLen = lastds.smearLen + (ds.smearLen - lastds.smearLen)*t;
            let smearRate = lastds.smearRate + (ds.smearRate - lastds.smearRate)*t;
            let scatter = lastds.scatter + (ds.scatter - lastds.scatter)*t;

            let smearParams = getTempArray(24);

            for (let i = 0; i < 6; i++) {
              smearParams[i*4] = scatter/this.width;
              smearParams[i*4 + 1] = smear;
              smearParams[i*4 + 2] = smearLen/this.width;
              smearParams[i*4 + 3] = smearRate;
            }

            let params = getTempArray(24);

            for (let i = 0; i < 6; i++) {
              params[i*4] = ds.param1 || 0;
              params[i*4 + 1] = ds.param2 || 0;
              params[i*4 + 2] = ds.param3 || 0;
              params[i*4 + 3] = ds.param4 || 0;
            }

            m.join(m.color, color3);
            m.join(m.color, color3);
            m.join(m.color, color4);
            m.join(m.color, color3);
            m.join(m.color, color4);
            m.join(m.color, color4);

            m.join(m.cos, box, 6);
            m.join(m.uvs, uvs, 6);
            m.join(m.ss, six(s), 6);
            m.join(m.rs, six(rad), 6);
            m.join(m.dvs, dvs, 6);
            m.join(m.smear, smearParams, 6);
            m.join(m.squish, (six(ds.squish)), 6);
            m.join(m.angle, (six(angle)), 6);
            m.join(m.soft, (six(ds.soft)), 6);
            m.join(m.strokeT, (six(stroket)), 6);
            m.join(m.light, (six(ds.alphaLighting)), 6);
            m.join(m.params, params, 6);

            m.tottri += 2;
            m.vertex_i += 6;

            tottri += 2;
            i = (i + 1)%overlap;

          }

          lastp = p;
          lastdv = dv;
        }


        lastds = ds;
        //box = rect(lx - r, ly - r, r*2, r*2, true)
        //console.log(x, y);
        continue;
      } else {
        box = rect(x - r, y - r, r*2, r*2, true)
      }

      let {smear, smearLen, smearRate, scatter} = ds;
      let smearParams = getTempArray(24);

      for (let i = 0; i < 6; i++) {
        smearParams[i*4] = scatter/this.width;
        smearParams[i*4 + 1] = smear;
        smearParams[i*4 + 2] = smearLen/this.width;
        smearParams[i*4 + 3] = smearRate;
      }

      let params = getTempArray(6*4);

      for (let i = 0; i < 6; i++) {
        params[i*4] = ds.param1 || 0;
        params[i*4 + 1] = ds.param2 || 0;
        params[i*4 + 2] = ds.param3 || 0;
        params[i*4 + 3] = ds.param4 || 0;
      }

      let m = meshes[i];

      for (let j = 0; j < 6; j++) {
        m.join(m.color, color2);
      }

      m.join(m.cos, box, 6);
      m.join(m.uvs, rect(0, 0, 1, 1, false), 6);
      m.join(m.ss, six(s), 6);
      m.join(m.rs, six(rad), 6);
      m.join(m.dvs, dvs, 6);
      m.join(m.smear, smearParams, 6);
      m.join(m.squish, (six(ds.squish)), 6);
      m.join(m.angle, (six(ds.angle)), 6);
      m.join(m.soft, (six(ds.soft)), 6);
      m.join(m.strokeT, (six(ds.t)), 6);
      m.join(m.light, (six(ds.alphaLighting)), 6);
      m.join(m.params, params, 6);

      m.tottri += 2;
      m.vertex_i += 6;

      tottri += 2;
      i = (i + 1)%overlap;

      lastds = ds;
    }

    this.lastds = lastds;

    this.queue.length = 0;

    if (this.lutTex) {
      gl.bindTexture(gl.TEXTURE_2D, this.lutTex.texture);

      if (TRILINEAR_LUT) {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      } else {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    let lutRowSize = this.lutWidth/this.lutDimen;

    /*
    console.log({
      lutTexelSize: 0.5/this.lutWidth, lutRowSize, lutWidth: this.lutWidth, lutHeight: this.lutHeight,
      lutDimen    : this.lutDimen
    });//*/

    let uniforms = {
      size        : new Vector2([this.width, this.height]),
      invSize     : new Vector2([1.0/this.width, 1.0/this.height]),
      aspect      : this.width/this.height,
      rgba        : this.fbos[1].texColor,
      color       : this.brush.color,
      lut         : this.lutTex,
      lutDimen    : this.lutDimen,
      lutSize     : new Vector2([this.lutWidth, this.lutHeight]),
      lutInvSize  : new Vector2([1.0/this.lutWidth, 1.0/this.lutHeight]),
      lutRowSize,
      lutTexelSize: 1.0/this.lutWidth,
      seed        : Math.random(),
      smearPickup : this.smearColor
    };


    let getMesh = (tottri) => {
      let ring = this.gpuMeshCache[tottri];
      if (!ring) {
        ring = this.gpuMeshCache[tottri] = new util.cachering(() => new GPUMesh(gl, gl.TRIANGLES, tottri), 16);
      }

      return ring.next();
    }

    for (let m of meshes) {
      m.finish();
      m.setLayers(getMesh(m.tottri));
      /*
      //console.log(m.tottri);
      //m.mesh = new GPUMesh(gl, gl.TRIANGLES, m.tottri);
      m.mesh.setLayer(2, "co", m.cos);
      m.mesh.setLayer(2, "uv", m.uvs);
      m.mesh.setLayer(1, "strength", m.ss);
      m.mesh.setLayer(2, "dv", m.dvs);
      m.mesh.setLayer(1, "radius", m.rs);
      m.mesh.setLayer(4, "smear", m.smear);
      m.mesh.setLayer(1, "angle", m.angle);
      m.mesh.setLayer(1, "squish", m.squish);
      m.mesh.setLayer(1, "soft", m.soft);
      m.mesh.setLayer(1, "strokeT", m.strokeT);
      m.mesh.setLayer(1, "light", m.light);*/
    }

    let fbo;

    let defines = {};

    if (continuous) {
      defines.CONTINUOUS = null;
    }

    if (TRILINEAR_LUT) {
      defines.TRILINEAR_LUT = null;
    }

    defines.TOOL = this.brush.tool;
    if (brush.smear > 0.0) {
      defines.SMEAR_PICKUP = null;
    }

    if (this.pigments.lut && this.pigments.lut.isPairLut) {
      defines.WITH_PAIR_LUT = null;
    }

    defines.MIX_MODE = brush.mixMode ?? BrushMixModes.PIGMENT;

    if (alpha) {
      uniforms.brushAlpha = alpha.getGLTex(gl);
      defines.HAVE_BRUSH_ALPHA = true;

      uniforms.alphaLightingMul = brush.alphaLightingMul*alpha.alphaLightingMul;
      uniforms.alphaLighting = brush.alphaLighting;
      uniforms.alphaSize = [alpha.image.width, alpha.image.height];
      uniforms.alphaInvSize = [1.0/alpha.image.width, 1.0/alpha.image.height];
      uniforms.alphaTileSize = alpha.tilesize;
      uniforms.alphaInvTileSize = 1.0/alpha.tilesize;
      uniforms.alphaRowSize = Math.floor(alpha.image.width/alpha.tilesize);
      uniforms.alphaInvRowSize = 1.0/uniforms.alphaRowSize;
    }

    let steps = 1;

    if (continuous) {
      steps = Math.ceil(1.0/brush.spacing);
    }

    let du = 1.0/steps;
    let uvoff = new Vector2();

    for (let step = 0; step < steps; step++) {
      if (continuous) {
        uvoff[1] += du;
        uniforms.uvOff = uvoff;
      }

      i = 0;
      for (let m of meshes) {
        uniforms.pass = i;

        uniforms.rgba = this.fbos[1].texColor;
        fbo = this.fbos[0];
        fbo.bind(gl);
        m.mesh.draw(gl, uniforms, defines, Shaders.PaintShader);
        fbo.unbind(gl);

        //if (true || brush.tool !== BrushTools.SMEAR) {

        gl.finish();

        uniforms.rgba = this.fbos[0].texColor;
        fbo = this.fbos[1];
        fbo.bind(gl);
        //this.draw(gl, 0);
        m.mesh.draw(gl, uniforms, defines, Shaders.BlitShader2);
        fbo.unbind(gl);

        gl.finish();

        //this.swap();
        //}

        //if (i > 4) {
        //break;
        //}
        i++;
      }
    }

    //get most recent fbo
    //if (i % 2 === 0) {
    //this.swap();
    //}

    if (brush.tool === BrushTools.SMEAR) {
      //this.swap();
    }

    //fbo = this.fbos[0];
    //fbo.bind(gl);
    //this.draw(gl, 1);
    //fbo.unbind(gl);
  }

  draw(gl, fboIdx = 0) {
    if (this.fbos.length === 0) {
      this.init(gl);
    }

    if (!this.drawmesh) {
      this.makeMeshes(gl);
    }

    let defines = {};

    let uniforms = {
      size  : new Vector2([this.width, this.height]),
      aspect: this.width/this.height,
      rgba  : this.fbos[fboIdx].texColor
    }

    this.drawmesh.draw(gl, uniforms, defines, Shaders.BlitShader);
  }

  getBlockDimen(x, y, w, h) {
    y = this.height - (y + h);

    x /= this.width - 1;
    y /= this.height - 1;
    w /= this.width - 1;
    h /= this.height - 1;

    return {x, y, w, h};
  }

  swapImageBlock(block) {
    let fbo;
    let gl = this.gl;

    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    let {x, y, w, h} = this.getBlockDimen(block.x, block.y, block.w, block.h);

    let mesh = block.mesh.copy();
    mesh.swapAttributes("co", "uv");

    let d3 = 1.0;
    let mesh2 = new GPUMesh(gl, gl.TRIANGLES, 6);
    mesh2.addLayer(2, "co", [
      x, y, x, y + h, x + w, y + h,
      x, y, x + w, y + h, x + w, y
    ]);
    mesh2.addLayer(2, "uv", [
      0, 0, 0, d3, d3, d3,
      0, 0, d3, d3, d3, 0
    ]);

    //block coordinates are now in co (they started out in uv)
    fbo = this.fbos[1];
    fbo.bind(gl);
    mesh2.draw(gl, {
      rgba: block.fbo.texColor,
      seed: Math.random(),
      id  : block.id
    }, {}, Shaders.BlitShader);
    fbo.unbind(gl);

    this.getImageBlock(block.x, block.y, block.w, block.h, block.fbo);

    fbo = this.fbos[0];
    fbo.bind(gl);
    mesh.draw(gl, {
      rgba: this.fbos[1].texColor,
      seed: Math.random(),
    }, {}, Shaders.BlitShader2);
    fbo.unbind(gl);

    window.redraw_all();
  }

  putImageData(image) {
    this.width = image.width;
    this.height = image.height;

    for (let fbo of this.fbos) {
      fbo.update(this.gl, this.width, this.height);
    }

    let gl = this.gl;
    let texture = new Texture(gl.createTexture(), gl);


    texture.load(gl, image.width, image.height, image, gl.TEXTURE_2D, false, gl.LINEAR);

    let uvs = [
      0, 0, 0, 1, 1, 1,
      0, 0, 1, 1, 1, 0
    ];

    let mesh = new GPUMesh(gl, gl.TRIANGLES, 2);

    /*
    x /= this.width - 1;
    y /= this.height - 1;
    w /= this.width - 1;
    h /= this.height - 1;

    mesh.addLayer(2, "co", [
      x, y, x, y + h, x + w, y + h,
      x, y, x + w, y + h, x + w, y
    ]);*/

    mesh.addLayer(2, "co", uvs);
    mesh.addLayer(2, "uv", uvs);

    for (let i = 0; i < 2; i++) {
      this.fbos[i].bind(gl);

      mesh.draw(gl, {
        size  : [this.width, this.height],
        aspect: this.width/this.height,
        rgba  : texture
      }, {}, Shaders.BlitShader);

      this.fbos[i].unbind(gl);
    }

    texture.destroy(gl);

    window.redraw_all();
  }

  getImageData(x = 0, y = 0, w = this.width, h = this.height) {
    let gl = this.gl;
    let fbo = this.fbos[0];

    gl.finish();

    fbo.bind(gl);

    let data = new Float32Array(w*h*4);
    gl.readPixels(x, y, w, h, gl.RGBA, gl.FLOAT, data);

    let image = new ImageData(w, h);
    let idata = image.data;

    for (let i = 0; i < data.length; i++) {
      idata[i] = data[i]*255.0;
    }

    fbo.unbind(gl);

    return image;
  }

  getImageBlock(x, y, w, h, fbo = undefined) {
    let memSize = w*h*4*4;

    let ret = {
      x, y, w, h, memSize
    };

    let gl = this.gl;

    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    let d2 = 0;

    if (!fbo) {
      fbo = ret.fbo = fboUndoCache.get(gl, w + d2, h + d2);
    } else {
      ret.fbo = fbo;
    }

    ret.destroy = function () {
      if (this.fbo) {
        fboUndoCache.free(this.fbo)
      }

      this.fbo = undefined;
    }

    let r = this.getBlockDimen(ret.x, ret.y, ret.w, ret.h);

    x = r.x;
    y = r.y;
    w = r.w;
    h = r.h;

    let mesh = ret.mesh = new GPUMesh(gl, gl.TRIANGLES, 6);
    mesh.addLayer(2, "co", [
      0, 0, 0, 1, 1, 1,
      0, 0, 1, 1, 1, 0
    ]);

    mesh.addLayer(2, "uv", [
      x, y, x, y + h, x + w, y + h,
      x, y, x + w, y + h, x + w, y
    ]);

    //mesh.swapAttributes("co", "uv");

    ret.id = block_idgen++; //(ret.y*this.width + ret.x)*0.1;

    fbo.bind(gl);
    mesh.draw(gl, {
      rgba: this.fbos[0].texColor,
      seed: Math.random(),
    }, {}, Shaders.BlitShader);

    gl.finish();

    fbo.unbind(gl);

    return ret;
  }

  genImage() {
    //do nothing
  }

  reset() {
    if (!this.gl) {
      return;
    }

    for (let fbo of this.fbos) {
      fbo.destroy(this.gl);
    }

    this.init(this.gl);
    this.queue.length = 0;
  }

  beginStroke() {
    this.lastds = undefined
    this.strokeFirst = true;
  }

  * execDot(ds) {
    this.queue.push(ds);
    this.flagRedraw();
  }

  flagRedraw() {
    if (this.animreq) {
      return;
    }

    this.animreq = requestAnimationFrame(this.drawIntern);
  }

  updateUnifiedLut(image, dimen) {
    console.log("%cUploading LUT to gl. . .", "color:green");

    let gl = this.gl;

    if (this.lutTex) {
      this.lutTex.destroy(gl);
    }

    this.lutTex = new Texture(gl.createTexture(), gl);
    this.lutWidth = image.width;
    this.lutHeight = image.height;
    this.lutDimen = dimen;

    let idata = image instanceof ImageData ? image.data : image;

    this.lutTex.load(gl, image.width, image.height, idata, gl.TEXTURE_2D, false, gl.NEAREST);
    gl.bindTexture(gl.TEXTURE_2D, this.lutTex.texture);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  }
}

WebGLPaint.STRUCT = nstructjs.inherit(WebGLPaint, Canvas) + `
}
`
nstructjs.register(WebGLPaint);
