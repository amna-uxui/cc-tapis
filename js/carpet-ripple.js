/*
  Ripple Square by Patricia Urquiola: make your own rug. It starts as a blank 200 × 200 cm
  canvas with a single ripple on it; you add more, stroke by stroke, with a brush made from
  Ripple's own band of leaves, as on the real rug: a band of ground, and on it a row of tall,
  whole ovals side by side, touching each other at their middles, their tips nearly reaching the
  band's edges, so the ground shows only as narrow V's between them. The next band drawn over
  one half of them hides it, so the ovals look like arches, as on the rug. The band follows the curve you draw, in the
  colourway picked in the row under the rug.

  - The brush is always the same width on the rug, zoomed in or out. Its ovals widen with the
    finger's speed, as they vary on the real rug: slowly, slim and close; faster, broad.
  - The blank canvas starts with one ripple along the rug's top edge, showing how a band runs.
  - The rug's outline (the real Ripple's, in the 200 × 200 cm square) shows as a crisp, very faint
    hairline, so you see where to draw; strokes only show inside it.
  - The strokes are carpet, not paint, like the real rug close up: each leaf is thick pile, its
    edge rounding down into a carved groove that throws a little shadow on the ground; the pile
    runs in fine rows across the whole rug; the wool has the real rug's own texture (taken from its
    photo); the fibres make every edge a little ragged; the colour drifts gently lighter and darker;
    each hand-knotted leaf differs a little from the next; and the rug, as thick as wool, throws a
    soft shadow on the floor.
  - Picking another colourway turns the whole rug so far into it (every stroke stays just as it
    was drawn), and the next strokes are in it too.
  - Double-tap to start again from the single ripple.

  Needs js/carpet-viewer.js (changeRug, img, carpet, fingerPaint), js/carpet-strip.js and
  js/carpet-menu.js to be loaded first.
*/

const RIPPLE_NAME = "Ripple Square";
const RIPPLE_DESIGNER = "Patricia Urquiola";
const RIPPLE_SIZE = "200 × 200 cm";
const RIPPLE_PRICE = 12996;
const RIPPLE_CANVAS = "images/ripple-canvas.png"; // the blank 200 × 200 cm square, 1500 px a side
const RIPPLE_SHAPE = "images/ripple-shape.png";   // the real Ripple rug's outline (white where the rug is)
const RIPPLE_PILE = "images/ripple-pile.jpg";     // the real rug's wool, without its pattern (tools/ripple-pile.py)

// The four colourways, ground and leaf as measured from their photos
const COLOURWAYS = [
  { name: "Rose Garden", ground: [231, 196, 186], leaf: [40, 79, 52] },
  { name: "Earth Glow", ground: [230, 195, 129], leaf: [72, 34, 22] },
  { name: "Lavender Root", ground: [136, 140, 151], leaf: [164, 110, 82] },
  { name: "Dune Shadow", ground: [70, 50, 40], leaf: [219, 202, 176] },
];

