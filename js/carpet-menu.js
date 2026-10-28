/*
  The menu: tap the three lines (top left) and a paper receipt prints out of the top bar, listing
  the collections, each with its designer and what you can do with it. Tap a collection to open
  it; tap the lines again, or anywhere else, and the receipt rolls back up.

  On its own: works on any page with the top bar (index.html, blow.html).
*/

// page: the page that shows the collection. The one this page shows is marked on the receipt.
const MENU_COLLECTIONS = [
  { name: "Hypercode", designer: "Roberto Sironi", verb: "To draw", page: "index.html" },
  { name: "GrandMa Patterns", designer: "Rop van Mierlo", verb: "To blow", page: "blow.html" },
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
