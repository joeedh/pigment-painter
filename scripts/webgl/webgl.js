import {
  util, vectormath, nstructjs, math, Vector2, Vector3,
  Vector4, Matrix4, Quat
} from '../path.ux/pathux.js';

"use strict";

let DEPTH24_STENCIL8 = 35056;
let RGBA32F = 34836;
let FLOAT = 5126

function debuglog() {
  console.warn(...arguments);
}

export class FBO {
  /*
  To make a cube texture FBO, create an FBO and then
  manually set .texColor.texture and .texDepth.texture,
  also set .target to gl.TEXTURE_CUBE_MAP and .layer
  to the cube map face layer
  */
  constructor(gl, width = 512, height = 512) {
    this.target = gl !== undefined ? gl.TEXTURE_2D : 3553;
    this.layer = undefined; //used if target is not gl.TEXTURE_2D

    this.contextGen = gl ? gl.contextGen : undefined;

    this.ctype = undefined; //RGBA32F;
    this.dtype = undefined; //DEPTH24_STENCIL8;

    this.gl = gl;
    this.fbo = undefined;
    this.regen = true;
    this.size = new Vector2([width, height]);
    this.texDepth = undefined;
    this.texColor = undefined;
    this.contextGen = gl ? gl.contextGen : 0;
  }

  _check(gl) {
    if (this.dtype === undefined) {
      this.dtype = gl.haveWebGL2 ? DEPTH24_STENCIL8 : gl.DEPTH_STENCIL;
    }
    if (this.ctype === undefined) {
      this.ctype = gl.haveWebGL2 ? RGBA32F : gl.RGBA;
    }
  }

  copy(copy_buffers = false) {
    let ret = new FBO();

    ret.size = new Vector2(this.size);
    ret.gl = this.gl;

    if (!copy_buffers || !this.gl || !this.fbo) {
      return ret;
    }

    ret.create(this.gl);

    let gl = this.gl;

    //ret.texColor = this.texColor.copy(gl, true);
    //ret.texDepth = this.texDepth.copy(gl, true);

    return ret;
  }

