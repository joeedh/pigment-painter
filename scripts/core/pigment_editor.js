import {
  util, nstructjs, UIBase,
  Container, saveUIData, loadUIData,
  Vector2, Vector3, Vector4, Matrix4
} from '../path.ux/pathux.js';
import {lightFreqRange, lightWaveLengths, Pigment, PigmentWavelet} from './colormodel.js';

export class PigmentEditor extends Container {
  constructor() {
    super();

    this.label("Pigment");

    this.solving = false;
    this.solve_i = 0;
    this.solveTimer = undefined;

    this.width = 300;
    this.height = 300;

    this.canvas = document.createElement("canvas");
    this.g = this.canvas.getContext("2d");

    this._last_update_hash = undefined;
    this._last_rebuild_key = undefined;
    this.shadow.appendChild(this.canvas);

    this.animReq = undefined;
    this.rgbLabel = [
      this.label(""), this.label(""), this.label("")
    ];

    /*
    let button = this.button("Solve", () => {
      let stop = () => {
        if (this.solving) {
          window.clearInterval(this.solveTimer);
          this.solving = false;
          this.step_i = 0;
          button.name = "Solve";
        }
      }

      if (this.solving) {
        stop();

        return;
      }

      button.name = "Stop";

      let i = this.ctx.brush.pigments.indexOf(this.getPigment());

      let color;
      switch (i) {
        case 0:
          color = new Vector3([0.0, 0.2, 0.6]);
          break;
        case 1:
          color = new Vector3([0.65, 0.0, 0.2]);
          break;
        case 2:
          color = new Vector3([1.0, 1.0, 0.0]);
          break;
        case 3:
          color = new Vector3([0.98, 0.98, 0.98]);
          break;
      }

      let rgb = new Vector3(color);
      console.log(rgb);

      this.step_i = 0;
      this.solving = true;
      this.solveTimer = window.setInterval(() => {
        let time = util.time_ms();

        let pigment = this.getPigment();
        if (!pigment) {
          return;
        }

        while (util.time_ms() - time < 50) {
          try {
            pigment.findClosestRGB_intern(rgb, this.step_i);
          } catch (error) {
            console.error(error.stack);
            console.error(error.message);

            stop();
            break;
          }
          this.step_i++;
        }
      }, 75);
    });

    let row;

    row = this.row();
    row.button("Reset", () => {
      this.getPigment().reset();
    });
    row.button("Randomize", () => {
      this.getPigment().reset().randomize(100);
    });

    row = this.row();
    row.button("S-", () => {
      this.getPigment().scaleS(0.9);
      this.flagRedraw();
    });
    row.button("S+", () => {
      this.getPigment().scaleS(1.1);
      this.flagRedraw();
    });

    row = this.row();
    row.button("K-", () => {
      this.getPigment().scaleK(0.9);
      this.flagRedraw();
    });
    row.button("K+", () => {
      this.getPigment().scaleK(1.1);
      this.flagRedraw();
    });*/

    this.spanel = this.kpanel = undefined;

    this.pigmentDropbox = undefined;
    this.needRebuild = true;
  }

  static define() {
    return {
      tagname: "pigment-editor-x",
      style  : "pigment-editor"
    }
  }

  on_remove() {
    super.on_remove();

    if (this.solver) {
      window.clearInterval(this.solveTimer);
    }
  }

  flagRedraw() {
    if (this.animReq !== undefined) {
      return;
    }

    this.animReq = requestAnimationFrame(this.draw.bind(this));
  }

