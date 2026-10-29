# Working notes

Notes for whoever picks this prototype up next (a person or a Claude session): how we work on it, where it stands, and what was decided along the way. The code and the commit messages have the details. This file has the background.

Last updated: 29 October 2026.

## How we work

- **One link:** https://amna-uxui.github.io/cc-tapis/ (GitHub Pages, from `main`).
- **Work and commit straight on `main`.** No feature branches unless asked.
- **No `?v=` version numbers, ever.** `index.html` already loads its CSS and JS fresh on every visit (the inline loader appends the time). New scripts go into that loader list.
- **Pushing is done from GitHub Desktop.** After a push, check it reached GitHub (`git ls-remote origin main`) and that the live site has the new code. Pages takes about 1–2 minutes, so a test right after a push can still run old code.
- **Testing on a phone:** use the live site (https, so the microphone works). A local link on the same Wi-Fi (`tools/serve.py`, port 8000) also works, but it's plain http: no microphone. The Mac's address changes with the network. Don't open public tunnels unless asked.
- **Work step by step**, and show screenshots before committing visual changes when asked.

## What's in the prototype

A mobile-first web prototype for a DXD workshop: what if people could interact with carpets digitally, in cc-tapis (Milano) branding. One page (`index.html`) with three collections, switched by swiping (zoomed out) or from the menu:

| Collection | Verb | What you do (zoomed in only) | Files |
|---|---|---|---|
| Hypercode (Roberto Sironi) | To touch | Brush the velvet pile; marks stay | `js/carpet-shapes.js`, `js/carpet-colors.js`, `js/carpet-viewer.js` |
| GrandMa Patterns (Rop van Mierlo) | To blow | Blow on the phone; the pile moves in the wind | `js/carpet-rugs.js`, `js/carpet-blow.js` |
| Ripple Square (Patricia Urquiola) | To paint | Paint bands of leaves; make your own rug | `js/carpet-ripple.js` |

### The journey

1. **First screens** (`js/carpet-intro.js`): cc-tapis + Start, then one permission per screen, each with a short line about what it's for: Sound (Allow plays a brush stroke; Not now keeps the rugs silent), Motion (iPhone only: the lamp follows the tilt), Microphone (blowing).
2. **Zoomed out:** you look and choose. Shapes, colours and rugs change only from the row under the rug. A tap on the rug zooms into its middle. Swiping shows the next collection's rug coming in beside the current one.
3. **Zoomed in:** touch, paint and blow work here only. The verb ("To touch", etc.) shows for 2.5 s when you first zoom in.
4. **Buy** (`js/carpet-cart.js`): the button reads "BUY | € price". The rug rolls up in 3D and flies into the bag. "THANK YOU" (cc-tapis blue, mono capitals, between °~*~° rules) shows on the floor where it lay, and the pink bag opens by itself. The clean rug unrolls when the bag closes.
5. **Check out:** "LONG WAY" / "BUT FOR YOU", then "Your rug is being knotted by hand, / far away in the Himalayas. / We'll let you know when it sets off." (normal letters, broken at its pauses), each rug's name · price, and Back to the rugs. The rug unrolls only after Back to the rugs.

### Behaviour decided on 29 Oct (after consultations)

- Nothing happens on the rug when zoomed out. Touching, painting and blowing work in the close-up only.
- **Hypercode:** marks never fade on their own, and they're kept across shape, colour and collection changes. Only a double-tap (zoomed in) or buying clears them.
- **GrandMa:** once the mic is allowed on the first screens, the rug listens by itself while GrandMa is on, and lets the mic go when you leave. No Blow button, except as "hold to blow" when the mic was refused. Breath moves the whole rug, strongest at its bottom edge and calmer towards the top, plus random puffs climbing up.
- **Ripple:** bands end in clean, square cuts like the real rug. The brush trails the finger slightly (`BRUSH_STRING`), and the ends are straightened (`straightEnds`).
- The LIGHT and BLOW tools have word labels and a soft pulse until first tapped.

## Preferences

- Keep the cc-tapis look: grey bars, mono capitals for labels, pink for the bag and checkout, periwinkle blue (`--color-accent`), °~*~° and .:^:. character rules. The verbs are in light Karbon.
- No paint-like or digital-looking effects on the rugs. Avoid strong outlines, grooves and light-and-shade tricks.
- Centred text shouldn't narrow into an upside-down triangle. Break lines at their natural pauses so they come out even.
- Don't restart the abandoned shared/community rug idea unless asked.

## Open questions

- **Where the rugs are made:** the copy says "the Himalayas". The user mentioned India; as far as we know cc-tapis knots its rugs in Nepal. Confirm before naming a country.
- **Placeholders:** some sizes and prices (Hypercode square and circle, Ripple's 200 × 200 cm price) aren't confirmed. GrandMa shows € 2.900, while cc-tapis.com lists € 3.900.
- **Licences:** Karbon is a trial font, and the brushing sound comes from freesound.org (credit in `js/carpet-sound.js`). Check both before anything goes public.
- **Untested on a real phone:** the latest changes (permission screens, auto-listening, swipe glimpse, checkout) were checked in a desktop browser at phone size only.
