import { generateToFile } from "./gen.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH38 = [
  {
    slot: 377,
    word: "clock",
    displayName: "clock",
    category: "Home",
    framing: "object",
    hint: "A clean standalone round wall clock with hour and minute hands.",
    note: "Round analog wall clock with hour and minute hands",
  },
  {
    slot: 378,
    word: "trash",
    displayName: "trash",
    category: "Home",
    framing: "object",
    hint: "A clean standalone stainless steel kitchen trash can with a step pedal.",
    note: "Kitchen step-pedal trash can with lid",
  },
  {
    slot: 379,
    word: "sink",
    displayName: "sink",
    category: "Home",
    framing: "object",
    hint: "A clean standalone white porcelain sink basin with a chrome faucet.",
    note: "Porcelain bathroom sink basin with faucet",
  },
  {
    slot: 380,
    word: "mirror",
    displayName: "mirror",
    category: "Home",
    framing: "object",
    hint: "A clean standalone wall mirror with a wooden frame reflecting light.",
    note: "Hanging wall mirror with wooden frame",
  },
  {
    slot: 381,
    word: "rug",
    displayName: "rug",
    category: "Home",
    framing: "object",
    hint: "A clean standalone woven area rug with a simple geometric pattern and fringe.",
    note: "Patterned woven area rug with fringe",
  },
  {
    slot: 382,
    word: "plate",
    displayName: "plate",
    category: "Home",
    framing: "object",
    hint: "A clean standalone ceramic dinner plate.",
    note: "Round ceramic dinner plate",
  },
  {
    slot: 383,
    word: "bowl",
    displayName: "bowl",
    category: "Home",
    framing: "object",
    hint: "A clean standalone ceramic soup bowl.",
    note: "Deep ceramic soup and cereal bowl",
  },
  {
    slot: 384,
    word: "cup",
    displayName: "cup",
    category: "Home",
    framing: "object",
    hint: "A clean standalone ceramic drinking mug with a sturdy handle.",
    note: "Ceramic drinking mug with handle",
  },
  {
    slot: 385,
    word: "fork",
    displayName: "fork",
    category: "Home",
    framing: "object",
    hint: "A clean standalone stainless steel dinner fork.",
    note: "Four-pronged stainless steel dinner fork",
  },
  {
    slot: 386,
    word: "spoon",
    displayName: "spoon",
    category: "Home",
    framing: "object",
    hint: "A clean standalone stainless steel soup spoon.",
    note: "Oval stainless steel soup spoon",
  },
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
  console.log(`Starting Batch 38 generation (${BATCH38.length} words: Home & Dining Objects)...`);

  for (let i = 0; i < BATCH38.length; i++) {
    const item = BATCH38[i];
    const out = `${BRAIN_DIR}/batch38_${item.word}.png`;
    if (existsSync(out) && !process.argv.includes("--force")) {
      console.log(`Slot #${item.slot} ("${item.displayName}") already exists at ${out}. Skipping.`);
      continue;
    }
    console.log(`\n[${i + 1}/${BATCH38.length}] Generating slot #${item.slot}: "${item.displayName}"...`);
    const start = Date.now();
    try {
      await generateToFile({
        word: item.displayName,
        torso: null,
        framing: item.framing ?? "object",
        hint: item.hint,
        out,
      });
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`Done slot #${item.slot}: "${item.displayName}" in ${elapsed}s -> ${out}`);
      await padToSquare(out);
    } catch (err) {
      console.error(`FAILED slot #${item.slot}: "${item.displayName}"`, err);
    }
  }

  console.log("\nBuilding composite grid...");
  const cols = 5;
  const rows = 2;
  const tileSize = 300;
  const pad = 10;
  const gridW = cols * tileSize + (cols + 1) * pad;
  const gridH = rows * tileSize + (rows + 1) * pad;

  const composites = [];
  for (let i = 0; i < BATCH38.length; i++) {
    const item = BATCH38[i];
    const imgPath = `${BRAIN_DIR}/batch38_${item.word}.png`;
    if (!existsSync(imgPath)) continue;
    const r = Math.floor(i / cols);
    const c = i % cols;
    const top = pad + r * (tileSize + pad);
    const left = pad + c * (tileSize + pad);

    const resized = await sharp(imgPath)
      .resize(tileSize, tileSize, { fit: "contain", background: { r: 255, g: 255, b: 255 } })
      .toBuffer();

    composites.push({ input: resized, top, left });
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
    .toFile(`${BRAIN_DIR}/batch38_grid.png`);
  console.log("Saved batch38_grid.png");

  console.log("Building 48px clinical strip...");
  const stripW = BATCH38.length * 64 + 16;
  const stripH = 64;
  const stripComposites = [];
  for (let i = 0; i < BATCH38.length; i++) {
    const item = BATCH38[i];
    const imgPath = `${BRAIN_DIR}/batch38_${item.word}.png`;
    if (!existsSync(imgPath)) continue;
    const mini = await sharp(imgPath)
      .resize(48, 48, { fit: "contain", background: { r: 255, g: 255, b: 255 } })
      .toBuffer();
    stripComposites.push({
      input: mini,
      top: 8,
      left: i * 64 + 8,
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
    .toFile(`${BRAIN_DIR}/batch38_strip_48.png`);
  console.log("Saved batch38_strip_48.png");

  console.log("Building lightweight batch38_review.html...");
  let cards = "";
  for (const item of BATCH38) {
    const imgPath = `${BRAIN_DIR}/batch38_${item.word}.png`;
    if (!existsSync(imgPath)) continue;
    const b64Main = await getWebpB64(imgPath, 180);
    const b64Mini = await getWebpB64(imgPath, 48);

    cards += `
      <div class="border border-slate-200 bg-white rounded-xl p-3 flex flex-col items-center shadow-xs hover:shadow-md transition">
        <div class="w-full flex justify-between items-center mb-1.5">
          <span class="text-[11px] font-bold text-slate-400">#${item.slot}</span>
          <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-800">${item.category}</span>
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

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Batch 38 Review: Home & Dining Objects (Slots #377–#386)</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-900 antialiased p-4">
  <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm max-w-5xl mx-auto">
    <div class="mb-5 border-b border-slate-100 pb-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-extrabold text-slate-900 tracking-tight">Batch 38: Home & Dining Objects</h1>
          <p class="text-xs text-slate-500 mt-1">10 Clipart Symbols · Slots #377–#386 · Minimal Natural Hints · Natural Color Law · Lifespan Dignity</p>
        </div>
        <div class="flex gap-2">
          <span class="text-xs font-semibold px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-full">Home & Dining</span>
          <span class="text-xs font-semibold px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">10 New Tiles</span>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
      ${cards}
    </div>

    <div class="mt-6 pt-5 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Category & Disambiguation Invariants</h3>
        <ul class="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
          <li><strong>Plate (#382) vs Bowl (#383)</strong>: Flat round dinner plate with shallow rim vs deep ceramic soup/cereal bowl.</li>
          <li><strong>Fork (#385) vs Spoon (#386)</strong>: Four-pronged stainless dinner fork vs oval polished soup spoon.</li>
          <li><strong>Sink (#379) vs Mirror (#380)</strong>: White porcelain basin with chrome faucet vs wall hanging mirror with frame.</li>
        </ul>
      </div>
      <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Design Rules</h3>
        <ul class="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
          <li><strong>Minimal Natural Prompts</strong>: Single natural descriptive sentence per noun archetype; no angle/perspective micromanagement.</li>
          <li><strong>Natural Color Law</strong>: Real-world finishes (stainless steel, porcelain, ceramic, wood) with bold black outlines and pure white backgrounds.</li>
          <li><strong>Lifespan Dignity</strong>: Mature, clean everyday objects, zero childish cartoon faces.</li>
        </ul>
      </div>
    </div>
  </div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch38_review.html`, html, "utf8");
  console.log("Saved batch38_review.html");
}

run().catch((err) => {
  console.error("Batch 38 execution failed:", err);
  process.exit(1);
});
