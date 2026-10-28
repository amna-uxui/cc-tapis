/*
  Stroke by Sabine Marcelis: rugs made of broad, brushed strokes, and you reshape them for good.
  Each rug is made of pieces: Stroke 1.0 of four strips, Stroke 2.0 of a straight panel with a sash
  folded across it, the runner of one long strip. Put your finger on a piece and drag: only that
  piece bends, following your finger into curves and S-shapes like a ribbon; move it round in a
  circle and it twists into a knot. The piece you move comes to the top, lying over the others
  with a soft shadow, and stays as you leave it. Double-tap to put the rug back as it was.

  - Tap the rug for the next shape: Stroke 1.0, Stroke 2.0, the runner, and round again.
  - The row under the rug: the two colours of the shape on show.

  Each piece is drawn with WebGL as a fine mesh over the photo, cut to that piece's outline: the
  finger moves the mesh's points, the piece's wool goes with them, like fabric.

  Needs js/carpet-viewer.js (changeRug, img, carpet, fingerPaint, isWhole), js/carpet-strip.js and
  js/carpet-menu.js to be loaded first.
*/

const STROKE_NAME = "Stroke";
const STROKE_DESIGNER = "Sabine Marcelis";
const STROKE_PRICE = 7344;

// Where the pieces are, on each photo (u across, v down, both 0..1 of the photo):
// strips: the seams between strips, each a curve u = a + b·v + c·v² (traced from the photos);
// sash: the outline of the piece lying across the panel. Without either: one piece.
const STRIPS_VIOLET = [[0.191, 0.7053, -0.5609], [0.4238, 0.6346, -0.5432], [0.5942, 0.7277, -0.6892]];
const STRIPS_BLUE = [[0.2031, 0.666, -0.6123], [0.4806, 0.4935, -0.4936], [0.6238, 0.6522, -0.684]];
const SASH = [
  [-0.05, -0.05], [0.47, -0.05], [0.6, 0.2], [0.95, 0.48], [1.05, 0.6], [1.0, 0.85], [0.88, 0.95],
  [0.82, 0.9], [0.62, 0.71], [0.43, 0.55], [0.2, 0.37], [0.05, 0.22], [-0.05, 0.18],
];

// The three shapes, each in its two colours (rgb: its main colour, for the dot in the row)
const STROKE_SHAPES = [
  {
    name: "1.0",
    reach: 0.09,
    colours: [
      { name: "Violet", src: "images/stroke-1-violet.jpg", rgb: [136, 117, 168], strips: STRIPS_VIOLET },
      { name: "Blue", src: "images/stroke-1-blue.jpg", rgb: [45, 96, 158], strips: STRIPS_BLUE },
    ],
  },
  {
    name: "2.0",
    reach: 0.14,
    colours: [
      { name: "Yellow", src: "images/stroke-2-yellow.jpg", rgb: [217, 185, 130], sash: SASH },
      { name: "Orange", src: "images/stroke-2-orange.jpg", rgb: [198, 98, 46], sash: SASH },
    ],
  },
  {
    name: "Runner",
    reach: 0.12,
    colours: [
      { name: "Yellow", src: "images/stroke-runner-yellow.jpg", rgb: [219, 182, 102] },
      { name: "Nude", src: "images/stroke-runner-nude.jpg", rgb: [210, 193, 172] },
    ],
  },
];

const BEND_FOLLOW = 0.95;    // how closely a piece follows the finger where it's held (1 = exactly)
const TWIST = 0.4;           // how strongly circling the finger twists the piece round it
const MESH = 80;             // points along the rug's longer side (more = smoother bends)
const ROOM = 0.3;            // room round the rug for its moved pieces (share of its longer side)
const SHADOW = 0.008;        // how far a moved piece's shadow falls (share of the rug's longer side)
const LABELS = 512;          // the map of which piece is where: this many points along its longer side

const warpCanvas = carpet.querySelector(".carpet__warp");

let strokeShape = 0;
const strokeColour = STROKE_SHAPES.map(() => 0); // the colour picked for each shape

// ---------- The pieces ----------

// Which piece is at (u, v) on the photo of this colour
function pieceAt(colour, u, v) {
  if (colour.strips) return colour.strips.filter(([a, b, c]) => u > a + b * v + c * v * v).length;
  if (colour.sash) return insidePolygon(colour.sash, u, v) ? 1 : 0;
  return 0;
}

function pieceCount(colour) {
  if (colour.strips) return colour.strips.length + 1;
  return colour.sash ? 2 : 1;
}

