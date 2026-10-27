/*
  The lamp: while zoomed out, a small dial sits left of the collection name. Drag the lamp
  round the dial (or tap the ring) and the light moves round the rug in the same direction:
  bright on the lamp's side, shadow on the far side, so you see how the velvet catches the light.

  Needs js/carpet-viewer.js (carpet) to be loaded first.
*/

const LAMP_START = -135;  // degrees: where the lamp starts (0 = right, -90 = top, -135 = top left)
const LAMP_REACH = 0.75;  // how far out the light sits, from the rug's middle (0.5 = on its edge)

const lampDial = document.querySelector("[data-lamp]");
const light = carpet.querySelector(".carpet__light");

function setLamp(degrees) {
  const angle = ((degrees % 360) + 360) % 360;
  const radians = (angle * Math.PI) / 180;
  lampDial.style.setProperty("--lamp-angle", `${angle}deg`);
  lampDial.setAttribute("aria-valuenow", Math.round(angle));
  light.style.setProperty("--light-x", `${(0.5 + Math.cos(radians) * LAMP_REACH) * 100}%`);
  light.style.setProperty("--light-y", `${(0.5 + Math.sin(radians) * LAMP_REACH) * 100}%`);
}

// The angle from the dial's middle to the finger
function angleTo(e) {
  const box = lampDial.getBoundingClientRect();
  const x = e.clientX - (box.left + box.width / 2);
  const y = e.clientY - (box.top + box.height / 2);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

let turning = false;

lampDial.addEventListener("pointerdown", (e) => {
  turning = true;
  lampDial.setPointerCapture(e.pointerId);
  setLamp(angleTo(e));
});

lampDial.addEventListener("pointermove", (e) => {
  if (turning) setLamp(angleTo(e));
});

["pointerup", "pointercancel"].forEach((type) =>
  lampDial.addEventListener(type, () => (turning = false))
);

// Keyboard: arrow keys turn the lamp
lampDial.addEventListener("keydown", (e) => {
  const step = { ArrowRight: 15, ArrowDown: 15, ArrowLeft: -15, ArrowUp: -15 }[e.key];
  if (!step) return;
  e.preventDefault();
  setLamp(Number(lampDial.getAttribute("aria-valuenow")) + step);
});

setLamp(LAMP_START);
