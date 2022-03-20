import {
  nstructjs, util, FloatProperty, Vec4Property,
  PropSubTypes, BoolProperty, IntProperty, StringProperty,
  ToolProperty, EnumProperty, simple, Vector4
} from '../path.ux/scripts/pathux.js';

export const GraphFlags = {
  RESORT  : 1,
  SUBGRAPH: 2,
};

export class ImageProperty extends ToolProperty {
  constructor() {
    super();

    this.width = 0;
    this.height = 0;

    this.needsBytes = true;
    this.bytes = undefined;
    this.data = undefined;
    this.fixedColor = new Vector4();
  }

  copyTo(b) {
    super.copyTo(b);

    b.bytes = this.bytes;
    b.data = this.data;
    b.fixedColor.load(this.fixedColor);
  }

  getValue() {
    return this.data;
  }

  setValue(data) {
    this.data = data;
  }

  flagUpdate() {
    this.needsBytes = true;
    return this;
  }

  _saveData() {
    if (this.needsBytes && this.data && this.data.save) {
      [this.bytes, this.width, this.height] = this.data.save(this);
    }

    if (!this.bytes) {
      return [];
    }

    return this.bytes;
  }
}

ImageProperty.STRUCT = `
ImageProperty {
  bytes      : array(byte) | this._saveData();
  fixedColor : vec4;
  width      : int;
  height     : int;
}
`

nstructjs.register(ImageProperty);
ToolProperty.register(ImageProperty);

export const BlendModes = {
  SIMPLE    : 0,
  PIGMENT   : 1,
  CMYK_HSV  : 2,
  MULTIPLY  : 3,
  DIVIDE    : 4,
  ADD       : 5,
  SUBTRACT  : 6,
  DIFFERENCE: 7,
  SCREEN    : 8,
  OVERLAY   : 9,
}

export const SlotTypes = {
  INPUT : 0,
  OUTPUT: 1
};

export const SlotFlags = {
  MULTIPLE: 1, //multiple connections
  FORWARD : 2,
};

export class LayerSlot {
  constructor() {
    this.name = "";
    this.prop = new Vec4Property();
    this.prop.subtype = PropSubTypes.COLOR;

    this.type = undefined;

    this.id = -1;
    this.flag = undefined; //set set in NodeBase constructor

    this.edges = [];
    this.owner = undefined;

    this.updateGen = 0;
    this.lastSavedUpdateGen = undefined;
  }

  static value(val) {
    let slot = new LayerSlot();
    slot.prop = new FloatProperty();
    slot.range = [0, 1];
    slot.baseUnit = slot.displayUnit = "none";

    return slot;
  }

  static color(val) {
    let ret = new LayerSlot();

    if (val) {
      ret.prop.setValue(val);
    }

    return ret;
  }

  static bool(val) {
    let ret = new LayerSlot();
    ret.prop = new BoolProperty();
    ret.prop.setValue(!!val);
    return ret;
  }

  static int(val = 0) {
    let ret = new LayerSlot();
    ret.prop = new IntProperty();
    ret.prop.setValue(val);
    return ret;
  }

  static float(val = 0) {
    let ret = new LayerSlot();
    ret.prop = new FloatProperty();
    ret.prop.setValue(val);
    return ret;
  }

  static string(val = "") {
    let ret = new LayerSlot();
    ret.prop = new StringProperty();
    ret.prop.setValue(val);
    return ret;
  }

  static enum(enumdef, val = undefined) {
    let ret = new LayerSlot();
    ret.prop = new EnumProperty(val, enumdef);
    return ret;
  }

  static image() {
    let ret = new LayerSlot();
    ret.prop = new ImageProperty();
    return ret;
  }

  flagUpdate() {
    this.updateGen++;

    if (this.prop instanceof ImageProperty) {
      this.prop.flagUpdate();
    }

    return this;
  }

  connect(b) {
    if (b.edges.indexOf(this) === 0) {
      console.error("already connected");
    }

    this.edges.push(b);
    b.edges.push(b);

    return this;
  }

  disconnect(b) {
    if (!b) {
      for (let b2 of new Set(this.edges)) {
        this.disconnect(b2);
      }

      return;
    }

    this.edges.remove(b);
    b.edges.remove(this);
  }

  range(min, max) {
    this.prop.range[0] = min;
    this.prop.range[1] = max;
  }

  copyTo(b) {
    b.prop = this.prop.copy();

    b.name = this.name;
    b.flag = this.flag;
    b.type = this.type;

    return b;
  }

