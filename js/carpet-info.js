/*
  About this rug: [+] at the bottom right (only while the whole rug is in view) slides up a sheet
  from below, in the look of the grey top bar, like a page of a magazine about the rug on show.
  At the top the whole rug, cut out, on the grey; then its name, designer, size and price; then,
  folded away, its description, its product details and how it can be made to order ([+] opens
  one at a time).

  - A simple page: it slides up from the bottom, and back down again with [–], a tap outside it,
    or pulling it down from its top (pulled only a little, it slides back up). What's on it
    scrolls.
  - While it's open, the rug can't be zoomed, swiped to the next collection or drawn on.
  - The words follow each collection's page on cc-tapis.com (its details as they are, its
    description in our own words); the rest (name, size, price, colour) is the rug on show.

  Needs js/carpet-viewer.js (img, rugInfo), js/carpet-colors.js (current), js/carpet-rugs.js
  (currentRug) and js/carpet-ripple.js (COLOURWAYS, chosenWay) to be loaded first.
*/

// Each collection: its description, its details (materials, technique, quality,
// atelier: as on cc-tapis.com), how it can be made to order, and its pictures: each rug cut out of
// its photo's white and laid on the sheet's grey (tools/cut-out-rug.py --on e6e6e6), by its name
// (GrandMa Patterns) or colourway
// (Ripple Square, where the rug on show is your own: the real rug). Hypercode's photos are cut out
// already: the rug on show.
const RUG_STORIES = {
  hypercode: {
    description: [
      "Roberto Sironi collects inscriptions: the marks people have left on walls, stones and objects, across cultures and centuries.",
      "Hypercode weaves them into visual codes, an old language of signs read through contemporary textile design.",
      "Also made round, square, as a runner and as a wide rectangle.",
    ],
    details: [["Materials", "50% wool, 50% linen"], ["Technique", "Jacquard"], ["Atelier", "Made by hand in India"]],
    custom: "Size and colour",
  },
  "grandma-patterns": {
    description: [
      "Rop van Mierlo takes a familiar tartan and lets it run, the way watercolour runs on wet paper.",
      "His free, fluid brushstrokes become bold rugs made by hand: nostalgic and textured, and entirely of today.",
    ],
    details: [["Materials", "Wool"], ["Technique", "Moroccan weave"], ["Atelier", "Made by hand in India"]],
    custom: "Size",
    pictures: {
      "Mustard Green": "images/sheet/grandma-mustardgreen.jpg",
      "Green Red": "images/sheet/grandma-greenred.jpg",
      "Mustard Red": "images/sheet/grandma-mustardred.jpg",
      "Pink Blue": "images/sheet/grandma-pinkblue.jpg",
      "Purple Brown": "images/sheet/grandma-purplebrown.jpg",
    },
  },
  "ripple-square": {
    description: [
      "Patricia Urquiola starts from the ease of a digital gesture and lets it flow across the floor.",
      "Bands of leaves ripple from edge to edge, their textures and colours shifting as they go, so the rug seems to move.",
    ],
    details: [["Materials", "100% Himalayan wool"], ["Technique", "Hand-knotted"], ["Quality", "A+, about 152,000 knots a m²"], ["Atelier", "Made by hand in Nepal"]],
    custom: "Size and colour",
    pictures: {
      "Rose Garden": "images/sheet/ripple-rose-garden.jpg",
      "Earth Glow": "images/sheet/ripple-earth-glow.jpg",
      "Lavender Root": "images/sheet/ripple-lavender-root.jpg",
      "Dune Shadow": "images/sheet/ripple-dune-shadow.jpg",
    },
  },
};

const SLIDE_TIME = 600;      // ms it takes to slide up or down (as in css/main.css)
const CLOSE_PAST = 1 / 3;    // pulled down further than this share of it, it goes when let go

const infoButton = document.querySelector("[data-info]");
const infoSheet = document.querySelector("[data-info-sheet]");
const infoScroll = infoSheet.querySelector("[data-info-scroll]");
const infoBackdrop = document.querySelector("[data-info-backdrop]");

let reading = false; // the sheet is open

// ---------- What's on the sheet ----------

// Which rug is on show: its name (GrandMa Patterns) or its colour
function rugKey(collection) {
  return collection === "grandma-patterns" ? currentRug.name : rugColour(collection);
}

// The colour of the rug on show
function rugColour(collection) {
  if (collection === "hypercode") return current.name;
  if (collection === "ripple-square") return COLOURWAYS[chosenWay].name;
  return null; // GrandMa Patterns: the colour is in the rug's name
}

// The whole rug, cut out, straight on the grey
function rugPicture(collection, story) {
  const box = element("figure", "info-picture");
  const picture = document.createElement("img");
  picture.src = story.pictures ? story.pictures[rugKey(collection)] : img.src;
  picture.alt = "";
  box.append(picture);
  return box;
}

