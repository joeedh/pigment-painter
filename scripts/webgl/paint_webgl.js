import {ShaderProgram, Texture, FBO, RenderBuffer} from './webgl.js';
import {BrushTools, Canvas} from '../core/canvas.js';
import {
  util, math, nstructjs, Vector2, Vector3,
  Vector4, Matrix4, Quat, UIBase
} from '../path.ux/scripts/pathux.js';

import {ImageSlots} from '../core/canvas.js';
import {GPUMesh} from './gpumesh.js';
import {Shaders} from './shaders.js';

export const FBOSlots = {
  MAIN1: 0,
  MAIN2: 1,
  ORIG : 2,
  ACCUM: 3
};

export class WebGLPaint extends Canvas {
  constructor(dimen = 900) {
    super(dimen);

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

    //ensure shader can compile for attrloc in gpumesh
    Shaders.PaintShader.defines.TOOL = 0;

    this.checkWasmImage();

    if (!this.queue) {
      return;
    }

    let gl = this.gl;
    let brush = this.brush;

    let width = this.width, height = this.height;

    function rect(x, y, w, h, scale = true) {
      if (scale) {
        w /= width;
        h /= height;
        x /= width;
        y /= height;

        y = 1.0 - y - h;
      }

      return [
        x, y, x, y + h, x + w, y + h,
        x, y, x + w, y + h, x + w, y
      ];
    }

    let r = Math.ceil(brush.radius*UIBase.getDPI());
    let tottri = 0;

    let cos = [];
    let uvs = [];

    let overlap = Math.max(Math.ceil(1.0/brush.spacing), 1);

    let meshes = [];
    for (let i = 0; i < overlap; i++) {
      meshes.push({
        uvs   : [],
        cos   : [],
        ss    : [], //strength
        dvs   : [],
        rs    : [],
        smear : [],
        tottri: 0,
      });
    }

    let i = 0;
    for (let ds of this.queue) {
      let x = ds.x, y = ds.y;

      let s = ds.strength;
      let r = ds.radius;
      let rad = 100.0*ds.radius / this.width;

      console.log("R", rad);
      if (isNaN(rad)) {
        throw new Error("NAN!");
      }

      let {dx, dy} = ds;
      dy = -dy;

      let {smear, smearLen, smearRate, scatter} = brush;

      let smearParams = [];
      for (let i=0; i<6; i++) {
        smearParams.push(scatter/this.width);
        smearParams.push(smear);
        smearParams.push(smearLen/this.width);
        smearParams.push(smearRate);
      }

      let dvs = [dx, dy, dx, dy, dx, dy];
      dvs = dvs.concat(dvs);

      meshes[i].cos = meshes[i].cos.concat(rect(x - r, y - r, r*2, r*2, true));
      meshes[i].uvs = meshes[i].uvs.concat(rect(0, 0, 1, 1, false));
      meshes[i].ss = meshes[i].ss.concat([s, s, s, s, s, s]);
      meshes[i].rs = meshes[i].rs.concat([rad, rad, rad, rad, rad, rad]);
      meshes[i].dvs = meshes[i].dvs.concat(dvs);
      meshes[i].smear = meshes[i].smear.concat(smearParams);
      meshes[i].tottri += 2;

      tottri += 2;
      i = (i + 1)%overlap;
    }

    this.queue.length = 0;

    gl.bindTexture(gl.TEXTURE_2D, this.lutTex.texture);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    let lutRowSize = this.lutWidth/this.lutDimen;

    console.log({
      lutTexelSize: 0.5/this.lutWidth, lutRowSize, lutWidth: this.lutWidth, lutHeight: this.lutHeight,
      lutDimen    : this.lutDimen
    });

    let uniforms = {
      size        : new Vector2([this.width, this.height]),
      invSize        : new Vector2([1.0/this.width, 1.0/this.height]),
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
    };

    for (let m of meshes) {
      m.mesh = new GPUMesh(gl, gl.TRIANGLES, m.tottri);
      m.mesh.addLayer(2, "co", m.cos);
      m.mesh.addLayer(2, "uv", m.uvs);
      m.mesh.addLayer(1, "strength", m.ss);
      m.mesh.addLayer(2, "dv", m.dvs);
      m.mesh.addLayer(1, "radius", m.rs);
      m.mesh.addLayer(4, "smear", m.smear);
    }

    let fbo;

    let defines = {};

    defines.TOOL = this.brush.tool;

    i = 0;
    for (let m of meshes) {
      uniforms.pass = i;
      uniforms.rgba = this.fbos[1].texColor;

      fbo = this.fbos[0];
      fbo.bind(gl);
      m.mesh.draw(gl, uniforms, defines, Shaders.PaintShader);
      fbo.unbind(gl);

      if (true || brush.tool !== BrushTools.SMEAR) {
        this.swap();

        uniforms.rgba = this.fbos[1].texColor;
        fbo = this.fbos[0];
        fbo.bind(gl);
        m.mesh.draw(gl, uniforms, defines, Shaders.PaintShader);
        fbo.unbind(gl);
      }

      i++;
    }

    if (brush.tool === BrushTools.SMEAR) {
      //this.swap();
    }

    fbo = this.fbos[0];
    fbo.bind(gl);
    this.draw(gl, 1);
    fbo.unbind(gl);
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

  getImageBlock(x, y, w, h) {

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
