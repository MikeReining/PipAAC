import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const ITEMS = [
  { slot: 235, word: "draw", file: "batch24_draw.png", desc: "Drawing sun on paper (crayon)" },
  { slot: 236, word: "color", file: "batch24_color.png", desc: "Coloring star with red crayon" },
  { slot: 237, word: "paint", file: "batch24_paint.png", desc: "Painting stroke on easel (brush)" },
  { slot: 238, word: "cut", file: "batch24_cut.png", desc: "Scissors cutting dashed line" },
  { slot: 239, word: "glue", file: "batch24_glue.png", desc: "Glue bottle dispensing droplet" },
  { slot: 240, word: "listen", file: "batch24_listen.png", desc: "Cupping ear to music notes" },
  { slot: 241, word: "speak", file: "batch24_speak_roll2.png", desc: "Pointing to mouth (clinical / ASL cue)" },
  { slot: 242, word: "talk", file: "batch24_speak.png", desc: "Radiating sound waves (vocal dialogue)" },
  { slot: 243, word: "sing", file: "batch24_sing.png", desc: "Singing with floating notes" },
  { slot: 244, word: "count", file: "batch24_count.png", desc: "Pointing finger counting 3 blocks" },
];

async function run() {
  console.log("Building updated composite grid for Batch 24...");
  const cols = 5;
  const rows = 2;
  const tileSize = 300;
  const pad = 10;
  const gridW = cols * tileSize + (cols + 1) * pad;
  const gridH = rows * tileSize + (rows + 1) * pad;

  const composites = [];
  for (let i = 0; i < ITEMS.length; i++) {
    const item = ITEMS[i];
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = pad + c * (tileSize + pad);
    const y = pad + r * (tileSize + pad);
    const imgPath = `${BRAIN_DIR}/${item.file}`;
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
      background: { r: 241, g: 245, b: 249 },
    },
  })
    .composite(composites)
    .png()
    .toFile(`${BRAIN_DIR}/batch24_grid_updated.png`);

  console.log("Building updated 48x48 preview strip...");
  const stripCell = 64;
  const stripW = ITEMS.length * stripCell;
  const stripH = stripCell;
  const stripComposites = [];

  for (let i = 0; i < ITEMS.length; i++) {
    const item = ITEMS[i];
    const imgPath = `${BRAIN_DIR}/${item.file}`;
    const mini = await sharp(imgPath)
      .resize(48, 48, { fit: "contain", background: { r: 255, g: 255, b: 255 } })
      .toBuffer();
    stripComposites.push({
      input: mini,
      top: 8,
      left: i * stripCell + 8,
    });
  }

  await sharp({
    create: {
      width: stripW,
      height: stripH,
      channels: 3,
      background: { r: 248, g: 250, b: 252 },
    },
  })
    .composite(stripComposites)
    .png()
    .toFile(`${BRAIN_DIR}/batch24_strip_48_updated.png`);

  console.log("Building lightweight updated gallery HTML...");
  let cards = "";
  for (const item of ITEMS) {
    const imgPath = `${BRAIN_DIR}/${item.file}`;
    const imgBuf = readFileSync(imgPath);
    const thumbBuf = await sharp(imgBuf)
      .resize(200, 200, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .webp({ quality: 75 })
      .toBuffer();
    const b64 = thumbBuf.toString("base64");

    cards += `
      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:12px; display:flex; flex-direction:column; align-items:center; box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <div style="font-size:11px; font-weight:700; color:#94a3b8; margin-bottom:4px;">#${item.slot}</div>
        <img src="data:image/webp;base64,${b64}" style="width:100%; max-width:180px; aspect-ratio:1/1; object-fit:contain; border-radius:8px;" alt="${item.word}" />
        <div style="margin-top:10px; font-weight:700; font-size:16px; text-transform:capitalize; color:#0f172a;">${item.word}</div>
        <div style="font-size:12px; color:#64748b; text-align:center; margin-top:4px;">${item.desc}</div>
      </div>
    `;
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Batch 24 Gallery (Updated with Speak & Talk Swap)</title>
</head>
<body style="margin:0; padding:16px; font-family:-apple-system, BlinkMacSystemFont, sans-serif; background:#f8fafc; color:#0f172a;">
  <h2 style="margin:0 0 4px 0; font-size:20px; font-weight:800;">Batch 24: Creative Actions & Communication Verbs (Slots 235–244)</h2>
  <p style="margin:0 0 16px 0; font-size:13px; color:#64748b;">Updated mapping: #241 Speak (Pointing to Mouth) & #242 Talk (Radiating Sound Waves)</p>
  <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:12px;">
    ${cards}
  </div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch24_gallery_updated.html`, html, "utf8");
  console.log("All updated previews created successfully!");
}

run().catch((err) => {
  console.error("Error creating previews:", err);
  process.exit(1);
});
