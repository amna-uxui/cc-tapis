/*
  Blowing on the rug: blow at the bottom of the phone (where its microphone is) and a gust rolls
  up the shaggy pile from the bottom of the screen. The harder you blow, the further the pile
  bends and the faster it flutters; when you stop, it settles back.

  - Tap the wind button (bottom right) to let the rug listen (the phone asks for the microphone
    once). Nothing moves until you blow. Tap again to stop listening.
  - No microphone ("Don't allow", or none at all): then holding the wind button blows instead.
    On a computer, holding the space bar always does.
  - Add ?debug to the address to see what the microphone hears, for tuning the BLOW_ numbers.

  The rug is a photo, so its fibres can't really move: a WebGL layer redraws the photo every frame,
  shifted a little where the wind is (the tufts bend away from it and tremble), darker where the
  pile lies flat, with a sheen along the front of each gust.

  Needs js/carpet-viewer.js (stage, carpet, img, view) to be loaded first.
*/

// ---------- Hearing a breath ----------
// Blowing on a microphone is loud: much louder than the quiet room. (Phones clean up the low rumble
// of wind themselves, so we just listen for loudness; for now, a loud voice blows a little too.)
const BLOW_GATE = 10;       // dB the sound must rise above the quiet room before it counts as a breath
const BLOW_RANGE = 25;      // dB more for the strongest breath
const ROOM_LEARN = 1;       // seconds after tapping spent listening to the quiet room (nothing blows then)
const BREATH_RISE = 0.35;   // how quickly the wind follows a breath that gets stronger (1 = instantly)
const BREATH_FALL = 0.06;   // and one that fades (lower = the gust trails off more softly)

// ---------- The wind on the rug ----------
const GRID = 96;            // the wind is worked out on a grid this many cells across the rug
const GUST_SPEED = 900;     // screen pixels per second a gust travels up the screen (the same at any zoom)
const GUST_FADE = 0.9;      // seconds for a gust to lose half its strength as it travels
const GUST_SWAY = 0.6;      // how much the gust curls left and right as it goes (in grid cells)
const GUST_SPREAD = 0.18;   // how much it spreads sideways, so its front is soft, not a ruler line
const WIND_DOWN = 0.12;     // seconds for the pile to bend all the way when the wind reaches it
const WIND_UP = 0.7;        // seconds for it to rise halfway back once the wind has passed

// ---------- How the pile looks in the wind (in photo pixels and shares) ----------
const LEAN_PX = 14;         // how far the tufts bend away from the wind, at full strength
const FLUTTER_PX = 9;       // how far they tremble back and forth in it
const SWAY_PX = 4;          // and sideways
const TUFT_PX = 26;         // about the size of one tuft in the photo: the trembling moves tuft by tuft
const WIND_DEEP = 0.22;     // flattened pile shows its deeper roots: this much darker at full strength
const WIND_RICH = 0.35;     // and this much richer in colour
const WIND_SHEEN = 0.16;    // the front of a gust catches the light: this much lighter
const WIND_SHIMMER = 0.07;  // single tufts flicker lighter and darker in the wind

const windCanvas = carpet.querySelector(".carpet__wind");
const blowButton = document.querySelector("[data-blow]");
const blowStatus = document.querySelector("[data-blow-status]");

// ---------- The microphone ----------

let listening = false;
let audio = null;     // { ctx, stream, analyser, samples }
let floor = null;     // how loud the low rumble of the quiet room is (dB), learnt as we go
let micBreath = 0;    // the breath the microphone hears, 0..1
let heldBreath = 0;   // the breath from holding the button or the space bar, 0..1
let holding = false;
let micState = "off"; // off, asking, on, or what went wrong (shown with ?debug)
let noMic = false;    // the microphone was refused or is missing: holding the button blows instead
let breath = 0;       // the breath that blows, smoothed

const hearing = { level: -100, floor: -100 }; // for the debug meter

// The sound is set up once the microphone is allowed (while it records, iPhone lets the sound
// start without another tap). Safari only runs sound that ends up at the speaker, so the
// microphone also goes there, turned all the way down: silent, but it keeps the sound running.
async function startListening() {
  let ctx = null;
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error(window.isSecureContext ? "no microphone here" : "needs https");
    micState = "asking";
    showBlowStatus("Allow the microphone");
    // the phone's own noise and echo cleaning would take the breath out: ask for the raw sound
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    const mute = ctx.createGain();
    mute.gain.value = 0;
    ctx.createMediaStreamSource(stream).connect(analyser);
    analyser.connect(mute);
    mute.connect(ctx.destination);
    if (ctx.state !== "running") await ctx.resume();
    audio = { ctx, stream, analyser, samples: new Float32Array(analyser.fftSize), heard: 0 };
    floor = null;
    listening = true;
    noMic = false;
    micState = "on";
    blowButton.classList.add("is-listening");
    blowButton.setAttribute("aria-pressed", "true");
    showBlowStatus("Blow on the bottom of the phone");
    wake();
  } catch (error) {
    if (ctx) ctx.close();
    noMic = true;
    micState = error.name && error.name !== "Error" ? error.name : error.message;
    showBlowStatus("No microphone: hold to blow");
    wake();
  }
}

