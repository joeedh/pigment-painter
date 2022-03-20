import {ImageProperty, LayerGraph, OutputNode, SlotTypes} from './layers_base.js';
import {
  BoolProperty, FloatProperty, IntProperty, Vec2Property, Vec3Property, Vec4Property
} from '../path.ux/scripts/pathux.js';

let propTypeMap = new Map();
propTypeMap.set(Vec4Property, "vec4");
propTypeMap.set(Vec3Property, "vec3");
propTypeMap.set(Vec2Property, "vec2");
propTypeMap.set(FloatProperty, "float");
propTypeMap.set(IntProperty, "int");
propTypeMap.set(BoolProperty, "bool");

export class ShaderGenerator {
  constructor(graph) {
    this.graph = graph;

    //create flattened node list

    graph.sort(true);

    //filter out subgraph nodes
    this.nodes = graph.sortlist.filter(f => !(f instanceof LayerGraph));

    graph.flagResort();

    this.slotNameMap = new Map();
    this.fboNameMap = new Map();
    this.fboidgen = 0;
  }

  _getSlotName(slot) {
    if (this.slotNameMap.has(slot)) {
      return this.slotNameMap.get(slot);
    }

    let name = slot.name.replace(/[ \t:\-]/g, '_');

    return `_slot_` + name + "_" + slot.id;
  }

  _slotFBO(slot) {
    let data = slot.prop.data;

    let name = this.fboNameMap.get(data.fbo);
    if (name) {
      this.slotNameMap.set(slot, name);
      return name;
    }

    name = `_fbo_` + (this.fboidgen++);

    this.slotNameMap.set(slot, name);
    this.fboNameMap.set(data.fbo, name);

    return name;
  }

  coerce(dest, source) {
    let type1, type2;

    /* case of image property with fbo data is handled
       in _getSlotData, so we only have to worry about
       fixedColor */
    if (dest.prop instanceof ImageProperty) {
      type1 = "vec4";
    } else {
      type1 = propTypeMap.get(dest.prop.constructor);
    }

    if (source.porp instanceof ImageProperty) {
      type2 = "vec4";
    } else {
      type2 = propTypeMap.get(dest.prop.constructor);
    }

    let data = this._getSlotData(dest);
    return `${type2}_to_${type1}(${data})`;
  }

  _getSlotUniform(slot) {
    return this._getSlotName(slot);
  }

  _getSlotData(slot) {
    if (slot.prop instanceof ImageProperty && slot.prop.data.fbo && slot.type === SlotTypes.INPUT) {
      return `texture(${this._slotFBO(slot)}, vUv)`;
    }

    if (slot.type === SlotTypes.INPUT && slot.edges.length > 0) {
      return this.coerce(slot, slot.edges[0]);
    }

    if (slot.type === SlotTypes.OUTPUT) {
      return this._getSlotName(slot);
    }

    return this._getSlotUniform(slot);

    return; //use uniforms
    if (slot.prop instanceof ImageProperty) {
      let c = slot.prop.fixedColor;
      return `vec4(${c[0]}, ${c[1]}, ${c[2]}, ${c[3]})`;
    } else if (slot.prop instanceof Vec4Property) {
      let c = slot.prop.getValue();
      return `vec4(${c[0]}, ${c[1]}, ${c[2]}, ${c[3]})`;
    } else if (slot.prop instanceof Vec3Property) {
      let c = slot.prop.getValue();
      return `vec3(${c[0]}, ${c[1]}, ${c[2]}, ${c[3]})`;
    } else if (slot.prop instanceof Vec2Property) {
      let c = slot.prop.getValue();
      return `vec2(${c[0]}, ${c[1]}, ${c[2]}, ${c[3]})`;
    } else if (slot.prop instanceof FloatProperty) {
      let c = slot.prop.getValue();
      let f = c.getValue();

      if (f.search(/\./) < 0) {
        f += ".0";
      }

      return "" + f;
    }
  }

  slot(slot) {
    if (slot.prop instanceof ImageProperty && slot.prop.data.fbo && slot.type === SlotTypes.INPUT) {
      return `texture(${this._slotFBO(slot)}, vUv)`;
    }

    if (slot.type === SlotTypes.OUTPUT) {
      return this._getSlotName(slot);
    }

    this._getSlotData(slot);
  }

  generate() {
    let s = '';

    let uniforms = '';

    for (let node of this.inputs) {
      let slot = this.inputs[node];

      if (slot.edges !== 0) {
        continue;
      }

      let type = slot.prop.constructor;
      let name = this._getSlotUniform(slot);

      if (!type) {
        console.warn("Unknown type for slot", slot.prop, slot);
        continue;
      }

      if (type) {
        uniforms += `uniform ${type} ${name};\n`;
      }
    }

    uniforms += "\n";

    for (let [fbo, name] of this.fboNameMap) {
      uniforms += `uniform sampler2D ${name};\n`;
    }

    for (let node of this.nodes) {
      for (let k in node.outputs) {
        let slot = node.outputs[k];

        /* fbo slots are handled more directly */
        if (slot.prop instanceof ImageProperty && slot.prop.data.fbo) {
          continue;
        }

        let name = this._getSlotName(slot);
        let type = propTypeMap.get(slot.prop.constructor);
        if (!type) {
          console.warn("Unknown slot type for " + slot.prop.constructor, slot, slot.prop);
          continue;
        }

        s += `  ${type} ${name};`;
      }

      s += node.data.genCode() + "\n";
    }

    s = `#version 300 es
precision highp float;

${uniforms}

out vec4 fragColor;

void main() {
  ${s}
}
    `;
    return s;
  }
}