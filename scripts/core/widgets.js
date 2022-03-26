import {
  nstructjs, util, Vector2, Vector3,
  Vector4, Matrix4, Quat, math, UIBase,
  Container, saveUIData, loadUIData, ToolOp, IntProperty,
  Vec4Property, EnumProperty, iconmanager, StringProperty,
  popModalLight, pushModalLight, keymap, parsepx, PackFlags,
  haveModal, cconst, PanelFrame
} from '../path.ux/scripts/pathux.js';
import {Icons} from './icon_enum.js';

import '../webgl/brush_webgl_ops.js';
import {presetManager} from './presets.js';
import {Brush, BrushChannelFlags, BrushMixModes, BrushTools} from './brush.js';
import {Presets} from '../presets/brush_presets.js';
import {Optimizer} from './optimize.js';
import {Pigment, pigment_data, START_REFL_K1, START_REFL_K2} from './colormodel.js';
import * as pigment_data_orig from './pigment_data_original.js';

export const BrushIconCache = new Map();

export function copyPigmentData(p) {
  let p2 = {
    pigmentKS: []
  };

  for (let pdata of p.pigmentKS) {
    pdata = {
      name: pdata.name,
      K   : util.list(pdata.K),
      S   : util.list(pdata.S)
    }

    p2.pigmentKS.push(pdata);
  }

  return p2;
}

export function loadPigmentData(ps, dst, src) {
  let p1 = dst.pigmentKS;
  let p2 = src.pigmentKS;

  for (let i = 0; i < p1.length; i++) {
    let a = p1[i];
    let b = p2[i];

    for (let i = 0; i < a.K.length; i++) {
      a.K[i] = b.K[i];
    }

    for (let i = 0; i < a.S.length; i++) {
      a.S[i] = b.S[i];
    }
  }

  for (let p of ps) {
    p.updateGen++;
  }
}

export class ResetPigmentData extends ToolOp {
  static tooldef() {
    return {
      uiname  : "Reset Data",
      toolpath: "pigment.reset_data",
    }
  }

  undoPre(ctx) {
    this._undo = copyPigmentData(pigment_data);
  }

  undo(ctx) {
    loadPigmentData(ctx.pigments, pigment_data, this._undo);
  }

  exec(ctx) {
    loadPigmentData(ctx.pigments, pigment_data, pigment_data_orig);
  }
}

ToolOp.register(ResetPigmentData);

export class TripletOp extends ToolOp {
  constructor() {
    super();
    this._undoData = undefined;
  }

  static tooldef() {
    return {}
  }

  undoPre(ctx) {
    this._undoData = ctx.colorTriplets.makeSave();
  }

  undo(ctx) {
    ctx.colorTriplets.loadSave(this._undoData);
  }
}

export class AddTripletOp extends TripletOp {
  static tooldef() {
    return {
      toolpath: "triplets.add",
      uiname  : "Add",
      icon    : Icons.SMALL_PLUS,
      inputs  : {},
      outputs : {}
    }
  }

  exec(ctx) {
    ctx.colorTriplets.makeTriplet();
  }
}

ToolOp.register(AddTripletOp);

export class ResetMiddleOp extends TripletOp {
  static tooldef() {
    return {
      toolpath: "triplets.resetMiddle",
      uiname  : "Refresh",
      icon    : Icons.REFRESH,
      inputs  : {
        id: new IntProperty()
      },
      outputs : {}
    }
  }

  exec(ctx) {
    let cset = ctx.colorTriplets;

    let triplet = cset.get(this.inputs.id.getValue());
    triplet.color2.load(triplet.color1).interp(triplet.color3, 0.5);
    cset.onChanged();
  }
}

ToolOp.register(ResetMiddleOp);

export class RemoveTripletOp extends TripletOp {
  static tooldef() {
    return {
      toolpath: "triplets.remove",
      uiname  : "Refresh",
      icon    : Icons.SMALL_MINUS,
      inputs  : {
        id: new IntProperty()
      },
      outputs : {}
    }
  }

  exec(ctx) {
    let cset = ctx.colorTriplets;

    let triplet = cset.get(this.inputs.id.getValue());
    cset.remove(triplet);
  }
}

ToolOp.register(RemoveTripletOp);

