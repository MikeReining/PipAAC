import { generateToFile } from "./gen.mjs";
import { readFileSync, writeFileSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const REROLL = [
  {
    slot: 133,
    word: "watermelon",
    entity_mode: "organic_noun",
    framing: "object",
    hint: null, // Minimal prompting test per founder insight: zero extra hints
    note: "Fresh watermelon (minimal prompt)",
  },
  {
    slot: 137,
    word: "body",
    entity_mode: "concept_action",
    framing: "full",
    torso: "yellow",
    hand: "asl_body",
    hint: "The stick figure stands upright with both flat hands resting against its chest and torso in the ASL body sign.",
    note: "Full body stick figure with ASL chest touch",
  },
  {
    slot: 138,
    word: "head",
    entity_mode: "concept_action",
    framing: "bust",
    torso: "yellow",
    hand: "asl_head",
    hint: "The stick figure has one open flat hand placed against the side of its head and temple in the ASL head sign.",
    note: "Stick figure with ASL temple touch",
  },
  {
    slot: 140,
    word: "hair",
    entity_mode: "anatomy_relational",
    hint: "A simplified neutral head and face with prominent black hair on top, with a bold clean black arrow pointing directly down to the hair.",
    note: "Head with black hair & directional arrow",
  },
];

async function run() {
  console.log(`Starting targeted re-roll for ${REROLL.length} words...`);

  for (let i = 0; i < REROLL.length; i++) {
    const item = REROLL[i];
    const out = `${BRAIN_DIR}/batch14_${item.word}.png`;
    console.log(`\n[${i + 1}/${REROLL.length}] Generating slot ${item.slot}: "${item.word}"...`);
    const start = Date.now();
    try {
      await generateToFile({
        word: item.word,
        entity_mode: item.entity_mode,
        framing: item.framing,
        torso: item.torso ?? null,
        hand: item.hand ?? null,
        hint: item.hint,
        out,
      });
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`Done slot ${item.slot}: "${item.word}" in ${elapsed}s -> ${out}`);
    } catch (err) {
      console.error(`FAILED slot ${item.slot}: "${item.word}"`, err);
    }
  }

  console.log("\nRebuilding batch14_gallery.html with updated symbols...");
  const ALL_ITEMS = [
    { slot: 132, word: "grapes", note: "Cluster of purple grapes with leaf" },
    { slot: 133, word: "watermelon", note: "Fresh watermelon (minimal prompt)" },
    { slot: 134, word: "carrot", note: "Orange carrot with green leafy top" },
    { slot: 135, word: "broccoli", note: "Green broccoli head with stalk" },
    { slot: 136, word: "corn", note: "Ear of yellow corn with green husk" },
    { slot: 137, word: "body", note: "Full body stick figure with ASL chest touch" },
    { slot: 138, word: "head", note: "Stick figure with ASL temple touch" },
    { slot: 139, word: "face", note: "Stick figure face filling frame" },
    { slot: 140, word: "hair", note: "Head with black hair & directional arrow" },
    { slot: 141, word: "eye", note: "Open human eye with blue iris" },
  ];

  let cards = "";
  for (const item of ALL_ITEMS) {
    const imgPath = `${BRAIN_DIR}/batch14_${item.word}.png`;
    const b64 = readFileSync(imgPath).toString("base64");
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
  <title>Batch 14 Gallery (Produce & Anatomy Upgrades)</title>
</head>
<body style="margin:0; padding:16px; font-family:-apple-system, BlinkMacSystemFont, sans-serif; background:#f8fafc; color:#0f172a;">
  <h2 style="margin:0 0 4px 0; font-size:20px; font-weight:800;">Batch 14: Produce & Anatomy (Slots 132–141)</h2>
  <p style="margin:0 0 16px 0; font-size:13px; color:#64748b;">Produce (object-v1) and Body Parts (pip-v1 ASL & anatomy-relational)</p>
  <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:12px;">
    ${cards}
  </div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch14_gallery.html`, html);
  console.log(`Saved updated gallery: ${BRAIN_DIR}/batch14_gallery.html`);
}

run().catch((err) => {
  console.error("Fatal reroll error:", err);
  process.exit(1);
});
