import {
  simple, util, nstructjs, math, UIBase, Vector3, Vector4, Curve1D, FloatProperty, Vec3Property, Vec4Property
} from '../path.ux/scripts/pathux.js';
import './colormodel.js';
import {getLUTImage, LINEAR_LUT, Pigment, PigmentSet, USE_LUT_IMAGE} from './colormodel.js';
import {Icons} from './icon_enum.js';
import {hsv_to_rgb} from './color.js';
import {makeSharedImageData} from '../../wasm/wasm_api.js';

let soffs = new Array(2048);

import {CommandFormat, ImageSlots, CanvasCommands} from './canvas_base.js';

export * from './canvas_base.js';

import {wasmModule, wasmReady} from '../../wasm/wasm_api.js';

export function getSearchOffs(n, falloffKey, falloffCB) {
  let key = n;

  if (falloffKey) {
    key = "" + n + ":" + falloffKey;
  }

  if (soffs[key]) {
    return soffs[key];
  }

  console.warn("Creating search offs of radius", n);

  let list = soffs[key] = [];

  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      let w = Math.sqrt(i*i + j*j);

      if (w >= n) {
        continue;
      }

      let ni = w !== 0.0 ? i/w : 0.0;
      let nj = w !== 0.0 ? j/w : 0.0;

      w /= n;

      w = 1.0 - w;

      if (falloffCB) {
        w = falloffCB(w);
      }

      list.push([i, j, w, ni, nj]);
    }
  }

  return list;
}

let huerets = util.cachering.fromConstructor(Vector4, 64);


export class DotSample {
  constructor(x, y, dx, dy, t, pressure, radius                          = 0.0,
              spacing = 0.0, strength = 0.0, angle_degrees = 0.0, squish = 0.0,
              soft                                                       = 0.0, alphaLighting = 0.0, followAngle = 0.0, hue = 0.0) {
    this.x = x;
    this.y = y;
    this.dx = dx;
    this.dy = dy;
    this.t = t;
    this.pressure = pressure;
    this.radius = radius;
    this.spacing = spacing;
    this.strength = strength;
    this.angle = angle_degrees/180.0*Math.PI;
    this.squish = squish;
    this.soft = soft;
    this.alphaLighting = alphaLighting;
    this.followAngle = followAngle;
    this.hue = hue;
    this.deltaS = 0.0;
    this.random = 0.0;
    this.param1 = 0.0;
    this.param2 = 0.0;
    this.param3 = 0.0;
    this.param4 = 0.0;
    this.smear = 0.0;
    this.smearLen = 0.0;
    this.smearRate = 0.0;
    this.scatter = 0.0;
    this.color = new Vector4();
    this.alphaLightingMul = 1.0;
  }

  getColor(color) {
    //let c = huerets.next();

    let hsv = rgb_to_hsv(color[0], color[1], color[2]);
    hsv[0] = Math.fract(hsv[0] + this.hue);

    let rgb = hsv_to_rgb(hsv[0], hsv[1], hsv[2]);
    let c = huerets.next();

    c.load(rgb);
    c[3] = color[3];

    return c;
  }

  copyTo(b) {
    b.x = this.x;
    b.y = this.y;
    b.dx = this.dx;
    b.dy = this.dy;
    b.t = this.t;
    b.pressure = this.pressure;
    b.radius = this.radius;
    b.spacing = this.spacing;
    b.strength = this.strength;
    b.angle = this.angle;
    b.squish = this.squish;
    b.soft = this.soft;
    b.alphaLighting = this.alphaLighting;
    b.followAngle = this.followAngle;
    b.hue = this.hue;
    b.deltaS = this.deltaS;
    b.param1 = this.param1;
    b.param2 = this.param2;
    b.param3 = this.param3;
    b.param4 = this.param4;
    b.smearRate = this.smearRate;
    b.smear = this.smear;
    b.smearLen = this.smearLen;
    b.scatter = this.scatter;
    b.alphaLightingMul = this.alphaLightingMul;
  }

  copy() {
    let ret = new DotSample();
    this.copyTo(ret);
    return ret;
  }
}