export class TripletEditor extends Container {
  constructor() {
    super();

    this._last_update_key = undefined;
    this.needsRebuild = true;

    this.label("Color Triplets");
  }

  static define() {
    return {
      tagname: "color-triplet-editor-x",
      style  : "tripleteditor"
    }
  }

  init() {
    super.init();
  }

  getColorTripletSet() {
    return this.ctx.api.getValue(this.ctx, "colorTriplets");
  }

  rebuild() {
    this.needsRebuild = false;

    let uidata = saveUIData(this, "triplet editor");

    this.clear();

    let cset = this.getColorTripletSet();

    this.label("Color Triplets");

    let row;

    row = this.row();
    row.useIcons(true);
    row.tool("triplets.add");

    let path = this.getAttribute("datapath");

    for (let triplet of cset) {
      let path2 = `${path}.triplets[${triplet.id}]`;
      let row = this.row();

      row.overrideClassDefault("colorpickerbutton", "width", 45);

      row.prop(path2 + ".color1").customLabel = '';
      row.prop(path2 + ".color2").customLabel = '';
      row.prop(path2 + ".color3").customLabel = '';

      row.useIcons(true);
      row.tool(`triplets.resetMiddle(id=${triplet.id})`);
      row.tool(`triplets.remove(id=${triplet.id})`);
    }

    row = this.row();
    row.button("Make LUTs", () => {
      this.ctx.colorTriplets.makeLUTs(this.ctx);
    });

    this.prop(path + ".dimen");
    this.prop(path + ".upscaleLevels");
    this.prop(path + ".blurCount");
    this.prop(path + ".lutFillIn");

    loadUIData(this, uidata);

    for (let i = 0; i < 2; i++) {
      this.flushSetCSS();
      this.flushUpdate();
    }
  }

  update() {
    if (!this.ctx) {
      return;
    }

    super.update();

    let cset = this.getColorTripletSet();
    let key = "";

    if (cset) {
      key += cset.updateGen;
    }

    if (key !== this._last_update_key) {
      this._last_update_key = key;
      this.needsRebuild = true;
    }

    if (this.needsRebuild) {
      this.rebuild();
    }
  }
}

UIBase.register(TripletEditor);

export class BrushStackEditor extends Container {
  constructor() {
    super();

    this._last_update_gen = undefined;
    this.needsRebuild = true;
  }

  static define() {
    return {
      tagname: "brush-stack-editor-x"
    }
  }

  rebuild() {
    console.warn("Rebuild!");

    this.needsRebuild = false;

    let uidata = saveUIData(this, "brushstack");

    let path = this.getAttribute("datapath");

    this.clear();
    let row = this.row();

    let cset = this.getBrushStack();
    row.tool(`brush.add_command(datapath="${path}")`);

    let docmd = (cmd, i) => {
      let path2 = `${path}.commands[${i}]`;

      let panel = this.panel(cmd.name);

      panel.prop(`${path2}.overrides['strength'].value`);

      console.log(cmd);

      let panel2 = panel.panel("Settings");
      for (let ch of cmd.overrides.values()) {
        let suffix = "value";

        if (ch.name === "strength") {
          continue;
        }

        if (ch.prop instanceof Vec4Property) {
          suffix = "color";
        }

        panel2.prop(`${path2}.overrides['${ch.name}'].${suffix}`);
      }

      panel2.closed = true;

    }

    let i = 0;
    for (let cmd of cset.commands) {
      docmd(cmd, i);
      i++;
    }

    loadUIData(this, uidata);

    for (let i = 0; i < 2; i++) {
      this.flushSetCSS();
      this.flushUpdate();
    }
  }

  getBrushStack() {
    return this.ctx.api.getValue(this.ctx, this.getAttribute("datapath"));
  }

  update() {
    if (!this.ctx) {
      return;
    }

    let cset = this.getBrushStack();
    if (cset.updateGen !== this._last_update_gen) {
      this._last_update_gen = cset.updateGen;
      this.needsRebuild = true;
    }

    if (this.needsRebuild) {
      this.rebuild();
    }
  }
}

UIBase.register(BrushStackEditor);

export class AddBrushOp extends ToolOp {
  constructor() {
    super();
  }

