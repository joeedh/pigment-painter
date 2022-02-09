let fs = require("fs");
let pathmod = require("path");

let args = process.argv;
if (args.length != 3) {
  console.error("Usage: node data_to_c.js [path to data file]");
  process.exit(-1);
}

let path = args[2];
let buf = fs.readFileSync(path);

let basename = pathmod.basename(path);
basename = basename.replace(/\./g, "_") + "_data";

let col_limit = 78;
let col = 0;
let s = `const char ${basename}[${buf.length}] = {\n`;

let line = "  " + buf[0];

let blen = buf.length;

for (let i=1; i<blen; i++) {
  if (line.length >= col_limit) {
    s += line;
    line = ",\n  " + buf[i];
  } else {
    line += "," + buf[i];
  }

}
s = (s + line).trim() + "\n};\n";

let outpath = path + ".c";
fs.writeFileSync(outpath, s);
