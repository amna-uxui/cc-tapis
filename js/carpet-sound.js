/*
  Brushing sound: a recording of a brush on carpet (sounds/brush.m4a), looped while you draw.
  It is louder, and plays a little faster, the faster the finger moves, and fades away when
  the finger stops or lifts.

  Recording: "Scrubing carpet with brush" by berdusmith, freesound.org (sound 335398).

  js/carpet-viewer.js calls brushSound.move(speed) while drawing and brushSound.stop() after;
  js/carpet-shapes.js calls brushSound.prepare() when Hypercode comes on, so the recording is
  loaded before the first stroke. It's the page's one sound (brushSound.context(): Ripple
  Square's plays through it too), so a single touch lets it play for the whole visit.
  iPhone: a finger touching down doesn't count as permission for sound, only lifting it (or a
  tap), so on each visit the very first stroke may be silent; from the first lift on, it plays.
*/

const SOUND_FILE = "sounds/brush.m4a";
const SOUND_VOLUME = 0.8;      // loudest the brushing gets (0..1)
const SOUND_FULL_SPEED = 1.5;  // finger speed (screen px per ms) that gives the full volume
const SOUND_FADE = 0.08;       // seconds the sound takes to follow the finger (higher = softer changes)

let soundOn = true; // "Not now" to sound on the first screens (js/carpet-intro.js): the rugs stay silent

const brushSound = (() => {
  let audio = null;
  let gain = null;
  let player = null;
  let idle = null; // fades out when the finger rests without moving
  let keepAwake = null; // a silent looping <audio>, see unlock()

  // A quarter second of silence, as a tiny WAV file
  function silence() {
    const samples = 2000;
    const bytes = new Uint8Array(44 + samples);
    const view = new DataView(bytes.buffer);
    const text = (at, str) => [...str].forEach((c, i) => (bytes[at + i] = c.charCodeAt(0)));
    text(0, "RIFF"); view.setUint32(4, 36 + samples, true); text(8, "WAVE");
    text(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, 8000, true); view.setUint32(28, 8000, true); view.setUint16(32, 1, true); view.setUint16(34, 8, true);
    text(36, "data"); view.setUint32(40, samples, true);
    bytes.fill(128, 44); // 8-bit silence
    return URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
  }

  // Set up on the first touch (browsers only allow sound after one)
  function setUp() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return false;

    // iPhone: play like media, so the silent switch doesn't mute it (newer iOS)
    if (navigator.audioSession) navigator.audioSession.type = "playback";

    audio = new AudioContext();
    gain = audio.createGain();
    gain.gain.value = 0;
    gain.connect(audio.destination);

    // Load the recording and keep it looping silently; moving the finger turns it up
    fetch(SOUND_FILE)
      .then((response) => response.arrayBuffer())
      .then((data) => new Promise((done, fail) => audio.decodeAudioData(data, done, fail)))
      .then((buffer) => {
        player = audio.createBufferSource();
        player.buffer = buffer;
        player.loop = true;
        player.connect(gain);
        player.start();
      });
    return true;
  }

  // Ready the sound and load the recording (it starts paused until a touch lets it play)
  function prepare() {
    if (!audio) setUp();
  }

  // iPhone only lets sound start inside a tap or a finger lifting, not while a finger moves,
  // so every touch makes sure the sound is set up and running.
  // iPhone also mutes web sound when the silent switch is on, unless a normal <audio> player is
  // playing: so a silent one loops quietly in the background to keep the sound on.
  function unlock() {
    if (!keepAwake) {
      keepAwake = new Audio(silence());
      keepAwake.loop = true;
      keepAwake.setAttribute("playsinline", "");
    }
    if (keepAwake.paused) keepAwake.play().catch(() => {});

    if (!audio && !setUp()) return;
    if (audio.state !== "running") audio.resume();
    const blip = audio.createBufferSource(); // a silent blip, played from inside the touch
    blip.buffer = audio.createBuffer(1, 1, audio.sampleRate);
    blip.connect(audio.destination);
    blip.start();
  }

  ["pointerdown", "touchstart", "touchend", "click"].forEach((type) =>
    document.addEventListener(type, unlock, { capture: true, passive: true })
  );

  function move(speed) {
    if (!soundOn || !player || audio.state !== "running") return;
    const amount = Math.min(speed / SOUND_FULL_SPEED, 1);
    const now = audio.currentTime;
    gain.gain.setTargetAtTime(SOUND_VOLUME * amount, now, SOUND_FADE);
    player.playbackRate.setTargetAtTime(0.85 + 0.3 * amount, now, SOUND_FADE);
    clearTimeout(idle);
    idle = setTimeout(stop, 90);
  }

  function stop() {
    if (!audio) return;
    gain.gain.setTargetAtTime(0, audio.currentTime, SOUND_FADE * 1.5);
  }

  // The page's one sound (js/carpet-ripple-sound.js plays through it too): one touch unlocks it
  // for the whole visit, and its brushing loop, silent while you don't brush, keeps it awake
  function context() {
    prepare();
    return audio;
  }

  return { prepare, move, stop, context };
})();