  create(gl) {
    if (gl.contextBad) {
      this.fbo = undefined;
      return;
    }

    if (this.contextGen !== gl.contextGen) {
      this.fbo = undefined;
      this.texColor = undefined;
      this.texDepth = undefined;
      this._last_viewport = undefined;
      this.gl = gl;
    }

    this.contextGen = gl.contextGen;

    this._check(gl);

    debuglog("fbo create", this.size[0], this.size[1]);

    if (this.fbo && this.gl) {
      this.destroy(this.gl);
    }

    this.regen = 0;

    gl = this.gl = gl === undefined ? this.gl : gl;

    this.size[0] = ~~this.size[0];
    this.size[1] = ~~this.size[1];

    //console.trace("framebuffer creation");

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.fbo = gl.createFramebuffer();

    if (this.texDepth) {
      gl.deleteTexture(this.texDepth.texture);
    }
    if (this.texColor) {
      gl.deleteTexture(this.texColor.texture);
    }

    this.texDepth = new Texture(gl.createTexture(), gl);
    this.texColor = new Texture(gl.createTexture(), gl);

    let target = this.target;
    let layer = this.layer;

    function texParams(target, tex) {
      gl.bindTexture(target, tex.texture);

      tex.texParameteri(gl, target, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      tex.texParameteri(gl, target, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      tex.texParameteri(gl, target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      tex.texParameteri(gl, target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      if (target !== gl.TEXTURE_2D) {
        tex.texParameteri(gl, target, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
      }
    }

    texParams(this.target, this.texDepth);
    if (gl.haveWebGL2) {
      this.texDepth.texParameteri(gl, this.target, gl.TEXTURE_COMPARE_MODE, gl.NONE);
      //gl.texParameteri(target, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
      //gl.texParameteri(target, gl.TEXTURE_COMPARE_FUNC, gl.ALWAYS);
    }

    texParams(this.target, this.texColor);

    let initTex = (tex, dtype, dtype2, dtype3) => {
      if (this.target !== gl.TEXTURE_2D) {
        console.error("Invalid texture target " + this.target + "!");
        return;
      }

      if (gl.haveWebGL2) {
        tex.texImage2D(gl, this.target, 0, dtype, this.size[0], this.size[1], 0, dtype2, dtype3, null);
        //  gl.texStorage2D(gl.TEXTURE_2D, 1, dtype, this.size[0], this.size[1]);
      } else {
        tex.texImage2D(gl, this.target, 0, dtype, this.size[0], this.size[1], 0, dtype2, dtype3, null);
      }
    };

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);

    let dtype = this.dtype;
    let dtype2 = gl.DEPTH_STENCIL;

    //UNSIGNED_INT_24_8
    let dtype3 = gl.haveWebGL2 ? gl.UNSIGNED_INT_24_8 : gl.depth_texture.UNSIGNED_INT_24_8_WEBGL;

    gl.bindTexture(this.target, this.texDepth.texture);
    initTex(this.texDepth, dtype, dtype2, dtype3);

    let ctype = this.ctype;
    let ctype2 = gl.RGBA, ctype3 = gl.FLOAT;

    gl.bindTexture(target, this.texColor.texture);
    initTex(this.texColor, ctype, ctype2, ctype3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);

    if (this.target === gl.TEXTURE_2D) {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texColor.texture, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.TEXTURE_2D, this.texDepth.texture, 0);
    } else {
      let target2 = target;

      if (target === gl.TEXTURE_CUBE_MAP) {
        target2 = layer;
      }

      if (DEBUG.fbo) {
        debuglog("TARGET2", target2);
      }

      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, target2, this.texColor.texture, 0);
      if (target === gl.TEXTURE_2D) {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, target2, this.texDepth.texture, 0);
      } else {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, target2, this.texDepth.texture, 0);
        //gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, target2, this.texDepth.texture, 0);
      }
    }

    let errret = gl.checkFramebufferStatus(gl.FRAMEBUFFER);

    if (DEBUG.fbo) {
      debuglog("FBO STATUS:", errret, webgl.constmap[errret]);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  bind(gl) {
    if (gl.contextBad) {
      return;
    }

    if (gl.contextGen !== this.contextGen) {
      console.warn("context loss detected in fbo");

      this.texDepth = undefined;
      this.texColor = undefined;
      this.fbo = undefined;
      this._last_viewport = undefined;

      this.create(gl);
    }

    this._check(gl);

    this._last_viewport = gl.getParameter(gl.VIEWPORT);

    if (gl) {
      this.gl = gl;
    } else {
      gl = this.gl;
    }

    if (this.regen) {
      this.create(gl);
    }

    //if (gl.drawBuffers) {
      //gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    //}

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.size[0], this.size[1]);
  }

  unbind(gl) {
    if (gl.contextBad || gl.contextGen !== this.contextGen) {
      return;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    let vb = this._last_viewport;
    if (!vb) {
      return;
    }

    gl.viewport(vb[0], vb[1], vb[2], vb[3]);
  }

  destroy(gl = this.gl) {
    if (gl.contextBad || this.contextGen !== gl.contextGen) {
      console.warn("context loss detected in fbo.destroy()!");

      this.fbo = undefined;
      this.texDepth = undefined;
      this.texColor = undefined;

      return;
    }

    if (!this.gl) {
      this.gl = gl;
    }

    if (this.fbo !== undefined) {
      this.gl.deleteFramebuffer(this.fbo);

      //console.warn(this.target, this.gl.TEXTURE_2D);
      //if (this.target === this.gl.TEXTURE_2D) {
      this.gl.deleteTexture(this.texDepth.texture);
      this.gl.deleteTexture(this.texColor.texture);
      //}

      this.texDepth.texture = this.texColor.texture = undefined;
      this.fbo = undefined;
    }
  }

  update(gl, width, height) {
    width = ~~width;
    height = ~~height;

    /*
    function get2(f) {
      let f2 = Math.ceil(Math.log(f) / Math.log(2.0));
      return Math.pow(2.0, f2);
    }

    width = ~~get2(width);
    height = ~~get2(height);
    //*/

    gl = this.gl = gl === undefined ? this.gl : gl;

    if (width !== this.size[0] || height !== this.size[1] || gl !== this.gl) {
      debuglog("fbo update", width, height);

      this.size[0] = width;
      this.size[1] = height;

      if (this.gl === undefined || gl === this.gl) {
        this.destroy(gl);
      }

      this.texDepth = this.texColor = undefined;
      this.create(gl);

      return true;
    }
  }
}


//params are passed to canvas.getContext as-is
export function init_webgl(canvas, params, webgl2) {
//  webgl2 = false;

  params.powerPreference = params.powerPreference ?? "high-performance";
  params.premultipliedAlpha = params.premultipliedAlpha ?? false;
  params.antialias = params.antialias ?? false;
  params.desynchronized = params.desynchronized ?? false;

  let gl = canvas.getContext(webgl2 ? "webgl2" : "webgl", params);

  canvas.addEventListener("webglcontextlost", (e) => {
    gl.contextBad = true;
    e.preventDefault();
  });

  canvas.addEventListener("webglcontextrestored", (e) => {
    gl.contextGen++;
    gl.contextBad = false;

    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.SCISSOR_TEST);

    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.drawBuffers([gl.BACK]);
    //e.preventDefault();
  });

  if (!gl) {
    gl = canvas.getContext("webgl");
    webgl2 = false;
  }

  let cache = {
    viewport : [0,0,0,0],
    scissor : [0,0,0,0],
  }

  let getparam = gl.getParameter;
  let viewport = gl.viewport;
  let scissor = gl.scissor;

  cache.viewport = new Float64Array(gl.getParameter(gl.VIEWPORT));
  cache.scissor = new Float64Array(gl.getParameter(gl.SCISSOR_BOX));

  gl.getParameter = function(param) {
    if (param === gl.VIEWPORT) {
      return new Float64Array(cache.viewport);
    } else if (param === gl.SCISSOR_BOX) {
      return Float64Array(cache.scissor);
    } else {
      return getparam.apply(this, arguments);
    }
  }

  gl.scissor = function(x, y, w, h) {
    let b = cache.scissor;

    b[0] = x;
    b[1] = y;
    b[2] = w;
    b[3] = h;

    scissor.apply(this, arguments);
  }

  gl.viewport = function(x, y, w, h) {
    let b = cache.viewport;

    b[0] = x;
    b[1] = y;
    b[2] = w;
    b[3] = h;

    viewport.apply(this, arguments);
  }

  gl.haveWebGL2 = !!webgl2;

  if (webgl2) {
    gl.getExtension("EXT_frag_depth");
    gl.color_buffer_float = gl.getExtension("EXT_color_buffer_float");
  } else {
    gl.getExtension("EXT_frag_depth");
    gl.color_buffer_float = gl.getExtension("WEBGL_color_buffer_float");
  }


  gl.texture_float = gl.getExtension("OES_texture_float");
  gl.texture_float = gl.getExtension("OES_texture_float_linear");
  gl.float_blend = gl.getExtension("EXT_float_blend");
  gl.getExtension("OES_standard_derivatives");
  gl.getExtension("ANGLE_instanced_arrays");
  gl.debugContextLoss = gl.getExtension("WEBGL_lose_context");
  gl.draw_buffers = gl.getExtension("WEBGL_draw_buffers");

  //used by context recovery code; which context "generation" we are on
  gl.contextGen = 0;
  gl.contextBad = false;

  function makeExtForward(k, v) {
    let k2 = k;

    if (k2.endsWith("WEBGL")) {
      k2 = k2.slice(0, k2.length - 5);
      if (k2.endsWith("_")) {
        k2 = k2.slice(0, k2.length - 1);
      }

      try {
        if (typeof v === "function") {
          gl[k2] = function () {
            v(...arguments);
          }
        } else {
          gl[k2] = v;
        }
      } catch (error) {
        if (gl[k2] !== v) {
          console.warn("failed to bind property", k2);
        }
      }
    }
  }

  if (gl.draw_buffers) {
    for (let k in gl.draw_buffers.__proto__) {
      if (typeof k === "symbol") {
        continue;
      }

      makeExtForward(k, gl.draw_buffers.__proto__[k])
    }
  }

  gl.depth_texture = gl.getExtension("WEBGL_depth_texture");

  return gl;
}

function format_lines(script, errortext) {
  let linenr = getShaderErrorLine(errortext);

  let i = 1;

  let lines = script.split("\n")
  let maxcol = Math.ceil(Math.log(lines.length)/Math.log(10)) + 1;

  if (typeof linenr === "number") {
    let a = Math.max(linenr-25, 0);
    a = 0;
    let b = Math.min(linenr+5, lines.length);

    i = a + 1;
    lines = lines.slice(a, b);
  }

  let s = "";

  for (let line of lines) {
    s += "" + i + ":";
    while (s.length < maxcol) {
      s += " "
    }

    if (i === linenr) {
      line = util.termColor(line + " ", "red");
    }

    s += line + "\n";
    i++;
  }

  return s;
}

function getShaderErrorLine(error) {
  let linenr = error.match(/.*([0-9]+):([0-9]+): .*/);

  if (linenr) {
    linenr = parseInt(linenr[2]);
  }

  if (isNaN(linenr)) {
    linenr = undefined;
  }

  return linenr;
}

//
// loadShader
//
// 'shaderId' is the id of a <script> element containing the shader source string.
// Load this shader and return the WebGLShader object corresponding to it.
//
function loadShader(ctx, shaderId, type) {
  let shaderScript = document.getElementById(shaderId);

  if (!shaderScript) {
    shaderScript = {text: shaderId, type};
  }

  if (!type) {
    if (shaderId.contains("//vertex\n")) {
      shaderScript.type = "x-shader/x-vertex";
    } else if (shaderId.contains("//fragment\n")) {// in shaderId) { //.trim().toLowerCase().startsWith("//fragment")) {
      shaderScript.type = "x-shader/x-fragment";
    } else {
      console.trace();
      console.log("Invalid shader type");
      console.log("================");
      console.log(format_lines(shaderScript.text));
      console.log("================");
      throw new Error("Invalid shader type for shader script;\n script must start with //vertex or //fragment");
    }
  }

  let shaderType;
  
  if (shaderScript.type === "vertex")
    shaderType = ctx.VERTEX_SHADER;
  else if (shaderScript.type === "fragment")
    shaderType = ctx.FRAGMENT_SHADER;
  else {
    console.log("*** Error: invalid type " + shaderScript.type, shaderScript);
    return null;
  }

  // Create the shader object
  let shader = ctx.createShader(shaderType);

  // Load the shader source
  ctx.shaderSource(shader, shaderScript.text);

  // Compile the shader
  ctx.compileShader(shader);

  // Check the compile status
  let compiled = ctx.getShaderParameter(shader, ctx.COMPILE_STATUS);
  if (!compiled && !ctx.isContextLost()) {
    // Something went wrong during compilation; get the error
    let error = ctx.getShaderInfoLog(shader);

    console.log(format_lines(shaderScript.text, error));

    console.log("\nError compiling shader: ", error);

    ctx.deleteShader(shader);
    return null;
  }

  return shader;
}

var _safe_arrays = [
  0,
  0,
  new Float32Array(2),
  new Float32Array(3),
  new Float32Array(4),
];

let defkey_digest = new util.HashDigest();

export class ShaderProgram {
  constructor(gl, vertex, fragment, attributes) {
    this.vertexSource = vertex;
    this.fragmentSource = fragment;
    this.attrs = [];

    for (let a of attributes) {
      this.attrs.push(a);
    }

    this._defKey = undefined;

    this.rebuild = 1;

    this.uniformlocs = {};
    this.attrlocs = {};

    this.uniforms = {};
    this.gl = gl;

    this.defines = {};
    this._def_shaders = {};
    this._use_def_shaders = true;
  }

