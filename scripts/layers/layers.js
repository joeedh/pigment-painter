import {
  util, nstructjs, math, Vector2,
  Vector3, Vector4, Matrix4, Quat, UIBase,
  simple
} from '../path.ux/pathux.js';

import {
  NodeBase, NodeClasses, NodeData, BlendModes,
  GraphFlags, LayerGraph, LayerNode, LayerSlot,
  OutputNode, ImageProperty
} from './layers_base.js';

export class FBOData {
  constructor() {
    this.fbo = undefined;
    this.gl = undefined;
    this.width = 0;
    this.height = 0;
  }

  save(prop) {
    if (!this.fbo) {
      return [[], this.width, this.height];
    }
  }
}

export class LayerImpl extends NodeData {
  constructor() {
    super();

  }

  exec(node) {

  }

  genCode(gen) {
    return `
      vec4 c1 = ${gen.slot("surface")};
      vec4 c2 = ${gen.slot("image")};
      float factor = ${gen.slot("factor")};
          
    `;
  }

  static dataDef() {
    return {
      nodeType : "layer",
      shaderLib : ``,
    }
  }
}
LayerImpl.STRUCT = `
LayerImpl { 
}
`;
NodeData.register(LayerImpl);


export class OutputImpl extends NodeData {
  constructor() {
    super();

  }

  exec(node) {

  }

  genCode(gen) {
    return `
      fragColor = ${gen.slot("surface")};          
    `;
  }

  static dataDef() {
    return {
      nodeType : "output",
      shaderLib : ``,
    }
  }
}
OutputImpl.STRUCT = `
OutputImpl { 
}
`;
NodeData.register(OutputImpl);

export class WebGLGraph extends LayerGraph {
  constructor() {
    super();
  }

  static nodeDef() {
    return {
      typeName: "WebglGraph",
      uiName  : "WebglGraph",
      inputs  : {},
      outputs : {}
    }
  }

  forAllNodes(cb) {
    let rec = (graph) => {
      for (let node of graph) {
        cb(node);

        if (node instanceof LayerGraph) {
          rec(node);
        }
      }
    }

    rec(this);
  }

  static defineAPI(api, st) {
    super.defineAPI(api, st);
  }

  execNode() {

  }

  exec() {
    this.checkSort();

    for (let node of this.sortlist) {
      if (node instanceof WebGLGraph) {
        node.exec();
      } else {
        this.execNode(node);
      }
    }
  }
}
WebGLGraph.STRUCT = nstructjs.inherit(WebGLGraph, LayerGraph) + `
}`;
simple.DataModel.register(WebGLGraph);
