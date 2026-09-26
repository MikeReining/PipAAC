import { generateToFile } from "./gen.mjs";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const REFINEMENTS = [
  {
    slot: 276,
    word: "aunt",
    displayName: "aunt",
    torso: "yellow",
    framing: "bust",
    hint: "Close-up bust shot of a kind adult female stick figure in a solid yellow shirt. The figure has neat wavy shoulder-length hair and a warm friendly smile. The figure has TWO complete arms: one arm is raised gently with the hand beside the jaw and cheek in the ASL aunt gesture, and the other arm rests naturally straight down at the side with a clear circular hand. Both arms are fully visible and connected. Pure white background, bold black outline.",
    note: "Two complete arms: one at jaw in ASL aunt sign, one straight at side",
    changeDesc: "Fixed missing/cut-off arm; both arms now complete and connected.",
  },
  {
    slot: 277,
    word: "uncle",
    displayName: "uncle",
    torso: "yellow",
    framing: "bust",
    hint: "Close-up bust shot of a kind adult male stick figure in a solid yellow shirt. The figure has neat short dark hair and a warm friendly smile. The figure has TWO complete arms: one arm is raised beside the temple in the ASL uncle gesture, and the other arm is resting naturally straight down at the side with a clear circular hand. Both arms are fully visible and connected to the shoulders. Head fills ~50% of the frame. Pure white background, bold black outline.",
    note: "Two complete arms: one at temple in ASL uncle sign, one straight at side",
    changeDesc: "Added missing second arm; now has two complete arms with clear hands.",
  },
  {
    slot: 278,
    word: "cousin",
    displayName: "cousin",
    torso: "yellow",
    framing: "bust",
    hint: "Close-up bust shot of two peer stick figures standing side by side in solid yellow shirts, their heads and torsos filling 75% of the frame. Both figures have TWO complete arms resting naturally down at their sides with clear circular hands, no waving arms. The figure on the left is standard Pip. The peer figure on the right is a smiling cousin with neat curly ringlet hair. A clean, bold, solid black arrow (NOT pink, NOT colored) points directly downward at the curly-haired cousin's head to designate 'cousin'. Both figures have warm friendly smiling faces. Pure white background, bold black outline.",
    note: "Bold black arrow directly over curly-haired cousin; both have 2 arms at sides",
    changeDesc: "Replaced pink centered arrow with bold black arrow directly over cousin; both figures have 2 arms.",
  },
  {
    slot: 281,
    word: "therapist",
    displayName: "therapist",
    torso: "yellow",
    framing: null,
    hint: "A clear illustration of a therapy session. On the right, a kind therapist with a solid yellow shirt sits in a comfortable armchair, holding a notepad and pen, listening attentively with a warm supportive smile. On the left, a person sits in a comfortable armchair across from the therapist, relaxing and talking. Both figures have two complete arms and legs, seated in simple elegant chairs. Clean therapy office studio scene. Pure white background, bold black outline, high contrast.",
    note: "Therapy session studio: therapist in chair with notepad listening to client in chair",
    changeDesc: "Redesigned from classroom to dedicated therapy studio with armchairs, notepad, and listening session.",
  },
  {
    slot: 282,
    word: "aide",
    displayName: "aide",
    torso: "yellow",
    framing: "bust",
    hint: "Close-up shot of a kind adult helper stick figure with a solid yellow shirt as a classroom aide. The aide wears a visible ID badge lanyard around the neck, and stands supportively beside a student stick figure. The aide has TWO complete arms, gently helping and guiding the student with both hands in a caring assistant posture. Both figures have two complete arms and warm smiling faces. Pure white background, bold black outline.",
    note: "Aide with ID lanyard badge actively helping student with both arms",
    changeDesc: "Replaced ambiguous touch with clear 2-armed aide wearing ID badge lanyard assisting student.",
  },
  {
    slot: 289,
    word: "neighbor",
    displayName: "neighbor",
    torso: "yellow",
    framing: "bust",
    hint: "Close-up bust shot of two friendly stick figures in solid yellow shirts on opposite sides of a clean white wooden picket fence. Each figure has TWO complete arms: one arm is raised waving high in a cheerful greeting, and the other arm is resting naturally on top of the fence with a visible hand. Both figures smile warmly at each other across the fence. Pure white background, bold black outline.",
    note: "Two complete arms each: one waving over fence, one resting on fence",
    changeDesc: "Added missing second arms; both figures now have two fully drawn arms.",
  },
];

