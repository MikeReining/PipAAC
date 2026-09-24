import { generateToFile } from "./gen.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH17 = [
  {
    slot: 162,
    word: "wet_wipe",
    displayName: "wet wipe",
    entity_mode: "organic_noun",
    framing: "object",
    hint: "A clean plastic flip-top pack of wet baby wipes with one white sheet pulling out of the top opening, bold clean black outlines on pure white background.",
    note: "Flip-top wipes pack with pull sheet (object-v1)",
  },
  {
    slot: 163,
    word: "bath",
    displayName: "bath",
    entity_mode: "organic_noun",
    framing: "object",
    hint: "A clean white bathtub filled with bubbly warm water and gentle foam, bold clean black outlines on pure white background.",
    note: "Bathtub with bubbly water (object-v1)",
  },
  {
    slot: 164,
    word: "shower",
    displayName: "shower",
    entity_mode: "organic_noun",
    framing: "object",
    hint: "A clean modern metallic shower head spraying gentle streams of water downward, bold clean black outlines on pure white background.",
    note: "Shower head with water streams (object-v1)",
  },
  {
    slot: 165,
    word: "soap",
    displayName: "soap",
    entity_mode: "organic_noun",
    framing: "object",
    hint: "A clean rectangular bar of soap with a few gentle foam bubbles, bold clean black outlines on pure white background.",
    note: "Bar of soap with bubbles (object-v1)",
  },
  {
    slot: 166,
    word: "toothbrush",
    displayName: "toothbrush",
    entity_mode: "organic_noun",
    framing: "object",
    hint: "A clean colorful manual toothbrush with soft bristles and a neat dab of toothpaste, bold clean black outlines on pure white background.",
    note: "Toothbrush with toothpaste (object-v1)",
  },
  {
    slot: 167,
    word: "toothpaste",
    displayName: "toothpaste",
    entity_mode: "organic_noun",
    framing: "object",
    hint: "A clean tube of toothpaste with the cap open and a neat swirl of paste emerging from the tip, bold clean black outlines on pure white background.",
    note: "Tube of toothpaste (object-v1)",
  },
  {
    slot: 168,
    word: "towel",
    displayName: "towel",
    entity_mode: "organic_noun",
    framing: "object",
    hint: "A neat plush folded bath towel with soft fluffy texture, bold clean black outlines on pure white background.",
    note: "Folded plush bath towel (object-v1)",
  },
  {
    slot: 169,
    word: "comb",
    displayName: "comb",
    entity_mode: "organic_noun",
    framing: "object",
    hint: "A clean plastic hair comb with straight teeth and a sturdy handle, bold clean black outlines on pure white background.",
    note: "Hair comb with handle (object-v1)",
  },
  {
    slot: 170,
    word: "tissue",
    displayName: "tissue",
    entity_mode: "organic_noun",
    framing: "object",
    hint: "A clean square decorative tissue box with a single soft white facial tissue popping out of the top, bold clean black outlines on pure white background.",
    note: "Box of facial tissues (object-v1)",
  },
  {
    slot: 171,
    word: "bandage",
    displayName: "bandage",
    entity_mode: "organic_noun",
    framing: "object",
    hint: "A clean adhesive strip bandage with a center absorbent pad, bold clean black outlines on pure white background.",
    note: "Adhesive strip bandage (object-v1)",
  },
];

async function run() {
  console.log(`Starting Batch 17 generation (${BATCH17.length} words: Daily Care, Hygiene & Grooming)...`);

  for (let i = 0; i < BATCH17.length; i++) {
    const item = BATCH17[i];
    const out = `${BRAIN_DIR}/batch17_${item.word}.png`;
    console.log(`\n[${i + 1}/${BATCH17.length}] Generating slot ${item.slot}: "${item.displayName}"...`);
    const start = Date.now();
    try {
      await generateToFile({
        word: item.displayName,
        entity_mode: item.entity_mode,
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

  console.log("\nBuilding lightweight batch17_gallery.html...");
  let cards = "";
  for (const item of BATCH17) {
    const imgPath = `${BRAIN_DIR}/batch17_${item.word}.png`;
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
  <title>Batch 17 Gallery (Daily Care & Hygiene — Slots 162–171)</title>
</head>
<body style="margin:0; padding:16px; font-family:-apple-system, BlinkMacSystemFont, sans-serif; background:#f8fafc; color:#0f172a;">
  <h2 style="margin:0 0 4px 0; font-size:20px; font-weight:800;">Batch 17: Daily Care & Hygiene (Slots 162–171)</h2>
  <p style="margin:0 0 16px 0; font-size:13px; color:#64748b;">Daily Care, Hygiene & Grooming Objects (Bucket A / object-v1)</p>
  <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:12px;">
    ${cards}
  </div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch17_gallery.html`, html, "utf8");
  const sizeKB = Math.round(Buffer.byteLength(html) / 1024);
  console.log(`Saved batch17_gallery.html -> ${sizeKB} KB (lightweight, under 20MB limit!)`);
}

run().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
