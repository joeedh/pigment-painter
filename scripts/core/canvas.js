import {simple, util, nstructjs, math, UIBase, Vector3, Vector4} from '../path.ux/scripts/pathux.js';
import './colormodel.js';
import {getLUTImage, Pigment, PigmentSet, USE_LUT_IMAGE} from './colormodel.js';
import {Icons} from './icon_enum.js';
import {hsv_to_rgb} from './color.js';

let soffs = new Array(2048);

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

export class DotSample {
  constructor(x, y, dx, dy, t, pressure) {
    this.x = x;
    this.y = y;
    this.dx = dx;
    this.dy = dy;
    this.t = t;
    this.pressure = pressure;
  }

  copyTo(b) {
    b.x = this.x;
    b.y = this.y;
    b.dx = this.dx;
    b.dy = this.dy;
    b.t = this.t;
    b.pressure = this.pressure;
  }

  copy() {
    let ret = new DotSample();
    this.copyTo(ret);
    return ret;
  }
}

DotSample.STRUCT = `
DotSample {
  x           : float;
  y           : float;
  dx          : float;
  dy          : float;
  t           : float;
  pressure    : float;
}
`;
nstructjs.register(DotSample);

let brush_hash = new util.HashDigest();

export const BrushTools = {
  DRAW : 0,
  SMEAR: 1,
  ERASE: 2
};

export const CanvasCommands = {
  SETBRUSH   : 0,
  DOT        : 1,
  BEGINSTROKE: 2
};
export const CommandFormat = {
  [CanvasCommands.SETBRUSH]   : {args: 9},
  [CanvasCommands.DOT]        : {args: 6},
  [CanvasCommands.BEGINSTROKE]: {args: 0},
}

let {SETBRUSH, DOT, BEGINSTROKE} = CanvasCommands;

export const BrushFlags = {
  ACCUMULATE: 1
};

export const BrushMixModes = {
  PIGMENT : 0,
  SIMPLE  : 1,
  CMYK_HSV: 2,
  HSV     : 3,
};

export class Brush {
  constructor() {
    //this.color = new Vector4([0.2, 0.0, 0.6, 1.0]); //c
    this.color = new Vector4([0.6, 0.0, 0.2, 1.0]); //m
    //this.color = new Vector4([1.0, 1.0, 0.0, 1.0]); //y
    //this.color = new Vector4([1.0, 1.0, 0.0, 1.0]);

    this.mixMode = BrushMixModes.PIGMENT;
    this.tool = BrushTools.DRAW;

    this.strength = 0.5;
    this.radius = 15;
    this.scatter = 1.0;
    this.smear = 0.2;
    this.spacing = 0.25;
    this.flag = 0;

    this.pigments = undefined;
    this.pigment = undefined;
  }

  static defineAPI(api, st) {
    st.color4("color", "color", "Color");
    st.float("radius", "radius", "Radius").noUnits().range(1, 512);
    st.float("strength", "strength", "Strength").noUnits().range(0.0, 1.0);
    st.float("spacing", "spacing", "Spacing").noUnits().range(0.005, 4.0);
    st.struct("pigment", "pigment", "Pigment", api.mapStruct(Pigment, true));
    st.float("scatter", "scatter", "Scatter").range(0.0, 10.0).noUnits();
    st.float("smear", "smear", "smear", "Smear color pickup factor").range(0.0, 1.0).noUnits();

    st.flags("flag", "flag", BrushFlags, "Flags");

    st.enum("mixMode", "mixMode", BrushMixModes, "Mode");

    st.enum("tool", "tool", BrushTools, "Tool")
      .icons({
        DRAW : Icons.BRUSH_DRAW,
        ERASE: Icons.BRUSH_ERASE,
        SMEAR: Icons.BRUSH_SMEAR
      });

    st.list("pigments", "pigments", {
      get(api, list, key) {
        return list[key];
      },
      getKey(api, list, obj) {
        return list.indexOf(obj);
      },
      getStruct(api, list, key) {
        return api.mapStruct(Pigment);
      },
      getIter(api, list) {
        return list[Symbol.iterator]();
      }
    })
  }

  copyTo(b) {
    b.color.load(this.color);
    b.smear = this.smear;
    b.strength = this.strength;
    b.radius = this.radius;
    b.scatter = this.scatter;
    b.spacing = this.spacing;
    b.tool = this.tool;
    b.pigments = this.pigments;
    b.mixMode = this.mixMode;
  }

  getMixFunc() {
    switch (this.mixMode) {
      case BrushMixModes.PIGMENT:
        return Pigment.mixRGB;
      case BrushMixModes.SIMPLE:
        return Pigment.mixRGB_Simple;
      case BrushMixModes.CMYK_HSV:
        return Pigment.mixRGB_CMYK;
      case BrushMixModes.HSV:
        return Pigment.mixRGB_HSV;
    }
  }

  copy() {
    let ret = new Brush();
    this.copyTo(ret);
    return ret;
  }

  hash(digest = brush_hash.reset()) {
    digest.add(this.color);
    digest.add(this.strength);
    digest.add(this.radius);
    digest.add(this.spacing);
    digest.add(this.mixMode);
    digest.add(this.scatter);
    digest.add(this.smear);

    return digest.get();
  }

  loadSTRUCT(reader) {
    reader(this);
  }
}

Brush.STRUCT = `
Brush {
  radius   : float;
  strength : float;
  color    : vec4;
  tool     : int;
  spacing  : float;
  flag     : int;
  mixMode  : int;
  scatter  : float;
  smear    : float;
}
`;
simple.DataModel.register(Brush);

let white = new Vector4([1, 1, 1, 1]);

//origdata
const OR = 0, OG = 1, OB = 2, OA = 3, OID = 4, OMASK = 5, OTOT = 6;

let execVecTemps = util.cachering.fromConstructor(Vector4, 512);
let execArrTemps = new util.cachering(() => [0, 0], 512);

export class Canvas {
  constructor(dimen = 700) {
    this.image = undefined;
    this.origImage = undefined;
    this.tempImage = undefined;
    this.dimen = undefined;

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
  }

  get brush() {
    return this.getBrush(this.activeBrush);
  }

  set brush(v) {
    //ensure brush in slot exists
    this.getBrush(this.activeBrush);

    v.pigments = this.pigments;
    v.pigment = this.pigments[0];

    this.slots[this.activeBrush] = v;
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

  getBrush(slot = this.activeBrush) {
    while (this.slots.length <= slot) {
      let b = new Brush();

      b.pigments = this.pigments;
      b.pigment = this.pigments[0];

      b.tool = this.slots.length;
      this.slots.push(b);
    }

    return this.slots[slot];
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

  execDotIntern(ds, brush) {
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

  reset(dimen) {
    if (dimen !== undefined) {
      this.dimen = dimen;
      this.image = new ImageData(dimen, dimen);
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
    getLUTImage().then((res) => {
      console.log("loaded image lookup data", res);
      this.pigments.loadLUTImage(res.image, res.dimen);
    });
  }

  loadSTRUCT(reader) {
    reader(this);

    this.reset(this.dimen);
    this.genImage();

    for (let b of this.slots) {
      b.pigments = this.pigments;
      b.pigment = b.pigments[0];
    }

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
  slots       : array(Brush);
  activeBrush : int; 
}
`;
simple.DataModel.register(Canvas);
