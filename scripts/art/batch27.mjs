import { generateToFile } from "./gen.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH27 = [
  {
    slot: 265,
    word: "wake_up",
    displayName: "wake up",
    torso: "green",
    framing: "bust",
    hint: "Close-up bust shot of a stick figure with a solid green torso waking up cheerfully in bed. The figure sits upright, stretching both arms outward and upward in a refreshing morning stretch. Head fills ~50% of the frame with bright wide-open happy eyes and a warm smile. A cozy blue blanket is around the waist, with gentle yellow morning sunbeams radiating softly. Pure white background, bold black outline.",
    note: "Sitting up stretching arms in bed with morning sun (bust)",
  },
  {
    slot: 266,
    word: "family",
    displayName: "family",
    torso: "yellow",
    framing: "bust",
    hint: "Close-up bust shot of a loving family trio of stick figures with solid yellow shirts. Two taller adult figures stand together with arms around each other's shoulders, smiling warmly, while a smaller child stick figure stands in the center between them with a bright happy smile. All three heads fill the upper frame. Pure white background, bold black outline.",
    note: "Loving family trio: two adults embracing with child in center",
  },
  {
    slot: 271,
    word: "baby",
    displayName: "baby",
    torso: "yellow",
    framing: "bust",
    hint: "A cute, small baby stick figure wearing a solid yellow onesie, sitting cheerfully on the floor. The baby has a round head with big happy curious eyes and a sweet smile, holding a simple round baby rattle in one hand. Body is proportionally small and adorable compared to adult Pip. Pure white background, bold black outline.",
    note: "Small baby in yellow onesie sitting with rattle",
  },
  {
    slot: 272,
    word: "brother",
    displayName: "brother",
    torso: "yellow",
    framing: "bust",
    hint: "Close-up bust shot of two peer stick figures standing side by side in solid yellow shirts. The figure on the left is standard Pip. The peer figure on the right is a boy with distinct short spiky hair tufts on top (matching the boy hairstyle from the 'he' symbol). A clean bold black arrow points directly to the spiky-haired boy figure to designate 'brother'. Both figures have warm friendly smiles. Pure white background, bold black outline.",
    note: "Pip with spiky-haired brother indicated by arrow",
  },
  {
    slot: 273,
    word: "sister",
    displayName: "sister",
    torso: "yellow",
    framing: "bust",
    hint: "Close-up bust shot of two peer stick figures standing side by side in solid yellow shirts. The figure on the left is standard Pip. The peer figure on the right is a girl with a neat high ponytail tied back (matching the girl hairstyle from the 'she' symbol). A clean bold black arrow points directly to the ponytail girl figure to designate 'sister'. Both figures have warm friendly smiles. Pure white background, bold black outline.",
    note: "Pip with ponytail sister indicated by arrow",
  },
  {
    slot: 274,
    word: "grandma",
    displayName: "grandma",
    torso: "yellow",
    framing: "bust",
    hint: "Close-up bust shot of a kind, dignified elder stick figure with a solid yellow shirt. The figure wears neat, round black wire-frame spectacles over kind smiling eyes, and has a classic neat silver hair bun on top of the head. A warm, gentle loving smile. Head fills ~50% of the frame. Dignified, mature lifespan design with no caricatures. Pure white background, bold black outline.",
    note: "Dignified elder with round spectacles and silver hair bun",
  },
  {
    slot: 275,
    word: "grandpa",
    displayName: "grandpa",
    torso: "yellow",
    framing: "bust",
    hint: "Close-up bust shot of a kind, dignified elder stick figure with a solid yellow shirt. The figure wears neat, round black wire-frame spectacles over kind smiling eyes, and has a neat, clean white/silver trimmed beard along the chin. One hand holds the curved wooden handle of a walking cane in front. Head fills ~50% of the frame. Dignified, mature lifespan design with no caricatures. Pure white background, bold black outline.",
    note: "Dignified elder with spectacles, silver beard, and cane handle",
  },
  {
    slot: 279,
    word: "pet",
    displayName: "pet",
    torso: "yellow",
    framing: "bust",
    hint: "Close-up shot of a stick figure with a solid yellow shirt gently petting a friendly, happy companion dog sitting beside them. The figure's hand is softly stroking the dog's head with a warm smile. The dog has floppy ears, happy eyes, and a wagging tail. Pure white background, bold black outline.",
    note: "Pip gently stroking the head of a happy companion dog",
  },
  {
    slot: 280,
    word: "teacher",
    displayName: "teacher",
    torso: "yellow",
    framing: "bust",
    hint: "Close-up bust shot of a stick figure with a solid yellow shirt as a teacher. The figure stands beside a clean green classroom chalkboard showing 'A B C' neatly written in white chalk. The figure smiles warmly while holding a clean pointer stick indicating the letters. Head fills ~45% of the frame. Pure white background, bold black outline.",
    note: "Teacher beside chalkboard with ABC holding pointer",
  },
  {
    slot: 284,
    word: "friend",
    displayName: "friend",
    torso: "yellow",
    framing: "bust",
    hint: "Close-up bust shot of two equal-height friendly stick figures in solid yellow shirts giving each other an energetic, cheerful high-five. Their raised hands meet in the center in a crisp high-five clap with small subtle joy sparkles. Both figures have bright, wide smiling faces. Pure white background, bold black outline.",
    note: "Two peer figures in yellow shirts giving a high-five",
  },
];

