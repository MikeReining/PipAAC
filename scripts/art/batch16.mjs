import { generateToFile } from "./gen.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH16 = [
  {
    slot: 152,
    word: "tummy",
    entity_mode: "anatomy_relational",
    hint: "A simplified stick figure torso wearing a yellow shirt, with a bold clean black directional arrow pointing directly to the tummy.",
    note: "Torso context with arrow to tummy (Bucket C)",
  },
  {
    slot: 153,
    word: "back",
    entity_mode: "anatomy_relational",
    hint: "A simplified stick figure seen from behind wearing a yellow shirt, with a bold clean black directional arrow pointing directly to the back.",
    note: "Rear view context with arrow to back (Bucket C)",
  },
  {
    slot: 154,
    word: "leg",
    entity_mode: "anatomy_relational",
    hint: "A simplified stick figure standing in a yellow shirt, with a bold clean black directional arrow pointing directly to one leg.",
    note: "Standing figure with arrow to leg (Bucket C)",
  },
  {
    slot: 155,
    word: "knee",
    entity_mode: "anatomy_relational",
    hint: "A simplified stick figure with one bent leg, with a bold clean black directional arrow pointing directly to the knee joint.",
    note: "Bent leg context with arrow to knee (Bucket C)",
  },
  {
    slot: 156,
    word: "foot",
    entity_mode: "organic_noun",
    framing: "object",
    hint: "A clean standalone bare human foot in side profile, showing heel, arch, sole, and toes, bold clean black outlines on pure white background.",
    note: "Standalone bare foot (Bucket A: organic_noun)",
  },
  {
    slot: 157,
    word: "toes",
    entity_mode: "anatomy_relational",
    hint: "A clean bare human foot context with a bold clean black directional arrow pointing directly to the toes.",
    note: "Foot context with arrow to toes (Bucket C)",
  },
  {
    slot: 158,
    word: "bathroom",
    entity_mode: "organic_noun",
    framing: "object",
    hint: "A clean modern bathroom door with a universal toilet figure symbol on it, slightly ajar, bold clean black outlines on pure white background.",
    note: "Bathroom door with symbol (object-v1)",
  },
  {
    slot: 159,
    word: "potty",
    entity_mode: "organic_noun",
    framing: "object",
    hint: "A clean colorful toddler training potty chair with seat and removable basin, bold clean black outlines on pure white background.",
    note: "Toddler potty chair (object-v1)",
  },
  {
    slot: 160,
    word: "toilet",
    entity_mode: "organic_noun",
    framing: "object",
    hint: "A clean white porcelain toilet with seat, lid, and water tank in 3/4 perspective, bold clean black outlines on pure white background.",
    note: "Porcelain toilet (object-v1)",
  },
  {
    slot: 161,
    word: "diaper",
    entity_mode: "organic_noun",
    framing: "object",
    hint: "A clean folded white baby diaper with elastic waistband and adhesive side tabs, bold clean black outlines on pure white background.",
    note: "Clean baby diaper (object-v1)",
  },
];

async function run() {
  console.log(`Starting Batch 16 generation (${BATCH16.length} words: Lower Body, Care & Hygiene)...`);

  for (let i = 0; i < BATCH16.length; i++) {
    const item = BATCH16[i];
    const out = `${BRAIN_DIR}/batch16_${item.word}.png`;
    console.log(`\n[${i + 1}/${BATCH16.length}] Generating slot ${item.slot}: "${item.word}"...`);
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

  console.log("\nBuilding lightweight batch16_gallery.html...");
  let cards = "";
  for (const item of BATCH16) {
    const imgPath = `${BRAIN_DIR}/batch16_${item.word}.png`;
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
  <title>Batch 16 Gallery (Lower Body & Hygiene — Slots 152–161)</title>
</head>
<body style="margin:0; padding:16px; font-family:-apple-system, BlinkMacSystemFont, sans-serif; background:#f8fafc; color:#0f172a;">
  <h2 style="margin:0 0 4px 0; font-size:20px; font-weight:800;">Batch 16: Lower Body & Hygiene (Slots 152–161)</h2>
  <p style="margin:0 0 16px 0; font-size:13px; color:#64748b;">Lower Body Anatomy (Bucket A/C) & Essential Hygiene Objects</p>
  <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:12px;">
    ${cards}
  </div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch16_gallery.html`, html, "utf8");
  const sizeKB = Math.round(Buffer.byteLength(html) / 1024);
  console.log(`Saved batch16_gallery.html -> ${sizeKB} KB (lightweight, under 20MB limit!)`);
}

run().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
