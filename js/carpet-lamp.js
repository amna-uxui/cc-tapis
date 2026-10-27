/*
  The lamp: while zoomed out, a small dial sits left of the collection name, with the lamp as
  a dot on its ring, and the light on the rug follows it: bright on the lamp's side, shadow on
  the far side, so you see how the velvet catches the light.

  On its own the lamp slowly circles the rug, so nothing has to be switched on. Tap the dial to
  steer it by tilting the phone instead (iPhone asks for permission then, and only then).
  Phones only share their motion with secure (https) pages; where there is no motion
  (a computer, or http), drag the lamp round the dial.

  Needs js/carpet-viewer.js (carpet) to be loaded first.
*/

const LAMP_START = -135;   // degrees: where the lamp starts (0 = right, -90 = top, -135 = top left)
const LAMP_REACH = 0.75;   // how far out the light sits, from the rug's middle (0.5 = on its edge)
const TILT_MIN = 4;        // degrees of tilt before the lamp moves (so holding still keeps it still)
const TILT_FOLLOW = 0.15;  // how quickly the lamp follows the tilt (lower = smoother, lazier)
const ORBIT_SPEED = 12;    // degrees per second the lamp circles on its own (until tilt takes over)
const ORBIT_RESUME = 3000; // ms after you let go of a dragged lamp before it circles again

const lampDial = document.querySelector("[data-lamp]");
const light = carpet.querySelector(".carpet__light");
const lampStatus = lampDial.querySelector("[data-lamp-status]");

let lampAngle = LAMP_START;

function setLamp(degrees) {
  lampAngle = ((degrees % 360) + 360) % 360;
  const radians = (lampAngle * Math.PI) / 180;
  lampDial.style.setProperty("--lamp-angle", `${lampAngle}deg`);
  lampDial.setAttribute("aria-valuenow", Math.round(lampAngle));
  light.style.setProperty("--light-x", `${(0.5 + Math.cos(radians) * LAMP_REACH) * 100}%`);
  light.style.setProperty("--light-y", `${(0.5 + Math.sin(radians) * LAMP_REACH) * 100}%`);
  if (typeof relightPile === "function") relightPile(); // velvet marks catch the light (js/carpet-viewer.js)
}

// ---------- Tilting the phone ----------

let tilting = false;  // motion is on
let level = null;     // how the phone was held when motion started: that counts as "no tilt"
let aim = lampAngle;  // where the tilt points the lamp; the lamp eases towards it
let easing = null;

// A short word under the dial for a moment, saying whether the tilt is working
let statusTimer = null;
function showStatus(text) {
  lampStatus.textContent = text;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => (lampStatus.textContent = ""), 2500);
}

function onTilt(e) {
  if (e.beta === null || e.gamma === null) return;
  if (!level) {
    level = { beta: e.beta, gamma: e.gamma };
    if (waitingForMotion) showStatus("Tilt the rug");
    waitingForMotion = false;
  }

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

let waitingForMotion = false; // asked for motion after a tap: say so when it arrives (or doesn't)

function startTilt() {
  if (tilting) return;
  tilting = true;
  level = null;
  lampDial.classList.add("is-tilting");
  window.addEventListener("deviceorientation", onTilt);
}

// iPhone asks for permission, and only after a tap; other phones just send the motion
function askForTilt() {
  if (tilting) return;
  if (!window.DeviceOrientationEvent || !window.isSecureContext) {
    showStatus("No motion");
    return;
  }
  waitingForMotion = true;
  // if no motion arrives soon, the phone isn't sending any
  setTimeout(() => waitingForMotion && !level && showStatus("No motion"), 1500);

  if (typeof DeviceOrientationEvent.requestPermission === "function") {
    DeviceOrientationEvent.requestPermission()
      .then((answer) => {
        if (answer === "granted") startTilt();
        else {
          waitingForMotion = false;
          showStatus("Not allowed");
        }
      })
      .catch(() => {
        waitingForMotion = false;
        showStatus("Not allowed");
      });
  } else {
    startTilt();
  }
}

// ---------- Circling on its own ----------

let orbitPausedUntil = 0;
let lastFrame = performance.now();

// While zoomed out, and nothing else is steering it, the lamp drifts slowly round the rug
function orbit(now) {
  const seconds = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;
  const free = !tilting && !dragging && now > orbitPausedUntil;
  if (free && document.body.classList.contains("is-zoomed-out")) {
    setLamp(lampAngle + ORBIT_SPEED * seconds);
  }
  if (!tilting) requestAnimationFrame(orbit); // once tilt steers the lamp, circling stops for good
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

// iPhone only accepts the permission request on a finished tap (a click), not on touch-down
lampDial.addEventListener("click", askForTilt);

lampDial.addEventListener("pointerdown", (e) => {
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
  lampDial.addEventListener(type, () => {
    if (dragging) orbitPausedUntil = performance.now() + ORBIT_RESUME;
    dragging = false;
  })
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
requestAnimationFrame(orbit);

// Phones that don't ask permission (Android) can start following the tilt straight away
if (window.isSecureContext && window.DeviceOrientationEvent &&
    typeof DeviceOrientationEvent.requestPermission !== "function" &&
    matchMedia("(pointer: coarse)").matches) {
  startTilt();
}
