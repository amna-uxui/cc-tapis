# cc-tapis

DXD Workshop with parcstudio.

## What if people could interact with carpets digitally?

Mobile-first prototype in the look and feel of cc-tapis (Milano). One screen, no scroll: a rug in the middle, and one interaction per collection. The menu (top left) switches collections.

Live: https://amna-uxui.github.io/cc-tapis/

- **Hypercode** by Roberto Sironi (`index.html`): to draw, brush the velvet pile with your finger.
- **GrandMa Patterns** by Rop van Mierlo (`blow.html`): to blow, tap the wind button and blow on the bottom of the phone. Add `?debug` to see what the microphone hears.

## Run it

```bash
python3 tools/serve.py
```

Then open http://localhost:8000 (use the browser's phone view). The microphone only works on https, so test blowing on the live site.

## Files

- `index.html`, `blow.html`: the two collections
- `css/tokens.css`: design language (colours, fonts, sizes, spacing)
- `css/main.css`: layout of both screens
- `js/carpet-viewer.js`: zoom and move around the rug, brushing the pile
- `js/carpet-colors.js`, `js/carpet-shapes.js`, `js/carpet-lamp.js`, `js/carpet-sound.js`: Hypercode's colours, shapes, lamp and brushing sound
- `js/carpet-blow.js`, `js/carpet-rugs.js`: GrandMa Patterns' blowing and its rugs
- `js/carpet-menu.js`: the collections menu
- `js/carpet-save.js`: save your rug as an image
- `images/`: the rugs, cut out of their product photos with `tools/cut-out-rug.py`
