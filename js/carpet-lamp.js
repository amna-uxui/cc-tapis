/*
  The lamp: while zoomed out, a small dial sits left of the collection name, with the lamp as
  a dot on its ring. Tilt the phone and the lamp follows the tilt round the ring; the light on
  the rug moves with it: bright on the lamp's side, shadow on the far side, so you see how the
  velvet catches the light.

  Phones only share their motion with secure (https) pages, and iPhone asks first: tapping the
  dial asks for permission. Where there is no motion (a computer, or http), drag the lamp
  round the dial instead.

  Needs js/carpet-viewer.js (carpet) to be loaded first.
*/

const LAMP_START = -135;   // degrees: where the lamp starts (0 = right, -90 = top, -135 = top left)
const LAMP_REACH = 0.75;   // how far out the light sits, from the rug's middle (0.5 = on its edge)
const TILT_MIN = 4;        // degrees of tilt before the lamp moves (so holding still keeps it still)
const TILT_FOLLOW = 0.15;  // how quickly the lamp follows the tilt (lower = smoother, lazier)

const lampDial = document.querySelector("[data-lamp]");
const light = carpet.querySelector(".carpet__light");

let lampAngle = LAMP_START;

function setLamp(degrees) {
  lampAngle = ((degrees % 360) + 360) % 360;
  const radians = (lampAngle * Math.PI) / 180;
  lampDial.style.setProperty("--lamp-angle", `${lampAngle}deg`);
  lampDial.setAttribute("aria-valuenow", Math.round(lampAngle));
  light.style.setProperty("--light-x", `${(0.5 + Math.cos(radians) * LAMP_REACH) * 100}%`);
  light.style.setProperty("--light-y", `${(0.5 + Math.sin(radians) * LAMP_REACH) * 100}%`);
}

// ---------- Tilting the phone ----------

let tilting = false;  // motion is on
let level = null;     // how the phone was held when motion started: that counts as "no tilt"
let aim = lampAngle;  // where the tilt points the lamp; the lamp eases towards it
let easing = null;

function onTilt(e) {
  if (e.beta === null || e.gamma === null) return;
  if (!level) level = { beta: e.beta, gamma: e.gamma };

  const x = e.gamma - level.gamma; // tilted right (+) or left (-)
  const y = e.beta - level.beta;   // top tipped away (-) or towards you (+)
  if (Math.hypot(x, y) < TILT_MIN) return;

  // The lamp goes the way the phone tips: tip the right side down, the lamp moves right
  aim = (Math.atan2(y, x) * 180) / Math.PI;
  if (!easing) easing = requestAnimationFrame(easeLamp);
}

// Turn the shortest way round towards the aim, a little each frame
function easeLamp() {
  const turn = ((aim - lampAngle + 540) % 360) - 180;
  setLamp(lampAngle + turn * TILT_FOLLOW);
  easing = Math.abs(turn) > 0.5 ? requestAnimationFrame(easeLamp) : null;
}

function startTilt() {
  if (tilting) return;
  tilting = true;
  level = null;
  lampDial.classList.add("is-tilting");
  window.addEventListener("deviceorientation", onTilt);
}

// iPhone asks for permission, and only after a tap; other phones just send the motion
function askForTilt() {
  if (!window.DeviceOrientationEvent || !window.isSecureContext) return;
  if (typeof DeviceOrientationEvent.requestPermission === "function") {
    DeviceOrientationEvent.requestPermission()
      .then((answer) => answer === "granted" && startTilt())
      .catch(() => {});
  } else {
    startTilt();
  }
}

// ---------- Dragging the lamp (where there is no motion) ----------

// The angle from the dial's middle to the finger
function angleTo(e) {
  const box = lampDial.getBoundingClientRect();
  const x = e.clientX - (box.left + box.width / 2);
  const y = e.clientY - (box.top + box.height / 2);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

let dragging = false;

lampDial.addEventListener("pointerdown", (e) => {
  askForTilt();
  if (tilting) {
    level = null; // tapping the dial while tilting: how the phone is held now counts as level
    return;
  }
  dragging = true;
  lampDial.setPointerCapture(e.pointerId);
  setLamp(angleTo(e));
});

lampDial.addEventListener("pointermove", (e) => {
  if (dragging) setLamp(angleTo(e));
});

["pointerup", "pointercancel"].forEach((type) =>
  lampDial.addEventListener(type, () => (dragging = false))
);

// Keyboard: arrow keys turn the lamp
lampDial.addEventListener("keydown", (e) => {
  const step = { ArrowRight: 15, ArrowDown: 15, ArrowLeft: -15, ArrowUp: -15 }[e.key];
  if (!step) return;
  e.preventDefault();
  setLamp(lampAngle + step);
});

// ---------- Start ----------

setLamp(LAMP_START);

// Phones that don't ask permission (Android) can start following the tilt straight away
if (window.isSecureContext && window.DeviceOrientationEvent &&
    typeof DeviceOrientationEvent.requestPermission !== "function" &&
    matchMedia("(pointer: coarse)").matches) {
  startTilt();
}
