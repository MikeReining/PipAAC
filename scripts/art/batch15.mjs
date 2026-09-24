import { generateToFile } from "./gen.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH15 = [
  {
    slot: 142,
    word: "ear",
    entity_mode: "organic_noun",
    framing: "object",
    hint: "A clean standalone human ear in 3/4 perspective with clear anatomical curves and earlobe, bold black outline, solid color fill, pure white background.",
    note: "Standalone ear (Bucket A: organic_noun)",
  },
  {
    slot: 143,
    word: "nose",
    entity_mode: "organic_noun",
    framing: "object",
    hint: "A clean standalone human nose in 3/4 angle showing nostrils and bridge, bold black outline, solid color fill, pure white background.",
    note: "Standalone nose (Bucket A: organic_noun)",
  },
  {
    slot: 144,
    word: "mouth",
    entity_mode: "organic_noun",
    framing: "object",
    hint: "A clean standalone open mouth with gentle smiling lips and visible white teeth, bold black outline, pure white background.",
    note: "Standalone mouth with lips & teeth (Bucket A: organic_noun)",
  },
  {
    slot: 145,
    word: "teeth",
    entity_mode: "organic_noun",
    framing: "object",
    hint: "A clean standalone row of healthy white teeth smiling, clear gumline and individual teeth, bold black outline, pure white background.",
    note: "Clean row of white teeth (Bucket A: organic_noun)",
  },
  {
    slot: 146,
    word: "tongue",
    entity_mode: "organic_noun",
    framing: "object",
    hint: "A clean standalone pink tongue sticking out from gentle lips, bold black outline, solid color fill, pure white background.",
    note: "Standalone pink tongue (Bucket A: organic_noun)",
  },
  {
    slot: 147,
    word: "neck",
    entity_mode: "anatomy_relational",
    hint: "A simplified neutral stick figure head and shoulders with a bold clean black directional arrow pointing directly to the neck.",
    note: "Head & shoulders context with arrow to neck (Bucket C)",
  },
  {
    slot: 148,
    word: "shoulder",
    entity_mode: "anatomy_relational",
    hint: "A simplified neutral stick figure bust with a bold clean black directional arrow pointing directly to one shoulder.",
    note: "Bust context with arrow to shoulder (Bucket C)",
  },
  {
    slot: 149,
    word: "arm",
    entity_mode: "anatomy_relational",
    hint: "A simplified neutral stick figure torso and arm with a bold clean black directional arrow pointing directly to the arm.",
    note: "Torso & arm context with arrow to arm (Bucket C)",
  },
  {
    slot: 150,
    word: "hand",
    entity_mode: "organic_noun",
    framing: "object",
    hint: "A clean standalone open human hand with five fingers spread apart, palm facing forward, bold black outline, solid color fill, pure white background.",
    note: "Standalone open hand (Bucket A: organic_noun)",
  },
  {
    slot: 151,
    word: "fingers",
    entity_mode: "anatomy_relational",
    hint: "A clean standalone open human hand with a bold clean black directional arrow pointing directly to the fingers.",
    note: "Hand context with arrow pointing to fingers (Bucket C)",
  },
];

async function run() {
  console.log(`Starting Batch 15 generation (${BATCH15.length} words: Sensory Organs & Anatomy)...`);

  for (let i = 0; i < BATCH15.length; i++) {
    const item = BATCH15[i];
    const out = `${BRAIN_DIR}/batch15_${item.word}.png`;
    console.log(`\n[${i + 1}/${BATCH15.length}] Generating slot ${item.slot}: "${item.word}"...`);
    const start = Date.now();
    try {
      await generateToFile({
        word: item.word,
        entity_mode: item.entity_mode,
        framing: item.framing ?? null,
        hint: item.hint,
        out,
      });
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`Done slot ${item.slot}: "${item.word}" in ${elapsed}s -> ${out}`);
    } catch (err) {
      console.error(`FAILED slot ${item.slot}: "${item.word}"`, err);
    }
  }

  console.log("\nBuilding lightweight batch15_gallery.html...");
  let cards = "";
  for (const item of BATCH15) {
    const imgPath = `${BRAIN_DIR}/batch15_${item.word}.png`;
    const imgBuf = readFileSync(imgPath);
    const thumbBuf = await sharp(imgBuf)
      .resize(256, 256, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .webp({ quality: 85 })
      .toBuffer();
    const b64 = thumbBuf.toString("base64");

    cards += `
      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:12px; display:flex; flex-direction:column; align-items:center; box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <div style="font-size:11px; font-weight:700; color:#94a3b8; margin-bottom:4px;">#${item.slot}</div>
        <img src="data:image/webp;base64,${b64}" style="width:100%; max-width:180px; aspect-ratio:1/1; object-fit:contain; border-radius:8px;" alt="${item.word}" />
        <div style="margin-top:10px; font-weight:700; font-size:16px; text-transform:capitalize; color:#0f172a;">${item.word}</div>
        <div style="font-size:12px; color:#64748b; text-align:center; margin-top:4px;">${item.note}</div>
      </div>
    `;
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Batch 15 Gallery (Sensory Organs & Anatomy — Slots 142–151)</title>
</head>
<body style="margin:0; padding:16px; font-family:-apple-system, BlinkMacSystemFont, sans-serif; background:#f8fafc; color:#0f172a;">
  <h2 style="margin:0 0 4px 0; font-size:20px; font-weight:800;">Batch 15: Sensory Organs & Anatomy (Slots 142–151)</h2>
  <p style="margin:0 0 16px 0; font-size:13px; color:#64748b;">Standalone Organs (Bucket A: object-v1) and Relational Anatomy (Bucket C: pip-v1 + arrow)</p>
  <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:12px;">
    ${cards}
  </div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch15_gallery.html`, html, "utf8");
  const sizeKB = Math.round(Buffer.byteLength(html) / 1024);
  console.log(`Saved batch15_gallery.html -> ${sizeKB} KB (lightweight, under 20MB limit!)`);
}

run().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