const RIPPLE_BAND = 110;     // how wide the band is, in pixels of the 1500 px canvas (about 15 cm)
// The ovals, as measured on the real rug (shares of the band's width): half as wide as `wide`,
// half as tall as `tall`, one every `every` along the band (so they just touch)
const ARCH = { wide: 0.17, tall: 0.93, every: 0.32 };
// The first ripple on the blank canvas: along the rug's top edge, as the real rug's first band runs
// (points on the 1500 px canvas), its ovals pointing up to the edge; they broaden towards the
// middle and slim again
const FIRST_RIPPLE = { from: [330, 140], bend: [655, 190], to: [990, 118] };
// The rug's outline: a crisp hairline round it, very faint
const RUG_LINE = { colour: "rgba(60, 45, 35, 0.13)", width: 2 }; // colour, and how wide (canvas pixels)
// Sizes in pixels of the 1500 px canvas (7.5 to a centimetre)
const WOOL_FUZZ = 3;         // how far the pile spills over a stroke's outer edges
const FIBRES = 1;            // how ragged the fibres make every edge
const GROOVE = 1.5;          // the carved groove round each oval: how wide ..
const GROOVE_DARK = 0.05;    // .. and how dark (barely there)
const BEVEL = 7;             // how far in from its edge an oval's pile rounds down ..
const BEVEL_DARK = 0.12;     // .. and how much darker it gets there
const LEAF_SHADOW = 0.06;    // the shadow an oval throws on the ground round it
// The ovals broaden, as they vary on the real rug: drawn slowly they're slim; the faster the
// finger, the broader they grow and the further apart
const STRETCH_MOST = 1.7;    // the broadest an oval grows (times its slim width)
const STRETCH_SPEED = [0.35, 2.2]; // finger speed (canvas pixels a millisecond): no stretch .. the most
const STRETCH_EASE = 0.3;    // each leaf goes only this share of the way to the new stretch: gradual
const ROWS = { across: 69, down: -25, strength: 36 }; // the pile's rows: about every 3.5 px, slanting a little
const PILE_STRENGTH = 1;     // how strongly the real wool's texture shows (0..1)
const WOOL_DRIFT = 14;       // the wool's colour drifting lighter and darker across the rug (0..255)
const FLOOR_SHADOW = 0.18;   // the soft shadow the rug throws on the floor
const LEAF_VARY = 0.07;      // how much one hand-knotted leaf differs from the next (share of its size)
const BRUSH_STEP = 0.12;     // the brush only moves on once the finger has gone this far (share of the band's
                             // width): a slowing or resting finger jitters, and those tiny moves in random
                             // directions would fan the band out into thin spikes

const rippleCanvas = carpet.querySelector(".carpet__paint");
const rippleCtx = rippleCanvas.getContext("2d");

let chosenWay = 0; // the colourway picked in the row

// ---------- The layers ----------

// done: the strokes so far. band and leaves: the stroke being drawn, apart, so its band never
// covers its own leaves where it curves. reach: where the stroke's ovals may show (the band, its
// ends cut straight). stroke: the two put together, the leaves cut to the reach (so
// the stroke ends in a straight cut, like the rug's own bands). mix: everything together, cut
// to the rug's shape. woven: mix with the wool laid over it. fibres: woven with ragged edges, as
// shown. shape: the rug's outline; line: the hairline round it. floor: the rug's shadow on the
// floor. pile, rows, drift: tiles of wool texture (the real wool, its rows, its colour drifting).
let own = null;

// An image the canvas needs before it starts (it does without, if it fails to load)
function needImage(src) {
  const image = new Image();
  image.loaded = new Promise((done) => {
    image.onload = image.onerror = done;
  });
  image.src = src;
  return image;
}
const rugShape = needImage(RIPPLE_SHAPE);
const rugPile = needImage(RIPPLE_PILE);

function setUpOwn() {
  const size = img.naturalWidth;
  const layer = () => {
    const c = document.createElement("canvas");
    c.width = size;
    c.height = img.naturalHeight;
    return c;
  };
  own = { w: size, h: img.naturalHeight, strokes: [], done: layer(), band: layer(), leaves: layer(), reach: layer(), stroke: layer(), mix: layer(), woven: layer(), fibres: layer(), shape: layer(), line: layer(), floor: layer() };
  own.pile = rugPile.naturalWidth ? rugPile : greyTile(4);
  own.rows = rowsTile();
  own.drift = driftTile();
  own.wiggle = wiggleTable();
  // the rug's outline, filling the square
  const shape = own.shape.getContext("2d");
  if (rugShape.naturalWidth) shape.drawImage(rugShape, 0, 0, own.w, own.h);
  else shape.fillRect(0, 0, own.w, own.h); // (no outline to hand: the whole square)
  // and the hairline round it: the outline a little larger all round, less the outline itself
  const line = own.line.getContext("2d");
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    line.drawImage(own.shape, Math.cos(a) * RUG_LINE.width, Math.sin(a) * RUG_LINE.width);
  }
  line.globalCompositeOperation = "destination-out";
  line.drawImage(own.shape, 0, 0);
  line.globalCompositeOperation = "source-in";
  line.fillStyle = RUG_LINE.colour;
  line.fillRect(0, 0, own.w, own.h);
  rippleCanvas.width = own.w;
  rippleCanvas.height = own.h;
}

