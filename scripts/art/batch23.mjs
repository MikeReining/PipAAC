import { generateToFile } from "./gen.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH23 = [
  {
    slot: 225,
    word: "throw",
    displayName: "throw",
    torso: "green",
    framing: "full",
    hint: "The stick figure is throwing a red ball forward. The figure is leaning back with their active arm cocked and extended forward in mid-throw, launching the small red ball with a subtle curved dashed arc line indicating flight.",
    note: "Throwing red ball forward with arm (full)",
  },
  {
    slot: 226,
    word: "catch",
    displayName: "catch",
    torso: "green",
    framing: "full",
    hint: "The stick figure is catching a red ball with both hands cupped open forward in front of their chest, successfully catching the arriving red ball right between their hands.",
    note: "Catching red ball with cupped open hands (full)",
  },
  {
    slot: 227,
    word: "push",
    displayName: "push",
    torso: "green",
    framing: "full",
    hint: "The stick figure is leaning forward with both hands pressed flat against a large square wooden crate or block, pushing it forward with force.",
    note: "Leaning forward pushing heavy block (full)",
  },
  {
    slot: 228,
    word: "pull",
    displayName: "pull",
    torso: "green",
    framing: "full",
    hint: "The stick figure is leaning backward pulling with both hands on a taut rope attached to a wooden crate, pulling it toward them.",
    note: "Leaning backward pulling taut rope (full)",
  },
  {
    slot: 229,
    word: "swing",
    displayName: "swing",
    torso: "green",
    framing: "full",
    hint: "The stick figure is sitting on a playground swing suspended by two ropes, swinging high forward in the air with legs kicked up and a joyful smile.",
    note: "Swinging high on playground swing (full)",
  },
  {
    slot: 230,
    word: "slide",
    displayName: "slide",
    torso: "green",
    framing: "full",
    hint: "The stick figure is sliding feet-first down a clean angled playground slide with hands on the side rails, enjoying the ride.",
    note: "Sliding feet-first down playground slide (full)",
  },
  {
    slot: 231,
    word: "fall",
    displayName: "fall",
    torso: "green",
    framing: "full",
    hint: "The stick figure is tumbling backward in mid-air losing balance, with feet kicked up and arms flailing outward in a sudden accidental slip or fall.",
    note: "Tumbling backward losing balance in slip/fall (full)",
  },
  {
    slot: 232,
    word: "carry",
    displayName: "carry",
    torso: "green",
    framing: "full",
    hint: "The stick figure is walking carrying a brown cardboard box, holding the box securely with both arms wrapped around the front against their chest.",
    note: "Carrying cardboard box with both arms (full)",
  },
  {
    slot: 233,
    word: "drop",
    displayName: "drop",
    torso: "green",
    framing: "full",
    hint: "The stick figure has both hands open wide facing downward, watching a small blue ball that has just slipped out of their hands falling through the air toward the ground, with two downward motion lines.",
    note: "Hands open watching object fall downward (full)",
  },
  {
    slot: 234,
    word: "write",
    displayName: "write",
    torso: "green",
    framing: "bust",
    hint: "The stick figure is sitting at a simple desk, holding a yellow pencil in their hand and writing lines on a clean white sheet of paper resting on the desk.",
    note: "Writing with yellow pencil on paper at desk (bust)",
  },
];

async function run() {
  console.log(`Starting Batch 23 generation (${BATCH23.length} words: Physical, Playground & Object Interaction Verbs)...`);

  for (let i = 0; i < BATCH23.length; i++) {
    const item = BATCH23[i];
    const out = `${BRAIN_DIR}/batch23_${item.word}.png`;
    if (existsSync(out) && !process.argv.includes("--force")) {
      console.log(`Slot ${item.slot} ("${item.displayName}") already exists at ${out}. Skipping generation.`);
      continue;
    }
    console.log(`\n[${i + 1}/${BATCH23.length}] Generating slot ${item.slot}: "${item.displayName}"...`);
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

  console.log("\nBuilding lightweight batch23_gallery.html...");
  let cards = "";
  for (const item of BATCH23) {
    const imgPath = `${BRAIN_DIR}/batch23_${item.word}.png`;
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
  <title>Batch 23 Gallery (Physical & Playground Verbs — Slots 225–234)</title>
</head>
<body style="margin:0; padding:16px; font-family:-apple-system, BlinkMacSystemFont, sans-serif; background:#f8fafc; color:#0f172a;">
  <h2 style="margin:0 0 4px 0; font-size:20px; font-weight:800;">Batch 23: Physical, Playground & Object Interaction Verbs (Slots 225–234)</h2>
  <p style="margin:0 0 16px 0; font-size:13px; color:#64748b;">Fitzgerald Green Verbs · Object Manipulation & Locomotion</p>
  <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:12px;">
    ${cards}
  </div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch23_gallery.html`, html, "utf8");
  const sizeKB = Math.round(Buffer.byteLength(html) / 1024);
  console.log(`Saved batch23_gallery.html -> ${sizeKB} KB (lightweight)`);

  console.log("Building composite grid...");
  const cols = 5;
  const rows = 2;
  const tileSize = 300;
  const pad = 10;
  const gridW = cols * tileSize + (cols + 1) * pad;
  const gridH = rows * tileSize + (rows + 1) * pad;

  const composites = [];
  for (let i = 0; i < BATCH23.length; i++) {
    const item = BATCH23[i];
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = pad + c * (tileSize + pad);
    const y = pad + r * (tileSize + pad);
    const imgPath = `${BRAIN_DIR}/batch23_${item.word}.png`;
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
  .toFile(`${BRAIN_DIR}/batch23_grid.png`);

  console.log("Saved batch23_grid.png");

  console.log("Building 48x48 preview strip...");
  const stripCols = BATCH23.length;
  const stripCell = 64; // 48px image + 16px padding
  const stripW = stripCols * stripCell;
  const stripH = stripCell;
  const stripComposites = [];

  for (let i = 0; i < BATCH23.length; i++) {
    const item = BATCH23[i];
    const imgPath = `${BRAIN_DIR}/batch23_${item.word}.png`;
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
  .toFile(`${BRAIN_DIR}/batch23_strip_48.png`);

  console.log("Saved batch23_strip_48.png");
}

run().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
