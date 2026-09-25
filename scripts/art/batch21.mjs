import { generateToFile } from "./gen.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH21 = [
  {
    slot: 202,
    word: "quiet",
    displayName: "quiet",
    torso: "blue",
    framing: "bust",
    hint: "The stick figure has their index finger gently raised vertically touching closed peaceful lips in the universal 'shh' quiet gesture, with calm closed eyes and a soft serene smile.",
    note: "Index finger to lips 'shh' gesture (bust)",
  },
  {
    slot: 203,
    word: "noisy",
    displayName: "noisy",
    torso: "blue",
    framing: "bust",
    hint: "The stick figure has a distressed shouting expression, raising both hands outward to push away noise, surrounded by a speaker blasting jagged sound waves, musical notes, and vibrating commotion lines.",
    note: "Distressed pushing noise away, speaker sound waves (bust)",
  },
  {
    slot: 204,
    word: "bright",
    displayName: "bright",
    torso: "blue",
    framing: "bust",
    hint: "The stick figure is squinting their eyes tightly shut against bright light, raising one forearm to shield their eyes from a radiant blazing yellow sun shining down from the top corner with intense rays.",
    note: "Shielding eyes from radiant bright sun (bust)",
  },
  {
    slot: 205,
    word: "dark",
    displayName: "dark",
    torso: "blue",
    framing: "bust",
    hint: "The stick figure is holding a yellow flashlight pointing forward, with a bright conical beam of light cutting across dark negative space, with a small crescent moon in the upper corner.",
    note: "Holding flashlight cutting beam through dark (bust)",
  },
  {
    slot: 206,
    word: "soft",
    displayName: "soft",
    framing: "object",
    hint: "A pristine fluffy white down feather floating gently at an angle, with delicate soft wispy edges and curved quill.",
    note: "Fluffy white down feather (object)",
  },
  {
    slot: 207,
    word: "rough",
    displayName: "rough",
    framing: "object",
    hint: "A jagged coarse textured grey stone with sharp craggy edges, cracks, and gritty stippled texture dots. A hand touches the rough stone with one finger.",
    note: "Coarse jagged craggy rock with hand touching (object)",
  },
  {
    slot: 208,
    word: "sticky",
    displayName: "sticky",
    framing: "object",
    hint: "A hand with thumb and index finger slightly pulled apart, with a thick stretchy strand of gooey golden honey or amber syrup clinging and stretching between the two fingertips.",
    note: "Gooey golden syrup stretching between fingers (object)",
  },
  {
    slot: 210,
    word: "gross",
    displayName: "gross",
    torso: "blue",
    framing: "bust",
    hint: "The stick figure has an expression of intense disgust, squinting wincing eyes, tongue sticking out, wrinkling their nose, with one hand raised palm-out warding off a small smelly green slime puddle with wavy stink lines.",
    note: "Disgusted face, tongue out, warding off green slime (bust)",
  },
  {
    slot: 211,
    word: "comfortable",
    displayName: "comfortable",
    torso: "blue",
    framing: "full",
    hint: "The stick figure is sitting back comfortably relaxed in a soft cushioned armchair, resting their head back with a peaceful content smile and arms resting on armrests.",
    note: "Relaxing back in soft cushioned armchair (full)",
  },
  {
    slot: 212,
    word: "uncomfortable",
    displayName: "uncomfortable",
    torso: "blue",
    framing: "full",
    hint: "The stick figure is sitting awkwardly on a hard jagged wooden stool, squirming with tense shoulders, awkward grimacing mouth, and one hand rubbing their stiff lower back.",
    note: "Sitting awkwardly on hard stool rubbing back (full)",
  },
  {
    slot: 213,
    word: "overwhelmed",
    displayName: "overwhelmed",
    torso: "blue",
    framing: "bust",
    hint: "The stick figure is clutching both sides of their head with their hands, eyes squeezed tightly shut in distress, surrounded by a swirling halo of chaotic spiral lines, small stars, and sensory overload commotion.",
    note: "Hands clutching head in sensory overload swirl (bust)",
  },
];

async function run() {
  console.log(`Starting Batch 21 generation (${BATCH21.length} words: Sensory & Environmental Descriptors)...`);

  for (let i = 0; i < BATCH21.length; i++) {
    const item = BATCH21[i];
    const out = `${BRAIN_DIR}/batch21_${item.word}.png`;
    if (existsSync(out) && !process.argv.includes("--force")) {
      console.log(`Slot ${item.slot} ("${item.displayName}") already exists at ${out}. Skipping generation.`);
      continue;
    }
    console.log(`\n[${i + 1}/${BATCH21.length}] Generating slot ${item.slot}: "${item.displayName}"...`);
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

  console.log("\nBuilding lightweight batch21_gallery.html...");
  let cards = "";
  for (const item of BATCH21) {
    const imgPath = `${BRAIN_DIR}/batch21_${item.word}.png`;
    if (!existsSync(imgPath)) continue;
    const imgBuf = readFileSync(imgPath);
    const thumbBuf = await sharp(imgBuf)
      .resize(200, 200, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .webp({ quality: 75 })
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
  <title>Batch 21 Gallery (Sensory & Environmental Descriptors — Slots 202–213)</title>
</head>
<body style="margin:0; padding:16px; font-family:-apple-system, BlinkMacSystemFont, sans-serif; background:#f8fafc; color:#0f172a;">
  <h2 style="margin:0 0 4px 0; font-size:20px; font-weight:800;">Batch 21: Sensory & Environmental Descriptors (Slots 202–213)</h2>
  <p style="margin:0 0 16px 0; font-size:13px; color:#64748b;">Fitzgerald Blue Descriptors · Physical & Sensory States</p>
  <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:12px;">
    ${cards}
  </div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch21_gallery.html`, html, "utf8");
  const sizeKB = Math.round(Buffer.byteLength(html) / 1024);
  console.log(`Saved batch21_gallery.html -> ${sizeKB} KB (lightweight)`);

  console.log("Building composite grid...");
  const cols = 4;
  const rows = 3;
  const tileSize = 300;
  const pad = 10;
  const gridW = cols * tileSize + (cols + 1) * pad;
  const gridH = rows * tileSize + (rows + 1) * pad;

  const composites = [];
  for (let i = 0; i < BATCH21.length; i++) {
    const item = BATCH21[i];
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = pad + c * (tileSize + pad);
    const y = pad + r * (tileSize + pad);
    const imgPath = `${BRAIN_DIR}/batch21_${item.word}.png`;
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
  .toFile(`${BRAIN_DIR}/batch21_grid.png`);

  console.log("Saved batch21_grid.png");

  console.log("Building 48x48 preview strip...");
  const stripCols = BATCH21.length;
  const stripCell = 64; // 48px image + 16px padding
  const stripW = stripCols * stripCell;
  const stripH = stripCell;
  const stripComposites = [];

  for (let i = 0; i < BATCH21.length; i++) {
    const item = BATCH21[i];
    const imgPath = `${BRAIN_DIR}/batch21_${item.word}.png`;
    if (!existsSync(imgPath)) continue;
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
      background: { r: 248, g: 250, b: 252 }
    }
  })
  .composite(stripComposites)
  .png()
  .toFile(`${BRAIN_DIR}/batch21_strip_48.png`);

  console.log("Saved batch21_strip_48.png");
}

run().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
