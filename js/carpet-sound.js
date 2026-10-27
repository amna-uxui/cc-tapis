/*
  Brushing sound: a soft rustle of velvet while you draw, made in code (no sound files).
  It is filtered noise: louder and a little brighter the faster the finger moves,
  and it fades away when the finger stops or lifts.

  js/carpet-viewer.js calls brushSound.move(speed) while drawing and brushSound.stop() after.
*/

const SOUND_VOLUME = 0.35;   // loudest the brushing gets (0..1)
const SOUND_FULL_SPEED = 1.5; // finger speed (screen px per ms) that gives the full volume
const SOUND_FADE = 0.08;     // seconds the sound takes to follow the finger (higher = softer changes)

const brushSound = (() => {
  let audio = null;
  let gain = null;
  let tone = null;
  let idle = null; // fades out when the finger rests without moving

  // Browsers only allow sound after a touch, so the sound is set up on the first stroke
  function setUp() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return false;
    audio = new AudioContext();

    // Two seconds of soft noise, looped
    const length = audio.sampleRate * 2;
    const noise = audio.createBuffer(1, length, audio.sampleRate);
    const data = noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      last = (last + 0.04 * (Math.random() * 2 - 1)) / 1.04; // a darker, softer noise than plain hiss
      data[i] = last * 3.5;
    }
    const source = audio.createBufferSource();
    source.buffer = noise;
    source.loop = true;

    // Shape it into a fabric rustle: no rumble, no harsh top
    const low = audio.createBiquadFilter();
    low.type = "highpass";
    low.frequency.value = 300;
    tone = audio.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 1400;
    gain = audio.createGain();
    gain.gain.value = 0;

    source.connect(low).connect(tone).connect(gain).connect(audio.destination);
    source.start();
    return true;
  }

  function move(speed) {
    if (!audio && !setUp()) return;
    if (audio.state === "suspended") audio.resume();
    const amount = Math.min(speed / SOUND_FULL_SPEED, 1);
    const now = audio.currentTime;
    gain.gain.setTargetAtTime(SOUND_VOLUME * amount * (0.85 + Math.random() * 0.3), now, SOUND_FADE);
    tone.frequency.setTargetAtTime(900 + 2200 * amount, now, SOUND_FADE);
    clearTimeout(idle);
    idle = setTimeout(stop, 90);
  }

  function stop() {
    if (!audio) return;
    gain.gain.setTargetAtTime(0, audio.currentTime, SOUND_FADE * 1.5);
  }

  return { move, stop };
})();
