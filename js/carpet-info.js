/*
  About this rug: [+] at the bottom right (only while the whole rug is in view) slides up a sheet
  from below, in the look of the grey top bar, like a page of a magazine about the rug on show.
  At the top the whole rug, as in a product photo; then its name, designer, size and price; then,
  folded away, its description, its product details and how it can be
  made to order ([+] opens one at a time).

  - The sheet opens over three quarters of the screen, the rug still showing above it. Swiping up
    on it takes it to the full screen; from then on it scrolls. Swiping down at its top brings it
    back, and further down closes it; so do [–] and a tap on the rug above it.
  - While it's open, the rug can't be zoomed, swiped to the next collection or drawn on.
  - The words follow each collection's page on cc-tapis.com (its details as they are, its
    description in our own words); the rest (name, size, price, colour) is the rug on show.

  Needs js/carpet-viewer.js (img, rugInfo), js/carpet-colors.js (current) and
  js/carpet-ripple.js (COLOURWAYS, chosenWay) to be loaded first.
*/

// Each collection: its description, its details (materials, technique, quality,
// atelier: as on cc-tapis.com), how it can be made to order, and its picture: the rug on show, or
// (Ripple Square, where the rug on show is your own) the real rug in each colourway
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
  },
  "ripple-square": {
    description: [
      "Patricia Urquiola starts from the ease of a digital gesture and lets it flow across the floor.",
      "Bands of leaves ripple from edge to edge, their textures and colours shifting as they go, so the rug seems to move.",
    ],
    details: [["Materials", "100% Himalayan wool"], ["Technique", "Hand-knotted"], ["Quality", "A+, about 152,000 knots a m²"], ["Atelier", "Made by hand in Nepal"]],
    custom: "Size and colour",
    pictures: {
      "Rose Garden": "images/ripple-rose-garden.jpg",
      "Earth Glow": "images/ripple-earth-glow.jpg",
      "Lavender Root": "images/ripple-lavender-root.jpg",
      "Dune Shadow": "images/ripple-dune-shadow.jpg",
    },
  },
};

const OPEN_SHOWS = 0.75;     // how much of the screen the sheet covers when it opens
const CLOSE_BELOW = 0.55;    // let go with its top lower than this share of the screen, it closes

const infoButton = document.querySelector("[data-info]");
const infoSheet = document.querySelector("[data-info-sheet]");
const infoScroll = infoSheet.querySelector("[data-info-scroll]");
const infoBackdrop = document.querySelector("[data-info-backdrop]");

let sheetAt = null; // where its top is now (px from the top of the screen), or null while closed

// ---------- What's on the sheet ----------

// The colour of the rug on show
function rugColour(collection) {
  if (collection === "hypercode") return current.name;
  if (collection === "ripple-square") return COLOURWAYS[chosenWay].name;
  return null; // GrandMa Patterns: the colour is in the rug's name
}

// The whole rug, on white like a product photo: the rug on show, or the colourway's own picture
function rugPicture(collection, story) {
  const box = element("figure", "info-picture");
  const picture = document.createElement("img");
  picture.src = story.pictures ? story.pictures[rugColour(collection)] : img.src;
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
    moveSheet(fullAt()); // more to read: the whole screen
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

// ---------- Opening, moving and closing the sheet ----------

const openAt = () => window.innerHeight * (1 - OPEN_SHOWS);
const fullAt = () => 0; // (its top then lines up with the top bar's)
const closedAt = () => window.innerHeight;

function moveSheet(y, { now = false } = {}) {
  sheetAt = y;
  infoSheet.classList.toggle("is-dragging", now);
  infoSheet.style.transform = `translateY(${y}px)`;
  infoSheet.classList.toggle("is-full", y <= fullAt() + 1);
}

function openInfo() {
  fillSheet();
  infoSheet.classList.add("is-open");
  infoSheet.setAttribute("aria-hidden", "false");
  infoButton.setAttribute("aria-expanded", "true");
  document.body.classList.add("is-reading");
  moveSheet(closedAt(), { now: true });
  infoSheet.getBoundingClientRect(); // (start from below)
  moveSheet(openAt());
}

function closeInfo() {
  if (sheetAt === null) return;
  moveSheet(closedAt());
  sheetAt = null;
  infoSheet.setAttribute("aria-hidden", "true");
  infoButton.setAttribute("aria-expanded", "false");
  document.body.classList.remove("is-reading");
  setTimeout(() => sheetAt === null && infoSheet.classList.remove("is-open"), 450);
}

infoButton.addEventListener("click", openInfo);
infoSheet.querySelector("[data-info-close]").addEventListener("click", closeInfo);
infoBackdrop.addEventListener("click", closeInfo);

// The handle: tap to go between three quarters and the full screen
infoSheet.querySelector(".info-sheet__top").addEventListener("click", (e) => {
  if (e.target.closest("[data-info-close]")) return;
  moveSheet(sheetAt <= fullAt() + 1 ? openAt() : fullAt());
});

// Swiping on the sheet: up, it first goes to the full screen and then scrolls; down at the top of
// what's on it, it comes down, and closes if let go low enough
let drag = null;
infoSheet.addEventListener(
  "touchstart",
  (e) => {
    drag = { y: e.touches[0].clientY, from: sheetAt, moving: null, last: e.touches[0].clientY, time: performance.now(), speed: 0 };
  },
  { passive: true }
);
infoSheet.addEventListener(
  "touchmove",
  (e) => {
    if (!drag || sheetAt === null) return;
    const y = e.touches[0].clientY;
    const dy = y - drag.y;
    if (drag.moving === null) {
      if (Math.abs(dy) < 4) return;
      const full = drag.from <= fullAt() + 1;
      const atTop = infoScroll.scrollTop <= 0 || !infoScroll.contains(e.target);
      drag.moving = (!full && dy < 0) || (atTop && dy > 0);
    }
    if (!drag.moving) return;
    e.preventDefault();
    const now = performance.now();
    drag.speed = (y - drag.last) / Math.max(1, now - drag.time);
    drag.last = y;
    drag.time = now;
    moveSheet(Math.max(fullAt(), drag.from + dy), { now: true });
  },
  { passive: false }
);
infoSheet.addEventListener("touchend", () => {
  if (!drag) return;
  const { moving, speed } = drag;
  drag = null;
  if (!moving) return;
  // where it settles: a flick carries on the way it was going
  const y = sheetAt + speed * 180;
  if (y > window.innerHeight * CLOSE_BELOW) closeInfo();
  else if (y > (openAt() + fullAt()) / 2) moveSheet(openAt());
  else moveSheet(fullAt());
});

// A mouse wheel (on a computer): down first takes it to the full screen, then scrolls
infoSheet.addEventListener(
  "wheel",
  (e) => {
    if (sheetAt !== null && sheetAt > fullAt() + 1 && e.deltaY > 0) {
      e.preventDefault();
      moveSheet(fullAt());
    }
  },
  { passive: false }
);

window.addEventListener("resize", () => {
  if (sheetAt !== null) moveSheet(sheetAt <= fullAt() + 1 ? fullAt() : openAt(), { now: true });
});
