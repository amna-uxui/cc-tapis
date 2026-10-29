/*
  Buying, and the end of the journey. Tap Buy on any rug, at any zoom: the rug is rolled up from
  its bottom edge, slowly, as a rug is for delivery (for real, in 3D: the rug wraps round a roll
  that grows with every turn, lit by its own curve, its back showing where it turns over), and
  the roll flies up into the bag at the top right
  (Shop gives way to the bag at the first rug; the number in it counts the rugs). Where the rug
  lay, "Thank you" shows on the floor, uncovered as it rolls up, and the bag opens by itself.
  Closing the bag (or checking out), the rug unrolls back into place over it, to play on or buy
  another.

  - What goes in the bag: the rug on show (Hypercode in its shape and colour, the GrandMa rug on
    show) or, on Ripple Square, your own design: a picture of what you drew.
  - The bag (tap it): each rug, cut out, with its name, size and price, [–] to take it out, the
    total, and Proceed to check out.
  - Checking out: the rug's journey begins, knotted by hand in the Himalayas; the end of the
    prototype (nothing is paid); back to the rugs, the bag is empty again and Shop is back.

  The bag and the thank-you in cc-tapis.com's look for these moments: pink, the mono font in
  capitals, °~*~° rules.

  Needs js/carpet-viewer.js (img, carpet, rugInfo, isWhole, animateTo, centredView, fitScale),
  js/carpet-colors.js (current) and js/carpet-ripple.js (rippleCanvas) to be loaded first.
*/

const ROLL_UP = 2000;        // ms the rug takes to roll up (and to unroll again): slowly, as a heavy rug
const ROLL_FLY = 750;        // ms the roll takes to fly into the bag
const ROLL_CORE = 7;         // px: the roll's radius as it starts
const ROLL_THICKNESS = 3.6;  // px: the rug's thickness (the roll grows by this every turn): a thick, heavy rug
const BACK_MUTE = 0.4;       // the back of the rug (where it's turned over): its colours this much nearer grey ..
const BACK_DARK = 0.82;      // .. and this much darker
const ROLL_GRAIN = "images/ripple-pile.jpg"; // real wool pile (tools/ripple-pile.py), all over the rolling rug
const BAG_OPENS_AFTER = 600; // ms in the bag before it opens by itself
const CART_RULE = "°~*~"; // the rule along the top and bottom of the pink notes, as on cc-tapis.com

const buyButton = document.querySelector("[data-buy]");
const shopLink = document.querySelector("[data-shop]");
const bag = document.querySelector("[data-bag]");
const bagCount = bag.querySelector("[data-bag-count]");
const cartSheet = document.querySelector("[data-cart-sheet]");
const cartList = cartSheet.querySelector("[data-cart-list]");
const cartBackdrop = document.querySelector("[data-cart-backdrop]");
const cartThanks = document.querySelector("[data-cart-thanks]");
const rollThanks = document.querySelector("[data-roll-thanks]"); // "Thank you", under the rug as it rolls up

const cart = []; // { name, designer, size, price, picture }
let buying = false;
let rolledAway = null; // the rolled-up rug, until it unrolls back: { box }

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
  const price = Number(rugInfo.dataset.price || 0); // set by showSizeAndPrice (js/carpet-viewer.js)
  let name = rugInfo.querySelector("[data-rug-name]").textContent;
  let picture = img.src; // Hypercode's photos are cut out already
  let cutOut = picture;
  if (collection === "hypercode") {
    name += ` ${current.name}`;
    picture = cutOut = withMarks();
  }
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
    size: rugInfo.querySelector("[data-rug-size]").textContent.trim(),
    price,
    picture, // as on the page
    cutOut, // for the bag and the thank-you (no white round it)
    ground: collection === "ripple-square" ? `rgb(${COLOURWAYS[chosenWay].ground})` : null,
  };
}

