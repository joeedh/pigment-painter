import {
  Vector2, Vector3, Vector4,
  Matrix4, Quat, util, nstructjs,
  simple, UIBase, Container, RowFrame, ToolOp, FloatConstrinats, FloatProperty, Vec4Property, IntProperty, saveUIData,
  loadUIData
} from '../path.ux/pathux.js';
import {ImageProperty, LayerGraph, LayerNode, NodeBase, OutputNode, SlotTypes} from './layers_base.js';
import {WebGLGraph} from './layers.js';

export function saveLayerStack(graph, keepImageSlots = new Map()) {
  let data = new Map();

  graph.forAllNodes(node => {
    let n = {
      typeName: node.constructor.nodeDef().typeName,
      id      : node.id,
      flag    : node.flag,
      name    : node.name,
      graph   : node.graph.id,
      inputs  : {},
      outputs : {},
    };

    data.set(node.id, n);

    for (let slot of node.allSlots) {
      let slots = slot.type === SlotTypes.INPUT ? n.inputs : n.outputs;

      let slot2 = {
        id   : slot.id,
        flag : slot.flag,
        prop : slot.copy(),
        edges: slot.edges.map(s => s.id)
      };

      if (slot.prop instanceof ImageProperty) {
        if (!keepImageSlots.has(slot) && !keepImageSlots.has(slot.id)) {
          slot.prop.bytes = new Uint8Array(slot.prop.bytes);
        } else {
          slot.prop.bytes = [];
        }
      }

      slots[slot.name] = slot2;
      data.set(slot.id, slot2);
    }
  });

  return {
    idmap: data,
    idgen: graph.idgen.copy(),
  };
}


export function loadLayerStack(data, graph) {
  let idmap = data.idmap;

  //disconnectconnect graph
  graph.forAllNodes(node => {
    for (let slot of new Set(node.allSlots)) {
      let slot2 = idmap.get(slot.id);

      if (slot2) {
        slot2.prop.copyTo(slot.prop);
      }

      slot.disconnect();
    }
  });

  //prune nodes
  let stop = false;
  let _i = 0;

  let rec = graph => {
    let modified = false;

    while (!stop) {
      stop = true;

      if (_i++ > 100000) {
        console.warn("Infinite loop error in graph code!");
        break;
      }

      for (let node of graph.nodes) {
        if (!idmap.has(node)) {
          stop = false;
          modified = true;

          if (node instanceof LayerGraph) {
            for (let node2 of new Set(node.nodes)) {
              graph.moveFromSubGraph(node2);
            }
          } else {
            graph.remove(node);
          }
        } else if (node instanceof LayerGraph) {
          if (rec(node)) {
            modified = true;
            stop = false;
          }
        }
      }
    }

    return modified;
  }

  rec(graph);

  graph.idgen = data.idgen.copy();

  //add missing nodes
  for (let [id, n] of idmap) {
    if (graph.idMap.has(id)) {
      continue;
    }

    let node = new NodeBase.getClass(n.typeName);
    node.id = n.id;
    node.name = n.name;
    node.graph = n.graph; //relink later

    graph.nodes.push(node);

    graph.idMap.set(node.id, node);
    graph.nameMap.set(node.name, node);

    if (node instanceof LayerGraph) {
      node.idMap = graph.idMap;
      node.idgen = graph.idgen;
    }

    for (let slot1 of node.allSlots) {
      let slots = slot1.type === SlotTypes.INPUT ? n.inputs : n.outputs;
      let slot2 = slots[slot1.name];

      slot1.id = slot2.id;
      slot1.flag = slot2.flag;
      slot1.prop = slot2.prop;

      graph.idMap.set(slot1.id, slot1);
    }
  }

  /*relink subgraphs*/
  for (let [id, n] of idmap) {
    let node = graph.idMap.get(node);

    if (typeof node.graph === "number") {
      let graph2 = graph.idMap.get(node.graph);
      node.graph = graph;

      graph.moveToSubGraph(node, graph2);
    }
  }

  //reconnect graph
  for (let [id, n] of idmap) {
    let node = graph.idMap.get(node);
    for (let slot1 of node.allSlots) {
      let slots = slot1.type === SlotTypes.INPUT ? n.inputs : n.outputs;

      let slot2 = slots[slot1.name];
      for (let id of slot2.edges) {
        let slot3 = graph.idMap.get(id);

        if (slot3 === undefined) {
          console.error("Missing slot in undo code!", slot2, slot1, node, n);
          continue;
        }

        slot2.connect(slot3);
      }
    }
  }

  graph.updateGen++;
}

export class LayerOpBase extends ToolOp {
  constructor() {
    super();
  }

  undoPre(ctx) {
    let graph = ctx.graph;
    this._undo = saveLayerStack(graph);
    window.redraw_all();
  }

  undo(ctx) {
    let graph = ctx.graph;
    loadLayerStack(graph, this._undo);

    window.redraw_all();
  }

  execPost(ctx) {
    window.redraw_all();
  }
}

export class AddLayerOp extends LayerOpBase {
  constructor() {
    super();
  }

  static tooldef() {
    return {
      uiname : "New Layer",
      toolpath : "graph.add_layer",
      inputs : {
        customWidth : new FloatProperty(-1),
        customHeight : new FloatProperty(-1),
        fillColor : new Vec4Property([1,1,1,0]).isColor(),
      },
      outputs : {
        layerId : new IntProperty(-1)
      }
    }
  }

  exec(ctx) {
    let graph = ctx.graph;

    let w = this.inputs.customWidth.getValue();
    let h = this.inputs.customHeight.getValue();
    let fillColor = this.inputs.fillColor.getValue();

    w = w === -1 ? graph.width : w;
    h = h === -1 ? graph.height : h;

    graph.addLayer(w, h, fillColor);
  }
}
ToolOp.register(AddLayerOp);


export class LayerWidget extends Container {
  constructor() {
    super();

    this.needsRebuild = true;
    this._last_update_gen = undefined;
  }


  init() {
    this.rebuild();
  }

  rebuild() {
    this.needsRebuild = false;
    let uidata = saveUIData(this, "layer-widget");

    this.clear();

    let graph = this.ctx.graph;

    this.tool("graph.add_layer");

    graph.sort(true);

    let listbox = this.listbox();
    listbox.overrideDefault("width", "345");

    for (let node of graph.sortlist) {
      if (!(node instanceof LayerNode)) {
        continue;
      }

      let item = listbox.addItem(node.name, node.id);
      let path = `graph.nodes[${node.id}]`;

      item.prop(path + ".visible");
    }

    console.log(graph);

    graph.flagResort();

    loadUIData(this, uidata);
    this.flushSetCSS();

    for (let i=0; i<3; i++) {
      this.flushUpdate();
    }
  }

  update() {
    if (!this.ctx || !this.ctx.graph) {
      return;
    }

    let graph = this.ctx.graph;
    if (graph.updateGen !== this._last_update_gen) {
      this._last_update_gen = graph.updateGen;
      this.needsRebuild = true;
    }

    if (this.needsRebuild) {
      this.rebuild();
    }
  }
  static define() {
    return {
      tagname : 'layer-widget-x'
    }
  }
}
UIBase.register(LayerWidget);
