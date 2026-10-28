/*
  Ripple Square by Patricia Urquiola: make your own rug. It starts as a blank 200 × 200 cm
  canvas with a single ripple on it; you add more, stroke by stroke, with a brush made from
  Ripple's own row of leaves (Ripple_01.svg): a band of ground with leaves standing across it,
  following the curve you draw, in the colourway picked in the row under the rug.

  - The brush is always the same width on the rug, zoomed in or out.
  - The rug's shape (the real Ripple's outline, in the 200 × 200 cm square) shows very faintly, so
    you see where to draw; strokes only show inside it.
  - The strokes are wool, not paint: their edges are soft, as pile spills over a little; each leaf
    is knotted by hand, a little different from the next, with a fine carved line round it; the
    wool's colour drifts gently lighter and darker; and the pile has its own texture of tiny tufts
    and soft mottling.
  - Double-tap to start again from the single ripple; picking another colourway starts again too,
    with the single ripple in that colourway.

  Needs js/carpet-viewer.js (changeRug, img, carpet, fingerPaint), js/carpet-strip.js and
  js/carpet-menu.js to be loaded first.
*/

const RIPPLE_NAME = "Ripple Square";
const RIPPLE_DESIGNER = "Patricia Urquiola";
const RIPPLE_SIZE = "200 × 200 cm";
const RIPPLE_PRICE = 12996;
const RIPPLE_CANVAS = "images/ripple-canvas.png"; // the blank 200 × 200 cm square, 1500 px a side
const RIPPLE_SHAPE = "images/ripple-shape.png";   // the real Ripple rug's outline (white where the rug is)

// The four colourways, ground and leaf as measured from their photos
const COLOURWAYS = [
  { name: "Rose Garden", ground: [231, 196, 186], leaf: [40, 79, 52] },
  { name: "Earth Glow", ground: [230, 195, 129], leaf: [72, 34, 22] },
  { name: "Lavender Root", ground: [136, 140, 151], leaf: [164, 110, 82] },
  { name: "Dune Shadow", ground: [70, 50, 40], leaf: [219, 202, 176] },
];

const RIPPLE_BAND = 260;     // how wide the band of leaves is, in pixels of the 1500 px canvas (about 35 cm)
// The brush, from Ripple_01.svg (its units): a band 87 high, a leaf every 24.33 along it, each leaf
// an ellipse 12.16 wide and 43.5 tall (half sizes), standing across the band
const BAND = { height: 87, every: 24.33, rx: 12.16, ry: 43.5 };
// The first ripple on the blank canvas: down the middle, barely curving (points on the 1500 px canvas)
const FIRST_RIPPLE = { from: [760, 60], bend: [720, 750], to: [760, 1440] };
const RUG_GHOST = "rgba(70, 50, 40, 0.04)"; // the rug's outline on the blank canvas: very faint
const WOOL_FUZZ = 3;         // how far the pile spills over a stroke's edges (canvas pixels): soft, not cut
const WOOL_TUFTS = 7;        // how strongly the tiny tufts of knotted pile show (0..255 around the colour)
const WOOL_MOTTLE = 13;      // ... the pile's soft light and dark patches
const WOOL_DRIFT = 14;       // ... and the wool's colour drifting lighter and darker across the rug
const LEAF_VARY = 0.07;      // how much one hand-knotted leaf differs from the next (share of its size)
const LEAF_GROOVE = "rgba(0, 0, 0, 0.2)"; // the fine carved line round each leaf
const BRUSH_STEP = 0.12;     // the brush only moves on once the finger has gone this far (share of the band's
                             // width): a slowing or resting finger jitters, and those tiny moves in random
                             // directions would fan the band out into thin spikes

const rippleCanvas = carpet.querySelector(".carpet__paint");
const rippleCtx = rippleCanvas.getContext("2d");

let chosenWay = 0; // the colourway picked in the row

// ---------- The layers ----------

// done: the strokes so far. band and leaves: the stroke being drawn, apart, so its band never
// covers its own leaves where it curves. stroke: the two put together, the leaves cut to the band
// (so the stroke ends in a straight cut, like the rug's own bands). mix: everything together, cut
// to the rug's shape. woven: mix with the wool laid over it. shape: the rug's outline; ghost: the
// outline as it shows on the blank canvas. pile, drift: tiles of wool texture (fine, and large).
let own = null;

const rugShape = new Image();
const rugShapeLoaded = new Promise((done) => {
  rugShape.onload = rugShape.onerror = done;
  rugShape.src = RIPPLE_SHAPE;
});