// Hypercode: the rug with what your finger drew in its pile (the brush marks over the photo,
// only on the rug itself), so that's what rolls up and goes in the bag
function withMarks() {
  const width = Math.min(1200, img.naturalWidth);
  const height = Math.round((width * img.naturalHeight) / img.naturalWidth);
  const snap = document.createElement("canvas");
  snap.width = width;
  snap.height = height;
  const ctx = snap.getContext("2d");
  ctx.drawImage(img, 0, 0, width, height);
  ctx.globalCompositeOperation = "source-atop";
  ctx.drawImage(brush, 0, 0, width, height);
  return snap.toDataURL("image/png");
}

function showBag() {
  const count = cart.length;
  bagCount.textContent = count;
  bag.hidden = count === 0;
  shopLink.hidden = count > 0;
}

// ---------- Rolling the rug up, and into the bag ----------

// The rug is rolled for real, in 3D (WebGL): it's a fine mesh of the rug's own picture, and from
// its bottom edge up every part of it that's been gathered wraps round a roll (a spiral, a little
// fatter with every turn, as the rug's thickness winds on). Each bit is lit by which way it faces,
// so the roll is shaded by its own curve; where the rug has turned over you see its back (muted,
// a little darker); real wool pile all over. Solid, never see-through.
const ROLL_VERTEX = `
attribute vec2 aUV;          // across 0..1, down 0..1
uniform vec4 uBox;           // the rug on the screen: left, top, width, height (px)
uniform vec2 uView;          // the screen (px)
uniform float uGone;         // how much of it, from its bottom edge, is on the roll (px)
uniform float uCore;         // the roll's radius with nothing on it (px)
uniform float uThick;        // the rug's thickness (px): the roll grows by this each turn
uniform vec4 uCrop;          // where the rug is in its picture: left, top, width, height (0..1)
varying vec2 vUV;
varying vec3 vNormal;
void main() {
  vUV = uCrop.xy + aUV * uCrop.zw;
  float x = uBox.x + aUV.x * uBox.z;
  float y = uBox.y + aUV.y * uBox.w;
  float fromBottom = (1.0 - aUV.y) * uBox.w;
  vec3 p = vec3(x, y, 0.0);
  vec3 n = vec3(0.0, 0.0, 1.0);
  if (fromBottom < uGone) {
    // gathered: wound round the roll, which rests on the floor where the flat rug meets it
    float radius = sqrt(uCore * uCore + uThick * uGone / 3.14159);
    float contact = uBox.y + uBox.w - uGone;
    float turn = (uGone - fromBottom) / radius;
    p = vec3(x, contact + radius * sin(turn), radius - radius * cos(turn));
    n = vec3(0.0, -sin(turn), cos(turn));
  }
  // a touch of perspective: what's nearer (the roll) spreads a little wider
  float middle = uBox.x + uBox.z * 0.5;
  p.x = middle + (p.x - middle) * (1.0 + p.z / 900.0);
  vNormal = n;
  gl_Position = vec4(p.x / uView.x * 2.0 - 1.0, 1.0 - p.y / uView.y * 2.0, -p.z / 2000.0, 1.0);
}`;

const ROLL_FRAGMENT = `
precision mediump float;
uniform sampler2D uRug;
uniform sampler2D uGrain;
uniform float uOnWhite;      // the photo is on white (GrandMa Patterns): its white is not rug
varying vec2 vUV;
varying vec3 vNormal;
void main() {
  vec4 c = texture2D(uRug, vUV);
  if (c.a < 0.5) discard;
  if (uOnWhite > 0.5 && min(c.r, min(c.g, c.b)) > 0.95) discard;
  vec3 colour = c.rgb / c.a;
  vec3 n = normalize(vNormal);
  if (n.z < 0.0) {
    // turned over: we see its back, flatter and darker
    n = -n;
    float grey = dot(colour, vec3(0.3, 0.59, 0.11));
    colour = mix(colour, vec3(grey), ${BACK_MUTE.toFixed(2)}) * ${BACK_DARK.toFixed(2)};
    // the back is woven: a fine grid of warp and weft
    float weave = 0.5 + 0.5 * sin(vUV.x * 900.0) * sin(vUV.y * 1300.0);
    colour *= 0.9 + 0.1 * weave;
  }
  // wool pile
  colour *= 0.86 + 0.28 * texture2D(uGrain, gl_FragCoord.xy / 180.0).r;
  // lit from the top of the screen, a little in front: flat rug as it was, the roll shaded by its curve
  float light = max(dot(n, normalize(vec3(-0.15, -0.55, 0.82))), 0.0);
  colour *= (0.38 + 0.62 * light) / (0.38 + 0.62 * 0.82);
  gl_FragColor = vec4(colour, 1.0);
}`;

