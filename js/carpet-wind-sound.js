/*
  The sound of the wind on GrandMa Patterns: the rug answers your breath. While you blow it stays
  quiet; when you stop, one short, soft rustle of carpet fibres plays (sounds/fibres.m4a, a
  recording of three soft swells: each answer is one of them, in turn, cut short and faded), a
  little louder after a strong or long blow, softer after a puff, and gone in about a second and
  a half.

  js/carpet-blow.js calls windSound.start() on a tap or key press (browsers only allow sound after
  one), windSound.start(micSound) once the microphone listens, windSound.follow(strength, seconds)
  every frame, and reads windSound.level() so the microphone doesn't take the rug's own rustle for
  a breath (it never moves the rug).

  iPhone: switching the microphone on interrupts any sound the page had set up before, and leaves
  it silent. So once the microphone listens, the sound plays through the microphone's own sound
  (which is surely running), and a paused sound is nudged back on every frame.
*/

const WIND_FILE = "sounds/fibres.m4a";
const WIND_SWELLS = [1.6, 6.3, 10.9]; // seconds into the recording where each swell is at its fullest
const WIND_PLAYS = 1.4;       // seconds of it that play: short
const WIND_IN = 0.12;         // seconds it takes to come in ..
const WIND_OUT = 0.8;         // .. and to fade away at the end
const WIND_VOLUME = 0.5;      // loudest it gets (0..1): soft
const WIND_LONG = 1.2;        // seconds of blowing for the fullest answer (a shorter puff answers softer)

const windSound = (() => {
  let ctx = null;
  let master = null;
  let recording = null;
  let file = null;     // the recording as fetched, kept to unpack again for another sound
  let gathered = 0;    // how hard the breath now blowing has been, at most
  let blownFor = 0;    // and how long it has gone on
  let next = 0;        // which swell answers next
  let playing = null;  // { start (ctx time), volume } while an answer plays
  let answers = 0;     // how many have played (for ?debug)
  let ownSound = false; // ctx is the sound's own (not the microphone's)

  // Play through `onto` (the microphone's sound), or the sound's own, made here
  function start(onto) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (ctx && ctx.state !== "closed" && (!onto || onto === ctx)) {
      if (ctx.state !== "running") ctx.resume().catch(() => {});
      return;
    }
    if (ctx && ctx.state !== "closed" && ownSound) ctx.close(); // its own sound isn't needed now
    ownSound = !onto;
    ctx = onto || new AudioContext();
    if (ctx.state !== "running") ctx.resume().catch(() => {});
    master = ctx.createGain();
    master.gain.value = 1;
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

  // One answer: a swell of the recording, coming in softly and fading away, cut short
  function answer(volume) {
    const at = WIND_SWELLS[next] - WIND_PLAYS / 2;
    next = (next + 1) % WIND_SWELLS.length;
    const source = ctx.createBufferSource();
    source.buffer = recording;
    const fade = ctx.createGain();
    const now = ctx.currentTime;
    fade.gain.setValueAtTime(0, now);
    fade.gain.linearRampToValueAtTime(volume, now + WIND_IN);
    fade.gain.setValueAtTime(volume, now + WIND_PLAYS - WIND_OUT);
    fade.gain.linearRampToValueAtTime(0, now + WIND_PLAYS);
    source.connect(fade);
    fade.connect(master);
    source.start(now, Math.max(0, at), WIND_PLAYS);
    playing = { start: now, volume };
    answers++;
  }

  // Every frame: the breath now (0..1), and the seconds since the last frame. While it blows,
  // nothing plays; when it stops, one short answer
  function follow(strength, seconds) {
    if (!ctx || !recording) return;
    if (ctx.state !== "running" && strength > 0.02) ctx.resume().catch(() => {}); // paused by the phone: on again
    if (strength > 0.06) {
      gathered = Math.max(gathered, strength);
      blownFor += seconds;
    } else if (gathered > 0) {
      if (soundOn) answer(WIND_VOLUME * Math.min(1, gathered * (0.45 + 0.55 * Math.min(1, blownFor / WIND_LONG))));
      gathered = 0;
      blownFor = 0;
    }
  }

  // How loud the answer is now, 0..1 (the microphone allows for it)
  function level() {
    if (!playing || !ctx) return 0;
    const t = ctx.currentTime - playing.start;
    if (t >= WIND_PLAYS) {
      playing = null;
      return 0;
    }
    const shape = t < WIND_IN ? t / WIND_IN : t > WIND_PLAYS - WIND_OUT ? (WIND_PLAYS - t) / WIND_OUT : 1;
    return (playing.volume / WIND_VOLUME) * shape;
  }

  // Quiet at once (another collection, or the page hidden)
  function hush() {
    gathered = 0;
    blownFor = 0;
    playing = null;
    if (master) master.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    if (master) master.gain.setTargetAtTime(1, ctx.currentTime + 0.3, 0.05);
  }

  // For ?debug: is the sound running, loaded, and how much has played
  function state() {
    if (!ctx) return "not started (tap the wind button)";
    return `${ctx.state}, ${recording ? "loaded" : "loading"}, ${answers} answers, volume ${level().toFixed(2)}`;
  }

  return { start, follow, hush, state, level };
})();
