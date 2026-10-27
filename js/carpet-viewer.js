/*
  Carpet viewer: zoom and move around the carpet.

  - Starts zoomed in, with the carpet covering the whole screen.
  - Draw with one finger (or the mouse): it pushes the velvet's pile the way you brush, leaving a
    mark. Brush back over a mark the opposite way and it disappears, like on real velvet.
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
const BRUSH_SMOOTHING = 0.3; // how gently the brush follows the finger (lower = smoother curves, more lag)
const PILE_PUSH = 0.9;       // how far one stroke pushes the pile (1 = fully pushed after a brush width)
const PILE_MARK = 0.6;       // how strong a fully pushed mark looks (0..1)
const BRUSH_LIGHT = [218, 170, 125]; // the colour of brushed wool catching the light (r, g, b)
const BRUSH_SHADE = [196, 146, 104]; // a slightly deeper wool tone, mixed in for depth

const stage = document.querySelector("[data-viewer]");
const carpet = stage.querySelector(".carpet");
const img = carpet.querySelector("img");
const brush = carpet.querySelector(".carpet__brush");
const brushCtx = brush.getContext("2d");

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

/*
  The velvet: every pixel of the rug remembers which way its pile has been pushed, and how far
  (a little arrow, from 0 = untouched to 1 = fully pushed). Brushing pushes the pile under the
  brush along the stroke, and the pushed pile shows as a lighter mark. Brushing back the other
  way pushes it home again, so the mark disappears (but never further than home in that stroke).
  The lamp (js/carpet-lamp.js) makes marks brighter where the pile leans towards it.
*/

let pile = null;    // { w, h, x, y (the arrows), grain, mode, image }
let strokeId = 0;   // each stroke's number, so a pixel decides once per stroke: draw or erase

// Screen point -> point on the carpet photo
function toCarpet(p) {
  return { x: (p.x - view.x) / view.scale, y: (p.y - view.y) / view.scale };
}

// A fresh, untouched pile the size of the rug photo
function makePile(w, h) {
  const grain = new Float32Array(w * h);
  for (let i = 0; i < grain.length; i++) grain[i] = 0.7 + Math.random() * 0.6; // velvet isn't perfectly even
  return {
    w,
    h,
    x: new Float32Array(w * h),
    y: new Float32Array(w * h),
    grain,
    mode: new Int32Array(w * h),
    image: brushCtx.createImageData(w, h),
  };
}

// Push the pile under the brush as it moves from one point to the next
function pushPile(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.3) return;
  const ux = dx / length;
  const uy = dy / length;
  const r = BRUSH_WIDTH / 2;
  const push = (PILE_PUSH * length) / r;

  const left = Math.max(0, Math.floor(Math.min(from.x, to.x) - r));
  const right = Math.min(pile.w - 1, Math.ceil(Math.max(from.x, to.x) + r));
  const top = Math.max(0, Math.floor(Math.min(from.y, to.y) - r));
  const bottom = Math.min(pile.h - 1, Math.ceil(Math.max(from.y, to.y) + r));

  for (let py = top; py <= bottom; py++) {
    for (let px = left; px <= right; px++) {
      // how far this pixel is from the brush's path, and so how hard the brush presses on it
      const along = Math.max(0, Math.min(length, (px - from.x) * ux + (py - from.y) * uy));
      const gap = Math.hypot(px - (from.x + ux * along), py - (from.y + uy * along));
      if (gap >= r) continue;
      const press = (1 - (gap / r) ** 2) ** 2 * push;

      const i = py * pile.w + px;
      const leaning = pile.x[i] * ux + pile.y[i] * uy; // how far the pile already leans this way

      // First touch in this stroke: against the pile -> this stroke erases here, else it draws
      if (pile.mode[i] >> 1 !== strokeId) pile.mode[i] = (strokeId << 1) | (leaning < -0.02 ? 1 : 0);

      if (pile.mode[i] & 1) {
        // erase: push the pile back towards home, but not past it; sideways lean fades too
        const back = Math.min(-leaning, press);
        const keep = Math.max(0, 1 - press);
        const sideX = (pile.x[i] - leaning * ux) * keep;
        const sideY = (pile.y[i] - leaning * uy) * keep;
        pile.x[i] = (leaning + back) * ux + sideX;
        pile.y[i] = (leaning + back) * uy + sideY;
      } else {
        // draw: push the pile along the stroke, up to fully pushed
        let x = pile.x[i] + ux * press;
        let y = pile.y[i] + uy * press;
        const size = Math.hypot(x, y);
        if (size > 1) {
          x /= size;
          y /= size;
        }
        pile.x[i] = x;
        pile.y[i] = y;
      }
    }
  }
  paintPile(left, top, right - left + 1, bottom - top + 1);
}