  static fromDef(gl, def) {
    let ret = new ShaderProgram(gl, def.vertex, def.fragment, def.attributes);

    if (def.uniforms) {
      for (let k in def.uniforms) {
        ret.uniforms[k] = def.uniforms[k];
      }
    }

    if (def.defines) {
      ret.defines = Object.assign(ret.defines, def.defines);
    }

    return ret;
  }

  static load_shader(path, attrs) {
    let ret = new ShaderProgram(undefined, undefined, undefined, ["position", "normal", "uv", "color", "id"]);
    ret.ready = false;

    ret.init = function (gl) {
      if (!this.ready) {
        return;
      }

      return ShaderProgram.prototype.init.call(this, gl);
    }

    ret.promise = util.fetch_file(path).then(function (text) {
      console.log("loaded file");

      let lowertext = text.toLowerCase();
      let vshader = text.slice(0, lowertext.search("//fragment"));
      let fshader = text.slice(lowertext.search("//fragment"), text.length);

      ret.vertexSource = vshader;
      ret.fragmentSource = fshader;
      ret.ready = true;
    });

    ret.then = function () {
      return this.promise.then.apply(this.promise, arguments);
    }

    return ret;
  }

  _hashDefs(defines, digest=defkey_digest.reset()) {
    let tot = 0;

    for (let k in defines) {
      let v = defines[k] || 0;
      tot++;

      digest.add(k[0]);
      digest.add(k[k.length-1]);
      digest.add(v);
    }

    digest.add(tot);

    return digest.get();
  }

