/*
  Carpet shapes: while zoomed out, three small shapes sit under the rug, above Buy. Each shape is cut from the current colour's rug photo, so every colour comes in
  every shape. Picking one shows the rug in its new shape, with its size.

  Needs js/carpet-viewer.js (changeRug, setBrushTone, rugInfo) and js/carpet-colors.js
  (current) to be loaded first.
*/

// The rug's name is the collection plus its shape: "Hypercode Rectangle", "Hypercode Square", ...
const COLLECTION = "Hypercode";
const DESIGNER = "Roberto Sironi";

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

// The biggest piece of the photo with the shape's proportions, from the middle
// (a circle is cut as a square; the viewer rounds its edge)
async function shapedSrc(color, shape) {
  const photo = color.photo;
  const photoAspect = photo.naturalWidth / photo.naturalHeight;
  if (Math.abs(photoAspect - shape.aspect) < 0.01) return color.src;

  const key = `${color.name}/${shape.aspect}`;
  if (shapedPhotos.has(key)) return shapedPhotos.get(key);

  let w = photo.naturalWidth;
  let h = photo.naturalHeight;
  if (photoAspect > shape.aspect) w = Math.round(h * shape.aspect);
  else h = Math.round(w / shape.aspect);

  const cut = document.createElement("canvas");
  cut.width = w;
  cut.height = h;
  cut.getContext("2d").drawImage(photo, (photo.naturalWidth - w) / 2, (photo.naturalHeight - h) / 2, w, h, 0, 0, w, h);
  const blob = await new Promise((done) => cut.toBlob(done, "image/jpeg", 0.92));
  const src = URL.createObjectURL(blob);
  shapedPhotos.set(key, src);
  return src;
}

// Show the current colour in the current shape (also used by js/carpet-colors.js)
async function renderRug(zoomOut = false) {
  await current.loaded;
  const src = await shapedSrc(current, currentShape);
  await changeRug(src, { round: Boolean(currentShape.round), zoomOut });
  setBrushTone(current.tone);
}

// ---------- Choosing ----------

let reshaping = false;

async function chooseShape(shape) {
  if (shape === currentShape || reshaping) return;
  reshaping = true;
  currentShape = shape;
  markShape();
  await renderRug(true);
  reshaping = false;
}

function shapeIcon(shape) {
  const icon = document.createElement("span");
  icon.className = `shape-icon shape-icon--${shape.name.toLowerCase()}`;
  return icon;
}

// Mark the chosen shape and show its name, size and price
function markShape() {
  shapeRow.querySelectorAll(".shape-option").forEach((option) => {
    option.setAttribute("aria-pressed", option.dataset.name === currentShape.name);
  });
  infoName.textContent = `${COLLECTION} ${currentShape.name}`;
  infoDesigner.textContent = `by ${DESIGNER}`;
  // Italian style, "€ 8.999"; the € in the plain font (in the mono font it looks crooked)
  const euro = document.createElement("span");
  euro.className = "rug-info__currency";
  euro.textContent = "€";
  const amount = String(currentShape.price).replace(/\B(?=(\d{3})+$)/g, "."); // 8999 -> 8.999
  infoSize.replaceChildren(`${currentShape.size} | `, euro, ` ${amount}`);
}

// ---------- The shapes ----------

function buildShapes() {
  SHAPES.forEach((shape) => {
    const option = document.createElement("button");
    option.className = "shape-option";
    option.dataset.name = shape.name;
    option.setAttribute("aria-label", shape.name);
    option.append(shapeIcon(shape));
    option.addEventListener("click", () => chooseShape(shape));
    shapeRow.append(option);
  });
  markShape();
}

buildShapes();