  static tooldef() {
    return {
      toolpath: "canvas.add_brush",
      uiname  : "Add Brush",
      icon    : Icons.SMALL_PLUS,
      inputs  : {
        slotpath: new StringProperty(),
        datapath: new StringProperty(),
      }
    }
  }

  redo(ctx) {
    //do nothing, brushes are above application state
  }

  undo(ctx) {
    //do nothing, brushes are above application state
  }

  undoPre(Ctx) {
    //do nothing.
  }

  exec(ctx) {
    let slot = ctx.api.getValue(ctx, this.inputs.slotpath.getValue());

    if (typeof slot !== "number") {
      console.log(slot);
      throw new Error("invalid brush slot " + slot);
    }

    let brush = new Brush();
    brush.tool = slot;

    for (let k in BrushTools) {
      if (BrushTools[k] === slot) {
        brush.name = ToolProperty.makeUIName(k);
        break;
      }
    }

    presetManager.add(brush);
    ctx.api.setValue(ctx, this.inputs.datapath.getValue(), brush);
  }
}

ToolOp.register(AddBrushOp);

export class ResetBrushOp extends ToolOp {
  constructor() {
    super();
  }

  static tooldef() {
    return {
      toolpath: "canvas.reset_brush",
      uiname  : "Reset Brush",
      icon    : Icons.REFRESH,
      inputs  : {
        slotpath: new StringProperty(),
        datapath: new StringProperty(),
      }
    }
  }

  undo(ctx) {
    let brush = ctx.api.getValue(ctx, this.inputs.datapath.getValue());
    this._undoBrush.copyTo(brush);
    brush.save();
  }

  undoPre(ctx) {
    this._undoBrush = ctx.api.getValue(ctx, this.inputs.datapath.getValue()).copy();
  }

  exec(ctx) {
    //let slot = ctx.api.getValue(ctx, this.inputs.slotpath.getValue());
    let brush = ctx.api.getValue(ctx, this.inputs.datapath.getValue());
    let preset;

    for (let k in Presets) {
      if (Presets[k].name === brush.sourcePreset) {
        preset = Presets[k];
        break;
      }
    }

    if (!preset) {
      console.warn("Not a preset brush!");

      let brush2 = new Brush();

      brush2.tool = brush.tool;
      brush2.name = brush.name;
      brush2.presetId = brush.presetId;
      brush2.sourcePreset = brush.sourcePreset;
      brush2.iconColor.load(brush.iconColor);

      brush2.copyTo(brush);
      brush.save();
    } else {
      if (preset.name == brush.name) {
        presetManager.resetBuiltin(preset);
      } else {
        preset = Brush.applyDeltaSave(preset);
        let brush2 = Brush.loadSave(preset);

        brush2.tool = brush.tool;
        brush2.name = brush.name;
        brush2.sourcePreset = brush.sourcePreset;
        brush2.presetId = brush.presetId;
        brush2.iconColor.load(brush.iconColor);

        brush2.copyTo(brush);
        brush.save();
      }
    }
  }
}

ToolOp.register(ResetBrushOp);

export class BrushSelector extends Container {
  constructor() {
    super();

    this._last_slot = undefined;
    this.needsRebuild = true;
    this._last_update_key = undefined;
    this.dropbox = undefined;
  }

  static define() {
    return {
      tagname: "brush-selector-x"
    }
  }

  init() {
    super.init();
  }

  rebuild() {
    if (!this.hasAttribute("datapath")) {
      return;
    }

    this.needsRebuild = false;

    let uidata = saveUIData(this, "selector");

    let path = this.getAttribute("datapath");
    let slot = this.getAttribute("slotpath");

    this.clear();
    this.useIcons(false);

    this.dropbox = UIBase.createElement("dropbox-x");
    this.dropbox.prop = this.getSlotEnum();

    this.dropbox.onselect = (id) => {
      let brush = presetManager.get(id, "brush");
      if (!brush) {
        console.error("Unknown brush at id " + id);
        return;
      }

      console.log("Dropbox click!", id, this.dropbox.prop);
      this.ctx.api.setValue(this.ctx, this.getAttribute("datapath"), brush);
    }

    let strip = this.row().strip();
    strip.add(this.dropbox);
    strip.useIcons(true);
    strip.tool(`canvas.add_brush(slotpath="${slot}" datapath="${path}")`);
    strip.prop(path + ".name");
    strip.tool(`canvas.reset_brush(slotpath="${slot}" datapath="${path}")`);

    let onpress = this.dropbox._onpress;
    this.dropbox._onpress = (e) => {
      this.dropbox.prop = this.getSlotEnum();
      return onpress.call(this.dropbox, e);
    }

    loadUIData(this, uidata);

    for (let i = 0; i < 2; i++) {
      this.flushSetCSS();
      this.flushUpdate();
    }
  }

