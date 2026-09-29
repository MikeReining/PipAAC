import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

// 1. Clean cheetah edge line in fast
async function cleanFastCheetah() {
  const fastPath = `${BRAIN_DIR}/batch52_fast.png`;
  const { data, info } = await sharp(fastPath).raw().toBuffer({ resolveWithObject: true });
  const outData = Buffer.from(data);

  // Any dark pixel on the right border region (x > 1440, y < 900) that looks like a vertical boundary line:
  for (let y = 0; y < 900; y++) {
    for (let x = 1440; x < info.width; x++) {
      const idx = (y * info.width + x) * info.channels;
      // If it's a thin gray/black line not attached to the cheetah head/paws
      if (x > 1460 && y < 800) {
        outData[idx] = 255;
        outData[idx + 1] = 255;
        outData[idx + 2] = 255;
      }
    }
  }

  await sharp(outData, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .png()
    .toFile(fastPath);
  console.log("Cleaned vertical hairline from batch52_fast.png");
}

// 2. Clone heavy scale from light scale
async function setHeavyScale() {
  const cloned = readFileSync(`${BRAIN_DIR}/scale_heavy_cloned.png`);
  writeFileSync(`${BRAIN_DIR}/batch52_heavy.png`, cloned);
  console.log("Copied scale_heavy_cloned.png -> batch52_heavy.png");
}

// 3. Clone thin from thick
async function cloneThinFromThick() {
  const thickPath = `${BRAIN_DIR}/batch52_thick.png`;
  const { data, info } = await sharp(thickPath).raw().toBuffer({ resolveWithObject: true });
  const outData = Buffer.from(data);

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * info.channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // Chunky block on left (x < 1150) with blue pixels: r < 120, g < 180, b > 180
      if (x < 1150 && b > 180 && r < 120 && g < 180) {
        // Change to pale gray: #E5E9EE
        outData[idx] = 230;
        outData[idx + 1] = 235;
        outData[idx + 2] = 242;
      }
      // Wafer-thin strip on right (x > 1150) with pale gray pixels: r > 200, g > 205, b > 210
      else if (x > 1150 && r > 200 && r < 250 && g > 205 && g < 250 && b > 210 && b < 255) {
        // Change to descriptor blue: #1E88E5
        outData[idx] = 30;
        outData[idx + 1] = 136;
        outData[idx + 2] = 229;
      }
    }
  }

  await sharp(outData, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .png()
    .toFile(`${BRAIN_DIR}/batch52_thin.png`);
  console.log("Cloned and swapped batch52_thin.png from thick geometry");
}

async function rebuildPreviews() {
  const { BATCH52 } = await import("./batch52.mjs");

  console.log("\nRebuilding composite grid...");
  const cols = 5;
  const rows = 2;
  const tileSize = 300;
  const pad = 10;
  const gridW = cols * tileSize + (cols + 1) * pad;
  const gridH = rows * tileSize + (rows + 1) * pad;

  const composites = [];
  for (let i = 0; i < BATCH52.length; i++) {
    const item = BATCH52[i];
    const imgPath = `${BRAIN_DIR}/batch52_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch52_grid.png`);
  console.log("Saved batch52_grid.png");

  console.log("Rebuilding 48px clinical strip...");
  const stripW = BATCH52.length * 64 + 16;
  const stripH = 64;
  const stripComposites = [];
  for (let i = 0; i < BATCH52.length; i++) {
    const item = BATCH52[i];
    const imgPath = `${BRAIN_DIR}/batch52_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch52_strip_48.png`);
  console.log("Saved batch52_strip_48.png");

  // Rebuild HTML
  async function getWebpB64(path, size) {
    const buf = readFileSync(path);
    const thumb = await sharp(buf)
      .resize(size, size, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .webp({ quality: 75 })
      .toBuffer();
    return thumb.toString("base64");
  }

  const cardHtmls = [];
  for (const item of BATCH52) {
    const imgPath = `${BRAIN_DIR}/batch52_${item.word}.png`;
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
<title>Pip AAC — Clipart Batch 52 Review (#515–#524)</title>
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
<h1>Pip AAC — Clipart Batch 52 Review (#515–#524)</h1>
<div class="subtitle">Category 3.12 Descriptors: Physical Dimensions & Speed • Paired Blue/Gray Invariant & Velocity Meters</div>
<div class="grid-container">
${cardHtmls.join("")}
</div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch52_review.html`, html, "utf-8");
  console.log("Saved batch52_review.html");
}

async function main() {
  await cleanFastCheetah();
  await setHeavyScale();
  await cloneThinFromThick();
  await rebuildPreviews();
}

main().catch(console.error);