DotSample.STRUCT = `
DotSample {
  x               : float;
  y               : float;
  dx              : float;
  dy              : float;
  t               : float;
  pressure        : float;
  radius          : float;
  spacing         : float;
  strength        : float;
  angle           : float;
  squish          : float;
  soft            : float;
  alphaLighting   : float;
  followAngle     : float;
  hue             : float;
  deltaS          : float;
  smear           : float;
  smearLen        : float;
  smearRate       : float;
  scatter         : float;
  alphaLightingMul: float;
  param1          : float;
  param2          : float;
  param3          : float;
  param4          : float;
}
`;
nstructjs.register(DotSample);

let {SETBRUSH, DOT, BEGINSTROKE} = CanvasCommands;

export * from './brush.js';
import {
  Brush, BrushChannel, BrushChannelSet, BrushFlags,
  BrushMixModes, BrushTools, DynamicFlags, InputDynamic,
  BrushDynamics, BrushAlpha
} from './brush.js';
import {presetManager, PresetRef} from './presets.js';

let white = new Vector4([1, 1, 1, 1]);

//origdata
const OR = 0, OG = 1, OB = 2, OA = 3, OID = 4, OMASK = 5, OTOT = 6;

let execVecTemps = util.cachering.fromConstructor(Vector4, 512);
let execArrTemps = new util.cachering(() => [0, 0], 512);

export class Canvas {
  constructor(dimen = 1350) {
    this.image = undefined;
    this.origImage = undefined;
    this.tempImage = undefined;
    this.dimen = undefined;
    this.loading = false;

    this.width = dimen;
    this.height = dimen;

    this.haveWasmImage = false;

    this.smearPickup = new Vector4();
    this.smearPickupFirst = true;

    this.pigments = new PigmentSet();
    for (let i = 0; i < 4; i++) {
      this.pigments.push(new Pigment());
    }

    /*
      Arylide__Hansa__yellow: 1
      Biz_vanadate_yellow: 17
      Bone_black: 0
      Cadmium_orange: 3
      Diarylide_yellow: 2
      PH_G_and_Biz_Y_mix: 20
      Phathalo_blue_green_shade_tints: 14
      Phathlo_Green_blue_shade: 15
      Phathlo_green_yellow_shade: 16
      Phthalo_B__GS__and_Phthalo_G__BS_: 21
      Phthalo_blue_red_shade: 13
      Pyrrole_orange: 4
      Quin_Mag_and_Dioxazine_P: 22
      Titanium_White: 23
      dioxazine_purple_tints: 9
      k_cadmium_red: 5
      k_cerulean_blue: 12
      k_cobalt_blue: 11
      k_pyrrole_red: 6
      k_quinacridone_magenta: 8
      k_quinacridone_red: 7
      k_ultramarine_blue: 10
    */
    this.pigments[0].pigment = 14;
    this.pigments[1].pigment = 8;
    this.pigments[2].pigment = 1;
    this.pigments[3].pigment = 23;

    this.stroke_id = 0;

    this.activeBrush = BrushTools.DRAW;

    this.slots = new Array();

    this._last_brush_hash = undefined;
    this.commands = [];

    this.reset(dimen);
    this.genImage();

    this.tempCanvas = undefined;
  }

  get brush() {
    return this.getBrush(this.activeBrush);
  }

  set brush(v) {
    v.pigments = this.pigments;
    v.pigment = this.pigments[0];

    if (this.slots.length <= this.activeBrush) {
      let tot = this.activeBrush - this.slots.length + 1;

      for (let i = 0; i < tot; i++) {
        this.slots.push(new PresetRef());
      }
    }

    this.slots[this.activeBrush].set(v);
  }

  get lutIsLinear() {
    return LINEAR_LUT;
  }

  static defineAPI(api, st) {
    st.struct("brush", "brush", "Brush", api.mapStruct(Brush, true));

    st.enum("activeBrush", "activeBrush", BrushTools, "Tool")
      .icons({
        DRAW : Icons.BRUSH_DRAW,
        ERASE: Icons.BRUSH_ERASE,
        SMEAR: Icons.BRUSH_SMEAR
      });
  }

  putImageData(image) {
    this.width = image.width;
    this.height = image.height;

    this.image = image;
    window.redraw_all();
  }