  getIcon(brush) {
    let key = "" + brush.tool + ":" + brush.name + ":" + brush.presetId;
    let icon = BrushIconCache.get(key);
    if (icon !== undefined) {
      return icon;
    }

    let size = iconmanager.getTileSize(2);
    let canvas = document.createElement("canvas");
    let g = canvas.getContext("2d");
    canvas.width = canvas.height = size;

    /*
    g.beginPath();
    g.strokeStyle = "black";
    g.lineWidth = 1.0;
    g.rect(0, 0, size, size);
    //g.fill();
    g.stroke();
    //*/

    let fakeElem = {
      getDPI() {
        return 1.0;
      }
    };


    let iconval;
    switch (brush.tool) {
      case BrushTools.DRAW:
        iconval = Icons.BRUSH_DRAW;
        break;
      case BrushTools.SMEAR:
        iconval = Icons.BRUSH_SMEAR;
        break;
      case BrushTools.ERASE:
        iconval = Icons.BRUSH_ERASE;
        break;
      default:
        iconval = Icons.BRUSH_DRAW;
    }

    iconmanager.canvasDraw(fakeElem, canvas, g, iconval, 0, 0, 2);

    let promise = createImageBitmap(canvas);

    let iconId = iconmanager.addCustomIcon(key, canvas);
    BrushIconCache.set(key, iconId);

    promise.then(bitmap => {
      //  iconmanager.addCustomIcon(key, bitmap);
    });

    return iconId;
  }

  getSlotEnum() {
    let slot = this.ctx.api.getValue(this.ctx, this.getAttribute("slotpath"));

    let enumdef = {};
    let iconmap = {};

    console.log("SLOT", slot);

    let list = presetManager.getList("brush");
    for (let brush of list) {
      if (brush.tool === slot) {
        enumdef[brush.name] = brush.presetId;
        iconmap[brush.name] = this.getIcon(brush);
      }
    }

    let brush = this.ctx.api.getValue(this.ctx, this.getAttribute("datapath"));
    return new EnumProperty(brush ? brush.name : undefined, enumdef).addIcons(iconmap);
  }

  updateDataPath() {
    if (!this.ctx || !this.hasAttribute("datapath")) {
      return;
    }

    let list = presetManager.getList("brush");
    let key = list.length;

    if (key !== this._last_update_key) {
      this._last_update_key = key;
      this.dropbox.prop = this.getSlotEnum();
    }

    let val = this.ctx.api.getValue(this.ctx, this.getAttribute("datapath"));
    this.dropbox.setValue(val.presetId);
  }

  update() {
    super.update();

    if (this.needsRebuild) {
      this.rebuild();
    }

    if (this.dropbox) {
      let slot = this.ctx.api.getValue(this.ctx, this.getAttribute("slotpath"));
      if (slot !== this._last_slot) {
        this._last_slot = slot;
        this.dropbox.prop = this.getSlotEnum();
      }
    }

    this.updateDataPath();
  }
}

UIBase.register(BrushSelector);

export class LUTEditorWidget extends Container {
  constructor() {
    super();

    this.needsBuild = true;
  }

  static define() {
    return {
      tagname: "pigment-lut-editor-x",
    }
  }

  init() {
    if (this.ctx) {
      this.build();
    }
  }

  update() {
    super.update();

    if (this.ctx && this.needsBuild) {
      this.build();
    }
  }

