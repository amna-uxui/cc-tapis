/*
  The first screens, one at a time: the name and Start, then each permission the experience uses,
  with a line on what it's for, Allow and Not now:
  - Sound: the brushing, the wool and the wind (the phone doesn't ask for it, but sound only plays
    after a tap). Allow plays a short brush stroke, so you hear it's on; Not now keeps the rugs silent.
  - Motion (only on iPhone, where it's asked): Hypercode's lamp follows the phone's tilt.
  - Microphone: blowing on GrandMa Patterns. It's let go again at once (no recording light all
    the way through); the rug only listens once you tap Blow.
  The phone doesn't ask again on this visit, so nothing asks in the middle of the experience.
  "Not now" or "Don't allow" still works: the lamp is dragged round instead, and holding Blow blows.

  Needs js/carpet-blow.js (noMic, micState) and js/carpet-viewer.js (showVerb) to be loaded first.
*/

const intro = document.querySelector("[data-intro]");

// What each permission asks; motion only where the phone asks for it (iPhone)
const PERMISSIONS = {
  sound: {
    needed: () => true,
    ask: playSample,
    no: () => (soundOn = false),
  },
  motion: {
    needed: () =>
      window.isSecureContext && window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === "function",
    // iPhone only asks straight from a tap; the lamp tap starts the tilt
    ask: () => DeviceOrientationEvent.requestPermission().catch(() => {}),
  },
  microphone: {
    needed: () => true,
    ask: askForMicrophone,
  },
};

// A short brush stroke (js/carpet-sound.js), so you hear the sound is on
function playSample() {
  brushSound.prepare();
  const from = performance.now();
  return new Promise((done) => {
    const stroke = setInterval(() => {
      const t = (performance.now() - from) / 600;
      brushSound.move(1.4 * Math.sin(Math.PI * Math.min(1, t))); // swells and fades
      if (t >= 1.3) {
        clearInterval(stroke);
        done();
      }
    }, 30);
  });
}

async function askForMicrophone() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return; // Blow says why when tapped
  // iPhone: a page set to only play sound is refused the microphone (see startListening)
  if (navigator.audioSession) navigator.audioSession.type = "auto";
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
  } catch (error) {
    noMic = true; // holding Blow blows instead
    micState = `${error.name} at the start`;
  }
  if (navigator.audioSession) navigator.audioSession.type = "playback"; // the sound plays with the silent switch on
}

// The screens to show: Start, then each permission this phone asks for
const steps = [...intro.querySelectorAll("[data-step]")].filter(
  (step) => !PERMISSIONS[step.dataset.step] || PERMISSIONS[step.dataset.step].needed()
);
const asking = steps.filter((step) => PERMISSIONS[step.dataset.step]);
asking.forEach((step, i) => (step.querySelector("[data-step-count]").textContent = `${i + 1} of ${asking.length}`));

let stepIndex = 0;

// The next screen, or into the rugs after the last
function nextStep() {
  steps[stepIndex].hidden = true;
  stepIndex++;
  if (stepIndex < steps.length) {
    steps[stepIndex].hidden = false;
    return;
  }
  intro.classList.add("is-leaving");
  document.body.classList.remove("is-intro");
  showVerb(); // the first rug's verb, now you can see it
  setTimeout(() => intro.remove(), 600);
}

intro.addEventListener("click", async (e) => {
  const step = steps[stepIndex];
  if (e.target.closest("[data-next]")) {
    const permission = PERMISSIONS[step.dataset.step];
    if (permission && permission.no) permission.no();
    nextStep();
  }
  else if (e.target.closest("[data-allow]")) {
    e.target.closest("[data-allow]").disabled = true;
    await PERMISSIONS[step.dataset.step].ask();
    nextStep();
  }
});
