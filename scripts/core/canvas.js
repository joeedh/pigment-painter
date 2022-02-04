import {simple, util, nstructjs, math, UIBase, Vector3, Vector4} from '../path.ux/scripts/pathux.js';
import './colormodel.js';
import {Pigment, PigmentSet} from './colormodel.js';

let soffs = new Array(2048);

export function getSearchOffs(n) {
  if (soffs[n]) {
    return soffs[n];
  }

  console.warn("Creating search offs of radius", n);

  let list = soffs[n] = [];

  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      let w = Math.sqrt(i*i + j*j)/Math.sqrt(n*n);

      if (w >= 1.0) {
        continue;
      }

      w = 1.0 - w;
      list.push(new Vector3([i, j, w]));
    }
  }

  return list;
}

let brush_hash = new util.HashDigest();

export const CanvasCommands = {
  SETBRUSH: 0,
  DOT     : 1,
};
export const CommandFormat = {
  [CanvasCommands.SETBRUSH]: {args: 7},
  [CanvasCommands.DOT]     : {args: 3}
}

let {SETBRUSH, DOT} = CanvasCommands;

export class Brush {
  constructor() {
    //this.color = new Vector4([0.2, 0.0, 0.6, 1.0]); //c
    this.color = new Vector4([0.6, 0.0, 0.2, 1.0]); //m
    //this.color = new Vector4([1.0, 1.0, 0.0, 1.0]); //y
    //this.color = new Vector4([1.0, 1.0, 0.0, 1.0]);

    this.strength = 0.5;
    this.radius = 5;
    this.spacing = 0.45;

    this.pigments = new PigmentSet();
    for (let i = 0; i < 4; i++) {
      this.pigments.push(new Pigment());
    }

    this.pigments[0].loadJSON({
      "name"  : "Pigment", "ks": [{
        "freq": 691.8100465846086, "decay": 162.4720426815786, "mag": 48.48074551520817, "exp": 2.342533814086252,
        "offy": 0.44881676450655095
      }], "ss": [{
        "freq": 340.55202664142365, "decay": 93.4148545605531, "mag": 95.37526397026298, "exp": 1.7487563495757958,
        "offy": 0.24820640410061184
      }]
    });

    this.pigments[1].loadJSON({
      "name"  : "Pigment", "ks": [{
        "freq": 717.2404819621054, "decay": 251.01355104181252, "mag": 41.54339824658726, "exp": 7.450289767879927,
        "offy": 15.833202813546713
      }], "ss": [{
        "freq": 303.23642874871797, "decay": 6.98836248855946, "mag": 1153.8590514972975, "exp": 0.5489184849132271,
        "offy": 2.703550921633522
      }, {
        "freq": 788.1198169478561, "decay": 201.2571872238481, "mag": 616.6078006292933, "exp": 8.52869282371732,
        "offy": 1.8496906070350854
      }]
    });

    this.pigments[2].loadJSON({
      "name"  : "Pigment", "ks": [{
        "freq": 351.63720305616187, "decay": 231.55578806204696, "mag": 230.03880907415194, "exp": 0.12657663979971753,
        "offy": 0.21390415423503775
      }], "ss": [{
        "freq": 557.5970908000044, "decay": 98.11635016636761, "mag": 204.73609236885557, "exp": 2.3510159009186036,
        "offy": 0.0006591617668402459
      }]
    });

    this.pigments[2].loadJSON({
      "name"  : "Pigment", "ks": [{
        "freq": 824.7049076205907, "decay": 19.796165824813453, "mag": 78.54067058866042, "exp": 0.25458359753064835,
        "offy": 6.851052206768374
      }], "ss": [{
        "freq": 558.865564895279, "decay": 91.22064172245169, "mag": 308.53208071211225, "exp": 1.7996867765679512,
        "offy": 1.0719804598385343
      }]
    });

    this.pigments[3].loadJSON({
      "name"  : "Pigment", "ks": [{
        "freq": 301.9085498649776, "decay": 58.706162351401666, "mag": 40.54896091094154, "exp": 0.9019133103126415,
        "offy": 0.14519603693828417
      }], "ss": [{
        "freq": 447.2867613224409, "decay": 101.81623108369593, "mag": 38.3634916901608, "exp": 2.5808665731941036,
        "offy": 0
      }, {
        "freq": 455.09814441235255, "decay": 87.0512751527589, "mag": 48.3228325660059, "exp": 4.833737190576224,
        "offy": 6.39927709785516
      }]
    });

    this.pigment = this.pigments[0];
  }

  static defineAPI(api, st) {
    st.color4("color", "color", "Color");
    st.float("radius", "radius", "Radius").noUnits().range(1, 512);
    st.float("strength", "strength", "Strength").noUnits().range(0.0, 1.0);
    st.float("spacing", "spacing", "Spacing").noUnits().range(0.005, 4.0);
    st.float("pigment", "pigment", "Pigment", api.mapStruct(Pigment, true));

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
    b.strength = this.strength;
    b.radius = this.radius;
    b.spacing = this.spacing;
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

    return digest.get();
  }

