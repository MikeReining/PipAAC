import { generateToFile } from "./gen.mjs";
import { readFileSync, writeFileSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH = [
  {
    slot: 132,
    word: "grapes",
    entity_mode: "organic_noun",
    framing: "object",
    hint: "A bunch of juicy purple grapes on the vine with a green leaf.",
    note: "Cluster of purple grapes with leaf",
  },
  {
    slot: 133,
    word: "watermelon",
    entity_mode: "organic_noun",
    framing: "object",
    hint: "A fresh triangular slice of red watermelon with green striped rind and black seeds.",
    note: "Watermelon slice with rind and seeds",
  },
  {
    slot: 134,
    word: "carrot",
    entity_mode: "organic_noun",
    framing: "object",
    hint: "A fresh tapered orange carrot with feathery green leafy foliage tops.",
    note: "Orange carrot with green leafy top",
  },
  {
    slot: 135,
    word: "broccoli",
    entity_mode: "organic_noun",
    framing: "object",
    hint: "A fresh stalk of green broccoli with a textured dense crown of florets.",
    note: "Green broccoli head with stalk",
  },
  {
    slot: 136,
    word: "corn",
    entity_mode: "organic_noun",
    framing: "object",
    hint: "An ear of yellow sweet corn on the cob with green husks partially pulled back.",
    note: "Ear of yellow corn with green husk",
  },
  {
    slot: 137,
    word: "body",
    entity_mode: "concept_action",
    framing: "full",
    torso: "yellow",
    hint: "A complete stick figure standing upright showing the entire human body from head to feet.",
    note: "Full body stick figure",
  },
  {
    slot: 138,
    word: "head",
    entity_mode: "concept_action",
    framing: "bust",
    torso: "yellow",
    hint: "The stick figure has both hands placed on top of its head, clearly indicating the head.",
    note: "Stick figure with hands touching head",
  },
  {
    slot: 139,
    word: "face",
    entity_mode: "concept_action",
    framing: "face",
    hint: "A friendly stick figure face with two dot eyes and a gentle smile filling the frame.",
    note: "Stick figure face filling frame",
  },
  {
    slot: 140,
    word: "hair",
    entity_mode: "organic_noun",
    framing: "object",
    hint: "A stylized clean vector head of wavy brown hair, isolated with no facial features.",
    note: "Wavy brown hair volume",
  },
  {
    slot: 141,
    word: "eye",
    entity_mode: "organic_noun",
    framing: "object",
    hint: "A single open human eye with a calm blue iris, black pupil, and clean outline.",
    note: "Open human eye with blue iris",
  },
];

async function run() {
  console.log(`Starting Batch 14: ${BATCH.length} words, strictly 1 roll each...`);
  const generated = [];

  for (let i = 0; i < BATCH.length; i++) {
    const item = BATCH[i];
    const out = `${BRAIN_DIR}/batch14_${item.word.replace(/\s+/g, "_")}.png`;
    console.log(`\n[${i + 1}/${BATCH.length}] Generating slot ${item.slot}: "${item.word}"...`);
    const start = Date.now();
    try {
      await generateToFile({
        word: item.word,
        entity_mode: item.entity_mode,
        framing: item.framing,
        torso: item.torso ?? null,
        hint: item.hint,
        out,
      });
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`Done slot ${item.slot}: "${item.word}" in ${elapsed}s -> ${out}`);
      generated.push({ ...item, out });
    } catch (err) {
      console.error(`FAILED slot ${item.slot}: "${item.word}"`, err);
    }
  }

  console.log("\nBuilding batch14_gallery.html...");
  let cards = "";
  for (const item of generated) {
    const b64 = readFileSync(item.out).toString("base64");
    cards += `
      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:12px; display:flex; flex-direction:column; align-items:center; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <img src="data:image/png;base64,${b64}" style="width:100%; max-width:180px; aspect-ratio:1/1; object-fit:contain; border-radius:8px;" alt="${item.word}" />
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
  <title>Batch 14 Gallery (Vegetables & Body Parts)</title>
</head>
<body style="margin:0; padding:16px; font-family:-apple-system, BlinkMacSystemFont, sans-serif; background:#f8fafc; color:#0f172a;">
  <h2 style="margin:0 0 4px 0; font-size:20px; font-weight:800;">Batch 14: Produce & Anatomy (Slots 132–141)</h2>
  <p style="margin:0 0 16px 0; font-size:13px; color:#64748b;">Produce (object-v1) and Body Parts (pip-v1 stick figure & illustrated object), strictly 1 roll each</p>
  <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:12px;">
    ${cards}
  </div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch14_gallery.html`, html);
  console.log(`Saved gallery: ${BRAIN_DIR}/batch14_gallery.html`);
}

run().catch((err) => {
  console.error("Fatal batch run error:", err);
  process.exit(1);
});
