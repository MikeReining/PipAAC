import { generateToFile } from "./gen.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

export const BATCH48 = [
  {
    slot: 477,
    word: "wind",
    displayName: "wind",
    category: "Nature",
    framing: "object",
    hint: "A clean standalone dynamic swirling breeze gust with curved light cyan wind stream lines and three fluttering small green leaves carried in the air.",
    note: "Curling cyan wind breeze lines with fluttering green leaves",
  },
  {
    slot: 478,
    word: "cloud",
    displayName: "cloud",
    category: "Nature",
    framing: "object",
    hint: "A clean standalone fluffy white cumulus cloud with gentle soft light-blue shading along the bottom puffs and a crisp outline.",
    note: "Fluffy white cumulus cloud with soft sky-blue shading",
  },
  {
    slot: 479,
    word: "moon",
    displayName: "moon",
    category: "Nature",
    framing: "object",
    hint: "A clean standalone glowing golden crescent moon upright with gentle surface crater details.",
    note: "Golden crescent moon with subtle craters",
  },
  {
    slot: 480,
    word: "vehicle",
    displayName: "vehicle",
    category: "Vehicles",
    framing: "object",
    hint: "A clean standalone circular blue category emblem badge featuring clean white icons of transport: a car, an airplane, and a ship.",
    note: "Circular transport category emblem badge",
  },
  {
    slot: 481,
    word: "car",
    displayName: "car",
    category: "Vehicles",
    framing: "object",
    hint: "A clean standalone friendly red family sedan car in side profile with clean windows and black wheels.",
    note: "Red family sedan car in profile",
  },
  {
    slot: 482,
    word: "truck",
    displayName: "truck",
    category: "Vehicles",
    framing: "object",
    hint: "A clean standalone sturdy blue pickup truck in side profile with large wheels, cab, and open cargo bed.",
    note: "Blue pickup truck in side profile",
  },
  {
    slot: 483,
    word: "bus",
    displayName: "bus",
    category: "Vehicles",
    framing: "object",
    hint: "A clean standalone classic yellow school bus in side profile with rectangular windows and black wheels.",
    note: "Classic yellow school bus in profile",
  },
  {
    slot: 484,
    word: "train",
    displayName: "train",
    category: "Vehicles",
    framing: "object",
    hint: "A clean standalone classic steam train locomotive engine in profile with smokestack, wheels, and a puff of white steam.",
    note: "Steam train locomotive engine in profile",
  },
  {
    slot: 485,
    word: "airplane",
    displayName: "airplane",
    category: "Vehicles",
    framing: "object",
    hint: "A clean standalone white and blue passenger jet airplane flying horizontally in side profile with wings and tail fin.",
    note: "Passenger jet airplane in side profile",
  },
  {
    slot: 486,
    word: "boat",
    displayName: "boat",
    category: "Vehicles",
    framing: "object",
    hint: "A clean standalone cheerful white sailboat with tall mast and colorful red and blue sails on a gentle blue water ripple.",
    note: "Sailboat with colorful sails on water ripple",
  },
];

async function normalizeToSquare(filePath) {
  const { data, info } = await sharp(filePath).raw().toBuffer({ resolveWithObject: true });
  let minX = info.width, maxX = 0, minY = info.height, maxY = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * info.channels;
      if (data[idx] < 245 || data[idx + 1] < 245 || data[idx + 2] < 245) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const bw = maxX - minX;
  const bh = maxY - minY;
  if (bw <= 0 || bh <= 0) return;

  const maxDim = Math.max(bw, bh);
  const canvasSize = Math.max(Math.round(maxDim / 0.82), 1600);
  const cropped = await sharp(filePath)
    .extract({ left: minX, top: minY, width: bw, height: bh })
    .toBuffer();

  const buf = await sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([
      {
        input: cropped,
        top: Math.round((canvasSize - bh) / 2),
        left: Math.round((canvasSize - bw) / 2),
      },
    ])
    .png()
    .toBuffer();

  writeFileSync(filePath, buf);
  console.log(`Normalized ${filePath}: content ${bw}x${bh} in ${canvasSize}x${canvasSize} (~${Math.round((maxDim / canvasSize) * 100)}% fill)`);
}

