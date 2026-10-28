# cc-tapis

DXD Workshop with parcstudio.

## What if people could interact with carpets digitally?

Mobile-first prototype in the look and feel of cc-tapis (Milano). One screen, no scroll: a rug in the middle, and one interaction per collection. Zoomed out, swipe on the white around the rug to slide to the next collection (or use the menu, top left); the row under the rug shows its shapes or rugs.

Live: https://amna-uxui.github.io/cc-tapis/

- **Hypercode** by Roberto Sironi: to touch, brush the velvet pile with your finger. Under the rug, two tabs (Shape | Colour) switch one row between its shapes and its colours, each a small picture of the real rug (the colours with their names).
- **GrandMa Patterns** by Rop van Mierlo (`#grandma-patterns`): to blow, tap the wind button (top left, where Hypercode has its lamp; a ring round it breathes while it listens) and blow on the bottom of the phone. Add `?debug` to see what the microphone hears.
- **Ripple Square** by Patricia Urquiola (`#ripple-square`): to paint, make your own rug: start from a blank 200 × 200 cm canvas, with the real rug's outline as a very faint hairline and one ripple along its top edge, and draw more with a brush made like the real rug's bands: tall, whole ovals side by side on their ground, the ground showing as narrow V's between them, until the next band covers one half of them, in its four colourways; the faster you draw, the broader the ovals. Picking another colourway turns the whole rug into it. The strokes look like carpet, not paint: thick pile with barely visible carved grooves, the real rug's wool texture (made from its photo by `tools/ripple-pile.py`), pile rows, fibrous edges and a soft shadow on the floor.

## Run it

```bash
python3 tools/serve.py
```

Then open http://localhost:8000 (use the browser's phone view). The microphone only works on https, so test blowing on the live site.

## Files

- `index.html`: the one page, with both collections (`blow.html` just forwards old links to GrandMa Patterns)
- `css/tokens.css`: design language (colours, fonts, sizes, spacing)
- `css/main.css`: layout of both screens
- `js/carpet-viewer.js`: zoom and move around the rug, brushing the pile
- `js/carpet-colors.js`, `js/carpet-shapes.js`, `js/carpet-lamp.js`, `js/carpet-sound.js`: Hypercode's colours, shapes, lamp and brushing sound
- `js/carpet-blow.js`, `js/carpet-rugs.js`, `js/carpet-wind-sound.js`: GrandMa Patterns' blowing, its rugs and the wind's sound
- `js/carpet-ripple.js`: Ripple Square's canvas and leaf brush
- `js/carpet-info.js`: about this rug: `[+]` (bottom right, zoomed out) slides a simple page up from the bottom, in the grey of the top bar with the whole rug cut out (images/sheet/, tools/cut-out-rug.py --on e6e6e6), and its description, product details and customisation (from cc-tapis.com)
- `js/carpet-collections.js`: going from one collection to the next (only the rug slides)
- `js/carpet-menu.js`: the collections menu
- `js/carpet-strip.js`: the row under the rug
- `js/carpet-save.js`: save your rug as an image
- `images/`: the rugs, cut out of their product photos with `tools/cut-out-rug.py`