  copy() {
    let ret = new this.constructor();
    this.copyTo(ret);
    return ret;
  }

  getValue() {
    return this.prop.getValue();
  }

  setValue() {
    return this.prop.setValue();
  }
}

LayerSlot.STRUCT = `
LayerSlot {
  name  : string;
  flag  : int;
  id    : int;
  prop  : abstract(ToolProperty);
  edges : iter(e, int) | e.id;
}
`;
nstructjs.register(LayerSlot);

class NoInheritTag {
  constructor(slots) {
    this.slots = slots;
  }
}

export const DataClasses = [];

/** Node implementation data base class */
export class NodeData {
  static dataDef() {
    return {
      nodeType: "" //node type for which this data belongs, see NodeBase.nodeDef()
    }
  }

  static register(cls) {
    DataClasses.push(cls);
    nstructjs.register(cls);
  }

  static getClass(nodeType) {
    for (let cls of DataClasses) {
      if (cls.dataDef().nodeType === nodeType) {
        return cls;
      }
    }
  }
}

NodeData.STRUCT = `
NodeData {
}
`;
nstructjs.register(NodeData);

export const NodeClasses = [];

export class NodeBase {
  constructor() {
    this.inputs = {};
    this.outputs = {};

    this.graph = undefined;

    this.name = "";
    this.id = -1;
    this.flag = 0;

    let cls = this.constructor;
    let def = cls.nodeDef();

    let inputs = this.inputs = {};
    let outputs = this.outputs = {};
    let this2 = this;

    function loadSlots(slots, key) {
      let p = cls;
      let lastp;

      while (p && p !== lastp) {
        if (p.hasOwnProperty("nodeDef")) {
          let def2 = p.nodeDef();

          let slots2 = def2[key];
          if (slots2) {
            for (let k in slots2) {
              if (!(k in slots)) {
                let slot = slots[k] = slots2[k].copy();
                slot.name = k;
                slot.owner = this2;
                slot.type = key === "inputs" ? SlotTypes.INPUT : SlotTypes.OUTPUT;

                if (slot.flag === undefined) {
                  slot.flag = key === "outputs" ? SlotFlags.MULTIPLE : 0;
                }
              }
            }

            if (slots2 instanceof NoInheritTag) {
              break;
            }
          }
        }

        lastp = p;
        p = p.__proto__;
      }
    }

    loadSlots(inputs, "inputs");
    loadSlots(outputs, "outputs");

    let dcls = NodeData.getClass(def.typeName);

    if (dcls) {
      this.data = new dcls(this);
    } else {
      this.data = new NodeData();
    }
  }

  get allSlots() {
    let this2 = this;

    return (function* () {
      for (let k in this2.inputs) {
        yield this2.inputs[k];
      }

      for (let k in this2.outputs) {
        yield this2.outputs[k];
      }
    });
  }

  static noInherit(slots = {}) {
    return new NoInheritTag(slots);
  }

  static register(cls) {
    if (!cls.hasOwnProperty("STRUCT")) {
      throw new Error(cls.name + " lacks a STRUCT script");
    }

    if (!cls.hasOwnProperty("nodeDef")) {
      throw new Error(cls.name + " lacks a nodeDef static method");
    }

    NodeClasses.push(cls);
    simple.DataModel.register(cls);
  }

  static defineAPI(api, st) {

  }

  static getClass(typeName) {
    for (let cls of NodeClasses) {
      if (cls.nodeDef().typeName === typeName) {
        return cls;
      }
    }
  }

  static nodeDef() {
    return {
      typeName: "",
      uiName  : "",
      icon    : -1,
      inputs  : {
        //val: LayerSlot.value()
      },
      outputs : {
        //color: LayerSlot.color()
      }
    }
  }

  onDestroy(graph) {

  }

  getInputs() {
    let ret = {};

    for (let k in this.inputs) {
      ret[k] = this.inputs[k].getValue();
    }
  }

  getOutputs() {
    let ret = {};
    for (let k in this.outputs) {
      ret[k] = this.outputs[k].getValue();
    }

    return ret;
  }

