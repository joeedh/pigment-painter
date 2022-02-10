import wasm from './main.mjs';

export var wasmModule;

wasm().then(mod => {
  mod["INITIAL_MEMORY"] = 1024*1024*256;

  window.wasm = mod;
  return mod.ready;
}).then(mod => {
  console.warn("%cwasm ready", "color:green", mod);
  wasmModule = mod;
  mod.asm.main();
});

export function wasmReady() {
  return wasmModule;
}

import {ImageSlots} from '../scripts/core/canvas_base.js';

export function makeSharedImageData(width, height, slot = 0, tilesize = width, linear=false) {
  width = ~~width;
  height = ~~height;
  slot = ~~slot;

  if (slot === 0) {
    //also allocate origdata scratch image at the same time
    makeSharedImageData(width, height, ImageSlots.ORIG, tilesize);
  }


  if (!wasmReady()) {
    console.error("wasm not ready");
    return;
  }

  let channels = slot === ImageSlots.ORIG ? 6 : 4;

  let ptr = wasmModule.asm.getImageData(slot, width, height, tilesize, channels, linear);
  let buf = new Uint8ClampedArray(wasmModule.HEAP8.buffer, ptr, width*height*4);

  return new ImageData(buf, width, height);
}

export function test() {
  if (!wasmReady()) {
    console.error("wasm not ready");
    return;
  }

  wasmModule.asm.test();
  window.redraw_all();
}

window.testWasmImage = test;