function element(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

// A part folded away: [+] and its title; tapped, it opens (and any other one closes)
function foldedPart(title, body) {
  const part = element("section", "info-part");
  const head = element("button", "info-part__title", `[+] ${title}`);
  head.setAttribute("aria-expanded", "false");
  const inner = element("div", "info-part__body");
  const wrap = element("div", "info-part__wrap");
  inner.append(...body);
  wrap.append(inner);
  head.addEventListener("click", () => {
    const opening = head.getAttribute("aria-expanded") === "false";
    infoScroll.querySelectorAll(".info-part__title").forEach((other) => {
      other.setAttribute("aria-expanded", "false");
      other.textContent = other.textContent.replace("[–]", "[+]");
    });
    if (!opening) return;
    head.setAttribute("aria-expanded", "true");
    head.textContent = `[–] ${title}`;
  });
  part.append(head, wrap);
  return part;
}

function fillSheet() {
  const collection = document.body.dataset.collection;
  const story = RUG_STORIES[collection];
  const colour = rugColour(collection);
  const head = element("div", "info-head");
  head.append(
    element("p", "info-head__name", rugInfo.querySelector("[data-rug-name]").textContent),
    element("p", "info-head__designer", rugInfo.querySelector("[data-rug-designer]").textContent),
    element("p", "info-head__size", rugInfo.querySelector("[data-rug-size]").textContent)
  );
  // the details: as on cc-tapis.com, and the rug on show's own size and colour
  const list = element("dl", "info-details");
  const size = rugInfo.querySelector("[data-rug-size]").textContent.split("|")[0].trim();
  [...story.details, ["Size", size], ...(colour ? [["Colour", colour]] : [])].forEach(([label, value]) => {
    list.append(element("dt", null, label), element("dd", null, value));
  });
  infoScroll.replaceChildren(
    rugPicture(collection, story),
    head,
    foldedPart("Description", story.description.map((text) => element("p", "info-text", text))),
    foldedPart("Product details", [list]),
    foldedPart("Customisation", [
      element("p", "info-text", `${story.custom} can be made to order.`),
      element("p", "info-text", "Tell the cc-tapis sales team what you have in mind, and they'll prepare a quote for you."),
    ])
  );
  infoScroll.scrollTop = 0;
}

// ---------- Opening and closing it ----------

// Where the sheet is: 0 open, its own height below that put away (now: no gliding there)
function placeSheet(y, now = false) {
  infoSheet.classList.toggle("is-dragging", now);
  infoSheet.style.transform = `translateY(${y}px)`;
}

function openInfo() {
  fillSheet();
  infoSheet.classList.add("is-open");
  infoSheet.setAttribute("aria-hidden", "false");
  infoButton.setAttribute("aria-expanded", "true");
  document.body.classList.add("is-reading");
  placeSheet(window.innerHeight, true);
  infoSheet.getBoundingClientRect(); // (start from below)
  placeSheet(0);
  reading = true;
}

function closeInfo() {
  if (!reading) return;
  reading = false;
  infoSheet.setAttribute("aria-hidden", "true");
  infoButton.setAttribute("aria-expanded", "false");
  document.body.classList.remove("is-reading");
  placeSheet(window.innerHeight);
  setTimeout(() => !reading && infoSheet.classList.remove("is-open"), SLIDE_TIME);
}

infoButton.addEventListener("click", openInfo);
infoSheet.querySelector("[data-info-close]").addEventListener("click", closeInfo);
infoBackdrop.addEventListener("click", closeInfo);

// Pulling it down (from its top, or from what's on it once that's scrolled to the top) takes it
// down with the finger; let go past a third, or with a flick, and it goes
let drag = null;
infoSheet.addEventListener(
  "touchstart",
  (e) => {
    drag = { y: e.touches[0].clientY, moving: null, last: e.touches[0].clientY, time: performance.now(), speed: 0 };
  },
  { passive: true }
);
infoSheet.addEventListener(
  "touchmove",
  (e) => {
    if (!drag || !reading) return;
    const y = e.touches[0].clientY;
    const dy = y - drag.y;
    if (drag.moving === null) {
      if (Math.abs(dy) < 4) return;
      const atTop = infoScroll.scrollTop <= 0 || !infoScroll.contains(e.target);
      drag.moving = atTop && dy > 0;
    }
    if (!drag.moving) return;
    e.preventDefault();
    const now = performance.now();
    drag.speed = (y - drag.last) / Math.max(1, now - drag.time);
    drag.last = y;
    drag.time = now;
    drag.down = Math.max(0, dy);
    placeSheet(drag.down, true);
  },
  { passive: false }
);
infoSheet.addEventListener("touchend", () => {
  if (!drag) return;
  const { moving, speed, down = 0 } = drag;
  drag = null;
  if (!moving) return;
  if (down > infoSheet.offsetHeight * CLOSE_PAST || speed > 0.6) closeInfo();
  else placeSheet(0);
});

window.addEventListener("resize", () => {
  if (!reading) placeSheet(window.innerHeight, true);
});
