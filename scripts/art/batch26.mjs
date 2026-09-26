import { generateToFile } from "./gen.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH26 = [
  {
    slot: 255,
    word: "remember",
    displayName: "remember",
    torso: "green",
    framing: "bust",
    hint: "Close-up bust shot of a stick figure with a solid green torso. The figure touches their forehead with an extended index finger in thoughtful recall. A clean curved arrow arches backward up and away over their shoulder, pointing backward into the past (pointing away from the figure, never pointing into the head). Head fills ~50% of the frame. Pure white background, bold black outline.",
    note: "Touching forehead with backward arrow pointing away into past (bust)",
  },
  {
    slot: 256,
    word: "forget",
    displayName: "forget",
    torso: "green",
    framing: "bust",
    hint: "Close-up bust shot of a stick figure with a solid green torso. The figure has a flat open hand placed against the forehead wiping across horizontally, with a bold straight arrow pointing outward to the side in the ASL sign for 'forget'. A small clean question mark floats above. Head fills ~50% of the frame. Pure white background, bold black outline.",
    note: "Hand wiping forehead with arrow in ASL forget sign (bust)",
  },
  {
    slot: 257,
    word: "choose",
    displayName: "choose",
    torso: "green",
    framing: "bust",
    hint: "Close-up bust shot of a stick figure with a solid green torso looking down at a table where two distinct items rest side by side: a red ball and a blue square block. The figure extends one arm with an index finger pointing down directly at one of the items to select it. Head fills ~50% of the frame. Pure white background, bold black outline.",
    note: "Pointing finger selecting between two items (bust)",
  },
  {
    slot: 258,
    word: "show",
    displayName: "show",
    torso: "green",
    framing: "bust",
    hint: "Close-up bust shot of a stick figure with a solid green torso and proud happy smile. The figure is holding up a sheet of clean white paper with a simple smiling sun drawing on it, presenting it forward with both hands toward the viewer in a proud 'show' gesture. Head fills ~50% of the frame. Pure white background, bold black outline.",
    note: "Holding up drawing to show viewer (bust)",
  },
  {
    slot: 259,
    word: "ask",
    displayName: "ask",
    torso: "green",
    framing: "bust",
    hint: "Close-up bust shot of a stick figure with a solid green torso raising one arm high in the air with an open palm in the universal classroom gesture for asking a question. A single clean bold black question mark floats beside the raised hand. Other arm rests along the torso. Head fills ~50% of the frame. Pure white background, bold black outline.",
    note: "Raising hand to ask question with ? (bust)",
  },
  {
    slot: 260,
    word: "hug",
    displayName: "hug",
    torso: "green",
    framing: "bust",
    hint: "Close-up bust shot of two friendly stick figures embracing each other warmly in a tight, affectionate two-person hug. Both figures wear solid green shirts. Their heads are close together, smiling with closed happy eyes, with arms wrapped around each other in a snug embrace filling the square frame. Pure white background, bold black outline.",
    note: "Two figures in warm tight embrace (pair bust)",
  },
  {
    slot: 261,
    word: "kiss",
    displayName: "kiss",
    torso: "green",
    framing: "bust",
    hint: "Close-up bust shot of a single friendly stick figure with a solid green torso and warm smiling face. The figure is blowing a kiss: one hand is held near the lips with an open palm blowing outward, and a single clean solid red heart floats gently in the air just in front of the hand. Head fills ~50% of the frame. Pure white background, bold black outline.",
    note: "Blowing kiss from hand with floating red heart (bust)",
  },
  {
    slot: 262,
    word: "laugh",
    displayName: "laugh",
    torso: "green",
    framing: "bust",
    hint: "Close-up bust shot of a stick figure with a solid green torso laughing heartily. The head fills ~50% of the frame, with eyes closed in joyful curved arcs and a wide open laughing mouth. Both hands rest on the lower belly in a hearty laugh. Pure white background, bold black outline.",
    note: "Hearty laugh with open mouth and hands on belly (bust)",
  },
  {
    slot: 263,
    word: "cry",
    displayName: "cry",
    torso: "green",
    framing: "bust",
    hint: "Close-up bust shot of a stick figure with a solid green torso and a sad downturned mouth. Blue tears stream down both cheeks, and the figure has one hand raised to the cheek actively rubbing away a tear with their mitten hand. Other arm rests naturally at side. Head fills ~50% of the frame. Pure white background, bold black outline.",
    note: "Sad face wiping stream of tears from cheek (bust)",
  },
  {
    slot: 264,
    word: "sleep",
    displayName: "sleep",
    torso: "green",
    framing: "bust",
    hint: "A stick figure with a solid green shirt sleeping peacefully tucked inside a cozy wooden bed. The figure's head rests sideways on a soft white pillow with peaceful closed eyes and a gentle smile, with a clean blue blanket pulled up snugly to mid-chest. Pure white background, bold black outline.",
    note: "Sleeping peacefully tucked in cozy bed (bust)",
  },
];