function insidePolygon(points, x, y) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ---------- The mesh: one per piece, all over the same photo ----------

// warp: { w, h, room, cols, rows, rest (x, y per point), pieces: [{ off (how far each point moved),
// moved }], order (bottom to top), labels: { w, h, data } }
let warp = null;
let warpGl = null;

function makeMesh(colour) {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const step = Math.max(w, h) / MESH;
  const cols = Math.ceil(w / step) + 1;
  const rows = Math.ceil(h / step) + 1;
  const rest = new Float32Array(cols * rows * 2);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = (r * cols + c) * 2;
      rest[i] = Math.min(w, c * step);
      rest[i + 1] = Math.min(h, r * step);
    }
  }
  const count = pieceCount(colour);
  // the map of which piece is where on the photo
  const lw = Math.round((LABELS * w) / Math.max(w, h));
  const lh = Math.round((LABELS * h) / Math.max(w, h));
  const labels = new Uint8Array(lw * lh);
  for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) labels[y * lw + x] = pieceAt(colour, (x + 0.5) / lw, (y + 0.5) / lh);
  warp = {
    w,
    h,
    room: Math.max(w, h) * ROOM,
    cols,
    rows,
    rest,
    pieces: Array.from({ length: count }, () => ({ off: new Float32Array(rest.length), moved: false })),
    order: Array.from({ length: count }, (_, k) => k),
    labels: { w: lw, h: lh, data: labels },
  };
  // the canvas reaches past the rug on every side, so moved pieces still show
  warpCanvas.width = Math.round(w + warp.room * 2);
  warpCanvas.height = Math.round(h + warp.room * 2);
  Object.assign(warpCanvas.style, {
    left: `${-warp.room}px`,
    top: `${-warp.room}px`,
    width: `${w + warp.room * 2}px`,
    height: `${h + warp.room * 2}px`,
  });
}

const WARP_VERTEX = `
attribute vec2 aPos;
attribute vec2 aUv;
uniform vec2 uCanvas;
uniform float uRoom;
uniform vec2 uShift;
varying vec2 vUv;
void main() {
  vUv = aUv;
  vec2 p = (aPos + uShift + uRoom) / uCanvas;
  gl_Position = vec4(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);
}`;

const WARP_FRAGMENT = `
precision mediump float;
uniform sampler2D uPhoto;
uniform sampler2D uLabels;
uniform float uPiece;
uniform float uShadow;
varying vec2 vUv;
void main() {
  // only this piece's part of the photo
  if (abs(texture2D(uLabels, vUv).r * 255.0 - uPiece) > 0.5) discard;
  // the photo's white paper turns see-through, so where pieces overlap, only rug shows
  vec4 c = texture2D(uPhoto, vUv);
  float a = clamp((0.975 - (c.r + c.g + c.b) / 3.0) / 0.03, 0.0, 1.0);
  if (uShadow > 0.0) gl_FragColor = vec4(0.0, 0.0, 0.0, a * uShadow);
  else gl_FragColor = vec4(c.rgb * a, a);
}`;

function setUpWarpGl() {
  const gl = warpCanvas.getContext("webgl", { premultipliedAlpha: true, preserveDrawingBuffer: true });
  if (!gl) return null;
  const shader = (type, source) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    return s;
  };
  const program = gl.createProgram();
  gl.attachShader(program, shader(gl.VERTEX_SHADER, WARP_VERTEX));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, WARP_FRAGMENT));
  gl.linkProgram(program);
  gl.useProgram(program);
  const texture = (filter) => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // pieces laid over each other
  const u = (name) => gl.getUniformLocation(program, name);
  return {
    gl,
    program,
    photo: texture(gl.LINEAR),
    labels: texture(gl.NEAREST),
    positionBuffer: gl.createBuffer(),
    uvBuffer: gl.createBuffer(),
    indexBuffer: gl.createBuffer(),
    uniforms: { canvas: u("uCanvas"), room: u("uRoom"), shift: u("uShift"), piece: u("uPiece"), shadow: u("uShadow"), photo: u("uPhoto"), labelMap: u("uLabels") },
  };
}

