/*
  Carpet shapes: while zoomed out, the shapes go round an endless strip under the rug, above Buy
  (js/carpet-strip.js). Each shape is cut from the current colour's rug photo, so every colour
  comes in every shape. The shape that settles in the middle is shown, with its size.

  Needs js/carpet-viewer.js (changeRug, setBrushTone, rugInfo), js/carpet-colors.js (current) and
  js/carpet-strip.js (makeStrip) to be loaded first.
*/

// The rug's name is the collection plus its shape: "Hypercode Rectangle", "Hypercode Square", ...
const HYPERCODE_NAME = "Hypercode";
const HYPERCODE_DESIGNER = "Roberto Sironi";

// The first one is the shape the page opens with. aspect: width / height.
// size and price in euros, shown under the collection name (placeholders, except the rectangle's price).
const SHAPES = [
  { name: "Rectangle", aspect: 804 / 1096, size: "200 × 270 cm", price: 8999 },
  { name: "Square", aspect: 1, size: "250 × 250 cm", price: 8999 },
  { name: "Circle", aspect: 1, round: true, size: "Ø 250 cm", price: 8999 },
];

const shapeRow = document.querySelector("[data-shape-options]");
const infoName = rugInfo.querySelector("[data-rug-name]");
const infoDesigner = rugInfo.querySelector("[data-rug-designer]");
const infoSize = rugInfo.querySelector("[data-rug-size]");

let currentShape = SHAPES[0];

// ---------- Cutting the rug photo into a shape ----------

const shapedPhotos = new Map(); // "colour/shape" -> image address, so each is only cut once

// The rug in its own shape: the photo as it is, with the rug's real edge. Another shape: the
// biggest piece of the solid rug with that shape's proportions, from the middle, given an edge
// like the photos' real ones (see softEdge)
async function shapedSrc(color, shape) {
  const photo = color.photo;
  if (shape.name === color.shape) return color.src;

  const key = `${color.name}/${shape.name}`;
  if (shapedPhotos.has(key)) return shapedPhotos.get(key);

  const rug = solidArea(photo);
  let w = rug.w;
  let h = rug.h;
  if (w / h > shape.aspect) w = Math.round(h * shape.aspect);
  else h = Math.round(w / shape.aspect);
  const sx = rug.x + (rug.w - w) / 2;
  const sy = rug.y + (rug.h - h) / 2;

  // the piece, with a see-through margin around it for the edge and shadow; a slightly larger copy
  // behind it gives the fibres that stick out past the edge their colour
  const cut = document.createElement("canvas");
  cut.width = w + EDGE_MARGIN * 2;
  cut.height = h + EDGE_MARGIN * 2;
  const ctx = cut.getContext("2d");
  ctx.drawImage(photo, sx, sy, w, h, EDGE_MARGIN - 4, EDGE_MARGIN - 4, w + 8, h + 8);
  ctx.drawImage(photo, sx, sy, w, h, EDGE_MARGIN, EDGE_MARGIN, w, h);
  softEdge(ctx, cut.width, cut.height, Boolean(shape.round));

  const blob = await new Promise((done) => cut.toBlob(done, "image/png"));
  const src = URL.createObjectURL(blob);
  shapedPhotos.set(key, src);
  return src;
}

// ---------- A rug edge like the real ones ----------

const EDGE_MARGIN = 14;   // see-through space around a cut shape, for its edge and shadow (as in the photos)
const EDGE_SOFT = 3;      // how many pixels the edge takes to fade out
const EDGE_FUZZ = 2.2;    // how unevenly, pixel by pixel: fibres sticking out
const EDGE_WOBBLE = 1.4;  // how much the outline wanders, so it isn't a perfect geometric line
const EDGE_CORNER = 8;    // how rounded the corners of square and rectangle cuts are
const EDGE_SHADOW = 0.14; // how strong the faint shadow just outside the rug is

