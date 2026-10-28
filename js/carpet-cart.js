/*
  Buying, and the end of the journey. Tap Buy on any rug, at any zoom: the rug is rolled up from
  its bottom edge, as a rug is for delivery (the roll is the rug itself, its own wool round it,
  its ends showing its colour wound round), and the roll flies up into the bag at the top right
  (Shop gives way to the bag at the first rug; the number in it counts the rugs). Then the rug
  unrolls back into place, to play on or buy another.

  - What goes in the bag: the rug on show (Hypercode in its shape and colour, the GrandMa rug on
    show) or, on Ripple Square, your own design: a picture of what you drew.
  - The bag (tap it): each rug, cut out, with its name, size and price, [–] to take it out, the
    total, and Proceed to check out.
  - Checking out: a thank-you, the end of the prototype (nothing is paid); back to the rugs, the
    bag is empty again and Shop is back.

  The bag and the thank-you in cc-tapis.com's look for these moments: pink, the mono font in
  capitals, °~*~° rules.

  Needs js/carpet-viewer.js (img, carpet, rugInfo, isWhole, animateTo, centredView, fitScale),
  js/carpet-colors.js (current) and js/carpet-ripple.js (rippleCanvas) to be loaded first.
*/

const ROLL_UP = 1100;        // ms the rug takes to roll up (and to unroll again)
const ROLL_FLY = 750;        // ms the roll takes to fly into the bag
const ROLL_THICKEST = 52;    // px: the roll's thickness once the whole rug is on it
const ROLL_BACK_AFTER = 350; // ms in the bag before the rug unrolls back into place
const CART_RULE = "°~*~"; // the rule along the top and bottom of the pink notes, as on cc-tapis.com

const buyButton = document.querySelector("[data-buy]");
const shopLink = document.querySelector("[data-shop]");
const bag = document.querySelector("[data-bag]");
const bagCount = bag.querySelector("[data-bag-count]");
const cartSheet = document.querySelector("[data-cart-sheet]");
const cartList = cartSheet.querySelector("[data-cart-list]");
const cartBackdrop = document.querySelector("[data-cart-backdrop]");
const cartThanks = document.querySelector("[data-cart-thanks]");

const cart = []; // { name, designer, size, price, picture }
let buying = false;
let rolledAway = null; // the rolled-up rug, until it unrolls back: { overlay, roll, box }

// ---------- Helpers ----------

const wait = (ms) => new Promise((done) => setTimeout(done, ms));
const ease = (t) => (1 - Math.cos(Math.PI * t)) / 2;

function euros(amount) {
  return `€ ${String(amount).replace(/\B(?=(\d{3})+$)/g, ".")}`; // Italian style: € 12.996
}

function tag(name, className, text) {
  const e = document.createElement(name);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

// The rules along the pink notes: °~*~ over and over, as long as the line is
document.querySelectorAll(".cart-rule__line").forEach((line) => (line.textContent = CART_RULE.repeat(40)));

// ---------- What's bought ----------

// The rug on show, as it goes in the bag
function rugNow() {
  const collection = document.body.dataset.collection;
  const sizeLine = rugInfo.querySelector("[data-rug-size]").textContent;
  const price = Number((sizeLine.split("€")[1] || "0").replace(/\D/g, ""));
  let name = rugInfo.querySelector("[data-rug-name]").textContent;
  let picture = img.src; // Hypercode's photos are cut out already
  let cutOut = picture;
  if (collection === "hypercode") name += ` ${current.name}`;
  if (collection === "grandma-patterns") cutOut = currentRug.thumb; // its photo is on white: the small cut-out
  if (collection === "ripple-square") {
    name += " (your design)";
    // your own design: what you drew, on white, smaller
    const snap = document.createElement("canvas");
    snap.width = snap.height = 600;
    const ctx = snap.getContext("2d");
    ctx.drawImage(rippleCanvas, 0, 0, 600, 600);
    picture = cutOut = snap.toDataURL("image/png");
  }
  return {
    name,
    designer: rugInfo.querySelector("[data-rug-designer]").textContent,
    size: sizeLine.split("|")[0].trim(),
    price,
    picture, // as on the page
    cutOut, // for the bag and the thank-you (no white round it)
    ground: collection === "ripple-square" ? `rgb(${COLOURWAYS[chosenWay].ground})` : null,
  };
}

function showBag() {
  const count = cart.length;
  bagCount.textContent = count;
  bag.hidden = count === 0;
  shopLink.hidden = count > 0;
}

// ---------- Rolling the rug up, and into the bag ----------

// What the roll is wrapped in: the rug itself, without the white (or see-through) round it in its
// photo, and its colour (for the ends, where you see it wound round)
function rollSkin(src, ground) {
  return new Promise((done) => {
    const photo = new Image();
    photo.onload = () => {
      const size = 240;
      const c = document.createElement("canvas");
      c.width = size;
      c.height = Math.round((size * photo.naturalHeight) / photo.naturalWidth);
      const ctx = c.getContext("2d");
      ctx.drawImage(photo, 0, 0, c.width, c.height);
      const px = ctx.getImageData(0, 0, c.width, c.height).data;
      // where the rug is: not see-through, not the photo's white
      let left = c.width, right = 0, top = c.height, bottom = 0;
      const sum = [0, 0, 0];
      let count = 0;
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          const i = (y * c.width + x) * 4;
          if (px[i + 3] < 200 || Math.min(px[i], px[i + 1], px[i + 2]) > 238) continue;
          left = Math.min(left, x); right = Math.max(right, x);
          top = Math.min(top, y); bottom = Math.max(bottom, y);
          sum[0] += px[i]; sum[1] += px[i + 1]; sum[2] += px[i + 2];
          count++;
        }
      }
      if (!count) return done(null);
      // a little inside its edge, so none of the white comes along
      const inX = (right - left) * 0.06;
      const inY = (bottom - top) * 0.06;
      const skin = document.createElement("canvas");
      skin.width = Math.round(right - left - inX * 2);
      skin.height = Math.round(bottom - top - inY * 2);
      const s = skin.getContext("2d");
      if (ground) {
        s.fillStyle = ground; // your own design: drawn on its ground
        s.fillRect(0, 0, skin.width, skin.height);
      }
      s.drawImage(c, left + inX, top + inY, skin.width, skin.height, 0, 0, skin.width, skin.height);
      const colour = sum.map((v) => Math.round(v / count));
      done({ src: skin.toDataURL("image/jpeg", 0.85), colour });
    };
    photo.onerror = () => done(null);
    photo.src = src;
  });
}

