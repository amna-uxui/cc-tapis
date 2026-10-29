/*
  Blowing on the rug: blow at the bottom of the phone (where its microphone is) and a gust rolls
  up the shaggy pile from the bottom of the screen. The harder you blow, the further the pile
  bends and the faster it flutters; when you stop, it settles back.

  Your breath always moves the whole rug, at any zoom: strongest along the rug's bottom edge (where
  it reaches first) and calming gradually towards its top, while gusts keep rolling up from that
  edge so the movement travels.

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
// Blowing on a microphone is loud, and it's only rushing air: a hiss with no note in it. Talking has
// a note (the voice vibrates at a pitch, so its sound repeats itself many times a second), and its
// hissy bits ("s", "f", "p") are short. So a sound blows only when it's loud, has no pitch, is
// hiss-like across the frequencies, and goes on for a moment; and not just after a voice.
const BLOW_GATE = 7;        // dB the sound must rise above the quiet room before it counts as a breath
const BLOW_RANGE = 16;      // dB more for the strongest breath
const VOICE_PITCH = 0.45;   // how clearly a sound repeats itself (0 = not at all, 1 = a pure note) before it's a voice
const BREATH_HISS = 0.18;   // how evenly a breath spreads over the frequencies, at least (0 = one note, 1 = pure hiss)
const BREATH_HOLD = 0.2;    // seconds a breath must go on before the rug moves (talking's hissy bits are shorter)
const VOICE_REST = 0.3;     // seconds after a voice before a breath counts (the gaps between words don't blow)
const ECHO_MARGIN = 18;     // dB louder a breath must be while the rug's own wind sound plays at full
                            // volume (js/carpet-wind-sound.js), so the microphone doesn't hear it as a breath
const ROOM_LEARN = 1;       // seconds after tapping spent listening to the quiet room (nothing blows then)
const BREATH_RISE = 0.35;   // how quickly the wind follows a breath that gets stronger (1 = instantly)
const BREATH_FALL = 0.06;   // and one that fades (lower = the gust trails off more softly)

// ---------- The wind on the rug ----------
const GRID = 96;            // the wind is worked out on a grid this many cells across the rug
const GUST_SPEED = 900;     // screen pixels per second a gust travels up the screen (the same at any zoom)
const GUST_FADE = 1.4;      // seconds for a gust to lose half its strength as it travels
const GUST_SWAY = 0.6;      // how much the gust curls left and right as it goes (in grid cells)
const GUST_SPREAD = 0.18;   // how much it spreads sideways, so its front is soft, not a ruler line
const WIND_TOP = 0.2;       // the wind at the rug's top edge, as a share of its strength at the bottom edge
const WIND_CURVE = 1.6;     // how it eases off on the way up (1 = evenly; higher = stays strong low down, calms quicker higher up)
const WIND_DOWN = 0.12;     // seconds for the pile to bend all the way when the wind reaches it
const WIND_UP = 1.2;        // seconds for it to rise halfway back once the wind has passed

// ---------- How the pile looks in the wind (in photo pixels and shares) ----------
// Real shag in the wind: the fibres bend one way, away from the wind, and each tuft is tugged a
// little further and springs back on its own, slowly; the bent fibres stretch into strands.
// (Not a trembling of the whole picture back and forth: that looks like water.)
const LEAN_PX = 22;         // how far the pile bends away from the wind, at full strength
const SWAY_PX = 12;         // how much further each tuft is tugged as the wind pulls at it
const SWAY_SPEED = 7;       // how quickly a tuft is tugged and springs back (7 = about once a second)
const SIDE_PX = 4;          // the little a tuft leans sideways as it's tugged
const TUFT_PX = 20;         // about the width of one tuft in the photo (each one moves on its own)
const TUFT_TALL = 1.6;       // tufts are taller than wide, along the wind
const ZOOM_REACH = 0.6;     // below this zoom (the close-up is about 0.6), the bend grows so it still shows (up to 3×)
const WIND_DEEP = 0.34;     // flattened pile shows its deeper roots: this much darker at full strength
const WIND_RICH = 0.5;      // and this much richer in colour
const WIND_SHEEN = 0.28;    // the front of a gust catches the light: this much lighter
const WIND_SHIMMER = 0.1;   // a tuft catches a little more light as it's tugged further

const windCanvas = carpet.querySelector(".carpet__wind");
const blowButton = document.querySelector("[data-blow]");
const blowStatus = document.querySelector("[data-blow-status]");

// ---------- The microphone ----------

let listening = false;
let audio = null;     // { ctx, stream, analyser, samples }
let floor = null;     // how loud the low rumble of the quiet room is (dB), learnt as we go
let micBreath = 0;    // the breath the microphone hears, 0..1
let blowActive = false; // GrandMa Patterns is on show (js/carpet-rugs.js): the space bar blows
let heldBreath = 0;   // the breath from holding the button or the space bar, 0..1
let holding = false;
let micState = "off"; // off, asking, on, or what went wrong (shown with ?debug)
let noMic = false;    // the microphone was refused or is missing: holding the button blows instead
let breath = 0;       // the breath that blows, smoothed

const hearing = { level: -100, floor: -100, pitch: 0, hiss: 0 }; // for the debug meter

// Ways to start listening, tried in turn: the raw sound, then the plain sound, each asked for
// first and the sound started after (while the microphone records, iPhone lets the sound start
// without a tap); last, the sound started first, inside the tap.
// Safari only runs sound that ends up at the speaker, so the microphone also goes there, turned
// all the way down: silent, but it keeps the sound running.
// The raw sound: the phone's own voice cleaning would take out exactly the breath we listen for
const RAW_SOUND = { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } };
const PLAIN_SOUND = { audio: true };

async function openMicrophone({ ask, soundFirst }) {
  let ctx = null;
  let stream = null;
  let step = soundFirst ? "sound" : "microphone";
  try {
    if (soundFirst) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      ctx.resume();
      step = "microphone";
      stream = await navigator.mediaDevices.getUserMedia(ask);
    } else {
      stream = await navigator.mediaDevices.getUserMedia(ask);
      step = "sound";
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    step = "connect";
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048; // about 40 ms of sound: long enough to hear a low voice's pitch
    const mute = ctx.createGain();
    mute.gain.value = 0;
    ctx.createMediaStreamSource(stream).connect(analyser);
    analyser.connect(mute);
    mute.connect(ctx.destination);
    step = "resume";
    if (ctx.state !== "running") await ctx.resume();
    return {
      ctx,
      stream,
      analyser,
      samples: new Float32Array(analyser.fftSize),
      bins: new Float32Array(analyser.frequencyBinCount),
      heard: 0,      // seconds listened
      blowing: 0,    // seconds the current breath has gone on
      voiceAt: -9,   // when a voice was last heard
    };
  } catch (error) {
    if (stream) stream.getTracks().forEach((track) => track.stop());
    if (ctx) ctx.close();
    error.step = step;
    throw error;
  }
}

async function startListening() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    failListening(window.isSecureContext ? "no microphone here" : "needs https");
    return;
  }
  micState = "asking";
  showBlowStatus("Allow the microphone");
  // iPhone: the page may be set to only play sound (the brushing sound on Hypercode does that), which
  // refuses the microphone; back to automatic, which allows it and keeps sound on the loudspeaker
  // ("play-and-record" would send it to the quiet earpiece used for calls)
  if (navigator.audioSession) navigator.audioSession.type = "auto";
  if (micChannel) micChannel.postMessage("mine"); // other pages of this site: let go of it
  const tries = [];
  for (const way of [
    { ask: RAW_SOUND, soundFirst: false },
    { ask: PLAIN_SOUND, soundFirst: false },
    { ask: RAW_SOUND, soundFirst: true },
  ]) {
    try {
      audio = await openMicrophone(way);
      break;
    } catch (error) {
      tries.push(`${error.name} at ${error.step}${error.message ? ": " + error.message : ""}`);
      if (error.name === "NotAllowedError") break; // a clear "no": asking again won't help
    }
  }
  if (!audio) {
    failListening(tries.join(" / then "), tries[tries.length - 1].split(" ")[0]);
    return;
  }
  floor = null;
  listening = true;
  noMic = false;
  if (typeof windSound !== "undefined") windSound.start(audio.ctx); // the wind plays through the microphone's sound
  micState = tries.length ? `on (way ${tries.length + 1}; first: ${tries[0]})` : "on";
  blowButton.classList.add("is-listening");
  blowButton.setAttribute("aria-pressed", "true");
  showBlowStatus("Blow on the bottom of the phone");
  wake();
}

// No microphone: say why (in short above the button, in full with ?debug); holding blows instead
function failListening(why, short = why) {
  noMic = true;
  micState = why;
  // the exact reason shows with ?debug; here, what to do about it
  showBlowStatus(
    short === "NotAllowedError"
      ? "Microphone not allowed: hold to blow"
      : "Mic didn't start: tap again, or open in Safari or Chrome"
  );
  wake();
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

  const echo = typeof windSound !== "undefined" ? windSound.level() * ECHO_MARGIN : 0;
  const loud = Math.min(1, Math.max(0, (level - floor - BLOW_GATE - echo) / BLOW_RANGE));
  if (loud <= 0) {
    audio.blowing = 0;
    hearing.pitch = hearing.hiss = 0;
    return 0;
  }

  // a voice? (a clear pitch, or the sound gathered on a few notes)
  const pitch = pitchStrength(samples, audio.ctx.sampleRate);
  analyser.getFloatFrequencyData(audio.bins);
  const hiss = hissiness(audio.bins, audio.ctx.sampleRate, 250, 4000);
  hearing.pitch = pitch;
  hearing.hiss = hiss;
  if (pitch > VOICE_PITCH || hiss < BREATH_HISS) {
    audio.voiceAt = audio.heard;
    audio.blowing = 0;
    return 0;
  }
  if (audio.heard - audio.voiceAt < VOICE_REST) return 0; // a gap between words

  // a breath, once it has gone on for a moment
  audio.blowing += seconds;
  return audio.blowing < BREATH_HOLD ? 0 : loud;
}

// How clearly the sound repeats itself at a voice's pitch (70 to 400 times a second): 0..1.
// A voice is close to 1, rushing air close to 0. Worked out on every 4th sample (plenty for pitches
// this low, and four times quicker), with the deep end taken out first: blowing straight into the
// microphone rumbles, and a rumble alone can look a little like a low note; a voice keeps its
// pitch in its higher overtones too.
function pitchStrength(samples, rate) {
  const n = samples.length >> 2;
  const down = pitchStrength.down && pitchStrength.down.length === n ? pitchStrength.down : (pitchStrength.down = new Float32Array(n));
  let before = 0;
  for (let i = 0; i < n; i++) {
    const k = i * 4;
    const now = (samples[k] + samples[k + 1] + samples[k + 2] + samples[k + 3]) / 4;
    down[i] = now - before; // the change from one to the next: the deep end drops away
    before = now;
  }
  const r = rate / 4;
  const shortest = Math.floor(r / 400);
  const longest = Math.min(Math.ceil(r / 70), n >> 1);
  let best = 0;
  for (let lag = shortest; lag <= longest; lag++) {
    let both = 0;
    let first = 0;
    let second = 0;
    for (let i = 0; i + lag < n; i++) {
      const a = down[i];
      const b = down[i + lag];
      both += a * b;
      first += a * a;
      second += b * b;
    }
    const match = both / Math.sqrt(first * second + 1e-12);
    if (match > best) best = match;
  }
  return best;
}

// How evenly the sound spreads over the frequencies from lo to hi Hz: 0..1 (spectral flatness).
// Rushing air spreads evenly; a voice gathers on a few notes.
function hissiness(bins, rate, lo, hi) {
  const hz = rate / 2 / bins.length;
  const from = Math.max(1, Math.floor(lo / hz));
  const to = Math.min(bins.length - 1, Math.ceil(hi / hz));
  let logs = 0;
  let sum = 0;
  for (let i = from; i <= to; i++) {
    const power = Math.pow(10, bins[i] / 10);
    logs += Math.log(power + 1e-20);
    sum += power;
  }
  const count = to - from + 1;
  return Math.exp(logs / count) / (sum / count + 1e-20);
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

// How much of the breath reaches a row of the rug: all of it at the bottom edge, calming gradually
// towards the top
function windAt(y) {
  return WIND_TOP + (1 - WIND_TOP) * Math.pow(y / Math.max(1, gh - 1), WIND_CURVE);
}

// One step of the wind: gusts travel up the rug, fading and spreading, new ones come in at its
// bottom edge with the breath, the breath reaches the whole rug (strongest low down), and the pile
// bends under it and rises again after
function stepWind(seconds) {
  clock += seconds;
  const cell = img.naturalWidth / gw;                       // photo pixels per cell
  const rise = (GUST_SPEED / view.scale / cell) * seconds;  // cells the gusts travel this step
  const keep = Math.pow(0.5, seconds / GUST_FADE);

  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const sway = (Math.sin(y * 0.21 + clock * 2.3) + Math.sin(x * 0.13 - clock * 1.7)) * 0.5 * GUST_SWAY;
      const here = sampleEnergy(x + sway, y + rise);
      const sides = (sampleEnergy(x - 1 + sway, y + rise) + sampleEnergy(x + 1 + sway, y + rise)) / 2;
      // a gust loses strength as it climbs: never more than the rug's calm-towards-the-top allows
      spare[y * gw + x] = Math.min((here + (sides - here) * GUST_SPREAD) * keep, windAt(y));
    }
  }
  [energy, spare] = [spare, energy];

  if (breath > 0.001) {
    // gusts come in along the rug's bottom edge, and roll up
    const depth = Math.max(1, Math.ceil(rise)); // fill the rows a fast gust would otherwise skip
    for (let r = gh - 1; r > gh - 1 - depth && r >= 0; r--) {
      for (let x = 0; x < gw; x++) {
        const i = r * gw + x;
        energy[i] = Math.max(energy[i], breath * (0.55 + 0.45 * ragged(x)));
      }
    }
    // and the breath reaches every part of the rug, strongest low down, calmer higher up
    for (let y = 0; y < gh; y++) {
      const share = windAt(y);
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        energy[i] = Math.max(energy[i], breath * share * (0.7 + 0.3 * ragged(x + y * 0.5)));
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
uniform float uReach;  // zoomed out, the bend reaches further in photo pixels, so it shows as much

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// How far one tuft is tugged right now, 0..1: each tuft at its own pace and moment
float tug(vec2 tuft) {
  float pace = 0.7 + 0.6 * hash(tuft);
  float moment = 6.2831 * hash(tuft + 17.3);
  return 0.5 + 0.5 * sin(uTime * ${SWAY_SPEED.toFixed(2)} * pace + moment);
}

// The tug at any point, blended between the four nearest tufts so their borders don't show
float tugAt(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(tug(i), tug(i + vec2(1.0, 0.0)), f.x),
             mix(tug(i + vec2(0.0, 1.0)), tug(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
  vec2 wind = texture2D(uWind, vUv).rg;
  float gust = wind.r;  // wind passing over here now
  float laid = wind.g;  // how far the pile lies down

  vec2 tuft = vUv / (uPx * vec2(${TUFT_PX.toFixed(1)}, ${(TUFT_PX * TUFT_TALL).toFixed(1)}));
  float t = tugAt(tuft);

  // how far the fibres here bend away from the wind, in photo pixels, further while the wind tugs
  // at them: up the rug, away from the wind coming from its bottom edge
  float bend = (laid * ${LEAN_PX.toFixed(1)} + gust * ${SWAY_PX.toFixed(1)} * t) * uReach;
  float side = (t - 0.5) * ${SIDE_PX.toFixed(1)} * gust * uReach;
  vec2 toRoot = vec2(0.0, 1.0); // a fibre's root lies towards where the wind comes from
  vec2 across = vec2(toRoot.y, -toRoot.x);

  // a bent fibre runs from its root to its tip (here): the photo is drawn out along it into a
  // strand, the tip counting most
  vec3 c = vec3(0.0);
  float total = 0.0;
  for (int k = 0; k < 6; k++) {
    float along = float(k) / 5.0;
    float weight = 0.12 + along * along * along * 2.0;
    vec2 at = vUv + (across * side + toRoot * bend) * along * uPx;
    c += texture2D(uPhoto, clamp(at, uPx, 1.0 - uPx)).rgb * weight;
    total += weight;
  }
  c /= total;
  float alpha = texture2D(uPhoto, vUv).a; // the rug's soft edge stays where it is

  // the front of a rolling gust: more wind just below than just above
  float front = texture2D(uWind, vUv + vec2(0.0, uCell.y * 1.5)).g - texture2D(uWind, vUv - vec2(0.0, uCell.y * 1.5)).g;
  float tone = 1.0 - ${WIND_DEEP.toFixed(3)} * laid
             + ${WIND_SHEEN.toFixed(3)} * clamp(front * 3.0, 0.0, 1.0)
             + ${WIND_SHIMMER.toFixed(3)} * (t - 0.5) * 2.0 * gust;
  float grey = dot(c, vec3(0.3, 0.59, 0.11));
  c = mix(vec3(grey), c, 1.0 + ${WIND_RICH.toFixed(3)} * laid);
  // the cut-out rug's soft edge and shadow stay see-through, as in the photo
  gl_FragColor = vec4(c * tone * alpha, alpha);
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
    reach: gl.getUniformLocation(program, "uReach"),
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
  if (!gl) return; // not ready yet: it takes the photo once it is (setupBlow)
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
  gl.uniform1f(glUniforms.reach, Math.min(3, Math.max(1, ZOOM_REACH / view.scale)));
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
  if (typeof windSound !== "undefined") windSound.follow(want, seconds); // the wind answers once the breath stops

  // keep going while the wind blows or the rug listens; otherwise rest until the next breath
  running = moving || listening || holding || heldBreath > 0.001 ? requestAnimationFrame(frame) : null;
  if (!running && typeof windSound !== "undefined") windSound.hush();
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
  if (typeof windSound !== "undefined") windSound.start(); // a tap: the wind's sound may play from now
  if (listening) stopListening();
  else if (micState !== "asking") startListening(); // also tries again after it went wrong
});

// Without a microphone, holding the button blows instead
blowButton.addEventListener("pointerdown", () => {
  blowButton.classList.remove("is-inviting"); // found it: it stops calling
  if (!noMic) return;
  if (typeof windSound !== "undefined") windSound.start();
  holding = true;
  wake();
});
["pointerup", "pointercancel", "pointerleave"].forEach((type) =>
  blowButton.addEventListener(type, () => (holding = false))
);
blowButton.addEventListener("contextmenu", (e) => e.preventDefault()); // long press: no menu

// Another collection comes on: the wind dies down at once and the microphone is let go
function calmWind() {
  if (listening) stopListening();
  holding = false;
  heldBreath = 0;
  micBreath = 0;
  breath = 0;
  if (energy) {
    energy.fill(0);
    lay.fill(0);
  }
  document.body.classList.remove("is-blowing");
  if (typeof windSound !== "undefined") windSound.hush();
}

// The phone gives the microphone to one page at a time. So leaving the page (another tab, another
// app, closing it) lets go of it, and when this page starts listening, any other open page of
// this site lets go too. Tap the wind button again when you come back.
document.addEventListener("visibilitychange", () => {
  if (document.hidden && listening) stopListening();
});
window.addEventListener("pagehide", () => {
  if (listening) stopListening();
});
const micChannel = "BroadcastChannel" in window ? new BroadcastChannel("cc-tapis-microphone") : null;
if (micChannel) {
  micChannel.onmessage = (e) => {
    if (e.data === "mine" && listening) stopListening();
  };
}

// On a computer: hold the space bar for a breath
document.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.repeat || !blowActive) return;
  e.preventDefault();
  if (typeof windSound !== "undefined") windSound.start();
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
    `pitch  ${hearing.pitch.toFixed(2)} (voice above ${VOICE_PITCH})   hiss ${hearing.hiss.toFixed(2)} (breath above ${BREATH_HISS})\n` +
    `heard  ${audio && audio.blowing > 0 ? "breath" : audio && audio.heard - audio.voiceAt < VOICE_REST ? "voice" : "-"}\n` +
    `wind sound  ${typeof windSound !== "undefined" ? windSound.state() : "-"}\n` +
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
