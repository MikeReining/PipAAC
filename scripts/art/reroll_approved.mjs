import { generateToFile } from "./gen.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const ITEMS = [
  {
    word: "watermelon",
    prompt: [
      "We are trying to teach a child the concept of: watermelon.",
      "Draw it in exactly the same style as the reference images on a pure white background.",
      "Do not include any text in the image.",
      "A vibrant green striped whole uncut watermelon. Resting on the ground directly in front of it is a single triangular slice of watermelon with rich red fruit, black seeds, and green rind.",
      "Bold clean black outlines, high color saturation, pure white background.",
    ].join("\n"),
    out: `${BRAIN_DIR}/batch14_watermelon_perfect.png`,
    finalOut: `${BRAIN_DIR}/batch14_watermelon.png`,
  },
  {
    word: "see",
    prompt: [
      "We are trying to teach a child the concept of: see.",
      "Draw it in exactly the same style as the reference images on a pure white background.",
      "Do not include any text in the image.",
      "Close-up bust shot of the stick figure from the mid-chest up. Large prominent circular head, neck, and upper chest only, no legs.",
      "The stick figure's torso is solid green.",
      "Both shoulders and arms are present. One hand forms a clear V peace sign handshape with fingertips touching the cheekbone right beneath the eye in the ASL see sign. The other arm's shoulder and upper arm curve naturally down along the side of the torso.",
    ].join("\n"),
    out: `${BRAIN_DIR}/batch14_see_perfect.png`,
    finalOut: `${BRAIN_DIR}/reroll_see.png`,
  },
];

async function run() {
  console.log(`Generating perfected watermelon and see...`);

  for (let i = 0; i < ITEMS.length; i++) {
    const item = ITEMS[i];
    console.log(`\n[${i + 1}/${ITEMS.length}] Generating "${item.word}"...`);
    const start = Date.now();
    try {
      await generateToFile({
        word: item.word,
        prompt: item.prompt,
        out: item.out,
      });
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`Done "${item.word}" in ${elapsed}s -> ${item.out}`);
    } catch (err) {
      console.error(`FAILED "${item.word}"`, err);
    }
  }

  // Update batch14_gallery.html with lightweight compressed thumbnails so total HTML size is < 400 KB!
  console.log("\nRebuilding lightweight batch14_gallery.html...");
  const ALL_ITEMS = [
    { slot: 132, word: "grapes", file: `${BRAIN_DIR}/batch14_grapes.png`, note: "Cluster of purple grapes with leaf" },
    { slot: 133, word: "watermelon", file: `${BRAIN_DIR}/batch14_watermelon_perfect.png`, note: "Whole uncut melon with slice in front" },
    { slot: 134, word: "carrot", file: `${BRAIN_DIR}/batch14_carrot.png`, note: "Orange carrot with green leafy top" },
    { slot: 135, word: "broccoli", file: `${BRAIN_DIR}/batch14_broccoli.png`, note: "Green broccoli head with stalk" },
    { slot: 136, word: "corn", file: `${BRAIN_DIR}/batch14_corn.png`, note: "Ear of yellow corn with green husk" },
    { slot: 137, word: "body", file: `${BRAIN_DIR}/batch14_body.png`, note: "Full body stick figure with ASL chest touch" },
    { slot: 138, word: "head", file: `${BRAIN_DIR}/batch14_head.png`, note: "Close-up bust with ASL temple touch" },
    { slot: 139, word: "face", file: `${BRAIN_DIR}/batch14_face.png`, note: "Stick figure face filling frame" },
    { slot: 140, word: "hair", file: `${BRAIN_DIR}/batch14_hair.png`, note: "Head with black hair & directional arrow" },
    { slot: 141, word: "eye", file: `${BRAIN_DIR}/batch14_eye.png`, note: "Open human eye with blue iris" },
  ];

  let cards = "";
  for (const item of ALL_ITEMS) {
    // Generate a 256x256 high-quality webp thumbnail (~15-25 KB each)
    const imgBuf = readFileSync(item.file);
    const thumbBuf = await sharp(imgBuf)
      .resize(256, 256, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .webp({ quality: 85 })
      .toBuffer();
    const b64 = thumbBuf.toString("base64");

    cards += `
      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:12px; display:flex; flex-direction:column; align-items:center; box-shadow:0 1px 3px rgba(0,0,0,0.08);">
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
  <title>Batch 14 Gallery (Slots 132–141)</title>
</head>
<body style="margin:0; padding:16px; font-family:-apple-system, BlinkMacSystemFont, sans-serif; background:#f8fafc; color:#0f172a;">
  <h2 style="margin:0 0 4px 0; font-size:20px; font-weight:800;">Batch 14: Produce & Anatomy (Slots 132–141)</h2>
  <p style="margin:0 0 16px 0; font-size:13px; color:#64748b;">Produce (object-v1) and Body Parts (pip-v1 ASL & anatomy-relational)</p>
  <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:12px;">
    ${cards}
  </div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch14_gallery.html`, html, "utf8");
  const sizeKB = Math.round(Buffer.byteLength(html) / 1024);
  console.log(`Saved batch14_gallery.html -> ${sizeKB} KB (well below 20MB limit!)`);
}

run().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
