import { generateToFile } from "./gen.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH22 = [
  {
    slot: 215,
    word: "jump",
    displayName: "jump",
    torso: "green",
    framing: "full",
    hint: "The stick figure is jumping high in mid-air with knees tucked/bent and both arms raised joyfully upward. There is clear open space beneath their feet with small curved motion curves indicating an upward leap.",
    note: "Jumping high in mid-air with bent knees (full)",
  },
  {
    slot: 216,
    word: "walk",
    displayName: "walk",
    torso: "green",
    framing: "full",
    hint: "The stick figure is walking forward in a steady, calm stride, one leg forward and one leg back, arms swinging naturally in walking cadence.",
    note: "Walking forward in calm steady stride (full)",
  },
  {
    slot: 217,
    word: "sit",
    displayName: "sit",
    torso: "green",
    framing: "full",
    hint: "The stick figure is sitting neatly and upright on a simple clean blue four-legged chair, with knees bent at a ninety degree angle and hands resting calmly on their lap.",
    note: "Sitting upright on clean four-legged chair (full)",
  },
  {
    slot: 218,
    word: "stand",
    displayName: "stand",
    torso: "green",
    framing: "full",
    hint: "The stick figure is standing straight, balanced, and upright on both feet on the ground, arms resting naturally at their sides, with a pleasant calm posture. Direct counterpart to sit.",
    note: "Standing straight and upright on two feet (full)",
  },
  {
    slot: 219,
    word: "climb",
    displayName: "climb",
    torso: "green",
    framing: "full",
    hint: "The stick figure is actively climbing up a simple vertical wooden ladder, with hands gripping the ladder rungs and feet stepping up the rungs.",
    note: "Climbing up a vertical wooden ladder (full)",
  },
  {
    slot: 220,
    word: "dance",
    displayName: "dance",
    torso: "green",
    framing: "full",
    hint: "The stick figure is striking a joyful, expressive dance pose with curved graceful arms and one leg lifted/bent in rhythm, with two subtle musical notes floating nearby.",
    note: "Joyful rhythmic dance pose with musical notes (full)",
  },
  {
    slot: 221,
    word: "swim",
    displayName: "swim",
    torso: "green",
    framing: "full",
    hint: "The stick figure is swimming forward through clean blue water waves, one arm extended forward in a front crawl swimming stroke, with gentle surface water ripples.",
    note: "Swimming through clean blue water waves (full)",
  },
  {
    slot: 222,
    word: "ride",
    displayName: "ride",
    torso: "green",
    framing: "full",
    hint: "The stick figure is riding a simple classic red bicycle, sitting on the seat with hands gripping the handlebars and feet on the pedals.",
    note: "Riding a red bicycle with hands on handlebars (full)",
  },
  {
    slot: 223,
    word: "crawl",
    displayName: "crawl",
    torso: "green",
    framing: "full",
    hint: "The stick figure is crawling forward on all fours, with hands and knees on the ground, head raised looking forward.",
    note: "Crawling on hands and knees on the ground (full)",
  },
  {
    slot: 224,
    word: "kick",
    displayName: "kick",
    torso: "green",
    framing: "full",
    hint: "The stick figure is kicking a classic black-and-white soccer ball forward with one extended foot, showing dynamic athletic motion.",
    note: "Kicking a soccer ball forward with extended foot (full)",
  },
];

async function run() {
  console.log(`Starting Batch 22 generation (${BATCH22.length} words: Daily Actions & Activity Verbs)...`);

  for (let i = 0; i < BATCH22.length; i++) {
    const item = BATCH22[i];
    const out = `${BRAIN_DIR}/batch22_${item.word}.png`;
    if (existsSync(out) && !process.argv.includes("--force")) {
      console.log(`Slot ${item.slot} ("${item.displayName}") already exists at ${out}. Skipping generation.`);
      continue;
    }
    console.log(`\n[${i + 1}/${BATCH22.length}] Generating slot ${item.slot}: "${item.displayName}"...`);
    const start = Date.now();
    try {
      await generateToFile({
        word: item.displayName,
        torso: item.torso ?? null,
        framing: item.framing ?? null,
        hint: item.hint,
        out,
      });
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`Done slot ${item.slot}: "${item.displayName}" in ${elapsed}s -> ${out}`);
    } catch (err) {
      console.error(`FAILED slot ${item.slot}: "${item.displayName}"`, err);
    }
  }

  console.log("\nBuilding lightweight batch22_gallery.html...");
  let cards = "";
  for (const item of BATCH22) {
    const imgPath = `${BRAIN_DIR}/batch22_${item.word}.png`;
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
  <title>Batch 22 Gallery (Daily Actions & Activity Verbs — Slots 215–224)</title>
</head>
<body style="margin:0; padding:16px; font-family:-apple-system, BlinkMacSystemFont, sans-serif; background:#f8fafc; color:#0f172a;">
  <h2 style="margin:0 0 4px 0; font-size:20px; font-weight:800;">Batch 22: Daily Actions & Activity Verbs (Slots 215–224)</h2>
  <p style="margin:0 0 16px 0; font-size:13px; color:#64748b;">Fitzgerald Green Verbs · Gross Motor & Locomotion</p>
  <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:12px;">
    ${cards}
  </div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch22_gallery.html`, html, "utf8");
  const sizeKB = Math.round(Buffer.byteLength(html) / 1024);
  console.log(`Saved batch22_gallery.html -> ${sizeKB} KB (lightweight)`);

  console.log("Building composite grid...");
  const cols = 5;
  const rows = 2;
  const tileSize = 300;
  const pad = 10;
  const gridW = cols * tileSize + (cols + 1) * pad;
  const gridH = rows * tileSize + (rows + 1) * pad;

  const composites = [];
  for (let i = 0; i < BATCH22.length; i++) {
    const item = BATCH22[i];
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = pad + c * (tileSize + pad);
    const y = pad + r * (tileSize + pad);
    const imgPath = `${BRAIN_DIR}/batch22_${item.word}.png`;
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
  .toFile(`${BRAIN_DIR}/batch22_grid.png`);

  console.log("Saved batch22_grid.png");

  console.log("Building 48x48 preview strip...");
  const stripCols = BATCH22.length;
  const stripCell = 64; // 48px image + 16px padding
  const stripW = stripCols * stripCell;
  const stripH = stripCell;
  const stripComposites = [];

  for (let i = 0; i < BATCH22.length; i++) {
    const item = BATCH22[i];
    const imgPath = `${BRAIN_DIR}/batch22_${item.word}.png`;
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
  .toFile(`${BRAIN_DIR}/batch22_strip_48.png`);

  console.log("Saved batch22_strip_48.png");
}

run().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