// A square of grey that repeats seamlessly, from a value per pixel (128 = leaves the colour as it is;
// laid over the colours as soft light, lighter makes them lighter, darker darker)
function greyTile(size, value = () => 128) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = Math.max(0, Math.min(255, value(x, y)));
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return c;
}

// Smooth noise that repeats every `cells` (-1..1)
function smoothNoise(cells) {
  const grid = Array.from({ length: cells * cells }, () => Math.random() * 2 - 1);
  const at = (gx, gy) => grid[(((gy % cells) + cells) % cells) * cells + (((gx % cells) + cells) % cells)];
  const ease = (t) => t * t * (3 - 2 * t);
  return (u, v) => {
    const fx = u * cells, fy = v * cells;
    const gx = Math.floor(fx), gy = Math.floor(fy);
    const tx = ease(fx - gx), ty = ease(fy - gy);
    const top = at(gx, gy) + (at(gx + 1, gy) - at(gx, gy)) * tx;
    const bottom = at(gx, gy + 1) + (at(gx + 1, gy + 1) - at(gx, gy + 1)) * tx;
    return top + (bottom - top) * ty;
  };
}

// The pile's rows: fine ridges slanting across the whole rug, never quite even (stronger here,
// fainter there, wavering a little)
function rowsTile() {
  const size = 256;
  const strength = smoothNoise(8);
  const waver = smoothNoise(4);
  return greyTile(size, (x, y) => {
    const u = x / size, v = y / size;
    const phase = (u * ROWS.across + v * ROWS.down + waver(u, v) * 0.6) * Math.PI * 2;
    const ridge = Math.sin(phase);
    return 128 + ROWS.strength * (0.65 + 0.35 * strength(u, v)) * ridge + (Math.random() - 0.5) * 10;
  });
}

// The wool's colour drifting lighter and darker, in big soft patches
function driftTile() {
  const size = 500;
  const big = smoothNoise(3);
  const less = smoothNoise(7);
  return greyTile(size, (x, y) => 128 + (big(x / size, y / size) + 0.5 * less(x / size, y / size)) * WOOL_DRIFT);
}

// Where each pixel takes its colour from, a pixel or two away: the fibres, making edges ragged
// (the same for every redraw, so nothing flickers)
function wiggleTable() {
  const table = new Int8Array(256 * 256 * 2);
  for (let i = 0; i < table.length; i++) table[i] = Math.round((Math.random() * 2 - 1) * FIBRES);
  return table;
}

// Show a part of the rug: its fine outline and its shadow on the floor, and over them the strokes
// (only inside the outline) with the wool laid over them and their edges ragged with fibres
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
  // the wool, a little past this part too (the fibres reach a pixel or two)
  const l2 = Math.max(0, left - FIBRES), t2 = Math.max(0, top - FIBRES);
  const w2 = Math.min(own.w, right + FIBRES) - l2, h2 = Math.min(own.h, bottom + FIBRES) - t2;
  const woven = own.woven.getContext("2d");
  woven.save();
  // only this part: cutting the wool to the strokes' shape would otherwise clear the whole canvas
  woven.beginPath();
  woven.rect(left, top, w, h);
  woven.clip();
  woven.clearRect(left, top, w, h);
  woven.drawImage(own.mix, left, top, w, h, left, top, w, h);
  woven.globalCompositeOperation = "soft-light"; // the wool: a little lighter here, darker there
  woven.globalAlpha = PILE_STRENGTH;
  woven.fillStyle = woven.createPattern(own.pile, "repeat");
  woven.fillRect(left, top, w, h);
  woven.globalAlpha = 1;
  woven.fillStyle = woven.createPattern(own.rows, "repeat");
  woven.fillRect(left, top, w, h);
  woven.fillStyle = woven.createPattern(own.drift, "repeat");
  woven.fillRect(left, top, w, h);
  woven.globalCompositeOperation = "destination-in"; // the wool only on the strokes
  woven.drawImage(own.mix, left, top, w, h, left, top, w, h);
  woven.restore();
  // the fibres: each pixel takes its colour from one a pixel or two away
  const from = woven.getImageData(l2, t2, w2, h2).data;
  const out = new ImageData(w, h);
  const to = out.data;
  const wiggle = own.wiggle;
  for (let y = 0; y < h; y++) {
    const gy = top + y;
    for (let x = 0; x < w; x++) {
      const gx = left + x;
      const k = (((gy & 255) << 8) | (gx & 255)) * 2;
      const sx = Math.min(w2 - 1, Math.max(0, gx + wiggle[k] - l2));
      const sy = Math.min(h2 - 1, Math.max(0, gy + wiggle[k + 1] - t2));
      const i = (sy * w2 + sx) * 4;
      const o = (y * w + x) * 4;
      to[o] = from[i];
      to[o + 1] = from[i + 1];
      to[o + 2] = from[i + 2];
      to[o + 3] = from[i + 3];
    }
  }
  own.fibres.getContext("2d").putImageData(out, left, top);
  const ctx = rippleCtx;
  ctx.clearRect(left, top, w, h);
  ctx.drawImage(own.line, left, top, w, h, left, top, w, h);
  ctx.drawImage(own.floor, left, top, w, h, left, top, w, h);
  ctx.drawImage(own.fibres, left, top, w, h, left, top, w, h);
}

