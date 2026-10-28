/*
  Stroke by Sabine Marcelis: rugs made of broad, brushed strokes, and you can shape them. Drag your
  finger over the rug and its strokes bend along with it, like ribbons or reeds; move it round in a
  circle and they twist into a knot, like the knot in the Stroke runner. The rug's outline bends
  with them. Let go, and the rug slowly relaxes back to its own shape. Double-tap to straighten it
  at once.

  - Tap the rug for the next shape: Stroke 1.0 (the strips), Stroke 2.0 (the folded square), the
    runner, and round again.
  - The row under the rug: the two colours of the shape on show.

  The rug is drawn with WebGL as a fine mesh over its photo: the finger moves the mesh's points,
  the photo goes with them, like soft fabric.

  Needs js/carpet-viewer.js (changeRug, img, carpet, fingerPaint, isWhole), js/carpet-strip.js and
  js/carpet-menu.js to be loaded first.
*/

const STROKE_NAME = "Stroke";
const STROKE_DESIGNER = "Sabine Marcelis";
const STROKE_PRICE = 7344;

// The three shapes, each in its two colours (rgb: its main colour, for the dot in the row)
const STROKE_SHAPES = [
  {
    name: "1.0",
    colours: [
      { name: "Violet", src: "images/stroke-1-violet.jpg", rgb: [136, 117, 168] },
      { name: "Blue", src: "images/stroke-1-blue.jpg", rgb: [45, 96, 158] },
    ],
  },
  {
    name: "2.0",
    colours: [
      { name: "Yellow", src: "images/stroke-2-yellow.jpg", rgb: [217, 185, 130] },
      { name: "Orange", src: "images/stroke-2-orange.jpg", rgb: [198, 98, 46] },
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

const BEND_REACH = 0.13;     // how far round the finger the rug bends (share of the rug's longer side)
const BEND_FOLLOW = 0.9;     // how closely the rug follows the finger there (1 = exactly)
const TWIST = 0.4;           // how strongly circling the finger twists the strokes round it
const RELAX = 1.4;           // seconds for the rug to relax halfway back to its own shape
const MESH = 80;             // points along the rug's longer side (more = smoother bends)
const ROOM = 0.3;            // room round the rug for its bent parts (share of its longer side)

const warpCanvas = carpet.querySelector(".carpet__warp");

let strokeShape = 0;
const strokeColour = STROKE_SHAPES.map(() => 0); // the colour picked for each shape

// ---------- The mesh ----------

let warp = null; // { w, h, room, cols, rows, rest (x, y per point), off (how far each point moved) }
let warpGl = null; // { gl, program, positions, buffer, count, texture, size }

function makeMesh() {
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
  warp = { w, h, room: Math.max(w, h) * ROOM, cols, rows, rest, off: new Float32Array(rest.length) };
  // the canvas reaches past the rug on every side, so bent parts still show
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
varying vec2 vUv;
void main() {
  vUv = aUv;
  vec2 p = (aPos + uRoom) / uCanvas;
  gl_Position = vec4(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);
}`;

const WARP_FRAGMENT = `
precision mediump float;
uniform sampler2D uPhoto;
varying vec2 vUv;
void main() {
  // the photo's white paper turns see-through, so where the rug folds over itself, only rug shows
  vec4 c = texture2D(uPhoto, vUv);
  float a = clamp((0.975 - (c.r + c.g + c.b) / 3.0) / 0.03, 0.0, 1.0);
  gl_FragColor = vec4(c.rgb * a, a);
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
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return { gl, program, texture, positionBuffer: gl.createBuffer(), uvBuffer: gl.createBuffer(), indexBuffer: gl.createBuffer() };
}

// A new photo: the mesh is made for its size, the photo goes on it, straight
function loadWarp() {
  if (!warpGl) warpGl = setUpWarpGl();
  if (!warpGl) return;
  makeMesh();
  const { gl, program } = warpGl;
  gl.viewport(0, 0, warpCanvas.width, warpCanvas.height);
  gl.bindTexture(gl.TEXTURE_2D, warpGl.texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

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
  warpGl.count = index.length;
  warpGl.positions = new Float32Array(rest.length);
  gl.bindBuffer(gl.ARRAY_BUFFER, warpGl.uvBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
  const aUv = gl.getAttribLocation(program, "aUv");
  gl.enableVertexAttribArray(aUv);
  gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, warpGl.indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(index), gl.STATIC_DRAW);
  gl.uniform2f(gl.getUniformLocation(program, "uCanvas"), warpCanvas.width, warpCanvas.height);
  gl.uniform1f(gl.getUniformLocation(program, "uRoom"), warp.room);
  gl.uniform1i(gl.getUniformLocation(program, "uPhoto"), 0);
  drawWarp();
}

function drawWarp() {
  if (!warpGl || !warp) return;
  const { gl, program, positions } = warpGl;
  for (let i = 0; i < positions.length; i++) positions[i] = warp.rest[i] + warp.off[i];
  gl.bindBuffer(gl.ARRAY_BUFFER, warpGl.positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
  const aPos = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawElements(gl.TRIANGLES, warpGl.count, gl.UNSIGNED_SHORT, 0);
}

// ---------- Bending and twisting with the finger ----------

let shaping = null; // { last, heading } while the finger is down

function bend(p) {
  const dx = p.x - shaping.last.x;
  const dy = p.y - shaping.last.y;
  const moved = Math.hypot(dx, dy);
  if (moved < 0.5) return;
  const reach = Math.max(warp.w, warp.h) * BEND_REACH;
  const heading = Math.atan2(dy, dx);
  // how much the finger turned since its last step: circling turns it steadily, a straight drag not
  let turn = shaping.heading === null ? 0 : heading - shaping.heading;
  if (turn > Math.PI) turn -= Math.PI * 2;
  if (turn < -Math.PI) turn += Math.PI * 2;
  const { rest, off } = warp;
  for (let i = 0; i < rest.length; i += 2) {
    const x = rest[i] + off[i];
    const y = rest[i + 1] + off[i + 1];
    const d2 = (x - p.x) * (x - p.x) + (y - p.y) * (y - p.y);
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
  shaping.last = p;
  shaping.heading = heading;
  wakeWarp();
}

const strokeShaping = {
  start(p) {
    if (warp) shaping = { last: p, heading: null };
  },
  to(p) {
    if (shaping) bend(p);
  },
  end() {
    shaping = null;
    wakeWarp(); // relax back
  },
  wipe() {
    if (!warp) return;
    warp.off.fill(0);
    drawWarp();
  },
};

// Every frame while something moves: drawn, and relaxing back once the finger has lifted
let warpRunning = null;
let warpLast = 0;

function wakeWarp() {
  if (warpRunning) return;
  warpLast = performance.now();
  warpRunning = requestAnimationFrame(warpFrame);
}

function warpFrame(now) {
  const seconds = Math.min(0.05, (now - warpLast) / 1000);
  warpLast = now;
  let still = true;
  if (!shaping) {
    const keep = Math.pow(0.5, seconds / RELAX);
    const off = warp.off;
    for (let i = 0; i < off.length; i++) {
      off[i] *= keep;
      if (Math.abs(off[i]) > 0.3) still = false;
      else off[i] = 0;
    }
  }
  drawWarp();
  warpRunning = shaping || !still ? requestAnimationFrame(warpFrame) : null;
}

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
  markStroke();
  await changeRug(shape.colours[strokeColour[strokeShape]].src, { zoomOut: whole, fade });
  loadWarp();
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
