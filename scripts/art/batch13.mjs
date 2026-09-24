import { generateToFile } from "./gen.mjs";
import { readFileSync, writeFileSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH = [
  {
    slot: 122,
    word: "popsicle",
    entity_mode: "organic_noun",
    framing: "object",
    hint: "A frozen cherry red ice pop on a wooden popsicle stick.",
    note: "Red ice pop on wooden stick",
  },
  {
    slot: 123,
    word: "candy",
    entity_mode: "organic_noun",
    framing: "object",
    hint: "Two individually wrapped hard candies with twisted cellophane wrappers.",
    note: "Wrapped candies with twist wrappers",
  },
  {
    slot: 124,
    word: "cake",
    entity_mode: "organic_noun",
    framing: "object",
    hint: "A slice of layered cake with frosting on a small white plate.",
    note: "Layered cake slice on plate",
  },
  {
    slot: 125,
    word: "muffin",
    entity_mode: "organic_noun",
    framing: "object",
    hint: "A golden blueberry muffin baked in a pleated paper liner.",
    note: "Blueberry muffin in pleated liner",
  },
  {
    slot: 126,
    word: "donut",
    entity_mode: "organic_noun",
    framing: "object",
    hint: "A round ring donut with pink glaze and sprinkles.",
    note: "Glazed ring donut with sprinkles",
  },
  {
    slot: 127,
    word: "fruit",
    entity_mode: "organic_noun",
    framing: "object",
    hint: "A small white bowl filled with assorted fresh fruit including a red apple, green grapes, and an orange.",
    note: "Bowl of assorted fresh fruit",
  },
  {
    slot: 128,
    word: "apple",
    entity_mode: "organic_noun",
    framing: "object",
    hint: "A single fresh red apple with a small brown stem and a green leaf.",
    note: "Red apple with stem and leaf",
  },
  {
    slot: 129,
    word: "banana",
    entity_mode: "organic_noun",
    framing: "object",
    hint: "A ripe yellow banana partially peeled showing the fruit inside.",
    note: "Partially peeled yellow banana",
  },
  {
    slot: 130,
    word: "strawberry",
    entity_mode: "organic_noun",
    framing: "object",
    hint: "A single ripe red strawberry with tiny seeds and green leafy stem cap.",
    note: "Red strawberry with green hull",
  },
  {
    slot: 131,
    word: "orange",
    entity_mode: "organic_noun",
    framing: "object",
    hint: "A fresh round orange beside a cut orange half showing the juicy citrus wedges.",
    note: "Whole orange with sliced half",
  },
];

async function run() {
  console.log(`Starting Batch 13: ${BATCH.length} words, strictly 1 roll each...`);
  const generated = [];

  for (let i = 0; i < BATCH.length; i++) {
    const item = BATCH[i];
    const out = `${BRAIN_DIR}/batch13_${item.word.replace(/\s+/g, "_")}.png`;
    console.log(`\n[${i + 1}/${BATCH.length}] Generating slot ${item.slot}: "${item.word}"...`);
    const start = Date.now();
    try {
      await generateToFile({
        word: item.word,
        framing: item.framing,
        entity_mode: item.entity_mode,
        hint: item.hint,
        out,
      });
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`  -> Done (${elapsed}s): ${out}`);
      generated.push({ ...item, file: out });
    } catch (err) {
      console.error(`  -> Failed: ${err.message}`);
    }

    if (i < BATCH.length - 1) {
      console.log("  Waiting 2s pacing...");
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  // Generate mobile-ready HTML gallery with base64 embedded images
  console.log("\nBuilding batch13_gallery.html...");
  let cards = "";
  for (const item of generated) {
    const b64 = readFileSync(item.file).toString("base64");
    cards += `
      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:12px; display:flex; flex-direction:column; align-items:center; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <img src="data:image/png;base64,${b64}" style="width:100%; max-width:180px; aspect-ratio:1/1; object-fit:contain; border-radius:8px;" alt="${item.word}" />
        <div style="margin-top:10px; font-weight:700; font-size:16px; text-transform:capitalize; color:#0f172a;">${item.slot}. ${item.word}</div>
        <div style="font-size:12px; color:#64748b; text-align:center; margin-top:4px;">${item.note}</div>
      </div>
    `;
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Batch 13 Gallery (Desserts & Fruits)</title>
</head>
<body style="margin:0; padding:16px; font-family:-apple-system, BlinkMacSystemFont, sans-serif; background:#f8fafc; color:#0f172a;">
  <h2 style="margin:0 0 4px 0; font-size:20px; font-weight:800;">Batch 13: Desserts & Fruits (Slots 122–131)</h2>
  <p style="margin:0 0 16px 0; font-size:13px; color:#64748b;">Organic nouns generated via object-v1 reference bundle, strictly 1 roll each</p>
  <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:12px;">
    ${cards}
  </div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch13_gallery.html`, html);
  console.log(`Saved gallery: ${BRAIN_DIR}/batch13_gallery.html`);
}

run().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
