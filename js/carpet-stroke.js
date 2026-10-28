/*
  Stroke by Sabine Marcelis: rugs made of broad, brushed strokes, and you reshape them for good.
  Each rug is made of pieces: Stroke 1.0 of four strips, Stroke 2.0 of a straight panel with a sash
  folded across it, the runner of one long strip. Put your finger on a piece and pull: the piece
  bends as one thick, heavy band, like a strip of real rug dragged across the floor. Its width and
  its lines stay as they are (only its course bends), it moves less than your finger and trails
  behind, and it can't fold up tighter than wool would. The piece you move comes to the top, lying
  over the others with a soft shadow, and stays as you leave it. Double-tap to put the rug back.

  - Tap the rug for the next shape: Stroke 1.0, Stroke 2.0, the runner, and round again.
  - The row under the rug: the two colours of the shape on show.

  How: every piece has a spine, a line down its middle. Pulling moves the spine like a heavy rope
  (each stretch of it keeps its length, and it stays smoothly curved); every point of the piece
  keeps its place across the spine, so the band follows the spine without smearing. It's drawn
  with WebGL, each piece as a fine mesh over the photo cut to the piece's outline.

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
// The spines (lines down the middle) of 2.0's two pieces and of the runner
const SASH_SPINE = [[0.12, 0.1], [0.35, 0.25], [0.6, 0.45], [0.8, 0.62], [0.95, 0.78]];
const PANEL_SPINE = [[0.2, 0.05], [0.2, 0.5], [0.3, 0.85], [0.55, 0.88]];
const RUNNER_SPINE = [[0.5, 0], [0.5, 1]];

// The three shapes, each in its two colours (rgb: its main colour, for the dot in the row)
const STROKE_SHAPES = [
  {
    name: "1.0",
    colours: [
      { name: "Violet", src: "images/stroke-1-violet.jpg", rgb: [136, 117, 168], strips: STRIPS_VIOLET },
      { name: "Blue", src: "images/stroke-1-blue.jpg", rgb: [45, 96, 158], strips: STRIPS_BLUE },
    ],
  },
  {
    name: "2.0",
    colours: [
      { name: "Yellow", src: "images/stroke-2-yellow.jpg", rgb: [217, 185, 130], sash: SASH },
      { name: "Orange", src: "images/stroke-2-orange.jpg", rgb: [198, 98, 46], sash: SASH },
    ],
  },
  {
    name: "Runner",
    colours: [
      { name: "Yellow", src: "images/stroke-runner-yellow.jpg", rgb: [219, 182, 102] },
      { name: "Nude", src: "images/stroke-runner-nude.jpg", rgb: [210, 193, 172] },
    ],
  },
];

const HEAVY = 0.45;          // how far the held part of a piece moves for the finger's travel (lower = heavier)
const STIFF = 0.25;          // how stiffly a piece keeps its curve smooth (higher = gentler bends, never kinks)
const GRIP = 7;              // the floor holds a piece: parts further than this many spine points from the
                             // finger barely move, so the piece bends near the hand instead of sliding whole
const SLIDE = 0.04;          // ... though even the far end gives a little, so a long pull drags it along
const SPINE = 32;            // points along each piece's spine
const SOLVE = 24;            // rounds of keeping the spine's length and smoothness each move
const MESH = 80;             // mesh points along the rug's longer side (more = smoother bends)
const ROOM = 0.3;            // room round the rug for its moved pieces (share of its longer side)
const SHADOW = 0.008;        // how far a moved piece's shadow falls (share of the rug's longer side)
const LABELS = 1024;         // the map of which piece is where: this many points along its longer side

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

// A piece's spine, as points on the photo (u, v): down the middle between its seams, for a strip
function spineLine(colour, k) {
  if (colour.strips) {
    const seam = (j, v) => {
      const s = colour.strips;
      if (j < 0) return 2 * seam(0, v) - seam(1, v); // the outer edges: one strip's width further out
      if (j >= s.length) return 2 * seam(s.length - 1, v) - seam(s.length - 2, v);
      const [a, b, c] = s[j];
      return a + b * v + c * v * v;
    };
    const points = [];
    for (let i = 0; i <= 12; i++) {
      const v = i / 12;
      points.push([(seam(k - 1, v) + seam(k, v)) / 2, v]);
    }
    return points;
  }
  if (colour.sash) return k === 1 ? SASH_SPINE : PANEL_SPINE;
  return RUNNER_SPINE;
}

// Points along a line, evenly spaced along its length (in photo pixels)
function evenly(points, count) {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  const total = lengths[lengths.length - 1];
  const out = new Float32Array(count * 2);
  let j = 0;
  for (let i = 0; i < count; i++) {
    const at = (total * i) / (count - 1);
    while (j < points.length - 2 && lengths[j + 1] < at) j++;
    const f = (at - lengths[j]) / (lengths[j + 1] - lengths[j] || 1);
    out[i * 2] = points[j][0] + (points[j + 1][0] - points[j][0]) * f;
    out[i * 2 + 1] = points[j][1] + (points[j + 1][1] - points[j][1]) * f;
  }
  return out;
}

// The way across the spine at each of its points (perpendicular to it)
function acrossSpine(spine) {
  const n = spine.length / 2;
  const across = new Float32Array(spine.length);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    const tx = spine[b * 2] - spine[a * 2];
    const ty = spine[b * 2 + 1] - spine[a * 2 + 1];
    const l = Math.hypot(tx, ty) || 1;
    across[i * 2] = -ty / l;
    across[i * 2 + 1] = tx / l;
  }
  return across;
}

// ---------- The meshes: one per piece, all over the same photo ----------

// warp: { w, h, room, cols, rows, rest (x, y per mesh point), pieces, order (bottom to top),
// labels: { w, h, data (rgba: piece k is channel k) } }
// piece: { spine (now), restSpine, gaps (each stretch's length), bind (per mesh point: where along
// the spine, how far across), positions (where its mesh points are now), moved }
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
  // the map of which piece is where on the photo: one colour channel per piece, so the edges
  // between pieces come out smooth
  const lw = Math.round((LABELS * w) / Math.max(w, h));
  const lh = Math.round((LABELS * h) / Math.max(w, h));
  const labels = new Uint8Array(lw * lh * 4);
  for (let y = 0; y < lh; y++) {
    for (let x = 0; x < lw; x++) labels[(y * lw + x) * 4 + pieceAt(colour, (x + 0.5) / lw, (y + 0.5) / lh)] = 255;
  }
  warp = { w, h, room: Math.max(w, h) * ROOM, cols, rows, rest, order: [], labels: { w: lw, h: lh, data: labels } };
  warp.pieces = Array.from({ length: count }, (_, k) => makePiece(spineLine(colour, k).map(([u, v]) => [u * w, v * h])));
  warp.order = warp.pieces.map((_, k) => k);
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

// A piece: its spine, and every mesh point tied to it (where along it, how far across it)
function makePiece(line) {
  const restSpine = evenly(line, SPINE);
  const across = acrossSpine(restSpine);
  const gaps = new Float32Array(SPINE - 1);
  for (let i = 0; i < SPINE - 1; i++) gaps[i] = Math.hypot(restSpine[i * 2 + 2] - restSpine[i * 2], restSpine[i * 2 + 3] - restSpine[i * 2 + 1]);
  const rest = warp.rest;
  const bind = new Float32Array(rest.length);
  for (let p = 0; p < rest.length; p += 2) {
    // the nearest place on the spine (beyond its ends too, along its first and last stretch)
    let best = Infinity;
    for (let i = 0; i < SPINE - 1; i++) {
      const ax = restSpine[i * 2], ay = restSpine[i * 2 + 1];
      const dx = restSpine[i * 2 + 2] - ax, dy = restSpine[i * 2 + 3] - ay;
      let f = ((rest[p] - ax) * dx + (rest[p + 1] - ay) * dy) / (dx * dx + dy * dy);
      if (i > 0) f = Math.max(0, f);
      if (i < SPINE - 2) f = Math.min(1, f);
      const d = Math.hypot(rest[p] - (ax + dx * f), rest[p + 1] - (ay + dy * f));
      if (d < best) {
        best = d;
        bind[p] = i + f;
      }
    }
    // how far across: measured along the spine's crosswise direction there
    const i = Math.min(SPINE - 2, Math.max(0, Math.floor(bind[p])));
    const f = bind[p] - i;
    const sx = restSpine[i * 2] + (restSpine[i * 2 + 2] - restSpine[i * 2]) * f;
    const sy = restSpine[i * 2 + 1] + (restSpine[i * 2 + 3] - restSpine[i * 2 + 1]) * f;
    const nx = across[i * 2] + (across[i * 2 + 2] - across[i * 2]) * f;
    const ny = across[i * 2 + 1] + (across[i * 2 + 3] - across[i * 2 + 1]) * f;
    bind[p + 1] = (rest[p] - sx) * nx + (rest[p + 1] - sy) * ny;
  }
  const piece = { spine: restSpine.slice(), restSpine, gaps, bind, positions: rest.slice(), moved: false };
  return piece;
}

// Where every mesh point of a piece is now: at its place along the spine, as far across as before
function skin(piece) {
  const { spine, bind, positions } = piece;
  const across = acrossSpine(spine);
  for (let p = 0; p < bind.length; p += 2) {
    const i = Math.min(SPINE - 2, Math.max(0, Math.floor(bind[p])));
    const f = bind[p] - i;
    const sx = spine[i * 2] + (spine[i * 2 + 2] - spine[i * 2]) * f;
    const sy = spine[i * 2 + 1] + (spine[i * 2 + 3] - spine[i * 2 + 1]) * f;
    let nx = across[i * 2] + (across[i * 2 + 2] - across[i * 2]) * f;
    let ny = across[i * 2 + 1] + (across[i * 2 + 3] - across[i * 2 + 1]) * f;
    const l = Math.hypot(nx, ny) || 1;
    positions[p] = sx + (nx / l) * bind[p + 1];
    positions[p + 1] = sy + (ny / l) * bind[p + 1];
  }
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
uniform vec4 uPiece;
uniform float uShadow;
varying vec2 vUv;
void main() {
  // only this piece's part of the photo, with a smooth edge
  float mine = dot(texture2D(uLabels, vUv), uPiece);
  if (mine < 0.02) discard;
  // the photo's white paper turns see-through, so where pieces overlap, only rug shows
  vec4 c = texture2D(uPhoto, vUv);
  float a = clamp((0.975 - (c.r + c.g + c.b) / 3.0) / 0.03, 0.0, 1.0) * mine;
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
  const texture = () => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
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
    photo: texture(),
    labels: texture(),
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
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, warpGl.photo);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, warpGl.labels);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, warp.labels.w, warp.labels.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, warp.labels.data);

  // where on the photo each mesh point is, and the triangles between the points
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
  const { gl, program, uniforms } = warpGl;
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  const aPos = gl.getAttribLocation(program, "aPos");
  const shadow = Math.max(warp.w, warp.h) * SHADOW;
  for (const k of warp.order) {
    const piece = warp.pieces[k];
    gl.bindBuffer(gl.ARRAY_BUFFER, warpGl.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, piece.positions, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.uniform4f(uniforms.piece, k === 0 ? 1 : 0, k === 1 ? 1 : 0, k === 2 ? 1 : 0, k === 3 ? 1 : 0);
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

// The piece under the finger, from the top down: the triangle of its mesh the finger is in, and
// whether that spot of the photo belongs to the piece
function pieceUnder(p) {
  const { rest, triangles, labels } = warp;
  for (let o = warp.order.length - 1; o >= 0; o--) {
    const k = warp.order[o];
    const pos = warp.pieces[k].positions;
    for (let t = 0; t < triangles.length; t += 3) {
      const a = triangles[t] * 2;
      const b = triangles[t + 1] * 2;
      const c = triangles[t + 2] * 2;
      const ax = pos[a], ay = pos[a + 1], bx = pos[b], by = pos[b + 1], cx = pos[c], cy = pos[c + 1];
      const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (!d) continue;
      const l1 = ((by - cy) * (p.x - cx) + (cx - bx) * (p.y - cy)) / d;
      const l2 = ((cy - ay) * (p.x - cx) + (ax - cx) * (p.y - cy)) / d;
      const l3 = 1 - l1 - l2;
      if (l1 < 0 || l2 < 0 || l3 < 0) continue;
      // where on the photo: is it this piece?
      const u = (rest[a] * l1 + rest[b] * l2 + rest[c] * l3) / warp.w;
      const v = (rest[a + 1] * l1 + rest[b + 1] * l2 + rest[c + 1] * l3) / warp.h;
      const lx = Math.min(labels.w - 1, Math.max(0, Math.floor(u * labels.w)));
      const ly = Math.min(labels.h - 1, Math.max(0, Math.floor(v * labels.h)));
      if (labels.data[(ly * labels.w + lx) * 4 + k] > 127) return k;
    }
  }
  return null;
}

// ---------- Pulling a piece ----------

let shaping = null; // { piece, held (the spine point held), last } while the finger is down

// The finger moved: the held point of the spine follows (less far: the piece is heavy), and the
// rest of the spine follows it like a heavy rope, keeping its length and a smooth curve
function pull(p) {
  const piece = warp.pieces[shaping.piece];
  const spine = piece.spine;
  const g = shaping.held;
  const tx = spine[g * 2] + (p.x - shaping.last.x) * HEAVY;
  const ty = spine[g * 2 + 1] + (p.y - shaping.last.y) * HEAVY;
  // how freely each spine point moves: freely near the finger, held by the floor further away
  const give = (i) => (i === g ? 0 : SLIDE + Math.exp(-Math.abs(i - g) / GRIP));
  for (let round = 0; round < SOLVE; round++) {
    spine[g * 2] = tx;
    spine[g * 2 + 1] = ty;
    // each stretch keeps its length; the freer end of it gives more (the held point doesn't give)
    for (let i = 0; i < SPINE - 1; i++) {
      const ax = spine[i * 2], ay = spine[i * 2 + 1];
      const bx = spine[i * 2 + 2], by = spine[i * 2 + 3];
      const d = Math.hypot(bx - ax, by - ay) || 1;
      const diff = (d - piece.gaps[i]) / d;
      const ga = give(i);
      const gb = give(i + 1);
      const wa = ga / (ga + gb || 1);
      const wb = gb / (ga + gb || 1);
      spine[i * 2] += (bx - ax) * diff * wa;
      spine[i * 2 + 1] += (by - ay) * diff * wa;
      spine[i * 2 + 2] -= (bx - ax) * diff * wb;
      spine[i * 2 + 3] -= (by - ay) * diff * wb;
    }
    // and the curve stays smooth: no kinks, never folded up tight
    for (let i = 1; i < SPINE - 1; i++) {
      if (i === g) continue;
      spine[i * 2] += ((spine[i * 2 - 2] + spine[i * 2 + 2]) / 2 - spine[i * 2]) * STIFF;
      spine[i * 2 + 1] += ((spine[i * 2 - 1] + spine[i * 2 + 3]) / 2 - spine[i * 2 + 1]) * STIFF;
    }
  }
  skin(piece);
  piece.moved = true;
  shaping.last = p;
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
    const k = pieceUnder(p);
    if (k === null) return;
    // the piece picked up comes to the top; it's held at the spine point nearest the finger
    warp.order = warp.order.filter((j) => j !== k).concat(k);
    const spine = warp.pieces[k].spine;
    let held = 0;
    for (let i = 1; i < SPINE; i++) {
      if (Math.hypot(spine[i * 2] - p.x, spine[i * 2 + 1] - p.y) < Math.hypot(spine[held * 2] - p.x, spine[held * 2 + 1] - p.y)) held = i;
    }
    shaping = { piece: k, held, last: p };
  },
  to(p) {
    if (shaping) pull(p);
  },
  end() {
    shaping = null;
  },
  wipe() {
    if (!warp) return;
    warp.pieces.forEach((piece) => {
      piece.spine.set(piece.restSpine);
      skin(piece);
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
