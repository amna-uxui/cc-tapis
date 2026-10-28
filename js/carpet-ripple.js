/*
  Ripple Square by Patricia Urquiola: the same ripple of leaves in four colourways. You colour the
  rug yourself. Three versions to try (the A · B · C switcher, while we choose one):

  A. Paint: pick a colourway in the row, paint with your finger, and under it the rug turns into
     that colourway.
  B. Leaves or ground: pick one of the eight colours, and your stroke colours only the leaves, or
     only the ground, whichever it starts on.
  C. Ripple: pick a colourway and tap the rug: it spreads out from your finger like a ripple on
     water, across the whole rug.

  Double-tap to clear. Every version recolours the one photo of the rug (Rose Garden): each spot
  is part leaf, part ground (worked out from its colour), and keeps the light and shade of its
  wool, so the colours sit in the real rug. (The four colourways are four separate hand-knotted
  rugs; no two line up leaf for leaf, so their photos can't be painted through each other.)

  Needs js/carpet-viewer.js (changeRug, img, carpet, fingerPaint, view), js/carpet-strip.js and
  js/carpet-menu.js (MENU_COLLECTIONS) to be loaded first.
*/

const RIPPLE_NAME = "Ripple Square";
const RIPPLE_DESIGNER = "Patricia Urquiola";
const RIPPLE_SIZE = "300 × 300 cm";
const RIPPLE_PRICE = 12996;
const RIPPLE_PHOTO = "images/ripple-rose-garden.jpg";

// The four colourways, ground and leaf as measured from their photos (the first is the photo's own)
const COLOURWAYS = [
  { name: "Rose Garden", ground: [231, 196, 186], leaf: [40, 79, 52] },
  { name: "Earth Glow", ground: [230, 195, 129], leaf: [72, 34, 22] },
  { name: "Lavender Root", ground: [136, 140, 151], leaf: [164, 110, 82] },
  { name: "Dune Shadow", ground: [70, 50, 40], leaf: [219, 202, 176] },
];
// Version B's eight colours: every colourway's ground and leaf
const PAINTS = COLOURWAYS.flatMap((c) => [
  { name: `${c.name} ground`, rgb: c.ground },
  { name: `${c.name} leaf`, rgb: c.leaf },
]);

const PAINT_BRUSH = 26;      // brush radius, in screen pixels (so it feels the same at any zoom)
const PAINT_FUZZ = 0.25;     // how ragged the brush's edge is, like tufts of wool (share of its radius)
const RIPPLE_TIME = 1300;    // ms for a ripple to cross the whole rug
const RIPPLE_WAVE = 0.05;    // how wavy the ripple's edge is (share of its radius)

const rippleCanvas = carpet.querySelector(".carpet__paint");
const rippleCtx = rippleCanvas.getContext("2d");
const tryButtons = document.querySelectorAll("[data-try]");

let rippleVersion = "A";
try {
  rippleVersion = localStorage.getItem("ripple-version") || "A";
} catch (e) {}
let chosenWay = 0;    // A and C: the colourway picked in the row
let chosenPaint = 3;  // B: the colour picked (Rose Garden leaf, the photo's own green)

// ---------- The rug's pixels: how much leaf, and its wool's light and shade ----------

let rug = null; // { w, h, leaf (0..255), shade, cover (0..255), ground/leafPaint (colour numbers; 255 = untouched), image }

function readRug() {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, w, h).data;
  const n = w * h;
  const leaf = new Uint8Array(n);
  const shade = new Float32Array(n);
  const cover = new Uint8Array(n);
  const [P, G] = [COLOURWAYS[0].ground, COLOURWAYS[0].leaf];
  const lum = (r, g, b) => 0.3 * r + 0.59 * g + 0.11 * b;
  const along = [G[0] - P[0], G[1] - P[1], G[2] - P[2]];
  const length = along[0] * along[0] + along[1] * along[1] + along[2] * along[2];
  const groundSum = P[0] + P[1] + P[2];
  for (let i = 0; i < n; i++) {
    const r = px[i * 4];
    const g = px[i * 4 + 1];
    const b = px[i * 4 + 2];
    // how far from the ground's colour towards the leaf's: 0 ground .. 1 leaf
    let t = ((r - P[0]) * along[0] + (g - P[1]) * along[1] + (b - P[2]) * along[2]) / length;
    t = Math.min(1, Math.max(0, t));
    leaf[i] = t * 255;
    // the wool's light and shade: this spot against the plain colour it should have
    const plain = lum(P[0] + along[0] * t, P[1] + along[1] * t, P[2] + along[2] * t);
    shade[i] = Math.min(1.6, Math.max(0.5, lum(r, g, b) / plain));
    // how much of this spot is rug (not the white paper around it)
    cover[i] = Math.min(255, Math.max(0, ((765 - r - g - b) / (765 - groundSum)) * 1.3 * 255));
  }
  rug = {
    w,
    h,
    leaf,
    shade,
    cover,
    groundPaint: new Uint8Array(n).fill(255),
    leafPaint: new Uint8Array(n).fill(255),
    image: rippleCtx.createImageData(w, h),
  };
  rippleCanvas.width = w;
  rippleCanvas.height = h;
}

