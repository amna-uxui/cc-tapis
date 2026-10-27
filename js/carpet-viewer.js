/*
  Carpet viewer: zoom and move around the carpet.

  - Starts zoomed in, with the carpet covering the whole screen.
  - Draw with one finger (or the mouse): it brushes the pile, leaving lighter fibres like on velvet.
  - Move and pinch with two fingers to move around and zoom. Flicks keep gliding.
  - On a computer: scroll to move, trackpad pinch / ctrl + scroll to zoom.
  - Double-tap to wipe the drawing, back to the plain carpet.
  - You can zoom out until the whole carpet fits, but never lose it off screen.
*/

// Only two zoom levels: the full carpet (100%) and the close-up (300%), nothing in between
const START_ZOOM = 3;   // the close-up, relative to the full carpet (never less than covering the screen)
const FRICTION = 0.92;  // how quickly a flick slows down (closer to 1 = longer glide)
const ZOOM_SPEED = 0.5; // how strongly a pinch zooms (1 = follows the fingers exactly, lower = slower)
const ZOOM_SMOOTHING = 0.18; // how softly the zoom catches up with the fingers (lower = softer, 1 = instant)
const ZOOM_STRETCH = 0.35;   // how far you can pinch past the limits before it resists (it springs back)
const ZOOM_SNAP = 0.1;       // pinch at least this much (10%) to switch between full carpet and close-up
const ZOOM_DURATION = 650;   // ms for the double-tap / snap zoom animation
const FIT_GAP = 16;     // space around the full carpet, between the bars
const FIT_SIDE = 52;    // space left and right of the full carpet, for the arrows
const BRUSH_WIDTH = 40;      // how wide the brushed trail is, in carpet pixels
const BRUSH_BRISTLES = 60;   // fine fibres side by side across the brush
const BRUSH_SHEEN = 0.028;   // strength of the soft light under the fibres (the velvet sheen)
const BRUSH_SMOOTHING = 0.3; // how gently the brush follows the finger (lower = smoother curves, more lag)
const BRUSH_DETAIL = 3;      // canvas pixels per carpet pixel, so the fibres stay sharp when zoomed in
const BRUSH_LIGHT = [218, 170, 125]; // the colour of brushed wool catching the light (r, g, b)
const BRUSH_SHADE = [196, 146, 104]; // a slightly deeper wool tone, mixed in for depth

const stage = document.querySelector("[data-viewer]");
const carpet = stage.querySelector(".carpet");
const img = carpet.querySelector("img");
const brush = carpet.querySelector(".carpet__brush");
const brushCtx = brush.getContext("2d");

// The drawing is also kept in the original brown tones on a hidden copy, so when the rug
// changes colour every stroke can be re-tinted to the new colour (js/carpet-colors.js)
const brushBase = document.createElement("canvas");
const baseCtx = brushBase.getContext("2d");
let brushTone = { light: BRUSH_LIGHT, shade: BRUSH_SHADE }; // the wool tones for the current rug colour
const topBar = document.querySelector("[data-fit-top]");
const rugInfo = document.querySelector("[data-rug-info]"); // collection name and size, under the top bar
const bottomBar = document.querySelector("[data-fit-bottom]");

// Where the carpet is: top-left corner (x, y) and size multiplier (scale)
let view = { x: 0, y: 0, scale: 1 };
let fitScale = 1;   // the scale where the whole carpet fits between the bars
let coverScale = 1; // the scale where the carpet covers the whole screen
let fit = { left: 0, top: 0, width: 0, height: 0 }; // the area the full carpet fits in

// ---------- Drawing ----------

const arrows = stage.querySelectorAll(".arrow");

const OUT_ZOOM = 1.2; // zoomed out to less than this (x the full carpet): arrows, name, size and shapes show

function render() {
  carpet.style.transform = `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`;
  updateArrows();
  document.body.classList.toggle("is-zoomed-out", view.scale < fitScale * OUT_ZOOM);
}

// Is this screen point on the rug (and not on the white page around it)?
function onCarpet(x, y) {
  const w = img.naturalWidth * view.scale;
  const h = img.naturalHeight * view.scale;
  const u = (x - view.x) / w;
  const v = (y - view.y) / h;
  if (carpet.classList.contains("is-round")) return (u - 0.5) ** 2 + (v - 0.5) ** 2 < 0.25;
  return u > 0 && u < 1 && v > 0 && v < 1;
}