  _getDefString(defs) {
    let s = '';

    for (let k in defs) {
      let v = defs[k];

      if (v !== undefined) {
        s += `#define ${k} ${v}\n`
      } else {
        s += `#define ${k}\n`;
      }
    }

    s = s.trim();
    return s;
  }

  _get_def_shader(gl, defines) {
    let defs = {};

    if (defines) {
      defs = Object.assign(defs, this.defines, defines);
    } else {
      defs = Object.assign(defs, this.defines);
    }

    let key;

    if (0) {
      key = this._getDefString(defs);
    } else {
      key = this._hashDefs(defs);
    }

    //if (key.length === 0) {
    //  key = "main";
    //}

    if (key in this._def_shaders) {
      return this._def_shaders[key];
    }

    let s = this._getDefString(defs);

    function repl(src) {
      let i = src.search("precision");
      let i2 = i + src.slice(i, src.length).search("\n");

      return src.slice(0, i2) + "\n" + s + "\n" + src.slice(i2, src.length) + "\n";
    }

    let vertex = repl(this.vertexSource);
    let fragment = repl(this.fragmentSource);

    let sp = new ShaderProgram(gl, vertex, fragment, this.attrs);

    sp.defines = defs;
    sp.uniforms = this.uniforms;
    sp._use_def_shaders = false;

    this._def_shaders[key] = sp;

    sp.init(gl);

    return sp;
  }

  init(gl) {
    if (this._use_def_shaders) {
      return this._get_def_shader(gl).init(gl);
    }

    //clear cached uniforms and attribute locations

    this.gl = gl;
    this.rebuild = false;
    this.contextGen = gl.contextGen;

    let vshader = this.vertexSource, fshader = this.fragmentSource;

    // create our shaders
    let vertexShader = loadShader(gl, vshader, "vertex");
    let fragmentShader = loadShader(gl, fshader, "fragment");

    // Create the program object
    let program = gl.createProgram();

    // Attach our two shaders to the program
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);

    let attribs = this.attrs;

    // Bind attributes
    for (let i = 0; i < attribs.length; ++i) {
      gl.bindAttribLocation(program, i, attribs[i]);
    }

    // Link the program
    gl.linkProgram(program);

    // Check the link status
    let linked = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (!linked && !gl.isContextLost()) {
      // something went wrong with the link
      let error = gl.getProgramInfoLog(program);
      console.log("Error in program linking:" + error);

      //do nothing
      //gl.deleteProgram(program);
      //gl.deleteProgram(fragmentShader);
      //gl.deleteProgram(vertexShader);

      return null;
    }

    console.warn("created shader", program);

    this.program = program;

    this.gl = gl;
    this.vertexShader = vertexShader;
    this.fragmentShader = fragmentShader;

    this.attrlocs = {};
    this.uniformlocs = {};

    for (let i = 0; i < attribs.length; i++) {
      this.attrlocs[attribs[i]] = gl.getAttribLocation(program, attribs[i]);
    }
  }

  on_gl_lost(newgl) {
    this.rebuild = 1;
    this.gl = newgl;
    this.program = undefined;

    this.uniformlocs = {};
  }

  destroy(gl = this.gl) {
    if (!gl) {
      if (this.vertexShader || this.fragmentShader || this.program) {
        console.error("Could not destroy a shader: no valid gl reference");
      }

      return;
    }

    for (let k in this._def_shaders) {
      let shader = this._def_shaders[k];
      shader.destroy(gl);
    }

    if (this.vertexShader) {
      gl.deleteShader(this.vertexShader);
    }

    if (this.fragmentShader) {
      gl.deleteShader(this.fragmentShader);
    }

    if (this.program) {
      gl.deleteProgram(this.program);
    }

    this.program = this.vertexShader = this.fragmentShader = undefined;
    this.rebuild = 1;
  }

  uniformloc(name) {
    this._checkContextGen();

    if (this._use_def_shaders) {
      return this._get_def_shader(this.gl).uniformloc(name);
    }

    if (!this.program) {
      return undefined;
    }

    if (this.uniformlocs[name] === undefined || this.uniformlocs[name] === null) {
      this.uniformlocs[name] = this.gl.getUniformLocation(this.program, name);
    }

    return this.uniformlocs[name];
  }

  attrloc(name) {
    this._checkContextGen();

    if (this._use_def_shaders) {
      return this._get_def_shader(this.gl).attrloc(name);
    }

    //return this.gl.getAttribLocation(this.program, name);
    return this.attrlocs[name];
  }

  _checkContextGen(gl = this.gl) {
    if (!gl) {
      return;
    }

    if (this.contextGen !== gl.contextGen) {
      this.rebuild = true;

      this.program = undefined;
      this.vertexShader = undefined;
      this.fragmentShader = undefined;
      this.uniformlocs = {};
      this.attrlocs = {};

      this._def_shaders = {};

      if (!this._use_def_shaders) {
        this.init(gl);
      }
    }
  }