  getImageBlock(x, y, w, h) {
    let image = new ImageData(w, h);

    let buf1 = this.image.data.buffer;
    let buf2 = image.data.buffer;
    let width = this.image.width;

    console.log(x, y, w, h, " ", width);

    for (let i = 0; i < h; i++) {
      let row = new Uint8Array(buf2, i*w*4, w*4);
      console.log(i, row.length, w*4);

      row.set(new Uint8Array(buf1, ((y + i)*width + x)*4, w*4));
    }

    return {
      image,
      memSize: image.data.length,
      x, y, w, h
    };
  }

  swapImageBlock(block) {
    let buf1 = this.image.data;
    let buf2 = block.image.data;

    let {x, y, w, h} = block;

    for (let i = 0; i < h; i++) {
      let row1 = new Uint8Array(buf2, i*w*4, w*4);
      let row2 = new Uint8Array(buf1, ((y + i)*width + x)*4, w*4);
      row2.set(row1);
    }
  }

  getBrush(slot = this.activeBrush) {
    if (this.slots.length <= slot) {
      this.slots.length = slot + 1;

      for (let i = 0; i < this.slots.length; i++) {
        if (this.slots[i] === undefined) {
          this.slots[i] = new PresetRef("brush");
        }
      }
    }

    let ref = this.slots[slot];
    let brush = ref.getPreset();

    if (!brush) {
      console.log(ref);
      console.error("Slot " + slot + " has no brush; searching for an existing one");

      for (let brush2 of presetManager.getList("brush")) {
        if (brush2.tool === slot) {
          brush = brush2;
          brush.sourcePreset = brush.name; //ensure sourcePreset exists
          ref.set(brush2);
          break;
        }
      }
    }

    if (!brush) {
      console.error("Creating new brush for slot " + slot);

      brush = new Brush();
      brush.tool = slot;

      for (let k in BrushTools) {
        if (BrushTools[k] === slot) {
          brush.name = ToolProperty.makeUIName(k);
          break;
        }
      }

      presetManager.add(brush);
      ref.set(brush);
    }

    brush.pigments = this.pigments;
    brush.pigment = this.pigments[0];

    return brush;
  }

  genImage() {
    //pattern
    let dimen = this.dimen;
    let idata = this.image.data;

    for (let i = 0; i < dimen*dimen; i++) {
      let ix = i%dimen, iy = ~~(i/dimen);
      let x = ix/dimen - 0.5, y = iy/dimen - 0.5;

      let len = x*x + y*y;

      //let f = Math.fract(Math.atan2(y, x) + len*5.0);
      let f = Math.cos(x*5.0)*0.5 + 0.5;

      let h = f;
      let s = Math.tent(f*2.0);
      let v = (1.0 - s)*0.5 + 0.5;

      let rgb = hsv_to_rgb(h, s, v, false);

      let idx = i*4;
      idata[idx] = rgb[0]*255;
      idata[idx + 1] = rgb[1]*255;
      idata[idx + 2] = rgb[2]*255;
      idata[idx + 3] = 255;
    }
  }

  pushCommand() {
    let commands = this.commands;

    commands.push(arguments[0]);
    commands.push(arguments.length - 1);

    for (let i = 1; i < arguments.length; i++) {
      commands.push(arguments[i]);
    }
  }

  pushSetBrush(brush = this.brush) {
    this.pushCommand(SETBRUSH, brush.color[0], brush.color[1], brush.color[2], brush.color[3],
      brush.strength, brush.radius, brush.spacing, brush.tool, brush.mixMode);
  }

  beginStroke() {
    if (wasmReady()) {
      wasmModule.asm.onStrokeStart();
    }

    this.smearPickup.zero();
    this.smearPickupFirst = true;
    this.pushCommand(BEGINSTROKE);
    this.stroke_id++;
  }

  getOrigPixel(x, y, orig = this.origImage) {
    let idx = y*this.dimen + x;

    let oi = idx*OTOT;

    if (orig[oi + OID] !== this.stroke_id) {
      let mul = 1.0/255.0;
      let idata = this.image.data;

      orig[oi + OID] = this.stroke_id;

      idx *= 4;

      orig[oi + OMASK] = 0.0;

      orig[oi + OR] = idata[idx + 0]*mul;
      orig[oi + OG] = idata[idx + 1]*mul;
      orig[oi + OB] = idata[idx + 2]*mul;
      orig[oi + OA] = idata[idx + 3]*mul;
    }

    return oi;
  }