  loadSTRUCT(reader) {
    let inputs = this.inputs;
    let outputs = this.outputs;

    reader(this);

    let inputs2 = {};
    let outputs2 = {};

    for (let slot of this.inputs) {
      inputs2[slot.name] = slot;
    }
    for (let slot of this.outputs) {
      outputs2[slot.name] = slot;
    }

    for (let k in inputs) {
      if (!(k in inputs2)) {
        inputs2[k] = inputs[k];
      }
    }

    for (let k in outputs) {
      if (!(k in outputs2)) {
        outputs2[k] = outputs[k];
      }
    }

    this.inputs = inputs2;
    this.outputs = outputs2;
  }
}

NodeBase.STRUCT = `
NodeBase {
  name     : string;
  id       : int;
  flag     : int;
  inputs   : iterkeys(abstract(LayerSlot));
  outputs  : iterkeys(abstract(LayerSlot));
  data     : abstract(NodeData);
}
`;
nstructjs.register(NodeBase);

export class LayerNode extends NodeBase {
  constructor() {
    super();
  }

  static nodeDef() {
    return {
      typeName: "layer",
      uiName  : "Layer",
      inputs  : {
        blendMode: LayerSlot.enum(BlendModes, BlendModes.SIMPLE),
        factor   : LayerSlot.float(1.0),
        image    : LayerSlot.image(), //internal image
        surface  : LayerSlot.image(), //image to mix with
      },
      outputs : {
        surface: LayerSlot.image()
      }
    }
  }
}

LayerNode.STRUCT = nstructjs.inherit(LayerNode, NodeBase) + `
}
`;
NodeBase.register(LayerNode);

export class OutputNode extends NodeBase {
  constructor() {
    super();
  }

  static nodeDef() {
    return {
      typeName: "output",
      uiName  : "Output",
      input   : {
        surface: LayerSlot.image()
      },
      output  : {
        surface: LayerSlot.image()
      }
    }
  }
}

OutputNode.STRUCT = nstructjs.inherit(OutputNode, NodeBase) + `
}`;
NodeBase.register(OutputNode);

export class LayerGraph extends NodeBase {
  constructor() {
    super();

    this.updateGen = 0;

    this.idgen = new util.IDGen();
    this.nodes = [];
    this.idMap = new Map();

    this.width = 512;
    this.height = 512;

    this.sortlist = [];
    this.flag = GraphFlags.RESORT;
  }

  static nodeDef() {
    return {
      typeName: "graph",
      uiName  : "graph",
      inputs  : {},
      outputs : {}
    }
  }

  createSubGraph() {
    let graph = new this.constructor();

    graph.idgen = this.idgen;
    graph.idMap = this.idMap;
    graph.flag |= GraphFlags.SUBGRAPH;

    this.add(graph);

    return graph;
  }

  groupLayers(layerNodes) {
    let graph = this.createSubGraph();

    layerNodes = new Set(layerNodes);

    for (let node of layerNodes) {
      this.moveToSubGraph(node, graph);
    }

    //graph.createSlots();

    this.flag |= GraphFlags.RESORT;
    graph.flag |= GraphFlags.RESORT;

    return graph;
  }

  _createSlotKey(slot) {
    return slot.name + slot.id;
  }

  checkSort() {
    if (this.flag & GraphFlags.RESORT) {
      this.sort();
    }
  }

  /*
  createSlots() {
    for (let node of this.nodes) {
      if (0 && node instanceof LayerGraph) {
        //node.createSlots();
      }

      for (let slot1 of node.allSlots) {
        let slots = slot1.type === SlotTypes.INPUT ? this.inputs : this.outputs;
        let key = this._createSlotKey(slot1);

        if (key in slots) {
          continue;
        }

        let ok = false;

        for (let slot2 of slot1.edges) {
          if (slot2.owner.graph !== this) {
            ok = true;
          }
        }

        if (ok) {
          let slot = slot1.copy();

          slot.name = key;
          slot.flag |= SlotFlags.FORWARD;
          slots[key] = slot;

          this.addSlot(slot);
        }
      }
    }

    this.flag |= GraphFlags.RESORT;
  }*/

  addSlot(slot) {
    slot.id = this.idgen.next();
    this.idMap.set(slot.id, slot);

    this.flag |= GraphFlags.RESORT;
  }

  moveFromSubGraph(node) {
    this.moveToSubGraph(node, this);
  }

  moveToSubGraph(node, subgraph) {
    node.graph = subgraph;

    this.nodes.remove(node);
    subgraph.nodes.push(node);

    this.flag |= GraphFlags.RESORT;
    subgraph.flag |= GraphFlags.RESORT;
  }

