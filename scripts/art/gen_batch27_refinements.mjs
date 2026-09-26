import { generateToFile } from "./gen.mjs";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const REFINEMENTS = [
  {
    slot: 271,
    word: "baby",
    displayName: "baby",
    torso: "yellow",
    framing: "bust",
    hint: "A cute, small baby stick figure wearing a solid yellow onesie, sitting cheerfully. The baby has a large round head with big happy curious eyes and a sweet smile, holding a bright sky-blue baby rattle with a round blue rattle ball in one hand. The bright blue rattle contrasts vividly against the white background and yellow onesie. Pure white background, bold black outline.",
    note: "Bright sky-blue rattle for sharp contrast against white canvas",
    changeDesc: "White rattle replaced with vivid sky-blue rattle for sharp 48px contrast.",
  },
  {
    slot: 272,
    word: "brother",
    displayName: "brother",
    torso: "yellow",
    framing: "bust",
    hint: "Close-up bust shot of two peer stick figures standing side by side in solid yellow shirts, their heads and torsos filling 75% of the frame. Both figures have their arms resting naturally down at their sides, no outstretched waving arms. The figure on the left is standard Pip. The peer figure on the right is a boy with distinct short spiky hair tufts on top (matching the boy hairstyle from the 'he' symbol). A clean bold black arrow points directly downward at the spiky-haired boy figure to designate 'brother'. Both figures have warm friendly smiling faces. Pure white background, bold black outline.",
    note: "Tight framing with arms at sides; 75% vertical fill; bold black arrow",
    changeDesc: "Eliminated wide waving arms; figures enlarged by ~40% with clean black arrow.",
  },
  {
    slot: 273,
    word: "sister",
    displayName: "sister",
    torso: "yellow",
    framing: "bust",
    hint: "Close-up bust shot of two peer stick figures standing side by side in solid yellow shirts, their heads and torsos filling 75% of the frame. Both figures have their arms resting naturally down at their sides, no outstretched waving arms. The figure on the left is standard Pip. The peer figure on the right is a girl with a neat high ponytail tied back (matching the girl hairstyle from the 'she' symbol). A clean bold black arrow points directly downward at the ponytail girl figure to designate 'sister'. Both figures have warm friendly smiling faces. Pure white background, bold black outline.",
    note: "Tight framing with arms at sides; 75% vertical fill; bold black arrow",
    changeDesc: "Eliminated wide waving arms; figures enlarged by ~40% with matching black arrow.",
  },
  {
    slot: 274, // grandma kept as-is
    word: "grandma",
    skipGen: true,
  },
  {
    slot: 275,
    word: "grandpa",
    displayName: "grandpa",
    torso: "yellow",
    framing: "bust",
    hint: "Close-up bust shot of a kind, dignified elder stick figure with a solid yellow shirt. The figure has a full neat cap of silver grey hair covering the entire top of the head, neat round black wire-frame spectacles over kind smiling eyes, and a neat clean silver trimmed beard along the chin. One hand holds the curved wooden handle of a walking cane in front. Head fills ~50% of the frame. Dignified, mature lifespan design with no caricatures. Pure white background, bold black outline.",
    note: "Full silver hair cap across crown + spectacles, beard, and cane",
    changeDesc: "Added full silver hair cap across crown so he has complete silver hair.",
  },
  {
    slot: 279,
    word: "pet",
    displayName: "pet",
    torso: "yellow",
    framing: "bust",
    hint: "Close-up bust shot of a stick figure in a solid yellow shirt crouched down right beside a friendly companion dog so their heads are at the same height, filling the upper frame together. The figure is gently stroking the top of the dog's head with an open hand and a warm loving smile. The dog has happy eyes, floppy ears, and a wagging tail. Large heads, close-up composition. Pure white background, bold black outline.",
    note: "Eye-level bust shot: Pip crouched with dog, heads filling upper frame",
    changeDesc: "Pip brought to eye-level with dog; heads and petting gesture twice as large.",
  },
  {
    slot: 280,
    word: "teacher",
    displayName: "teacher",
    torso: "yellow",
    framing: "bust",
    hint: "Close-up bust shot of a stick figure with a solid yellow shirt as a teacher beside a large green classroom chalkboard. The chalkboard prominently displays very large, bold, thick white uppercase letters 'A B C' taking up the entire green board. The teacher smiles warmly while holding a clean pointer stick indicating the letters. Head and chalkboard fill 80% of the frame. Pure white background, bold black outline.",
    note: "Prominent green chalkboard with large, bold, thick white 'A B C'",
    changeDesc: "Chalkboard enlarged with bold, thick 'ABC' typography legible at 48px.",
  },
  {
    slot: 284,
    word: "friend",
    displayName: "friend",
    torso: "yellow",
    framing: "bust",
    hint: "Close-up tight bust shot of two equal-height friendly stick figures in solid yellow shirts giving each other an energetic high-five. Their smiling faces and raised hands fill 80% of the frame, chest up only. Their raised hands meet in the center in a crisp high-five clap with small subtle joy sparkles above. Both figures have bright, wide smiling faces. Pure white background, bold black outline.",
    note: "Tight bust shot: heads and high-five clap fill 80% of frame",
    changeDesc: "Zoomed to tight chest-up shot; high-five and expressions significantly enlarged.",
  },
];