// One step of the rolling: rolled 0 (flat) .. 1 (all rolled up), from its bottom edge
function rollTo(state, rolled) {
  const { overlay, roll, box } = state;
  const gone = rolled * box.height;
  overlay.style.clipPath = `inset(0 0 ${gone}px 0)`;
  const thick = 10 + (ROLL_THICKEST - 10) * Math.sqrt(rolled);
  Object.assign(roll.style, {
    top: `${box.top + box.height - gone - thick / 2}px`,
    height: `${thick}px`,
    opacity: rolled > 0.004 ? 1 : 0,
    backgroundPositionY: `${-(box.height - gone)}px`, // the part just rolled on, turning
  });
}

function animate(ms, step) {
  return new Promise((done) => {
    const start = performance.now();
    const frame = (now) => {
      const t = Math.min(1, (now - start) / ms);
      step(ease(t));
      if (t < 1) requestAnimationFrame(frame);
      else done();
    };
    requestAnimationFrame(frame);
  });
}

async function buy() {
  if (buying || rolledAway) return;
  buying = true;
  document.body.classList.add("is-buying");
  // the whole rug in view first
  if (!isWhole()) {
    animateTo(centredView(fitScale));
    await wait(ZOOM_DURATION + 60);
  }
  const item = rugNow();
  const skin = await rollSkin(item.picture, item.ground);
  const box = img.getBoundingClientRect();
  // the rug, as a picture over the page, and its roll, wrapped in the rug itself
  const overlay = tag("div", "roll-rug");
  const roll = tag("div", "roll-rug__roll");
  Object.assign(overlay.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`, backgroundImage: `url("${item.picture}")` });
  const inset = box.width * 0.04;
  Object.assign(roll.style, {
    left: `${box.left + inset}px`,
    width: `${box.width - inset * 2}px`,
    backgroundImage: skin ? `url("${skin.src}")` : "none",
    backgroundSize: `100% ${box.height}px`,
  });
  if (skin) {
    const [r, g, b] = skin.colour;
    roll.style.setProperty("--roll-colour", `rgb(${r}, ${g}, ${b})`);
    roll.style.setProperty("--roll-deep", `rgb(${Math.round(r * 0.62)}, ${Math.round(g * 0.62)}, ${Math.round(b * 0.62)})`);
  }
  roll.append(tag("span", "roll-rug__shade"));
  document.body.append(overlay, roll);
  const state = { overlay, roll, box };
  rollTo(state, 0);
  carpet.style.visibility = "hidden";

  await animate(ROLL_UP, (t) => rollTo(state, t));

  // into the bag: the bag shows (Shop gives way to it), the roll flies to it in an arc
  cart.push(item);
  bag.hidden = false;
  shopLink.hidden = true;
  const target = bag.getBoundingClientRect();
  const from = roll.getBoundingClientRect();
  const dx = target.left + target.width / 2 - (from.left + from.width / 2);
  const dy = target.top + target.height / 2 - (from.top + from.height / 2);
  const small = Math.min(0.12, 28 / from.width);
  const flight = roll.animate(
    [
      { transform: "translate(0, 0) scale(1)", opacity: 1 },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.35 - 70}px) scale(${(1 + small) / 2.4})`, opacity: 1, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(${small})`, opacity: 0.2 },
    ],
    { duration: ROLL_FLY, easing: "cubic-bezier(0.45, 0, 0.25, 1)", fill: "forwards" }
  );
  await flight.finished;
  roll.style.visibility = "hidden";
  showBag();
  bag.classList.remove("is-landing");
  void bag.offsetWidth;
  bag.classList.add("is-landing");

  rolledAway = state;
  await wait(ROLL_BACK_AFTER);
  await unroll();
  buying = false;
}

// The rug unrolls back into place, to play on or buy another
async function unroll() {
  const state = rolledAway;
  if (!state) return;
  rolledAway = null;
  state.roll.getAnimations().forEach((a) => a.cancel());
  state.roll.style.visibility = "";
  rollTo(state, 1);
  await animate(ROLL_UP, (t) => rollTo(state, 1 - t));
  carpet.style.visibility = "";
  state.overlay.remove();
  state.roll.remove();
  document.body.classList.remove("is-buying");
}

// ---------- The bag ----------

function fillCart() {
  if (!cart.length) {
    cartList.replaceChildren(tag("p", "cart-empty", "Your bag is empty"));
    return;
  }
  const rows = cart.map((item, i) => {
    const row = tag("div", "cart-item");
    const tile = tag("div", "cart-item__picture");
    const picture = tag("img");
    picture.src = item.cutOut;
    picture.alt = "";
    tile.append(picture);
    const words = tag("div", "cart-item__words");
    words.append(tag("p", "cart-item__name", item.name), tag("p", null, item.designer), tag("p", null, item.size), tag("p", null, euros(item.price)));
    const remove = tag("button", "cart-item__remove mono", "[–]");
    remove.setAttribute("aria-label", `Take ${item.name} out`);
    remove.addEventListener("click", () => {
      cart.splice(i, 1);
      showBag();
      fillCart();
      if (!cart.length) closeCart();
    });
    row.append(tile, words, remove);
    return row;
  });
  const total = tag("div", "cart-total");
  total.append(tag("span", null, "Total"), tag("span", null, euros(cart.reduce((sum, item) => sum + item.price, 0))));
  const buttons = tag("div", "cart-buttons");
  const goOn = tag("button", "cart-button mono", "Keep looking");
  goOn.addEventListener("click", closeCart);
  const pay = tag("button", "cart-button cart-button--dark mono", "Proceed to check out");
  pay.addEventListener("click", () => {
    closeCart();
    checkOut();
  });
  buttons.append(goOn, pay);
  cartList.replaceChildren(...rows, total, buttons);
}

function openCart() {
  fillCart();
  cartSheet.classList.add("is-open");
  cartSheet.setAttribute("aria-hidden", "false");
  document.body.classList.add("is-in-cart");
}

function closeCart() {
  cartSheet.classList.remove("is-open");
  cartSheet.setAttribute("aria-hidden", "true");
  document.body.classList.remove("is-in-cart");
}

bag.addEventListener("click", openCart);
cartSheet.querySelector("[data-cart-close]").addEventListener("click", closeCart);
cartBackdrop.addEventListener("click", closeCart);

// ---------- Checking out: the end ----------

function checkOut() {
  const rule = tag("p", "cart-thanks__rule", ".:^:.".repeat(14));
  const pictures = tag("div", "cart-thanks__rugs");
  cart.forEach((item) => {
    const picture = tag("img");
    picture.src = item.cutOut;
    picture.alt = item.name;
    pictures.append(picture);
  });
  const back = tag("button", "cart-button mono", "Back to the rugs");
  back.addEventListener("click", () => {
    cart.length = 0;
    showBag();
    cartThanks.classList.remove("is-open");
    cartThanks.setAttribute("aria-hidden", "true");
  });
  cartThanks.replaceChildren(
    rule,
    tag("p", "cart-thanks__big", "Thank you"),
    tag("p", "cart-thanks__text", cart.length > 1 ? "Your rugs are being made by hand" : "Your rug is being made by hand"),
    pictures,
    tag("p", "cart-thanks__text", `${cart.length} ${cart.length > 1 ? "rugs" : "rug"} · ${euros(cart.reduce((sum, item) => sum + item.price, 0))}`),
    back,
    rule.cloneNode(true)
  );
  cartThanks.classList.add("is-open");
  cartThanks.setAttribute("aria-hidden", "false");
}

buyButton.addEventListener("click", buy);
