import { generateToFile } from "./gen.mjs";
import { readFileSync, writeFileSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const ITEMS = [
  {
    word: "watermelon",
    entity_mode: "organic_noun",
    framing: "object",
    hint: "watermelon and watermelon slice",
    out: `${BRAIN_DIR}/batch14_watermelon.png`,
    note: "Whole watermelon with watermelon slice in front",
  },
  {
    word: "head",
    prompt: [
      "We are trying to teach a child the concept of: head.",
      "Draw it in exactly the same style as the reference images on a pure white background.",
      "Do not include any text in the image.",
      "Close-up bust shot of the stick figure from the mid-chest up. The large prominent circular head, neck, and upper chest/shoulders fill the frame, no legs.",
      "The stick figure's torso is solid yellow.",
      "Both shoulders and arms are present. One open flat hand is placed gently against the side of the head and temple in the ASL head gesture. The other arm rests naturally and relaxed straight down along the side of the torso.",
    ].join("\n"),
    out: `${BRAIN_DIR}/batch14_head.png`,
    note: "Close-up bust with ASL temple touch and natural second arm",
  },
  {
    word: "see",
    prompt: [
      "We are trying to teach a child the concept of: see.",
      "Draw it in exactly the same style as the reference images on a pure white background.",
      "Do not include any text in the image.",
      "Close-up bust shot of the stick figure from the mid-chest up. The large prominent circular head, neck, and upper chest/shoulders fill the frame, no legs.",
      "The stick figure's torso is solid green.",
      "Both shoulders and arms are present. One hand has two extended fingers in a clear V shape (ASL V sign) pointing toward the eyes. The other arm is clearly drawn, resting naturally and relaxed straight down along the side of the torso.",
    ].join("\n"),
    out: `${BRAIN_DIR}/reroll_see.png`,
    note: "Close-up bust with ASL V sign at eye and clearly drawn second arm",
  },
];

async function run() {
  console.log(`Starting targeted re-roll of ${ITEMS.length} items (watermelon, head, see)...`);

  for (let i = 0; i < ITEMS.length; i++) {
    const item = ITEMS[i];
    console.log(`\n[${i + 1}/${ITEMS.length}] Generating "${item.word}"...`);
    const start = Date.now();
    try {
      if (item.prompt) {
        await generateToFile({
          word: item.word,
          prompt: item.prompt,
          out: item.out,
        });
      } else {
        await generateToFile({
          word: item.word,
          entity_mode: item.entity_mode,
          framing: item.framing,
          hint: item.hint,
          out: item.out,
        });
      }
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`Done "${item.word}" in ${elapsed}s -> ${item.out}`);
    } catch (err) {
      console.error(`FAILED "${item.word}"`, err);
    }
  }

  console.log("\nBuilding comparison gallery HTML...");
  const cards = [
    {
      word: "watermelon",
      current: `${BRAIN_DIR}/batch14_watermelon.png`,
      desc: "Whole green striped watermelon with slice in front showing red interior & seeds",
    },
    {
      word: "head",
      current: `${BRAIN_DIR}/batch14_head.png`,
      desc: "Close-up bust, solid yellow shirt, ASL temple touch, clean natural second arm",
    },
    {
      word: "see",
      current: `${BRAIN_DIR}/reroll_see.png`,
      desc: "Close-up bust, solid green shirt, ASL V at eye, clearly drawn second arm",
    },
  ];

  let cardHtml = "";
  for (const c of cards) {
    const b64 = readFileSync(c.current).toString("base64");
    cardHtml += `
      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:16px; display:flex; flex-direction:column; align-items:center; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <img src="data:image/png;base64,${b64}" style="width:100%; max-width:220px; aspect-ratio:1/1; object-fit:contain; border-radius:8px;" alt="${c.word}" />
        <div style="margin-top:12px; font-weight:800; font-size:18px; text-transform:capitalize; color:#0f172a;">${c.word}</div>
        <div style="font-size:13px; color:#64748b; text-align:center; margin-top:6px; line-height:1.4;">${c.desc}</div>
      </div>
    `;
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Re-roll Focus: watermelon, head, see</title>
</head>
<body style="margin:0; padding:20px; font-family:-apple-system, BlinkMacSystemFont, sans-serif; background:#f8fafc; color:#0f172a;">
  <h2 style="margin:0 0 6px 0; font-size:22px; font-weight:800;">Targeted Re-roll: watermelon, head, see</h2>
  <p style="margin:0 0 20px 0; font-size:14px; color:#64748b;">Close-up bust framing, natural second arm, and archetype watermelon + slice</p>
  <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:16px; max-width:900px;">
    ${cardHtml}
  </div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/reroll_focus_gallery.html`, html, "utf8");
  console.log(`Saved gallery -> ${BRAIN_DIR}/reroll_focus_gallery.html`);
}

run().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
