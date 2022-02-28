import {
  Vector2, Vector3, Vector4, Matrix4, Quat,
  util, nstructjs, simple, UIBase, FloatProperty,
  Vec2Property, Vec3Property, Vec4Property,
  Mat4Property, PropSubTypes
} from '../path.ux/scripts/pathux.js';
import {Icons} from '../core/icon_enum.js';

export const CommandClasses = [];

export const OverrideFlags = {
  OVERRIDE: 1
};

export const CommandFlags = {
  HAS_OWN_ALPHA: 1
};

export class ChannelOverride {
  constructor(channelName) {
    this.name = channelName;
    this.flag = 0;
    this.value = 1.0;
    this.color = [1, 1, 1, 1];

    this.prop = new FloatProperty();
  }

  static defineAPI(api, st) {
    st.flags("flag", "flag", OverrideFlags, "Flag");
    st.float("value", "value", "Value")
      .noUnits()
      .uiNameGetter(function () {
        return this.dataref.name;
      })
      .customPropCallback(function (prop) {
        if (this.dataref.prop.constructor === FloatProperty) {
          this.dataref.prop.copyTo(prop);
        } else {
          console.warn("Non-float brush channel " + this.dataref.name);
        }
      })

    st.color4("color", "color", "Color")
      .uiNameGetter(function () {
        return this.dataref.name;
      })
      .customPropCallback(function (prop) {
        if (this.dataref.prop instanceof Vec4Property) {
          this.dataref.prop.copyTo(prop);
          prop.subtype = PropSubTypes.COLOR;
        } else {
          console.warn("Non-color brush channel ", this.dataref.prop);
        }
      });
  }

  syncChannel(ch) {
    if (this.prop.constructor === ch.prop.constructor) {
      ch.prop.copyTo(this.prop);
    } else {
      this.prop = ch.prop.copy();
    }
  }
}

ChannelOverride.STRUCT = `
ChannelOverride {
  name     : string;
  flag     : int;
  value    : float;
  color    : vec4;
  prop     : abstract(ToolProperty);
}
`;
simple.DataModel.register(ChannelOverride);

export class BrushCommand {
  constructor() {
    this.id = -1;

    this.overrides = new Map();
    this.uniforms = {};

    let def = this.constructor.brushDefine();

    this.defines = Object.assign({}, def.defines);

    for (let k in def.uniforms) {
      let prop = def.uniforms[k].copy();
      this.uniforms[k] = prop;

      prop.apiname = k;
      prop.uiname = ToolProperty.makeUIName(k);
    }

    this.flag = 0;
  }

  static brushDefine() {
    throw new Error("implement me!");
    return {
      typeName   : "",
      uiName     : "",
      icon       : -1,
      description: "",
      flag       : 0,
      uniforms   : {
        fprop: new FloatProperty()
      },
      defines    : {},
      libraryCode: '',
    }
  }

  static register(cls) {
    CommandClasses.push(cls);
    simple.DataModel.register(cls);
  }

  static getClass(typeName) {
    for (let cls of CommandClasses) {
      if (cls.brushDefine().typeName === typeName) {
        return cls;
      }
    }
  }

  static defineAPI(api, st) {
    st.string("typeName", "typeName", "Type")
      .customGet(function () {
        return this.dataref.constructor.brushDefine().typeName;
      })
      .readOnly();

    st.list("overrides", "overrides", {
      get(api, list, key) {
        return list.get(key);
      },
      getKey(api, list, obj) {
        return obj.name;
      },
      getLength(api, list) {
        return list.size;
      },
      getIter(api, list) {
        return list.values()[Symbol.iterator]();
      }
    })
  }

  syncOverrides(brush) {
    for (let ch of brush.channels) {
      this.getOverride(ch).syncChannel(ch);
    }
  }

  getOverride(ch) {
    let ret = this.overrides.get(ch.name);

    if (!ret) {
      ret = new ChannelOverride(ch.name);
      ret.syncChannel(ch);
      this.overrides.set(ch.name, ret);
    }

    return ret;
  }

  vertexGen() {
    return '';
  }

  fragmentGen(C, getChannel) {
    return `
    ${C} *= fprop$;
    `;
  }

  loadSTRUCT(reader) {
    reader(this);

    let overrides = new Map();

    for (let item of this.overrides) {
      overrides.set(item.name, item);
    }

    this.overrides = overrides;
    let uniforms = {}

    for (let prop of this.uniforms) {
      uniforms[prop.apiname] = prop;
    }

    this.uniforms = uniforms;
  }
}

