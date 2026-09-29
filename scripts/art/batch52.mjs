import { generateToFile } from "./gen.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

export const BATCH52 = [
  {
    slot: 515,
    word: "fast",
    displayName: "fast",
    category: "Descriptors",
    framing: "object",
    hint: "A clean standalone sleek cheetah in full horizontal athletic sprint, running fast left to right in side profile with aerodynamic posture and horizontal motion speed trails behind it, positioned in the upper portion of the frame with white space below. Bold black outlines, minimal flat colors, pure white background.",
    note: "Sleek sprinting cheetah with motion lines + high velocity bar (3/4 filled) underneath",
  },
  {
    slot: 516,
    word: "slow",
    displayName: "slow",
    category: "Descriptors",
    framing: "object",
    hint: "A clean standalone friendly garden snail crawling calmly left to right in side profile with rounded swirl shell, eye tentacles, and smooth body, positioned in the upper portion of the frame with white space below. Bold black outlines, minimal flat colors, pure white background.",
    note: "Calm garden snail crawling + low velocity bar (1/4 filled) underneath",
  },
  {
    slot: 517,
    word: "tall",
    displayName: "tall",
    category: "Descriptors",
    framing: "object",
    customSource: "hedge_tall",
    hint: "Two manicured garden hedges standing on a ground line: a tall vertical columnar topiary hedge filled with vivid descriptor blue, beside a low short rounded hedge in pale light gray. Bold black outlines, pure white background.",
    note: "Tall columnar hedge in Descriptor Blue beside short rounded hedge in Pale Gray",
  },
  {
    slot: 518,
    word: "short",
    displayName: "short",
    category: "Descriptors",
    framing: "object",
    customSource: "hedge_short",
    hint: "Two manicured garden hedges standing on a ground line: a low short rounded hedge filled with vivid descriptor blue, beside a tall vertical columnar topiary hedge in pale light gray. Bold black outlines, pure white background.",
    note: "Short rounded hedge in Descriptor Blue beside tall columnar hedge in Pale Gray",
  },
  {
    slot: 519,
    word: "long",
    displayName: "long",
    category: "Descriptors",
    framing: "object",
    hint: "Two horizontal wooden pencils lying parallel on a clean white surface: a long full-length pencil filled with vivid blue color, beside a short stubby sharpened pencil in pale light gray. Clean bold black outlines, simple flat colors, pure white background, no arrows.",
    note: "Long horizontal pencil in Descriptor Blue beside short stubby pencil in Pale Gray",
  },
  {
    slot: 520,
    word: "heavy",
    displayName: "heavy",
    category: "Descriptors",
    framing: "object",
    hint: "A clean simple two-pan balance scale tipped steeply down on the left pan under a massive heavy solid iron kettlebell weight filled with vivid blue color, while the right pan floats high in the air carrying a delicate white feather in pale light gray. Bold black outlines, pure white background, no arrows.",
    note: "Balance scale tipped down on left under heavy iron weight in Blue vs feather in Pale Gray",
  },
  {
    slot: 521,
    word: "light",
    displayName: "light",
    category: "Descriptors",
    framing: "object",
    hint: "A clean simple two-pan balance scale tipped up high on the right pan carrying a delicate floating feather filled with vivid blue color, while the left pan rests down carrying a heavy iron kettlebell weight in pale light gray. Bold black outlines, pure white background, no arrows.",
    note: "Balance scale with floating feather in Blue vs heavy iron weight in Pale Gray",
  },
  {
    slot: 522,
    word: "thick",
    displayName: "thick",
    category: "Descriptors",
    framing: "object",
    hint: "Two rectangular geometric volumes standing side by side in isometric profile: a very thick chunky broad rectangular block filled with vivid blue color, beside a wafer-thin slender sheet in pale light gray. Bold black outlines, flat colors, pure white background.",
    note: "Chunky rectangular block in Descriptor Blue beside wafer-thin strip in Pale Gray",
  },
  {
    slot: 523,
    word: "thin",
    displayName: "thin",
    category: "Descriptors",
    framing: "object",
    hint: "Two rectangular geometric volumes standing side by side in isometric profile: a wafer-thin slender sheet filled with vivid blue color, beside a very thick chunky broad rectangular block in pale light gray. Bold black outlines, flat colors, pure white background.",
    note: "Wafer-thin strip in Descriptor Blue beside chunky rectangular block in Pale Gray",
  },
  {
    slot: 524,
    word: "wide",
    displayName: "wide",
    category: "Descriptors",
    framing: "object",
    hint: "Two doorway entrances side by side: a wide double-doorway swung completely open leaving a broad spacious open passageway filled with vivid blue color, beside a narrow single doorway nearly closed leaving only a pale light gray slit. Bold black outlines, flat colors, pure white background.",
    note: "Broad open doorway in Descriptor Blue beside narrow gap doorway in Pale Gray",
  },
];

