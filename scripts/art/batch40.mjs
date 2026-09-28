import { generateToFile } from "./gen.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH40 = [
  {
    slot: 397,
    word: "glasses",
    displayName: "glasses",
    category: "Home",
    framing: "object",
    hint: "A clean standalone pair of black-framed reading eyeglasses with clear lenses.",
    note: "Pair of classic reading glasses with clear lenses",
  },
  {
    slot: 398,
    word: "umbrella",
    displayName: "umbrella",
    category: "Home",
    framing: "object",
    hint: "A clean standalone opened rain umbrella with a curved handle.",
    note: "Opened rain umbrella with curved J-handle",
  },
  {
    slot: 399,
    word: "blanket",
    displayName: "blanket",
    category: "Home",
    framing: "object",
    hint: "A clean standalone neatly folded knitted throw blanket.",
    note: "Neatly folded soft knitted throw blanket",
  },
  {
    slot: 400,
    word: "pillow",
    displayName: "pillow",
    category: "Home",
    framing: "object",
    hint: "A clean standalone plump white bed pillow with a cotton pillowcase.",
    note: "Plump sleeping bed pillow with soft cotton case",
  },
  {
    slot: 401,
    word: "fan",
    displayName: "fan",
    category: "Home",
    framing: "object",
    hint: "A clean standalone electric oscillating desk fan with a protective wire cage.",
    note: "Tabletop electric desk fan with rotating blades",
  },
  {
    slot: 402,
    word: "charger",
    displayName: "charger",
    category: "Home",
    framing: "object",
    hint: "A clean standalone phone charging cable plugged into a wall power adapter block.",
    note: "USB charging cable with wall power brick",
  },
  {
    slot: 403,
    word: "box",
    displayName: "box",
    category: "Home",
    framing: "object",
    hint: "A clean standalone brown cardboard shipping box.",
    note: "Sturdy brown corrugated cardboard shipping box",
  },
  {
    slot: 404,
    word: "battery",
    displayName: "battery",
    category: "Home",
    framing: "object",
    hint: "A clean standalone cylindrical AA battery with positive and negative terminals.",
    note: "Cylindrical AA battery with positive nub terminal",
  },
  {
    slot: 405,
    word: "broom",
    displayName: "broom",
    category: "Home",
    framing: "object",
    hint: "A clean standalone bristle floor broom with a dustpan.",
    note: "Bristle sweeping broom standing beside dustpan",
  },
  {
    slot: 406,
    word: "vacuum",
    displayName: "vacuum",
    category: "Home",
    framing: "object",
    hint: "A clean standalone upright vacuum cleaner with a handle and cleaning head.",
    note: "Upright electric floor vacuum cleaner",
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
  console.log(`Starting Batch 40 generation (${BATCH40.length} words: Everyday Tools & Home Appliances)...`);

  for (let i = 0; i < BATCH40.length; i++) {
    const item = BATCH40[i];
    const out = `${BRAIN_DIR}/batch40_${item.word}.png`;
    if (existsSync(out) && !process.argv.includes("--force")) {
      console.log(`Slot #${item.slot} ("${item.displayName}") already exists at ${out}. Skipping.`);
      continue;
    }
    console.log(`\n[${i + 1}/${BATCH40.length}] Generating slot #${item.slot}: "${item.displayName}"...`);
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
  for (let i = 0; i < BATCH40.length; i++) {
    const item = BATCH40[i];
    const imgPath = `${BRAIN_DIR}/batch40_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch40_grid.png`);
  console.log("Saved batch40_grid.png");

  console.log("Building 48px clinical strip...");
  const stripW = BATCH40.length * 64 + 16;
  const stripH = 64;
  const stripComposites = [];
  for (let i = 0; i < BATCH40.length; i++) {
    const item = BATCH40[i];
    const imgPath = `${BRAIN_DIR}/batch40_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch40_strip_48.png`);
  console.log("Saved batch40_strip_48.png");

  console.log("Building lightweight batch40_review.html...");
  let cards = "";
  for (const item of BATCH40) {
    const imgPath = `${BRAIN_DIR}/batch40_${item.word}.png`;
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
  <title>Batch 40 Review: Everyday Tools & Home Appliances (Slots #397–#406)</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-900 antialiased p-4">
  <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm max-w-5xl mx-auto">
    <div class="mb-5 border-b border-slate-100 pb-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-extrabold text-slate-900 tracking-tight">Batch 40: Everyday Tools & Home Appliances</h1>
          <p class="text-xs text-slate-500 mt-1">10 Clipart Symbols · Slots #397–#406 · Minimal Natural Hints · Natural Color Law · Lifespan Dignity</p>
        </div>
        <div class="flex gap-2">
          <span class="text-xs font-semibold px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-full">Tools & Appliances</span>
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
          <li><strong>Pillow (#400) vs Blanket (#399)</strong>: Plump sleeping bed pillow with cotton case vs neatly folded knitted throw blanket.</li>
          <li><strong>Broom (#405) vs Vacuum (#406)</strong>: Bristle sweeping broom with dustpan vs upright electric motorized vacuum cleaner.</li>
          <li><strong>Battery (#404) vs Charger (#402)</strong>: Cylindrical AA cell with positive terminal vs power brick adapter with coiled device cord.</li>
        </ul>
      </div>
      <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Design Rules</h3>
        <ul class="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
          <li><strong>Minimal Natural Prompts</strong>: Single natural descriptive sentence per noun archetype; trust Muse first; no angle micromanagement.</li>
          <li><strong>Natural Color Law</strong>: Real-world finishes (cardboard, cotton, plastic, metal) with bold black outlines and pure white backgrounds.</li>
          <li><strong>Lifespan Dignity</strong>: Mature, clean everyday tools, zero childish cartoon faces.</li>
        </ul>
      </div>
    </div>
  </div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch40_review.html`, html, "utf8");
  console.log("Saved batch40_review.html");
}

run().catch((err) => {
  console.error("Batch 40 execution failed:", err);
  process.exit(1);
});