BrushCommand.STRUCT = `
BrushCommand {
  flag         : int;
  id           : int;
  uniforms     : iterkeys(abstract(ToolProperty));
  overrides    : iter(ChannelOverride) | this.overrides.values();
}
`;
simple.DataModel.register(BrushCommand, "BrushCommand");

let uniformTypeMap = new Map();
uniformTypeMap.set(FloatProperty, "float");
uniformTypeMap.set(Vec2Property, "vec2");
uniformTypeMap.set(Vec3Property, "vec3");
uniformTypeMap.set(Vec4Property, "vec4");
uniformTypeMap.set(Mat4Property, "mat4");

export class BrushCommandStack {
  constructor() {
    this.commands = [];
    this.name = "Name";
    this.flag = 0;
    this.idgen = 0;

    this.updateGen = 0;
  }

  static defineAPI(api, st) {
    st.list("commands", "commands", {
      get(api, list, key) {
        return list[key];
      },

      getKey(api, list, obj) {
        return list.indexOf(obj);
      },

      getStruct(api, list, key) {
        return api.mapStruct(list[key].constructor);
      },

      getLength(api, list) {
        return list.length;
      },

      getIter(api, list) {
        return list[Symbol.iterator]();
      }
    });
  }

  loadShallow(b) {
    this.commands = b.commands;
    this.name = b.name;
    this.flag = b.flag;
    this.idgen = b.idgen;

    //do not copy b.updateGen!

    return this;
  }

  add(cmd) {
    cmd.id = this.idgen++;

    this.commands.push(cmd);
  }

  generate() {
    let lib = '';
    let uniformsDef = '';
    let uniforms = {};
    let defines = {};

    let overrideKey = (cmd, override) => {
      return "param_" + override.name + cmd.id;
    }

    for (let cmd of this.commands) {
      lib += "\n" + cmd.constructor.brushDefine().libraryCode + "\n";

      for (let k in cmd.uniforms) {
        let prop = cmd.uniforms[k];
        let name = prop.apiname + cmd.id;

        uniformsDef += "uniform " + uniformTypeMap.get(prop.constructor) + " " + name + ";\n"

        uniforms[name] = prop.getValue();
      }

      for (let override of cmd.overrides.values()) {
        let okey = overrideKey(cmd, override);
        uniformsDef += `float ${okey}\n`;

        uniforms[okey] = override.value;
      }

      for (let k in cmd.defines) {
        defines[k + cmd.id] = cmd.defines[k];
      }
    }

    let vertex = ``;
    let fragment = `

vec4 evalBrush(vec4 inColor, vec2 finaluv, float w) {    
  vec4 finalColor = inColor;
  
    `;

    for (let cmd of this.commands) {
      vertex += `{
${cmd.vertexGen()}
      }`;
    }

    for (let cmd of this.commands) {
      let getchannel = (k) => {
        let k2 = overrideKey(cmd, cmd.overrides.get(k));
        if (k2 === "light") {
          k2 = "vLighting";
        } else {
          k2 = "v" + k[0].toUpperCase() + k.slice(1, k.length);
        }

        let k3 = k + cmd.id;

        if (cmd.overrides.get(k).flag & OverrideFlags.OVERRIDE) {
          return k3;
        } else {
          return `(${k2}*${k3})`;
        }
      }

      let frag = cmd.fragmentGen("finalColor", getchannel);

      for (let sets of [cmd.uniforms, cmd.defines]) {
        for (let k in set) {
          let re = new RegExp(k + "\\$", "g");
          frag = frag.replace(re, k + cmd.id);
        }
      }

      fragment += `
{
   ${frag}
}
      `;
    }

    fragment += "  return finalColor;\n}\n";

    return {fragment, vertex, uniforms, uniformsDef, defines};
  }
}

BrushCommandStack.STRUCT = `
BrushCommandStack {
  name        : string; 
  commands    : array(abstract(BrushCommand));
  idgen       : int;
  flag        : int;
}
`;
simple.DataModel.register(BrushCommandStack);

export class DrawCommand extends BrushCommand {
  static brushDefine() {
    return {
      typeName: "draw",
      uiName  : "draw",
      icon    : Icons.BRUSH_DRAW,
    }
  }

  fragmentGen(C, ch) {
    return `
    
    vec4 a = ${C};
    vec4 b = texture(rgba, finaluv);
    
    ${C} = pigmentMix(a, b, ${ch("strength")});
    `;
  }
}

BrushCommand.register(DrawCommand);