// The rug's soft shadow on the floor (after each stroke): the strokes so far, blurred and dark,
// a little down and to the right
function layFloor() {
  const small = document.createElement("canvas");
  small.width = Math.round(own.w / 8);
  small.height = Math.round(own.h / 8);
  const s = small.getContext("2d");
  s.drawImage(own.done, 0, 0, small.width, small.height);
  s.globalCompositeOperation = "destination-in";
  s.drawImage(own.shape, 0, 0, small.width, small.height);
  s.globalCompositeOperation = "source-in";
  s.fillStyle = `rgba(0, 0, 0, ${FLOOR_SHADOW})`;
  s.fillRect(0, 0, small.width, small.height);
  const floor = own.floor.getContext("2d");
  floor.clearRect(0, 0, own.w, own.h);
  floor.imageSmoothingQuality = "high";
  floor.drawImage(small, 3, 6, own.w, own.h);
}

function drawAll() {
  drawOwn(0, 0, own.w, own.h);
}

// The stroke being drawn, in a part of the canvas: its ovals (only within its reach, so its ends
// are straight cuts), over its band
function joinStroke(left, top, w, h) {
  const stroke = own.stroke.getContext("2d");
  stroke.save();
  stroke.clearRect(left, top, w, h);
  stroke.drawImage(own.reach, left, top, w, h, left, top, w, h);
  stroke.globalCompositeOperation = "source-in";
  stroke.drawImage(own.leaves, left, top, w, h, left, top, w, h);
  stroke.globalCompositeOperation = "destination-over";
  stroke.drawImage(own.band, left, top, w, h, left, top, w, h);
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

// Every stroke is kept as it was drawn (its path, and each leaf: where, which way, how stretched,
// and its own small differences), so the rug can be drawn again in another colourway
let stroke = null; // the stroke being drawn: { last, points (the path so far), leaves, next (how far
                   //   along until the next leaf), time (of the last move), stretch (how wide the leaves are now) }

// (the first leaf waits for the finger to move, so it knows which way to stand)
function ownStart(p) {
  stroke = { last: p, points: [p], leaves: [], next: 0, time: performance.now(), stretch: 1 };
}

// The brush moved: the band runs on along the finger, with a leaf standing across it at every step
// (aim: how wide the leaves should grow; without it, as fast as the finger goes)
function ownTo(p, aim) {
  const from = stroke.last;
  const dx = p.x - from.x;
  const dy = p.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < RIPPLE_BAND * BRUSH_STEP) return; // a tiny move: wait until the finger has really gone on
  stroke.points.push(p);
  if (aim === undefined) {
    const now = performance.now();
    const speed = length / Math.max(1, now - stroke.time);
    stroke.time = now;
    const fast = Math.min(1, Math.max(0, (speed - STRETCH_SPEED[0]) / (STRETCH_SPEED[1] - STRETCH_SPEED[0])));
    aim = 1 + fast * (STRETCH_MOST - 1);
  }
  const way = COLOURWAYS[chosenWay];
  drawBand(stroke.points, way.ground);
  const leaves = own.leaves.getContext("2d");
  const angle = Math.atan2(dy, dx);
  // the ovals' middles: half a band to the right of the finger's path (the band's middle)
  const footX = (-dy / length) * (RIPPLE_BAND / 2);
  const footY = (dx / length) * (RIPPLE_BAND / 2);
  let at = stroke.next;
  while (at <= length) {
    const t = at / length;
    stroke.stretch += (aim - stroke.stretch) * STRETCH_EASE;
    const leaf = { x: from.x + dx * t + footX, y: from.y + dy * t + footY, angle, look: leafLook(stroke.stretch) };
    stroke.leaves.push(leaf);
    knotLeaf(leaves, leaf, way.leaf);
    // broader ovals, further apart, so they still just touch
    at += RIPPLE_BAND * ARCH.every * stroke.stretch;
  }
  stroke.next = at - length;
  stroke.last = p;
  const reach = RIPPLE_BAND * 1.6;
  markDirtyRug(Math.min(from.x, p.x) - reach, Math.min(from.y, p.y) - reach, Math.max(from.x, p.x) + reach, Math.max(from.y, p.y) + reach);
}

