/*
  Carpet viewer: zoom and move around the carpet.

  - Starts zoomed in, with the carpet covering the whole screen.
  - Drag with one finger (or the mouse) to move around. Flicks keep gliding.
  - Pinch with two fingers (or trackpad pinch / ctrl + scroll) to zoom.
  - Double-tap to jump between the full carpet and a close-up.
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

const stage = document.querySelector("[data-viewer]");
const img = stage.querySelector("img");
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
  img.style.transform = `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`;
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

// How close we start (and where double-tap zooms in to)
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
    gesture = { type: "pan", start: p, view: { ...view } };
  } else if (pointers.size === 2) {
    gesture = { type: "pinch", mid: midpoint(), dist: distance(), view: { ...view } };
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

  if (gesture.type === "pan" && pointers.size === 1) {
    const dx = p.x - gesture.start.x;
    const dy = p.y - gesture.start.y;
    if (Math.hypot(dx, dy) > 4) moved = true;

    view = clampView({ ...gesture.view, x: gesture.view.x + dx, y: gesture.view.y + dy });

    // Track speed for the flick
    const now = performance.now();
    const dt = Math.max(now - lastMove.time, 1);
    velocity = {
      x: ((p.x - lastMove.x) / dt) * 16,
      y: ((p.y - lastMove.y) / dt) * 16,
    };
    lastMove = { ...p, time: now };
  }

  if (gesture.type === "pinch" && pointers.size === 2) {
    moved = true;
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

  if (pointers.size > 0) {
    // One finger lifted from a pinch: carry on panning with the other
    stopAnimation();
    view = clampView({ ...view, scale: clampScale(view.scale) });
    render();
    startGesture();
    return;
  }

  const now = performance.now();

  // After a pinch: near the full carpet, glide to it; past the limits, spring back
  if (gesture.type === "pinch") {
    const scale = (target || view).scale;
    if (scale < fitScale * SNAP_TO_FULL) {
      animateTo(centredView(fitScale));
    } else if (scale > fitScale * MAX_ZOOM) {
      animateTo(clampView(zoomAt(view, fitScale * MAX_ZOOM, gesture.mid.x, gesture.mid.y)));
    }
    return;
  }

  // Double-tap: full carpet <-> close-up
  if (!moved) {
    const quick = now - lastTap.time < 300;
    const near = Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 30;
    if (quick && near) {
      const zoomedIn = view.scale > fitScale * 1.05;
      animateTo(
        zoomedIn
          ? centredView(fitScale)
          : clampView(zoomAt(view, closeUpScale(), p.x, p.y))
      );
      lastTap = { time: 0, x: 0, y: 0 };
      return;
    }
    lastTap = { time: now, ...p };
    return;
  }

  // Flick: keep gliding, unless the finger stopped before lifting
  if (now - lastMove.time < 80) glide(velocity.x, velocity.y);
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
  img.style.width = `${img.naturalWidth}px`;
  img.style.height = `${img.naturalHeight}px`;
  measure();
  view = centredView(closeUpScale());
  render();
  img.classList.add("is-ready");
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
