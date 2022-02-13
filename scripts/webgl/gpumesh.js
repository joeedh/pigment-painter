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

  copy() {
    let l = new GPULayer();

    l.elemsize = this.elemsize;
    l.name = this.name;
    l.key = this.key;

    return l;
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

  copy() {
    let ret = new GPUMesh(this.gl, this.primtype, this.totprim);

    for (let layer of this.layers) {
      let layer2 = layer.copy();
      ret.layers.push(layer2);

      let buf1 = this.vbo.get(this.gl, layer.key);
      let buf2 = ret.vbo.get(this.gl, layer.key);

      buf1.copyTo(buf2, true, this.gl);
    }

    return ret;
  }

  swapAttributes(key1, key2) {
    let layer1, layer2;

    for (let layer of this.layers) {
      if (layer.key === key1 || layer.key === key2) {
        if (!layer1) {
          layer1 = layer;
        } else {
          layer2 = layer;
        }
      }
    }

    if (!layer1) {
      throw new Error("unknown key " + key1);
    }
    if (!layer2) {
      throw new Error("unknown key " + key2);
    }

    let buf1 = this.vbo.remove(layer1.key);
    let buf2 = this.vbo.remove(layer2.key);

    let tmp = layer1.key;
    layer1.key = layer2.key;
    layer2.key = tmp;

    this.vbo.add(this.gl, layer1.key, buf1);
    this.vbo.add(this.gl, layer2.key, buf2);
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

    this.layers.sort((a, b) => (a.key > b.key)*2.0 - 1.0);

    //console.log("start");

    for (let layer of this.layers) {
      let buf = this.vbo.get(gl, layer.key);
      let loc = program.attrloc(layer.key);

      //console.log("loc", layer.key, loc, buf);
      if (loc !== undefined) {
        buf.bind(gl, loc);
      }
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

    for (let layer of this.layers) {
      let buf = this.vbo.get(gl, layer.key);
      let loc = program.attrloc(layer.key);

      if (loc !== undefined) {
        buf.unbind(gl, loc);
      }
    }
  }

  destroy() {
    if (this.gl) {
      this.vbo.destroy(this.gl);
    }
  }
}
