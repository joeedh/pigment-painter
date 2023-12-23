import wasm from './main.mjs';

export var wasmModule;

window._wasmFunc = wasm;
window.wasmGen = 0;

window.reloadWasm = function() {
  wasm().then(mod => {
    mod["INITIAL_MEMORY"] = 1024*1024*400;

    window.wasm = mod;
    return mod.ready;
  }).then(mod => {
    console.warn("%cwasm ready", "color:green", mod);
    wasmModule = mod;
    mod.asm.main();
    window.wasmGen++;
  });
}

wasm().then(mod => {
  mod["INITIAL_MEMORY"] = 1024*1024*400;

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

export function makeSharedImageData(width, height, slot = 0, tilesize = width, linear=false, id=0) {
  width = ~~width;
  height = ~~height;
  slot = ~~slot;

  if (slot === 0) {
    //also allocate origdata scratch images at the same time
    makeSharedImageData(width, height, ImageSlots.ORIG, tilesize, id);
    makeSharedImageData(width, height, ImageSlots.ACCUM, tilesize, id);
  }


  if (!wasmReady()) {
    console.error("wasm not ready");
    return;
  }

  let channels = slot === ImageSlots.ORIG || slot === ImageSlots.ACCUM ? 6 : 4;

  let ptr = wasmModule.asm.getImageData(slot, width, height, tilesize, channels, linear, id);
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
