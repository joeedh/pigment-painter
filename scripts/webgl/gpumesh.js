import {ShaderProgram, Texture, FBO, RenderBuffer} from './webgl.js';
import {
  util, math, nstructjs, Vector2, Vector3,
  Vector4, Matrix4, Quat, UIBase
} from '../path.ux/scripts/pathux.js';

export class GPULayer {
  constructor(key, elemsize, attrname) {
    this.elemsize = elemsize;
    this.name = attrname;
    this.key = key;
  }
}

export class GPUMesh {
  constructor(gl, primtype, totprim) {
    this.vbo = new RenderBuffer();
    this.layers = [];
    this.gl = gl;
    this.primtype = primtype;
    this.totprim = totprim;
  }

  addLayer(elemSize, attrname, data) {
    let key = attrname;

    let gl = this.gl;

    this.layers.push(new GPULayer(key, elemSize, attrname, data));
    this.vbo.get(gl, key).upload(gl, {
      elemSize,
      type      : gl.FLOAT,
      target    : gl.ARRAY_BUFFER,
      normalized: false,
      perfHint  : gl.STATIC_DRAW,
    }, data);
  }

  draw(gl, uniforms, defines, program) {
    program.bind(gl, uniforms, defines);

    for (let i = 0; i < 5; i++) {
      gl.disableVertexAttribArray(i);
    }

    this.layers.sort((a, b) => (a.key > b.key)*2.0 - 1.0);

    //console.log("start");

    for (let layer of this.layers) {
      let buf = this.vbo.get(gl, layer.key);
      let loc = program.attrloc(layer.key);

      //console.log("loc", layer.key, loc, buf);

      buf.bind(gl, loc);
    }

    let totprim = this.totprim;
    switch (this.primtype) {
      case gl.TRIANGLES:
        totprim *= 3;
        break;
      case gl.LINES:
        totprim *= 2;
        break;
    }

    //console.log("totprim", totprim);
    gl.drawArrays(this.primtype, 0, totprim);
  }

  destroy() {
    if (this.gl) {
      this.vbo.destroy(this.gl);
    }
  }
}
