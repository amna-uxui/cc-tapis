/*
  The sound of the wind on GrandMa Patterns: while the rug moves in the wind, a wind made from a
  recording of a breath (sounds/blow.m4a) plays along. It is never the same twice: it's woven from
  short, overlapping pieces of the recording, each from a different moment in it, at a slightly
  different speed, drifting a little left or right. A stronger breath makes it louder, airier and
  quicker; a soft one keeps it low and muffled. When the breath stops it trails off with the pile.

  js/carpet-blow.js calls windSound.start() on a tap or key press (browsers only allow sound after
  one), windSound.start(micSound) once the microphone listens, windSound.follow(strength, seconds)
  every frame, and reads windSound.level() so the microphone doesn't take the rug's own wind for a
  breath.

  iPhone: switching the microphone on interrupts any sound the page had set up before, and leaves
  it silent. So once the microphone listens, the wind plays through the microphone's own sound
  (which is surely running), and a paused sound is nudged back on every frame.
*/

const WIND_FILE = "sounds/blow.m4a";
const WIND_VOLUME = 0.9;      // loudest the wind gets (0..1)
const WIND_BOOST = 10;        // the recording is soft: this much louder
const WIND_PIECE = 1.1;       // seconds each piece of the recording plays
const WIND_EVERY = [0.55, 0.25]; // seconds between new pieces: soft breath .. strong breath
const WIND_SPEED = [0.85, 1.15]; // how fast the pieces play: soft .. strong (faster sounds higher, airier)
const WIND_DULL = 600;        // Hz: a soft breath sounds this muffled ..
const WIND_AIRY = 7000;       // .. a strong one this open
const WIND_RISE = 0.08;       // seconds the wind takes to swell with the breath
const WIND_FALL = 0.7;        // and to trail off after it (with the pile settling back)

const windSound = (() => {
  let ctx = null;
  let master = null;   // the overall volume, following the breath
  let tone = null;     // how muffled or open
  let recording = null;
  let file = null;     // the recording as fetched, kept to unpack again for another sound
  let level = 0;       // the volume now, 0..1
  let untilNext = 0;   // seconds until the next piece
  let pieces = 0;      // how many pieces have played (for ?debug)
  let ownSound = false; // ctx is the wind's own (not the microphone's)

  // Play through `onto` (the microphone's sound), or the wind's own sound made here
  function start(onto) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (ctx && ctx.state !== "closed" && (!onto || onto === ctx)) {
      if (ctx.state !== "running") ctx.resume().catch(() => {});
      return;
    }
    if (ctx && ctx.state !== "closed" && ownSound) ctx.close(); // the wind's own sound isn't needed now
    ownSound = !onto;
    ctx = onto || new AudioContext();
    if (ctx.state !== "running") ctx.resume().catch(() => {});
    tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = WIND_DULL;
    master = ctx.createGain();
    master.gain.value = 0;
    tone.connect(master);
    master.connect(ctx.destination);
    recording = null;
    const using = ctx;
    (file ? Promise.resolve(file) : fetch(WIND_FILE).then((response) => response.arrayBuffer()).then((data) => (file = data)))
      .then((data) => new Promise((done, fail) => using.decodeAudioData(data.slice(0), done, fail)))
      .then((buffer) => {
        if (using === ctx) recording = buffer;
      })
      .catch(() => {});
  }

  // One piece of the recording: from a different moment each time, swelling in and fading out
  function piece(strength) {
    const at = 0.15 + Math.random() * Math.max(0, recording.duration - WIND_PIECE - 0.2);
    const source = ctx.createBufferSource();
    source.buffer = recording;
    source.playbackRate.value = WIND_SPEED[0] + (WIND_SPEED[1] - WIND_SPEED[0]) * strength + (Math.random() - 0.5) * 0.08;
    const swell = ctx.createGain();
    const now = ctx.currentTime;
    swell.gain.setValueAtTime(0, now);
    swell.gain.linearRampToValueAtTime(WIND_BOOST, now + WIND_PIECE * 0.35);
    swell.gain.linearRampToValueAtTime(0, now + WIND_PIECE);
    let out = swell;
    if (ctx.createStereoPanner) {
      const side = ctx.createStereoPanner();
      side.pan.value = (Math.random() - 0.5) * 0.7;
      swell.connect(side);
      out = side;
    }
    source.connect(swell);
    out.connect(tone);
    source.start(now, at, WIND_PIECE + 0.05);
    pieces++;
  }

  // Every frame: the wind's strength now (0..1), and the seconds since the last frame
  function follow(strength, seconds) {
    if (!ctx || !recording) return;
    if (ctx.state !== "running" && strength > 0.02) ctx.resume().catch(() => {}); // paused by the phone: on again
    const ease = strength > level ? WIND_RISE : WIND_FALL;
    level += (strength - level) * Math.min(1, seconds / ease);
    if (level < 0.005) level = 0;
    const now = ctx.currentTime;
    master.gain.setTargetAtTime(level * WIND_VOLUME, now, 0.03);
    tone.frequency.setTargetAtTime(WIND_DULL + (WIND_AIRY - WIND_DULL) * Math.pow(level, 0.7), now, 0.05);

    untilNext -= seconds;
    if (level > 0.02 && untilNext <= 0) {
      piece(level);
      untilNext = WIND_EVERY[0] + (WIND_EVERY[1] - WIND_EVERY[0]) * level;
    }
  }

  // Quiet at once (another collection, or the page hidden)
  function hush() {
    level = 0;
    if (master) master.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
  }

  // For ?debug: is the sound running, loaded, and how much has played
  function state() {
    if (!ctx) return "not started (tap the wind button)";
    return `${ctx.state}, ${recording ? "loaded" : "loading"}, ${pieces} pieces, volume ${level.toFixed(2)}`;
  }

  return { start, follow, hush, state, level: () => level };
})();