function stopListening() {
  if (audio) {
    audio.stream.getTracks().forEach((track) => track.stop());
    audio.ctx.close();
  }
  audio = null;
  listening = false;
  micBreath = 0;
  micState = "off";
  blowButton.classList.remove("is-listening");
  blowButton.setAttribute("aria-pressed", "false");
  showBlowStatus("");
}

// How hard someone is blowing right now, 0..1
function hear(seconds) {
  const { analyser, samples } = audio;
  if (analyser.getFloatTimeDomainData) {
    analyser.getFloatTimeDomainData(samples);
  } else {
    // older Safari: only whole-number samples
    const bytes = new Uint8Array(samples.length);
    analyser.getByteTimeDomainData(bytes);
    for (let i = 0; i < bytes.length; i++) samples[i] = (bytes[i] - 128) / 128;
  }
  let power = 0;
  for (let i = 0; i < samples.length; i++) power += samples[i] * samples[i];
  const level = 10 * Math.log10(power / samples.length + 1e-10); // dB, 0 = as loud as it gets

  hearing.level = level;
  if (level < -90) return 0; // no sound at all yet: the microphone is still starting

  // the quiet room: learnt in the first moment, then it follows quieter sounds quickly and louder
  // ones only slowly (a long breath mustn't become the new quiet)
  audio.heard += seconds;
  if (floor === null) floor = level;
  const rate = audio.heard < ROOM_LEARN ? 4 : level < floor ? 2 : 0.15;
  floor += (level - floor) * Math.min(1, seconds * rate);
  hearing.floor = floor;
  if (audio.heard < ROOM_LEARN) return 0;

  return Math.min(1, Math.max(0, (level - floor - BLOW_GATE) / BLOW_RANGE));
}

// ---------- The wind ----------

let gw = 0;
let gh = 0;
let energy = null;  // the gusts moving across the rug, 0..1 per cell
let spare = null;   // the next frame's gusts
let lay = null;     // how flat the pile lies in each cell, 0..1
let windBytes = null;
let clock = 0;

function sizeWind() {
  gw = GRID;
  gh = Math.max(2, Math.round((GRID * img.naturalHeight) / img.naturalWidth));
  energy = new Float32Array(gw * gh);
  spare = new Float32Array(gw * gh);
  lay = new Float32Array(gw * gh);
  windBytes = new Uint8Array(gw * gh * 4);
}

// A slowly changing value, 0..1, along the bottom of the screen: a ragged gust front, not a ruler line
function ragged(x) {
  return 0.5 + 0.3 * Math.sin(x * 0.37 + clock * 2.1) + 0.2 * Math.sin(x * 0.91 - clock * 3.3);
}