// A new photo: meshes made for its size and pieces, the photo on them, all in place
function loadWarp(colour) {
  if (!warpGl) warpGl = setUpWarpGl();
  if (!warpGl) return;
  makeMesh(colour);
  const { gl, program, uniforms } = warpGl;
  gl.viewport(0, 0, warpCanvas.width, warpCanvas.height);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, warpGl.photo);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, warpGl.labels);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, warp.labels.w, warp.labels.h, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, warp.labels.data);

  // where on the photo each point is, and the triangles between the points
  const { cols, rows, rest, w, h } = warp;
  const uv = new Float32Array(rest.length);
  for (let i = 0; i < rest.length; i += 2) {
    uv[i] = rest[i] / w;
    uv[i + 1] = rest[i + 1] / h;
  }
  const index = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      index.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols);
    }
  }
  warp.triangles = index;
  warpGl.count = index.length;
  warpGl.positions = new Float32Array(rest.length);
  gl.bindBuffer(gl.ARRAY_BUFFER, warpGl.uvBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
  const aUv = gl.getAttribLocation(program, "aUv");
  gl.enableVertexAttribArray(aUv);
  gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, warpGl.indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(index), gl.STATIC_DRAW);
  gl.uniform2f(uniforms.canvas, warpCanvas.width, warpCanvas.height);
  gl.uniform1f(uniforms.room, warp.room);
  gl.uniform1i(uniforms.photo, 0);
  gl.uniform1i(uniforms.labelMap, 1);
  drawWarp();
}

