import * as wasm from '../../wasm/wasm_api.js';
import {
  util, nstructjs, Vector2,
  Vector3, Vector4, Matrix4, Quat
} from '../path.ux/scripts/pathux.js';

let rets = util.cachering.fromConstructor(Vector3, 64);

const cache = new Map();

let idgen = 1;
export const keymap = new WeakMap();

export class WasmPigment {
  constructor(ptr, pigment) {
    this.ptr = ptr;
    this.pigment = pigment;
    this.K = undefined;
    this.S = undefined;

    this.tmp1 = undefined;
    this.tmp2 = undefined;
    this.tmp3 = undefined;
    this.tmp4 = undefined;
    this.pstmp1 = undefined;
    this.pstmp2 = undefined;

    this.lastParams = {
      k1         : 0,
      k2         : 0,
      colorScale : 1.0,
      pigmentData: undefined,
      idx        : 0,
      K          : [],
      S          : [],
    };
  }

  copyTo(b) {
    b.ptr = this.ptr;
    b.k1 = this.k1;
    b.k2 = this.k2;
    b.lastParams = this.lastParams;
    b.tmp1 = this.tmp1;
    b.tmp2 = this.tmp2;
    b.tmp3 = this.tmp3;
    b.tmp4 = this.tmp4;
    b.pstmp1 = this.pstmp1;
    b.pstmp2 = this.pstmp2;
    b.K = this.K;
    b.S = this.S;
    b.pigment = this.pigment;
    b.colorScale = this.colorScale;
  }

  update(k1, k2, colorscale) {
    wasm.wasmModule.asm.updatePigment(this.ptr, k1, k2, colorscale);
  }

  static clearCache(pigment_data, idx) {
    let id = this.getCacheId(pigment_data, idx);
    cache.delete(id);
  }

  static getCacheId(pigment_data, idx) {
    let id = keymap.get(pigment_data);

    if (id === undefined) {
      id = idgen++;
      keymap.set(pigment_data, id);
    }

    return idx | (id<<16);
  }

  static setCache(pigment_data, idx, p) {
    cache.set(this.getCacheId(pigment_data, idx), p);
  }


  static get(pigment_data, idx, k1, k2, colorScale) {
    let id = this.getCacheId(pigment_data, idx);

    let ret = cache.get(id);
    if (ret) {
      return ret;
    }

    let pdata = pigment_data.pigmentKS[idx];

    let wasmModule = wasm.wasmReady();

    let wl = pigment_data.wavelengths;
    let wmin = wl[0], wmax = wl[wl.length - 1];
    console.log("wmin, wmax", wmin, wmax);

    let len = Math.max(pdata.K.length, pdata.S.length);
    let ptr = wasmModule.asm.makePigmentData(len, k1, k2, colorScale, wmin, wmax);

    let p = new WasmPigment(ptr, idx);
    cache.set(id, p);

    p.lastParams = {
      k1, k2, colorScale, idx, pigmentData: pigment_data
    };

    let kptr = wasmModule.asm.getPigmentK(ptr);
    let sptr = wasmModule.asm.getPigmentS(ptr);

    let K = new Float32Array(wasmModule.HEAP8.buffer, kptr, len);
    let S = new Float32Array(wasmModule.HEAP8.buffer, sptr, len);

    p.lastParams.K = Array.from(pdata.K);
    p.lastParams.S = Array.from(pdata.S);

    K.set(pdata.K);
    S.set(pdata.S);

    pdata.K = K;
    pdata.S = S;

    p.K = K;
    p.S = S;
    p.k1 = k1;
    p.k2 = k2;
    p.colorScale = colorScale;

    function getF32(n) {
      let ptr = wasmModule.asm.malloc(4*n);
      return [new Float32Array(wasmModule.HEAP8.buffer, ptr, n), ptr];
    }

    function getPtr(n) {
      let ptr = wasmModule.asm.malloc(4*n);
      return [new Uint32Array(wasmModule.HEAP8.buffer, ptr, n), ptr];
    }

    p.tmp1 = getF32(4);
    p.tmp2 = getF32(4);
    p.tmp3 = getF32(4);
    p.tmp4 = getF32(4);

    p.pstmp1 = getPtr(4);
    p.pstmp2 = getPtr(4);

    return p;
  }

  reloadWasm() {
    debugger;

    let pdata = this.lastParams.pigmentData.pigmentKS[this.lastParams.idx];
    pdata.K = new Float32Array(this.lastParams.K);
    pdata.S = new Float32Array(this.lastParams.S);

    this.constructor.clearCache(this.lastParams.pigmentData, this.lastParams.idx);

    let p = this.constructor.get(this.lastParams.pigmentData, this.lastParams.idx, this.lastParams.k1, this.lastParams.k2, this.lastParams.colorScale);
    p.copyTo(this);

    this.constructor.setCache(this.lastParams.pigmentData, this.lastParams.idx, this);
  }

  toRGB(ps, ws, linear) {
    if (this.tmp1[0].buffer.detached) {
      debugger;
      console.error("WASM memory error.");
      this.reloadWasm();
    }

    this.tmp1[0].set(ws);

    this.pstmp1[0][0] = ps[0].wasm.ptr;
    this.pstmp1[0][1] = ps[1].wasm.ptr;
    this.pstmp1[0][2] = ps[2].wasm.ptr;
    this.pstmp1[0][3] = ps[3].wasm.ptr;

    if (!linear) {
      wasm.wasmModule.asm.toRGBInternSRGB(this.tmp2[1], this.pstmp1[1], this.tmp1[1]);
    } else {
      wasm.wasmModule.asm.toRGBInternLinear(this.tmp2[1], this.pstmp1[1], this.tmp1[1]);
    }

    return rets.next().load(this.tmp2[0]);
  }
}