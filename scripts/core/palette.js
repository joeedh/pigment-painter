import {simple, util, nstructjs, Vector4} from '../path.ux/pathux.js';
import {set} from '../path.ux/scripts/path-controller/util/util.js';

export const thumbcache = new Map();

export const palettes = [];
window.palettes = palettes;

export class Palette extends Array {
  constructor(name = "Palette") {
    super();

    this.name = name;
  }

  push(color) {
    color = new Vector4(color);

    for (let i=0; i<color.length; i++) {
      if (isNaN(color[i])) {
        color[i] = i === 3 ? 1.0 : 0.0;
      }
    }

    super.push(color);
  }

  save() {
    savePalette(this);
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

export function savePalette(p) {
  let key = "_ppain_palette_" + p.name;

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

  localStorage[key] = JSON.stringify(json);
}

export function loadPalette(key) {
  let json = localStorage[key];

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
  let directory = localStorage["_ppaint_palettes"];

  if (!directory) {
    directory = localStorage["_ppaint_palettes"] = "[]";
  }

  directory = JSON.parse(directory);
  return directory;
}

function setDirectory(dir) {
  localStorage["_ppaint_palettes"] = JSON.stringify(dir);
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
