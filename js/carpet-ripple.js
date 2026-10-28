/*
  Ripple Square by Patricia Urquiola: make your own rug. It starts as a blank 200 × 200 cm
  canvas with a single ripple on it; you add more, stroke by stroke, with a brush made from
  Ripple's own row of leaves (Ripple_01.svg): a band of ground with leaves standing across it,
  following the curve you draw, in the colourway picked in the row under the rug.

  - The brush is always the same width on the rug, zoomed in or out.
  - Strokes only show inside the 200 × 200 cm square (its edge is invisible): the rug you make is
    never bigger than that.
  - The strokes are knotted wool: a fine woolly texture over their colours.
  - Double-tap to start again from the single ripple.

  Needs js/carpet-viewer.js (changeRug, img, carpet, fingerPaint), js/carpet-strip.js and
  js/carpet-menu.js to be loaded first.
*/

const RIPPLE_NAME = "Ripple Square";
const RIPPLE_DESIGNER = "Patricia Urquiola";
const RIPPLE_SIZE = "200 × 200 cm";
const RIPPLE_PRICE = 12996;
const RIPPLE_CANVAS = "images/ripple-canvas.png"; // the blank 200 × 200 cm square, 1500 px a side

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
// The first ripple on the blank canvas: a gentle curve across it (points on the 1500 px canvas)
const FIRST_RIPPLE = { way: 0, from: [220, 980], bend: [700, 520], to: [1290, 720] };
const WOOL_GRAIN = 0.16;     // how strongly the woolly texture shows on the strokes (0 = flat colour)

const rippleCanvas = carpet.querySelector(".carpet__paint");
const rippleCtx = rippleCanvas.getContext("2d");

let chosenWay = 0; // the colourway picked in the row

// ---------- The layers ----------

// done: the strokes so far. band and leaves: the stroke being drawn, apart, so its band never
// covers its own leaves where it curves. mix: all of them put together. wool: a tile of woolly
// texture laid over the strokes.
let own = null;

function setUpOwn() {
  const size = img.naturalWidth;
  const layer = () => {
    const c = document.createElement("canvas");
    c.width = size;
    c.height = img.naturalHeight;
    return c;
  };
  own = { w: size, h: img.naturalHeight, done: layer(), band: layer(), leaves: layer(), mix: layer(), wool: woolTile() };
  rippleCanvas.width = own.w;
  rippleCanvas.height = own.h;
}

// A small square of wool: fine light and dark specks, and soft tufts a few pixels across; it
// repeats over the strokes (only darkening, so the colours stay true)
function woolTile() {
  const size = 192;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const image = ctx.createImageData(size, size);
  const tufts = new Float32Array(size * size);
  for (let i = 0; i < 900; i++) {
    // soft tufts: little round blobs, a touch darker in the middle
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 2 + Math.random() * 4;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.hypot(dx, dy) / r;
        if (d > 1) continue;
        const px = (Math.floor(x + dx) + size) % size;
        const py = (Math.floor(y + dy) + size) % size;
        tufts[py * size + px] += (1 - d) * 0.35;
      }
    }
  }
  for (let i = 0; i < size * size; i++) {
    const shade = 1 - WOOL_GRAIN * Math.min(1, Math.random() * 0.6 + tufts[i] * 0.5);
    image.data[i * 4] = image.data[i * 4 + 1] = image.data[i * 4 + 2] = shade * 255;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return c;
}

// Show a part of the rug: the strokes, then the wool laid over them (only where there are strokes)
function drawOwn(left, top, right, bottom) {
  left = Math.max(0, Math.floor(left));
  top = Math.max(0, Math.floor(top));
  right = Math.min(own.w, Math.ceil(right));
  bottom = Math.min(own.h, Math.ceil(bottom));
  const w = right - left;
  const h = bottom - top;
  if (w <= 0 || h <= 0) return;
  const mix = own.mix.getContext("2d");
  mix.clearRect(left, top, w, h);
  mix.drawImage(own.done, left, top, w, h, left, top, w, h);
  mix.drawImage(own.band, left, top, w, h, left, top, w, h);
  mix.drawImage(own.leaves, left, top, w, h, left, top, w, h);
  const ctx = rippleCtx;
  ctx.save();
  // only this part: cutting the wool to the strokes' shape would otherwise clear the whole canvas
  ctx.beginPath();
  ctx.rect(left, top, w, h);
  ctx.clip();
  ctx.clearRect(left, top, w, h);
  ctx.drawImage(own.mix, left, top, w, h, left, top, w, h);
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = ctx.createPattern(own.wool, "repeat");
  ctx.fillRect(left, top, w, h);
  ctx.globalCompositeOperation = "destination-in"; // the wool only on the strokes
  ctx.drawImage(own.mix, left, top, w, h, left, top, w, h);
  ctx.restore();
}