async function getWebpB64(path, size) {
  const buf = readFileSync(path);
  const thumb = await sharp(buf)
    .resize(size, size, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .webp({ quality: 75 })
    .toBuffer();
  return thumb.toString("base64");
}

export async function run() {
  console.log(`Starting Batch 48 generation (${BATCH48.length} words: Nature Finale & Vehicles Launch)...`);

  for (let i = 0; i < BATCH48.length; i++) {
    const item = BATCH48[i];
    const out = `${BRAIN_DIR}/batch48_${item.word}.png`;
    if (existsSync(out) && !process.argv.includes("--force")) {
      console.log(`Slot #${item.slot} ("${item.displayName}") already exists at ${out}. Skipping.`);
      continue;
    }
    console.log(`\n[${i + 1}/${BATCH48.length}] Generating slot #${item.slot}: "${item.displayName}"...`);
    const start = Date.now();
    try {
      await generateToFile({
        word: item.displayName,
        torso: null,
        framing: item.framing ?? "object",
        hint: item.hint,
        out,
      });
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`Done slot #${item.slot}: "${item.displayName}" in ${elapsed}s -> ${out}`);
      await normalizeToSquare(out);
    } catch (err) {
      console.error(`FAILED slot #${item.slot}: "${item.displayName}"`, err);
    }
  }

  console.log("\nBuilding composite grid...");
  const cols = 5;
  const rows = 2;
  const tileSize = 300;
  const pad = 10;
  const gridW = cols * tileSize + (cols + 1) * pad;
  const gridH = rows * tileSize + (rows + 1) * pad;

  const composites = [];
  for (let i = 0; i < BATCH48.length; i++) {
    const item = BATCH48[i];
    const imgPath = `${BRAIN_DIR}/batch48_${item.word}.png`;
    if (!existsSync(imgPath)) continue;
    const r = Math.floor(i / cols);
    const c = i % cols;
    const top = pad + r * (tileSize + pad);
    const left = pad + c * (tileSize + pad);

    const resized = await sharp(imgPath)
      .resize(tileSize, tileSize, { fit: "contain", background: { r: 255, g: 255, b: 255 } })
      .toBuffer();

    composites.push({ input: resized, top, left });
  }

  await sharp({
    create: {
      width: gridW,
      height: gridH,
      channels: 3,
      background: { r: 241, g: 245, b: 249 },
    },
  })
    .composite(composites)
    .png()
    .toFile(`${BRAIN_DIR}/batch48_grid.png`);
  console.log("Saved batch48_grid.png");

  console.log("Building 48px clinical strip...");
  const stripW = BATCH48.length * 64 + 16;
  const stripH = 64;
  const stripComposites = [];
  for (let i = 0; i < BATCH48.length; i++) {
    const item = BATCH48[i];
    const imgPath = `${BRAIN_DIR}/batch48_${item.word}.png`;
    if (!existsSync(imgPath)) continue;
    const mini = await sharp(imgPath)
      .resize(48, 48, { fit: "contain", background: { r: 255, g: 255, b: 255 } })
      .toBuffer();
    stripComposites.push({
      input: mini,
      top: 8,
      left: i * 64 + 8,
    });
  }

  await sharp({
    create: {
      width: stripW,
      height: stripH,
      channels: 3,
      background: { r: 241, g: 245, b: 249 },
    },
  })
    .composite(stripComposites)
    .png()
    .toFile(`${BRAIN_DIR}/batch48_strip_48.png`);
  console.log("Saved batch48_strip_48.png");

  console.log("Building lightweight batch48_review.html...");
  const cardHtmls = [];
  for (const item of BATCH48) {
    const imgPath = `${BRAIN_DIR}/batch48_${item.word}.png`;
    if (!existsSync(imgPath)) continue;
    const b64_240 = await getWebpB64(imgPath, 240);
    const b64_48 = await getWebpB64(imgPath, 48);

    cardHtmls.push(`
      <div class="card">
        <div class="header">
          <span class="slot">#${item.slot}</span>
          <span class="word">${item.displayName}</span>
          <span class="cat">${item.category}</span>
        </div>
        <div class="images">
          <div class="view-block">
            <div class="label">240px Preview</div>
            <div class="img-box img-240">
              <img src="data:image/webp;base64,${b64_240}" alt="${item.displayName}" />
            </div>
          </div>
          <div class="view-block">
            <div class="label">48px Motor Target</div>
            <div class="img-box img-48">
              <img src="data:image/webp;base64,${b64_48}" alt="${item.displayName}" />
            </div>
          </div>
        </div>
        <div class="meta">
          <div class="note">${item.note}</div>
        </div>
      </div>
    `);
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Pip AAC — Clipart Batch 48 Review (#477–#486)</title>
<style>
  body {
    margin: 0;
    padding: 24px;
    background: #0f172a;
    color: #e2e8f0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  h1 { margin: 0 0 8px 0; font-size: 24px; font-weight: 700; color: #f8fafc; }
  .subtitle { margin-bottom: 24px; color: #94a3b8; font-size: 14px; }
  .grid-container {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 20px;
  }
  .card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 12px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .header {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .slot {
    font-size: 12px;
    font-weight: 600;
    color: #64748b;
  }
  .word {
    font-size: 18px;
    font-weight: 700;
    color: #38bdf8;
    flex: 1;
  }
  .cat {
    font-size: 11px;
    padding: 2px 6px;
    background: #334155;
    border-radius: 4px;
    color: #cbd5e1;
  }
  .images {
    display: flex;
    gap: 16px;
    align-items: flex-end;
  }
  .view-block {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .label {
    font-size: 11px;
    color: #64748b;
    text-transform: uppercase;
    font-weight: 600;
  }
  .img-box {
    background: #ffffff;
    border: 1px solid #475569;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .img-240 { width: 140px; height: 140px; }
  .img-240 img { width: 100%; height: 100%; object-fit: contain; }
  .img-48 { width: 48px; height: 48px; }
  .img-48 img { width: 48px; height: 48px; object-fit: contain; }
  .meta {
    font-size: 13px;
    color: #94a3b8;
    line-height: 1.4;
  }
</style>
</head>
<body>
<h1>Pip AAC — Clipart Batch 48 Review (#477–#486)</h1>
<div class="subtitle">Category 3.10 Nature Finale & Category 3.11 Vehicles Launch • High-contrast clinical motor grid evaluation</div>
<div class="grid-container">
${cardHtmls.join("")}
</div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch48_review.html`, html, "utf-8");
  console.log("Saved batch48_review.html");
}

if (process.argv[1]?.endsWith("batch48.mjs")) {
  run().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