  sort(includeSubGraphs = false) {
    let output;

    for (let node of this.nodes) {
      if (node instanceof OutputNode) {
        output = node;
        break;
      }
    }

    let sortlist = this.sortlist = [];

    let visit = new WeakSet();
    let rec = (node) => {
      visit.add(node);

      if (node instanceof LayerGraph) {
        node.sort();
      }

      for (let k in node.inputs) {
        let slot1 = node.inputs[k];

        for (let slot2 of slot1.edges) {
          /* Stop at subgraphs */
          if ((slot2.owner.graph === this || includeSubGraphs) && !visit.has(slot2.owner)) {
            rec(slot2.owner);
          }
        }
      }

      sortlist.push(node);
    }

    rec(output);
  }

  add(node) {
    if (node.id !== -1) {
      console.error("Error adding node");
      return;
    }

    node.id = this.idgen.next();
    this.idMap.set(node.id, node);
    node.graph = this;

    for (let slot of node.allSlots) {
      slot.id = this.idgen.next();
      this.idMap.set(slot.id, slot);
    }

    this.flag |= GraphFlags.RESORT;
    this.updateGen++;

    return node;
  }

  remove(node) {
    if (node.id === -1 || !this.idMap.has(node.id)) {
      console.error(node);
      throw new Error("node not in graph");
    }

    this.nodes.remove(node);
    this.idMap.delete(node.id);
    node.id = -1;
    node.graph = undefined;

    for (let slot of node.allSlots) {
      this.idMap.delete(slot.id);
      slot.id = -1;
    }

    this.flag |= GraphFlags.RESORT;
    this.updateGen++;

    node.onDestroy(this);
  }

  [Symbol.iterator]() {
    return this.nodes[Symbol.iterator]();
  }

  flagResort() {
    this.flag |= GraphFlags.RESORT;
    return this;
  }

  ensureOutput() {
    if (this.flag & GraphFlags.SUBGRAPH) {
      this.checkSort();
      let sortlist = this.sortlist.concat([]);
      sortlist.reverse();

      for (let node of sortlist) {
        if (!("surface" in node.outputs) || node.outputs.surface.edges.length === 0) {
          continue;
        }

        let ok = true;
        for (let slot of node.outputs.surface.edges) {
          if (slot.graph === this) {
            ok = false;
            break;
          }
        }

        if (ok) {
          return node.outputs.surface.edges[0].owner;
        }
      }

      return undefined;
    }

    for (let node of this.nodes) {
      if (node instanceof OutputNode) {
        return node;
      }
    }

    let node = new OutputNode();
    this.add(node);
    return node;
  }

  addLayer(width, height, fill=[1,1,1,0]) {
    let layer = new LayerNode();

    layer.inputs.image.prop.width = width;
    layer.inputs.image.prop.height = height;
    layer.inputs.image.prop.fillColor.load(fill);

    this.add(layer);

    let output = this.ensureOutput();

    if (!output && (this.flag & GraphFlags.SUBGRAPH)) {
      console.warn("Possible subgraph error; no output?");
      return;
    } else if (!output) {
      console.error("Could not ensure graph/subgraph output!");
      return;
    }


    let surface = output.inputs.surface;

    if (surface.edges.length > 0) {
      let slot = surface.edges[0];
      surface.edges[0].disconnect(surface);

      slot.connect(layer.inputs.surface);
      layer.outputs.surface.connect(output.inputs.surface);
    }
  }

  loadSTRUCT(reader) {
    this.flagResort()

    if (this.flag & GraphFlags.SUBGRAPH) {
      return;
    }

    let idMap = new Map();

    let rec = (graph) => {
      graph.idgen = this.idgen;
      graph.idMap = idMap;

      for (let node of graph) {
        node.graph = graph;

        idMap.set(node.id, node);

        for (let slot of node.allSlots) {
          idMap.set(slot.id, slot);
          slot.owner = node;
        }

        if (node instanceof LayerGraph) {
          rec(node);
        }
      }
    }

    /* relink edges */
    for (let [id, node] of idMap) {
      for (let slot of node.allSlots) {
        for (let i = 0; i < slot.edges.length; i++) {
          slot.edges[i] = idMap.get(slot.edges[i]);
        }
      }
    }
  }
}

LayerGraph.STRUCT = nstructjs.inherit(LayerGraph, NodeBase) + `
  idgen     : IDGen;
  nodes     : array(abstract(NodeBase));
  width     : int;
  height    : int;
}
`;

nstructjs.register(LayerGraph);
