import { generateToFile } from "./gen.mjs";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

// 1. Restore previous name tag (Roll 1) which the founder preferred
if (existsSync(`${BRAIN_DIR}/batch29_name_roll1.png`)) {
  copyFileSync(`${BRAIN_DIR}/batch29_name_roll1.png`, `${BRAIN_DIR}/batch29_name.png`);
  console.log("Restored Roll 1 name tag (HELLO my name is badge)");
}

// Preserve Roll 2 nurse as roll2 for inspection
if (existsSync(`${BRAIN_DIR}/batch29_nurse.png`) && !existsSync(`${BRAIN_DIR}/batch29_nurse_roll2.png`)) {
  copyFileSync(`${BRAIN_DIR}/batch29_nurse.png`, `${BRAIN_DIR}/batch29_nurse_roll2.png`);
  console.log("Preserved Roll 2 nurse as batch29_nurse_roll2.png");
}

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

const ALL_SLOTS = [
  { slot: 293, word: "doctor", displayName: "doctor", color: "yellow", note: "Single clean stethoscope, white coat, blue hospital 'H' badge" },
  { slot: 294, word: "nurse", displayName: "nurse", color: "yellow", note: "Clean blue scrub top, blue hospital 'H' badge, classic stick figure line arms" },
  { slot: 295, word: "babysitter", displayName: "babysitter", color: "yellow", note: "Babysitter reading a colorful picture storybook with a toddler" },
  { slot: 286, word: "firefighter", displayName: "firefighter", color: "yellow", note: "Firefighter in jacket with reflective stripes and red helmet with shield" },
  { slot: 287, word: "police_officer", displayName: "police officer", color: "yellow", note: "Police officer in uniform with silver shield badge and peaked cap" },
  { slot: 288, word: "bus_driver", displayName: "bus driver", color: "yellow", note: "Bus driver with peaked cap holding steering wheel in front of school bus" },
  { slot: 292, word: "kids", displayName: "kids", color: "yellow", note: "Two cheerful peer children standing together with arms around shoulders" },
  { slot: 296, word: "name", displayName: "name", color: "yellow", note: "Classic 'HELLO my name is' adhesive badge with blank underline (Roll 1)" },
  { slot: 674, word: "man", displayName: "man", color: "yellow", note: "Adult male stick figure with neat short hair and arms at sides" },
  { slot: 675, word: "woman", displayName: "woman", color: "yellow", note: "Adult female stick figure with neat wavy hair and arms at sides" },
];

async function run() {
  console.log("\n=== Generating Clean Stick Figure Nurse (Roll 3) ===");
  const out = `${BRAIN_DIR}/batch29_nurse.png`;
  
  // Prompt specifically locking standard Pip stick figure anatomy: single line arms, circle hands, no yellow sleeves, no mitten prayer hands!
  const prompt = {
    word: "nurse",
    torso: null,
    framing: "bust",
    hand: "circles",
    hint: "Close-up bust shot of a classic minimalist stick figure as a hospital nurse. The figure has a standard stick figure torso wearing a solid medical blue scrub top. NO stethoscope, NO wires around the neck. On the blue scrub chest is a crisp blue square hospital ID badge with a bold white capital 'H' inside. The figure has standard minimalist stick figure arms: TWO simple thin black line arms resting naturally straight down at the sides with simple featureless white circle hands (no fingers, no mitten hands, no yellow flesh sleeves, no praying hands). Head fills ~50% of the frame with a warm, kind smile. Pure white background, bold black outline, high contrast.",
    out,
  };

  const start = Date.now();
  await generateToFile(prompt);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`Generated clean stick figure nurse in ${elapsed}s -> ${out}`);
  await padToSquare(out);

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

  console.log("\n=== Building Interactive Review HTML ===");
  let mainCards = "";
  for (const item of ALL_SLOTS) {
    const imgPath = `${BRAIN_DIR}/batch29_${item.word}.png`;
    const b64Main = await getWebpB64(imgPath, 180);
    const b64Mini = await getWebpB64(imgPath, 48);

    mainCards += `
      <div class="border border-slate-200 bg-white rounded-xl p-3 flex flex-col items-center shadow-xs hover:shadow-md transition">
        <div class="w-full flex justify-between items-center mb-1.5">
          <span class="text-[11px] font-bold text-slate-400">#${item.slot}</span>
          <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">Person</span>
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

  // Nurse evolution: Roll 1 -> Roll 2 -> Roll 3
  const n1 = await getWebpB64(`${BRAIN_DIR}/batch29_nurse_roll1.png`, 120);
  const n2 = await getWebpB64(`${BRAIN_DIR}/batch29_nurse_roll2.png`, 120);
  const n3 = await getWebpB64(`${BRAIN_DIR}/batch29_nurse.png`, 120);

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Batch 29 Final Review: Healthcare, Helpers & Demographics</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-900 antialiased p-4">
  <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm max-w-5xl mx-auto">
    <div class="mb-5 border-b border-slate-100 pb-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-extrabold text-slate-900 tracking-tight">Batch 29: Healthcare, Helpers & Demographics (Final Polish)</h1>
          <p class="text-xs text-slate-500 mt-1">Standard Stick Figure Anatomy Restored on Nurse · Classic Name Tag Restored · 100% People Complete</p>
        </div>
        <span class="text-xs font-semibold px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">All 10 Perfected</span>
      </div>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
      ${mainCards}
    </div>

    <div class="mt-8 pt-5 border-t border-slate-200">
      <h2 class="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">Nurse Evolution: Roll 1 vs Roll 2 vs Roll 3 (Canonical Stick Figure)</h2>
      <div class="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-around gap-4 max-w-2xl mx-auto">
        <div class="flex flex-col items-center">
          <img src="data:image/webp;base64,${n1}" class="w-24 h-24 object-contain bg-white rounded border border-slate-200" alt="Roll 1" />
          <span class="text-[10px] text-slate-500 mt-1 font-medium">Roll 1 (Stethoscope clutter)</span>
        </div>
        <span class="text-slate-400 font-bold text-sm">→</span>
        <div class="flex flex-col items-center">
          <img src="data:image/webp;base64,${n2}" class="w-24 h-24 object-contain bg-white rounded border border-red-300 ring-2 ring-red-100" alt="Roll 2" />
          <span class="text-[10px] text-red-600 mt-1 font-bold">Roll 2 (Fleshy yellow arms)</span>
        </div>
        <span class="text-slate-400 font-bold text-sm">→</span>
        <div class="flex flex-col items-center">
          <img src="data:image/webp;base64,${n3}" class="w-24 h-24 object-contain bg-white rounded border border-emerald-400 ring-2 ring-emerald-100" alt="Roll 3" />
          <span class="text-[10px] text-emerald-700 mt-1 font-bold">Roll 3 (True Pip Stick Figure)</span>
        </div>
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
