import { generateToFile } from "./gen.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

export const BATCH45 = [
  {
    slot: 447,
    word: "duck",
    displayName: "duck",
    category: "Animals",
    framing: "object",
    hint: "A clean standalone cheerful yellow duck with a bright orange duck bill and orange webbed feet, standing in profile.",
    note: "Bright yellow duck with orange bill and webbed feet",
  },
  {
    slot: 448,
    word: "hen",
    displayName: "hen",
    category: "Animals",
    framing: "object",
    hint: "A clean standalone brown barnyard hen chicken with a bright red comb on its head, red wattle, and brown speckled feathers, standing in profile.",
    note: "Barnyard hen with prominent red comb and wattle",
  },
  {
    slot: 449,
    word: "cow",
    displayName: "cow",
    category: "Animals",
    framing: "object",
    hint: "A clean standalone black-and-white spotted Holstein dairy cow standing in profile with a pink nose and pink udder.",
    note: "Classic black and white spotted dairy cow",
  },
  {
    slot: 450,
    word: "horse",
    displayName: "horse",
    category: "Animals",
    framing: "object",
    hint: "A clean standalone rich chestnut-brown horse standing proudly in profile with a dark flowing mane, long legs, and tail.",
    note: "Chestnut brown horse standing in profile",
  },
  {
    slot: 451,
    word: "pig",
    displayName: "pig",
    category: "Animals",
    framing: "object",
    hint: "A clean standalone cute chubby pink pig standing in profile with a curly tail and a prominent round flat snout.",
    note: "Chubby pink pig with flat snout and curly tail",
  },
  {
    slot: 452,
    word: "sheep",
    displayName: "sheep",
    category: "Animals",
    framing: "object",
    hint: "A clean standalone fluffy white woolly sheep with a dark black face, black ears, and black legs, standing in profile.",
    note: "Fluffy white woolly sheep with dark black face and legs",
  },
  {
    slot: 453,
    word: "goat",
    displayName: "goat",
    category: "Animals",
    framing: "object",
    hint: "A clean standalone tan and white farm goat standing in profile with backwards-curved horns and a distinct chin goatee beard.",
    note: "Farm goat with curved horns and chin goatee beard",
  },
  {
    slot: 454,
    word: "bear",
    displayName: "bear",
    category: "Animals",
    framing: "object",
    hint: "A clean standalone sturdy warm brown grizzly bear standing on all fours in profile with rounded ears and a thick snout.",
    note: "Sturdy brown bear standing on all fours",
  },
  {
    slot: 455,
    word: "lion",
    displayName: "lion",
    category: "Animals",
    framing: "object",
    hint: "A clean standalone proud golden-yellow male lion sitting or standing in profile with a magnificent full dark golden-brown mane and tufted tail.",
    note: "Male lion with full majestic mane and tufted tail",
  },
  {
    slot: 456,
    word: "tiger",
    displayName: "tiger",
    category: "Animals",
    framing: "object",
    hint: "A clean standalone vibrant orange tiger standing in profile with sharp black stripes and a white underbelly.",
    note: "Vibrant orange tiger with bold black stripes",
  },
];

async function padToSquare(filePath) {
  const meta = await sharp(filePath).metadata();
  if (meta.width === meta.height) return;
  const maxDim = Math.max(meta.width, meta.height);
  const buf = await sharp(filePath)
    .resize(maxDim, maxDim, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer();
  writeFileSync(filePath, buf);
  console.log(`Padded ${filePath} from ${meta.width}x${meta.height} -> ${maxDim}x${maxDim}`);
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
  console.log(`Starting Batch 45 generation (${BATCH45.length} words: Farm & Wild Animals)...`);

  for (let i = 0; i < BATCH45.length; i++) {
    const item = BATCH45[i];
    const out = `${BRAIN_DIR}/batch45_${item.word}.png`;
    if (existsSync(out) && !process.argv.includes("--force")) {
      console.log(`Slot #${item.slot} ("${item.displayName}") already exists at ${out}. Skipping.`);
      continue;
    }
    console.log(`\n[${i + 1}/${BATCH45.length}] Generating slot #${item.slot}: "${item.displayName}"...`);
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
      await padToSquare(out);
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
  for (let i = 0; i < BATCH45.length; i++) {
    const item = BATCH45[i];
    const imgPath = `${BRAIN_DIR}/batch45_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch45_grid.png`);
  console.log("Saved batch45_grid.png");

  console.log("Building 48px clinical strip...");
  const stripW = BATCH45.length * 64 + 16;
  const stripH = 64;
  const stripComposites = [];
  for (let i = 0; i < BATCH45.length; i++) {
    const item = BATCH45[i];
    const imgPath = `${BRAIN_DIR}/batch45_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch45_strip_48.png`);
  console.log("Saved batch45_strip_48.png");

  console.log("Building lightweight batch45_review.html...");
  const cardHtmls = [];
  for (const item of BATCH45) {
    const imgPath = `${BRAIN_DIR}/batch45_${item.word}.png`;
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
<title>Pip AAC — Clipart Batch 45 Review (#447–#456)</title>
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
<h1>Pip AAC — Clipart Batch 45 Review (#447–#456)</h1>
<div class="subtitle">Category 3.10 Animals & Nature: Farm & Wild Animals • High-contrast clinical motor grid evaluation</div>
<div class="grid-container">
${cardHtmls.join("")}
</div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch45_review.html`, html, "utf-8");
  console.log("Saved batch45_review.html");
}

if (process.argv[1]?.endsWith("batch45.mjs")) {
  run().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
