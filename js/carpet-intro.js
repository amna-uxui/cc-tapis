/*
  The first screen: the three rugs and what you do with each, and one Start button. Its tap asks
  for everything the experience uses, so nothing asks in the middle of it:
  - the phone's motion (iPhone), for the lamp on Hypercode that follows the phone's tilt;
  - the microphone, for blowing on GrandMa Patterns. It's let go again at once (no recording light
    all the way through); the rug only listens once you tap Blow;
  - and, being a tap, it lets the sound play (js/carpet-sound.js).
  The phone doesn't ask again on this visit. "Don't allow" still works: the lamp is dragged round
  instead, and holding Blow blows.

  Needs js/carpet-blow.js (noMic, micState) and js/carpet-viewer.js (showVerb) to be loaded first.
*/

const intro = document.querySelector("[data-intro]");
const introStart = document.querySelector("[data-intro-start]");

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

// iPhone only asks for motion straight from a tap, so this is asked first, before anything waits
function askForMotion() {
  const ask = window.DeviceOrientationEvent && DeviceOrientationEvent.requestPermission;
  if (typeof ask !== "function" || !window.isSecureContext) return Promise.resolve(); // other phones don't ask
  return DeviceOrientationEvent.requestPermission().catch(() => {}); // the lamp tap starts the tilt
}

introStart.addEventListener("click", async () => {
  introStart.disabled = true;
  await askForMotion();
  await askForMicrophone();
  intro.classList.add("is-leaving");
  document.body.classList.remove("is-intro");
  showVerb(); // the first rug's verb, now you can see it
  setTimeout(() => intro.remove(), 600);
});
