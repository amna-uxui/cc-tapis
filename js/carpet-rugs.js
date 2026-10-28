/*
  The rugs of the collection: while zoomed out, a small picture of each rug sits under the rug,
  above Buy. Picking one shows that rug, with its name, designer, size and price, and you can
  blow on it like the others.

  Needs js/carpet-viewer.js (changeRug, rugInfo) and js/carpet-blow.js (loadPhoto) to be loaded first.
*/

// The collection: Rop van Mierlo's GrandMa Patterns. Each photo is the rug cut out with its real
// soft edge (tools/cut-out-rug.py --solid); thumb: a small copy for the picker (sips -Z 160).
// The first one is the rug the page opens with (the same photo as in blow.html).
// size and price in euros: placeholders until the real ones come in.
const COLLECTION = "GrandMa Patterns";
const DESIGNER = "Rop van Mierlo";

const RUGS = [
  { name: "Mustard Green", size: "200 × 300 cm", price: 6999, src: "images/grandma-mustardgreen-cut.png", thumb: "images/thumbs/grandma-mustardgreen.png" },
  { name: "Green Red", size: "200 × 300 cm", price: 6999, src: "images/grandma-greenred-cut.png", thumb: "images/thumbs/grandma-greenred.png" },
  { name: "Mustard Red", size: "200 × 300 cm", price: 6999, src: "images/grandma-mustardred-cut.png", thumb: "images/thumbs/grandma-mustardred.png" },
  { name: "Pink Blue", size: "200 × 300 cm", price: 6999, src: "images/grandma-pinkblue-cut.png", thumb: "images/thumbs/grandma-pinkblue.png" },
  { name: "Purple Brown", size: "200 × 300 cm", price: 6999, src: "images/grandma-purplebrown-cut.png", thumb: "images/thumbs/grandma-purplebrown.png" },
];

const rugRow = document.querySelector("[data-rug-options]");

let currentRug = RUGS[0];
let switching = false;

// Show the chosen rug's name, designer, size and price, and mark its picture
function markRug() {
  rugRow.querySelectorAll(".rug-option").forEach((option) => {
    option.setAttribute("aria-pressed", option.dataset.name === currentRug.name);
  });
  rugInfo.querySelector("[data-rug-name]").textContent = `${COLLECTION} ${currentRug.name}`;
  rugInfo.querySelector("[data-rug-designer]").textContent = `by ${DESIGNER}`;
  // Italian style, "€ 6.999"; the € in the plain font (in the mono font it looks crooked)
  const euro = document.createElement("span");
  euro.className = "rug-info__currency";
  euro.textContent = "€";
  const amount = String(currentRug.price).replace(/\B(?=(\d{3})+$)/g, "."); // 6999 -> 6.999
  rugInfo.querySelector("[data-rug-size]").replaceChildren(`${currentRug.size} | `, euro, ` ${amount}`);
}

async function chooseRug(rug) {
  if (rug === currentRug || switching) return;
  switching = true;
  currentRug = rug;
  markRug();
  await changeRug(rug.src, { zoomOut: true });
  loadPhoto(); // the wind layer takes the new photo (js/carpet-blow.js)
  switching = false;
}

function buildRugs() {
  RUGS.forEach((rug) => {
    const option = document.createElement("button");
    option.className = "rug-option";
    option.dataset.name = rug.name;
    option.setAttribute("aria-label", rug.name);
    const picture = document.createElement("img");
    picture.src = rug.thumb;
    picture.alt = "";
    picture.draggable = false;
    option.append(picture);
    option.addEventListener("click", () => chooseRug(rug));
    rugRow.append(option);
  });
  markRug();
}

buildRugs();