  * execDot(ds) {
    let brush = this.brush;
    let hash = brush.hash()

    if (hash !== this._last_brush_hash) {
      this._last_brush_hash = hash;
      this.pushSetBrush();
    }

    this.pushCommand(DOT, ds.x, ds.y, ds.dx, ds.dy, ds.t, ds.pressure);

    this.execDotIntern(ds, brush);
  }

  execDotSmear(ds, brush) {
    let {dx, dy, t, pressure} = ds;
    let x1 = ds.x, y1 = ds.y;

    let dpi = UIBase.getDPI();

    let mixRGB = brush.getMixFunc();

    //update orig data every dab
    this.stroke_id++;

    x1 += (Math.random() - 0.5)*4.0;
    y1 += (Math.random() - 0.5)*4.0;

    let radius = Math.max(~~(brush.radius*dpi), 1.0);
    let dimen = this.dimen;
    let idata = this.image.data;

    let sradius = radius*brush.spacing*2.0;
    sradius = Math.max(sradius, 1.0);

    let c1 = new Vector4();
    let c2 = new Vector4();

    let w1 = (pressure*brush.strength)**2;

    let ps = brush.pigments;

    if (brush.mixMode === BrushMixModes.PIGMENT) {
      for (let p of ps) {
        p.checkTables();
      }

      ps.checkLUT();
    }

    //normalize
    let dlen = Math.sqrt(dx*dx + dy*dy);
    dlen = dlen !== 0.0 ? 1.0/dlen : 0.0;

    //dlen *= 1.0 + w1*2.0;

    let nx = dx*dlen;
    let ny = dy*dlen;

    dx = -nx*sradius;
    dy = -ny*sradius;

    let brushcolor = brush.tool === BrushTools.ERASE ? white : brush.color;
    let colors = [0, 0];
    let ws = [0, 0];
    let offs = getSearchOffs(1);
    let cs = new Array(offs.length);

    let odata = this.origImage;
    const scatter = brush.scatter, smear = brush.smear;
    let smearPickup = this.smearPickup;
    let avg = new Vector4();
    let avgtot = 0.0;

    for (let off of getSearchOffs(radius)) {
      let nx2 = off[3], ny2 = off[4];

      let x = ~~(x1 + off[0]);
      let y = ~~(y1 + off[1]);

      if (x < 0 || y < 0 || x >= dimen || y >= dimen) {
        continue;
      }

      let w = off[2];
      if (w < 0.25) {
        w *= 4.0;
        w = w*w*(3.0 - 2.0*w);
      } else {
        w = 1.0;
      }

      //w = 1.0;

      //w = Math.min(Math.max(w, 0.0), 1.0);

      let det = -(nx*ny2 - ny*nx2)*sradius*w*0.25;
      //let sdet = Math.sign(det);
      //det = Math.abs(det);
      //det = det*det*(3.0 - 2.0*det);
      //det *= sdet;

      w *= w1;

      if (isNaN(det)) {
        throw new Error("nan!");
      }

      let dx2 = dx;
      let dy2 = dy;

      dx2 += -ny*det;
      dy2 += nx*det;

      let rfac = sradius*brush.scatter;
      dx2 += (Math.random() - 0.5)*rfac;
      dy2 += (Math.random() - 0.5)*rfac;

      let x2 = ~~(x1 + dx2 + off[0]);
      let y2 = ~~(y1 + dy2 + off[1]);

      x2 = Math.min(Math.max(x2, 0), dimen - 1);
      y2 = Math.min(Math.max(y2, 0), dimen - 1);

      let idx = (y*dimen + x)*4;

      c1[0] = idata[idx + 0]/255.0;
      c1[1] = idata[idx + 1]/255.0;
      c1[2] = idata[idx + 2]/255.0;
      c1[3] = idata[idx + 3]/255.0;

      let oi = this.getOrigPixel(x2, y2);

      c2[0] = odata[oi + 0];
      c2[1] = odata[oi + 1];
      c2[2] = odata[oi + 2];
      c2[3] = odata[oi + 3];

      if (this.smearPickupFirst) {
        this.smearPickupFirst = false;
        this.smearPickup.load(c2);
      }

      if (smear > 0.0) {
        ws[0] = 1.0 - smear;
        ws[1] = smear;
        colors[0] = c2;
        colors[1] = smearPickup;

        c2.load(mixRGB(ps, colors, ws));
      }

      avg.add(c2);
      avgtot++;

      odata[oi + OMASK] = Math.max(odata[oi + OMASK] + w);

      ws[0] = 1.0 - w;
      ws[1] = w;

      colors[0] = c1;
      colors[1] = c2;

      let c3 = mixRGB(ps, colors, ws);

      //let c3 = c2.interp(c1, 1.0 - w);

      //make sure current pixel's original data isn't overwritten
      this.getOrigPixel(x, y);

      idata[idx + 0] = c3[0]*255;
      idata[idx + 1] = c3[1]*255;
      idata[idx + 2] = c3[2]*255;
      idata[idx + 3] = c3[3]*255;
    }

    if (smear > 0.0 && avgtot > 0) {
      let w = ((1.0 - smear)**2)*0.8;

      avg.mulScalar(1.0/avgtot);

      colors[0] = smearPickup;
      colors[1] = avg;

      ws[0] = 1.0 - w;
      ws[1] = w;

      smearPickup.load(mixRGB(ps, colors, ws));
    }
  }