function sampleEnergy(x, y) {
  x = Math.min(gw - 1, Math.max(0, x));
  if (y > gh - 1 || y < 0) return 0; // nothing blows in from beyond the rug
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(gw - 1, x0 + 1);
  const y1 = Math.min(gh - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const top = energy[y0 * gw + x0] * (1 - fx) + energy[y0 * gw + x1] * fx;
  const bottom = energy[y1 * gw + x0] * (1 - fx) + energy[y1 * gw + x1] * fx;
  return top * (1 - fy) + bottom * fy;
}

// One step of the wind: gusts travel up the screen, fading and spreading, new ones come in at the
// bottom of the screen with the breath, and the pile bends under them and rises again after
function stepWind(seconds) {
  clock += seconds;
  const cell = img.naturalWidth / gw;                       // photo pixels per cell
  const rise = (GUST_SPEED / view.scale / cell) * seconds;   // cells the gusts travel this step
  const keep = Math.pow(0.5, seconds / GUST_FADE);

  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const sway = (Math.sin(y * 0.21 + clock * 2.3) + Math.sin(x * 0.13 - clock * 1.7)) * 0.5 * GUST_SWAY;
      const here = sampleEnergy(x + sway, y + rise);
      const sides = (sampleEnergy(x - 1 + sway, y + rise) + sampleEnergy(x + 1 + sway, y + rise)) / 2;
      spare[y * gw + x] = (here + (sides - here) * GUST_SPREAD) * keep;
    }
  }
  [energy, spare] = [spare, energy];

  // the breath comes in along the bottom of the screen (or the rug's bottom edge, if that's higher)
  if (breath > 0.001) {
    const bottom = (stage.clientHeight - view.y) / view.scale / cell;
    const row = Math.min(gh - 1, Math.floor(bottom));
    const depth = Math.max(1, Math.ceil(rise)); // fill the rows a fast gust would otherwise skip
    for (let r = row; r > row - depth && r >= 0; r--) {
      for (let x = 0; x < gw; x++) {
        const i = r * gw + x;
        energy[i] = Math.max(energy[i], breath * (0.55 + 0.45 * ragged(x)));
      }
    }
  }

  const down = Math.min(1, seconds / WIND_DOWN);
  const up = Math.pow(0.5, seconds / WIND_UP);
  let moving = breath > 0.001;
  for (let i = 0; i < lay.length; i++) {
    const e = energy[i];
    lay[i] = e > lay[i] ? lay[i] + (e - lay[i]) * down : lay[i] * up;
    if (e < 0.002) energy[i] = 0;
    if (lay[i] < 0.002) lay[i] = 0;
    if (energy[i] || lay[i]) moving = true;
    windBytes[i * 4] = Math.min(255, energy[i] * 255);
    windBytes[i * 4 + 1] = Math.min(255, lay[i] * 255);
  }
  return moving;
}

// ---------- Drawing the pile (WebGL) ----------

const VERTEX = `
attribute vec2 aCorner;
varying vec2 vUv;
void main() {
  vUv = aCorner;
  gl_Position = vec4(aCorner.x * 2.0 - 1.0, 1.0 - aCorner.y * 2.0, 0.0, 1.0);
}`;

