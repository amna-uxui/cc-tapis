/*
  Carpet colours: tap the colour circle and the colours float up above it, one above the other.
  Each colour is a real photo of that rug; picking one swaps the rug (your drawing comes along,
  re-tinted to the new colour).

  Needs js/carpet-viewer.js (img, changeRug, setBrushTone) to be loaded first.
*/

// The first one is the rug the page opens with. tone: the brush colours for that rug, taken from
// the drawings on the original cc-tapis rug (leave it out and they are worked out from the photo).
const COLORS = [
  { name: "Cacao", src: "images/carpet-02-cacao.jpg", tone: { light: BRUSH_LIGHT, shade: BRUSH_SHADE } },
  { name: "Ochre", src: "images/carpet-03-ochre.jpg", tone: { light: [240, 212, 160], shade: [222, 184, 124] } },
  { name: "Sage", src: "images/carpet-04-sage.jpg", tone: { light: [226, 226, 212], shade: [196, 198, 184] } },
];

const colorButton = document.querySelector(".tool--color");
const palette = document.querySelector("[data-palette]");
const swatchRow = palette.querySelector("[data-palette-swatches]");

let current = COLORS[0];

// ---------- Colour helpers ----------

function rgbToHex(rgb) {
  return "#" + rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("");
}

function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb([h, s, l]) {
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
  };
  return [f(0), f(8), f(4)].map(Math.round);
}

// The light wool tones a brush leaves on a rug of this colour: always a step lighter than the rug,
// a smaller step on lighter rugs so the strokes keep their colour instead of turning white
function toneFor(rgb) {
  const [h, s, l] = rgbToHsl(rgb);
  return {
    light: hslToRgb([h, Math.min(s * 1.2, 0.8), l + (1 - l) * 0.36]),
    shade: hslToRgb([h, Math.min(s * 1.1, 0.75), l + (1 - l) * 0.24]),
  };
}

// The average colour of a rug photo (for its swatch and its brush)
function averageColor(photo) {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  ctx.drawImage(photo, 0, 0, size, size);
  const d = ctx.getImageData(0, 0, size, size).data;
  const sum = [0, 0, 0];
  for (let i = 0; i < d.length; i += 4) {
    sum[0] += d[i];
    sum[1] += d[i + 1];
    sum[2] += d[i + 2];
  }
  return sum.map((v) => v / (d.length / 4));
}

// Load every rug photo up front, so switching is instant. Its circle fills in once it has loaded.
function loadColor(color) {
  const photo = new Image();
  photo.src = color.src;
  color.photo = photo;
  color.loaded = whenLoaded(photo).then(() => {
    const rgb = averageColor(photo);
    color.swatch = rgbToHex(rgb);
    color.tone = color.tone || toneFor(rgb);
    swatchRow.querySelector(`[data-name="${color.name}"]`).style.background = color.swatch;
    if (color === current) showSwatch(color.swatch);
  });
}

// ---------- Choosing ----------

let changing = false;

async function chooseColor(color) {
  if (color === current || changing) return;
  changing = true;
  current = color;
  markChosen();

  await renderRug(); // js/carpet-shapes.js: this colour in the current shape
  changing = false;
}

// The current rug colour: on the colour circle, and filling the shapes (js/carpet-shapes.js)
function showSwatch(hex) {
  colorButton.style.background = hex;
  rugInfo.style.setProperty("--rug-color", hex);
}

function markChosen() {
  if (current.swatch) showSwatch(current.swatch);
  swatchRow.querySelectorAll(".swatch").forEach((s) => {
    s.setAttribute("aria-pressed", s.dataset.name === current.name);
  });
}

// ---------- The palette ----------

function buildSwatches() {
  COLORS.forEach((color) => {
    const swatch = document.createElement("button");
    swatch.className = "swatch";
    swatch.dataset.name = color.name;
    swatch.setAttribute("aria-label", color.name);
    swatch.addEventListener("click", () => chooseColor(color));
    swatchRow.append(swatch);
  });
  markChosen();
}

// The floating colour menu
function openPalette(menu, button) {
  closePalette();
  menu.classList.add("is-open");
  menu.setAttribute("aria-hidden", "false");
  button.setAttribute("aria-expanded", "true");
}

// Closes whichever menu is open. Returns true if one was (so the touch that closed it doesn't also draw)
function closePalette() {
  const open = document.querySelector(".palette.is-open");
  if (!open) return false;
  open.classList.remove("is-open");
  open.setAttribute("aria-hidden", "true");
  document.querySelectorAll("[aria-expanded]").forEach((b) => b.setAttribute("aria-expanded", "false"));
  return true;
}

// Tapping a menu's button opens it, or closes it if it was already open
function togglePalette(menu, button) {
  const wasOpen = menu.classList.contains("is-open");
  closePalette();
  if (!wasOpen) openPalette(menu, button);
}

colorButton.addEventListener("click", () => togglePalette(palette, colorButton));

// ---------- Start ----------

buildSwatches();
COLORS.forEach(loadColor);