function setUpOwn() {
  const size = img.naturalWidth;
  const layer = () => {
    const c = document.createElement("canvas");
    c.width = size;
    c.height = img.naturalHeight;
    return c;
  };
  own = { w: size, h: img.naturalHeight, done: layer(), band: layer(), leaves: layer(), stroke: layer(), mix: layer(), woven: layer(), shape: layer(), ghost: layer() };
  own.pile = woolTile(240, [[48, WOOL_MOTTLE], [120, WOOL_MOTTLE * 0.6]], true);
  own.drift = woolTile(500, [[3, WOOL_DRIFT], [7, WOOL_DRIFT * 0.5]], false);
  // the rug's outline, filling the square; and its faint ghost
  const shape = own.shape.getContext("2d");
  if (rugShape.naturalWidth) shape.drawImage(rugShape, 0, 0, own.w, own.h);
  else shape.fillRect(0, 0, own.w, own.h); // (no outline to hand: the whole square)
  const ghost = own.ghost.getContext("2d");
  ghost.fillStyle = RUG_GHOST;
  ghost.fillRect(0, 0, own.w, own.h);
  ghost.globalCompositeOperation = "destination-in";
  ghost.drawImage(own.shape, 0, 0);
  rippleCanvas.width = own.w;
  rippleCanvas.height = own.h;
}

// A square of wool texture that repeats seamlessly: grey around the middle, so laid over the
// colours (soft light) it makes them a little lighter or darker. layers: [how many patches across,
// how strong], each smooth noise; tufts: the tiny round tufts of knotted pile, row after row
function woolTile(size, layers, tufts) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const image = ctx.createImageData(size, size);
  const value = new Float32Array(size * size).fill(128);
  for (const [cells, strength] of layers) {
    const grid = Array.from({ length: cells * cells }, () => Math.random() * 2 - 1);
    const at = (gx, gy) => grid[((gy + cells) % cells) * cells + ((gx + cells) % cells)];
    const ease = (t) => t * t * (3 - 2 * t);
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * cells;
      const gy = Math.floor(fy);
      const ty = ease(fy - gy);
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * cells;
        const gx = Math.floor(fx);
        const tx = ease(fx - gx);
        const top = at(gx, gy) + (at(gx + 1, gy) - at(gx, gy)) * tx;
        const bottom = at(gx, gy + 1) + (at(gx + 1, gy + 1) - at(gx, gy + 1)) * tx;
        value[y * size + x] += (top + (bottom - top) * ty) * strength;
      }
    }
  }
  if (tufts) {
    // a tuft every 4 pixels (about half a centimetre), each row shifted half a tuft, each tuft a
    // little brighter at its tip, and a fibre or two of grain
    const every = 4;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const row = Math.floor(y / every);
        const ox = (x + (row % 2) * (every / 2)) % every - every / 2 + 0.5;
        const oy = (y % every) - every / 2 + 0.5;
        const tip = 1 - Math.min(1, Math.hypot(ox, oy) / (every * 0.6));
        value[y * size + x] += (tip - 0.4) * WOOL_TUFTS + (Math.random() - 0.5) * WOOL_TUFTS;
      }
    }
  }
  for (let i = 0; i < size * size; i++) {
    image.data[i * 4] = image.data[i * 4 + 1] = image.data[i * 4 + 2] = Math.max(0, Math.min(255, value[i]));
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return c;
}

// Show a part of the rug: the rug's faint outline, and over it the strokes (only inside the
// outline) with the wool laid over them
function drawOwn(left, top, right, bottom) {
  left = Math.max(0, Math.floor(left));
  top = Math.max(0, Math.floor(top));
  right = Math.min(own.w, Math.ceil(right));
  bottom = Math.min(own.h, Math.ceil(bottom));
  const w = right - left;
  const h = bottom - top;
  if (w <= 0 || h <= 0) return;
  joinStroke(left, top, w, h);
  const mix = own.mix.getContext("2d");
  mix.clearRect(left, top, w, h);
  mix.drawImage(own.done, left, top, w, h, left, top, w, h);
  mix.drawImage(own.stroke, left, top, w, h, left, top, w, h);
  mix.save();
  mix.globalCompositeOperation = "destination-in"; // only inside the rug's outline
  mix.drawImage(own.shape, left, top, w, h, left, top, w, h);
  mix.restore();
  const woven = own.woven.getContext("2d");
  woven.save();
  // only this part: cutting the wool to the strokes' shape would otherwise clear the whole canvas
  woven.beginPath();
  woven.rect(left, top, w, h);
  woven.clip();
  woven.clearRect(left, top, w, h);
  woven.drawImage(own.mix, left, top, w, h, left, top, w, h);
  woven.globalCompositeOperation = "soft-light"; // the wool: a little lighter here, darker there
  woven.fillStyle = woven.createPattern(own.pile, "repeat");
  woven.fillRect(left, top, w, h);
  woven.fillStyle = woven.createPattern(own.drift, "repeat");
  woven.fillRect(left, top, w, h);
  woven.globalCompositeOperation = "destination-in"; // the wool only on the strokes
  woven.drawImage(own.mix, left, top, w, h, left, top, w, h);
  woven.restore();
  const ctx = rippleCtx;
  ctx.clearRect(left, top, w, h);
  ctx.drawImage(own.ghost, left, top, w, h, left, top, w, h);
  ctx.drawImage(own.woven, left, top, w, h, left, top, w, h);
}