function drawAll() {
  drawOwn(0, 0, own.w, own.h);
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

let stroke = null; // { last, next (how far along until the next leaf), way }

// (the first leaf waits for the finger to move, so it knows which way to stand)
function ownStart(p, way = COLOURWAYS[chosenWay]) {
  stroke = { last: p, next: 0, way };
}

// The brush moved: the band runs on along the finger, with a leaf standing across it at every step
function ownTo(p) {
  const size = RIPPLE_BAND / BAND.height; // canvas pixels per unit of the brush
  const from = stroke.last;
  const dx = p.x - from.x;
  const dy = p.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return;
  const band = own.band.getContext("2d");
  band.strokeStyle = `rgb(${stroke.way.ground})`;
  band.lineWidth = BAND.height * size;
  band.lineCap = "butt";
  band.lineJoin = "round";
  band.beginPath();
  band.moveTo(from.x, from.y);
  band.lineTo(p.x, p.y);
  band.stroke();
  const leaves = own.leaves.getContext("2d");
  leaves.fillStyle = `rgb(${stroke.way.leaf})`;
  const angle = Math.atan2(dy, dx);
  let at = stroke.next;
  while (at <= length) {
    const t = at / length;
    leaves.save();
    leaves.translate(from.x + dx * t, from.y + dy * t);
    leaves.rotate(angle);
    leaves.beginPath();
    leaves.ellipse(0, 0, BAND.rx * size, BAND.ry * size, 0, 0, Math.PI * 2);
    leaves.fill();
    leaves.restore();
    at += BAND.every * size;
  }
  stroke.next = at - length;
  stroke.last = p;
  const reach = BAND.height * size;
  markDirtyRug(Math.min(from.x, p.x) - reach, Math.min(from.y, p.y) - reach, Math.max(from.x, p.x) + reach, Math.max(from.y, p.y) + reach);
}

// The stroke is finished: it joins the ones before (band first, its leaves on top)
function ownEnd() {
  const done = own.done.getContext("2d");
  done.drawImage(own.band, 0, 0);
  done.drawImage(own.leaves, 0, 0);
  own.band.getContext("2d").clearRect(0, 0, own.w, own.h);
  own.leaves.getContext("2d").clearRect(0, 0, own.w, own.h);
}

// The single ripple the blank canvas starts with: a gentle curve, drawn like a stroke
function firstRipple() {
  const { way, from, bend, to } = FIRST_RIPPLE;
  const at = (t) => ({
    x: (1 - t) * (1 - t) * from[0] + 2 * (1 - t) * t * bend[0] + t * t * to[0],
    y: (1 - t) * (1 - t) * from[1] + 2 * (1 - t) * t * bend[1] + t * t * to[1],
  });
  ownStart(at(0), COLOURWAYS[way]);
  for (let k = 1; k <= 60; k++) ownTo(at(k / 60));
  ownEnd();
  stroke = null;
}

// Back to the blank canvas with its single ripple
function startOver() {
  ["done", "band", "leaves"].forEach((layer) => own[layer].getContext("2d").clearRect(0, 0, own.w, own.h));
  firstRipple();
  drawAll();
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
  makeStrip(rippleRow, COLOURWAYS, { draw: waySwatch, choose: (w) => (chosenWay = COLOURWAYS.indexOf(w)), start: chosenWay });
  markRipple();
}

// ---------- Coming on and going (js/carpet-collections.js) ----------

async function enterRipple(whole) {
  buildRippleRow();
  await changeRug(RIPPLE_CANVAS, { zoomOut: whole, fade: false });
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
