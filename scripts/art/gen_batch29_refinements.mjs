import { generateToFile } from "./gen.mjs";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const REFINEMENTS = [
  {
    slot: 293,
    word: "doctor",
    displayName: "doctor",
    torso: "yellow",
    framing: "bust",
    hint: "Close-up bust shot of a kind stick figure as a doctor. The figure wears a clean white medical lab coat over a solid yellow shirt. Draped around the neck is a SINGLE, clean, simple black stethoscope loop with one round chest piece hanging straight down in the center (no extra wires, no tangled cords). On the chest pocket of the white coat is a crisp blue square hospital ID badge with a bold white capital 'H' inside. The figure has TWO complete arms, holding a medical clipboard in one hand, with a warm reassuring smile. Head fills ~50% of the frame. Pure white background, bold black outline, high contrast.",
    note: "Single clean stethoscope (no tangled cords), white coat, blue hospital 'H' badge",
    changeDesc: "Eliminated tangled double-stethoscope clutter; simplified to a single clean stethoscope loop and blue 'H' badge.",
  },
  {
    slot: 294,
    word: "nurse",
    displayName: "nurse",
    torso: "yellow",
    framing: "bust",
    hint: "Close-up bust shot of a caring stick figure as a hospital nurse. The figure wears a solid soft medical scrub top over a yellow undershirt. NO stethoscope, NO wires around the neck. On the scrub chest is a crisp blue square hospital ID badge with a bold white capital 'H' inside. The figure has TWO complete arms, with hands held together gently in front in a comforting, caring gesture, with a kind loving smile. Clean uncluttered torso. Head fills ~50% of the frame. Pure white background, bold black outline.",
    note: "Clean blue medical scrubs with hospital 'H' badge, NO stethoscope wires",
    changeDesc: "Removed stethoscope to prevent clutter and distinguish cleanly from doctor; clean scrubs + 'H' badge.",
  },
  {
    slot: 296,
    word: "name",
    displayName: "name",
    torso: null,
    framing: "object",
    hint: "A clean, iconic rectangular adhesive name tag badge. Across the top is a solid bright red horizontal header band with NO text inside the red band. In the clean white area below the red band is the single word 'NAME' written in large, thick, bold, uppercase black letters. Directly below the word 'NAME' is a clean, bold black horizontal underline line for writing a name. High contrast graphic badge, isolated on pure white background, bold black outline.",
    note: "Solid red header band + bold 'NAME' text + clean write-in underline",
    changeDesc: "Replaced micro-text 'HELLO my name is' with solid red top band and bold, high-contrast 'NAME' + underline.",
  },
];