function renderBarSvg(filledCount, totalCount = 4) {
  const width = 1200;
  const height = 260;
  const rx = 130;
  const strokeWidth = 36;
  const slant = 40;

  const pad = 20;
  const innerW = width - 2 * strokeWidth;
  const innerH = height - 2 * strokeWidth;
  const segW = (innerW - (totalCount + 1) * pad) / totalCount;

  let segs = "";
  for (let i = 0; i < totalCount; i++) {
    const isFilled = i < filledCount;
    const x = strokeWidth + pad + i * (segW + pad);
    const y = strokeWidth + pad;
    const fill = isFilled ? (i >= 2 ? "#FB8C00" : "#1E88E5") : "#E2E8F0";

    segs += `<polygon points="${x + slant},${y} ${x + segW + slant},${y} ${x + segW},${y + innerH - 2 * pad} ${x},${y + innerH - 2 * pad}" fill="${fill}" />\n`;
  }

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <clipPath id="pill-clip">
        <rect x="${strokeWidth}" y="${strokeWidth}" width="${innerW}" height="${innerH}" rx="${rx - strokeWidth}" />
      </clipPath>
    </defs>
    <rect x="${strokeWidth / 2}" y="${strokeWidth / 2}" width="${width - strokeWidth}" height="${height - strokeWidth}" rx="${rx}" fill="#FFFFFF" stroke="#1A1A1A" stroke-width="${strokeWidth}" />
    <g clip-path="url(#pill-clip)">
      ${segs}
    </g>
  </svg>`;
}

async function attachVelocityBar(imagePath, filledCount) {
  const barSvg = renderBarSvg(filledCount, 4);
  const barBuf = await sharp(Buffer.from(barSvg)).png().toBuffer();

  const { data, info } = await sharp(imagePath).raw().toBuffer({ resolveWithObject: true });
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
  const canvasSize = 1600;

  // Resize subject to fit nicely in top 65% of 1600x1600
  const maxSubjectW = 1350;
  const maxSubjectH = 880;
  const scale = Math.min(maxSubjectW / bw, maxSubjectH / bh, 1.0);
  const targetW = Math.round(bw * scale);
  const targetH = Math.round(bh * scale);

  const croppedSubject = await sharp(imagePath)
    .extract({ left: minX, top: minY, width: bw, height: bh })
    .resize(targetW, targetH, { fit: "contain" })
    .toBuffer();

  // Position subject in upper zone
  const subjectTop = Math.round(140 + (maxSubjectH - targetH) / 2);
  const subjectLeft = Math.round((canvasSize - targetW) / 2);

  // Position bar at bottom
  const barTop = 1180;
  const barLeft = 200;

  const composited = await sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([
      { input: croppedSubject, top: subjectTop, left: subjectLeft },
      { input: barBuf, top: barTop, left: barLeft },
    ])
    .png()
    .toBuffer();

  writeFileSync(imagePath, composited);
  console.log(`Attached velocity bar (${filledCount}/4) to ${imagePath}`);
}

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
  console.log(`Starting Batch 52 generation (${BATCH52.length} words: Physical Dimensions & Speed Descriptors)...`);

  for (let i = 0; i < BATCH52.length; i++) {
    const item = BATCH52[i];
    const out = `${BRAIN_DIR}/batch52_${item.word}.png`;

    if (existsSync(out) && !process.argv.includes("--force")) {
      console.log(`Slot #${item.slot} ("${item.displayName}") already exists at ${out}. Skipping.`);
      continue;
    }

    console.log(`\n[${i + 1}/${BATCH52.length}] Generating slot #${item.slot}: "${item.displayName}"...`);
    const start = Date.now();

    try {
      if (item.customSource === "hedge_tall") {
        const src = `${BRAIN_DIR}/test_tall_hedge.png`;
        const buf = readFileSync(src);
        writeFileSync(out, buf);
        await normalizeToSquare(out);
        console.log(`Copied and normalized tall hedge -> ${out}`);
      } else if (item.customSource === "hedge_short") {
        const src = `${BRAIN_DIR}/hedge_short_cloned.png`;
        const buf = readFileSync(src);
        writeFileSync(out, buf);
        await normalizeToSquare(out);
        console.log(`Copied and normalized short hedge clone -> ${out}`);
      } else {
        await generateToFile({
          word: item.displayName,
          torso: null,
          framing: item.framing ?? "object",
          hint: item.hint,
          out,
        });
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.log(`Generated slot #${item.slot}: "${item.displayName}" in ${elapsed}s -> ${out}`);

        if (item.word === "fast") {
          await attachVelocityBar(out, 3); // 3 of 4 filled
        } else if (item.word === "slow") {
          await attachVelocityBar(out, 1); // 1 of 4 filled
        } else {
          await normalizeToSquare(out);
        }
      }
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

  console.log("Building 48px clinical strip...");
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

  console.log("Building lightweight batch52_review.html...");
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

if (process.argv[1]?.endsWith("batch52.mjs")) {
  run().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