  bind(gl, uniforms, defines) {
    if (gl.contextBad) {
      return;
    }

    if (this.contextGen !== gl.contextGen) {
      this.uniformlocs = {};
      this.attrlocs = {};
      this.program = undefined;
      this.vertexShader = undefined;
      this.fragmentShader = undefined;

      this.rebuild = true;
    }

    if (this._use_def_shaders) {
      this.contextGen = gl.contextGen;

      return this._get_def_shader(gl, defines).bind(gl, uniforms);
    }

    this.gl = gl;

    if (this.rebuild) {
      this.init(gl);

      if (this.rebuild) {
        console.warn("fbo error");
        return; //failed to initialize
      }
    }

    if (!this.program) {
      if (Math.random() > 0.99) {
        console.error("Shader error!");
      }

      return
    }

    function setv(dst, src, n) {
      for (let i = 0; i < n; i++) {
        dst[i] = src[i];
      }
    }

    gl.useProgram(this.program);

    this.gl = gl;
    let texSlotBase = 0;

    for (let i = 0; i < 2; i++) {
      let us = i ? uniforms : this.uniforms;

      for (let k in us) {
        let v = us[k];
        let loc = this.uniformloc(k)

        if (loc === undefined) {
          //stupid gl returns null if it optimized away the uniform,
          //so we must silently accept this
          //console.log("Warning, could not locate uniform", k, "in shader");
          continue;
        }

        if (v instanceof Texture) {
          v.bind(gl, this.uniformloc(k), texSlotBase++);
        } else if (v instanceof Array) {
          let arr;

          switch (v.length) {
            case 2:
              arr = _safe_arrays[2];
              setv(arr, v, 2);
              gl.uniform2fv(loc, arr);
              break;
            case 3:
              arr = _safe_arrays[3];
              setv(arr, v, 3);
              gl.uniform3fv(loc, arr);
              break;
            case 4:
              arr = _safe_arrays[4];
              setv(arr, v, 4);
              gl.uniform4fv(loc, arr);
              break;
          }
        } else if (v instanceof Matrix4) {
          v.setUniform(gl, loc);
        } else if (typeof v === "number") {
          gl.uniform1f(loc, v);
        } else {
          console.warn(k, v);
          throw new Error("Invalid uniform for " + k);
        }
      }
    }

    return this;
  }
}

let gpu_vert_idgen = 1;

export class GPUVertexAttr {
  constructor() {
    this.type = undefined;
    this.size = undefined;
    this.buf = undefined;
    this.data = undefined;
    this.perfhint = undefined;
    this.elemSize = undefined;
    this.normalized = false;
    this.contextGen = undefined;
    this.id = gpu_vert_idgen++;
    this.lastIdx = undefined;
  }

  copyTo(b, upload, gl) {
    b.type = this.type;
    b.size = this.size;
    b.buf = this.buf;
    b.data = this.data;

    b.perfhint = this.perfhint;
    b.elemSize = this.elemSize;
    b.normalized = this.normalized;
    b.contextGen = this.contextGen;
    b.id = this.id;
    b.lastIdx = this.lastIdx;

    if (b.data) {
      let cls = b.data.constructor;
      if (cls === Array) {
        b.data = util.list(b.data);
      } else {
        b.data = new cls(b.data);
      }

      if (gl && upload) {
        this.upload(gl, b, b.data);
      }
    }
  }

  upload(gl, args, data) {
    let {target, type, perfHint, elemSize, normalized} = args;

    //console.warn("uploading data to gpu");

    if (this.buf && this.contextGen !== gl.contextGen) {
      console.warn("Context loss in GPUVertexAttr detected!", this.data);
      this.buf = undefined;
    }

    this.contextGen = gl.contextGen;

    perfHint = perfHint ?? gl.STATIC_DRAW;
    target = target ?? gl.ARRAY_BUFFER;
    type = type ?? gl.FLOAT;
    normalized = normalized ?? false;

    this.elemSize = elemSize;
    this.type = type;
    this.target = target;
    this.perfHint = perfHint;
    this.normalized = normalized;

    let cls;
    switch (type) {
      case gl.FLOAT:
        cls = Float32Array;
        break;
      case gl.BYTE:
        cls = Int8Array;
        break;
      case gl.UNSIGNED_BYTE:
        cls = data instanceof Uint8ClampedArray ? Uint8ClampedArray : Uint8Array;
        break;
      case gl.SHORT:
        cls = Int16Array;
        break;
      case gl.UNSIGNED_SHORT:
        cls = Uint16Array;
        break;
      case gl.INT:
        cls = Int32Array;
        break;
      case gl.UNSIGNED_INT:
        cls = Uint32Array;
        break;
    }

    if (!(data instanceof cls)) {
      data = new cls(data);
    }

    if (!this.data) {
      this.data = new cls(data);
    } else {
      this.data.set(data);
    }

    if (this.buf && this.size && data.length/elemSize >= this.size) {
      gl.deleteBuffer(this.buf);
      this.buf = undefined;
    }

    this.size = ~~(data.length/elemSize);

    if (!this.buf) {
      this.buf = gl.createBuffer();
    }

    gl.bindBuffer(target, this.buf);
    gl.bufferData(target, data, perfHint);

    return this;
  }

  bind(gl, idx) {
    if (gl.contextBad) {
      return;
    }

    this.lastIdx = idx;

    if (this.buf && this.contextGen !== gl.contextGen) {
      console.warn("reuploading vertex attribute");

      this.buf = undefined;
      this.upload(gl, this, this.data);
    }

    gl.enableVertexAttribArray(idx);

    //console.error(idx, this.elemSize, this.type, this.normalized, this.buf);
    gl.bindBuffer(this.target, this.buf);
    gl.vertexAttribPointer(idx, this.elemSize, this.type, this.normalized, 0, 0);
  }

  unbind(gl, idx=this.lastIdx) {
    gl.disableVertexAttribArray(idx);
  }

