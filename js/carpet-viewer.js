/*
  Carpet viewer: zoom and move around the carpet.

  - Starts zoomed in, with the carpet covering the whole screen.
  - Draw with one finger (or the mouse): it brushes the pile, leaving lighter fibres like on velvet.
  - Move and pinch with two fingers to move around and zoom. Flicks keep gliding.
  - On a computer: scroll to move, trackpad pinch / ctrl + scroll to zoom.
  - Double-tap to wipe the drawing, back to the plain carpet.
  - You can zoom out until the whole carpet fits, but never lose it off screen.
*/

const START_ZOOM = 3;   // how close we start, relative to the full carpet (never less than covering the screen)
const MAX_ZOOM = 8;     // how close you can get, relative to the full carpet
const FRICTION = 0.92;  // how quickly a flick slows down (closer to 1 = longer glide)
const ZOOM_SPEED = 0.5; // how strongly a pinch zooms (1 = follows the fingers exactly, lower = slower)
const ZOOM_SMOOTHING = 0.18; // how softly the zoom catches up with the fingers (lower = softer, 1 = instant)
const ZOOM_STRETCH = 0.35;   // how far you can pinch past the limits before it resists (it springs back)
const SNAP_TO_FULL = 1.35;   // let go below this zoom (x the full carpet) and it glides to the full carpet
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
const topBar = document.querySelector("[data-fit-top]");
const bottomBar = document.querySelector("[data-fit-bottom]");

// Where the carpet is: top-left corner (x, y) and size multiplier (scale)
let view = { x: 0, y: 0, scale: 1 };
let fitScale = 1;   // the scale where the whole carpet fits between the bars
let coverScale = 1; // the scale where the carpet covers the whole screen
let fit = { left: 0, top: 0, width: 0, height: 0 }; // the area the full carpet fits in

// ---------- Drawing ----------

const arrows = stage.querySelectorAll(".arrow");

function render() {
  carpet.style.transform = `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`;
  updateArrows();
}

// White arrows over the carpet, black arrows when they sit on the white page
function updateArrows() {
  const left = view.x;
  const right = view.x + img.naturalWidth * view.scale;
  const midY = stage.clientHeight / 2;
  const coversMid = view.y < midY && view.y + img.naturalHeight * view.scale > midY;

  arrows.forEach((arrow) => {
    const centre = arrow.offsetLeft + arrow.offsetWidth / 2;
    const overCarpet = coversMid && centre > left && centre < right;
    arrow.classList.toggle("is-on-paper", !overCarpet);
  });
}

// ---------- Measuring ----------

// The full carpet fits between the top and bottom bars
function measure() {
  const top = topBar.getBoundingClientRect().bottom + FIT_GAP;
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
  return Math.min(Math.max(scale, fitScale), fitScale * MAX_ZOOM);
}

// Like clampScale, but lets you pinch a little past the limits with growing resistance
function stretchScale(scale) {
  const min = fitScale;
  const max = fitScale * MAX_ZOOM;
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
    if (t < 1) animation = requestAnimationFrame(step);
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
    if (Math.abs(vx) > 0.2 || Math.abs(vy) > 0.2) {
      animation = requestAnimationFrame(step);
    }
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
    const rgb = BRUSH_LIGHT.map((c, k) => Math.round(c + (BRUSH_SHADE[k] - c) * shade));
    const press = Math.exp(-across * across * 2.5);
    bristles.push({
      offset: (across * BRUSH_WIDTH) / 2,
      color: `rgba(${rgb.join(",")}, ${(0.04 + Math.random() * 0.07) * press})`,
      width: 0.5 + Math.random() * 0.9,
    });
  }
  return bristles;
}

// The sheen: a soft round glow, stamped close together along the stroke so it blends into one smooth band
const sheen = document.createElement("canvas");
sheen.width = sheen.height = BRUSH_WIDTH * BRUSH_DETAIL;
{
  const r = sheen.width / 2;
  const ctx = sheen.getContext("2d");
  const glow = ctx.createRadialGradient(r, r, 0, r, r, r);
  glow.addColorStop(0, `rgba(${BRUSH_LIGHT.join(",")}, ${BRUSH_SHEEN})`);
  glow.addColorStop(1, `rgba(${BRUSH_LIGHT.join(",")}, 0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, sheen.width, sheen.height);
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
    brushCtx.drawImage(sheen, stroke.sheenAt.x - BRUSH_WIDTH / 2, stroke.sheenAt.y - BRUSH_WIDTH / 2, BRUSH_WIDTH, BRUSH_WIDTH);
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
    brushCtx.beginPath();
    brushCtx.moveTo(from.x + oldNormal.x * b.offset, from.y + oldNormal.y * b.offset);
    brushCtx.lineTo(to.x + newNormal.x * b.offset, to.y + newNormal.y * b.offset);
    brushCtx.strokeStyle = b.color;
    brushCtx.lineWidth = b.width;
    brushCtx.stroke();
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
    gesture = { type: "draw", start: p, last: toCarpet(p) };
  } else if (pointers.size === 2) {
    gesture = { type: "pinch", mid: midpoint(), dist: distance(), view: { ...view } };
    lastMove = { ...gesture.mid, time: performance.now() };
  }
}

stage.addEventListener("pointerdown", (e) => {
  if (e.target.closest("button")) return; // let the arrows work as buttons
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

  // The first finger lifts from a pinch: near the full carpet, glide to it;
  // past the limits, spring back; after a quick two-finger swipe, keep gliding.
  // Then wait for every finger to lift (a finger left behind does not start drawing).
  if (gesture.type === "pinch") {
    const scale = (target || view).scale;
    if (scale < fitScale * SNAP_TO_FULL) {
      animateTo(centredView(fitScale));
    } else if (scale > fitScale * MAX_ZOOM) {
      animateTo(clampView(zoomAt(view, fitScale * MAX_ZOOM, gesture.mid.x, gesture.mid.y)));
    } else if (now - lastMove.time < 80) {
      if (target) view = target;
      glide(velocity.x, velocity.y);
    }
    gesture = { type: "rest" };
    return;
  }

  if (pointers.size > 0 || gesture.type === "rest") return;

  if (gesture.stroke) finishStroke(gesture.stroke, toCarpet(p));

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
    if (animation) stopAnimation();
    const p = localPoint(e);
    const from = target || view;

    if (e.ctrlKey) {
      setTarget(clampView(zoomAt(from, from.scale * Math.exp(-e.deltaY * 0.01 * ZOOM_SPEED), p.x, p.y)));
    } else {
      setTarget(clampView({ ...from, x: from.x - e.deltaX, y: from.y - e.deltaY }));
    }
  },
  { passive: false }
);

// Stop Safari's own page pinch-zoom from fighting ours
["gesturestart", "gesturechange"].forEach((type) =>
  document.addEventListener(type, (e) => e.preventDefault())
);

// ---------- Start ----------

function setup() {
  carpet.style.width = `${img.naturalWidth}px`;
  carpet.style.height = `${img.naturalHeight}px`;
  brush.width = img.naturalWidth * BRUSH_DETAIL;
  brush.height = img.naturalHeight * BRUSH_DETAIL;
  brushCtx.scale(BRUSH_DETAIL, BRUSH_DETAIL);
  brushCtx.lineCap = "butt"; // round ends would overlap and leave beads along the fibres
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

if (img.complete && img.naturalWidth) setup();
else img.addEventListener("load", setup);