  build() {
    this.needsBuild = false;
    let names = ["C", "M", "Y", "K"];

    this.solver = undefined;

    let panel = this.panel("Solver");

    panel.tool("pigment.reset_data");

    let button2 = panel.button("Optimize", () => {
      if (this.solver) {
        this.solver.stop();
        this.solver = undefined;
        button2.name = "Optimize";
      } else {
        this.solver = new Optimizer(this.ctx.pigments, this.ctx.settings.solverSettings);
        this.solver.start();
        button2.name = "Stop";
      }
    });

    panel.dataPrefix = "settings.solverSettings";

    let row = panel.row();
    row.label("Error:")
    row.pathlabel("errorOut");

    panel.prop("flag");
    panel.prop("randFac");
    panel.prop("newtonStep");
    panel.prop("subPoints");
    panel.prop("highPassFac");
    panel.prop("pointSubSteps");

    button2.description = "Optimize pigment spectral at a data level";

    panel = this.panel("Render");

    let lutimage = undefined;
    let canvas = document.createElement("canvas");
    let g = canvas.getContext("2d");

    canvas.width = canvas.height = 256;

    let render = () => {
      lutimage = window.renderedLut;

      g.clearRect(0, 0, canvas.width, canvas.height);
      g.drawImage(lutimage, 0, 0, canvas.width, canvas.height);

    }

    panel.appendChild(canvas);

    this.update.after(() => {
      if (window.renderedLut !== lutimage) {
        render();
      }
    });

    this.button("Render", () => {
      this.ctx.pigments.renderLUTCube();
    });

    let bindView = () => {
      let getmouse = (e) => {
        let r = canvas.getBoundingClientRect();

        let w = canvas.width/UIBase.getDPI();

        let x = (e.x - r.x)/w;
        let y = (e.y - r.y)/w;

        return new Vector2([x, y]);
      }

      let modalstate;

      let endModal = () => {
        if (modalstate) {
          popModalLight(modalstate);
          modalstate = undefined;
          this.ctx.pigments._cameraDragging = false;
          this.ctx.pigments.renderLUTCube();
        }
      }

      let last_mpos = new Vector2();

      canvas.addEventListener("pointerdown", (e) => {
        console.log("Canvas mouse down!");

        last_mpos = getmouse(e);

        if (e.button === 0) {
          e.preventDefault();
        }

        if (modalstate) {
          return;
        }

        e.stopPropagation();

        let ctx = this.ctx;

        modalstate = pushModalLight({
          on_pointerup(e) {
            endModal();
          },

          on_pointercancel(e) {
            endModal();
          },

          on_pointermove(e) {
            let mpos = getmouse(e);
            mpos.sub(last_mpos);

            last_mpos.load(getmouse(e));

            let cam = ctx.pigments.renderCamera;

            let mat = new Matrix4();

            let mat2 = new Matrix4(cam.cameramat);
            mat2.makeRotationOnly();
            let imat2 = new Matrix4(mat2);

            imat2.invert();

            //mpos.mulScalar(0.1);

            mat.euler_rotate(mpos[1], -mpos[0], 0.0);
            mat.preMultiply(imat2);
            mat.multiply(mat2);

            cam.pos.multVecMatrix(mat);
            cam.target.multVecMatrix(mat);
            cam.up.multVecMatrix(mat);
            cam.regen_mats(1.0);

            ctx.pigments.renderLUTCube();
            render();
          },
          on_keydown(e) {
            if (e.keyCode === keymap["Escape"]) {
              endModal();
            }
          }
        });
      });
    }

    bindView();

    panel = this.panel("Create LUT");
    panel.useIcons(false);

    panel.dataPrefix = "pigments";

    panel.prop("genDimen");
    panel.prop("fillInLut");
    panel.prop("blurFilledInPixels");
    panel.prop("blurRadius");
    panel.prop("blurAll");
    panel.prop("optimizeFilledIn");
    panel.prop("optSteps");
    panel.prop("createReverseLut");
    panel.prop("upscaleGoal");
    panel.prop("lutQuality");
    panel.prop("colorScale");

    let panel2 = this.panel("Specular");

    let k1, k2;

    panel2.dataPrefix = "";
    panel2.prop("pigments.useCustomKs").update.after(() => {
      let disabled = !this.ctx.api.getValue(this.ctx, "pigments.useCustomKs")

      k1.disabled = disabled;
      k2.disabled = disabled;
    });
    k1 = panel2.prop("pigments.k1");
    k2 = panel2.prop("pigments.k2");

    panel2.button("Reload K1/K2", () => {
      panel2.setPathValueUndo(this.ctx, "pigments.k1", START_REFL_K1);
      panel2.setPathValueUndo(this.ctx, "pigments.k2", START_REFL_K2);
    });

    let job = undefined;
    let gen = undefined;
    let messages = {};

    let createButton = panel.button("Create LUT", () => {
      let this2 = this;

      function endJob() {
        window.clearInterval(job);
        job = undefined;
        gen = undefined;
        createButton.name = "Create LUT";

        for (let k in messages) {
          if (messages[k] !== 1.0) {
            this2.ctx.progressBar(k, 1.0);
          }
        }
      }

      if (job !== undefined) {
        endJob();
        return;
      }

      createButton.name = "Cancel";

      let reporter = (msg, percent) => {
        messages[msg] = percent;
        this.ctx.progressBar(msg, percent);
      }

      function* Job() {
        let ps = this2.ctx.pigments;

        let gen1 = this2.ctx.pigments.makeLUTsJob(ps.genDimen, ps.doFillInLut, ps.upscaleGoal, ps.lutQuality, !ps.createReverseLut, reporter);

        for (let step of gen1) {
          yield;
        }

        this2.ctx.pigments.makeLUTImage();
      }

      gen = Job();
      job = window.setInterval(() => {
        let start = util.time_ms();

        while (util.time_ms() - start < 30) {
          let next = gen.next();

          if (next.done) {
            endJob();
          }
        }
      }, 35);
    });

  }
}

