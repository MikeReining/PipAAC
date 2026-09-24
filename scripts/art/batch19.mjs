import { generateToFile } from "./gen.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH19 = [
  {
    slot: 182,
    word: "scared",
    displayName: "scared",
    framing: "face",
    hint: "A round stick figure face with wide staring circle eyes and a wavy trembling mouth, looking scared.",
    note: "Wide staring eyes, trembling mouth (face)",
  },
  {
    slot: 183,
    word: "excited",
    displayName: "excited",
    framing: "face",
    hint: "A round stick figure face with bright joyful wide eyes and a huge happy open smile, looking excited.",
    note: "Bright wide eyes, huge happy smile (face)",
  },
  {
    slot: 184,
    word: "silly",
    displayName: "silly",
    framing: "face",
    hint: "A round stick figure face with one eye winking and a pink tongue playfully sticking out of the mouth, looking silly.",
    note: "Winking eye, playful tongue out (face)",
  },
  {
    slot: 185,
    word: "nervous",
    displayName: "nervous",
    framing: "face",
    hint: "A round stick figure face with worried eyes, a small blue sweat drop on the side of the head, and a tight wavy mouth, looking nervous.",
    note: "Worried eyes, sweat drop, wavy mouth (face)",
  },
  {
    slot: 186,
    word: "calm",
    displayName: "calm",
    framing: "face",
    hint: "A round stick figure face with peaceful closed curved eye lines and a gentle small serene smile, looking calm and relaxed.",
    note: "Peaceful closed eyes, serene smile (face)",
  },
  {
    slot: 187,
    word: "frustrated",
    displayName: "frustrated",
    framing: "face",
    hint: "A round stick figure face with furrowed eyebrows, squinted eyes, and a tight gritted wavy mouth, looking frustrated.",
    note: "Furrowed brow, squinted eyes, tight mouth (face)",
  },
  {
    slot: 188,
    word: "proud",
    displayName: "proud",
    framing: "face",
    hint: "A round stick figure face with a confident pleased smile and warm shining eyes, looking proud.",
    note: "Confident pleased smile, warm eyes (face)",
  },
  {
    slot: 189,
    word: "shy",
    displayName: "shy",
    framing: "face",
    hint: "A round stick figure face with eyes bashfully looking downward to the side, soft small smile, and gentle pink blush marks on the cheeks, looking shy.",
    note: "Eyes looking down, bashful smile, blush (face)",
  },
  {
    slot: 190,
    word: "surprised",
    displayName: "surprised",
    framing: "face",
    hint: "A round stick figure face with raised arched eyebrows, wide circular eyes, and a wide round open 'O' shaped mouth, looking surprised.",
    note: "Raised eyebrows, wide eyes, open 'O' mouth (face)",
  },
  {
    slot: 191,
    word: "bored",
    displayName: "bored",
    framing: "face",
    hint: "A round stick figure face with heavy half-closed droopy eyelids and a flat straight horizontal line mouth, looking bored and uninterested.",
    note: "Heavy droopy eyelids, flat line mouth (face)",
  },
];

async function run() {
  console.log(`Starting Batch 19 generation (${BATCH19.length} words: Feelings & Emotions)...`);

  for (let i = 0; i < BATCH19.length; i++) {
    const item = BATCH19[i];
    const out = `${BRAIN_DIR}/batch19_${item.word}.png`;
    if (existsSync(out) && !process.argv.includes("--force")) {
      console.log(`Slot ${item.slot} ("${item.displayName}") already exists at ${out}. Skipping generation.`);
      continue;
    }
    console.log(`\n[${i + 1}/${BATCH19.length}] Generating slot ${item.slot}: "${item.displayName}"...`);
    const start = Date.now();
    try {
      await generateToFile({
        word: item.displayName,
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

  console.log("\nBuilding lightweight batch19_gallery.html...");
  let cards = "";
  for (const item of BATCH19) {
    const imgPath = `${BRAIN_DIR}/batch19_${item.word}.png`;
    const imgBuf = readFileSync(imgPath);
    const thumbBuf = await sharp(imgBuf)
      .resize(256, 256, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .webp({ quality: 85 })
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
  <title>Batch 19 Gallery (Feelings & Emotions — Slots 182–191)</title>
</head>
<body style="margin:0; padding:16px; font-family:-apple-system, BlinkMacSystemFont, sans-serif; background:#f8fafc; color:#0f172a;">
  <h2 style="margin:0 0 4px 0; font-size:20px; font-weight:800;">Batch 19: Feelings & Emotions (Slots 182–191)</h2>
  <p style="margin:0 0 16px 0; font-size:13px; color:#64748b;">Feelings, Emotions & Sensory States (Unified Face Family)</p>
  <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:12px;">
    ${cards}
  </div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch19_gallery.html`, html, "utf8");
  const sizeKB = Math.round(Buffer.byteLength(html) / 1024);
  console.log(`Saved batch19_gallery.html -> ${sizeKB} KB (lightweight)`);

  console.log("Building 2x5 grid...");
  const cols = 5;
  const rows = 2;
  const tileSize = 300;
  const pad = 10;
  const gridW = cols * tileSize + (cols + 1) * pad;
  const gridH = rows * tileSize + (rows + 1) * pad;

  const composites = [];
  for (let i = 0; i < BATCH19.length; i++) {
    const item = BATCH19[i];
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = pad + c * (tileSize + pad);
    const y = pad + r * (tileSize + pad);
    const imgPath = `${BRAIN_DIR}/batch19_${item.word}.png`;
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
  .toFile(`${BRAIN_DIR}/batch19_grid.png`);

  console.log("Saved batch19_grid.png");
}

run().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