const FRAGMENT = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uPhoto;
uniform sampler2D uWind;
uniform vec2 uPx;      // one photo pixel, in texture units
uniform vec2 uCell;    // one wind cell, in texture units
uniform float uTime;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
  vec2 wind = texture2D(uWind, vUv).rg;
  float gust = wind.r;  // wind passing over here now
  float laid = wind.g;  // how far the pile lies down

  // each tuft trembles on its own, faster in a stronger wind
  vec2 tuft = vUv / (uPx * ${TUFT_PX.toFixed(1)});
  float a = noise(tuft + vec2(0.0, uTime * (3.0 + gust * 5.0)));
  float b = noise(tuft * 1.7 + vec2(uTime * (4.0 + gust * 6.0), 7.0));

  // the tips bend away from the wind (up the screen), so each pixel shows the pile from just below it
  vec2 shift = vec2((b - 0.5) * ${SWAY_PX.toFixed(1)} * gust,
                    laid * ${LEAN_PX.toFixed(1)} + (a - 0.5) * ${FLUTTER_PX.toFixed(1)} * gust) * uPx;
  vec4 photo = texture2D(uPhoto, clamp(vUv + shift, uPx, 1.0 - uPx));
  vec3 c = photo.rgb;

  // the front of the gust: more wind just below than just above
  float front = texture2D(uWind, vUv + vec2(0.0, uCell.y * 1.5)).g - texture2D(uWind, vUv - vec2(0.0, uCell.y * 1.5)).g;
  float tone = 1.0 - ${WIND_DEEP.toFixed(3)} * laid
             + ${WIND_SHEEN.toFixed(3)} * clamp(front * 3.0, 0.0, 1.0) * (0.6 + 0.8 * a)
             + ${WIND_SHIMMER.toFixed(3)} * (b - 0.5) * 2.0 * gust;
  float grey = dot(c, vec3(0.3, 0.59, 0.11));
  c = mix(vec3(grey), c, 1.0 + ${WIND_RICH.toFixed(3)} * laid);
  // the cut-out rug's soft edge and shadow stay see-through, as in the photo
  gl_FragColor = vec4(c * tone * photo.a, photo.a);
}`;

let gl = null;
let glUniforms = null;
let photoTexture = null;
let windTexture = null;

function makeShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}

function makeTexture() {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

function setupGl() {
  gl = windCanvas.getContext("webgl", { antialias: false, preserveDrawingBuffer: true });
  if (!gl) return false;
  const program = gl.createProgram();
  gl.attachShader(program, makeShader(gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, makeShader(gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  gl.useProgram(program);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  const corner = gl.getAttribLocation(program, "aCorner");
  gl.enableVertexAttribArray(corner);
  gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);

  glUniforms = {
    px: gl.getUniformLocation(program, "uPx"),
    cell: gl.getUniformLocation(program, "uCell"),
    time: gl.getUniformLocation(program, "uTime"),
  };
  gl.uniform1i(gl.getUniformLocation(program, "uPhoto"), 0);
  gl.uniform1i(gl.getUniformLocation(program, "uWind"), 1);

  gl.activeTexture(gl.TEXTURE0);
  photoTexture = makeTexture();
  gl.activeTexture(gl.TEXTURE1);
  windTexture = makeTexture();
  return true;
}

// A new rug photo: the layer takes its size and pixels, and the wind starts calm
function loadPhoto() {
  windCanvas.width = img.naturalWidth;
  windCanvas.height = img.naturalHeight;
  gl.viewport(0, 0, windCanvas.width, windCanvas.height);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, photoTexture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  sizeWind();
  gl.uniform2f(glUniforms.px, 1 / img.naturalWidth, 1 / img.naturalHeight);
  gl.uniform2f(glUniforms.cell, 1 / gw, 1 / gh);
}

function drawPile() {
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, windTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gw, gh, 0, gl.RGBA, gl.UNSIGNED_BYTE, windBytes);
  gl.uniform1f(glUniforms.time, clock);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

// ---------- Every frame, while something moves ----------

let running = null;
let lastWindFrame = 0;

function wake() {
  if (running || !energy) return; // not ready yet
  lastWindFrame = performance.now();
  running = requestAnimationFrame(frame);
}

function frame(now) {
  const seconds = Math.min(0.05, (now - lastWindFrame) / 1000);
  lastWindFrame = now;

  if (audio) micBreath = hear(seconds);
  heldBreath += ((holding ? 0.8 : 0) - heldBreath) * Math.min(1, seconds * 6);
  const want = Math.max(micBreath, heldBreath);
  breath += (want - breath) * (want > breath ? BREATH_RISE : BREATH_FALL);
  if (breath < 0.001) breath = 0;
  blowButton.style.setProperty("--breath", breath.toFixed(3));
  if (debugMeter) showHearing();

  const moving = stepWind(seconds);
  document.body.classList.toggle("is-blowing", moving);
  if (moving) drawPile();

  // keep going while the wind blows or the rug listens; otherwise rest until the next breath
  running = moving || listening || holding || heldBreath > 0.001 ? requestAnimationFrame(frame) : null;
}

// ---------- The wind button ----------

let blowStatusTimer = null;
function showBlowStatus(text) {
  blowStatus.textContent = text;
  clearTimeout(blowStatusTimer);
  if (text) blowStatusTimer = setTimeout(() => (blowStatus.textContent = ""), 3000);
  if (debugMeter) showHearing();
}

// A tap: listen, or stop listening (nothing blows until you do)
blowButton.addEventListener("click", () => {
  if (listening) stopListening();
  else if (!noMic && micState !== "asking") startListening();
});

// Without a microphone, holding the button blows instead
blowButton.addEventListener("pointerdown", () => {
  if (!noMic) return;
  holding = true;
  wake();
});
["pointerup", "pointercancel", "pointerleave"].forEach((type) =>
  blowButton.addEventListener(type, () => (holding = false))
);
blowButton.addEventListener("contextmenu", (e) => e.preventDefault()); // long press: no menu

// On a computer: hold the space bar for a breath
document.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.repeat) return;
  e.preventDefault();
  holding = true;
  wake();
});
document.addEventListener("keyup", (e) => {
  if (e.code === "Space") holding = false;
});

// ---------- Debug meter (?debug) ----------

const debugMeter = new URLSearchParams(location.search).has("debug") ? document.createElement("pre") : null;
if (debugMeter) {
  debugMeter.className = "blow-debug";
  document.body.append(debugMeter);
}

function showHearing() {
  const bar = (v) => "█".repeat(Math.round(v * 20)).padEnd(20, "·");
  debugMeter.textContent =
    `mic   ${micState}${audio ? " (" + audio.ctx.state + ")" : ""}\n` +
    `level ${hearing.level.toFixed(0)} dB  quiet room ${hearing.floor.toFixed(0)} dB\n` +
    `sound  ${bar(Math.min(1, Math.max(0, (hearing.level + 90) / 90)))}\n` +
    `above  +${(hearing.level - hearing.floor).toFixed(0)} dB (blows from +${BLOW_GATE})\n` +
    `mic    ${bar(micBreath)}\n` +
    `breath ${bar(breath)}`;
}

// ---------- Start ----------

async function setupBlow() {
  await whenLoaded(img);
  if (!setupGl()) {
    showBlowStatus("No WebGL here");
    return;
  }
  loadPhoto();
}

setupBlow();