async function run() {
  console.log(`Starting Batch 27 generation (${BATCH27.length} words: Awakening & Family Roles)...`);

  for (let i = 0; i < BATCH27.length; i++) {
    const item = BATCH27[i];
    const out = `${BRAIN_DIR}/batch27_${item.word}.png`;
    if (existsSync(out) && !process.argv.includes("--force")) {
      console.log(`Slot ${item.slot} ("${item.displayName}") already exists at ${out}. Skipping generation.`);
      continue;
    }
    console.log(`\n[${i + 1}/${BATCH27.length}] Generating slot ${item.slot}: "${item.displayName}"...`);
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

  console.log("\nBuilding lightweight batch27_gallery.html...");
  let cards = "";
  for (const item of BATCH27) {
    const imgPath = `${BRAIN_DIR}/batch27_${item.word}.png`;
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
  <title>Batch 27 Gallery (Awakening & Family Roles)</title>
</head>
<body style="margin:0; padding:16px; font-family:-apple-system, BlinkMacSystemFont, sans-serif; background:#f8fafc; color:#0f172a;">
  <h2 style="margin:0 0 4px 0; font-size:20px; font-weight:800;">Batch 27: Awakening & Family Roles</h2>
  <p style="margin:0 0 16px 0; font-size:13px; color:#64748b;">Fitzgerald Yellow People/Nouns + Green Awakening Verb</p>
  <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:12px;">
    ${cards}
  </div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch27_gallery.html`, html, "utf8");
  const sizeKB = Math.round(Buffer.byteLength(html) / 1024);
  console.log(`Saved batch27_gallery.html -> ${sizeKB} KB (lightweight)`);

  console.log("Building composite grid...");
  const cols = 5;
  const rows = 2;
  const tileSize = 300;
  const pad = 10;
  const gridW = cols * tileSize + (cols + 1) * pad;
  const gridH = rows * tileSize + (rows + 1) * pad;

  const composites = [];
  for (let i = 0; i < BATCH27.length; i++) {
    const item = BATCH27[i];
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = pad + c * (tileSize + pad);
    const y = pad + r * (tileSize + pad);
    const imgPath = `${BRAIN_DIR}/batch27_${item.word}.png`;
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
  .toFile(`${BRAIN_DIR}/batch27_grid.png`);

  console.log("Saved batch27_grid.png");

  console.log("Building 48x48 preview strip...");
  const stripCols = BATCH27.length;
  const stripCell = 64;
  const stripW = stripCols * stripCell;
  const stripH = stripCell;
  const stripComposites = [];

  for (let i = 0; i < BATCH27.length; i++) {
    const item = BATCH27[i];
    const imgPath = `${BRAIN_DIR}/batch27_${item.word}.png`;
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
  .toFile(`${BRAIN_DIR}/batch27_strip_48.png`);

  console.log("Saved batch27_strip_48.png");
}

run().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
