/*
  The menu: tap the three lines (top left) and a paper receipt slides out of the top bar, listing
  the collections, each with its designer and what you can do with it. Tap a collection to slide
  its rug in (js/carpet-collections.js); tap the lines again, or anywhere else, and the receipt
  rolls back up.
*/

// The collections, in the order swiping goes through them.
// id: its name in the address (#grandma-patterns); rug: the photo it opens with.
const MENU_COLLECTIONS = [
  { id: "hypercode", name: "Hypercode", designer: "Roberto Sironi", verb: "To touch", rug: "images/carpet-02-cacao-cut.png" },
  { id: "grandma-patterns", name: "GrandMa Patterns", designer: "Rop van Mierlo", verb: "To blow", rug: "images/grandma-mustardgreen.jpg" },
  { id: "ripple-square", name: "Ripple Square", designer: "Patricia Urquiola", verb: "To paint", rug: "images/ripple-canvas.png" },
  { id: "stroke", name: "Stroke", designer: "Sabine Marcelis", verb: "To shape", rug: "images/stroke-1-violet.jpg" },
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

MENU_COLLECTIONS.forEach((collection, index) => {
  const item = document.createElement("li");
  const link = document.createElement("a");
  link.className = "receipt__item";
  link.href = `#${collection.id}`;
  link.dataset.id = collection.id;
  link.addEventListener("click", (e) => {
    e.preventDefault();
    closeMenu();
    if (typeof showCollection === "function") showCollection(index);
  });
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

// Mark the collection on show (js/carpet-collections.js)
function markMenu(id) {
  receipt.querySelectorAll(".receipt__item").forEach((link) => {
    if (link.dataset.id === id) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}