// Show the pushed pile: lighter wool where it's pushed, brighter where it leans towards the lamp
function paintPile(left = 0, top = 0, w = pile.w, h = pile.h) {
  const d = pile.image.data;
  const lamp = typeof lampAngle === "number" ? (lampAngle * Math.PI) / 180 : -Math.PI * 0.75;
  const lx = Math.cos(lamp);
  const ly = Math.sin(lamp);
  const { light, shade } = brushTone;

  for (let py = top; py < top + h; py++) {
    for (let px = left; px < left + w; px++) {
      const i = py * pile.w + px;
      const pushed = Math.hypot(pile.x[i], pile.y[i]);
      const o = i * 4;
      if (pushed < 0.004) {
        d[o + 3] = 0;
        continue;
      }
      const facing = 0.5 + 0.5 * ((pile.x[i] * lx + pile.y[i] * ly) / pushed); // 0 away .. 1 towards the lamp
      d[o] = shade[0] + (light[0] - shade[0]) * facing;
      d[o + 1] = shade[1] + (light[1] - shade[1]) * facing;
      d[o + 2] = shade[2] + (light[2] - shade[2]) * facing;
      d[o + 3] = 255 * Math.min(1, PILE_MARK * pushed ** 0.8 * pile.grain[i] * (0.75 + 0.5 * facing));
    }
  }
  brushCtx.putImageData(pile.image, 0, 0, left, top, w, h);
}

// The lamp moved (js/carpet-lamp.js): light the marks again. Repainting the whole rug is heavy,
// so at most every RELIGHT_EVERY ms (the lamp circles all the time when zoomed out)
const RELIGHT_EVERY = 150;
let relighting = null;
let lastRelight = 0;
function relightPile() {
  if (!pile || relighting) return;
  const wait = Math.max(0, lastRelight + RELIGHT_EVERY - performance.now());
  relighting = setTimeout(() => {
    relighting = null;
    lastRelight = performance.now();
    paintPile();
  }, wait);
}

// A new rug colour (js/carpet-colors.js): new wool tones for the marks
function setBrushTone(tone) {
  brushTone = tone;
  if (pile) paintPile();
}

// A new rug photo: a new pile that size, with the old marks scaled to fit it, centred
function resizePile(w, h) {
  const old = pile;
  pile = makePile(w, h);
  brush.width = w;
  brush.height = h;
  if (!old) return;
  const fit = Math.min(w / old.w, h / old.h);
  const offX = (w - old.w * fit) / 2;
  const offY = (h - old.h * fit) / 2;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const ox = Math.floor((px - offX) / fit);
      const oy = Math.floor((py - offY) / fit);
      if (ox < 0 || oy < 0 || ox >= old.w || oy >= old.h) continue;
      pile.x[py * w + px] = old.x[oy * old.w + ox];
      pile.y[py * w + px] = old.y[oy * old.w + ox];
    }
  }
}

function startStroke(stroke, point) {
  strokeId++;
  stroke.at = point; // where the brush is (it eases after the finger, so curves stay smooth)
}

// Move the brush a little towards the finger, pushing the pile on the way
function brushTowards(stroke, finger, ease = BRUSH_SMOOTHING) {
  const to = {
    x: stroke.at.x + (finger.x - stroke.at.x) * ease,
    y: stroke.at.y + (finger.y - stroke.at.y) * ease,
  };
  pushPile(stroke.at, to);
  stroke.at = to;
}

// Lifting the finger: let the brush catch up with where the finger left
function finishStroke(stroke, finger) {
  for (let i = 0; i < 12; i++) brushTowards(stroke, finger, 0.5);
}

// Double-tap: back to the untouched pile
function wipeDrawing() {
  pile.x.fill(0);
  pile.y.fill(0);
  paintPile();
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

// Size the carpet and its pile to the rug photo (the marks come along, scaled to fit)
function sizeCarpet() {
  carpet.style.width = `${img.naturalWidth}px`;
  carpet.style.height = `${img.naturalHeight}px`;
  resizePile(img.naturalWidth, img.naturalHeight);
  paintPile();
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

// Show another rug photo. The marks come along: scaled to fit the new rug, centred.
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

  img.src = src;
  await whenLoaded(img);
  sizeCarpet();
  carpet.classList.toggle("is-round", round);

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