const ALL_SLOTS = [
  { slot: 265, word: "wake_up", displayName: "wake up", color: "green", note: "Sitting upright in bed stretching arms upward, morning sunbeams" },
  { slot: 266, word: "family", displayName: "family", color: "yellow", note: "Loving trio: two adults embracing with child centered in front" },
  { slot: 271, word: "baby", displayName: "baby", color: "yellow", note: "Bright sky-blue rattle for sharp contrast against white canvas" },
  { slot: 272, word: "brother", displayName: "brother", color: "yellow", note: "Tight framing with arms at sides; 75% vertical fill; bold black arrow" },
  { slot: 273, word: "sister", displayName: "sister", color: "yellow", note: "Tight framing with arms at sides; 75% vertical fill; bold black arrow" },
  { slot: 274, word: "grandma", displayName: "grandma", color: "yellow", note: "Dignified elder with round wire spectacles and neat silver hair bun" },
  { slot: 275, word: "grandpa", displayName: "grandpa", color: "yellow", note: "Full silver hair cap across crown + spectacles, beard, and cane" },
  { slot: 279, word: "pet", displayName: "pet", color: "yellow", note: "Eye-level bust shot: Pip crouched with dog, heads filling upper frame" },
  { slot: 280, word: "teacher", displayName: "teacher", color: "yellow", note: "Prominent green chalkboard with large, bold, thick white 'A B C'" },
  { slot: 284, word: "friend", displayName: "friend", color: "yellow", note: "Tight bust shot: heads and high-five clap fill 80% of frame" },
];

