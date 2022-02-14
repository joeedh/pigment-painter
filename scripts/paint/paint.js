import {
  util, Vector2, Vector3, Vector4, Matrix4, Quat,
  nstructjs, math, ToolOp, ToolProperty, ToolFlags,
  PropFlags, PropTypes, eventWasTouch
} from '../path.ux/pathux.js';

export function getPressureIntern(e) {
  if (eventWasTouch(e) && e.touches.length > 0) {
    let t = e.touches[0];

    if (t.force !== undefined) {
      return t.force;
    } else {
      return t.pressure !== undefined ? t.pressure : 1.0;
    }

  }

  return 1.0;
}

export function getPressure(e) {
  let f = getPressureIntern(e);

  return f; //f*f;
}

export class StrokeProperty extends ToolProperty {
  constructor() {
    super(StrokeProperty.PROP_TYPE_ID);
    this.samples = [];
  }

  get length() {
    return this.samples.length;
  }

  push(ds) {
    this.samples.push(ds);
  }

  getValue() {
    return this.samples;
  }

  setValue(samples) {
    super.setValue(samples);
    this.samples = samples;
  }

  copyTo(b) {
    super.copyTo(b);

    b.samples = this.samples.map(f => f.copy());
  }

  [Symbol.iterator]() {
    return this.samples[Symbol.iterator]();
  }
}

StrokeProperty.STRUCT = nstructjs.inherit(StrokeProperty, ToolProperty) + `
  samples   : array(DotSample);
}`;
nstructjs.register(StrokeProperty);
ToolProperty.register(StrokeProperty);

export class ImageOp extends ToolOp {
  undoPre(ctx) {
    this.undoTiles = new Map();
    this.undoTileSize = 512;

    this.state = undefined;
  }

  onUndoDestroy() {
    console.error("undo destroy!");

    for (let tile of this.undoTiles.values()) {
      if (tile.data.destroy) {
        tile.data.destroy();
      }
    }
  }

  calcMemSize(ctx) {
    return this.calcUndoMem(ctx);
  }

  calcUndoMem(ctx) {
    let sum = 0;

    for (let tile of this.undoTiles.values()) {
      sum += tile.data.memSize;
    }

    return sum;
  }

  _getCanvas(ctx) {
    if (this.state) {
      return this.state;
    }

    let image = ctx.canvas.image;
    let canvas, g;

    let editor = this.modalRunning ? this.editor : undefined;

    if (editor) {
      canvas = editor.canvas;
      g = editor.g;
    } else if (image) {
      canvas = document.createElement("canvas");
      g = canvas.getContext("2d");

      canvas.width = image.width;
      canvas.height = image.height;

      g.putImageData(image, 0, 0);
    }

    this.state = {canvas, g};
    return this.state;
  }

  modalEnd(was_cancelled) {
    this.state = undefined;
    super.modalEnd(was_cancelled);
  }

  undoCheck(ctx, x, y, radius) {
    let tilesize = this.undoTileSize;

    let x1 = Math.floor((x - radius - 4.0)/tilesize + 0.0001);
    let y1 = Math.floor((y - radius - 4.0)/tilesize + 0.0001);
    let x2 = Math.ceil((x + radius + 4.0)/tilesize + 0.0001);
    let y2 = Math.ceil((y + radius + 4.0)/tilesize + 0.0001);

    x1 = Math.max(x1, 0);
    y1 = Math.max(y1, 0);

    for (let tx = x1; tx <= x2; tx++) {
      for (let ty = y1; ty <= y2; ty++) {
        this.undoCheckTile(ctx, tx*tilesize, ty*tilesize);
      }
    }
  }

  undoCheckTile(ctx, x, y) {
    let width = ctx.canvas.width;
    let height = ctx.canvas.height;

    x = ~~x;
    y = ~~y;
    x = Math.min(Math.max(x, 0), width - 1);
    y = Math.min(Math.max(y, 0), height - 1);

    let tilesize = this.undoTileSize;

    x = (~~(x/tilesize))*tilesize;
    y = (~~(y/tilesize))*tilesize;

    let key = y*width + x;

    if (this.undoTiles.has(key)) {
      return;
    }

    let tw = Math.min(x + tilesize, width) - x;
    let th = Math.min(y + tilesize, height) - y;
    //console.log(tw, th);

    if (tw === 0.0 || th === 0.0) {
      return;
    }

    let tile = {
      x, y, w: tw, h: th,
      data   : ctx.canvas.getImageBlock(x, y, tw, th)
    };

    this.undoTiles.set(key, tile);
  }

  undo(ctx) {
    let canvas = ctx.canvas;

    for (let tile of this.undoTiles.values()) {
      let {x, y, w, h, data} = tile;

      canvas.swapImageBlock(data);
    }

    window.redraw_all();
/*
    return;

    let {canvas, g} = this._getCanvas(ctx);
    let image = ctx.canvas.image;

    console.log("undo!");

    for (let tile of this.undoTiles.values()) {
      let {x, y, w, h, data} = tile;

      let old = g.getImageData(x, y, w, h);

      console.log("undo tile!", x, y, data);
      g.putImageData(data, x, y);

      tile.data = old;
    }

    if (ctx.canvas.image) {
      //ctx.canvas.image.data.set(g.getImageData(0, 0, image.width, image.height).data);
      //window.redraw_all([0, 0], [image.width, image.height]);
    }*/
  }

  redo(ctx) {
    this.undo(ctx);
  }

  execPost(ctx) {
    this.state = undefined;
    window.redraw_all();
  }
}