// White arrows over the carpet, black arrows when they sit on the white page
function updateArrows() {
  arrows.forEach((arrow) => {
    const box = arrow.getBoundingClientRect();
    arrow.classList.toggle("is-on-paper", !onCarpet(box.left + box.width / 2, box.top + box.height / 2));
  });
}

// ---------- Measuring ----------

// The full carpet fits between the name and size (under the top bar) and the bottom bar
function measure() {
  const top = rugInfo.getBoundingClientRect().bottom + FIT_GAP;
  const bottom = bottomBar.getBoundingClientRect().top - FIT_GAP;

  fit = {
    left: FIT_SIDE,
    top,
    width: stage.clientWidth - FIT_SIDE * 2,
    height: bottom - top,
  };

  fitScale = Math.min(
    fit.width / img.naturalWidth,
    fit.height / img.naturalHeight
  );

  coverScale = Math.max(
    stage.clientWidth / img.naturalWidth,
    stage.clientHeight / img.naturalHeight
  );
}

// ---------- Keeping the carpet in view ----------

function clampScale(scale) {
  return Math.min(Math.max(scale, fitScale), closeUpScale());
}

// Like clampScale, but lets you pinch a little past the limits with growing resistance
function stretchScale(scale) {
  const min = fitScale;
  const max = closeUpScale();
  if (scale < min) return min * Math.pow(scale / min, ZOOM_STRETCH);
  if (scale > max) return max * Math.pow(scale / max, ZOOM_STRETCH);
  return scale;
}

// Smaller than the fit area: centre it.
// Bigger than the whole screen: its edges never come inside the screen (no white showing).
// In between: the limits slide smoothly from one to the other.
function clampAxis(pos, size, areaStart, areaSize, screenSize) {
  if (size <= areaSize) return areaStart + (areaSize - size) / 2;

  const t = Math.min((size - areaSize) / Math.max(screenSize - areaSize, 1), 1);
  const max = areaStart * (1 - t);
  const min = (areaStart + areaSize - size) * (1 - t) + (screenSize - size) * t;
  return Math.min(Math.max(pos, min), max);
}

function clampView(v) {
  return {
    scale: v.scale,
    x: clampAxis(v.x, img.naturalWidth * v.scale, fit.left, fit.width, stage.clientWidth),
    y: clampAxis(v.y, img.naturalHeight * v.scale, fit.top, fit.height, stage.clientHeight),
  };
}

// Zoom to a new scale while keeping the point (px, py) under the finger still
function zoomAt(v, newScale, px, py) {
  const scale = clampScale(newScale);
  const ratio = scale / v.scale;
  return {
    scale,
    x: px - (px - v.x) * ratio,
    y: py - (py - v.y) * ratio,
  };
}

// The view centred on the carpet at a given scale
function centredView(scale) {
  scale = clampScale(scale);
  return clampView({
    scale,
    x: fit.left + (fit.width - img.naturalWidth * scale) / 2,
    y: fit.top + (fit.height - img.naturalHeight * scale) / 2,
  });
}

// How close we start
function closeUpScale() {
  return Math.max(fitScale * START_ZOOM, coverScale);
}

// ---------- Smooth animation between two views ----------

let animation = null;
let following = null; // the soft zoom loop
let target = null;    // where the soft zoom is heading

function stopAnimation() {
  if (animation) cancelAnimationFrame(animation);
  if (following) cancelAnimationFrame(following);
  animation = null;
  following = null;
  target = null;
}

// Ease the view towards a target a little every frame, so zooming feels soft
function setTarget(v) {
  target = v;
  if (!following) following = requestAnimationFrame(followStep);
}

function followStep() {
  view = {
    scale: view.scale + (target.scale - view.scale) * ZOOM_SMOOTHING,
    x: view.x + (target.x - view.x) * ZOOM_SMOOTHING,
    y: view.y + (target.y - view.y) * ZOOM_SMOOTHING,
  };
  render();

  const done =
    Math.abs(target.scale - view.scale) < 0.0005 &&
    Math.abs(target.x - view.x) < 0.3 &&
    Math.abs(target.y - view.y) < 0.3;

  if (done) {
    view = target;
    render();
    following = null;
    target = null;
  } else {
    following = requestAnimationFrame(followStep);
  }
}