UIBase.register(LUTEditorWidget);

export class ColorBlendPreview extends Container {
  constructor() {
    super();

    this._last_update_hash = undefined;
    this._updateDigest = new util.HashDigest();

    this.image = undefined;
    this.canvas = document.createElement("canvas");
    this.g = this.canvas.getContext("2d");

    this.shadow.appendChild(this.canvas);
    this.showRaw = this.check(undefined, "Show Raw");
  }

  get width() {
    if (this.hasAttribute("width")) {
      return parsepx(this.getAttribute("width"));
    } else {
      return 200.0;
    }
  }

  set width(v) {
    this.setAttribute("width", "" + v);
    this.setCSS();
  }

  get height() {
    if (this.hasAttribute("height")) {
      return parsepx(this.getAttribute("height"));
    } else {
      return 20.0;
    }
  }

  set height(v) {
    this.setAttribute("height", "" + v);
    this.setCSS();
  }

  static define() {
    return {
      tagname: "color-preview-x"
    }
  }

  updateSize() {
    let dpi = UIBase.getDPI();

    let w = ~~(this.width*dpi);
    let h = ~~(this.height*dpi);

    let canvas = this.canvas;
    if (w === this.canvas.width || h === this.canvas.height) {
      return;
    }

    this.image = new ImageData(w, 1);

    this.canvas.width = w;
    this.canvas.height = 1;

    this.canvas.style["width"] = (w/dpi) + "px";
    this.canvas.style["height"] = (h/dpi) + "px";

    this.redraw();
  }

  saveData() {
    return Object.assign({
      showRaw: this.showRaw.checked
    }, super.saveData());
  }

  loadData(obj) {
    this.showRaw.checked = !!obj.showRaw;

    return super.loadData(obj);
  }

  setCSS() {
    this.updateSize();
  }

