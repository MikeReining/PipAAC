import { generateToFile } from "./gen.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH24 = [
  {
    slot: 235,
    word: "draw",
    displayName: "draw",
    torso: "green",
    framing: "bust",
    hint: "The stick figure is sitting holding a black crayon in hand, actively drawing a simple cheerful smiling sun outline on a clean white sheet of paper on the table.",
    note: "Drawing smiling sun with crayon on paper (bust)",
  },
  {
    slot: 236,
    word: "color",
    displayName: "color",
    torso: "green",
    framing: "bust",
    hint: "The stick figure is holding a bright red crayon, actively coloring and filling in a bold star shape on paper with vibrant red color strokes.",
    note: "Coloring inside star shape with red crayon (bust)",
  },
  {
    slot: 237,
    word: "paint",
    displayName: "paint",
    torso: "green",
    framing: "bust",
    hint: "The stick figure is holding a wooden artist paintbrush with blue paint on the bristles, making a bold curved blue paint stroke across a clean white easel canvas.",
    note: "Painting blue stroke on easel with brush (bust)",
  },
  {
    slot: 238,
    word: "cut",
    displayName: "cut",
    framing: "object",
    hint: "A pair of child-safe scissors with blue plastic handles actively cutting along a crisp dashed line on a clean sheet of paper.",
    note: "Scissors cutting along dashed paper line (object)",
  },
  {
    slot: 239,
    word: "glue",
    displayName: "glue",
    framing: "object",
    hint: "A classic white plastic glue bottle with a bright orange nozzle, gently tilted and squeezing a single clean droplet of glue onto paper.",
    note: "Glue bottle dispensing droplet on paper (object)",
  },
  {
    slot: 240,
    word: "listen",
    displayName: "listen",
    torso: "green",
    framing: "bust",
    hint: "The stick figure has one hand cupped behind their ear, tilting their head to listen attentively, with two clean subtle musical notes floating nearby in the air.",
    note: "Cupping hand behind ear listening to notes (bust)",
  },
  {
    slot: 241,
    word: "speak",
    displayName: "speak",
    torso: "green",
    framing: "bust",
    hint: "The stick figure has an open mouth speaking clearly forward, with clean curved sound wave arcs radiating outward from their mouth.",
    note: "Open mouth speaking with radiating sound waves (bust)",
  },
  {
    slot: 242,
    word: "talk",
    displayName: "talk",
    torso: "green",
    framing: "bust",
    social_scale: "pair",
    hint: "Two friendly stick figures facing each other in conversation, both wearing solid green shirts, with small clean speech bubbles between them showing dialogue.",
    note: "Two figures in conversation with speech bubbles (pair bust)",
  },
  {
    slot: 243,
    word: "sing",
    displayName: "sing",
    torso: "green",
    framing: "bust",
    hint: "The stick figure has their head tilted up with an open joyful singing mouth, with musical notes floating upward from their mouth into the air.",
    note: "Singing with open mouth and floating musical notes (bust)",
  },
  {
    slot: 244,
    word: "count",
    displayName: "count",
    torso: "green",
    framing: "bust",
    hint: "The stick figure is pointing an extended index finger at three colorful square blocks in a row on the table (red, yellow, blue), counting them one by one with a happy focused smile.",
    note: "Pointing finger counting 3 colorful blocks (bust)",
  },
];

