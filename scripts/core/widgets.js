import {
  nstructjs, util, Vector2, Vector3,
  Vector4, Matrix4, Quat, math, UIBase,
  Container, saveUIData, loadUIData, ToolOp, IntProperty
} from '../path.ux/scripts/pathux.js';
import {Icons} from './icon_enum.js';

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
        id : new IntProperty()
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
        id : new IntProperty()
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