// The band: the whole path so far, as one smooth line (no seams or slivers where it bends): its
// pile spilling a little over its edges, and rounding down a little darker towards them
function drawBand(points, ground) {
  // the ground reaches from the ovals' tips on one side to their tips on the other
  const width = RIPPLE_BAND * (1 + ARCH.tall * 1.04);
  const path = new Path2D(linePath(points, (width - RIPPLE_BAND) / 2));
  const band = own.band.getContext("2d");
  band.clearRect(0, 0, own.w, own.h);
  band.lineCap = "butt";
  band.lineJoin = "round";
  for (const [wider, alpha, light] of [[2 * WOOL_FUZZ, 0.35, 0.95], [WOOL_FUZZ, 0.6, 0.96], [0, 1, 0.97], [-4, 1, 0.98], [-8, 1, 0.99], [-12, 1, 1]]) {
    band.globalAlpha = alpha;
    band.strokeStyle = `rgb(${ground.map((c) => Math.round(c * light))})`;
    band.lineWidth = width + wider;
    band.stroke(path);
  }
  band.globalAlpha = 1;
  // the reach: where the ovals may show (the band, its ends cut straight)
  const reach = own.reach.getContext("2d");
  reach.clearRect(0, 0, own.w, own.h);
  reach.lineCap = "butt";
  reach.lineJoin = "round";
  reach.strokeStyle = "black";
  reach.lineWidth = width + 2 * WOOL_FUZZ;
  reach.stroke(path);
}

// A line through the points as SVG path data, moved this far to its right (to the right of the way
// it's drawn: the ovals' side)
function linePath(points, aside) {
  return points
    .map((p, k) => {
      const a = points[Math.max(0, k - 1)];
      const b = points[Math.min(points.length - 1, k + 1)];
      const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return `${k ? "L" : "M"}${p.x + (-(b.y - a.y) / l) * aside} ${p.y + ((b.x - a.x) / l) * aside}`;
    })
    .join("");
}

// An oval knotted by hand: a little broader or slimmer, taller or shorter and tilted than the last,
// its outline not quite a perfect curve, its wool a touch lighter or darker
function leafLook(stretch) {
  const vary = () => (Math.random() * 2 - 1) * LEAF_VARY;
  return {
    rx: RIPPLE_BAND * ARCH.wide * stretch * (1 + vary()),
    ry: RIPPLE_BAND * ARCH.tall * (1 + vary() * 0.4),
    tilt: vary() * 0.4,
    w1: Math.random() * 6.3,
    w2: Math.random() * 6.3,
    shade: 1 + vary() * 0.8,
  };
}