  loadSTRUCT(reader) {
    reader(this);

    if (!(this.pigments instanceof PigmentSet)) {
      let ps = new PigmentSet();

      for (let pigment of this.pigments) {
        ps.push(pigment);
      }

      this.pigments = ps;
    }

    this.pigment = this.pigments[0];
  }
}

Brush.STRUCT = `
Brush {
  radius   : float;
  strength : float;
  color    : vec4;
  pigments : PigmentSet;
}
`;
simple.DataModel.register(Brush);

export class Canvas {
  constructor(dimen = 512) {
    this.image = new ImageData(dimen, dimen);
    this.brush = new Brush();
    this.dimen = dimen;

    this._last_brush_hash = undefined;

    this.commands = [];

    let idata = this.image.data;
    for (let i = 0; i < idata.length; i++) {
      idata[i] = 255;
    }
  }

  static defineAPI(api, st) {
    st.struct("brush", "brush", "Brush", api.mapStruct(Brush, true));
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
      brush.strength, brush.radius, brush.spacing);
  }

  execDot(x1, y1, t) {
    let brush = this.brush;
    let hash = brush.hash()

    if (hash !== this._last_brush_hash) {
      this._last_brush_hash = hash;
      this.pushSetBrush();
    }

    this.pushCommand(DOT, x1, y1, t);

    this.execDotIntern(x1, y1, t, brush);
  }

  execDotIntern(x1, y1, t, brush) {
    let dpi = UIBase.getDPI();

    let radius = Math.max(~~(brush.radius*dpi), 1.0);
    let dimen = this.dimen;
    let idata = this.image.data;

    let c1 = new Vector4();
    let c2 = new Vector4();

    let w1 = brush.strength;
    let alphaw = w1*w1;

    let ps = brush.pigments;

    for (let p of ps) {
      p.checkTables();
    }

    ps.checkLUT();


    for (let off of getSearchOffs(radius)) {
      let x = ~~(x1 + off[0]);
      let y = ~~(y1 + off[1]);

      if (x < 0 || y < 0 || x >= dimen || y >= dimen) {
        continue;
      }

      let w = off[2];
      w = w*w*(3.0 - 2.0*w);
      w = w*w*(3.0 - 2.0*w);
      w *= w1;

      let idx = (y*dimen + x)*4;

      c1[0] = idata[idx]/255.0;
      c1[1] = idata[idx + 1]/255.0;
      c1[2] = idata[idx + 2]/255.0;
      c1[3] = idata[idx + 3]/255.0;

      c2.load(brush.color);

      let ws1 = ps.sampleLUT(c1[0], c1[1], c1[2]);
      let ws2 = ps.sampleLUT(c2[0], c2[1], c2[2]);

      let c1b = Pigment.toRGB(ps, ws1);
      let c2b = Pigment.toRGB(ps, ws2);

      c1b.sub(c1).negate();
      c2b.sub(c2).negate();
      c2b.interp(c1b, 1.0 - w);

      ws2.interp(ws1, 1.0 - w);

      let mul = ws2[0] + ws2[1] + ws2[2] + ws2[3];
      if (mul !== 0.0) {
        ws2.mulScalar(1.0/mul);
      }

      if (0) {
        ws2.zero();
        ws2[0] = w;
        ws2[2] = 1.0 - w;
        ws2[3] = 0.1;

        let mul = ws2[0] + ws2[1] + ws2[2] + ws2[3];
        ws2.mulScalar(1.0/mul);
      }

      let a = c2[3] + (c1[3] - c2[3])*(1.0 - w);
      c2.load(Pigment.toRGB(ps, ws2));
      c2[3] = a;

      for (let k = 0; k < 3; k++) {
        c2[k] += c2b[k];
        c2[k] = Math.min(Math.max(c2[k], 0.0), 1.0);
      }
      //c2.interp(c1, 1.0 - alphaw);

      idata[idx + 0] = c2[0]*255;
      idata[idx + 1] = c2[1]*255;
      idata[idx + 2] = c2[2]*255;
      idata[idx + 3] = c2[3]*255;
    }
  }

  reset() {
    let idata = this.image.data;
    for (let i = 0; i < idata.length; i++) {
      idata[i] = 255;
    }

    this.brush = new Brush();

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
          let t = cmds[j++];

          this.execDotIntern(x, y, t, brush);
          break;
        }
      }
    }
  }

  loadSTRUCT(reader) {
    reader(this);

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
  dimen    : int; 
  brush    : Brush;
  commands : array(float); 
}
`;
simple.DataModel.register(Canvas);
