import { generateToFile } from "./gen.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH25 = [
  {
    slot: 245,
    word: "share",
    displayName: "share",
    torso: "green",
    framing: "bust",
    hint: "Close-up shot of a single friendly stick figure with a solid green torso and warm smiling face. The figure is holding out half of a round golden-brown chocolate chip cookie with both hands toward the viewer in a generous offering gesture. Head fills ~50% of the frame. Pure white background, bold black outline.",
    note: "Offering half a cookie with both hands (bust)",
  },
  {
    slot: 246,
    word: "clean_up",
    fileWord: "clean_up",
    displayName: "clean up",
    torso: "green",
    framing: "full",
    hint: "Full body stick figure with a solid green torso bending down to place a red toy block into an open blue storage toy box on the floor. Exactly two arms and exactly two legs, neat tidy room. Pure white background, bold black outline.",
    note: "Placing toy into open storage bin (full)",
  },
  {
    slot: 247,
    word: "wash",
    displayName: "wash",
    torso: "green",
    framing: "bust",
    hint: "Close-up bust shot of a stick figure with a solid green torso washing their hands under a stream of clean water from a silver faucet, with fluffy white soap foam bubbles on their hands. Head fills ~50% of the frame. Pure white background, bold black outline.",
    note: "Washing hands with soap under faucet (bust)",
  },
  {
    slot: 248,
    word: "wipe",
    displayName: "wipe",
    torso: "green",
    framing: "bust",
    hint: "Close-up bust shot of a stick figure with a solid green torso holding a bright yellow cleaning cloth, wiping a clean horizontal tabletop surface with a clear diagonal shine streak. Pure white background, bold black outline.",
    note: "Wiping table surface with yellow cloth (bust)",
  },
  {
    slot: 249,
    word: "cook",
    displayName: "cook",
    torso: "green",
    framing: "bust",
    hint: "Close-up bust shot of a stick figure with a solid green torso holding a wooden spoon, stirring food inside a silver cooking pot on the stove with gentle steam curling up. Head fills ~50% of the frame. Pure white background, bold black outline.",
    note: "Stirring silver cooking pot with wooden spoon (bust)",
  },
  {
    slot: 250,
    word: "build",
    displayName: "build",
    torso: "green",
    framing: "bust",
    hint: "Close-up bust shot of a stick figure with a solid green torso wearing a bright yellow construction hard hat on their head, holding a wooden handle hammer tapping a nail into a wooden frame. Head fills ~50% of the frame. Pure white background, bold black outline.",
    note: "Yellow hard hat and hammer building wooden frame (bust)",
  },
  {
    slot: 251,
    word: "fix",
    displayName: "fix",
    torso: "green",
    framing: "bust",
    hint: "Close-up bust shot of a stick figure with a solid green torso holding a silver adjustable wrench in hand, tightening a bolt on a mechanical toy gear. Head fills ~50% of the frame. Pure white background, bold black outline.",
    note: "Tightening bolt with silver wrench (bust)",
  },
  {
    slot: 252,
    word: "hold",
    displayName: "hold",
    torso: "green",
    framing: "bust",
    hint: "Close-up bust shot of a stick figure with a solid green torso and warm smiling face, securely cradling and hugging a cute brown teddy bear against their chest with both arms. Head fills ~50% of the frame. Pure white background, bold black outline.",
    note: "Hugging brown teddy bear with both arms (bust)",
  },
  {
    slot: 253,
    word: "touch",
    displayName: "touch",
    torso: "green",
    framing: "bust",
    hint: "Close-up shot of a stick figure with a solid green torso extending one hand forward, gently touching a smooth blue sphere with their index fingertip, with subtle clean circular touch ripples at the point of contact. Pure white background, bold black outline.",
    note: "Extending index finger touching sphere (bust)",
  },
  {
    slot: 254,
    word: "know",
    displayName: "know",
    torso: "green",
    framing: "bust",
    hint: "Close-up bust shot of a stick figure with a solid green torso and a confident happy smile, performing the ASL sign for 'know': the fingertips of one hand are placed gently against the side of the temple and forehead. The other arm rests naturally along the torso. Head fills ~50% of the frame. Pure white background, bold black outline.",
    note: "Fingertips touching temple in ASL know sign (bust)",
  },
];

async function run() {
  console.log(`Starting Batch 25 generation (${BATCH25.length} words: Daily Living, Care & Cognitive Actions)...`);

  for (let i = 0; i < BATCH25.length; i++) {
    const item = BATCH25[i];
    const fileName = item.fileWord ?? item.word;
    const out = `${BRAIN_DIR}/batch25_${fileName}.png`;
    if (existsSync(out) && !process.argv.includes("--force")) {
      console.log(`Slot ${item.slot} ("${item.displayName}") already exists at ${out}. Skipping generation.`);
      continue;
    }
    console.log(`\n[${i + 1}/${BATCH25.length}] Generating slot ${item.slot}: "${item.displayName}"...`);
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

  console.log("\nBuilding lightweight batch25_gallery.html...");
  let cards = "";
  for (const item of BATCH25) {
    const fileName = item.fileWord ?? item.word;
    const imgPath = `${BRAIN_DIR}/batch25_${fileName}.png`;
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
  <title>Batch 25 Gallery (Daily Living, Care & Cognitive Actions — Slots 245–254)</title>
</head>
<body style="margin:0; padding:16px; font-family:-apple-system, BlinkMacSystemFont, sans-serif; background:#f8fafc; color:#0f172a;">
  <h2 style="margin:0 0 4px 0; font-size:20px; font-weight:800;">Batch 25: Daily Living, Care & Cognitive Actions (Slots 245–254)</h2>
  <p style="margin:0 0 16px 0; font-size:13px; color:#64748b;">Fitzgerald Green Verbs · School, Home & Daily Living</p>
  <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:12px;">
    ${cards}
  </div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch25_gallery.html`, html, "utf8");
  const sizeKB = Math.round(Buffer.byteLength(html) / 1024);
  console.log(`Saved batch25_gallery.html -> ${sizeKB} KB (lightweight)`);

  console.log("Building composite grid...");
  const cols = 5;
  const rows = 2;
  const tileSize = 300;
  const pad = 10;
  const gridW = cols * tileSize + (cols + 1) * pad;
  const gridH = rows * tileSize + (rows + 1) * pad;

  const composites = [];
  for (let i = 0; i < BATCH25.length; i++) {
    const item = BATCH25[i];
    const fileName = item.fileWord ?? item.word;
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = pad + c * (tileSize + pad);
    const y = pad + r * (tileSize + pad);
    const imgPath = `${BRAIN_DIR}/batch25_${fileName}.png`;
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
  .toFile(`${BRAIN_DIR}/batch25_grid.png`);

  console.log("Saved batch25_grid.png");

  console.log("Building 48x48 preview strip...");
  const stripCols = BATCH25.length;
  const stripCell = 64;
  const stripW = stripCols * stripCell;
  const stripH = stripCell;
  const stripComposites = [];

  for (let i = 0; i < BATCH25.length; i++) {
    const item = BATCH25[i];
    const fileName = item.fileWord ?? item.word;
    const imgPath = `${BRAIN_DIR}/batch25_${fileName}.png`;
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
  .toFile(`${BRAIN_DIR}/batch25_strip_48.png`);

  console.log("Saved batch25_strip_48.png");
}

run().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