  redraw() {
    let brush = this.ctx.api.getValue(this.ctx, this.getAttribute("datapath"));
    let c1 = brush.color;
    let c2 = brush.color2;

    if (brush.channels.get("color").flag & BrushChannelFlags.INHERIT) {
      c1 = this.ctx.defaults.get("color").getValue();
    }

    if (brush.channels.get("color2").flag & BrushChannelFlags.INHERIT) {
      c2 = this.ctx.defaults.get("color2").getValue();
    }

    let c = new Vector4();
    let canvas = this.canvas;
    let image = this.image, idata = image.data;
    let t = 0.0, dt = 1.0/(image.width - 1);

    let colors = [c1, c2];
    let ws = [0, 0];

    let mixFunc;

    let bilinear = true;
    if (this.ctx.canvas) {
      bilinear = this.ctx.canvas.triLinearSample;
    }

    switch (brush.mixMode) {
      case BrushMixModes.PIGMENT:
        mixFunc = Pigment.mixRGB;
        break;
      case BrushMixModes.SIMPLE:
        mixFunc = Pigment.mixRGB_Simple;
        break;
      case BrushMixModes.CMYK_HSV:
        mixFunc = Pigment.mixRGB_CMYK;
        break;
      case BrushMixModes.HSV:
        mixFunc = Pigment.mixRGB_HSV;
        break;
      case BrushMixModes.YUV:
        mixFunc = Pigment.mixRGB_YUV;
        break;
      case BrushMixModes.TEST:
        mixFunc = Pigment.mixRGB_Test;
        break;
    }

    const doRaw = this.showRaw.checked;

    for (let i = 0; i < image.width; i++, t += dt) {
      c.load(c1).interp(c2, t)

      ws[0] = 1.0 - t;
      ws[1] = t;

      let d = mixFunc(brush.pigments, colors, ws, undefined, bilinear, !doRaw);
      c.loadXYZ(d[0], d[1], d[2]);

      idata[i*4] = c[0]*255;
      idata[i*4 + 1] = c[1]*255;
      idata[i*4 + 2] = c[2]*255;
      idata[i*4 + 3] = c[3]*255;
    }

    this.g.putImageData(image, 0, 0);
  }

  update() {
    super.update();

    this.updateSize();
    this.updateDataPath();
  }

  updateDataPath() {
    let brush = this.ctx.api.getValue(this.ctx, this.getAttribute("datapath"));

    let digest = this._updateDigest.reset();
    digest.add(this.ctx.unified.color.getValue());
    digest.add(this.ctx.unified.color2.getValue());

    digest.add(brush.channels.get("color").flag);
    digest.add(brush.channels.get("color2").flag);
    digest.add(brush.mixMode);
    digest.add(this.ctx.pigments.updateGen);
    digest.add(this.showRaw.checked);

    if (this.ctx.canvas) {
      digest.add(this.ctx.canvas.triLinearSample);
    }

    let hash = digest.get();

    if (hash !== this._last_update_hash) {
      this._last_update_hash = hash;
      this.redraw();
    }
  }
}

UIBase.register(ColorBlendPreview);

export class BrushDynamicsWidget extends Container {
  constructor() {
    super();

    this.needsRebuild = true;
    this._last_update_key = undefined;
    this.titleframes = [];
  }

  static define() {
    return {
      tagname: "brush-channel-dynamics-x"
    }
  }

  rebuild() {
    let visible = this.isConnected && !this.hidden;

    let p = this.parentWidget;
    while (p) {
      if (p instanceof PanelFrame && p.closed) {
        visible = false;
        break;
      }

      p = p.parentWidget;
    }

    if (!visible) {
      return;
    }

    this.needsRebuild = false;

    let uidata = saveUIData(this, "brush dynamics");

    this.clear();

    let path = this.getAttribute("datapath");
    let ch = this.getPathValue(this.ctx, path);
    let sharedPath = `defaults.channels['${ch.name}']`;
    let inherit = ch.flag & BrushChannelFlags.INHERIT;
    let inheritDynamics = ch.flag & BrushChannelFlags.INHERIT_DYNAMICS;

    if (inheritDynamics) {
      path = sharedPath;
    }

    for (let dyn of ch.dynamics) {
      let path2 = `${path}.dynamics['${dyn.name}']`;
      let row = this.row();

      let panel2 = this.panel(dyn.name);
      panel2.closed = true;

      panel2.titleframe.useIcons(true);
      let icon = panel2.titleframe.prop(path2 + ".flag[ENABLED]");

      this.titleframes.push(panel2.titleframe);

      icon._icon = Icons.LARGE_UNCHECKED;
      icon._icon_pressed = Icons.LARGE_CHECK;

      panel2.curve1d(path2 + ".curve");
      panel2.prop(path2 + ".factor");
      panel2.prop(path2 + ".scale");
      panel2.prop(path2 + ".flag[PERIODIC]");
      panel2.prop(path2 + ".periodFunc");
    }

    loadUIData(this, uidata);
  }

  update() {
    if (!this.ctx) {
      return;
    }

    super.update();

    if (this.needsRebuild) {
      this.rebuild();
    }
  }

  setCSS() {
    super.setCSS();
    this.noMarginsOrPadding();
  }
}
UIBase.register(BrushDynamicsWidget);