  execDotNoAccum(ds, brush) {
    let {dx, dy, t, pressure} = ds;
    let x1 = ds.x, y1 = ds.y;

    pressure *= pressure;

    let dpi = UIBase.getDPI();

    let radius = Math.max(~~(brush.radius*dpi), 1.0);
    let dimen = this.dimen;
    let idata = this.image.data;
    let odata = this.origImage;
    let tdata = this.tempImage;
    const stroke_id = this.stroke_id;

    let c1 = new Vector4();
    let c2 = new Vector4();

    let w1 = brush.strength*pressure;
    let alphaw = w1*w1;

    let ps = brush.pigments;

    if (brush.mixMode === BrushMixModes.PIGMENT) {
      for (let p of ps) {
        p.checkTables();
      }

      ps.checkLUT();
    }

    let mixRGB = brush.getMixFunc();

    let brushcolor = brush.tool === BrushTools.ERASE ? white : brush.color;
    let colors = [0, 0];
    let ws = [0, 0];

    for (let off of getSearchOffs(radius)) {
      let x = ~~(x1 + off[0]);
      let y = ~~(y1 + off[1]);

      if (x < 0 || y < 0 || x >= dimen || y >= dimen) {
        continue;
      }

      let w = off[2];
      w = w*w;
      //w = w*w*(3.0 - 2.0*w);
      //w = w*w*(3.0 - 2.0*w);

      let idx = (y*dimen + x)*4;

      //abuse original image to store accumulation buffer

      let oi = this.getOrigPixel(x, y);

      c1[0] = odata[oi];
      c1[1] = odata[oi + 1];
      c1[2] = odata[oi + 2];
      c1[3] = odata[oi + 3];

      if (tdata[oi + OID] !== stroke_id) {
        tdata[oi + OID] = stroke_id;
        tdata[oi] = tdata[oi + 1] = tdata[oi + 2];
        tdata[oi + 3] = 1.0;
        tdata[oi + OMASK] = 0.0;
      }

      tdata[oi + 0] += (brushcolor[0] - tdata[oi + 0])*w;
      tdata[oi + 1] += (brushcolor[1] - tdata[oi + 1])*w;
      tdata[oi + 2] += (brushcolor[2] - tdata[oi + 2])*w;
      tdata[oi + OMASK] = Math.min(tdata[oi + OMASK] + w, 1.0);

      c2[0] = tdata[oi];
      c2[1] = tdata[oi + 1];
      c2[2] = tdata[oi + 2];
      c2[3] = tdata[oi + 3];

      colors[0] = c1;
      colors[1] = brushcolor;

      w = tdata[oi + OMASK]*w1;

      ws[0] = 1.0 - w;
      ws[1] = w;

      c2.load(mixRGB(ps, colors, ws));

      //c2.interp(c1, 1.0 - alphaw);

      idata[idx + 0] = c2[0]*255;
      idata[idx + 1] = c2[1]*255;
      idata[idx + 2] = c2[2]*255;
      idata[idx + 3] = c2[3]*255;
    }
  }