let rollGl = null; // { gl, canvas, program, uniforms, rug, grain, count }

function setUpRollGl() {
  const stage = tag("div", "roll-rug");
  const shadow = tag("div", "roll-rug__shadow");
  const canvas = tag("canvas", "roll-rug__canvas");
  const ends = [tag("div", "roll-rug__end"), tag("div", "roll-rug__end")];
  stage.append(shadow, canvas, ...ends);
  document.body.append(stage);
  const gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: true });
  if (!gl) return null;
  const shader = (type, source) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, source);
    gl.compileShader(sh);
    return sh;
  };
  const program = gl.createProgram();
  gl.attachShader(program, shader(gl.VERTEX_SHADER, ROLL_VERTEX));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, ROLL_FRAGMENT));
  gl.linkProgram(program);
  gl.useProgram(program);
  // the mesh: two points across, many down (the roll's curve is smooth)
  const rows = 480;
  const points = [];
  for (let r = 0; r <= rows; r++) points.push(0, r / rows, 1, r / rows);
  const index = [];
  for (let r = 0; r < rows; r++) index.push(r * 2, r * 2 + 1, r * 2 + 2, r * 2 + 1, r * 2 + 3, r * 2 + 2);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points), gl.STATIC_DRAW);
  const aUV = gl.getAttribLocation(program, "aUV");
  gl.enableVertexAttribArray(aUV);
  gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(index), gl.STATIC_DRAW);
  const texture = (unit) => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  const u = (name) => gl.getUniformLocation(program, name);
  const state = {
    gl,
    stage,
    canvas,
    shadow,
    ends,
    count: index.length,
    rug: texture(0),
    grain: texture(1),
    uniforms: { box: u("uBox"), view: u("uView"), gone: u("uGone"), core: u("uCore"), thick: u("uThick"), onWhite: u("uOnWhite"), crop: u("uCrop") },
  };
  gl.uniform1i(u("uRug"), 0);
  gl.uniform1i(u("uGrain"), 1);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LESS);
  // the wool's grain (it's grey round the middle: no need to wait for it)
  const grain = new Image();
  grain.onload = () => {
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, state.grain);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, gl.LUMINANCE, gl.UNSIGNED_BYTE, grain);
  };
  grain.src = ROLL_GRAIN;
  gl.activeTexture(gl.TEXTURE1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 1, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, new Uint8Array([128]));
  return state;
}

function loadImage(src) {
  return new Promise((done) => {
    const picture = new Image();
    picture.onload = () => done(picture);
    picture.onerror = () => done(null);
    picture.src = src;
  });
}

