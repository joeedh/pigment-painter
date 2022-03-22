import {simple, util, nstructjs, Vector4} from '../path.ux/pathux.js';
import {set} from '../path.ux/scripts/path-controller/util/util.js';
import {appLocalStorage} from './localStorage.js';

export const thumbcache = new Map();

export const palettes = [];
window.palettes = palettes;

export const defaultPalette = [[1, 1, 0, 1], [0.11067426517090517, 0.2945593189773162, 0.5118140424002338, 1],
                                [0, 0.28849427889933654, 1, 1], [0.05132678546736713, 1, 0, 1],
                                [0.5869640291012939, 0.06070299505939458, 0.3596941183337242, 1], [0.6, 0, 0.2, 1],
                                [1, 1, 1, 1], [0, 0, 0, 1], [1, 0.36637297773783195, 0, 1],
                                [0.18205117771768164, 0.678610198884452, 1, 1],
                                [1, 0.18205117771768164, 0.9073479202048439, 1],
                                [0.3263561402382396, 0.8343480257340842, 0, 1],
                                [0.5068207843137255, 0.5372498039215687, 0, 1],
                                [0, 0.870131593185563, 0.9852198616195037, 1],
                                [0.9852198616195037, 0, 0.4969693107284223, 1],
                                [0.45295638522164244, 0, 0.2284824244038374, 1]];


export class Palette extends Array {
  constructor(name = "Palette") {
    super();

    this.name = name;
  }

  static defineAPI(api, st) {
    st.curve1d()

    class dummy {

    }

    let cst = api.mapStruct(dummy, true);
    cst.color4("", "color", "Color").on("change", function () {
      savePalettes();
    });

    st.list("", "colors", {
      get(api, list, key) {
        return list[key];
      },
      getKey(api, list, obj) {
        return list.indexOf(obj);
      },
      getStruct(api, list, key) {
        return cst;
      },
      getLength(api, list) {
        return list.length;
      },
      getIter(api, list) {
        return list[Symbol.iterator]();
      }
    })
  }

  push(color) {
    color = new Vector4(color);

    for (let i = 0; i < color.length; i++) {
      if (isNaN(color[i])) {
        color[i] = i === 3 ? 1.0 : 0.0;
      }
    }

    super.push(color);
  }

  save() {
    savePalette(this);
  }
}

Palette.STRUCT = `
Palette {
  name : string;
  this : array(vec4);
}
`;

simple.DataModel.register(Palette);


export function savePalettes() {
  for (let p of palettes) {
    savePalette(p);
  }
}

function getKey(p) {
  return "_ppain_palette_" + p.name;
}

export function savePalette(p) {
  let key = getKey(p);

  //ensure palette is in cache list
  if (palettes.indexOf(p) < 0) {
    palettes.push(p);
  }

  //console.log("saving palette", p);

  //ensure palette is in localstorage directory
  let dir = getDirectory();
  let ok = false;
  for (let p of dir) {
    if (p.key === key) {
      ok = true;
      break;
    }
  }

  if (!ok) {
    dir.push({
      name: p.name,
      key : key
    });

    setDirectory(dir);
  }

  let istruct = new nstructjs.STRUCT();
  istruct.registerGraph(nstructjs.manager, Palette);

  let json = {
    schema: nstructjs.write_scripts(istruct),
    data  : nstructjs.writeJSON(p)
  };

  appLocalStorage[key] = JSON.stringify(json);
}

export function loadPalette(key) {
  let json = appLocalStorage[key];

  console.log("loading palettes");

  if (!json) {
    console.error("Failed to find palette json for key " + key);
    return;
  }

  json = JSON.parse(json);
  let istruct = new nstructjs.STRUCT();
  istruct.parse_structs(json.schema);

  let p = istruct.readJSON(json.data, Palette);
  palettes.push(p);
}

function getDirectory() {
  let directory = appLocalStorage["_ppaint_palettes"];

  if (!directory) {
    if (palettes.length === 0) {
      let pal = new Palette();

      for (let color of defaultPalette) {
        pal.push(color);
      }

      palettes.push(pal);
      savePalette(pal);

      return getDirectory();
    } else {
      return [];
    }
  } else {
    directory = JSON.parse(directory);
  }

  return directory;
}

function setDirectory(dir) {
  appLocalStorage["_ppaint_palettes"] = JSON.stringify(dir);
}

export function loadPalettes() {
  let directory = getDirectory();
  palettes.length = 0;

  for (let p of directory) {
    loadPalette(p.key);
  }
}

export function getPalette(name) {
  for (let p of palettes) {
    if (p.name === name) {
      return p;
    }
  }

  let dir = getDirectory();
  for (let p of dir) {
    if (p.name === name) {
      loadPalette(p.key);
      return getPalette(name);
    }
  }
}

loadPalettes();
if (palettes.length === 0) {
  let pal = new Palette();
  savePalette(pal);
}

window._getPalette = getPalette;