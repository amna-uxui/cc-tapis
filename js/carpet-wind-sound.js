/*
  The sound of the wind on GrandMa Patterns: the rug answers your breath. While you blow it stays
  quiet, and when you stop, a wind made from a recording of a breath (sounds/blow.m4a) plays out as
  the pile settles: louder and airier after a strong or long blow, softer after a little puff,
  fading away over a couple of seconds. It is never the same twice: it's woven from short,
  overlapping pieces of the recording, each from a different moment in it, at a slightly different
  speed, drifting a little left or right.

  js/carpet-blow.js calls windSound.start() on a tap or key press (browsers only allow sound after
  one), windSound.start(micSound) once the microphone listens, windSound.follow(strength, seconds)
  every frame, and reads windSound.level() so the microphone doesn't take the rug's own wind for a
  breath.

  iPhone: switching the microphone on interrupts any sound the page had set up before, and leaves
  it silent. So once the microphone listens, the wind plays through the microphone's own sound
  (which is surely running), and a paused sound is nudged back on every frame.
*/

const WIND_FILE = "sounds/blow.m4a";
const WIND_VOLUME = 1;        // loudest the wind gets (0..1)
const WIND_BOOST = 26;        // the recording is soft: this much louder (a limiter keeps it clean)
const WIND_PIECE = 1.1;       // seconds each piece of the recording plays
const WIND_EVERY = [0.55, 0.25]; // seconds between new pieces: soft breath .. strong breath
const WIND_SPEED = [0.85, 1.15]; // how fast the pieces play: soft .. strong (faster sounds higher, airier)
const WIND_DULL = 1200;       // Hz: after a soft breath it sounds this muffled ..
const WIND_AIRY = 9000;       // .. after a strong one this open
const WIND_SWELL = 0.12;      // seconds the wind takes to swell once the breath stops
const WIND_TAIL = 1.1;        // seconds for it to fall to a third (fading out with the pile settling)
const WIND_LONG = 1.2;        // seconds of blowing for the fullest answer (a shorter puff answers softer)

const windSound = (() => {
  let ctx = null;
  let master = null;   // the overall volume, following the breath
  let tone = null;     // how muffled or open
  let recording = null;
  let file = null;     // the recording as fetched, kept to unpack again for another sound
  let level = 0;       // the volume now, 0..1
  let untilNext = 0;   // seconds until the next piece
  let pieces = 0;      // how many pieces have played (for ?debug)
  let gathered = 0;    // how hard the breath now blowing has been, at most
  let blownFor = 0;    // and how long it has gone on
  let answer = 0;      // how loud the wind sets out after the breath
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
    // a gentle limiter: loud without breaking up
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -14;
    limit.knee.value = 8;
    limit.ratio.value = 6;
    limit.attack.value = 0.005;
    limit.release.value = 0.2;
    tone.connect(master);
    master.connect(limit);
    limit.connect(ctx.destination);
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

  // Every frame: the breath now (0..1), and the seconds since the last frame. While it blows, the
  // wind only gathers; when it stops, the wind answers and fades out.
  function follow(strength, seconds) {
    if (!ctx || !recording) return;
    if (ctx.state !== "running" && strength > 0.02) ctx.resume().catch(() => {}); // paused by the phone: on again
    if (strength > 0.06) {
      gathered = Math.max(gathered, strength);
      blownFor += seconds;
    } else if (gathered > 0) {
      answer = Math.min(1, gathered * (0.45 + 0.55 * Math.min(1, blownFor / WIND_LONG)));
      gathered = 0;
      blownFor = 0;
    }
    if (answer > level) level += (answer - level) * Math.min(1, seconds / WIND_SWELL);
    else level *= Math.exp(-seconds / WIND_TAIL);
    if (level >= answer * 0.98) answer = 0; // swelled up: from here it fades
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
    answer = 0;
    gathered = 0;
    blownFor = 0;
    if (master) master.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
  }

  // For ?debug: is the sound running, loaded, and how much has played
  function state() {
    if (!ctx) return "not started (tap the wind button)";
    return `${ctx.state}, ${recording ? "loaded" : "loading"}, ${pieces} pieces, volume ${level.toFixed(2)}`;
  }

  return { start, follow, hush, state, level: () => level };
})();
