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
    this.undoTileSize = 256;
  }

  _getCanvas(ctx) {
    let image = ctx.canvas.image;
    let canvas, g;

    if (ctx.canvasEditor) {
      canvas = ctx.canvasEditor.canvas;
      g = ctx.canvasEditor.g;
    } else {
      canvas = document.createElement("canvas");
      g = canvas.getContext("2d");

      canvas.width = image.width;
      canvas.height = image.height;

      g.putImageData(image, 0, 0);
    }

    return {canvas, g};
  }

  undoCheck(ctx, x, y, radius) {
    let x1 = Math.floor(x - radius - 4.0);
    let y1 = Math.floor(y - radius - 4.0);
    let x2 = Math.floor(x + radius + 4.0);
    let y2 = Math.floor(y + radius + 4.0);

    for (let tx=x1; tx<=x2; tx++) {
      for (let ty=y1; ty<=y2; ty++) {
        this.undoCheckTile(ctx, tx, ty);
      }
    }
  }

  undoCheckTile(ctx, x, y) {
    let {canvas, g} = this._getCanvas(ctx);

    let image = ctx.canvas.image;
    let width = image.width;
    let height = image.height;

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

    if (tw === 0.0 || th === 0.0) {
      return;
    }

    let tile = {
      x, y, w: tw, h: th,
      data   : g.getImageData(x, y, tilesize, tilesize)
    };

    this.undoTiles.set(key, tile);
  }

  undo(ctx) {
    let {canvas, g} = this._getCanvas(ctx);
    let image = ctx.canvas.image;

    console.log("undo!");

    for (let tile of this.undoTiles.values()) {
      let {x, y, w, h, data} = tile;

      console.log("undo tile!", x, y, data);
      g.putImageData(data, x, y);
    }

    ctx.canvas.image = g.getImageData(0, 0, image.width, image.height);
    window.redraw_all();
  }

  execPost(ctx) {
    window.redraw_all();
  }
}