  execDotInternWasm(ds, brush) {
    const dpi = UIBase.getDPI();

    if (brush.mask && wasmModule.asm.getImageId(ImageSlots.ALPHA) !== brush.mask) {
      BrushAlpha.checkWasmLoaded(brush.mask);

      console.warn("Sending brush alpha mask data to wasm");
    }

    brush = brush.asApplied({pressure: ds.pressure});

    wasmModule.asm.setBrush(
      brush.color[0],
      brush.color[1],
      brush.color[2],
      brush.color[3],
      brush.radius*dpi,
      brush.strength,
      brush.spacing,
      brush.scatter,
      brush.smear,
      brush.smearLen,
      brush.smearRate,
      brush.flag,
      brush.tool,
      brush.mask,
      brush.alphaLighting);

    wasmModule.asm.execDot(ds.x, ds.y, ds.dx, ds.dy, ds.t, 1.0);
  }

  execDotIntern(ds, brush) {
    if (wasmReady()) {
      this.checkWasmImage();
      this.execDotInternWasm(ds, brush);
      return;
    }

    let {dx, dy, t, pressure} = ds;
    let x1 = ds.x, y1 = ds.y;

    pressure *= pressure;

    if (brush.tool === BrushTools.SMEAR) {
      this.execDotSmear(ds, brush);
      return;
    }

    if (!(brush.flag & BrushFlags.ACCUMULATE)) {
      this.execDotNoAccum(ds, brush);
      return;
    }

    let dpi = UIBase.getDPI();

    let radius = Math.max(~~(brush.radius*dpi), 1.0);
    let dimen = this.dimen;
    let idata = this.image.data;

    let c1 = execVecTemps.next().zero();
    let c2 = execVecTemps.next().zero();

    let w1 = (pressure*brush.strength)**2;
    let alphaw = w1*w1;

    let ps = brush.pigments;

    if (brush.mixMode === BrushMixModes.PIGMENT) {
      for (let p of ps) {
        p.checkTables();
      }

      ps.checkLUT();
    }

    let mixRGB = brush.getMixFunc();

    let brushcolor = brush.tool === BrushTools.ERASE ? white : brush.color;
    let colors = execArrTemps.next();
    let ws = execArrTemps.next();

    function weightcb(w) {
      w = w*w*(3.0 - 2.0*w);
      w = w*w*(3.0 - 2.0*w);

      return w;
    }

    for (let off of getSearchOffs(radius, "draw", weightcb)) {
      let x = ~~(x1 + off[0]);
      let y = ~~(y1 + off[1]);

      if (x < 0 || y < 0 || x >= dimen || y >= dimen) {
        continue;
      }

      let w = off[2]*w1;

      let idx = (y*dimen + x)*4;

      ws[0] = 1.0 - w;
      ws[1] = w;

      c1[0] = idata[idx]/255.0;
      c1[1] = idata[idx + 1]/255.0;
      c1[2] = idata[idx + 2]/255.0;
      c1[3] = idata[idx + 3]/255.0;

      colors[0] = c1;
      colors[1] = brushcolor;

      c2 = mixRGB(ps, colors, ws);

      //c2.interp(c1, 1.0 - alphaw);

      idata[idx + 0] = c2[0]*255;
      idata[idx + 1] = c2[1]*255;
      idata[idx + 2] = c2[2]*255;
      idata[idx + 3] = c2[3]*255;
    }
  }

  checkWasmImage() {
    if (!this.haveWasmImage && wasmReady()) {
      console.log("converting to wasm image. . .");

      let image1 = this.image;
      let image2 = makeSharedImageData(image1.width, image1.height);

      image2.data.set(image1.data);
      this.image = image2;

      if (this.unifiedLut) {
        let dimen;

        if (this.pigments.lut) {
          dimen = this.pigments.lut.dimen;
        } else {
          dimen = 256;
        }

        let unifiedLut = makeSharedImageData(this.unifiedLut.width,
          this.unifiedLut.height,
          ImageSlots.LUT,
          dimen,
          this.lutIsLinear);

        unifiedLut.data.set(this.unifiedLut.data);

        this.unifiedLut = unifiedLut;
      }

      this.haveWasmImage = true;
    }
  }