function drawAll() {
  drawOwn(0, 0, own.w, own.h);
}

// The stroke being drawn, in a part of the canvas: its band, with its leaves only where the band is
function joinStroke(left, top, w, h) {
  const stroke = own.stroke.getContext("2d");
  stroke.save();
  stroke.clearRect(left, top, w, h);
  stroke.drawImage(own.band, left, top, w, h, left, top, w, h);
  stroke.globalCompositeOperation = "source-atop";
  stroke.drawImage(own.leaves, left, top, w, h, left, top, w, h);
  stroke.restore();
}

// Redrawn once per frame, however much the finger moved
let rippleDirty = null;
let rippleDrawing = null;
function markDirtyRug(left, top, right, bottom) {
  rippleDirty = rippleDirty
    ? { left: Math.min(rippleDirty.left, left), top: Math.min(rippleDirty.top, top), right: Math.max(rippleDirty.right, right), bottom: Math.max(rippleDirty.bottom, bottom) }
    : { left, top, right, bottom };
  if (!rippleDrawing)
    rippleDrawing = requestAnimationFrame(() => {
      rippleDrawing = null;
      const { left, top, right, bottom } = rippleDirty;
      rippleDirty = null;
      drawOwn(left, top, right, bottom);
    });
}

// ---------- The brush ----------

let stroke = null; // { last, points (the path so far), next (how far along until the next leaf), way }

// (the first leaf waits for the finger to move, so it knows which way to stand)
function ownStart(p, way = COLOURWAYS[chosenWay]) {
  stroke = { last: p, points: [p], next: 0, way };
}

// The brush moved: the band runs on along the finger, with a leaf standing across it at every step
function ownTo(p) {
  const size = RIPPLE_BAND / BAND.height; // canvas pixels per unit of the brush
  const from = stroke.last;
  const dx = p.x - from.x;
  const dy = p.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < RIPPLE_BAND * BRUSH_STEP) return; // a tiny move: wait until the finger has really gone on
  stroke.points.push(p);
  // the band: the whole path so far, as one smooth line (no seams or slivers where it bends), its
  // edges soft: a little wider and fainter first, as pile spilling over
  const band = own.band.getContext("2d");
  band.clearRect(0, 0, own.w, own.h);
  band.strokeStyle = `rgb(${stroke.way.ground})`;
  band.lineCap = "butt";
  band.lineJoin = "round";
  band.beginPath();
  band.moveTo(stroke.points[0].x, stroke.points[0].y);
  for (let k = 1; k < stroke.points.length; k++) band.lineTo(stroke.points[k].x, stroke.points[k].y);
  for (const [wider, alpha] of [[2, 0.35], [1, 0.55], [0, 1]]) {
    band.globalAlpha = alpha;
    band.lineWidth = BAND.height * size + WOOL_FUZZ * wider;
    band.stroke();
  }
  band.globalAlpha = 1;
  const leaves = own.leaves.getContext("2d");
  const angle = Math.atan2(dy, dx);
  let at = stroke.next;
  while (at <= length) {
    const t = at / length;
    knotLeaf(leaves, from.x + dx * t, from.y + dy * t, angle, size, stroke.way.leaf);
    at += BAND.every * size;
  }
  stroke.next = at - length;
  stroke.last = p;
  const reach = BAND.height * size;
  markDirtyRug(Math.min(from.x, p.x) - reach, Math.min(from.y, p.y) - reach, Math.max(from.x, p.x) + reach, Math.max(from.y, p.y) + reach);
}

