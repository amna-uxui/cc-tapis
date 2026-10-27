/*
  Save your rug: the bookmark (top right of the zoomed-out view) makes an image of the rug as it
  looks now, brushed marks included, on white, with its name, designer, size and price underneath,
  like a small product card. On a phone it opens the share sheet (Save Image puts it in Photos);
  elsewhere the image downloads.

  Needs js/carpet-viewer.js (img, brush, rugInfo) to be loaded first.
*/

const SAVE_PAD = 60;  // white space around the rug in the image, in rug-photo pixels

const saveButton = document.querySelector("[data-save]");

// The card: the rug (photo with the brushed pile on top) and its details below
function rugCard() {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const text = (selector) => rugInfo.querySelector(selector).textContent.trim();

  const card = document.createElement("canvas");
  card.width = w + SAVE_PAD * 2;
  card.height = h + SAVE_PAD * 2 + 120;
  const ctx = card.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, card.width, card.height);
  ctx.drawImage(img, SAVE_PAD, SAVE_PAD, w, h);
  ctx.drawImage(brush, SAVE_PAD, SAVE_PAD, w, h);

  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  const middle = card.width / 2;
  const below = SAVE_PAD + h + 52;
  ctx.font = '600 26px "Inter", sans-serif';
  ctx.fillText(text("[data-rug-name]").toUpperCase(), middle, below);
  ctx.font = '400 22px "Inter", sans-serif';
  ctx.fillText(text("[data-rug-designer]"), middle, below + 32);
  ctx.fillStyle = "#6b6b6b";
  ctx.font = '400 20px "Space Mono", monospace';
  ctx.fillText(text("[data-rug-size]").toUpperCase(), middle, below + 66);
  return card;
}

// The image as a file, made right away (a phone only opens the share sheet straight after a tap)
function cardFile(card) {
  const [head, body] = card.toDataURL("image/jpeg", 0.92).split(",");
  const bytes = atob(body);
  const data = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) data[i] = bytes.charCodeAt(i);
  const name = `cc-tapis-${rugInfo.querySelector("[data-rug-name]").textContent.trim().toLowerCase().replace(/\s+/g, "-")}.jpg`;
  return new File([data], name, { type: head.slice(5, head.indexOf(";")) });
}

function download(file) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(file);
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
}

saveButton.addEventListener("click", () => {
  const file = cardFile(rugCard());
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: "My cc-tapis rug" }).catch(() => {});
  } else {
    download(file);
  }
  saveButton.classList.add("is-saved");
  setTimeout(() => saveButton.classList.remove("is-saved"), 1200);
});