  updateUnifiedLut(image, dimen) {
    this.unifiedLut = makeSharedImageData(image.width, image.height, ImageSlots.LUT, dimen, this.lutIsLinear);
    this.unifiedLut.data.set(image.data);
  }

  makeImage(width, height) {
    if (wasmReady()) {
      this.haveWasmImage = true;
      return makeSharedImageData(width, height);
    } else {
      this.haveWasmImage = false;
      return new ImageData(width, height);
    }
  }

  reset(dimen) {
    if (dimen !== undefined) {
      this.dimen = dimen;
      this.image = this.makeImage(dimen, dimen);
      this.origImage = new Float32Array(dimen*dimen*OTOT);
      this.tempImage = new Float32Array(dimen*dimen*OTOT);
    }

    let idata = this.image.data;
    for (let i = 0; i < idata.length; i++) {
      idata[i] = 255;
    }

    //this.brush = new Brush();

    this._last_brush_hash = undefined;
    this.commands.length = 0;
  }

  reexec() {
    let idata = this.image.data;
    for (let i = 0; i < idata.length; i++) {
      idata[i] = 255;
    }

    let brush = this.brush.copy();

    let cmds = this.commands;
    let _i = 0;

    for (let i = 0; i < cmds.length; i += cmds[i + 1] + 2) {
      let cmd = cmds[i], totarg = cmds[i + 1];
      let j = i + 2;

      switch (cmd) {
        case SETBRUSH:
          brush.color[0] = cmds[j++];
          brush.color[1] = cmds[j++];
          brush.color[2] = cmds[j++];
          brush.color[3] = cmds[j++];
          brush.strength = cmds[j++];
          brush.radius = cmds[j++];
          brush.spacing = cmds[j++];
          break;
        case DOT: {
          let x = cmds[j++];
          let y = cmds[j++];
          let dx = cmds[j++];
          let dy = cmds[j++];
          let t = cmds[j++];

          this.execDotIntern(x, y, dx, dy, t, brush);
          break;
        }
      }
    }
  }

  loadLutImage() {
    if (this.loading) {
      return this.loading;
    }

    this.loading = this.loadLutImageIntern()
      .then(res => {
        this.loading = undefined;
      }).catch(error => {
        util.print_stack(error);
      });

    return this.loading;
  }

  async loadLutImageIntern() {
    this.loading = true;

    let res = await getLUTImage();

    console.log("RES", res);

    if (wasmReady()) {
      let dimen = res.dimen;

      this.unifiedLut = makeSharedImageData(res.image.width, res.image.height, ImageSlots.LUT, dimen, this.lutIsLinear);
      this.unifiedLut.data.set(res.image.data);
    } else {
      this.unifiedLut = res.image;
    }

    console.log("loaded image lookup data", res);
    this.pigments.loadLUTImage(res.image, res.dimen);

    this.loading = false;

    return res;
  }

  loadSTRUCT(reader) {
    reader(this);

    if (this.slots[0] instanceof Brush) {
      this._oldslots = this.slots;
      this.slots = [];
    }

    this.reset(this.dimen);
    this.genImage();

    if (USE_LUT_IMAGE) {
      this.loadLutImage();
    }

    /* ensure commands are in right format */

    let cmds = this.commands;
    let cmds2 = [];

    for (let i = 0; i < cmds.length; i += cmds[i + 1] + 2) {
      let cmd = [cmds[i]], totarg = cmds[i + 1] + 1;

      for (let j = 0; j < totarg; j++) {
        cmd.push(cmds[i + 1 + j]);
      }

      cmds2.push(cmd);
    }

    for (let cmd of cmds2) {
      let totarg = CommandFormat[cmd[0]].args + 2;

      while (cmd.length < totarg) {
        cmd.push(0.0);
      }
    }

    this.commands = cmds2.flat();
  }
}

Canvas.STRUCT = `
Canvas {
  dimen       : int; 
  pigments    : PigmentSet;
  slots       : array(PresetRef);
  activeBrush : int; 
}
`;
simple.DataModel.register(Canvas);