// One leaf, knotted by hand: a little wider or narrower, longer or shorter and tilted than the
// last, its outline not quite a perfect curve, its wool a touch lighter or darker; its edge soft,
// with a fine carved line round it
function knotLeaf(ctx, x, y, angle, size, rgb) {
  const vary = () => (Math.random() * 2 - 1) * LEAF_VARY;
  const rx = BAND.rx * size * (1 + vary());
  const ry = BAND.ry * size * (1 + vary() * 0.6);
  const w1 = Math.random() * 6.3;
  const w2 = Math.random() * 6.3;
  const shade = 1 + vary() * 0.8;
  const outline = (grow) => {
    ctx.beginPath();
    for (let k = 0; k <= 48; k++) {
      const a = (k / 48) * Math.PI * 2;
      const wobble = 1 + 0.02 * Math.sin(3 * a + w1) + 0.012 * Math.sin(5 * a + w2);
      const px = Math.cos(a) * (rx * wobble + grow);
      const py = Math.sin(a) * (ry * wobble + grow);
      if (k) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.closePath();
  };
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle + vary() * 0.8);
  ctx.fillStyle = `rgb(${rgb.map((c) => Math.round(Math.min(255, c * shade))).join(",")})`;
  ctx.globalAlpha = 0.45; // the soft edge
  outline(WOOL_FUZZ * 0.7);
  ctx.fill();
  ctx.globalAlpha = 1;
  outline(0);
  ctx.fill();
  ctx.strokeStyle = LEAF_GROOVE;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.restore();
}

// The stroke is finished: it joins the ones before (its leaves cut to its band)
function ownEnd() {
  joinStroke(0, 0, own.w, own.h);
  own.done.getContext("2d").drawImage(own.stroke, 0, 0);
  ["band", "leaves", "stroke"].forEach((layer) => own[layer].getContext("2d").clearRect(0, 0, own.w, own.h));
}

// The single ripple the blank canvas starts with: a gentle curve, drawn like a stroke
function firstRipple() {
  const { from, bend, to } = FIRST_RIPPLE;
  const way = chosenWay;
  const at = (t) => ({
    x: (1 - t) * (1 - t) * from[0] + 2 * (1 - t) * t * bend[0] + t * t * to[0],
    y: (1 - t) * (1 - t) * from[1] + 2 * (1 - t) * t * bend[1] + t * t * to[1],
  });
  ownStart(at(0), COLOURWAYS[way]);
  for (let k = 1; k <= 160; k++) ownTo(at(k / 160));
  ownEnd();
  stroke = null;
}

// Back to the blank canvas with its single ripple
function startOver() {
  ["done", "band", "leaves", "stroke"].forEach((layer) => own[layer].getContext("2d").clearRect(0, 0, own.w, own.h));
  firstRipple();
  drawAll();
}

// A new colourway picked: a fresh canvas, with its single ripple in that colourway
function pickWay(way) {
  chosenWay = COLOURWAYS.indexOf(way);
  if (own) startOver();
}

// The finger on the rug (js/carpet-viewer.js)
const ripplePaint = {
  start(p) {
    if (own) ownStart(p);
  },
  to(p) {
    if (stroke) ownTo(p);
  },
  end() {
    if (stroke) ownEnd();
    stroke = null;
  },
  wipe() {
    if (own) startOver();
  },
};

// ---------- The row: the colourways ----------

const rippleRow = document.querySelector("[data-rug-options]");

// A colourway: a rounded square, its ground on the left and its leaf on the right
function waySwatch(way) {
  const s = document.createElement("span");
  s.className = "paint-swatch";
  s.style.setProperty("--a", `rgb(${way.ground})`);
  s.style.setProperty("--b", `rgb(${way.leaf})`);
  return s;
}

function markRipple() {
  rugInfo.querySelector("[data-rug-name]").textContent = RIPPLE_NAME;
  rugInfo.querySelector("[data-rug-designer]").textContent = `by ${RIPPLE_DESIGNER}`;
  const euro = document.createElement("span");
  euro.className = "rug-info__currency";
  euro.textContent = "€";
  const amount = String(RIPPLE_PRICE).replace(/\B(?=(\d{3})+$)/g, ".");
  rugInfo.querySelector("[data-rug-size]").replaceChildren(`${RIPPLE_SIZE} | `, euro, ` ${amount}`);
}

function buildRippleRow() {
  makeStrip(rippleRow, COLOURWAYS, { draw: waySwatch, choose: pickWay, start: chosenWay });
  markRipple();
}

// ---------- Coming on and going (js/carpet-collections.js) ----------

async function enterRipple(whole) {
  buildRippleRow();
  await changeRug(RIPPLE_CANVAS, { zoomOut: whole, fade: false });
  await rugShapeLoaded;
  if (!own) {
    setUpOwn();
    firstRipple();
  }
  drawAll();
  fingerPaint = ripplePaint;
}

function leaveRipple() {
  fingerPaint = null;
}

// A tap on the rug does nothing here (the finger draws)
function tapRipple() {}