  destroy(gl) {
    if (this.contextGen !== gl.contextGen) {
      return;
    }

    if (this.buf !== undefined) {
      gl.deleteBuffer(this.buf);
      this.buf = undefined;
    }

    return this;
  }
}

export class RenderBuffer {
  constructor() {
    this._layers = {};
  }

  get(gl, name) {
    if (typeof gl === "string") {
      throw new Error("RenderBuffer.get(): PASS IN GL FIRST!");
    }

    if (this[name] !== undefined) {
      return this[name];
    }

    let buf = new GPUVertexAttr();

    this._layers[name] = buf;
    this[name] = buf;

    return buf;
  }

  add(gl, name, buf) {
    if (this[name] && this[name] !== buf) {
      this[name].destroy(gl);
    }

    this[name] = buf;
    this._layers[name] = buf;
  }

  remove(name) {
    let buf = this[name];

    delete this[name];
    delete this._layers[name];

    return buf;
  }

  destroy(gl, name) {
    if (name === undefined) {
      for (let k in this._layers) {
        this._layers[k].destroy(gl);

        delete this._layers[k];
        delete this[k];
      }
    } else {
      if (this._layers[name] === undefined) {
        console.trace("WARNING: gl buffer no in RenderBuffer!", name, gl);
        return;
      }

      this._layers[name].destroy(gl);

      delete this._layers[name];
      delete this[name];
    }
  }
}

const TEXTURE_2D = 3553;

export class Texture {
  //3553 is gl.TEXTURE_2D
  constructor(texture, gl, target = 3553) {
    //console.warn("new webgl.Texture()", texture, gl !== undefined);

    this.texture = texture;
    this.texture_slot = undefined;
    this.target = target;

    this.createParams = {
      target: TEXTURE_2D
    };

    this.contextGen = gl ? gl.contextGen : 0;
    this.gl = gl;

    this.createParamsList = [TEXTURE_2D];
    this._storedTex = undefined;
    this.contextGen = gl ? gl.contextGen : undefined;

    this._params = {};
  }

  static load(gl, width, height, data, target = gl.TEXTURE_2D) {
    let tex = gl.createTexture();

    gl.bindTexture(target, tex);

    let use_byte_width = data instanceof Uint8Array || data instanceof Uint8ClampedArray || data instanceof ArrayBuffer;
    use_byte_width = use_byte_width || gl.haveWebGL2;

    if (data instanceof ImageData) {
      data = data.data;
    }

    if (data instanceof Float32Array) {
      gl.texImage2D(target, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.FLOAT, data);
    } else if (use_byte_width) {
      gl.texImage2D(target, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    } else {
      gl.texImage2D(target, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, data);
    }

    let ret = new Texture(undefined, tex, undefined, gl);

    ret.createParams.target = target;
    ret.createParams.width = width;
    ret.createParams.height = height;

    ret.defaultParams(gl, tex, target);

    ret.contextGen = gl.contextGen;
    ret._storedTex = data;

    return ret;
  }

  static defaultParams(gl, tex, target = gl.TEXTURE_2D) {
    throw new Error("static defaultParams cannot handle context loss; use method instead");
    gl.bindTexture(target, tex);

    gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.REPEAT);
  }

