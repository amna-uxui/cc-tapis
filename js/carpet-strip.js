/*
  The endless strip: while the whole rug is in view, the row under it (the shapes on Hypercode,
  the rugs on GrandMa Patterns) is a strip you swipe like a wheel. It never ends: after the last
  item the first comes round again. Let go and it glides, then settles with one item in the middle,
  and that item is shown on the rug above. Tapping an item brings it to the middle too.

  makeStrip(row, items, { draw, choose, start }):
    row:    the element under the rug (it becomes the strip)
    items:  the list to go round
    draw:   item -> the element that shows it (a shape, a small rug)
    choose: called with the item that settles in the middle
    start:  which item is in the middle at first
  It returns { show(index) }: bring that item to the middle without choosing it again.

  On its own (js/carpet-shapes.js and js/carpet-rugs.js use it).
*/

const STRIP_SLOT = 52;       // screen pixels from one item to the next
const STRIP_SIDE = 3;        // items shown either side of the middle one
const STRIP_GROW = 1.3;      // the middle item is this much bigger
const STRIP_GLIDE = 220;     // how far a flick carries the strip (ms of its speed)
const STRIP_SETTLE = 420;    // ms to settle on an item

function makeStrip(row, items, { draw, choose, start = 0 }) {
  const count = items.length;
  const wrap = (i) => ((i % count) + count) % count;

  row.classList.add("strip");
  row.replaceChildren();
  const slots = [];
  for (let k = -STRIP_SIDE - 1; k <= STRIP_SIDE + 1; k++) {
    const slot = document.createElement("button");
    slot.className = "strip__item";
    slot.tabIndex = -1;
    row.append(slot);
    slots.push(slot);
  }

  let pos = start;       // which item is in the middle (in between while it moves)
  let chosen = start;    // the item last shown on the rug
  let settling = null;

  // Place every item along the strip: the middle one biggest, the others smaller and fainter
  // the further out they are; each slot shows whichever item comes round to it
  function layout() {
    const base = Math.round(pos);
    slots.forEach((slot, j) => {
      const at = base + j - STRIP_SIDE - 1;
      const d = at - pos;
      const far = Math.min(Math.abs(d), STRIP_SIDE + 1);
      const grow = 1 + (STRIP_GROW - 1) * Math.max(0, 1 - far);
      slot.style.transform = `translateX(${d * STRIP_SLOT}px) scale(${grow * (1 - far * 0.08)})`;
      slot.style.opacity = Math.max(0, 1 - far / (STRIP_SIDE + 1));
      const index = wrap(at);
      if (slot.dataset.index !== String(index)) {
        slot.dataset.index = index;
        slot.setAttribute("aria-label", items[index].name);
        slot.replaceChildren(draw(items[index]));
      }
      slot.classList.toggle("is-middle", Math.abs(d) < 0.5);
    });
  }

  // Glide to a whole item, easing out, then show it on the rug
  function settle(target, andChoose = true) {
    if (settling) cancelAnimationFrame(settling);
    const from = pos;
    const begin = performance.now();
    function step(now) {
      const t = Math.min((now - begin) / STRIP_SETTLE, 1);
      pos = from + (target - from) * (1 - Math.pow(1 - t, 3));
      layout();
      if (t < 1) {
        settling = requestAnimationFrame(step);
        return;
      }
      settling = null;
      pos = target;
      if (andChoose && wrap(target) !== chosen) {
        chosen = wrap(target);
        choose(items[chosen]);
      }
    }
    settling = requestAnimationFrame(step);
  }

  // ---------- Swiping ----------

  let drag = null;

  row.addEventListener("pointerdown", (e) => {
    if (settling) cancelAnimationFrame(settling);
    settling = null;
    row.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, pos, last: e.clientX, time: performance.now(), speed: 0, moved: false };
  });

  row.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const now = performance.now();
    drag.speed = (e.clientX - drag.last) / Math.max(now - drag.time, 1);
    drag.last = e.clientX;
    drag.time = now;
    if (Math.abs(e.clientX - drag.x) > 4) drag.moved = true;
    pos = drag.pos - (e.clientX - drag.x) / STRIP_SLOT;
    layout();
  });

  function release(e) {
    if (!drag) return;
    const { moved, speed, time } = drag;
    drag = null;
    if (!moved) {
      // a tap: bring the tapped item to the middle
      const slot = e.target.closest(".strip__item");
      const offset = slot ? slots.indexOf(slot) - STRIP_SIDE - 1 : 0;
      settle(Math.round(pos) + offset);
      return;
    }
    const flick = performance.now() - time < 80 ? speed : 0;
    settle(Math.round(pos - (flick * STRIP_GLIDE) / STRIP_SLOT));
  }

  row.addEventListener("pointerup", release);
  row.addEventListener("pointercancel", release);

  layout();
  return {
    show(index) {
      chosen = index;
      // the nearest way round to it
      const ahead = wrap(index - Math.round(pos));
      settle(Math.round(pos) + (ahead > count / 2 ? ahead - count : ahead), false);
    },
  };
}
