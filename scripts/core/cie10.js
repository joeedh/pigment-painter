//cie 10 degree standard observer

export let cie10_x = {
  380: 0.0000,
  390: 0.0020,
  400: 0.0434,
  410: 0.0847,
  420: 0.2044,
  430: 0.3146,
  440: 0.3837,
  450: 0.3707,
  460: 0.3022,
  470: 0.1956,
  480: 0.0805,
  490: 0.0161,
  500: 0.0038,
  510: 0.0374,
  520: 0.1177,
  530: 0.2364,
  540: 0.3767,
  550: 0.5298,
  560: 0.7052,
  570: 0.8786,
  580: 1.0141,
  590: 1.1185,
  600: 1.1239,
  610: 1.0304,
  620: 0.8562,
  630: 0.6474,
  640: 0.4315,
  650: 0.2682,
  660: 0.1525,
  670: 0.0812,
  680: 0.0408,
  690: 0.0194,
  700: 0.0095,
  710: 0.0045,
  720: 0.0021,
  730: 0.0010,
  740: 0.0000,
  750: 0.0000,
  760: 0.0000,
  770: 0.0000,
  780: 0.0000,
};

let cie10_y = {
  390: 0.0000,
  400: 0.0020,
  410: 0.0087,
  420: 0.0213,
  430: 0.0386,
  440: 0.0620,
  450: 0.0894,
  460: 0.1282,
  470: 0.1859,
  480: 0.2535,
  490: 0.3391,
  500: 0.4607,
  510: 0.6067,
  520: 0.7617,
  530: 0.8752,
  540: 0.9619,
  550: 0.9917,
  560: 0.9973,
  570: 0.9555,
  580: 0.8689,
  590: 0.7774,
  600: 0.6583,
  610: 0.5279,
  620: 0.3980,
  630: 0.2834,
  640: 0.1798,
  650: 0.1076,
  660: 0.0602,
  670: 0.0318,
  680: 0.0159,
  690: 0.0077,
  700: 0.0037,
  710: 0.0017,
  720: 0.0008,
  730: 0.0004,
  740: 0.0001,
  750: 0.0000
};

let cie10_z = {
  380: 0.0000,
  390: 0.0104,
  400: 0.0861,
  410: 0.3893,
  415: 0.6567,
  420: 0.9725,
  430: 1.5534,
  440: 1.9672,
  450: 1.9948,
  460: 1.7543,
  470: 1.3175,
  480: 0.7721,
  490: 0.4152,
  500: 0.2185,
  510: 0.1120,
  520: 0.0607,
  530: 0.0304,
  540: 0.0136,
  550: 0.0039,
  560: 0.0000,
};

function zip(a, b) {
  let ret = [];
  for (let i=0; i<a.length; i++) {
    ret.push([a[i], b[i]]);
  }

  return ret;
}

let waveLengthRange = [380, 750];

let datas = [
  cie10_x, cie10_y, cie10_z
]

let size = 4096;
export let tables = [
  new Array(size), new Array(size), new Array(size)
];


for (let [data, table] of zip(datas, tables)) {
  for (let k in data) {
    //js engines can be a bit finicky about keeping
    //integer keys as integers, and not converting
    //them to strings.
    let i = parseInt(k);

    i = (i - waveLengthRange[0]) / (waveLengthRange[1] - waveLengthRange[0]);
    i = ~~(i * size);

    table[i] = data[k];
  }

  //all tables start at zero and end at zero
  table[0] = 0;
  table[table.length-1] = 0;

  for (let i=0; i<table.length-1; i++) {
    if (table[i+1] !== undefined) {
      continue;
    }

    let j = i + 1;
    while (j < table.length-1 && table[j] === undefined) {
      j++;
    }

    let steps = j - i + 1;
    let dt = (table[j] - table[i]) / steps;
    let t = table[i] + dt;

    for (let k=i+1; k<j; k++, t += dt) {
      table[k] = t;
    }
  }
}

function sample(f, idx) {
  f = Math.min(Math.max(f, 380), 749);
  f = (f - 380) * 0.0027027; // / 370
  f *= size;

  let i = ~~f;
  f -= i;

  if (i === size-1) {
    return tables[idx][i];
  }

  let a = tables[idx][i];
  let b = tables[idx][i+1];

  return a + (b - a)*f;
}

export function xhat(f) {
  return sample(f, 0);
}

export function yhat(f) {
  return sample(f, 1);
}

export function zhat(f) {
  return sample(f, 2);
}

window.xhat = xhat;
window.yhat = yhat;
window.zhat = zhat;
window.tables1 = tables;

window.getnCie10Code = function() {
  let s = `

#include <algorithm>
namespace color::cie10 {
#define CIE10_STEPS ${size}
  `;

  let tabi = 0;
  for (let table of tables) {
    tabi++;

    s += `const float table${tabi}[${table.length}] {\n`
    for (let i=0; i<table.length; i++) {
      if (i > 0) {
        s += ",";
      }

      if ((i + 1) % 40 === 0) {
        s += "\n";
      }

      s += table[i].toFixed(4);
    }

    s += "};\n";
  }

  s += `

const float *tables[3] = {table1, table2, table3};
  
float sample(float f, int idx) {
  f = std::min(std::max(f, 380.0f), 749.0f);
  f = (f - 380.0f) * 0.0027027.0f; // / 370
  f *= CIE10_STEPS;

  int i = (int)f;
  f -= i;

  if (i == CIE10_STEPS-1) {
    return tables[idx][i];
  }

  float a = tables[idx][i];
  float b = tables[idx][i+1];

  return a + (b - a)*f;
}

float xhat(float f) {
  return sample(f, 0);
}
float yhat(float f) {
  return sample(f, 1);
}
float zhat(float f) {
  return sample(f, 2);
}
}

  `;
  console.log(s);
}