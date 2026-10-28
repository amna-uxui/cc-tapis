# cc-tapis

DXD Workshop with parcstudio.

## What if people could interact with carpets digitally?

Mobile-first prototype in the look and feel of cc-tapis (Milano). One screen, no scroll: a rug in the middle, and one interaction per collection. Zoomed out, swipe on the white around the rug to slide to the next collection (or use the menu, top left); the row under the rug shows its shapes or rugs.

Live: https://amna-uxui.github.io/cc-tapis/

- **Hypercode** by Roberto Sironi: to touch, brush the velvet pile with your finger.
- **GrandMa Patterns** by Rop van Mierlo (`#grandma-patterns`): to blow, tap the wind button and blow on the bottom of the phone. Add `?debug` to see what the microphone hears.
- **Ripple Square** by Patricia Urquiola (`#ripple-square`): to paint, make your own rug: start from a blank 200 × 200 cm canvas with one ripple and draw more with a brush made of Ripple's leaves, in its four colourways.

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
- `js/carpet-collections.js`: going from one collection to the next (only the rug slides)
- `js/carpet-menu.js`: the collections menu
- `js/carpet-strip.js`: the row under the rug
- `js/carpet-save.js`: save your rug as an image
- `images/`: the rugs, cut out of their product photos with `tools/cut-out-rug.py`