// The colours as numbers into PAINTS: colourway k's ground is 2k, its leaf 2k + 1
const groundOf = (way) => way * 2;
const leafOf = (way) => way * 2 + 1;

// One spot's colour, in its painted colours with its wool's light and shade (untouched spots stay
// see-through: the photo shows)
function colourSpot(i) {
  const d = rug.image.data;
  const o = i * 4;
  const gp = rug.groundPaint[i];
  const lp = rug.leafPaint[i];
  if (gp === 255 && lp === 255) {
    d[o + 3] = 0;
    return;
  }
  const ground = PAINTS[gp === 255 ? groundOf(0) : gp].rgb;
  const leafy = PAINTS[lp === 255 ? leafOf(0) : lp].rgb;
  const t = rug.leaf[i] / 255;
  const s = rug.shade[i];
  d[o] = (ground[0] + (leafy[0] - ground[0]) * t) * s;
  d[o + 1] = (ground[1] + (leafy[1] - ground[1]) * t) * s;
  d[o + 2] = (ground[2] + (leafy[2] - ground[2]) * t) * s;
  d[o + 3] = rug.cover[i];
}

// Put a part of the rug on screen (its spots already coloured)
function showRug(left, top, right, bottom) {
  left = Math.max(0, Math.floor(left));
  top = Math.max(0, Math.floor(top));
  right = Math.min(rug.w - 1, Math.ceil(right));
  bottom = Math.min(rug.h - 1, Math.ceil(bottom));
  if (right < left || bottom < top) return;
  rippleCtx.putImageData(rug.image, 0, 0, left, top, right - left + 1, bottom - top + 1);
}

// Colour every spot in a part of the rug and show it
function drawRug(left, top, right, bottom) {
  left = Math.max(0, Math.floor(left));
  top = Math.max(0, Math.floor(top));
  right = Math.min(rug.w - 1, Math.ceil(right));
  bottom = Math.min(rug.h - 1, Math.ceil(bottom));
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) colourSpot(y * rug.w + x);
  }
  showRug(left, top, right, bottom);
}

function drawAll() {
  drawRug(0, 0, rug.w - 1, rug.h - 1);
}

// Repainted once per frame, however many dabs the finger made
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
      drawRug(left, top, right, bottom);
    });
}

// A small random number per spot, always the same for the same spot (the brush's ragged edge)
function tuft(i) {
  const v = Math.sin(i * 12.9898) * 43758.5453;
  return v - Math.floor(v);
}

// ---------- A and B: painting with the finger ----------

let stroke = null; // { last, part: "leaf" | "ground" (B) }

// One dab of the brush at (cx, cy): colour the spots under it
function dab(cx, cy) {
  const r = PAINT_BRUSH / view.scale;
  const left = Math.max(0, Math.floor(cx - r));
  const right = Math.min(rug.w - 1, Math.ceil(cx + r));
  const top = Math.max(0, Math.floor(cy - r));
  const bottom = Math.min(rug.h - 1, Math.ceil(cy + r));
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const i = y * rug.w + x;
      if (Math.hypot(x - cx, y - cy) > r * (1 - PAINT_FUZZ * tuft(i))) continue;
      if (rippleVersion === "A") {
        rug.groundPaint[i] = groundOf(chosenWay);
        rug.leafPaint[i] = leafOf(chosenWay);
      } else if (stroke.part === "leaf") {
        rug.leafPaint[i] = chosenPaint;
      } else {
        rug.groundPaint[i] = chosenPaint;
      }
    }
  }
  markDirtyRug(left, top, right, bottom);
}

const ripplePaint = {
  start(p) {
    if (!rug || rippleVersion === "C") return (stroke = null);
    const i = Math.round(p.y) * rug.w + Math.round(p.x);
    stroke = { last: p, part: rug.leaf[i] > 127 ? "leaf" : "ground" };
    dab(p.x, p.y);
  },
  to(p) {
    if (!stroke) return;
    // dabs close enough together to make one smooth line
    const step = PAINT_BRUSH / view.scale / 3;
    const dist = Math.hypot(p.x - stroke.last.x, p.y - stroke.last.y);
    const count = Math.max(1, Math.ceil(dist / step));
    for (let k = 1; k <= count; k++) {
      dab(stroke.last.x + ((p.x - stroke.last.x) * k) / count, stroke.last.y + ((p.y - stroke.last.y) * k) / count);
    }
    stroke.last = p;
  },
  end() {
    stroke = null;
  },
  wipe() {
    if (!rug) return;
    rug.groundPaint.fill(255);
    rug.leafPaint.fill(255);
    drawAll();
  },
};

// ---------- C: a ripple from a tap ----------

