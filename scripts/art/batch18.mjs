import { generateToFile } from "./gen.mjs";
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const SYMBOLS_DIR = "/Users/mike/dev/PipAAC/assets/symbols";

const BATCH18 = [
  {
    slot: 172,
    word: "hurt",
    displayName: "hurt",
    existingFile: `${SYMBOLS_DIR}/hurt.png`,
    note: "Existing mastered Core 60 symbol (Batch 4)",
  },
  {
    slot: 173,
    word: "sick",
    displayName: "sick",
    torso: "blue",
    framing: "bust",
    hint: "The stick figure has a clinical thermometer in their mouth and a tired, sick facial expression.",
    note: "Stick figure with thermometer (bust)",
  },
  {
    slot: 174,
    word: "pain",
    displayName: "pain",
    framing: "diagram",
    social_scale: "zero",
    hint: "A bold red jagged starburst ache symbol indicating sharp pain, with clean bold black outlines on pure white background.",
    note: "Red pain starburst (diagram)",
  },
  {
    slot: 175,
    word: "fever",
    displayName: "fever",
    framing: "object",
    entity_mode: "organic_noun",
    hint: "A clean clinical thermometer showing high red mercury temperature, bold clean black outlines on pure white background.",
    note: "Thermometer with high red mercury (object-v1)",
  },
  {
    slot: 176,
    word: "cough",
    displayName: "cough",
    torso: "green",
    framing: "bust",
    hint: "The stick figure is coughing into their bent elbow with two small curved air puff lines.",
    note: "Stick figure coughing into elbow (bust)",
  },
  {
    slot: 177,
    word: "medicine",
    displayName: "medicine",
    framing: "object",
    entity_mode: "organic_noun",
    hint: "A clean medicine bottle with a white cap and a small measuring spoon beside it, bold clean black outlines on pure white background.",
    note: "Medicine bottle with spoon (object-v1)",
  },
  {
    slot: 178,
    word: "dentist",
    displayName: "dentist",
    torso: "yellow",
    framing: "bust",
    hint: "A stick figure dentist wearing a light face mask and holding a round dental examination mirror.",
    note: "Stick figure dentist with mirror (bust)",
  },
  {
    slot: 179,
    word: "sad",
    displayName: "sad",
    existingFile: `${SYMBOLS_DIR}/sad.png`,
    note: "Existing mastered Core 60 symbol (Batch 3)",
  },
  {
    slot: 180,
    word: "mad",
    displayName: "mad",
    framing: "face",
    hint: "A round stick figure face with angled eyebrows pointing down inward and a frowning mouth, looking mad.",
    note: "Stick figure face with angled brow (face)",
  },
  {
    slot: 181,
    word: "angry",
    displayName: "angry",
    framing: "face",
    hint: "A round stick figure face with sharp angled eyebrows and a clenched grimacing mouth, looking angry.",
    note: "Stick figure face grimacing angry (face)",
  },
];

async function run() {
  console.log(`Starting Batch 18 processing (${BATCH18.length} words: Health & Feelings)...`);

  for (let i = 0; i < BATCH18.length; i++) {
    const item = BATCH18[i];
    const out = `${BRAIN_DIR}/batch18_${item.word}.png`;

    if (item.existingFile) {
      console.log(`\n[${i + 1}/${BATCH18.length}] Slot ${item.slot}: "${item.displayName}" (copying existing approved master)...`);
      copyFileSync(item.existingFile, out);
      console.log(`Copied ${item.existingFile} -> ${out}`);
      continue;
    }

    console.log(`\n[${i + 1}/${BATCH18.length}] Generating slot ${item.slot}: "${item.displayName}"...`);
    const start = Date.now();
    try {
      await generateToFile({
        word: item.displayName,
        torso: item.torso ?? null,
        entity_mode: item.entity_mode ?? null,
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

  console.log("\nBuilding lightweight batch18_gallery.html...");
  let cards = "";
  for (const item of BATCH18) {
    const imgPath = `${BRAIN_DIR}/batch18_${item.word}.png`;
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
  <title>Batch 18 Gallery (Health & Feelings — Slots 172–181)</title>
</head>
<body style="margin:0; padding:16px; font-family:-apple-system, BlinkMacSystemFont, sans-serif; background:#f8fafc; color:#0f172a;">
  <h2 style="margin:0 0 4px 0; font-size:20px; font-weight:800;">Batch 18: Health & Feelings (Slots 172–181)</h2>
  <p style="margin:0 0 16px 0; font-size:13px; color:#64748b;">Body, Health & Hygiene (conclusion) + Feelings & Emotions</p>
  <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:12px;">
    ${cards}
  </div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch18_gallery.html`, html, "utf8");
  const sizeKB = Math.round(Buffer.byteLength(html) / 1024);
  console.log(`Saved batch18_gallery.html -> ${sizeKB} KB (lightweight)`);

  console.log("Building 2x5 grid...");
  const cols = 5;
  const rows = 2;
  const tileSize = 300;
  const pad = 10;
  const gridW = cols * tileSize + (cols + 1) * pad;
  const gridH = rows * tileSize + (rows + 1) * pad;

  const composites = [];
  for (let i = 0; i < BATCH18.length; i++) {
    const item = BATCH18[i];
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = pad + c * (tileSize + pad);
    const y = pad + r * (tileSize + pad);
    const imgPath = `${BRAIN_DIR}/batch18_${item.word}.png`;
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
  .toFile(`${BRAIN_DIR}/batch18_grid.png`);

  console.log("Saved batch18_grid.png");
}

run().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