// Where the rug itself is in its picture (not the white or see-through margin round it), 0..1
function rugArea(picture, onWhite) {
  const c = document.createElement("canvas");
  c.width = 160;
  c.height = Math.max(1, Math.round((160 * picture.naturalHeight) / picture.naturalWidth));
  const ctx = c.getContext("2d");
  ctx.drawImage(picture, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let left = c.width, right = -1, top = c.height, bottom = -1;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      if (d[i + 3] < 128 || (onWhite && Math.min(d[i], d[i + 1], d[i + 2]) > 242)) continue;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  if (right < 0) return { u: 0, v: 0, width: 1, height: 1 };
  return { u: left / c.width, v: top / c.height, width: (right + 1 - left) / c.width, height: (bottom + 1 - top) / c.height };
}

// Ready to roll this rug: its picture on the mesh (just the rug, not the margin round it in its
// picture), the canvas over the whole screen
async function readyRoll(item, page) {
  if (!rollGl) rollGl = setUpRollGl();
  if (!rollGl) return null;
  const picture = await loadImage(item.picture);
  if (!picture) return null;
  const onWhite = document.body.dataset.collection === "grandma-patterns";
  const area = rugArea(picture, onWhite);
  const box = {
    left: page.left + area.u * page.width,
    top: page.top + area.v * page.height,
    width: area.width * page.width,
    height: area.height * page.height,
  };
  const { gl, stage, canvas, uniforms } = rollGl;
  const scale = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(window.innerWidth * scale);
  canvas.height = Math.round(window.innerHeight * scale);
  stage.style.transform = "";
  stage.style.visibility = "visible";
  // the roll's ends: the rug's own colour wound round
  const [r, g, b] = averageColour(picture, onWhite);
  stage.style.setProperty("--roll-colour", `rgb(${r}, ${g}, ${b})`);
  stage.style.setProperty("--roll-deep", `rgb(${Math.round(r * 0.6)}, ${Math.round(g * 0.6)}, ${Math.round(b * 0.6)})`);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, rollGl.rug);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, picture);
  gl.uniform4f(uniforms.box, box.left, box.top, box.width, box.height);
  gl.uniform2f(uniforms.view, window.innerWidth, window.innerHeight);
  gl.uniform1f(uniforms.core, ROLL_CORE);
  gl.uniform1f(uniforms.thick, ROLL_THICKNESS);
  gl.uniform1f(uniforms.onWhite, onWhite ? 1 : 0);
  gl.uniform4f(uniforms.crop, area.u, area.v, area.width, area.height);
  return { box };
}

// The average colour of the rug's picture (not its see-through or white surroundings)
function averageColour(picture, onWhite) {
  const c = document.createElement("canvas");
  c.width = c.height = 48;
  const ctx = c.getContext("2d");
  ctx.drawImage(picture, 0, 0, 48, 48);
  const d = ctx.getImageData(0, 0, 48, 48).data;
  const sum = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 200 || (onWhite && Math.min(d[i], d[i + 1], d[i + 2]) > 240)) continue;
    sum[0] += d[i]; sum[1] += d[i + 1]; sum[2] += d[i + 2];
    n++;
  }
  return n ? sum.map((v) => Math.round(v / n)) : [180, 170, 160];
}

// Where the roll is with this much gathered (its middle on the screen, its radius)
function rollSize(state, rolled = 1) {
  const gone = rolled * state.box.height;
  const radius = Math.sqrt(ROLL_CORE * ROLL_CORE + (ROLL_THICKNESS * gone) / Math.PI);
  return { x: state.box.left + state.box.width / 2, y: state.box.top + state.box.height - gone, width: state.box.width, radius };
}

