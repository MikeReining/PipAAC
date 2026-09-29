import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

export const BATCH51 = [
  {
    slot: 505,
    word: "red",
    displayName: "red",
    category: "Descriptors",
    hex: "#E53935",
    note: "Vivid primary red filled circle with black outline",
  },
  {
    slot: 506,
    word: "blue",
    displayName: "blue",
    category: "Descriptors",
    hex: "#1E88E5",
    note: "Vivid primary blue filled circle with black outline",
  },
  {
    slot: 507,
    word: "green",
    displayName: "green",
    category: "Descriptors",
    hex: "#43A047",
    note: "Vivid primary green filled circle with black outline",
  },
  {
    slot: 508,
    word: "yellow",
    displayName: "yellow",
    category: "Descriptors",
    hex: "#FDD835",
    note: "Sunny warm yellow filled circle with black outline",
  },
  {
    slot: 509,
    word: "orange",
    displayName: "orange",
    category: "Descriptors",
    hex: "#FB8C00",
    note: "Bright citrus orange filled circle with black outline",
  },
  {
    slot: 510,
    word: "purple",
    displayName: "purple",
    category: "Descriptors",
    hex: "#8E24AA",
    note: "Royal violet purple filled circle with black outline",
  },
  {
    slot: 511,
    word: "pink",
    displayName: "pink",
    category: "Descriptors",
    hex: "#EC407A",
    note: "Bright rose pink filled circle with black outline",
  },
  {
    slot: 512,
    word: "brown",
    displayName: "brown",
    category: "Descriptors",
    hex: "#6D4C41",
    note: "Warm earthy brown filled circle with black outline",
  },
  {
    slot: 513,
    word: "black",
    displayName: "black",
    category: "Descriptors",
    hex: "#18181B",
    note: "Deep solid black filled circle with black outline",
  },
  {
    slot: 514,
    word: "white",
    displayName: "white",
    category: "Descriptors",
    hex: "#FFFFFF",
    note: "Pure white filled circle with black outline",
  },
];

async function getWebpB64(path, size) {
  const buf = readFileSync(path);
  const thumb = await sharp(buf)
    .resize(size, size, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .webp({ quality: 75 })
    .toBuffer();
  return thumb.toString("base64");
}

export async function run() {
  console.log(`Starting Batch 51 generation (${BATCH51.length} words: Complete Color Palette)...`);

  const size = 1600;
  const sw = 48; // outline matches stick figure torso/head outline
  const r = 632; // 82% coverage outer diameter

  for (let i = 0; i < BATCH51.length; i++) {
    const item = BATCH51[i];
    const out = `${BRAIN_DIR}/batch51_${item.word}.png`;
    console.log(`[${i + 1}/${BATCH51.length}] Rendering slot #${item.slot}: "${item.displayName}" (${item.hex})...`);

    const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="#FFFFFF" />
  <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="${item.hex}" stroke="#1a1a1a" stroke-width="${sw}" />
</svg>`;

    await sharp(Buffer.from(svg))
      .png()
      .toFile(out);
    console.log(`Done slot #${item.slot}: "${item.displayName}" -> ${out}`);
  }

  console.log("\nBuilding composite grid...");
  const cols = 5;
  const rows = 2;
  const tileSize = 300;
  const pad = 10;
  const gridW = cols * tileSize + (cols + 1) * pad;
  const gridH = rows * tileSize + (rows + 1) * pad;

  const composites = [];
  for (let i = 0; i < BATCH51.length; i++) {
    const item = BATCH51[i];
    const imgPath = `${BRAIN_DIR}/batch51_${item.word}.png`;
    const rIdx = Math.floor(i / cols);
    const cIdx = i % cols;
    const top = pad + rIdx * (tileSize + pad);
    const left = pad + cIdx * (tileSize + pad);

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
    .toFile(`${BRAIN_DIR}/batch51_grid.png`);
  console.log("Saved batch51_grid.png");

  console.log("Building 48px clinical strip...");
  const stripW = BATCH51.length * 64 + 16;
  const stripH = 64;
  const stripComposites = [];
  for (let i = 0; i < BATCH51.length; i++) {
    const item = BATCH51[i];
    const imgPath = `${BRAIN_DIR}/batch51_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch51_strip_48.png`);
  console.log("Saved batch51_strip_48.png");

  console.log("Building lightweight batch51_review.html...");
  const cardHtmls = [];
  for (const item of BATCH51) {
    const imgPath = `${BRAIN_DIR}/batch51_${item.word}.png`;
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
<title>Pip AAC — Clipart Batch 51 Review (#505–#514)</title>
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
<h1>Pip AAC — Clipart Batch 51 Review (#505–#514)</h1>
<div class="subtitle">Category 3.12 Descriptors: Complete Color Palette • Filled circles with stick figure outline weight</div>
<div class="grid-container">
${cardHtmls.join("")}
</div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch51_review.html`, html, "utf-8");
  console.log("Saved batch51_review.html");
}

if (process.argv[1]?.endsWith("batch51.mjs")) {
  run().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
