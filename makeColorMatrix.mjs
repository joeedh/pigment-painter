/*
see:

https://nick-shaw.github.io/cinematiccolor/common-rgb-color-spaces.html#x34-1410004.1.8
http://poynton.ca/PDFs/coloureq.pdf
*/
import * as color from './scripts/core/color.js';
import {Vector3, Vector4, Matrix4, Vector2, Quat} from './scripts/path.ux/scripts/util/vectormath.js';
import * as util from './scripts/path.ux/scripts/util/util.js';
import './scripts/util/numeric.js';

let d65x = 0.3127, d65y = 0.3290;

/*
class Matrix extends Array {
  constructor(rows, cols) {
    super();

    for (let i=0; i<rows; i++) {
      let row = [];
      this.push(row);

      for (let j=0; j<cols; j++) {
        row.push(j==i ? 1.0 : 0.0);
      }
    }
  }

  static from(mat) {
    let m = new Matrix(mat.length, mat[0].length);

    for (let i=0; i<m; i++) {
      for (let j=0; j<m; j++) {
        m[i][j] = mat[i][j];
      }
    }

    return m;
  }

  multiply(b) {
    if (typeof b[0] === "number") {
      b = [b]; //column vector
    }

    for (let i=0; i<this.length; i++) {
      for (let j=0; j<this[0].length; j++) {
        let sum = 0.0;

        for (let k=0; k<this[0].length; k++) {
          sum += this[i][k]*b[k][j];
        }

        this[i][j] = sum;
      }
    }

    return this;
  }

  det() {
    let rec = (r1, c1, r2, c2) => {
      if (r2 - r1 === 1) {
        let a = this[r1][c1];
        let b = this[r1][c2];
        let c = this[r2][c1];
        let d = this[r2][r2];

        return a*d - b*c;
      } else {
        let f = (r2 - r1) >> 1;

        let a = rec(r1, c1, r1+f, c1 + f);
        let b = rec(r1+f, c1, r1+f, c2);
        let c = rec(r1+f, c1+f, r2, c2);
        let d = rec(r1, c1+f, r1+f, c2);

        return a*d - b*c;
      }
    }

    let rows = this.length;
    let cols = this[0].length;

    return rec(0, 0, rows, cols);
  }
}
*/

function makeColorMatrix(rx, ry, gx, gy, bx, by, wx, wy) {
  let rz = 1.0 - rx - ry;
  let gz = 1.0 - gx - gy;
  let bz = 1.0 - bx - by;
  let wz = 1.0 - wx - wy;

  let mat = [
    [rx, ry, rz],
    [gx, gy, gz],
    [bx, by, bz],
  ];
  mat = numeric.transpose(mat);

  let b1 = [wx/wy, 1.0, wz/wy].map(f => [f]);

  let mat2 = numeric.inv(mat);
  let b = numeric.dot(mat2, b1);

  let mat3 = [[b[0]*rx, b[1]*gx, b[2]*bx],
              [b[0]*ry, b[1]*gy, b[2]*by],
              [b[0]*rz, b[1]*gz, b[2]*bz]];

  function makeCode(m) {
    let f = n => n.toFixed(4);

    return `
r*${f(m[0][0])} + g*${f(m[0][1])} + b*${f(m[0][2])};
r*${f(m[1][0])} + g*${f(m[1][1])} + b*${f(m[1][2])};
r*${f(m[2][0])} + g*${f(m[2][1])} + b*${f(m[2][2])};
    `.trim();
  }

  console.log("to XYZ");
  console.log(makeCode(mat3));

  console.log("from XYZ");
  mat3 = numeric.inv(mat3);
  console.log(makeCode(mat3)
    .replace(/r/g, 'x')
    .replace(/g/g, 'y')
    .replace(/b/g, 'z')
  );
  //mat2.transpose();
  console.log("\n");
}

//srgb
console.log("SRGB");
makeColorMatrix(
  0.640, 0.330,
  0.300, 0.600,
  0.150, 0.060,
  d65x, d65y
);

//P3 D65
console.log("P3 D65");
makeColorMatrix(
  0.680, 0.320,
  0.265, 0.690,
  0.150, 0.060,
  d65x, d65y
);