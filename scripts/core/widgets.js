import {
  nstructjs, util, Vector2, Vector3,
  Vector4, Matrix4, Quat, math, UIBase,
  Container, saveUIData, loadUIData, ToolOp, IntProperty, Vec4Property, EnumProperty, iconmanager, StringProperty
} from '../path.ux/scripts/pathux.js';
import {Icons} from './icon_enum.js';

import '../webgl/brush_webgl_ops.js';
import {presetManager} from './presets.js';
import {Brush, BrushTools} from './brush.js';

export const BrushIconCache = new Map();

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