function ripple(cx, cy) {
  if (!rug) return;
  const way = chosenWay;
  const far = Math.max(Math.hypot(cx, cy), Math.hypot(rug.w - cx, cy), Math.hypot(cx, rug.h - cy), Math.hypot(rug.w - cx, rug.h - cy)) * (1 + RIPPLE_WAVE);
  const phase = Math.random() * 6.28;
  const start = performance.now();
  let reached = 0;
  function step(now) {
    const t = Math.min(1, (now - start) / RIPPLE_TIME);
    const radius = far * (1 - Math.pow(1 - t, 2)); // quick at first, then slowing, like a ripple
    const outer = radius * (1 + RIPPLE_WAVE);
    // only the ring the ripple crossed since the last frame
    const top = Math.max(0, Math.floor(cy - outer));
    const bottom = Math.min(rug.h - 1, Math.ceil(cy + outer));
    for (let y = top; y <= bottom; y++) {
      const dy = y - cy;
      const span = Math.sqrt(Math.max(0, outer * outer - dy * dy));
      const inside = reached * (1 - RIPPLE_WAVE);
      const hole = inside > Math.abs(dy) ? Math.sqrt(inside * inside - dy * dy) : 0;
      const rows = hole > 0 ? [[cx - span, cx - hole], [cx + hole, cx + span]] : [[cx - span, cx + span]];
      for (const [from, to] of rows) {
        for (let x = Math.max(0, Math.floor(from)); x <= Math.min(rug.w - 1, Math.ceil(to)); x++) {
          const dx = x - cx;
          const d = Math.hypot(dx, dy);
          const edge = radius * (1 + RIPPLE_WAVE * Math.sin(Math.atan2(dy, dx) * 7 + phase + d * 0.02));
          if (d > edge) continue;
          const i = y * rug.w + x;
          rug.groundPaint[i] = groundOf(way);
          rug.leafPaint[i] = leafOf(way);
          colourSpot(i);
        }
      }
    }
    showRug(cx - outer, top, cx + outer, bottom);
    reached = radius;
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// A tap on the rug (js/carpet-collections.js): in C, a ripple from where the finger was
function tapRipple() {
  if (rippleVersion !== "C" || !lastTap) return;
  ripple((lastTap.x - view.x) / view.scale, (lastTap.y - view.y) / view.scale);
}

// ---------- The row: colourways (A, C) or colours (B) ----------

const rippleRow = document.querySelector("[data-rug-options]");

function waySwatch(way) {
  const s = document.createElement("span");
  s.className = "paint-swatch";
  s.style.setProperty("--a", `rgb(${way.ground})`);
  s.style.setProperty("--b", `rgb(${way.leaf})`);
  return s;
}

function paintDot(paint) {
  const s = document.createElement("span");
  s.className = "paint-dot";
  s.style.setProperty("--a", `rgb(${paint.rgb})`);
  return s;
}

function markRipple() {
  const way = rippleVersion === "B" ? null : COLOURWAYS[chosenWay];
  rugInfo.querySelector("[data-rug-name]").textContent = way ? `${RIPPLE_NAME} ${way.name}` : RIPPLE_NAME;
  rugInfo.querySelector("[data-rug-designer]").textContent = `by ${RIPPLE_DESIGNER}`;
  const euro = document.createElement("span");
  euro.className = "rug-info__currency";
  euro.textContent = "€";
  const amount = String(RIPPLE_PRICE).replace(/\B(?=(\d{3})+$)/g, ".");
  rugInfo.querySelector("[data-rug-size]").replaceChildren(`${RIPPLE_SIZE} | `, euro, ` ${amount}`);
}

function buildRippleRow() {
  if (rippleVersion === "B") {
    makeStrip(rippleRow, PAINTS, { draw: paintDot, choose: (p) => (chosenPaint = PAINTS.indexOf(p)), start: chosenPaint });
  } else {
    makeStrip(rippleRow, COLOURWAYS, {
      draw: waySwatch,
      choose: (w) => {
        chosenWay = COLOURWAYS.indexOf(w);
        markRipple();
      },
      start: chosenWay,
    });
  }
  markRipple();
}

// ---------- The A · B · C switcher ----------

const TRY_HINTS = {
  A: "Pick a colourway, then paint the rug",
  B: "Pick a colour, then paint the leaves or the ground",
  C: "Pick a colourway, then tap the rug",
};

function chooseVersion(version) {
  rippleVersion = version;
  try {
    localStorage.setItem("ripple-version", version);
  } catch (e) {}
  tryButtons.forEach((b) => b.setAttribute("aria-pressed", b.dataset.try === version));
  if (rug) ripplePaint.wipe();
  buildRippleRow();
  if (verbText) {
    verbText.textContent = TRY_HINTS[version];
    verbText.style.animation = "none";
    void verbText.offsetWidth;
    verbText.style.animation = "";
  }
}

tryButtons.forEach((b) => b.addEventListener("click", () => chooseVersion(b.dataset.try)));

// ---------- Coming on and going (js/carpet-collections.js) ----------

async function enterRipple(whole) {
  tryButtons.forEach((b) => b.setAttribute("aria-pressed", b.dataset.try === rippleVersion));
  buildRippleRow();
  await changeRug(RIPPLE_PHOTO, { zoomOut: whole, fade: false });
  if (!rug) readRug();
  drawAll();
  fingerPaint = ripplePaint;
}

function leaveRipple() {
  fingerPaint = null;
}
