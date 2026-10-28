/*
  The collections on the one page: Hypercode (to draw) and GrandMa Patterns (to blow). Going from
  one to the next, only the rug moves: it slides off to the side, with its name and its row,
  and the next collection's rug slides in from the other side. The top bar and the buttons at the
  bottom stay where they are, and nothing reloads.

  - Swiping on the white page around the whole rug (js/carpet-viewer.js) calls switchCollection:
    one swipe, the next collection, in the menu's order. Past the first or the last there's
    nothing more, so the rug resists the finger and springs back. The menu (js/carpet-menu.js)
    calls showCollection.
  - The address remembers the collection (#grandma-patterns), so a reload, or an old link to the
    blow page, opens it.

  Needs everything else loaded first (the menu's MENU_COLLECTIONS, the viewer, the row, and each
  collection's enter / leave in js/carpet-shapes.js and js/carpet-rugs.js).
*/

const SLIDE_OUT = 260;  // ms for the rug to slide off screen (speeding up as it goes)
const SLIDE_IN = 560;   // ms for the next one to slide in (slowing down as it arrives)

// What each collection brings: whether one finger draws on its rug, and how it comes on and goes
const COLLECTION_PARTS = {
  hypercode: { brush: true, enter: (whole) => enterHypercode(whole), leave: () => {} },
  "grandma-patterns": { brush: false, enter: (whole) => enterGrandma(whole), leave: () => leaveGrandma() },
};

const verbText = document.querySelector("[data-verb]");
let collectionIndex = -1;
let sliding = false;

// Everything on the page that belongs to this collection: which buttons show (css/main.css),
// whether the finger draws, the word on the rug, the menu, the address
function applyCollection(index) {
  const collection = MENU_COLLECTIONS[index];
  collectionIndex = index;
  document.body.dataset.collection = collection.id;
  brushing = COLLECTION_PARTS[collection.id].brush;
  if (verbText) {
    verbText.textContent = collection.verb;
    verbText.style.animation = "none"; // show the word again
    void verbText.offsetWidth;
    verbText.style.animation = "";
  }
  markMenu(collection.id);
  history.replaceState(null, "", `#${collection.id}`);
}

// Slide to the collection at `index`. dir: 1 = it comes in from the right, -1 from the left
// (by default, whichever way it lies in the list)
async function showCollection(index, dir = index > collectionIndex ? 1 : -1) {
  if (sliding) return;
  if (index === collectionIndex) {
    slideRug(0, SLIDE_IN); // a swipe that came back to where it started
    return;
  }
  sliding = true;
  const whole = isWhole();
  const width = stage.clientWidth;
  const leaving = MENU_COLLECTIONS[collectionIndex].id;

  await slideRug(-dir * width, SLIDE_OUT, (t) => t * t);
  COLLECTION_PARTS[leaving].leave();
  if (pile) wipeDrawing(); // the drawing stays with its rug
  applyCollection(index);
  await COLLECTION_PARTS[MENU_COLLECTIONS[index].id].enter(whole);

  swipeShift = dir * width;
  render();
  await slideRug(0, SLIDE_IN);
  sliding = false;
  preloadNeighbours();
}

// Is there a collection that way? (step 1: the next one, -1: the one before)
function canSwitch(step) {
  const index = collectionIndex + step;
  return index >= 0 && index < MENU_COLLECTIONS.length;
}

// The next (step 1) or previous (step -1) collection; at the ends, the rug springs back
function switchCollection(step) {
  if (canSwitch(step)) showCollection(collectionIndex + step, step);
  else slideRug(0, SLIDE_IN);
}

// The rugs either side are loaded ahead, so they're ready when they slide in
function preloadNeighbours() {
  [1, -1].forEach((step) => {
    if (canSwitch(step)) new Image().src = MENU_COLLECTIONS[collectionIndex + step].rug;
  });
}

// ---------- Start ----------

// The collection in the address (#grandma-patterns), or the first one. The rug stays hidden
// (css/main.css, is-starting) until that collection's rug is in place.
(async function startCollections() {
  const fromAddress = MENU_COLLECTIONS.findIndex((c) => `#${c.id}` === location.hash);
  const index = Math.max(0, fromAddress);
  applyCollection(index);
  await whenLoaded(img);
  await COLLECTION_PARTS[MENU_COLLECTIONS[index].id].enter(false);
  document.body.classList.remove("is-starting");
  preloadNeighbours();
})();