// One oval, as thick pile, its middle at (leaf.x, leaf.y), its tips across the band: it
// throws a faint shadow on the ground round it, its edge is a faint carved groove, and inside the
// groove the pile rounds down a little.
function knotLeaf(ctx, leaf, rgb) {
  const { rx, ry, tilt, w1, w2, shade } = leaf.look;
  const outline = (grow) => {
    ctx.beginPath();
    for (let k = 0; k <= 64; k++) {
      const a = (k / 64) * Math.PI * 2;
      const wobble = 1 + 0.02 * Math.sin(3 * a + w1) + 0.012 * Math.sin(5 * a + w2);
      const px = Math.cos(a) * (rx * wobble + grow);
      const py = Math.sin(a) * (ry * wobble + grow);
      if (k) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.closePath();
  };
  ctx.save();
  ctx.translate(leaf.x, leaf.y);
  ctx.rotate(leaf.angle + tilt);
  // the leaf, and its shadow on the ground (the light from the top left)
  ctx.save();
  ctx.shadowColor = `rgba(0, 0, 0, ${LEAF_SHADOW})`;
  ctx.shadowBlur = 5;
  ctx.shadowOffsetX = 1.5;
  ctx.shadowOffsetY = 2.5;
  ctx.fillStyle = `rgb(${rgb.map((c) => Math.round(Math.min(255, c * shade))).join(",")})`;
  outline(0);
  ctx.fill();
  ctx.restore();
  // the pile rounding down towards the edge: a soft shade inside it, from a ring just outside
  ctx.save();
  outline(0);
  ctx.clip();
  ctx.shadowColor = `rgba(0, 0, 0, ${BEVEL_DARK})`;
  ctx.shadowBlur = BEVEL;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 2;
  ctx.lineWidth = BEVEL * 2;
  ctx.strokeStyle = "black";
  outline(BEVEL + 1);
  ctx.stroke();
  ctx.restore();
  // the carved groove
  ctx.strokeStyle = `rgba(0, 0, 0, ${GROOVE_DARK})`;
  ctx.lineWidth = GROOVE;
  outline(0);
  ctx.stroke();
  ctx.restore();
}

// A stroke joins the ones before (its leaves cut to its reach)
function layStroke() {
  joinStroke(0, 0, own.w, own.h);
  own.done.getContext("2d").drawImage(own.stroke, 0, 0);
  ["band", "leaves", "reach", "stroke"].forEach((layer) => own[layer].getContext("2d").clearRect(0, 0, own.w, own.h));
}

// The stroke is finished: it's kept, and joins the ones before
function ownEnd() {
  if (stroke.points.length > 1) own.strokes.push({ points: stroke.points, leaves: stroke.leaves });
  layStroke();
  layFloor();
  drawAll();
}

// Every stroke drawn again, just as it was, in the colourway picked now
function redrawStrokes() {
  const way = COLOURWAYS[chosenWay];
  own.done.getContext("2d").clearRect(0, 0, own.w, own.h);
  const leaves = own.leaves.getContext("2d");
  for (const kept of own.strokes) {
    drawBand(kept.points, way.ground);
    for (const leaf of kept.leaves) knotLeaf(leaves, leaf, way.leaf);
    layStroke();
  }
  layFloor();
  drawAll();
}

// The single ripple the blank canvas starts with: a gentle curve along the top, drawn like a stroke
function firstRipple() {
  const { from, bend, to } = FIRST_RIPPLE;
  const at = (t) => ({
    x: (1 - t) * (1 - t) * from[0] + 2 * (1 - t) * t * bend[0] + t * t * to[0],
    y: (1 - t) * (1 - t) * from[1] + 2 * (1 - t) * t * bend[1] + t * t * to[1],
  });
  ownStart(at(0));
  for (let k = 1; k <= 160; k++) ownTo(at(k / 160), 1 + (STRETCH_MOST - 1) * 0.75 * Math.sin((Math.PI * k) / 160));
  ownEnd();
  stroke = null;
}

// Back to the blank canvas with its single ripple
function startOver() {
  own.strokes = [];
  ["done", "band", "leaves", "reach", "stroke"].forEach((layer) => own[layer].getContext("2d").clearRect(0, 0, own.w, own.h));
  firstRipple();
}

// A new colourway picked: the rug so far turns into it, and the next strokes are in it too
function pickWay(way) {
  chosenWay = COLOURWAYS.indexOf(way);
  if (own) redrawStrokes();
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
  await Promise.all([rugShape.loaded, rugPile.loaded]);
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