export class BrushChannelWidget extends Container {
  constructor() {
    super();

    this.needsRebuild = true;
    this._last_update_key = undefined;
    this.titleframes = [];
  }

  static define() {
    return {
      tagname: "brush-channel-widget-x"
    }
  }

  rebuild() {
    if (haveModal()) {
      return;
    }

    let time = util.time_ms();

    //console.log("Brush channel widget rebuild");
    this.needsRebuild = false;

    this.titleframes = [];

    /* Save panel layout, scroll, etc. */
    let uidata = saveUIData(this, "brush channel widget");

    this.clear();

    let ch = this.getChannel();
    let path = this.getAttribute("datapath");
    if (!ch) {
      return;
    }

    let sharedPath = `defaults.channels['${ch.name}']`;
    let inherit = ch.flag & BrushChannelFlags.INHERIT;
    let inheritDynamics = ch.flag & BrushChannelFlags.INHERIT_DYNAMICS;

    let valuePath = inherit ? sharedPath : path;
    valuePath += ".value";

    let con = this.row();

    this.noMarginsOrPadding();
    con.noMarginsOrPadding();

    con.overrideClassDefault("panel", "TitleBackground", "transparent");
    con.overrideClassDefault("panel", "TitleBorder", "transparent");
    con.overrideClassDefault("panel", "background-color", "transparent");
    con.overrideClassDefault("panel", "border-color", "transparent");
    con.overrideClassDefault("panel", "margin-top", 1);
    con.overrideClassDefault("panel", "margin-bottom", 1);
    con.overrideClassDefault("panel", "padding-top", 1);
    con.overrideClassDefault("panel", "padding-bottom", 1);

    let panel = con.panel("");
    let row = panel.titleframe;

    this.titleframes.push(row);

    row.overrideClassDefault("numslider", "labelOnTop", false);
    row.overrideClassDefault("numslider_textbox", "labelOnTop", false);
    row.overrideClassDefault("numslider_simple", "labelOnTop", false);

    row.useIcons(true);
    row.prop(path + ".dynamics['pressure'].flag[ENABLED]").iconsheet = 0;

    if (1 || cconst.simpleNumSliders) {
      row.prop(valuePath);
    } else {
      row.slider(valuePath, {
        packflag: PackFlags.NO_NUMSLIDER_TEXTBOX
      });
    }

    panel.iconcheck.remove();
    panel.titleframe.add(panel.iconcheck);

    row = panel.row();
    row.useIcons(true);
    row.prop(`${path}.flag[INHERIT]`);
    row.prop(`${path}.flag[INHERIT_DYNAMICS]`);

    let dynwidget = UIBase.createElement("brush-channel-dynamics-x");
    dynwidget.setAttribute("datapath", this.getAttribute("datapath"));

    panel.closed = true;
    panel.add(dynwidget);

    //console.log("time1", (util.time_ms() - time).toFixed(2) + "ms");

    /* Restore old layout */
    loadUIData(this, uidata);

    for (let titleframe of this.titleframes) {
      titleframe.flushSetCSS();
    }

    this.flushSetCSS();

    for (let i = 0; i < 2; i++) {
      this.flushUpdate();

      for (let titleframe of this.titleframes) {
        titleframe.flushUpdate(true);
      }
    }

    //console.log("time2", (util.time_ms() - time).toFixed(2) + "ms");
  }

  getChannel() {
    if (!this.ctx) {
      return undefined;
    }

    return this.getPathValue(this.ctx, this.getAttribute("datapath"));
  }

  updateDataPath() {
    let ch = this.getChannel();

    let key = "";

    if (ch) {
      key = "" + ch.name + ":" + ch.flag + ":" + cconst.simpleNumSliders;
    }

    if (key !== this._last_update_key) {
      this._last_update_key = key;
      this.needsRebuild = true;
    }
  }

  update() {
    if (!this.ctx) {
      return;
    }

    super.update();

    this.updateDataPath();

    if (this.needsRebuild) {
      this.rebuild();
    }

    /* Ensure labels are up to date on closed panels */
    for (let titleframe of this.titleframes) {
      titleframe.flushUpdate(true);
    }
  }
}

UIBase.register(BrushChannelWidget);
