/*
  The rugs of the collection: while zoomed out, small pictures of the rugs go round an endless
  strip under the rug, above Buy (js/carpet-strip.js). The rug that settles in the middle is shown,
  with its name, designer, size and price, and you can blow on it like the others.

  Needs js/carpet-viewer.js (changeRug, rugInfo), js/carpet-blow.js (loadPhoto) and
  js/carpet-strip.js (makeStrip) to be loaded first.
*/

// The collection: Rop van Mierlo's GrandMa Patterns. Each photo is the rug cut out with its real
// soft edge (tools/cut-out-rug.py --solid); thumb: a small copy for the picker (sips -Z 160).
// The first one is the rug the page opens with (the same photo as in blow.html).
// size and price in euros (the same for every rug in the collection).
const GRANDMA_NAME = "GrandMa Patterns";
const GRANDMA_DESIGNER = "Rop van Mierlo";

const RUGS = [
  { name: "Mustard Green", size: "200 × 300 cm", price: 2900, src: "images/grandma-mustardgreen-cut.png", thumb: "images/thumbs/grandma-mustardgreen.png" },
  { name: "Green Red", size: "200 × 300 cm", price: 2900, src: "images/grandma-greenred-cut.png", thumb: "images/thumbs/grandma-greenred.png" },
  { name: "Mustard Red", size: "200 × 300 cm", price: 2900, src: "images/grandma-mustardred-cut.png", thumb: "images/thumbs/grandma-mustardred.png" },
  { name: "Pink Blue", size: "200 × 300 cm", price: 2900, src: "images/grandma-pinkblue-cut.png", thumb: "images/thumbs/grandma-pinkblue.png" },
  { name: "Purple Brown", size: "200 × 300 cm", price: 2900, src: "images/grandma-purplebrown-cut.png", thumb: "images/thumbs/grandma-purplebrown.png" },
];

const rugRow = document.querySelector("[data-rug-options]");

let currentRug = RUGS[0];
let switching = false;

// Show the chosen rug's name, designer, size and price
function markRug() {
  rugInfo.querySelector("[data-rug-name]").textContent = `${GRANDMA_NAME} ${currentRug.name}`;
  rugInfo.querySelector("[data-rug-designer]").textContent = `by ${GRANDMA_DESIGNER}`;
  // Italian style, "€ 6.999"; the € in the plain font (in the mono font it looks crooked)
  const euro = document.createElement("span");
  euro.className = "rug-info__currency";
  euro.textContent = "€";
  const amount = String(currentRug.price).replace(/\B(?=(\d{3})+$)/g, "."); // 6999 -> 6.999
  rugInfo.querySelector("[data-rug-size]").replaceChildren(`${currentRug.size} | `, euro, ` ${amount}`);
}

// A new rug in the middle of the strip. Swiped past several quickly, the rug catches up with the
// last one once the one before has finished.
async function chooseRug(rug) {
  if (rug === currentRug) return;
  currentRug = rug;
  markRug();
  if (switching) return;
  switching = true;
  let shown;
  do {
    shown = currentRug;
    await changeRug(shown.src, { zoomOut: true });
    loadPhoto(); // the wind layer takes the new photo (js/carpet-blow.js)
  } while (shown !== currentRug);
  switching = false;
}

// A small picture of a rug, for the strip
function rugThumb(rug) {
  const picture = document.createElement("img");
  picture.className = "rug-thumb";
  picture.src = rug.thumb;
  picture.alt = "";
  picture.draggable = false;
  return picture;
}

function buildRugs() {
  makeStrip(rugRow, RUGS, { draw: rugThumb, choose: chooseRug, start: RUGS.indexOf(currentRug) });
  markRug();
}

// GrandMa Patterns comes on (js/carpet-collections.js): its rugs in the strip, the rug you were on.
// whole: show the whole rug.
async function enterGrandma(whole) {
  buildRugs();
  await changeRug(currentRug.src, { zoomOut: whole, fade: false });
  loadPhoto();
  blowActive = true;
}

// ... and goes: the wind stops and the microphone is let go
function leaveGrandma() {
  blowActive = false;
  calmWind();
}