// All the pieces, bottom to top; a moved piece with its soft shadow under it
function drawWarp() {
  if (!warpGl || !warp) return;
  const { gl, program, positions, uniforms } = warpGl;
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  const aPos = gl.getAttribLocation(program, "aPos");
  const shadow = Math.max(warp.w, warp.h) * SHADOW;
  for (const k of warp.order) {
    const piece = warp.pieces[k];
    for (let i = 0; i < positions.length; i++) positions[i] = warp.rest[i] + piece.off[i];
    gl.bindBuffer(gl.ARRAY_BUFFER, warpGl.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1f(uniforms.piece, k);
    if (piece.moved) {
      gl.uniform2f(uniforms.shift, shadow * 0.6, shadow);
      gl.uniform1f(uniforms.shadow, 0.22);
      gl.drawElements(gl.TRIANGLES, warpGl.count, gl.UNSIGNED_SHORT, 0);
    }
    gl.uniform2f(uniforms.shift, 0, 0);
    gl.uniform1f(uniforms.shadow, 0);
    gl.drawElements(gl.TRIANGLES, warpGl.count, gl.UNSIGNED_SHORT, 0);
  }
}

// ---------- Picking up a piece ----------

// The piece under the finger, from the top down: the triangle of its (moved) mesh the finger is in,
// and whether that spot of the photo belongs to the piece
function pieceUnder(p) {
  const { rest, triangles, labels } = warp;
  for (let o = warp.order.length - 1; o >= 0; o--) {
    const k = warp.order[o];
    const off = warp.pieces[k].off;
    for (let t = 0; t < triangles.length; t += 3) {
      const a = triangles[t] * 2;
      const b = triangles[t + 1] * 2;
      const c = triangles[t + 2] * 2;
      const ax = rest[a] + off[a], ay = rest[a + 1] + off[a + 1];
      const bx = rest[b] + off[b], by = rest[b + 1] + off[b + 1];
      const cx = rest[c] + off[c], cy = rest[c + 1] + off[c + 1];
      const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (!d) continue;
      const l1 = ((by - cy) * (p.x - cx) + (cx - bx) * (p.y - cy)) / d;
      const l2 = ((cy - ay) * (p.x - cx) + (ax - cx) * (p.y - cy)) / d;
      const l3 = 1 - l1 - l2;
      if (l1 < 0 || l2 < 0 || l3 < 0) continue;
      // where on the photo: is it this piece, and rug (not paper)?
      const u = (rest[a] * l1 + rest[b] * l2 + rest[c] * l3) / warp.w;
      const v = (rest[a + 1] * l1 + rest[b + 1] * l2 + rest[c + 1] * l3) / warp.h;
      const lx = Math.min(labels.w - 1, Math.max(0, Math.floor(u * labels.w)));
      const ly = Math.min(labels.h - 1, Math.max(0, Math.floor(v * labels.h)));
      if (labels.data[ly * labels.w + lx] === k) return k;
    }
  }
  return null;
}

// ---------- Bending and twisting with the finger ----------

let shaping = null; // { piece, last, heading } while the finger is down

function bend(p) {
  const dx = p.x - shaping.last.x;
  const dy = p.y - shaping.last.y;
  if (Math.hypot(dx, dy) < 0.5) return;
  const reach = Math.max(warp.w, warp.h) * STROKE_SHAPES[strokeShape].reach;
  const heading = Math.atan2(dy, dx);
  // how much the finger turned since its last step: circling turns it steadily, a straight drag not
  let turn = shaping.heading === null ? 0 : heading - shaping.heading;
  if (turn > Math.PI) turn -= Math.PI * 2;
  if (turn < -Math.PI) turn += Math.PI * 2;
  const rest = warp.rest;
  const piece = warp.pieces[shaping.piece];
  const off = piece.off;
  for (let i = 0; i < rest.length; i += 2) {
    const x = rest[i] + off[i];
    const y = rest[i + 1] + off[i + 1];
    const d2 = (x - shaping.last.x) * (x - shaping.last.x) + (y - shaping.last.y) * (y - shaping.last.y);
    const pull = Math.exp(-d2 / (2 * reach * reach));
    if (pull < 0.002) continue;
    // carried along with the finger
    let nx = x + dx * pull * BEND_FOLLOW;
    let ny = y + dy * pull * BEND_FOLLOW;
    // and turned round it, as much as the finger turned
    if (turn) {
      const a = turn * TWIST * pull;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const rx = nx - p.x;
      const ry = ny - p.y;
      nx = p.x + rx * cos - ry * sin;
      ny = p.y + rx * sin + ry * cos;
    }
    off[i] = nx - rest[i];
    off[i + 1] = ny - rest[i + 1];
  }
  piece.moved = true;
  shaping.last = p;
  shaping.heading = heading;
  redrawWarp();
}

// Drawn once per frame, however much the finger moved
let warpDrawing = null;
function redrawWarp() {
  if (!warpDrawing)
    warpDrawing = requestAnimationFrame(() => {
      warpDrawing = null;
      drawWarp();
    });
}

const strokeShaping = {
  start(p) {
    if (!warp) return;
    const piece = pieceUnder(p);
    if (piece === null) return;
    // the piece picked up comes to the top
    warp.order = warp.order.filter((k) => k !== piece).concat(piece);
    shaping = { piece, last: p, heading: null };
  },
  to(p) {
    if (shaping) bend(p);
  },
  end() {
    shaping = null;
  },
  wipe() {
    if (!warp) return;
    warp.pieces.forEach((piece) => {
      piece.off.fill(0);
      piece.moved = false;
    });
    warp.order = warp.pieces.map((_, k) => k);
    drawWarp();
  },
};

// ---------- Shapes and colours ----------

const strokeRow = document.querySelector("[data-rug-options]");

function strokeDot(colour) {
  const s = document.createElement("span");
  s.className = "stroke-dot";
  s.style.setProperty("--a", `rgb(${colour.rgb})`);
  return s;
}

function markStroke() {
  const shape = STROKE_SHAPES[strokeShape];
  const colour = shape.colours[strokeColour[strokeShape]];
  rugInfo.querySelector("[data-rug-name]").textContent = `${STROKE_NAME} ${shape.name} ${colour.name}`;
  rugInfo.querySelector("[data-rug-designer]").textContent = `by ${STROKE_DESIGNER}`;
  const euro = document.createElement("span");
  euro.className = "rug-info__currency";
  euro.textContent = "€";
  const amount = String(STROKE_PRICE).replace(/\B(?=(\d{3})+$)/g, ".");
  rugInfo.querySelector("[data-rug-size]").replaceChildren(euro, ` ${amount}`);
}

function buildStrokeRow() {
  const shape = STROKE_SHAPES[strokeShape];
  makeStrip(strokeRow, shape.colours, {
    draw: strokeDot,
    choose: (colour) => {
      strokeColour[strokeShape] = shape.colours.indexOf(colour);
      showStroke(true);
    },
    start: strokeColour[strokeShape],
  });
  markStroke();
}

// Show the shape and colour picked (fade: a short fade between them, else at once)
async function showStroke(fade, whole = isWhole()) {
  const shape = STROKE_SHAPES[strokeShape];
  const colour = shape.colours[strokeColour[strokeShape]];
  markStroke();
  await changeRug(colour.src, { zoomOut: whole, fade });
  loadWarp(colour);
}

// A tap on the rug (js/carpet-collections.js): the next shape, round and round
async function nextStrokeShape() {
  strokeShape = (strokeShape + 1) % STROKE_SHAPES.length;
  buildStrokeRow();
  await showStroke(true);
}

// ---------- Coming on and going (js/carpet-collections.js) ----------

async function enterStroke(whole) {
  buildStrokeRow();
  await showStroke(false, whole);
  fingerPaint = strokeShaping;
}

function leaveStroke() {
  fingerPaint = null;
  shaping = null;
}
