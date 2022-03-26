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
    this.pstmp = undefined;
  }

  update(k1, k2, colorscale) {
    wasm.wasmModule.asm.updatePigment(this.ptr, k1, k2, colorscale);
  }

  static get(pigment_data, idx, k1, k2, colorScale) {
    let id = keymap.get(pigment_data);

    if (id === undefined) {
      id = idgen++;
      keymap.set(pigment_data, id);
    }

    id = idx | (id << 16);

    let ret = cache.get(id);
    if (ret) {
      return ret;
    }

    let pdata = pigment_data.pigmentKS[idx];

    let wasmModule = wasm.wasmReady();

    let wl = pigment_data.wavelengths;
    let wmin = wl[0], wmax = wl[wl.length-1];
    console.log("wmin, wmax", wmin, wmax);

    let len = Math.max(pdata.K.length, pdata.S.length);
    let ptr = wasmModule.asm.makePigmentData(len, k1, k2, colorScale, wmin, wmax);

    let p = new WasmPigment(ptr, idx);
    cache.set(id, p);

    let kptr = wasmModule.asm.getPigmentK(ptr);
    let sptr = wasmModule.asm.getPigmentS(ptr);

    let K = new Float32Array(wasmModule.HEAP8.buffer, kptr, len);
    let S = new Float32Array(wasmModule.HEAP8.buffer, sptr, len);

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

  toRGB(ps, ws, linear) {
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