// Turn the hard outline of a cut piece into a soft, fuzzy rug edge with a faint shadow
function softEdge(ctx, w, h, round) {
  const image = ctx.getImageData(0, 0, w, h);
  const d = image.data;
  const cx = w / 2;
  const cy = h / 2;
  const halfW = w / 2 - EDGE_MARGIN;
  const halfH = h / 2 - EDGE_MARGIN;
  const shadow = [96, 88, 80];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // how far outside the shape this pixel is (negative inside)
      let outside;
      if (round) {
        outside = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - halfW;
      } else {
        const qx = Math.abs(x + 0.5 - cx) - (halfW - EDGE_CORNER);
        const qy = Math.abs(y + 0.5 - cy) - (halfH - EDGE_CORNER);
        outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - EDGE_CORNER;
      }
      if (outside < -EDGE_SOFT - EDGE_WOBBLE - EDGE_FUZZ) continue; // well inside: untouched

      const a = Math.atan2(y - cy, x - cx);
      const wobble = (Math.sin(a * 7 + 1.3) * 0.5 + Math.sin(a * 13 + 4) * 0.3 + Math.sin(a * 29) * 0.2) * EDGE_WOBBLE;
      const fuzz = (Math.random() - 0.5) * EDGE_FUZZ;
      const rug = Math.min(1, Math.max(0, (EDGE_SOFT / 2 - (outside + wobble + fuzz)) / EDGE_SOFT));
      const shade = outside > 0 ? EDGE_SHADOW * Math.exp(-outside / 3.5) : 0;

      const alpha = rug + shade * (1 - rug);
      const o = (y * w + x) * 4;
      if (alpha <= 0) {
        d[o + 3] = 0;
        continue;
      }
      for (let c = 0; c < 3; c++) d[o + c] = (d[o + c] * rug + shadow[c] * shade * (1 - rug)) / alpha;
      d[o + 3] = alpha * 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}

// Show the current colour in the current shape (also used by js/carpet-colors.js).
// fade: false swaps it straight away (while it's slid off screen).
async function renderRug(zoomOut = false, fade = true) {
  await current.loaded;
  const src = await shapedSrc(current, currentShape);
  await changeRug(src, { round: Boolean(currentShape.round), zoomOut, fade });
  setBrushTone(current.tone);
}

// ---------- Choosing ----------

let reshaping = false;

// A new shape in the middle of the strip. Swiped past several quickly, the rug catches up with the
// last one once the one before has finished.
async function chooseShape(shape) {
  if (shape === currentShape) return;
  currentShape = shape;
  markShape();
  if (reshaping) return;
  reshaping = true;
  let shown;
  do {
    shown = currentShape;
    await renderRug(true);
  } while (shown !== currentShape);
  reshaping = false;
}

function shapeIcon(shape) {
  const icon = document.createElement("span");
  icon.className = `shape-icon shape-icon--${shape.name.toLowerCase()}`;
  return icon;
}

// Show the chosen shape's name, size and price
function markShape() {
  infoName.textContent = `${HYPERCODE_NAME} ${currentShape.name}`;
  infoDesigner.textContent = `by ${HYPERCODE_DESIGNER}`;
  // Italian style, "€ 8.999"; the € in the plain font (in the mono font it looks crooked)
  const euro = document.createElement("span");
  euro.className = "rug-info__currency";
  euro.textContent = "€";
  const amount = String(currentShape.price).replace(/\B(?=(\d{3})+$)/g, "."); // 8999 -> 8.999
  infoSize.replaceChildren(`${currentShape.size} | `, euro, ` ${amount}`);
}

// ---------- The shapes ----------

function buildShapes() {
  makeStrip(shapeRow, SHAPES, { draw: shapeIcon, choose: chooseShape, start: SHAPES.indexOf(currentShape) });
  markShape();
}

// Hypercode comes on (js/carpet-collections.js): its shapes in the strip, its rug as you left it.
// whole: show the whole rug.
async function enterHypercode(whole) {
  buildShapes();
  if (current.swatch) showSwatch(current.swatch);
  await renderRug(whole, false);
}
