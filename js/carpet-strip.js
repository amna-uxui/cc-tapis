/*
  The row under the whole rug: the collection's own choices side by side, Hypercode's shapes or
  GrandMa Patterns' rugs. Tap one to show it on the rug; the one on show sits in a light grey
  rounded frame.

  makeStrip(row, items, { draw, choose, start }):
    row:    the element under the rug (making a new row in it replaces the old one)
    items:  the choices
    draw:   item -> the element that shows it (a shape, a small rug)
    choose: called with the item tapped
    start:  which item is on show at first
  It returns { show(index) }: mark that item as on show without choosing it again.

  On its own (js/carpet-shapes.js and js/carpet-rugs.js use it).
*/

function makeStrip(row, items, { draw, choose, start = 0 }) {
  row.classList.add("strip");
  const options = items.map((item, index) => {
    const option = document.createElement("button");
    option.className = "strip__item";
    option.setAttribute("aria-label", item.name);
    option.append(draw(item));
    option.addEventListener("click", () => {
      mark(index);
      choose(item);
    });
    return option;
  });
  row.replaceChildren(...options);

  function mark(index) {
    options.forEach((option, i) => option.setAttribute("aria-pressed", i === index));
  }

  mark(start);
  return { show: mark };
}