// One step of the rolling: rolled 0 (flat) .. 1 (all on the roll), from its bottom edge; the
// roll's ends (a spiral of the rug's layers round a hollow middle) and its shadow on the floor
// go along with it
function rollTo(state, rolled) {
  const { gl, uniforms, count, ends, shadow } = rollGl;
  gl.uniform1f(uniforms.gone, rolled * state.box.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0);
  const roll = rollSize(state, rolled);
  const on = Math.min(1, rolled * 25); // fading in as they start to grow
  const reach = (roll.width / 2) * (1 + roll.radius / 900); // as wide as the roll is, at its middle
  ends.forEach((end, k) => {
    const x = roll.x + (k ? reach : -reach);
    Object.assign(end.style, {
      left: `${x - roll.radius * 0.42}px`,
      top: `${roll.y - roll.radius}px`,
      width: `${roll.radius * 0.84}px`,
      height: `${roll.radius * 2}px`,
      opacity: on,
    });
  });
  Object.assign(shadow.style, {
    left: `${roll.x - reach}px`,
    top: `${roll.y + roll.radius * 0.4}px`,
    width: `${reach * 2}px`,
    height: `${roll.radius * 1.3}px`,
    opacity: on,
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
  const state = await readyRoll(item, img.getBoundingClientRect());
  cart.push(item);
  if (!state) {
    // (no WebGL: straight into the bag, which opens)
    showBag();
    document.body.classList.remove("is-buying");
    buying = false;
    openCart();
    return;
  }
  rollTo(state, 0);
  carpet.style.visibility = "hidden";
  // "Thank you" on the floor in the middle of where the rug lies, uncovered as it rolls up
  const lay = img.getBoundingClientRect();
  rollThanks.style.setProperty("--x", `${lay.left + lay.width / 2}px`);
  rollThanks.style.setProperty("--y", `${lay.top + lay.height / 2}px`);
  rollThanks.classList.add("is-shown");

  await animate(ROLL_UP, (t) => rollTo(state, t));

  // into the bag: the bag shows (Shop gives way to it), the roll flies to it in an arc
  bag.hidden = false;
  shopLink.hidden = true;
  const target = bag.getBoundingClientRect();
  const roll = rollSize(state);
  const dx = target.left + target.width / 2 - roll.x;
  const dy = target.top + target.height / 2 - roll.y;
  const small = Math.min(0.12, 28 / roll.width);
  const stage = rollGl.stage;
  stage.style.transformOrigin = `${roll.x}px ${roll.y}px`;
  const flight = stage.animate(
    [
      { transform: "translate(0, 0) scale(1)" },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.35 - 70}px) scale(${(1 + small) / 2.4})`, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(${small})` },
    ],
    { duration: ROLL_FLY, easing: "cubic-bezier(0.45, 0, 0.25, 1)", fill: "forwards" }
  );
  await flight.finished;
  stage.style.visibility = "hidden";
  showBag();
  bag.classList.remove("is-landing");
  void bag.offsetWidth;
  bag.classList.add("is-landing");

  // the one that unrolls (once the bag is closed) is a fresh, clean rug: what you drew went in the bag
  rolledAway = (await cleanRug()) || state;
  rollGl.stage.style.visibility = "hidden";
  await wait(BAG_OPENS_AFTER);
  openCart();
  buying = false;
}

// After a buy: the drawing wiped (the pile untouched, Ripple Square started over), and the roll
// readied with the clean rug
async function cleanRug() {
  if (fingerPaint) fingerPaint.wipe();
  else if (pile) wipeDrawing();
  await wait(50);
  return readyRoll(rugNow(), img.getBoundingClientRect());
}

// The rug unrolls back into place, to play on or buy another
async function unroll() {
  const state = rolledAway;
  if (!state) return;
  rolledAway = null;
  rollThanks.classList.remove("is-shown"); // covered again by the rug
  const stage = rollGl.stage;
  stage.getAnimations().forEach((a) => a.cancel());
  stage.style.visibility = "visible";
  rollTo(state, 1);
  await animate(ROLL_UP, (t) => rollTo(state, 1 - t));
  carpet.style.visibility = "";
  stage.style.visibility = "hidden";
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
  unroll(); // just bought: the clean rug unrolls back into place
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
    tag("p", "cart-thanks__big", "Long way     but for you"), // the space in it is the long way
    // broken where it pauses, so its lines are about as long as each other
    tag(
      "p",
      "cart-thanks__text cart-thanks__journey",
      cart.length > 1
        ? "Your rugs are being knotted by hand,\nfar away in the Himalayas.\nWe'll let you know when they set off."
        : "Your rug is being knotted by hand,\nfar away in the Himalayas.\nWe'll let you know when it sets off."
    ),
    pictures,
    tag("p", "cart-thanks__text", `${cart.length} ${cart.length > 1 ? "rugs" : "rug"} · ${euros(cart.reduce((sum, item) => sum + item.price, 0))}`),
    back,
    rule.cloneNode(true)
  );
  cartThanks.classList.add("is-open");
  cartThanks.setAttribute("aria-hidden", "false");
}

buyButton.addEventListener("click", buy);
