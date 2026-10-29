/*
  The lamp: while zoomed out, a small dial sits left of the collection name, with the lamp as
  a dot on its ring, and the light on the rug follows it: bright on the lamp's side, shadow on
  the far side, so you see how the velvet catches the light.

  On its own the lamp slowly circles the rug, so nothing has to be switched on. Tap the dial to
  switch the light in the room (Evening, Daylight, Night); the first tap also lets you steer the
  lamp by tilting the phone (iPhone asks for permission then, and only then).
  Phones only share their motion with secure (https) pages; where there is no motion
  (a computer, or http), drag the lamp round the dial.

  Needs js/carpet-viewer.js (carpet) to be loaded first.
*/

const LAMP_START = -135;   // degrees: where the lamp starts (0 = right, -90 = top, -135 = top left)
const LAMP_REACH = 0.75;   // how far out the light sits, from the rug's middle (0.5 = on its edge)
const SPOT_REACH = 0.22;   // the night spotlight: on the rug, this far from its middle towards the lamp
const TILT_START = 0.08;   // how clearly the phone must tip before the lamp moves (0.08 = about 5 degrees)
const TILT_CALM = 0.12;    // how much each motion reading counts (lower = calmer, ignores trembling hands)
const TILT_FOLLOW = 0.1;   // how quickly the lamp glides round to where the tilt points (lower = smoother)
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
  // the night spotlight falls on the rug itself, part way out towards the lamp
  light.style.setProperty("--spot-x", `${(0.5 + Math.cos(radians) * SPOT_REACH) * 100}%`);
  light.style.setProperty("--spot-y", `${(0.5 + Math.sin(radians) * SPOT_REACH) * 100}%`);
  if (typeof relightPile === "function") relightPile(); // velvet marks catch the light (js/carpet-viewer.js)
}

// ---------- Tilting the phone ----------

let tilting = false;  // motion is on
let level = null;     // which way was "down" when motion started: that counts as "no tilt"
let tilt = { x: 0, y: 0 }; // how the phone is tipped from there, calmed down (see onTilt)
let steering = false;      // the tilt is clear enough to steer the lamp
let aim = lampAngle;  // where the tilt points the lamp; the lamp eases towards it
let easing = null;

// A short word under the dial for a moment, saying whether the tilt is working
let statusTimer = null;
function showStatus(text) {
  lampStatus.textContent = text;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => (lampStatus.textContent = ""), 2500);
}

// Which way is "downhill" across the screen, from the phone's angles: x to the right, y down the
// screen (worked out from gravity, so it behaves the same however upright you hold the phone)
function downhill(beta, gamma) {
  const b = (beta * Math.PI) / 180;
  const g = (gamma * Math.PI) / 180;
  return { x: Math.sin(g) * Math.cos(b), y: Math.sin(b) };
}

function onTilt(e) {
  if (e.beta === null || e.gamma === null) return;
  const now = downhill(e.beta, e.gamma);
  if (!level) {
    level = now;
    tilt = { x: 0, y: 0 };
    steering = false;
    if (waitingForMotion) showStatus("Tilt the rug");
    waitingForMotion = false;
  }

  // calm the readings down: follow the phone's movement, not every tremble of the hand
  tilt = {
    x: tilt.x + (now.x - level.x - tilt.x) * TILT_CALM,
    y: tilt.y + (now.y - level.y - tilt.y) * TILT_CALM,
  };

  // only steer once the phone is clearly tipped, and keep steering until it's clearly level again
  const amount = Math.hypot(tilt.x, tilt.y);
  if (amount > TILT_START) steering = true;
  else if (amount < TILT_START / 2) steering = false;
  if (!steering) return;

  // The lamp goes the way the phone tips: tip the right side down, the lamp moves right
  aim = (Math.atan2(tilt.y, tilt.x) * 180) / Math.PI;
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
function askForTilt(quiet = false) {
  if (tilting) return;
  if (!window.DeviceOrientationEvent || !window.isSecureContext) {
    if (!quiet) showStatus("No motion");
    return;
  }
  waitingForMotion = true;
  // if no motion arrives soon, the phone isn't sending any
  setTimeout(() => waitingForMotion && !level && !quiet && showStatus("No motion"), 1500);

  if (typeof DeviceOrientationEvent.requestPermission === "function") {
    DeviceOrientationEvent.requestPermission()
      .then((answer) => {
        if (answer === "granted") startTilt();
        else {
          waitingForMotion = false;
          if (!quiet) showStatus("Not allowed");
        }
      })
      .catch(() => {
        waitingForMotion = false;
        if (!quiet) showStatus("Not allowed");
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

// ---------- Lighting moods ----------

// Tap the lamp to switch the light in the room; its icon inside the lamp's ring changes with it
// (the looks are in css/main.css: .mood-daylight, .mood-night; Evening is the plain look)
const MOODS = ["Evening", "Daylight", "Night"];
let mood = 0;

function nextMood() {
  document.body.classList.remove(`mood-${MOODS[mood].toLowerCase()}`);
  mood = (mood + 1) % MOODS.length;
  document.body.classList.add(`mood-${MOODS[mood].toLowerCase()}`);
  lampDial.setAttribute("aria-label", `Lamp, ${MOODS[mood]} light: tap to change`);
}

// ---------- The dial: tap to switch the mood, drag to move the lamp ----------

let dragging = false; // the finger is down on the dial
let dragged = false;  // ... and has moved: it's a drag, not a tap
let downAt = null;

// A finished tap (a click): switch the mood. iPhone also only accepts the motion permission
// request here, so the first tap asks for it too
lampDial.addEventListener("click", () => {
  lampDial.classList.remove("is-inviting"); // found it: it stops calling
  if (dragged) return;
  nextMood();
  askForTilt(true);
});

lampDial.addEventListener("pointerdown", (e) => {
  dragged = false;
  if (tilting) {
    level = null; // tapping the dial while tilting: how the phone is held now counts as level
    return;
  }
  dragging = true;
  downAt = { x: e.clientX, y: e.clientY };
  lampDial.setPointerCapture(e.pointerId);
});

lampDial.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  if (!dragged && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 4) dragged = true;
  if (dragged) setLamp(angleTo(e));
});

["pointerup", "pointercancel"].forEach((type) =>
  lampDial.addEventListener(type, () => {
    if (dragged) orbitPausedUntil = performance.now() + ORBIT_RESUME;
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