  makeMipMaps(gl) {
    console.error("MIP MAPS!");

    if (!this.gl) {
      this.gl = gl;
    }

    this._checkContextGen(gl);
    this.createParams.mipmaps = true;

    gl.bindTexture(this.target, this.texture);
    gl.generateMipmap(this.target);
    this.texParameteri(gl, this.target, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  }

  defaultParams(gl, tex, target = gl.TEXTURE_2D) {
    this._checkContextGen(gl);

    this.texParameteri(gl, target, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.texParameteri(gl, target, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    this.texParameteri(gl, target, gl.TEXTURE_WRAP_S, gl.REPEAT);
    this.texParameteri(gl, target, gl.TEXTURE_WRAP_T, gl.REPEAT);
  }

  texParameteri(gl, target, param, value) {
    if (this._params[param] === value) {
      return;
    }

    this._params[param] = value;

    gl.texParameteri(target, param, value);
    return this;
  }

  getParameter(gl, param) {
    return this._params[param];
  }

  _checkContextGen(gl = this.gl) {
    if (!gl) {
      return;
    }

    if (gl.contextGen !== this.contextGen) {
      console.warn("context update in texture detected");

      this.texture = gl.createTexture();
      gl.bindTexture(this.target, this.texture);

      this.contextGen = gl.contextGen;

      if (this._storedTex) {
        this.load(gl, this.createParams.width, this.createParams.height, this._storedTex, this.target);

        if (this.createParams.mipmaps) {
          this.makeMipMaps(gl);
        }
      }

      for (let k in this._params) {
        gl.texParameteri(this.target, parseInt(k), this._params[k]);
      }
    }
  }

  _texImage2D1(gl, target, level, internalformat, format, type, source) {

    gl.bindTexture(target, this.texture);
    gl.texImage2D(target, level, internalformat, format, type, source);

    this.createParams = {
      target, level, internalformat, format, type, source
    };
    this.createParamsList = [
      target, level, internalformat, format, type, source
    ];

    if (source instanceof Image || source instanceof ImageData) {
      this.createParams.width = source.width;
      this.createParams.height = source.height;
    }

    if (source) {
      this._storedTex = source;
    }

    return this;
  }

  _texImage2D2(gl, target, level, internalformat, width, height, border, format, type, source) {
    gl.bindTexture(target, this.texture);

    //if (source === undefined || source === null) {
    //  gl.texImage2D(target, level, internalformat, width, height, border, format, type, undefined);
    //} else {
    gl.texImage2D(target, level, internalformat, width, height, border, format, type, source);
    //}

    this.createParams = {
      target, level, internalformat, format, type, source, width, height, border
    };
    this.createParamsList = [
      target, level, internalformat, format, type, source, width, height, border
    ];

    return this;
  }

  texImage2D() {
    this.contextGen = arguments[0].contextGen;

    if (arguments.length === 7) {
      return this._texImage2D1(...arguments);
    } else {
      return this._texImage2D2(...arguments);
    }
  }

  copy(gl, copy_data = false) {
    let tex = new Texture();

    tex.contextGen = this.contextGen;
    tex.texture = gl.createTexture();
    tex.createParams = Object.assign({}, this.createParams);
    tex.createParamsList = this.createParamsList.concat([]);
    tex.texture_slot = this.texture_slot;

    gl.bindTexture(this.createParams.target, tex.texture);

    if (!copy_data) {
      let p = this.createParams;

      tex.texImage2D(p.target, p.level, p.internalformat, p.format, p.type, null);
    } else {
      this.copyTexTo(gl, tex);
    }

    for (let k in this._params) {
      let key = parseInt(k);
      let val = this._params[key];

      gl.texParameteri(this.createParams.target, key, val);
    }

    return tex;
  }

  copyTexTo(gl, b) {
    if (this.texture === undefined) {
      return;
    }

    let p = this.createParams;

    gl.bindTexture(p.target, b.texture);
    b.texImage2D(gl, p.target, p.level, p.internalformat, p.width, p.height, p.border, p.format, p.type, this.texture);

    return this;
  }

  destroy(gl = this.gl) {
    if (gl.contextBad || this.contextGen !== gl.contextGen) {
      console.warn("context loss detected in texture.destroy()!");

      this.texture = undefined;
      return;
    }

    gl.deleteTexture(this.texture);
  }

  load(gl, width, height, data, target = gl.TEXTURE_2D, mipMaps=true, filter=gl.LINEAR) {
    if (this.contextGen !== gl.contextGen) {
      console.warn("context loss detected in texture!");
      this.contextGen = gl.contextGen;
      this.texture = undefined;
    }

    let tex = this.texture !== undefined ? this.texture : gl.createTexture();

    let use_byte_width = data instanceof Uint8Array || data instanceof Uint8ClampedArray || data instanceof ArrayBuffer;
    use_byte_width = use_byte_width || gl.haveWebGL2;

    this.contextGen = gl.contextGen;
    this.texture = tex;

    this.createParams = {width, height, target, border: 0, level: 0, format: gl.RGBA, internalformat: gl.RGBA};

    gl.bindTexture(target, tex);

    let ifmt = gl.SRGB8_ALPHA8;
    //ifmt = gl.RGBA;

    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    //gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    this.texParameteri(gl, target, gl.TEXTURE_MAG_FILTER, filter);
    this.texParameteri(gl, target, gl.TEXTURE_MIN_FILTER, filter);

    if (data instanceof ImageData) {
      data = data.data;
    }

    if (data instanceof Float32Array) {
      gl.texImage2D(target, 0, ifmt, width, height, 0, gl.RGBA, gl.FLOAT, data);
    } else if (use_byte_width) {
      gl.texImage2D(target, 0, ifmt, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    } else {
      gl.texImage2D(target, 0, ifmt, gl.RGBA, gl.UNSIGNED_BYTE, data);
    }

    gl.finish();

    if (data) {
      this._storedTex = data;
    }

    this.defaultParams(gl, tex, target);
    if (mipMaps) {
      this.makeMipMaps(gl);
    }

    this.texParameteri(gl, target, gl.TEXTURE_MAG_FILTER, filter);
    this.texParameteri(gl, target, gl.TEXTURE_MIN_FILTER, filter);

    return this;
  }

  defaultParams(gl, tex, target = gl.TEXTURE_2D) {
    gl.bindTexture(target, tex);

    this.texParameteri(gl, target, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.texParameteri(gl, target, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    this.texParameteri(gl, target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    this.texParameteri(gl, target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  bind(gl, uniformloc, slot = this.texture_slot) {
    if (gl.contextBad) {
      return;
    }

    if (this.contextGen !== gl.contextGen) {
      console.warn("Dead gl texture", this.contextGen, gl.ContextGen);
      return;
    }

    gl.activeTexture(gl.TEXTURE0 + slot);
    gl.bindTexture(this.target, this.texture);
    gl.uniform1i(uniformloc, slot);
  }
}


//cameras will derive from this class
export class DrawMats {
  constructor() {
    this.isPerspective = true;

    this.cameramat = new Matrix4();
    this.persmat = new Matrix4();
    this.rendermat = new Matrix4();
    this.normalmat = new Matrix4();

    this.icameramat = new Matrix4();
    this.ipersmat = new Matrix4();
    this.irendermat = new Matrix4();
    this.inormalmat = new Matrix4();
  }

  /** aspect should be sizex / sizey */
  regen_mats(aspect = this.aspect) {
    this.aspect = aspect;

    this.rendermat.load(this.persmat).multiply(this.cameramat);
    this.normalmat.load(this.cameramat).makeRotationOnly();

    this.icameramat.load(this.cameramat).invert();
    this.ipersmat.load(this.persmat).invert();
    this.irendermat.load(this.rendermat).invert();
    this.inormalmat.load(this.normalmat).invert();

    return this;
  }

  toJSON() {
    return {
      cameramat    : this.cameramat.getAsArray(),
      persmat      : this.persmat.getAsArray(),
      rendermat    : this.rendermat.getAsArray(),
      normalmat    : this.normalmat.getAsArray(),
      isPerspective: this.isPerspective,

      icameramat: this.icameramat.getAsArray(),
      ipersmat  : this.ipersmat.getAsArray(),
      irendermat: this.irendermat.getAsArray(),
      inormalmat: this.inormalmat.getAsArray()
    }
  }

  loadJSON(obj) {
    this.cameramat.load(obj.cameramat);
    this.persmat.load(obj.persmat);
    this.rendermat.load(obj.rendermat);
    this.normalmat.load(obj.normalmat);
    this.isPerspective = obj.isPerspective;

    this.icameramat.load(obj.icameramat);
    this.ipersmat.load(obj.ipersmat);
    this.irendermat.load(obj.irendermat);
    this.inormalmat.load(obj.inormalmat);

    return this;
  }

  loadSTRUCT(reader) {
    reader(this);
  }
}

DrawMats.STRUCT = `
DrawMats {
  cameramat     : mat4;
  persmat       : mat4;
  rendermat     : mat4;
  normalmat     : mat4;
  icameramat    : mat4;
  ipersmat      : mat4;
  irendermat    : mat4;
  inormalmat    : mat4;
  isPerspective : int;
}
`;
nstructjs.register(DrawMats);

//simplest
export class Camera extends DrawMats {
  constructor() {
    super();

    this.isPerspective = true;

    this.fovy = 35;
    this.aspect = 1.0;

    this.pos = new Vector3([0, 0, 5]);
    this.target = new Vector3();
    this.orbitTarget = new Vector3();

    this.up = new Vector3([1, 3, 0]);
    this.up.normalize();

    this.near = 0.25;
    this.far = 10000.0;
  }

  generateUpdateHash(objectMatrix = undefined) {
    let mul = 1<<18;

    let ret = 0;

    function add(val) {
      val = (val*mul) & ((1<<31) - 1);
      ret = (ret ^ val) & ((1<<31) - 1);
    }

    add(this.near);
    add(this.far);
    add(this.fovy);
    add(this.aspect);
    add(this.isPerspective);
    add(this.pos[0]);
    add(this.pos[1]);
    add(this.pos[2]);
    add(this.target[0]);
    add(this.target[1]);
    add(this.target[2]);
    add(this.up[0]);
    add(this.up[1]);
    add(this.up[2]);

    if (objectMatrix !== undefined) {
      let m = objectMatrix.$matrix;

      add(m.m11);
      add(m.m12);
      add(m.m13);
      add(m.m21);
      add(m.m22);
      add(m.m23);
      add(m.m31);
      add(m.m32);
      add(m.m33);
    }

    return ret;
  }

  load(b) {
    this.isPerspective = b.isPerspective;
    this.fovy = b.fovy;
    this.aspect = b.aspect;
    this.pos.load(b.pos);
    this.orbitTarget.load(b.orbitTarget);
    this.target.load(b.target);
    this.up.load(b.up);
    this.near = b.near;
    this.far = b.far;

    this.regen_mats(this.aspect);

    return this;
  }

  copy() {
    let ret = new Camera();

    ret.isPerspective = this.isPerspective;
    ret.fovy = this.fovy;
    ret.aspect = this.aspect;

    ret.pos.load(this.pos);
    ret.target.load(this.target);
    ret.orbitTarget.load(this.orbitTarget);
    ret.up.load(this.up);

    ret.near = this.near;
    ret.far = this.far;

    ret.regen_mats(ret.aspect);

    return ret;
  }

  reset() {
    this.pos = new Vector3([0, 0, 5]);
    this.target = new Vector3();
    this.up = new Vector3([1, 3, 0]);
    this.up.normalize();

    this.regen_mats(this.aspect);
    window.redraw_all();

    return this;
  }

  toJSON() {
    var ret = super.toJSON();

    ret.fovy = this.fovy;
    ret.near = this.near;
    ret.far = this.far;
    ret.aspect = this.aspect;

    ret.target = this.target.slice(0);
    ret.pos = this.pos.slice(0);
    ret.up = this.up.slice(0);

    return ret;
  }

  loadJSON(obj) {
    super.loadJSON(obj);

    this.fovy = obj.fovy;

    this.near = obj.near;
    this.far = obj.far;
    this.aspect = obj.aspect;

    this.target.load(obj.target);
    this.pos.load(obj.pos);
    this.up.load(obj.up);

    return this;
  }

  /** aspect should be sizex / sizey*/
  regen_mats(aspect = this.aspect) {
    this.aspect = aspect;

    this.persmat.makeIdentity();
    if (this.isPerspective) {
      this.persmat.perspective(this.fovy, aspect, this.near, this.far);
    } else {
      this.persmat.isPersp = true;
      let scale = 1.0/this.pos.vectorDistance(this.target);

      this.persmat.makeIdentity();
      this.persmat.orthographic(scale, aspect, this.near, this.far);

      //this.persmat.scale(1, 1, -2.0/zscale, 1.0/scale);
      //this.persmat.translate(0.0, 0.0, 0.5*zscale - this.near);
    }

    this.cameramat.makeIdentity();
    this.cameramat.lookat(this.pos, this.target, this.up);
    this.cameramat.invert();

    this.rendermat.load(this.persmat).multiply(this.cameramat);
    //this.rendermat.load(this.cameramat).multiply(this.persmat);

    super.regen_mats(aspect); //will calculate iXXXmat for us
  }

  loadSTRUCT(reader) {
    reader(this);
  }
}

Camera.STRUCT = nstructjs.inherit(Camera, DrawMats) + `
  fovy          : float;
  aspect        : float;
  target        : vec3;
  orbitTarget   : vec3;
  pos           : vec3;
  up            : vec3;
  near          : float;
  far           : float;
  isPerspective : bool;
}
`;
nstructjs.register(Camera);