function animateTo(target, duration = ZOOM_DURATION) {
  stopAnimation();
  const from = { ...view };
  const start = performance.now();

  function step(now) {
    const t = Math.min((now - start) / duration, 1);
    const e = 1 - Math.pow(1 - t, 3); // ease out
    view = {
      scale: from.scale + (target.scale - from.scale) * e,
      x: from.x + (target.x - from.x) * e,
      y: from.y + (target.y - from.y) * e,
    };
    render();
    animation = t < 1 ? requestAnimationFrame(step) : null;
  }

  animation = requestAnimationFrame(step);
}

// Keep gliding after a flick, slowing down
function glide(vx, vy) {
  stopAnimation();

  function step() {
    vx *= FRICTION;
    vy *= FRICTION;
    view = clampView({ ...view, x: view.x + vx, y: view.y + vy });
    render();
    const moving = Math.abs(vx) > 0.2 || Math.abs(vy) > 0.2;
    animation = moving ? requestAnimationFrame(step) : null;
  }

  animation = requestAnimationFrame(step);
}

// ---------- Brushing the pile ----------

// Screen point -> point on the carpet photo
function toCarpet(p) {
  return { x: (p.x - view.x) / view.scale, y: (p.y - view.y) / view.scale };
}

// A brush is a row of fine bristles. Each one keeps its place across the brush for the whole
// stroke, so it leaves one long, unbroken fibre: together they look like combed, smooth pile.
// Bristles near the middle press hardest, so the trail fades out softly at its edges.
function makeBristles() {
  const bristles = [];
  for (let i = 0; i < BRUSH_BRISTLES; i++) {
    const across = Math.random() * 2 - 1; // -1..1, spread evenly across the brush
    const shade = Math.random();
    const mix = (tone) => tone.light.map((c, k) => Math.round(c + (tone.shade[k] - c) * shade)).join(",");
    const alpha = (0.04 + Math.random() * 0.07) * Math.exp(-across * across * 2.5);
    bristles.push({
      offset: (across * BRUSH_WIDTH) / 2,
      color: `rgba(${mix(brushTone)}, ${alpha})`,
      baseColor: `rgba(${mix({ light: BRUSH_LIGHT, shade: BRUSH_SHADE })}, ${alpha})`,
      width: 0.5 + Math.random() * 0.9,
    });
  }
  return bristles;
}