  draw() {
    if (!this.ctx) {
      return;
    }

    this.animReq = undefined;

    let g = this.g;
    let canvas = this.canvas;

    let dpi = UIBase.getDPI();
    let w = ~~(this.width*dpi);
    let h = ~~(this.height*dpi);

    canvas.width = w;
    canvas.height = h;

    g.beginPath();
    g.rect(1, 1, w - 2, h - 2);
    g.stroke();

    let pigment = this.getPigment();
    console.log(pigment);

    let steps = 128;

    g.beginPath();
    let colors = ["red", "green", "black"];

    let rgb = pigment.toRGB();

    this.rgbLabel[0].text = "r:" + rgb[0].toFixed(5);
    this.rgbLabel[1].text = "g:" + rgb[1].toFixed(5);
    this.rgbLabel[2].text = "b:" + rgb[2].toFixed(5);

    pigment.checkTables();

    for (let step = 0; step < 3; step++) {
      let frange = lightWaveLengths;
      let f = frange[0], df = (frange[1] - frange[0])/(steps - 1);
      let dx = canvas.width/steps;

      g.beginPath();

      for (let i = 0; i < steps; i++, f += df) {
        let x, y;

        x = i*dx;

        switch (step) {
          case 0:
            y = pigment.S(f);
            break;
          case 1:
            y = pigment.K(f);
            break;
          case 2:
            y = pigment.R(f);
            break;
        }

        y *= canvas.height*0.1;
        y = canvas.height - y - 50;

        if (!i) {
          g.moveTo(x, y);
        } else {
          g.lineTo(x, y);
        }
      }

      g.lineWidth = 1.0;
      g.strokeStyle = colors[step];
      g.stroke();
    }

  }

  getPigment() {
    return this.ctx.api.getValue(this.ctx, this.getAttribute("datapath"));
  }

  init() {
    super.init();

    this.rebuild();
    this.flagRedraw();
  }

  rebuild() {
    if (!this.getPigment()) {
      return
    }

    this.needRebuild = false;

    let data = saveUIData(this, "pigments");

    let path = this.getAttribute("datapath");

    if (!this.pigmentDropbox) {
      this.pigmentDropbox = this.prop(path + ".pigment");
      //this.prop(path + ".useWavelets");
    } else {
      this.pigmentDropbox.setAttribute("datapath", path + ".pigment");
    }

    /*
    if (!this.spanel) {
      this.spanel = this.panel("S");
      this.kpanel = this.panel("K");

      this.spanel.closed = true;
      this.kpanel.closed = true;
    }

    let pigment = this.getPigment();
    let panels = [this.spanel, this.kpanel];
    let lists = [pigment.s_wavelets, pigment.k_wavelets];

    let makeAddButton = (panel, i) => {
      panel.button("+", () => {
        let pigment = this.getPigment();

        let list = i ? pigment.k_wavelets : pigment.s_wavelets;

        list.push(new PigmentWavelet());
      });
    }

    let makeRemButton = (panel, i) => {
      panel.button("-", () => {
        let pigment = this.getPigment();

        let list = i ? pigment.k_wavelets : pigment.s_wavelets;

        if (list.length > 1) {
          list.pop();
        }
      });
    }

    for (let i = 0; i < 2; i++) {
      let panel = panels[i];
      let list = lists[i];

      panel.closed = false;
      panel.contents.clear();

      let tabs = panel.tabs("top");

      let name = i ? "k_wavelets" : "s_wavelets";

      let j = 0;

      for (let w of list) {
        let tab = tabs.tab("" + (j + 1));

        let path2 = path + `.${name}[${j}]`;

        tab.prop(path2 + ".t");
        tab.prop(path2 + ".mag");
        tab.prop(path2 + ".decay");
        tab.prop(path2 + ".exp");
        tab.prop(path2 + ".offy");

        j++;
      }

      let row = panel.row();
      makeAddButton(row, i);
      makeRemButton(row, i);

      panel.prop(this.getAttribute("datapath") + ".randfac");
    }
    */

    loadUIData(this, data);

    for (let i = 0; i < 3; i++) {
      this.flushSetCSS();
      this.flushUpdate();
    }
  }

  update() {
    super.update();

    if (!this.ctx) {
      return;
    }

    let pigment = this.getPigment();

    if (!pigment) {
      return;
    }

    let hash = pigment.hash();
    if (hash !== this._last_update_hash) {
      this._last_update_hash = hash;
      console.log("hash", hash);
      this.flagRedraw();
    }

    let key = "" + pigment.s_wavelets.length + ":" + pigment.k_wavelets.length;
    if (key !== this._last_rebuild_key) {
      this._last_rebuild_key = key;
      this.needRebuild = true;
    }

    if (this.needRebuild) {
      this.rebuild();
    }

  }

  setCSS() {
    super.setCSS();

    let dpi = UIBase.getDPI();
    let w = ~~(this.width*dpi);
    let h = ~~(this.height*dpi);

    this.canvas.width = w;
    this.canvas.height = h;
    this.canvas.style["width"] = (w/dpi) + "px";
    this.canvas.style["height"] = (h/dpi) + "px";
  }
}

UIBase.register(PigmentEditor);

