import { generateToFile } from "./gen.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

export const BATCH50 = [
  {
    slot: 498,
    word: "ship",
    displayName: "ship",
    category: "Vehicles",
    framing: "object",
    hint: "A clean standalone large white passenger cruise ship in side profile with dark lower hull, passenger cabin windows, and red smokestack funnels on a gentle blue water wave baseline. Pure white background.",
    note: "Ocean cruise liner ship with tiered decks and red smokestacks",
  },
  {
    slot: 499,
    word: "canoe",
    displayName: "canoe",
    category: "Vehicles",
    framing: "object",
    hint: "A clean standalone traditional wooden cedar canoe in side profile with pointed ends and a single wooden paddle resting across the gunwales on a gentle blue water ripple. Pure white background.",
    note: "Wooden canoe paddle boat on water ripple",
  },
  {
    slot: 500,
    word: "subway",
    displayName: "subway",
    category: "Vehicles",
    framing: "object",
    hint: "A clean standalone complete modern underground metro subway car seen in three-quarter profile, fully self-contained with sleek front cab, headlights, side passenger doors and windows, sitting on tracks. The entire subway car is fully visible within frame with generous white space around it, no cut-off edges, pure white background.",
    note: "Modern underground metro subway car on tracks in three-quarter profile",
  },
  {
    slot: 501,
    word: "road",
    displayName: "road",
    category: "Vehicles",
    framing: "object",
    hint: "A clean standalone curving dark gray asphalt roadway receding into perspective with bold dashed yellow center divider lines and clean white road shoulders. Pure white background.",
    note: "Curving asphalt road with dashed yellow center lines",
  },
  {
    slot: 502,
    word: "track",
    displayName: "track",
    category: "Vehicles",
    framing: "object",
    hint: "A clean standalone set of parallel steel railroad train tracks running diagonally into perspective with sturdy wooden cross-ties underneath. Pure white background.",
    note: "Steel railroad tracks with wooden cross-ties",
  },
  {
    slot: 503,
    word: "stoplight",
    displayName: "stoplight",
    category: "Vehicles",
    framing: "object",
    hint: "A clean standalone classic black vertical traffic light signal box with visors and three glowing circular lights: red on top, yellow in middle, and green on bottom. Pure white background.",
    note: "Vertical traffic signal stoplight with red, yellow, and green lights",
  },
  {
    slot: 504,
    word: "gas_station",
    displayName: "gas station",
    category: "Vehicles",
    framing: "object",
    hint: "A clean standalone bright red fuel pump gas dispenser with a digital gallon meter screen, flexible black hose, and fueling nozzle resting in side holster. Pure white background.",
    note: "Red gas pump dispenser with hose, nozzle, and meter",
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
  console.log(`Starting Batch 50 generation (${BATCH50.length} words: Vehicles Finale & Transit Infrastructure)...`);

  for (let i = 0; i < BATCH50.length; i++) {
    const item = BATCH50[i];
    const out = `${BRAIN_DIR}/batch50_${item.word}.png`;
    if (existsSync(out) && !process.argv.includes("--force")) {
      console.log(`Slot #${item.slot} ("${item.displayName}") already exists at ${out}. Skipping.`);
      continue;
    }
    console.log(`\n[${i + 1}/${BATCH50.length}] Generating slot #${item.slot}: "${item.displayName}"...`);
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
  const cols = 4;
  const rows = 2;
  const tileSize = 300;
  const pad = 10;
  const gridW = cols * tileSize + (cols + 1) * pad;
  const gridH = rows * tileSize + (rows + 1) * pad;

  const composites = [];
  for (let i = 0; i < BATCH50.length; i++) {
    const item = BATCH50[i];
    const imgPath = `${BRAIN_DIR}/batch50_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch50_grid.png`);
  console.log("Saved batch50_grid.png");

  console.log("Building 48px clinical strip...");
  const stripW = BATCH50.length * 64 + 16;
  const stripH = 64;
  const stripComposites = [];
  for (let i = 0; i < BATCH50.length; i++) {
    const item = BATCH50[i];
    const imgPath = `${BRAIN_DIR}/batch50_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch50_strip_48.png`);
  console.log("Saved batch50_strip_48.png");

  console.log("Building lightweight batch50_review.html...");
  const cardHtmls = [];
  for (const item of BATCH50) {
    const imgPath = `${BRAIN_DIR}/batch50_${item.word}.png`;
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
<title>Pip AAC — Clipart Batch 50 Review (#498–#504)</title>
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
<h1>Pip AAC — Clipart Batch 50 Review (#498–#504)</h1>
<div class="subtitle">Category 3.11 Vehicles Finale & Transit Infrastructure • High-contrast clinical motor grid evaluation</div>
<div class="grid-container">
${cardHtmls.join("")}
</div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch50_review.html`, html, "utf-8");
  console.log("Saved batch50_review.html");
}

if (process.argv[1]?.endsWith("batch50.mjs")) {
  run().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
