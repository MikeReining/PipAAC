/**
 * The color report's pictures (Stats_And_Progress § 4.2): the header and
 * every word as its board tile, drawn on a canvas in Andika and saved as
 * JPEG, the one image format a PDF carries as-is. shared/report.mjs
 * places them; it never draws a picture itself, so the report stays
 * testable without a browser. Same tile anatomy as the board: role
 * border, label strip on the role fill, art on white.
 */

const ROLE = {
  Yellow: ["#b07f00", "#fdf0c8"], Green: ["#2e8b3a", "#dcf0dd"], Blue: ["#2f6fd0", "#dcecfd"],
  Pink: ["#d0438c", "#fbdfee"], Purple: ["#6f55b0", "#ebe5f7"], Red: ["#c62828", "#fbdcdc"],
  None: ["#8a8578", "#e8e3d6"],
};
const INK = "#2a241d", MUTED = "#5b5348", AMBER = "#fcb82b";
const PX = 4; // pixels per PDF point: sharp on paper and on a retina screen

async function loadImage(url) {
  if (!url) return null;
  const img = new Image();
  img.src = url;
  try { await img.decode(); return img; } catch { return null; }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function toJpeg(canvas) {
  const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.9));
  return new Uint8Array(await blob.arrayBuffer());
}

function fitText(ctx, text, maxW, size, min = 6) {
  let s = size;
  for (; s > min; s -= 0.5) {
    ctx.font = `700 ${s * PX}px Andika, sans-serif`;
    if (ctx.measureText(text).width <= maxW) break;
  }
  return s;
}

/** One board tile, `w` points wide: label strip (top third) over art. */
async function drawTile({ label, role, art }, w = 44) {
  const h = Math.round(w * 1.05);
  const c = document.createElement("canvas");
  c.width = w * PX; c.height = h * PX;
  const ctx = c.getContext("2d");
  const [border, fill] = ROLE[role] ?? ROLE.None;
  const b = 1.6 * PX, r = 5 * PX, strip = Math.round(h * 0.33) * PX;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  roundRect(ctx, b / 2, b / 2, c.width - b, c.height - b, r);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, c.width, strip);
  const img = await loadImage(art?.url);
  if (img) {
    const box = { x: b, y: strip, w: c.width - 2 * b, h: c.height - strip - b };
    const k = art.photo
      ? Math.max(box.w / img.naturalWidth, box.h / img.naturalHeight)
      : Math.min((box.w * 0.86) / img.naturalWidth, (box.h * 0.86) / img.naturalHeight);
    const iw = img.naturalWidth * k, ih = img.naturalHeight * k;
    ctx.drawImage(img, box.x + (box.w - iw) / 2, box.y + (box.h - ih) / 2, iw, ih);
  }
  ctx.restore();
  ctx.lineWidth = b;
  ctx.strokeStyle = border;
  roundRect(ctx, b / 2, b / 2, c.width - b, c.height - b, r);
  ctx.stroke();
  const size = fitText(ctx, label, c.width - 4 * b, 9);
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, c.width / 2, strip / 2 + b / 3);
  return { canvas: c, w, h };
}

/** A word chip: small picture, then the label, on the role fill. */
async function drawChip({ label, role, art }, h = 16) {
  const probe = document.createElement("canvas").getContext("2d");
  probe.font = `700 ${9 * PX}px Andika, sans-serif`;
  const img = await loadImage(art?.url);
  const icon = img ? h - 4 : 0;
  const w = Math.min(92, Math.ceil(probe.measureText(label).width / PX + icon + 12));
  const c = document.createElement("canvas");
  c.width = w * PX; c.height = h * PX;
  const ctx = c.getContext("2d");
  const [border, fill] = ROLE[role] ?? ROLE.None;
  const b = 1.2 * PX;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  roundRect(ctx, b / 2, b / 2, c.width - b, c.height - b, 4 * PX);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = b;
  ctx.strokeStyle = border;
  ctx.stroke();
  let x = 4 * PX;
  if (img) {
    const k = Math.min((icon * PX) / img.naturalWidth, (icon * PX) / img.naturalHeight);
    ctx.drawImage(img, x, (c.height - img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k);
    x += (icon + 3) * PX;
  }
  fitText(ctx, label, c.width - x - 4 * PX, 9);
  ctx.fillStyle = INK;
  ctx.textBaseline = "middle";
  ctx.fillText(label, x, c.height / 2 + PX / 2);
  return { canvas: c, w, h };
}

/** The header: the Pip mark, the person's name, the report and range. */
async function drawHeader({ userName, rangeLabel }, w) {
  const h = 54;
  const c = document.createElement("canvas");
  c.width = w * PX; c.height = h * PX;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  const bird = await loadImage("/brand/pip-mark.svg");
  if (bird) ctx.drawImage(bird, 0, 4 * PX, 40 * PX, 40 * PX);
  ctx.fillStyle = INK;
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 ${24 * PX}px Andika, sans-serif`;
  ctx.fillText(userName, 50 * PX, 25 * PX);
  ctx.fillStyle = MUTED;
  ctx.font = `700 ${11 * PX}px Andika, sans-serif`;
  ctx.fillText(`Progress report · ${rangeLabel}`, 50 * PX, 42 * PX);
  ctx.fillStyle = AMBER;
  ctx.fillRect(0, (h - 3) * PX, c.width, 3 * PX);
  return { canvas: c, w, h };
}

/**
 * Everything the color report places, for the words in `dash`.
 * Returns { art, images }: `art` names each picture for report.mjs,
 * `images` carries the JPEG bytes for pagesToPdf.
 */
export async function reportArt(dash, { userName, rangeLabel, nameOf, roleOf, artOf, width }) {
  await document.fonts?.load(`700 ${24 * PX}px Andika`).catch(() => {});
  const images = [];
  let n = 0;
  const add = async ({ canvas, w, h }) => {
    const name = `Im${++n}`;
    images.push({ name, jpeg: await toJpeg(canvas), w: canvas.width, h: canvas.height });
    return { name, w, h };
  };
  const word = async (key) => {
    const [kind, id] = key.split(":");
    return {
      label: nameOf(kind, id) ?? id,
      role: roleOf(kind, id) ?? "None",
      art: await artOf(kind, id).catch(() => null),
    };
  };
  const tileKeys = new Set([...dash.goals.flatMap((g) => g.targets), ...dash.newWords.map((w) => w.key)]);
  const chipKeys = new Set(dash.topWords.slice(0, 10).map((t) => t.key));
  const tiles = new Map(), chips = new Map();
  for (const key of tileKeys) tiles.set(key, await add(await drawTile(await word(key))));
  for (const key of chipKeys) chips.set(key, await add(await drawChip(await word(key))));
  const header = await add(await drawHeader({ userName, rangeLabel }, width));
  return { art: { header, tiles, chips }, images };
}
