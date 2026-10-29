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
const SETTLE = 350;    // ms for a glimpsed rug, once in, to settle into its own place

const easeOut = (t) => 1 - Math.pow(1 - t, 2);              // already moving (let go of a swipe): carries on, then off
const easeInOut = (t) => 0.5 - Math.cos(Math.PI * t) / 2;   // from rest (the menu): sets off gently
const settle = (t) => 1 - Math.pow(1 - t, 4);               // arriving: glides in and settles softly

// What each collection brings: whether one finger draws on its rug, and how it comes on and goes
const COLLECTION_PARTS = {
  // Hypercode's marks are put aside while you're away, and come back with it (js/carpet-viewer.js)
  hypercode: { brush: true, enter: (whole) => enterHypercode(whole).then(restoreMarks), leave: () => keepMarks() },
  "grandma-patterns": { brush: false, enter: (whole) => enterGrandma(whole), leave: () => leaveGrandma() },
  // Ripple Square: the finger paints colours (js/carpet-ripple.js), not the pile
  "ripple-square": { brush: false, enter: (whole) => enterRipple(whole), leave: () => leaveRipple() },
};

// ---------- The glimpse of the next rug ----------

// While you swipe on the whole rug, the next collection's rug lies a screen's width beside this
// one and comes along with the finger, so you see it coming; let go and it glides into place,
// where the real one takes over (no white screen in between)

const peek = document.createElement("canvas");
peek.className = "peek-rug";
peek.setAttribute("aria-hidden", "true");
carpet.after(peek); // over the white page, beside the rug

const peekImages = new Map(); // src -> loaded Image
function peekImage(src) {
  if (!peekImages.has(src)) {
    const image = new Image();
    image.src = src;
    peekImages.set(src, image);
  }
  const image = peekImages.get(src);
  return image.complete && image.naturalWidth ? image : null;
}

// What each collection's rug looks like right now, to glimpse it: { picture, w, h }
function peekPicture(id) {
  if (id === "hypercode") {
    const image = peekImage(hypercodeSrc);
    return image && { picture: image, w: image.naturalWidth, h: image.naturalHeight };
  }
  if (id === "grandma-patterns") {
    const image = peekImage(currentRug.src);
    return image && { picture: image, w: image.naturalWidth, h: image.naturalHeight };
  }
  if (id === "ripple-square") return own && { picture: rippleCanvas, w: own.w, h: own.h };
  return null;
}

let peekAt = null; // while sliding to a collection: { index, side } (side 1: it comes from the right)
let peekShown = null; // what's drawn on the peek now (so it's drawn once, not every frame)
let peekRect = null;  // where it was last shown: { x, y, w } on the stage

// Every frame the rug moves: the coming rug beside it, a screen's width away on the side it comes from
function placePeek() {
  if (peekAt && peekAt.arrived) return; // in place: held still while the real rug gets ready
  let coming = peekAt;
  if (!coming && swipeShift !== 0 && !sliding && isWhole()) {
    const side = swipeShift < 0 ? 1 : -1; // swiping left: the next one, on the right
    if (canSwitch(side)) coming = { index: collectionIndex + side, side };
  }
  const look = coming && peekPicture(MENU_COLLECTIONS[coming.index].id);
  if (!look) {
    peek.style.visibility = "hidden";
    return;
  }
  const scale = Math.min(fit.width / look.w, fit.height / look.h);
  const w = look.w * scale;
  const h = look.h * scale;
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const key = `${coming.index}|${look.picture.src || "canvas"}|${Math.round(w)}`;
  if (peekShown !== key) {
    peekShown = key;
    peek.width = Math.round(w * ratio);
    peek.height = Math.round(h * ratio);
    peek.style.width = `${w}px`;
    peek.style.height = `${h}px`;
    const ctx = peek.getContext("2d");
    ctx.clearRect(0, 0, peek.width, peek.height);
    ctx.drawImage(look.picture, 0, 0, peek.width, peek.height);
  }
  const x = fit.left + (fit.width - w) / 2 + swipeShift + coming.side * stage.clientWidth;
  const y = fit.top + (fit.height - h) / 2;
  peek.style.transform = `translate3d(${x}px, ${y}px, 0) skewX(${swipeLean}deg)`;
  peekRect = { x, y, w };
  peek.style.visibility = "visible";
}

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
    showVerb(); // js/carpet-viewer.js: now if zoomed in, else once you zoom in
  }
  markMenu(collection.id);
  history.replaceState(null, "", `#${collection.id}`);
  // no arrow where there's no collection that way
  switchArrows.forEach((arrow) => arrow.classList.toggle("is-end", !canSwitch(Number(arrow.dataset.switch))));
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
  // on the whole rug, the next one is glimpsed beside it and glides in with it, in one move
  const glimpse = whole && peekPicture(MENU_COLLECTIONS[index].id);
  if (glimpse) peekAt = { index, side: dir };

  // the name and the row fade out (css/main.css) while the rug slides away
  document.body.classList.add("is-switching");
  if (glimpse) {
    await slideRug(-dir * width, SLIDE_IN, settle);
    peekAt.arrived = true;
  }
  else await slideRug(-dir * width, SLIDE_OUT, swipeShift !== 0 ? easeOut : easeInOut);
  COLLECTION_PARTS[leaving].leave();
  if (pile) wipeDrawing(); // the drawing stays with its rug (Hypercode's is kept for when you return)
  applyCollection(index);
  await COLLECTION_PARTS[MENU_COLLECTIONS[index].id].enter(whole);

  if (glimpse) {
    // the glimpsed rug is in place: the real one takes over right there, and settles into its own
    // place (each collection's rug sits a little higher or lower, with its own row under it)
    const from = peekRect;
    peekAt = null;
    placeRug(0);
    view = { scale: from.w / img.naturalWidth, x: from.x, y: from.y };
    render();
    animateTo(centredView(fitScale), SETTLE);
    document.body.classList.remove("is-switching");
  } else {
    // the next rug comes in from the other side, its name and row fading in
    placeRug(dir * width);
    document.body.classList.remove("is-switching");
    await slideRug(0, SLIDE_IN, settle);
  }
  sliding = false;
  preloadNeighbours();
}

// Is there a collection that way? (step 1: the next one, -1: the one before)
function canSwitch(step) {
  const index = collectionIndex + step;
  return index >= 0 && index < MENU_COLLECTIONS.length;
}

// The arrows beside the whole rug: a tap goes that way, as a swipe does
const switchArrows = document.querySelectorAll("[data-switch]");
switchArrows.forEach((arrow) => arrow.addEventListener("click", () => switchCollection(Number(arrow.dataset.switch))));

// The next (step 1) or previous (step -1) collection; at the ends, the rug springs back
function switchCollection(step) {
  if (canSwitch(step)) showCollection(collectionIndex + step, step);
  else slideRug(0, SLIDE_IN);
}

// The rugs either side are loaded ahead, so they're ready to glimpse and slide in
function preloadNeighbours() {
  [1, -1].forEach((step) => {
    if (!canSwitch(step)) return;
    const id = MENU_COLLECTIONS[collectionIndex + step].id;
    if (id === "hypercode") peekImage(hypercodeSrc);
    else if (id === "grandma-patterns") peekImage(currentRug.src);
    else if (id === "ripple-square") readyRipple();
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