const ALL_SLOTS = [
  { slot: 293, word: "doctor", displayName: "doctor", color: "yellow", note: "Single clean stethoscope, white coat, blue hospital 'H' badge" },
  { slot: 294, word: "nurse", displayName: "nurse", color: "yellow", note: "Clean blue scrubs with hospital 'H' badge, NO stethoscope wires" },
  { slot: 295, word: "babysitter", displayName: "babysitter", color: "yellow", note: "Babysitter reading a colorful picture storybook with a toddler" },
  { slot: 286, word: "firefighter", displayName: "firefighter", color: "yellow", note: "Firefighter in jacket with reflective stripes and red helmet with shield" },
  { slot: 287, word: "police_officer", displayName: "police officer", color: "yellow", note: "Police officer in uniform with silver shield badge and peaked cap" },
  { slot: 288, word: "bus_driver", displayName: "bus driver", color: "yellow", note: "Bus driver with peaked cap holding steering wheel in front of school bus" },
  { slot: 292, word: "kids", displayName: "kids", color: "yellow", note: "Two cheerful peer children standing together with arms around shoulders" },
  { slot: 296, word: "name", displayName: "name", color: "yellow", note: "Solid red header band + bold 'NAME' text + clean write-in underline" },
  { slot: 674, word: "man", displayName: "man", color: "yellow", note: "Adult male stick figure with neat short hair and arms at sides" },
  { slot: 675, word: "woman", displayName: "woman", color: "yellow", note: "Adult female stick figure with neat wavy hair and arms at sides" },
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
    const current = `${BRAIN_DIR}/batch29_${item.word}.png`;
    const roll1 = `${BRAIN_DIR}/batch29_${item.word}_roll1.png`;
    if (existsSync(current) && !existsSync(roll1)) {
      copyFileSync(current, roll1);
      console.log(`Preserved Roll 1: ${roll1}`);
    }
  }

  console.log("\n=== Generating 3 Refined Symbols for Batch 29 ===");
  for (let i = 0; i < REFINEMENTS.length; i++) {
    const item = REFINEMENTS[i];
    const out = `${BRAIN_DIR}/batch29_${item.word}.png`;
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
    const imgPath = `${BRAIN_DIR}/batch29_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch29_grid.png`);
  console.log("Updated batch29_grid.png");

  const stripCols = ALL_SLOTS.length;
  const stripCell = 64;
  const stripW = stripCols * stripCell;
  const stripH = stripCell;
  const stripComposites = [];

  for (let i = 0; i < ALL_SLOTS.length; i++) {
    const item = ALL_SLOTS[i];
    const imgPath = `${BRAIN_DIR}/batch29_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch29_strip_48.png`);
  console.log("Updated batch29_strip_48.png");

  console.log("\n=== Building Interactive Review HTML with Comparisons ===");
  let mainCards = "";
  for (const item of ALL_SLOTS) {
    const imgPath = `${BRAIN_DIR}/batch29_${item.word}.png`;
    const b64Main = await getWebpB64(imgPath, 180);
    const b64Mini = await getWebpB64(imgPath, 48);

    const isRefined = REFINEMENTS.some((r) => r.word === item.word);
    const rollBadge = isRefined
      ? `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Roll 2 Refined</span>`
      : `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">Roll 1</span>`;

    mainCards += `
      <div class="border border-slate-200 bg-white rounded-xl p-3 flex flex-col items-center shadow-xs hover:shadow-md transition">
        <div class="w-full flex justify-between items-center mb-1.5">
          <span class="text-[11px] font-bold text-slate-400">#${item.slot}</span>
          <div class="flex gap-1">${rollBadge} <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">Person</span></div>
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

  // Side-by-side comparison cards for the 3 refined items
  let comparisonCards = "";
  for (const item of REFINEMENTS) {
    const roll1Path = `${BRAIN_DIR}/batch29_${item.word}_roll1.png`;
    const roll2Path = `${BRAIN_DIR}/batch29_${item.word}.png`;
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
  <title>Batch 29 Refinement Review: Healthcare, Helpers & Demographics</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-900 antialiased p-4">
  <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm max-w-5xl mx-auto">
    <div class="mb-5 border-b border-slate-100 pb-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-extrabold text-slate-900 tracking-tight">Batch 29: Healthcare, Helpers & Demographics (Refined)</h1>
          <p class="text-xs text-slate-500 mt-1">Slots 286–296, 674–675 · 3 Clinical Upgrades · De-cluttered Stethoscopes · Clean "NAME" Badge</p>
        </div>
        <span class="text-xs font-semibold px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">3 Upgrades Complete</span>
      </div>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
      ${mainCards}
    </div>

    <div class="mt-8 pt-5 border-t border-slate-200">
      <h2 class="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">Roll 1 vs Roll 2: Clinical Upgrades Comparison</h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        ${comparisonCards}
      </div>
    </div>
  </div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch29_review.html`, html, "utf8");
  const sizeKB = Math.round(Buffer.byteLength(html) / 1024);
  console.log(`Saved batch29_review.html -> ${sizeKB} KB (lightweight Tailwind)`);

  try {
    execSync(`open "${BRAIN_DIR}/batch29_review.html"`);
    console.log("Opened batch29_review.html in browser");
  } catch (err) {
    console.error("Could not run open command:", err);
  }
}

run().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