async function run() {
  console.log(`Starting Batch 26 generation (${BATCH26.length} words: Cognitive, Social & Emotional Actions)...`);

  for (let i = 0; i < BATCH26.length; i++) {
    const item = BATCH26[i];
    const out = `${BRAIN_DIR}/batch26_${item.word}.png`;
    if (existsSync(out) && !process.argv.includes("--force")) {
      console.log(`Slot ${item.slot} ("${item.displayName}") already exists at ${out}. Skipping generation.`);
      continue;
    }
    console.log(`\n[${i + 1}/${BATCH26.length}] Generating slot ${item.slot}: "${item.displayName}"...`);
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

  console.log("\nBuilding lightweight batch26_gallery.html...");
  let cards = "";
  for (const item of BATCH26) {
    const imgPath = `${BRAIN_DIR}/batch26_${item.word}.png`;
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
  <title>Batch 26 Gallery (Cognitive, Social & Emotional Actions — Slots 255–264)</title>
</head>
<body style="margin:0; padding:16px; font-family:-apple-system, BlinkMacSystemFont, sans-serif; background:#f8fafc; color:#0f172a;">
  <h2 style="margin:0 0 4px 0; font-size:20px; font-weight:800;">Batch 26: Cognitive, Social & Emotional Actions (Slots 255–264)</h2>
  <p style="margin:0 0 16px 0; font-size:13px; color:#64748b;">Fitzgerald Green Verbs · Social, Emotional & Cognitive Vocabulary</p>
  <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:12px;">
    ${cards}
  </div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch26_gallery.html`, html, "utf8");
  const sizeKB = Math.round(Buffer.byteLength(html) / 1024);
  console.log(`Saved batch26_gallery.html -> ${sizeKB} KB (lightweight)`);

  console.log("Building composite grid...");
  const cols = 5;
  const rows = 2;
  const tileSize = 300;
  const pad = 10;
  const gridW = cols * tileSize + (cols + 1) * pad;
  const gridH = rows * tileSize + (rows + 1) * pad;

  const composites = [];
  for (let i = 0; i < BATCH26.length; i++) {
    const item = BATCH26[i];
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = pad + c * (tileSize + pad);
    const y = pad + r * (tileSize + pad);
    const imgPath = `${BRAIN_DIR}/batch26_${item.word}.png`;
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
  .toFile(`${BRAIN_DIR}/batch26_grid.png`);

  console.log("Saved batch26_grid.png");

  console.log("Building 48x48 preview strip...");
  const stripCols = BATCH26.length;
  const stripCell = 64;
  const stripW = stripCols * stripCell;
  const stripH = stripCell;
  const stripComposites = [];

  for (let i = 0; i < BATCH26.length; i++) {
    const item = BATCH26[i];
    const imgPath = `${BRAIN_DIR}/batch26_${item.word}.png`;
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
  .toFile(`${BRAIN_DIR}/batch26_strip_48.png`);

  console.log("Saved batch26_strip_48.png");
}

run().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
