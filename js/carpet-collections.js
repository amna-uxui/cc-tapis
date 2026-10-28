/*
  The collections on the one page: Hypercode (to touch), GrandMa Patterns (to blow) and Ripple
  Square (to paint). Going from one to the next, only the rug moves: it slides off to the side (its bottom trailing a little
  behind, like fabric pulled across a floor) and the next collection's rug slides in from the other
  side and settles; its name above and its row below just fade over. The top bar and the buttons at the
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

const SLIDE_OUT = 380;  // ms for the rug to slide off screen
const SLIDE_IN = 780;   // ms for the next one to slide in, coming to rest slowly like a heavy rug

const easeOut = (t) => 1 - Math.pow(1 - t, 2);              // already moving (let go of a swipe): carries on, then off
const easeInOut = (t) => 0.5 - Math.cos(Math.PI * t) / 2;   // from rest (the menu): sets off gently
const settle = (t) => 1 - Math.pow(1 - t, 4);               // arriving: glides in and settles softly

// What each collection brings: whether one finger draws on its rug, how it comes on and goes, and
// what a tap on the rug does (the next shape on the whole Hypercode rug, where the close-up is
// for drawing; the next rug on GrandMa Patterns, at any zoom)
const COLLECTION_PARTS = {
  hypercode: { brush: true, enter: (whole) => enterHypercode(whole), leave: () => {}, tap: () => isWhole() && nextShape() },
  "grandma-patterns": { brush: false, enter: (whole) => enterGrandma(whole), leave: () => leaveGrandma(), tap: () => nextRug() },
  // Ripple Square: the finger paints colours (js/carpet-ripple.js), not the pile
  "ripple-square": { brush: false, enter: (whole) => enterRipple(whole), leave: () => leaveRipple(), tap: () => tapRipple() },
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

  // the name and the row fade out (css/main.css) while the rug slides away
  document.body.classList.add("is-switching");
  await slideRug(-dir * width, SLIDE_OUT, swipeShift !== 0 ? easeOut : easeInOut);
  COLLECTION_PARTS[leaving].leave();
  if (pile) wipeDrawing(); // the drawing stays with its rug
  applyCollection(index);
  await COLLECTION_PARTS[MENU_COLLECTIONS[index].id].enter(whole);

  // the next rug comes in from the other side, its name and row fading in
  placeRug(dir * width);
  document.body.classList.remove("is-switching");
  await slideRug(0, SLIDE_IN, settle);
  sliding = false;
  preloadNeighbours();
}

// A single tap on the rug (js/carpet-viewer.js)
function tapRug() {
  if (sliding || collectionIndex < 0) return;
  COLLECTION_PARTS[MENU_COLLECTIONS[collectionIndex].id].tap();
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
