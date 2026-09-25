import { generateToFile } from "./gen.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH20 = [
  {
    slot: 192,
    word: "lonely",
    displayName: "lonely",
    torso: "blue",
    framing: "full",
    hint: "A stick figure sitting alone on the ground with knees drawn up to chest and arms wrapped around knees, looking solitary in empty white space.",
    note: "Sitting alone hugging knees (full)",
  },
  {
    slot: 193,
    word: "hungry",
    displayName: "hungry",
    torso: "blue",
    framing: "bust",
    hint: "The stick figure has one open hand resting flat over their tummy, with a small clean thought bubble above showing a simple red apple.",
    note: "Hand on tummy with apple thought bubble (bust)",
  },
  {
    slot: 194,
    word: "thirsty",
    displayName: "thirsty",
    torso: "blue",
    framing: "bust",
    hint: "The stick figure is holding a clear glass of water up near their mouth to take a drink.",
    note: "Drinking from glass of water (bust)",
  },
  {
    slot: 195,
    word: "tired",
    displayName: "tired",
    torso: "blue",
    framing: "bust",
    hint: "The stick figure is resting their chin in their propped hand, with drooping heavy eyelids and an exhausted gentle slump.",
    note: "Chin in propped hand, drooping eyes (bust)",
  },
  {
    slot: 196,
    word: "sleepy",
    displayName: "sleepy",
    torso: "blue",
    framing: "bust",
    hint: "The stick figure is resting their head tilted sideways against a soft white pillow, with peaceful closed curved eye lines, drifting to sleep.",
    note: "Head on soft pillow, closed eyes (bust)",
  },
  {
    slot: 197,
    word: "energetic",
    displayName: "energetic",
    torso: "blue",
    framing: "full",
    hint: "The stick figure is joyfully leaping up in mid-air with both arms raised high above head, bent legs, and a huge energetic happy smile.",
    note: "Leaping in air with arms raised (full)",
  },
  {
    slot: 198,
    word: "hot",
    displayName: "hot",
    torso: "blue",
    framing: "bust",
    hint: "The stick figure has small sweat droplets at their temple and is fanning their face with one open hand, looking hot.",
    note: "Fanning face with hand, sweat drops (bust)",
  },
  {
    slot: 199,
    word: "cold",
    displayName: "cold",
    torso: "blue",
    framing: "bust",
    hint: "The stick figure is shivering with arms crossed tightly grasping their own shoulders, with small curved shivering vibration lines around them.",
    note: "Shivering with crossed arms on shoulders (bust)",
  },
  {
    slot: 200,
    word: "warm",
    displayName: "warm",
    torso: "blue",
    framing: "bust",
    hint: "The stick figure is comfortably wrapped in a cozy yellow blanket up around their shoulders, with a serene content smile.",
    note: "Wrapped in cozy yellow blanket (bust)",
  },
  {
    slot: 201,
    word: "loud",
    displayName: "loud",
    torso: "blue",
    framing: "bust",
    hint: "The stick figure has both hands clamped firmly over their ears with wincing squinted eyes, as bold sound wave arcs radiate from the side.",
    note: "Hands clamped over ears with sound waves (bust)",
  },
];

async function run() {
  console.log(`Starting Batch 20 generation (${BATCH20.length} words: Sensory & Physical States)...`);

  for (let i = 0; i < BATCH20.length; i++) {
    const item = BATCH20[i];
    const out = `${BRAIN_DIR}/batch20_${item.word}.png`;
    if (existsSync(out) && !process.argv.includes("--force")) {
      console.log(`Slot ${item.slot} ("${item.displayName}") already exists at ${out}. Skipping generation.`);
      continue;
    }
    console.log(`\n[${i + 1}/${BATCH20.length}] Generating slot ${item.slot}: "${item.displayName}"...`);
    const start = Date.now();
    try {
      await generateToFile({
        word: item.displayName,
        torso: item.torso ?? null,
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

  console.log("\nBuilding lightweight batch20_gallery.html...");
  let cards = "";
  for (const item of BATCH20) {
    const imgPath = `${BRAIN_DIR}/batch20_${item.word}.png`;
    if (!existsSync(imgPath)) continue;
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
  <title>Batch 20 Gallery (Sensory & Physical States — Slots 192–201)</title>
</head>
<body style="margin:0; padding:16px; font-family:-apple-system, BlinkMacSystemFont, sans-serif; background:#f8fafc; color:#0f172a;">
  <h2 style="margin:0 0 4px 0; font-size:20px; font-weight:800;">Batch 20: Sensory & Physical States (Slots 192–201)</h2>
  <p style="margin:0 0 16px 0; font-size:13px; color:#64748b;">Fitzgerald Blue Descriptors · Physical & Sensory States</p>
  <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:12px;">
    ${cards}
  </div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch20_gallery.html`, html, "utf8");
  const sizeKB = Math.round(Buffer.byteLength(html) / 1024);
  console.log(`Saved batch20_gallery.html -> ${sizeKB} KB (lightweight)`);

  console.log("Building 2x5 grid...");
  const cols = 5;
  const rows = 2;
  const tileSize = 300;
  const pad = 10;
  const gridW = cols * tileSize + (cols + 1) * pad;
  const gridH = rows * tileSize + (rows + 1) * pad;

  const composites = [];
  for (let i = 0; i < BATCH20.length; i++) {
    const item = BATCH20[i];
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = pad + c * (tileSize + pad);
    const y = pad + r * (tileSize + pad);
    const imgPath = `${BRAIN_DIR}/batch20_${item.word}.png`;
    if (!existsSync(imgPath)) continue;
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
  .toFile(`${BRAIN_DIR}/batch20_grid.png`);

  console.log("Saved batch20_grid.png");
}

run().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
