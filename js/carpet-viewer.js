/*
  Carpet viewer: zoom and move around the carpet.

  - Starts zoomed in, with the carpet covering the whole screen.
  - Draw with one finger (or the mouse): it pushes the velvet's pile the way you brush, leaving a
    mark. Brush back over a mark the opposite way and it disappears, like on real velvet.
  - Move and pinch with two fingers to move around and zoom. Flicks keep gliding.
  - On a computer: scroll to move, trackpad pinch / ctrl + scroll to zoom.
  - The marks stay, whatever you do (another shape, colour or collection), until you double-tap:
    that wipes the drawing, back to the plain carpet. A single tap on the rug shows the
    collection's next rug or shape (tapRug, js/carpet-collections.js).
  - With the whole rug in view, one finger on the white page around it swipes left or right to the
    next collection (the rug follows the finger; let go far enough, or flick, and the next one
    slides in: js/carpet-collections.js; past the last one it springs back). On a rug you draw on, the finger on the rug draws as
    always; on one you don't, the rug swipes too.
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
const FIT_SIDE = 36;    // space left and right of the full carpet (the arrows sit in it)
const FIT_LOW = 0.5;    // where the full carpet sits in the space it has, top (0) to bottom (1): centred
const BRUSH_WIDTH = 56;      // how wide the brush is, in carpet pixels: between a fingertip and a palm
const PILE_PUSH = 1.4;       // how far one stroke pushes the pile (1 = fully pushed after a brush width)
const PILE_FLATTEN = 0;      // brushed pile combed flat: how far its tufts turn into lines (0 = not at all)
const PILE_COMB = 2;         // how long those combed lines are, in photo pixels either side
const PILE_DEEP = 0.26;      // brushed pile always turns this much darker, whichever way it goes, so every stroke shows
const PILE_TONE = 0.14;      // and the direction adds a little: a bit lighter towards the light, darker away from it;
                             // the texture stays, only the light changes
const PILE_RICH = 0.45;      // darker pile also turns this much richer in colour, as in real velvet
const PILE_STREAKS = 0;      // fine streaks along each stroke (0 = none)
const PILE_SOFT = 0.3;       // how much of the brush's width fades out softly: a firm, organic edge
const PILE_WOBBLE = 0.35;    // how much the stroke's outline wanders, like the shapes in brushed velvet (0..1)
const SWIPE_FAR = 0.22;      // on the whole rug: drag this share of the screen's width to go to the next collection
const SWIPE_FLICK = 0.5;     // or flick at least this fast (screen pixels per ms)
const SWIPE_BACK = 380;      // ms for the rug to spring back when the swipe wasn't far enough
const SWIPE_DRAG = 0.3;      // moving sideways, the rug's bottom trails behind its top like fabric pulled
                             // across a floor: degrees of lean per screen pixel per frame of speed
const SWIPE_DRAG_MAX = 5;    // ... never more than this many degrees
const SWIPE_DRAG_EASE = 0.12; // how softly the lean follows the speed (lower = the fabric lags more)
const BRUSH_LIGHT = [218, 170, 125]; // the colour of brushed wool catching the light (r, g, b)
const BRUSH_SHADE = [196, 146, 104]; // a slightly deeper wool tone, mixed in for depth

const stage = document.querySelector("[data-viewer]");
let brushing = true; // whether one finger draws on the rug (js/carpet-collections.js: not on GrandMa Patterns)
// Another way for one finger to paint on the rug (js/carpet-ripple.js), instead of brushing the pile:
// { start(point), to(point), end(), wipe() }, points on the rug photo
let fingerPaint = null;
const carpet = stage.querySelector(".carpet");
const img = carpet.querySelector("img");
const brush = carpet.querySelector(".carpet__brush");
const brushCtx = brush.getContext("2d");

let brushTone = { light: BRUSH_LIGHT, shade: BRUSH_SHADE }; // the wool tones for the current rug colour
const topBar = document.querySelector("[data-fit-top]");
const rugInfo = document.querySelector("[data-rug-info]"); // collection name and size, under the top bar

// The rug on show: its size at the top (under its name) and its price in the Buy button, in the
// Italian way, "€ 8.999" (the € in the plain font: in the mono font it looks crooked). The price is
// also kept on rugInfo.dataset.price, for the bag, the info sheet and the saved picture.
function showSizeAndPrice(size, price) {
  rugInfo.querySelector("[data-rug-size]").textContent = size;
  rugInfo.dataset.price = price;
  const tag = document.querySelector("[data-rug-price]");
  if (!tag) return;
  const euro = document.createElement("span");
  euro.className = "rug-info__currency";
  euro.textContent = "€";
  tag.replaceChildren(euro, ` ${String(price).replace(/\B(?=(\d{3})+$)/g, ".")}`); // 8999 -> 8.999
}

// The price on show as text, "€ 8.999"
function priceText() {
  return `€ ${String(rugInfo.dataset.price || 0).replace(/\B(?=(\d{3})+$)/g, ".")}`;
}
const bottomBar = document.querySelector("[data-fit-bottom]");
const underRug = document.querySelectorAll("[data-fit-under]"); // the row (and Hypercode's tabs), under the full rug

// Where the carpet is: top-left corner (x, y) and size multiplier (scale)
let view = { x: 0, y: 0, scale: 1 };
let fitScale = 1;   // the scale where the whole carpet fits between the bars
let coverScale = 1; // the scale where the carpet covers the whole screen
let fit = { left: 0, top: 0, width: 0, height: 0 }; // the area the full carpet fits in

// ---------- Drawing ----------

const verb = stage.querySelector(".verb"); // "To Draw", kept on the middle of the rug

const OUT_ZOOM = 1.02; // zoomed out to (almost exactly) the full carpet: arrows, name, size and shapes show

let swipeShift = 0; // how far the whole rug is being swiped sideways, in screen pixels
let swipeLean = 0;  // degrees its bottom trails behind its top while it moves (see dragFabric)
let lastShift = 0;
let leaning = null;

function render() {
  carpet.style.transform = `translate3d(${view.x + swipeShift}px, ${view.y}px, 0) scale(${view.scale}) skewX(${swipeLean}deg)`;
  if (swipeShift !== lastShift && !leaning) leaning = requestAnimationFrame(dragFabric);
  stage.style.setProperty("--rug-y", `${view.y + (img.naturalHeight * view.scale) / 2}px`); // the arrows
  if (verb) placeVerb();
  const out = view.scale < fitScale * OUT_ZOOM;
  document.body.classList.toggle("is-zoomed-out", out);
  if (!out && verbWaiting) showVerb(); // the collection's verb waits for the close-up
}

// The verb only shows zoomed in: a collection that comes on zoomed out keeps it until you zoom in
let verbWaiting = false;
function showVerb() {
  if (!verb) return;
  verbWaiting = view.scale < fitScale * OUT_ZOOM;
  verb.classList.toggle("is-waiting", verbWaiting);
  if (verbWaiting) return;
  verb.style.animation = "none"; // show the word again
  void verb.offsetWidth;
  verb.style.animation = "";
}

// The verb in the middle of the rug as you see it: of the part of it on the screen between the
// top bar and the buttons at the bottom (zoomed out, simply the rug's middle)
function placeVerb() {
  const above = topBar.getBoundingClientRect().bottom;
  const below = bottomBar.getBoundingClientRect().top;
  const left = Math.max(0, view.x);
  const right = Math.min(stage.clientWidth, view.x + img.naturalWidth * view.scale);
  const top = Math.max(above, view.y);
  const bottom = Math.min(below, view.y + img.naturalHeight * view.scale);
  verb.style.setProperty("--rug-x", `${(left + right) / 2}px`);
  verb.style.setProperty("--rug-y", `${(top + bottom) / 2}px`);
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

// ---------- Measuring ----------

// The full carpet fits between the name and size (under the top bar) and the shapes (above Buy)
function measure() {
  // from the last line of text above it (the size and price), so the space above the rug is the
  // same as below it
  const top = (rugInfo.querySelector("[data-rug-size]") || rugInfo).getBoundingClientRect().bottom + FIT_GAP;
  // above the highest of what's under it (that's on show in this collection)
  const tops = [...underRug].filter((e) => e.getClientRects().length).map((e) => e.getBoundingClientRect().top);
  const bottom = Math.min(bottomBar.getBoundingClientRect().top, ...tops) - FIT_GAP;

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

// Smaller than the fit area: centre it across, and place it top to bottom by FIT_LOW (centred).
// Bigger than the whole screen: its edges never come inside the screen (no white showing).
// In between: the limits slide smoothly from one to the other.
function clampAxis(pos, size, areaStart, areaSize, screenSize, place = 0.5) {
  if (size <= areaSize) return areaStart + (areaSize - size) * place;

  const t = Math.min((size - areaSize) / Math.max(screenSize - areaSize, 1), 1);
  const max = areaStart * (1 - t);
  const min = (areaStart + areaSize - size) * (1 - t) + (screenSize - size) * t;
  return Math.min(Math.max(pos, min), max);
}

function clampView(v) {
  return {
    scale: v.scale,
    x: clampAxis(v.x, img.naturalWidth * v.scale, fit.left, fit.width, stage.clientWidth),
    y: clampAxis(v.y, img.naturalHeight * v.scale, fit.top, fit.height, stage.clientHeight, FIT_LOW),
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

let pile = null;    // { w, h, x, y (the arrows), mode, photo (its pixels), image }
let strokeId = 0;   // each stroke's number, so a pixel decides once per stroke: draw or erase
let strokeSeed = 0; // each stroke's own pattern of streaks and wobbles
let strokeTravel = 0; // how far the current stroke has gone, so its outline wobbles along its length

// Screen point -> point on the carpet photo
function toCarpet(p) {
  return { x: (p.x - view.x) / view.scale, y: (p.y - view.y) / view.scale };
}

// Where the solid rug is inside a cut-out photo (the photos keep the rug's soft edge and a little
// see-through margin around it): measured along the middle row and column
function solidArea(image) {
  const w = image.naturalWidth;
  const h = image.naturalHeight;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const row = ctx.getImageData(0, Math.floor(h / 2), w, 1).data;
  const col = ctx.getImageData(Math.floor(w / 2), 0, 1, h).data;
  const solid = (data, i) => data[i * 4 + 3] > 245;
  let left = 0;
  let right = w - 1;
  let top = 0;
  let bottom = h - 1;
  while (left < w - 1 && !solid(row, left)) left++;
  while (right > 0 && !solid(row, right)) right--;
  while (top < h - 1 && !solid(col, top)) top++;
  while (bottom > 0 && !solid(col, bottom)) bottom--;
  return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}

// A fresh, untouched pile the size of the rug photo, with the photo's own pixels to shade
function makePile(w, h) {
  const copy = document.createElement("canvas");
  copy.width = w;
  copy.height = h;
  const copyCtx = copy.getContext("2d");
  copyCtx.drawImage(img, 0, 0, w, h);
  const photo = copyCtx.getImageData(0, 0, w, h).data;
  return {
    w,
    h,
    x: new Float32Array(w * h),
    y: new Float32Array(w * h),
    mode: new Int32Array(w * h),
    photo,
    image: brushCtx.createImageData(w, h),
  };
}

// Smooth random wiggle, 0..1, for the streaks along a stroke (the same input always gives the same value)
function wiggle(t) {
  const i = Math.floor(t);
  const f = t - i;
  const hash = (k) => {
    const v = Math.sin(k * 127.1 + strokeSeed * 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const s = f * f * (3 - 2 * f);
  return hash(i) + (hash(i + 1) - hash(i)) * s;
}

// Push the pile under the brush as it moves from one point to the next, in the stroke's direction
function pushPile(from, to, dir) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.3) return;
  const sx = dx / length; // the path of the brush
  const sy = dy / length;
  const ux = dir.x; // the way the pile is pushed (the stroke's steady direction)
  const uy = dir.y;
  const r = BRUSH_WIDTH / 2;
  const push = (PILE_PUSH * length) / r;

  const left = Math.max(0, Math.floor(Math.min(from.x, to.x) - r));
  const right = Math.min(pile.w - 1, Math.ceil(Math.max(from.x, to.x) + r));
  const top = Math.max(0, Math.floor(Math.min(from.y, to.y) - r));
  const bottom = Math.min(pile.h - 1, Math.ceil(Math.max(from.y, to.y) + r));

  for (let py = top; py <= bottom; py++) {
    for (let px = left; px <= right; px++) {
      // how far this pixel is from the brush's path, and so how hard the brush presses on it:
      // fully across the middle of the brush, fading out over its outer edge
      const along = Math.max(0, Math.min(length, (px - from.x) * sx + (py - from.y) * sy));
      const gap = Math.hypot(px - (from.x + sx * along), py - (from.y + sy * along));
      if (gap >= r) continue;
      const side = (px - from.x) * -sy + (py - from.y) * sx; // which side of the path, and how far
      // the outline wanders: each side of the stroke is a little wider or narrower along its length
      const reach = r * (1 - PILE_WOBBLE * wiggle((strokeTravel + along) * 0.035 + (side > 0 ? 0 : 61)));
      if (gap >= reach) continue;
      const edge = Math.max(0, (gap / reach - (1 - PILE_SOFT)) / PILE_SOFT);
      const streak = 1 - PILE_STREAKS * wiggle(side * 0.45 + 50); // fine lines running along the stroke
      const press = (1 - edge * edge * (3 - 2 * edge)) * push * streak;

      const i = py * pile.w + px;
      const leaning = pile.x[i] * ux + pile.y[i] * uy; // how far the pile already leans this way

      // First touch in this stroke: brushing back along an earlier line (roughly the opposite way,
      // not just crossing it) -> this stroke erases here, else it draws
      if (pile.mode[i] >> 1 !== strokeId) {
        const lean = Math.hypot(pile.x[i], pile.y[i]);
        const against = lean > 0.02 && leaning / lean < -0.6;
        pile.mode[i] = (strokeId << 1) | (against ? 1 : 0);
      }

      if (pile.mode[i] & 1) {
        // erase: push the pile back towards home, but not past it; sideways lean fades too
        const back = Math.min(-leaning, press);
        const keep = Math.max(0, 1 - press);
        const sideX = (pile.x[i] - leaning * ux) * keep;
        const sideY = (pile.y[i] - leaning * uy) * keep;
        pile.x[i] = (leaning + back) * ux + sideX;
        pile.y[i] = (leaning + back) * uy + sideY;
      } else {
        // draw: the pile now lies the way this stroke goes (so going back over your own line in the
        // same stroke doesn't undo it), and it's pushed a little further, up to fully pushed
        const size = Math.hypot(pile.x[i], pile.y[i]);
        let x = ux + (size ? (pile.x[i] / size) * 0.3 : 0);
        let y = uy + (size ? (pile.y[i] / size) * 0.3 : 0);
        const length = Math.hypot(x, y) || 1;
        const strength = Math.min(1, size + press);
        pile.x[i] = (x / length) * strength;
        pile.y[i] = (y / length) * strength;
      }
    }
  }
  strokeTravel += length;
  markDirty(left, top, right, bottom);
  // remember where there are marks, so the lamp only has to relight there
  pile.marked = pile.marked
    ? {
        left: Math.min(pile.marked.left, left),
        top: Math.min(pile.marked.top, top),
        right: Math.max(pile.marked.right, right),
        bottom: Math.max(pile.marked.bottom, bottom),
      }
    : { left, top, right, bottom };
}

// The area of the rug that changed since the last frame: it's repainted once per frame, not after
// every small step of the brush (that was the lag on phones)
let dirty = null;
let painting = null;

function markDirty(left, top, right, bottom) {
  dirty = dirty
    ? {
        left: Math.min(dirty.left, left),
        top: Math.min(dirty.top, top),
        right: Math.max(dirty.right, right),
        bottom: Math.max(dirty.bottom, bottom),
      }
    : { left, top, right, bottom };
  if (!painting) painting = requestAnimationFrame(paintDirty);
}

function paintDirty() {
  painting = null;
  if (!dirty) return;
  const { left, top, right, bottom } = dirty;
  dirty = null;
  paintPile(left, top, right - left + 1, bottom - top + 1);
}

// Show the pushed pile on the rug photo itself: brushed pile is combed flat, so its tufts are
// drawn out into fine lines along the way it leans (each pixel averages the photo along that
// line), and it turns a little lighter where it leans towards the lamp, darker where it leans away
function paintPile(left = 0, top = 0, w = pile.w, h = pile.h) {
  const d = pile.image.data;
  const { photo } = pile;
  const W = pile.w;
  const H = pile.h;
  const lamp = typeof lampAngle === "number" ? (lampAngle * Math.PI) / 180 : -Math.PI * 0.75;
  const lx = Math.cos(lamp);
  const ly = Math.sin(lamp);

  for (let py = top; py < top + h; py++) {
    for (let px = left; px < left + w; px++) {
      const i = py * pile.w + px;
      const lean = Math.hypot(pile.x[i], pile.y[i]);
      const pushed = Math.min(1, lean);
      const o = i * 4;
      if (pushed < 0.004) {
        d[o + 3] = 0; // untouched: the photo shows as it is
        continue;
      }
      const ux = pile.x[i] / lean;
      const uy = pile.y[i] / lean;
      const facing = ux * lx + uy * ly; // -1 away from the lamp .. 1 towards it

      // the photo averaged along the lean: combed fibres (skipped when combing is off)
      let r = photo[o];
      let g = photo[o + 1];
      let b = photo[o + 2];
      let n = 1;
      if (PILE_FLATTEN > 0) {
        r = g = b = 0;
        for (let k = -PILE_COMB; k <= PILE_COMB; k++) {
          const sx = Math.min(W - 1, Math.max(0, Math.round(px + ux * k)));
          const sy = Math.min(H - 1, Math.max(0, Math.round(py + uy * k)));
          const q = (sy * W + sx) * 4;
          r += photo[q];
          g += photo[q + 1];
          b += photo[q + 2];
        }
        n = 2 * PILE_COMB + 1;
      }

      const comb = PILE_FLATTEN * pushed;
      const tone = 1 + (PILE_TONE * facing - PILE_DEEP) * pushed; // always below 1: brushed pile is deeper
      let cr = photo[o] + (r / n - photo[o]) * comb;
      let cg = photo[o + 1] + (g / n - photo[o + 1]) * comb;
      let cb = photo[o + 2] + (b / n - photo[o + 2]) * comb;
      {
        // deeper pile is also richer: its colour pulls away from grey
        const rich = 1 + PILE_RICH * (1 - tone) / (PILE_DEEP + PILE_TONE);
        const grey = 0.3 * cr + 0.59 * cg + 0.11 * cb;
        cr = grey + (cr - grey) * rich;
        cg = grey + (cg - grey) * rich;
        cb = grey + (cb - grey) * rich;
      }
      d[o] = cr * tone;
      d[o + 1] = cg * tone;
      d[o + 2] = cb * tone;
      d[o + 3] = photo[o + 3]; // only on the rug: never on the see-through margin around it
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
  if (!pile || !pile.marked || relighting) return; // no marks: nothing to relight
  const wait = Math.max(0, lastRelight + RELIGHT_EVERY - performance.now());
  relighting = setTimeout(() => {
    relighting = null;
    lastRelight = performance.now();
    if (!pile.marked) return;
    const { left, top, right, bottom } = pile.marked; // only where there are marks
    markDirty(left, top, right, bottom);
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
  dirty = null; // a repaint waiting for the old rug no longer fits; the whole new one is painted
  if (old && old.marked) pile.marked = { left: 0, top: 0, right: w - 1, bottom: h - 1 }; // marks came along
  brush.width = w;
  brush.height = h;
  if (old) copyMarks(old);
}

// Lay marks kept from another pile ({ w, h, x, y }) onto this one: scaled to fit it, centred
function copyMarks(old) {
  const { w, h } = pile;
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

// Hypercode's marks, put aside while another collection is on, so they're back when you return
let keptMarks = null;
function keepMarks() {
  keptMarks = pile && pile.marked ? { w: pile.w, h: pile.h, x: pile.x.slice(), y: pile.y.slice() } : null;
}
function restoreMarks() {
  if (!keptMarks || !pile) return;
  copyMarks(keptMarks);
  pile.marked = { left: 0, top: 0, right: pile.w - 1, bottom: pile.h - 1 };
  keptMarks = null;
  paintPile();
}

function startStroke(stroke, point) {
  strokeId++;
  strokeSeed = Math.random() * 1000;
  strokeTravel = 0;
  stroke.at = point;   // where the drawn line has reached
  stroke.bend = point; // the last finger position: the line curves towards it
}

// Draw a smooth curve from a to c, bending towards b, pushing the pile in small steps along it
function brushCurve(a, b, c) {
  const steps = Math.max(1, Math.ceil((Math.hypot(b.x - a.x, b.y - a.y) + Math.hypot(c.x - b.x, c.y - b.y)) / 2));
  let from = a;
  for (let k = 1; k <= steps; k++) {
    const t = k / steps;
    const to = {
      x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * b.x + t * t * c.x,
      y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * b.y + t * t * c.y,
    };
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length >= 0.3) {
      pushPile(from, to, { x: (to.x - from.x) / length, y: (to.y - from.y) / length });
      from = to;
    }
  }
}

// A new finger position: curve on to halfway between the last one and this one
// (joining the halfway points with curves gives smooth lines, never corners)
function brushTo(stroke, finger) {
  const half = { x: (stroke.bend.x + finger.x) / 2, y: (stroke.bend.y + finger.y) / 2 };
  brushCurve(stroke.at, stroke.bend, half);
  stroke.at = half;
  stroke.bend = finger;
}

// Lifting the finger: finish the line at the last position
function finishStroke(stroke, finger) {
  brushCurve(stroke.at, stroke.bend, finger);
}

// Double-tap: back to the untouched pile
function wipeDrawing() {
  pile.x.fill(0);
  pile.y.fill(0);
  pile.marked = null;
  paintPile();
}

// ---------- Swiping to the next collection ----------

function isWhole() {
  return view.scale < fitScale * 1.05;
}

// Every frame while the rug moves sideways: its bottom leans back against the way it goes, more the
// faster it goes, and straightens as it comes to rest
function dragFabric() {
  const speed = swipeShift - lastShift;
  lastShift = swipeShift;
  const want = Math.max(-SWIPE_DRAG_MAX, Math.min(SWIPE_DRAG_MAX, -speed * SWIPE_DRAG));
  swipeLean += (want - swipeLean) * SWIPE_DRAG_EASE;
  const still = speed === 0 && Math.abs(swipeLean) < 0.02;
  if (still) swipeLean = 0;
  leaning = null;
  render();
  if (!still) leaning = requestAnimationFrame(dragFabric);
}

// Put the rug somewhere sideways at once (off screen, ready to slide in), keeping its lean
function placeRug(shift) {
  swipeShift = shift;
  lastShift = shift;
  render();
}

// Slide the rug sideways to `target` screen pixels from the middle; resolves when it's there
function slideRug(target, duration, ease = (t) => 1 - Math.pow(1 - t, 3)) {
  const from = swipeShift;
  const start = performance.now();
  return new Promise((done) => {
    function step(now) {
      const t = Math.min((now - start) / duration, 1);
      swipeShift = from + (target - from) * ease(t);
      render();
      if (t < 1) requestAnimationFrame(step);
      else done();
    }
    requestAnimationFrame(step);
  });
}

// Let go: far enough (or a flick) goes to the next collection that way, round and round;
// otherwise the rug springs back to the middle
function endSwipe(velocityX) {
  const far = Math.abs(swipeShift) > stage.clientWidth * SWIPE_FAR;
  const flick = Math.abs(velocityX) > SWIPE_FLICK && Math.abs(swipeShift) > 50 && Math.sign(velocityX) === Math.sign(swipeShift);
  if ((far || flick) && typeof switchCollection === "function") {
    switchCollection(swipeShift < 0 ? 1 : -1); // swiped left: the next one comes in from the right
    return;
  }
  slideRug(0, SWIPE_BACK);
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
    // With the whole rug in view, a finger anywhere swipes between collections: touching,
    // painting and blowing only happen in the close-up
    if (gesture.swipe || (!moved && isWhole())) {
      const dx = p.x - gesture.start.x;
      if (!gesture.swipe) {
        if (Math.hypot(dx, p.y - gesture.start.y) <= 6) return;
        moved = true;
        gesture.swipe = { last: p.x, time: performance.now(), velocity: 0 };
      }
      const now = performance.now();
      gesture.swipe.velocity = (p.x - gesture.swipe.last) / Math.max(now - gesture.swipe.time, 1);
      gesture.swipe.last = p.x;
      gesture.swipe.time = now;
      // nothing more that way (the first or last collection): the rug only gives a little
      const more = typeof canSwitch !== "function" || canSwitch(dx < 0 ? 1 : -1);
      swipeShift = more ? dx : dx * 0.25;
      render();
      return;
    }
    if (!brushing && !fingerPaint) return;
    // A tap is not a stroke: only start brushing once the finger really moves
    if (!moved) {
      if (Math.hypot(p.x - gesture.start.x, p.y - gesture.start.y) <= 4) return;
      moved = true;
      if (fingerPaint) {
        gesture.painting = true;
        fingerPaint.start(gesture.last);
      } else {
        gesture.stroke = {};
        startStroke(gesture.stroke, gesture.last);
      }
    }

    // Painting another way (js/carpet-ripple.js): every position the phone recorded goes to it
    if (gesture.painting) {
      const recorded = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      (recorded.length ? recorded : [e]).forEach((ev) => fingerPaint.to(toCarpet(localPoint(ev))));
      gesture.last = toCarpet(p);
      return;
    }

    // every position the phone recorded since the last move (it sends them in batches)
    const recorded = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    (recorded.length ? recorded : [e]).forEach((ev) => brushTo(gesture.stroke, toCarpet(localPoint(ev))));
    gesture.last = toCarpet(p);

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

  if (gesture.swipe) {
    endSwipe(performance.now() - gesture.swipe.time < 100 ? gesture.swipe.velocity : 0);
    gesture = { type: "rest" };
    return;
  }

  if (gesture.stroke) finishStroke(gesture.stroke, toCarpet(p));
  if (gesture.painting && fingerPaint) fingerPaint.end();
  if (typeof brushSound !== "undefined") brushSound.stop();

  // Double-tap: wipe the drawing. A single tap on the rug (no second one follows): the next rug
  if (!moved) {
    const quick = now - lastTap.time < DOUBLE_TAP;
    const near = Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 30;
    clearTimeout(singleTap);
    if (quick && near) {
      wipeDrawing();
      if (fingerPaint) fingerPaint.wipe();
      lastTap = { time: 0, x: 0, y: 0 };
      return;
    }
    lastTap = { time: now, ...p };
    if (onCarpet(p.x, p.y) && typeof tapRug === "function") singleTap = setTimeout(tapRug, DOUBLE_TAP);
  }
}

const DOUBLE_TAP = 300; // ms: a second tap within this is a double tap
let singleTap = null;

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

// The zoom button (bottom left): close-up -> whole rug, whole rug -> close-up on its middle
const zoomButton = document.querySelector("[data-zoom]");
if (zoomButton) {
  zoomButton.addEventListener("click", () => {
    const isFull = view.scale < fitScale * 1.05;
    if (isFull) {
      animateTo(clampView(zoomAt(view, closeUpScale(), fit.left + fit.width / 2, fit.top + fit.height / 2)));
    } else {
      animateTo(centredView(fitScale));
    }
  });
}

// Stop Safari's own page pinch-zoom from fighting ours
["gesturestart", "gesturechange"].forEach((type) =>
  document.addEventListener(type, (e) => e.preventDefault())
);

// ---------- Start ----------

// Size the carpet and its pile to the rug photo (the marks come along, scaled to fit)
function sizeCarpet() {
  carpet.style.width = `${img.naturalWidth}px`;
  carpet.style.height = `${img.naturalHeight}px`;
  // the lamp's light falls on the rug only, following its outline, not on the see-through margin around it
  const light = carpet.querySelector(".carpet__light");
  if (light) light.style.webkitMaskImage = light.style.maskImage = `url("${img.src}")`;
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
// then the whole new rug is shown. round: the rug is a circle. fade: false swaps it straight
// away (when it's slid off screen, js/carpet-collections.js).
async function changeRug(src, { round = false, zoomOut = false, fade = true } = {}) {
  const next = new Image();
  next.src = src;
  await whenLoaded(next);

  if (fade) {
    carpet.classList.add("is-changing");
    await new Promise((done) => setTimeout(done, RUG_FADE));
  }

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
