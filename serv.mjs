import url from 'url';
import net from 'net';
import fs from 'fs';
import http from 'http';
import path from 'path';

const PORT = 5009;
const HOST = "localhost"

const INDEX = "index.html"
const basedir = process.cwd();

export const exports = {};

let mimemap = {
  ".js" : "application/javascript",
  ".cjs" : "application/javascript",
  ".mjs" : "application/javascript",
  ".json" : "text/json",
  ".html" : "text/html",
  ".png" : "image/png",
  ".jpg" : "image/jpeg",
  ".css" : "text/css",
  ".svg" : "image/svg+xml",
  ".wasm" : "application/wasm",
};

let getMime = (p) => {
  p = p.toLowerCase().trim();
  
  for (let k in mimemap) {
    if (p.endsWith(k)) {
      return mimemap[k];
    }
  }
  
  return "text/plain";
}


let allowed_origins = new Set([
  `http://${HOST}:${PORT}/`,
  `http://${HOST}:${PORT}`
]);


exports.ServerResponse = class ServerResponse extends http.ServerResponse {
  _addHeaders(origin) {
    this.setHeader("X-Content-Type-Options", "nosniff");

    if (allowed_origins.has(origin)) {
      this.setHeader("Access-Control-Allow-Origin", origin);
    }

    this.setHeader("Document-Policy", "js-profiling");
    this.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    this.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    this.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    this.setHeader("Vary", "Origin");
  }

  sendError(code, message) {
    let buf = `<!doctype html>
<html>
<head><title>404</title></head>
<body><div>${message}<div><body>
</html>
`;

    this.statusCode = code;
    this.setHeader('Host', HOST);
    this.setHeader('Content-Type', 'text/html');
    this.setHeader('Content-Length', buf.length);
    this._addHeaders();
    
    this.writeHead(code)
    this.end(buf);
  }
}

const serv = http.createServer({
  ServerResponse : exports.ServerResponse
}, (req, res) => {
  let p = req.url.trim();
  
  if (!p.startsWith("/")) {
    p = "/" + p
  }
  
  let origin = req.headers["origin"] || "";

  console.log(req.method, p, origin);

  if (p === "/") {
    p += INDEX
  }
  
  p = path.normalize(basedir + p);
  if (p.search(/\.\./) >= 0 || !p.startsWith(basedir)) {
    //normalize failed
    return res.sendError(500, "malformed path");
  }
  
  let stt;
  try {
    stt = fs.statSync(p);
  } catch(error) {
    return res.sendError(404, "bad path");
  }
  
  if (stt === undefined || stt.isDirectory() || !stt.isFile()) {
    console.log("access error for", p);
    return res.sendError(404, "bad path");
  }
  
  
  let mime = getMime(p);
  
  let buf = fs.readFileSync(p);
  
  res.statusCode = 200;
  res.setHeader('Content-Type', mime);
  res._addHeaders(origin);
  res.end(buf);
});

serv.listen(PORT, HOST, () => {
  console.log("Server listening on", HOST + ":" + PORT); 
});