// The sheen: a soft round glow, stamped close together along the stroke so it blends into one smooth band
function makeSheen(light) {
  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = glowCanvas.height = BRUSH_WIDTH * BRUSH_DETAIL;
  const r = glowCanvas.width / 2;
  const ctx = glowCanvas.getContext("2d");
  const glow = ctx.createRadialGradient(r, r, 0, r, r, r);
  glow.addColorStop(0, `rgba(${light.join(",")}, ${BRUSH_SHEEN})`);
  glow.addColorStop(1, `rgba(${light.join(",")}, 0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, glowCanvas.width, glowCanvas.height);
  return glowCanvas;
}

const baseSheen = makeSheen(BRUSH_LIGHT);
let sheen = baseSheen;

// A new rug colour: new wool tones for the brush, and the strokes already drawn re-tinted to match
function setBrushTone(tone) {
  brushTone = tone;
  sheen = makeSheen(tone.light);

  const w = brush.width;
  const h = brush.height;
  const pixels = baseCtx.getImageData(0, 0, w, h);
  const d = pixels.data;
  const ratio = tone.light.map((c, k) => c / BRUSH_LIGHT[k]);
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    d[i] = d[i] * ratio[0];
    d[i + 1] = d[i + 1] * ratio[1];
    d[i + 2] = d[i + 2] * ratio[2];
  }
  brushCtx.save();
  brushCtx.setTransform(1, 0, 0, 1, 0, 0);
  brushCtx.putImageData(pixels, 0, 0);
  brushCtx.restore();
}

function stampSheen(stroke, to) {
  const spacing = 2;
  let dx = to.x - stroke.sheenAt.x;
  let dy = to.y - stroke.sheenAt.y;
  let gap = Math.hypot(dx, dy);
  while (gap >= spacing) {
    stroke.sheenAt = {
      x: stroke.sheenAt.x + (dx / gap) * spacing,
      y: stroke.sheenAt.y + (dy / gap) * spacing,
    };
    const x = stroke.sheenAt.x - BRUSH_WIDTH / 2;
    const y = stroke.sheenAt.y - BRUSH_WIDTH / 2;
    brushCtx.drawImage(sheen, x, y, BRUSH_WIDTH, BRUSH_WIDTH);
    baseCtx.drawImage(baseSheen, x, y, BRUSH_WIDTH, BRUSH_WIDTH);
    dx = to.x - stroke.sheenAt.x;
    dy = to.y - stroke.sheenAt.y;
    gap = Math.hypot(dx, dy);
  }
}

function startStroke(stroke, point) {
  stroke.bristles = makeBristles();
  stroke.at = point;     // where the brush is (it eases after the finger)
  stroke.normal = null;  // the brush's sideways direction, turning smoothly
  stroke.sheenAt = point;
}

// Move the brush a little towards the finger and lay down every bristle's fibre
function brushTowards(stroke, finger, ease = BRUSH_SMOOTHING) {
  const from = stroke.at;
  const to = {
    x: from.x + (finger.x - from.x) * ease,
    y: from.y + (finger.y - from.y) * ease,
  };
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (length < 1) return;

  // Sideways direction, turned gently so curves stay round
  const n = { x: -(to.y - from.y) / length, y: (to.x - from.x) / length };
  const oldNormal = stroke.normal || n;
  let newNormal = { x: oldNormal.x + (n.x - oldNormal.x) * 0.35, y: oldNormal.y + (n.y - oldNormal.y) * 0.35 };
  const size = Math.hypot(newNormal.x, newNormal.y) || 1;
  newNormal = { x: newNormal.x / size, y: newNormal.y / size };

  stampSheen(stroke, to);

  stroke.bristles.forEach((b) => {
    [[brushCtx, b.color], [baseCtx, b.baseColor]].forEach(([ctx, color]) => {
      ctx.beginPath();
      ctx.moveTo(from.x + oldNormal.x * b.offset, from.y + oldNormal.y * b.offset);
      ctx.lineTo(to.x + newNormal.x * b.offset, to.y + newNormal.y * b.offset);
      ctx.strokeStyle = color;
      ctx.lineWidth = b.width;
      ctx.stroke();
    });
  });

  stroke.at = to;
  stroke.normal = newNormal;
}

// Lifting the finger: let the brush catch up with where the finger left
function finishStroke(stroke, finger) {
  for (let i = 0; i < 12; i++) brushTowards(stroke, finger, 0.5);
}

// Double-tap: back to the plain carpet
function wipeDrawing() {
  brushCtx.clearRect(0, 0, img.naturalWidth, img.naturalHeight);
  baseCtx.clearRect(0, 0, img.naturalWidth, img.naturalHeight);
}

// ---------- Touch, mouse and pen ----------

const pointers = new Map(); // finger id -> { x, y }
let gesture = null;         // what the fingers were doing when the gesture started
let velocity = { x: 0, y: 0 };
let lastMove = { x: 0, y: 0, time: 0 };
let lastTap = { time: 0, x: 0, y: 0 };
let moved = false;

function localPoint(e) {
  const rect = stage.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function midpoint() {
  const [a, b] = [...pointers.values()];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function distance() {
  const [a, b] = [...pointers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Remember where the gesture started, so moves are measured from there
function startGesture() {
  if (pointers.size === 1) {
    const p = [...pointers.values()][0];
    gesture = { type: "draw", start: p, last: toCarpet(p), screen: { ...p, time: performance.now() } };
  } else if (pointers.size === 2) {
    if (typeof brushSound !== "undefined") brushSound.stop(); // a second finger: no longer drawing
    gesture = { type: "pinch", mid: midpoint(), dist: distance(), view: { ...view } };
    lastMove = { ...gesture.mid, time: performance.now() };
  }
}

stage.addEventListener("pointerdown", (e) => {
  if (e.target.closest("button")) return; // let the arrows work as buttons
  if (window.closePalette && closePalette()) return; // first touch just closes the colour palette
  stage.setPointerCapture(e.pointerId);
  stopAnimation();

  const p = localPoint(e);
  pointers.set(e.pointerId, p);
  if (pointers.size === 1) moved = false;

  velocity = { x: 0, y: 0 };
  lastMove = { ...p, time: performance.now() };
  startGesture();
});

stage.addEventListener("pointermove", (e) => {
  if (!pointers.has(e.pointerId)) return;
  const p = localPoint(e);
  pointers.set(e.pointerId, p);

  if (gesture.type === "draw" && pointers.size === 1) {
    // A tap is not a stroke: only start brushing once the finger really moves
    if (!moved) {
      if (Math.hypot(p.x - gesture.start.x, p.y - gesture.start.y) <= 4) return;
      moved = true;
      gesture.stroke = {};
      startStroke(gesture.stroke, gesture.last);
    }

    gesture.last = toCarpet(p);
    brushTowards(gesture.stroke, gesture.last);

    // Brushing sound (js/carpet-sound.js), as loud as the finger is fast
    const now = performance.now();
    const speed = Math.hypot(p.x - gesture.screen.x, p.y - gesture.screen.y) / Math.max(now - gesture.screen.time, 1);
    gesture.screen = { ...p, time: now };
    if (typeof brushSound !== "undefined") brushSound.move(speed);
    return;
  }

  if (gesture.type === "pinch" && pointers.size === 2) {
    moved = true;

    // Track speed of the two fingers for the flick
    const now = performance.now();
    const m = midpoint();
    const dt = Math.max(now - lastMove.time, 1);
    velocity = {
      x: ((m.x - lastMove.x) / dt) * 16,
      y: ((m.y - lastMove.y) / dt) * 16,
    };
    lastMove = { ...m, time: now };

    const mid = midpoint();
    const pinch = Math.pow(distance() / gesture.dist, ZOOM_SPEED);
    const scale = stretchScale(gesture.view.scale * pinch);
    const ratio = scale / gesture.view.scale;

    // Zoom around where the fingers started, and follow the fingers as they move
    setTarget(
      clampView({
        scale,
        x: mid.x - (gesture.mid.x - gesture.view.x) * ratio,
        y: mid.y - (gesture.mid.y - gesture.view.y) * ratio,
      })
    );
    return; // the soft zoom loop draws
  }

  render();
});

function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  const p = localPoint(e);
  pointers.delete(e.pointerId);

  const now = performance.now();

  // The first finger lifts from a pinch: it settles on the full carpet or the close-up, never in between.
  // Pinched out from the close-up -> full carpet; pinched in from the full carpet -> close-up where the
  // fingers were; otherwise back to where it started (a quick two-finger swipe in the close-up keeps gliding).
  // Then wait for every finger to lift (a finger left behind does not start drawing).
  if (gesture.type === "pinch") {
    const change = (target || view).scale / gesture.view.scale;
    const wasFull = gesture.view.scale < fitScale * 1.05;
    const toFull = wasFull ? change < 1 + ZOOM_SNAP : change < 1 - ZOOM_SNAP;
    const mid = gesture.mid; // where the pinch started

    if (toFull) {
      animateTo(centredView(fitScale));
    } else if (wasFull || Math.abs((target || view).scale / closeUpScale() - 1) > 0.01) {
      animateTo(clampView(zoomAt(target || view, closeUpScale(), mid.x, mid.y)));
    } else if (now - lastMove.time < 80) {
      if (target) view = target;
      glide(velocity.x, velocity.y);
    }
    gesture = { type: "rest" };
    return;
  }

  if (pointers.size > 0 || gesture.type === "rest") return;

  if (gesture.stroke) finishStroke(gesture.stroke, toCarpet(p));
  if (typeof brushSound !== "undefined") brushSound.stop();

  // Double-tap: wipe the drawing
  if (!moved) {
    const quick = now - lastTap.time < 300;
    const near = Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 30;
    if (quick && near) {
      wipeDrawing();
      lastTap = { time: 0, x: 0, y: 0 };
      return;
    }
    lastTap = { time: now, ...p };
  }
}

stage.addEventListener("pointerup", endPointer);
stage.addEventListener("pointercancel", endPointer);

// Trackpad pinch (sends ctrl + wheel) and mouse wheel on a computer
stage.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const p = localPoint(e);

    // Zoom: one step out to the full carpet, or in to the close-up (the rest of the gesture is ignored)
    if (e.ctrlKey) {
      if (animation || Math.abs(e.deltaY) < 2) return;
      const isFull = view.scale < fitScale * 1.05;
      if (e.deltaY > 0 && !isFull) animateTo(centredView(fitScale));
      if (e.deltaY < 0 && isFull) animateTo(clampView(zoomAt(view, closeUpScale(), p.x, p.y)));
      return;
    }

    // Move around
    if (animation) stopAnimation();
    const from = target || view;
    setTarget(clampView({ ...from, x: from.x - e.deltaX, y: from.y - e.deltaY }));
  },
  { passive: false }
);

// Stop Safari's own page pinch-zoom from fighting ours
["gesturestart", "gesturechange"].forEach((type) =>
  document.addEventListener(type, (e) => e.preventDefault())
);

// ---------- Start ----------

// Size the carpet and its drawing canvases to the rug photo
function sizeCarpet() {
  carpet.style.width = `${img.naturalWidth}px`;
  carpet.style.height = `${img.naturalHeight}px`;
  [[brush, brushCtx], [brushBase, baseCtx]].forEach(([canvas, ctx]) => {
    canvas.width = img.naturalWidth * BRUSH_DETAIL;
    canvas.height = img.naturalHeight * BRUSH_DETAIL;
    ctx.scale(BRUSH_DETAIL, BRUSH_DETAIL);
    ctx.lineCap = "butt"; // round ends would overlap and leave beads along the fibres
  });
}

function setup() {
  sizeCarpet();
  measure();
  view = centredView(closeUpScale());
  render();
  carpet.classList.add("is-ready");
}

window.addEventListener("resize", () => {
  // Keep the same zoom level and centre point when the screen size changes
  const zoom = view.scale / fitScale;
  const cx = (stage.clientWidth / 2 - view.x) / view.scale;
  const cy = (stage.clientHeight / 2 - view.y) / view.scale;
  measure();
  const scale = clampScale(fitScale * zoom);
  view = clampView({
    scale,
    x: stage.clientWidth / 2 - cx * scale,
    y: stage.clientHeight / 2 - cy * scale,
  });
  render();
});

// ---------- Changing the rug (js/carpet-colors.js) ----------

const RUG_FADE = 220; // ms the carpet fades out and back in when the rug changes

// Resolves once the image has loaded (works for images that already have)
function whenLoaded(image) {
  if (image.complete && image.naturalWidth) return Promise.resolve();
  return new Promise((done, fail) => {
    image.addEventListener("load", done, { once: true });
    image.addEventListener("error", fail, { once: true });
  });
}

// Show another rug photo. The drawing comes along: scaled to fit the new rug, centred.
// You stay at the same zoom, looking at the same part of the carpet, unless zoomOut is set:
// then the whole new rug is shown. round: the rug is a circle.
async function changeRug(src, { round = false, zoomOut = false } = {}) {
  const next = new Image();
  next.src = src;
  await whenLoaded(next);

  carpet.classList.add("is-changing");
  await new Promise((done) => setTimeout(done, RUG_FADE));

  const zoom = view.scale / fitScale;
  const fx = (stage.clientWidth / 2 - view.x) / (img.naturalWidth * view.scale);
  const fy = (stage.clientHeight / 2 - view.y) / (img.naturalHeight * view.scale);

  const drawing = document.createElement("canvas");
  drawing.width = brushBase.width;
  drawing.height = brushBase.height;
  drawing.getContext("2d").drawImage(brushBase, 0, 0);

  img.src = src;
  await whenLoaded(img);
  sizeCarpet();
  carpet.classList.toggle("is-round", round);

  const fitDrawing = Math.min(brushBase.width / drawing.width, brushBase.height / drawing.height);
  const w = drawing.width * fitDrawing;
  const h = drawing.height * fitDrawing;
  baseCtx.save();
  baseCtx.setTransform(1, 0, 0, 1, 0, 0);
  baseCtx.drawImage(drawing, (brushBase.width - w) / 2, (brushBase.height - h) / 2, w, h);
  baseCtx.restore();

  measure();
  stopAnimation();
  if (zoomOut) {
    view = centredView(fitScale);
  } else {
    const scale = clampScale(fitScale * zoom);
    view = clampView({
      scale,
      x: stage.clientWidth / 2 - fx * img.naturalWidth * scale,
      y: stage.clientHeight / 2 - fy * img.naturalHeight * scale,
    });
  }
  render();
  carpet.classList.remove("is-changing");
}

if (img.complete && img.naturalWidth) setup();
else img.addEventListener("load", setup, { once: true });