async function run() {
  console.log(`Starting Batch 24 generation (${BATCH24.length} words: Creative Actions & Communication Verbs)...`);

  for (let i = 0; i < BATCH24.length; i++) {
    const item = BATCH24[i];
    const out = `${BRAIN_DIR}/batch24_${item.word}.png`;
    if (existsSync(out) && !process.argv.includes("--force")) {
      console.log(`Slot ${item.slot} ("${item.displayName}") already exists at ${out}. Skipping generation.`);
      continue;
    }
    console.log(`\n[${i + 1}/${BATCH24.length}] Generating slot ${item.slot}: "${item.displayName}"...`);
    const start = Date.now();
    try {
      await generateToFile({
        word: item.displayName,
        torso: item.torso ?? null,
        framing: item.framing ?? null,
        social_scale: item.social_scale ?? null,
        hint: item.hint,
        out,
      });
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`Done slot ${item.slot}: "${item.displayName}" in ${elapsed}s -> ${out}`);
    } catch (err) {
      console.error(`FAILED slot ${item.slot}: "${item.displayName}"`, err);
    }
  }

  console.log("\nBuilding lightweight batch24_gallery.html...");
  let cards = "";
  for (const item of BATCH24) {
    const imgPath = `${BRAIN_DIR}/batch24_${item.word}.png`;
    if (!existsSync(imgPath)) continue;
    const imgBuf = readFileSync(imgPath);
    const thumbBuf = await sharp(imgBuf)
      .resize(200, 200, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .webp({ quality: 75 })
      .toBuffer();
    const b64 = thumbBuf.toString("base64");

    cards += `
      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:12px; display:flex; flex-direction:column; align-items:center; box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <div style="font-size:11px; font-weight:700; color:#94a3b8; margin-bottom:4px;">#${item.slot}</div>
        <img src="data:image/webp;base64,${b64}" style="width:100%; max-width:180px; aspect-ratio:1/1; object-fit:contain; border-radius:8px;" alt="${item.displayName}" />
        <div style="margin-top:10px; font-weight:700; font-size:16px; text-transform:capitalize; color:#0f172a;">${item.displayName}</div>
        <div style="font-size:12px; color:#64748b; text-align:center; margin-top:4px;">${item.note}</div>
      </div>
    `;
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Batch 24 Gallery (Creative & Communication Verbs — Slots 235–244)</title>
</head>
<body style="margin:0; padding:16px; font-family:-apple-system, BlinkMacSystemFont, sans-serif; background:#f8fafc; color:#0f172a;">
  <h2 style="margin:0 0 4px 0; font-size:20px; font-weight:800;">Batch 24: Creative Actions & Communication Verbs (Slots 235–244)</h2>
  <p style="margin:0 0 16px 0; font-size:13px; color:#64748b;">Fitzgerald Green Verbs · School, Art & Social Dialogue</p>
  <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:12px;">
    ${cards}
  </div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch24_gallery.html`, html, "utf8");
  const sizeKB = Math.round(Buffer.byteLength(html) / 1024);
  console.log(`Saved batch24_gallery.html -> ${sizeKB} KB (lightweight)`);

  console.log("Building composite grid...");
  const cols = 5;
  const rows = 2;
  const tileSize = 300;
  const pad = 10;
  const gridW = cols * tileSize + (cols + 1) * pad;
  const gridH = rows * tileSize + (rows + 1) * pad;

  const composites = [];
  for (let i = 0; i < BATCH24.length; i++) {
    const item = BATCH24[i];
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = pad + c * (tileSize + pad);
    const y = pad + r * (tileSize + pad);
    const imgPath = `${BRAIN_DIR}/batch24_${item.word}.png`;
    if (!existsSync(imgPath)) continue;
    const resized = await sharp(imgPath)
      .resize(tileSize, tileSize, { fit: "contain", background: { r: 255, g: 255, b: 255 } })
      .toBuffer();
    composites.push({ input: resized, top: y, left: x });
  }

  await sharp({
    create: {
      width: gridW,
      height: gridH,
      channels: 3,
      background: { r: 241, g: 245, b: 249 }
    }
  })
  .composite(composites)
  .png()
  .toFile(`${BRAIN_DIR}/batch24_grid.png`);

  console.log("Saved batch24_grid.png");

  console.log("Building 48x48 preview strip...");
  const stripCols = BATCH24.length;
  const stripCell = 64; // 48px image + 16px padding
  const stripW = stripCols * stripCell;
  const stripH = stripCell;
  const stripComposites = [];

  for (let i = 0; i < BATCH24.length; i++) {
    const item = BATCH24[i];
    const imgPath = `${BRAIN_DIR}/batch24_${item.word}.png`;
    if (!existsSync(imgPath)) continue;
    const mini = await sharp(imgPath)
      .resize(48, 48, { fit: "contain", background: { r: 255, g: 255, b: 255 } })
      .toBuffer();
    stripComposites.push({
      input: mini,
      top: 8,
      left: i * stripCell + 8,
    });
  }

  await sharp({
    create: {
      width: stripW,
      height: stripH,
      channels: 3,
      background: { r: 248, g: 250, b: 252 }
    }
  })
  .composite(stripComposites)
  .png()
  .toFile(`${BRAIN_DIR}/batch24_strip_48.png`);

  console.log("Saved batch24_strip_48.png");
}

run().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