const ALL_SLOTS = [
  { slot: 276, word: "aunt", displayName: "aunt", color: "yellow", note: "Two complete arms: one at jaw in ASL aunt sign, one straight at side" },
  { slot: 277, word: "uncle", displayName: "uncle", color: "yellow", note: "Two complete arms: one at temple in ASL uncle sign, one straight at side" },
  { slot: 278, word: "cousin", displayName: "cousin", color: "yellow", note: "Bold black arrow directly over curly-haired cousin; both have 2 arms at sides" },
  { slot: 281, word: "therapist", displayName: "therapist", color: "yellow", note: "Therapy session studio: therapist in chair with notepad listening to client in chair" },
  { slot: 282, word: "aide", displayName: "aide", color: "yellow", note: "Aide with ID lanyard badge actively helping student with both arms" },
  { slot: 283, word: "student", displayName: "student", color: "yellow", note: "Cheerful student wearing backpack shoulder straps holding notebook" },
  { slot: 285, word: "class", displayName: "class", color: "yellow", note: "Trio of student peers standing together side-by-side" },
  { slot: 289, word: "neighbor", displayName: "neighbor", color: "yellow", note: "Two complete arms each: one waving over fence, one resting on fence" },
  { slot: 290, word: "person", displayName: "person", color: "yellow", note: "Single iconic canonical figure with yellow shirt and warm smile" },
  { slot: 291, word: "people", displayName: "people", color: "yellow", note: "Diverse group of three figures clustered together (plural collective)" },
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
    const current = `${BRAIN_DIR}/batch28_${item.word}.png`;
    const roll1 = `${BRAIN_DIR}/batch28_${item.word}_roll1.png`;
    if (existsSync(current) && !existsSync(roll1)) {
      copyFileSync(current, roll1);
      console.log(`Preserved Roll 1: ${roll1}`);
    }
  }

  console.log("\n=== Generating 6 Refined Symbols for Batch 28 ===");
  for (let i = 0; i < REFINEMENTS.length; i++) {
    const item = REFINEMENTS[i];
    const out = `${BRAIN_DIR}/batch28_${item.word}.png`;
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
    const imgPath = `${BRAIN_DIR}/batch28_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch28_grid.png`);
  console.log("Updated batch28_grid.png");

  const stripCols = ALL_SLOTS.length;
  const stripCell = 64;
  const stripW = stripCols * stripCell;
  const stripH = stripCell;
  const stripComposites = [];

  for (let i = 0; i < ALL_SLOTS.length; i++) {
    const item = ALL_SLOTS[i];
    const imgPath = `${BRAIN_DIR}/batch28_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch28_strip_48.png`);
  console.log("Updated batch28_strip_48.png");

  console.log("\n=== Building Interactive Review HTML with Comparisons ===");
  let mainCards = "";
  for (const item of ALL_SLOTS) {
    const imgPath = `${BRAIN_DIR}/batch28_${item.word}.png`;
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

  // Side-by-side comparison cards for the 6 refined items
  let comparisonCards = "";
  for (const item of REFINEMENTS) {
    const roll1Path = `${BRAIN_DIR}/batch28_${item.word}_roll1.png`;
    const roll2Path = `${BRAIN_DIR}/batch28_${item.word}.png`;
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
  <title>Batch 28 Refinement Review: Extended Family & School Community</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-900 antialiased p-4">
  <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm max-w-5xl mx-auto">
    <div class="mb-5 border-b border-slate-100 pb-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-extrabold text-slate-900 tracking-tight">Batch 28: Extended Family & School Community (Refined)</h1>
          <p class="text-xs text-slate-500 mt-1">Slots 276–291 · 6 Refined Rolls · Two-Arm Anatomy Fixes · Dedicated Therapy Studio · Lifespan Dignity</p>
        </div>
        <span class="text-xs font-semibold px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">6 Upgrades Complete</span>
      </div>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
      ${mainCards}
    </div>

    <div class="mt-8 pt-5 border-t border-slate-200">
      <h2 class="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">Roll 1 vs Roll 2: Anatomical & Concept Upgrades</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        ${comparisonCards}
      </div>
    </div>
  </div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch28_review.html`, html, "utf8");
  const sizeKB = Math.round(Buffer.byteLength(html) / 1024);
  console.log(`Saved batch28_review.html -> ${sizeKB} KB (lightweight Tailwind)`);

  try {
    execSync(`open "${BRAIN_DIR}/batch28_review.html"`);
    console.log("Opened batch28_review.html in browser");
  } catch (err) {
    console.error("Could not run open command:", err);
  }
}

run().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
