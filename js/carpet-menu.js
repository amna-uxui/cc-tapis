/*
  The menu: tap the three lines (top left) and a paper receipt slides out of the top bar, listing
  the collections, each with its designer and what you can do with it. Tap a collection to open
  it; tap the lines again, or anywhere else, and the receipt rolls back up.

  Also the way between collections without the menu: swiping the whole rug (js/carpet-viewer.js)
  calls goToCollection(1) or (-1), round and round. The next page slides in (css/main.css, page
  slide; the side it comes from is picked up at the top of each page) and opens on its whole rug,
  its rug photo already loaded.

  On its own: works on any page with the top bar (index.html, blow.html).
*/

// page: the page that shows the collection. The one this page shows is marked on the receipt.
// rug: the photo that page opens with (loaded ahead, so swiping to it shows the rug at once).
// Swiping goes through them in this order, and from the last back to the first.
const MENU_COLLECTIONS = [
  { name: "Hypercode", designer: "Roberto Sironi", verb: "To draw", page: "index.html", rug: "images/carpet-02-cacao-cut.png" },
  { name: "GrandMa Patterns", designer: "Rop van Mierlo", verb: "To blow", page: "blow.html", rug: "images/grandma-mustardgreen-cut.png" },
];
const RECEIPT_RULE = "..:^:..:^:..:^:..:^:..:^:..:^:..:^:..:^:..:^:..:^:"; // as on cc-tapis.com

const menuButton = document.querySelector(".bar__side--left");
const receipt = document.createElement("div");
receipt.className = "receipt";
receipt.setAttribute("aria-hidden", "true");
receipt.innerHTML = `
  <div class="receipt__paper mono">
    <p class="receipt__rule" aria-hidden="true">${RECEIPT_RULE}</p>
    <p class="receipt__title">Collections</p>
    <p class="receipt__rule" aria-hidden="true">${RECEIPT_RULE}</p>
    <ul class="receipt__list"></ul>
    <p class="receipt__rule" aria-hidden="true">${RECEIPT_RULE}</p>
    <p class="receipt__foot">${MENU_COLLECTIONS.length} collections · cc-tapis Milano</p>
  </div>`;
document.body.append(receipt);

const here = location.pathname.split("/").pop() || "index.html";
MENU_COLLECTIONS.forEach((collection) => {
  const item = document.createElement("li");
  const link = document.createElement("a");
  link.className = "receipt__item";
  link.href = collection.page;
  if (collection.page === here) link.setAttribute("aria-current", "page");
  link.innerHTML = `
    <span class="receipt__name">${collection.name}</span>
    <span class="receipt__verb">${collection.verb}</span>
    <span class="receipt__designer">${collection.designer}</span>`;
  item.append(link);
  receipt.querySelector(".receipt__list").append(item);
});

function openMenu() {
  receipt.classList.remove("is-closing");
  receipt.classList.add("is-open");
  receipt.setAttribute("aria-hidden", "false");
  menuButton.setAttribute("aria-expanded", "true");
}

function closeMenu() {
  if (!receipt.classList.contains("is-open")) return;
  receipt.classList.remove("is-open");
  receipt.classList.add("is-closing"); // rolls back up, then hides
  receipt.setAttribute("aria-hidden", "true");
  menuButton.setAttribute("aria-expanded", "false");
}

receipt.addEventListener("animationend", () => receipt.classList.remove("is-closing"));

menuButton.setAttribute("aria-expanded", "false");
menuButton.addEventListener("click", () => {
  if (receipt.classList.contains("is-open")) closeMenu();
  else openMenu();
});

// A touch anywhere else rolls the receipt up (and does nothing more: it doesn't draw on the rug)
document.addEventListener(
  "pointerdown",
  (e) => {
    if (!receipt.classList.contains("is-open")) return;
    if (receipt.contains(e.target) || menuButton.contains(e.target)) return;
    e.stopPropagation();
    e.preventDefault();
    closeMenu();
  },
  true
);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeMenu();
});

// ---------- Swiping between collections ----------

const hereIndex = Math.max(0, MENU_COLLECTIONS.findIndex((c) => c.page === here));

// The next (step 1) or previous (step -1) collection, round and round: it slides in from that
// side and opens on its whole rug
function goToCollection(step) {
  const next = MENU_COLLECTIONS[(hereIndex + step + MENU_COLLECTIONS.length) % MENU_COLLECTIONS.length];
  try {
    sessionStorage.setItem("cc-slide", step > 0 ? "next" : "prev");
    sessionStorage.setItem("cc-open-whole", "1");
  } catch (e) {}
  document.documentElement.dataset.slide = step > 0 ? "next" : "prev"; // this page slides out that way
  location.href = next.page;
}

// Load the neighbours' rug photos ahead, so the slide shows them straight away
window.addEventListener("load", () => {
  [1, -1].forEach((step) => {
    const c = MENU_COLLECTIONS[(hereIndex + step + MENU_COLLECTIONS.length) % MENU_COLLECTIONS.length];
    if (c.page !== here) new Image().src = c.rug;
  });
});