async function padToSquare(filePath) {
  const meta = await sharp(filePath).metadata();
  if (meta.width === meta.height) return;
  const maxDim = Math.max(meta.width, meta.height);
  const buf = await sharp(filePath)
    .resize(maxDim, maxDim, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer();
  writeFileSync(filePath, buf);
  console.log(`Padded ${filePath} from ${meta.width}x${meta.height} -> ${maxDim}x${maxDim}`);
}

async function getWebpB64(path, size) {
  const buf = readFileSync(path);
  const thumb = await sharp(buf)
    .resize(size, size, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .webp({ quality: 75 })
    .toBuffer();
  return thumb.toString("base64");
}

async function run() {
  console.log("=== Preserving Roll 1 files ===");
  for (const item of REFINEMENTS) {
    if (item.skipGen) continue;
    const current = `${BRAIN_DIR}/batch27_${item.word}.png`;
    const roll1 = `${BRAIN_DIR}/batch27_${item.word}_roll1.png`;
    if (existsSync(current) && !existsSync(roll1)) {
      copyFileSync(current, roll1);
      console.log(`Preserved Roll 1: ${roll1}`);
    }
  }

  console.log("\n=== Generating 7 Refined Symbols ===");
  for (let i = 0; i < REFINEMENTS.length; i++) {
    const item = REFINEMENTS[i];
    if (item.skipGen) continue;
    const out = `${BRAIN_DIR}/batch27_${item.word}.png`;
    console.log(`\n[${i + 1}/${REFINEMENTS.length}] Re-generating #${item.slot} ${item.displayName}...`);
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
      console.log(`Generated #${item.slot} in ${elapsed}s`);
      await padToSquare(out);
    } catch (err) {
      console.error(`FAILED #${item.slot}:`, err);
    }
  }

  console.log("\n=== Rebuilding Composite Grid & Strip ===");
  const cols = 5;
  const rows = 2;
  const tileSize = 300;
  const pad = 10;
  const gridW = cols * tileSize + (cols + 1) * pad;
  const gridH = rows * tileSize + (rows + 1) * pad;

  const composites = [];
  for (let i = 0; i < ALL_SLOTS.length; i++) {
    const item = ALL_SLOTS[i];
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = pad + c * (tileSize + pad);
    const y = pad + r * (tileSize + pad);
    const imgPath = `${BRAIN_DIR}/batch27_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch27_grid.png`);
  console.log("Updated batch27_grid.png");

  const stripCols = ALL_SLOTS.length;
  const stripCell = 64;
  const stripW = stripCols * stripCell;
  const stripH = stripCell;
  const stripComposites = [];

  for (let i = 0; i < ALL_SLOTS.length; i++) {
    const item = ALL_SLOTS[i];
    const imgPath = `${BRAIN_DIR}/batch27_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch27_strip_48.png`);
  console.log("Updated batch27_strip_48.png");

  console.log("\n=== Building Interactive Review HTML with Comparisons ===");
  let mainCards = "";
  for (const item of ALL_SLOTS) {
    const imgPath = `${BRAIN_DIR}/batch27_${item.word}.png`;
    const b64Main = await getWebpB64(imgPath, 180);
    const b64Mini = await getWebpB64(imgPath, 48);
    const colorBadge = item.color === "green" 
      ? `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">Action (Green)</span>`
      : `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">Person (Yellow)</span>`;

    const isRefined = REFINEMENTS.some((r) => r.word === item.word && !r.skipGen);
    const rollBadge = isRefined
      ? `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Roll 2 Refined</span>`
      : `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">Roll 1</span>`;

    mainCards += `
      <div class="border border-slate-200 bg-white rounded-xl p-3 flex flex-col items-center shadow-xs hover:shadow-md transition">
        <div class="w-full flex justify-between items-center mb-1.5">
          <span class="text-[11px] font-bold text-slate-400">#${item.slot}</span>
          <div class="flex gap-1">${rollBadge} ${colorBadge}</div>
        </div>
        <img src="data:image/webp;base64,${b64Main}" class="w-36 h-36 object-contain rounded border border-slate-100 bg-white" alt="${item.displayName}" />
        <div class="mt-2 font-bold text-sm capitalize text-slate-800">${item.displayName}</div>
        <div class="text-[11px] text-slate-500 text-center mt-0.5 line-clamp-2">${item.note}</div>
        <div class="mt-2 pt-2 border-t border-slate-100 w-full flex items-center justify-center gap-2">
          <span class="text-[10px] text-slate-400 font-medium">48px:</span>
          <img src="data:image/webp;base64,${b64Mini}" class="w-8 h-8 rounded border border-slate-200 bg-white" alt="48px" />
        </div>
      </div>
    `;
  }

  // Side-by-side comparison cards for the 7 refined items
  let comparisonCards = "";
  for (const item of REFINEMENTS) {
    if (item.skipGen) continue;
    const roll1Path = `${BRAIN_DIR}/batch27_${item.word}_roll1.png`;
    const roll2Path = `${BRAIN_DIR}/batch27_${item.word}.png`;
    if (!existsSync(roll1Path) || !existsSync(roll2Path)) continue;

    const b64Roll1 = await getWebpB64(roll1Path, 130);
    const b64Roll2 = await getWebpB64(roll2Path, 130);

    comparisonCards += `
      <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
        <div class="flex justify-between items-center mb-2">
          <span class="text-xs font-bold text-slate-800">#${item.slot} ${item.displayName}</span>
          <span class="text-[10px] text-blue-600 font-medium">Before → After</span>
        </div>
        <div class="flex items-center justify-around gap-2">
          <div class="flex flex-col items-center">
            <img src="data:image/webp;base64,${b64Roll1}" class="w-24 h-24 object-contain bg-white rounded border border-slate-200" alt="Roll 1" />
            <span class="text-[10px] text-slate-500 mt-1">Roll 1</span>
          </div>
          <span class="text-slate-400 font-bold text-sm">→</span>
          <div class="flex flex-col items-center">
            <img src="data:image/webp;base64,${b64Roll2}" class="w-24 h-24 object-contain bg-white rounded border border-emerald-400 ring-2 ring-emerald-100" alt="Roll 2" />
            <span class="text-[10px] font-bold text-emerald-700 mt-1">Roll 2 (Refined)</span>
          </div>
        </div>
        <p class="text-[11px] text-slate-600 mt-2.5 bg-white p-2 rounded border border-slate-100">${item.changeDesc}</p>
      </div>
    `;
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Batch 27 Refinement Review: Awakening & Family Roles</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-900 antialiased p-4">
  <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm max-w-5xl mx-auto">
    <div class="mb-5 border-b border-slate-100 pb-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-extrabold text-slate-900 tracking-tight">Batch 27: Awakening & Family Roles (Refined)</h1>
          <p class="text-xs text-slate-500 mt-1">Slots 265–284 · 7 Refined Rolls · Fitzgerald Yellow + Green · Lifespan Dignity Law · 1:1 Squares</p>
        </div>
        <div class="flex gap-2">
          <span class="text-xs font-semibold px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">7 Upgrades Complete</span>
          <span class="text-xs font-semibold px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full">mama & dada aliased</span>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
      ${mainCards}
    </div>

    <div class="mt-8 pt-5 border-t border-slate-200">
      <h2 class="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">Roll 1 vs Roll 2: Clinical Upgrades Comparison</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        ${comparisonCards}
      </div>
    </div>
  </div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch27_review.html`, html, "utf8");
  const sizeKB = Math.round(Buffer.byteLength(html) / 1024);
  console.log(`Saved batch27_review.html -> ${sizeKB} KB (lightweight Tailwind)`);

  try {
    execSync(`open "${BRAIN_DIR}/batch27_review.html"`);
    console.log("Opened batch27_review.html in browser");
  } catch (err) {
    console.error("Could not run open command:", err);
  }
}

run().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
