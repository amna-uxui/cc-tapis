/*
  The sound of Ripple Square: laying a band of wool sounds like a stroke of it. As you start a
  stroke, a soft swish plays; drawing on, another every so often, so a long band sounds like
  several strokes and a short one like one. Faster, they come a little sooner and a little
  louder; slower, softer. Lift the finger and nothing more starts (the last one rings out).

  The swishes are seven short strokes cut from one recording (sounds/strokes.m4a, back to back),
  each time a different one, at a very slightly different pitch, so it never sounds the same.

  js/carpet-ripple.js calls rippleSound.begin() as a stroke starts, rippleSound.move(fast) as it
  goes on (fast: 0 slow .. 1 fast) and rippleSound.end() when the finger lifts.

  iPhone only lets sound start inside a tap or a finger lifting, so every touch makes sure the
  sound is set up and running (as js/carpet-sound.js does).
*/

const STROKES_FILE = "sounds/strokes.m4a";
// each stroke in the file: [where it starts, how long it is] (seconds)
const STROKES = [[0, 0.57], [0.67, 0.57], [1.34, 0.63], [2.07, 0.55], [2.72, 0.37], [3.19, 0.41], [3.7, 0.3]];
const STROKE_VOLUME = [0.35, 0.6]; // how loud a swish is: drawn slowly .. fast (0..1; the recording is loud)
const STROKE_EVERY = [0.7, 0.4];   // seconds between swishes while drawing on: slowly .. fast
const STROKE_PITCH = 0.06;         // how much a swish's pitch varies, up or down (share)

const rippleSound = (() => {
  let audio = null;
  let recording = null;
  let last = -1;      // the stroke played last (the next one is another)
  let drawing = false;
  let nextAt = 0;     // when the next swish may start, while drawing on (audio time)

  function setUp() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return false;
    audio = new AudioContext();
    fetch(STROKES_FILE)
      .then((response) => response.arrayBuffer())
      .then((data) => new Promise((done, fail) => audio.decodeAudioData(data, done, fail)))
      .then((buffer) => (recording = buffer))
      .catch(() => {});
    return true;
  }

  // Only on Ripple Square: every touch there makes sure the sound is set up and running
  function unlock() {
    if (document.body.dataset.collection !== "ripple-square") return;
    if (!audio && !setUp()) return;
    if (audio.state !== "running") audio.resume().catch(() => {});
  }
  ["pointerdown", "touchstart", "touchend", "click"].forEach((type) =>
    document.addEventListener(type, unlock, { capture: true, passive: true })
  );

  // One swish: another stroke than the last, at a slightly different pitch
  function swish(fast) {
    if (!recording || audio.state !== "running") return;
    let pick = Math.floor(Math.random() * STROKES.length);
    if (pick === last) pick = (pick + 1) % STROKES.length;
    last = pick;
    const [at, length] = STROKES[pick];
    const source = audio.createBufferSource();
    source.buffer = recording;
    source.playbackRate.value = 1 + (Math.random() * 2 - 1) * STROKE_PITCH;
    const volume = audio.createGain();
    volume.gain.value = STROKE_VOLUME[0] + (STROKE_VOLUME[1] - STROKE_VOLUME[0]) * fast;
    source.connect(volume);
    volume.connect(audio.destination);
    source.start(audio.currentTime, at, length);
    nextAt = audio.currentTime + STROKE_EVERY[0] + (STROKE_EVERY[1] - STROKE_EVERY[0]) * fast;
  }

  function begin() {
    drawing = true;
    if (audio) nextAt = audio.currentTime; // the first swish as soon as the band starts
  }

  function move(fast) {
    if (!drawing || !audio) return;
    if (audio.currentTime >= nextAt) swish(Math.min(1, Math.max(0, fast)));
  }

  function end() {
    drawing = false;
  }

  return { begin, move, end };
})();
