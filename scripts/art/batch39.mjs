import { generateToFile } from "./gen.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH39 = [
  {
    slot: 387,
    word: "knife",
    displayName: "knife",
    category: "Home",
    framing: "object",
    hint: "A clean standalone stainless steel table butter knife.",
    note: "Stainless steel dinner butter knife matching fork and spoon",
  },
  {
    slot: 388,
    word: "napkin",
    displayName: "napkin",
    category: "Home",
    framing: "object",
    hint: "A clean standalone folded cloth dinner napkin.",
    note: "Neatly folded cloth table napkin",
  },
  {
    slot: 389,
    word: "bottle",
    displayName: "bottle",
    category: "Home",
    framing: "object",
    hint: "A clean standalone reusable water bottle with a drinking spout.",
    note: "Reusable drinking water bottle with flip cap",
  },
  {
    slot: 390,
    word: "straw",
    displayName: "straw",
    category: "Home",
    framing: "object",
    hint: "A clean standalone striped flexible drinking straw with a bend.",
    note: "Flexible bendy drinking straw with classic stripes",
  },
  {
    slot: 391,
    word: "fridge",
    displayName: "fridge",
    category: "Home",
    framing: "object",
    hint: "A clean standalone modern refrigerator with top freezer and lower door.",
    note: "Double-door kitchen refrigerator with handles",
  },
  {
    slot: 392,
    word: "microwave",
    displayName: "microwave",
    category: "Home",
    framing: "object",
    hint: "A clean standalone countertop microwave oven with a digital timer display.",
    note: "Countertop microwave with glass door window and keypad",
  },
  {
    slot: 393,
    word: "backpack",
    displayName: "backpack",
    category: "Home",
    framing: "object",
    hint: "A clean standalone canvas school backpack with shoulder straps and front zipper pocket.",
    note: "Two-strap school backpack with zippered front pocket",
  },
  {
    slot: 394,
    word: "bag",
    displayName: "bag",
    category: "Home",
    framing: "object",
    hint: "A clean standalone canvas tote shopping bag with two sturdy handles.",
    note: "Everyday fabric tote bag with shoulder handles",
  },
  {
    slot: 395,
    word: "keys",
    displayName: "keys",
    category: "Home",
    framing: "object",
    hint: "A clean standalone metal key ring holding three house keys.",
    note: "Ring of notched brass and silver metal keys",
  },
  {
    slot: 396,
    word: "wallet",
    displayName: "wallet",
    category: "Home",
    framing: "object",
    hint: "A clean standalone brown leather bifold wallet.",
    note: "Folded leather billfold wallet",
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
  console.log(`Starting Batch 39 generation (${BATCH39.length} words: Dining & Daily Essentials)...`);

  for (let i = 0; i < BATCH39.length; i++) {
    const item = BATCH39[i];
    const out = `${BRAIN_DIR}/batch39_${item.word}.png`;
    if (existsSync(out) && !process.argv.includes("--force")) {
      console.log(`Slot #${item.slot} ("${item.displayName}") already exists at ${out}. Skipping.`);
      continue;
    }
    console.log(`\n[${i + 1}/${BATCH39.length}] Generating slot #${item.slot}: "${item.displayName}"...`);
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
  for (let i = 0; i < BATCH39.length; i++) {
    const item = BATCH39[i];
    const imgPath = `${BRAIN_DIR}/batch39_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch39_grid.png`);
  console.log("Saved batch39_grid.png");

  console.log("Building 48px clinical strip...");
  const stripW = BATCH39.length * 64 + 16;
  const stripH = 64;
  const stripComposites = [];
  for (let i = 0; i < BATCH39.length; i++) {
    const item = BATCH39[i];
    const imgPath = `${BRAIN_DIR}/batch39_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch39_strip_48.png`);
  console.log("Saved batch39_strip_48.png");

  console.log("Building lightweight batch39_review.html...");
  let cards = "";
  for (const item of BATCH39) {
    const imgPath = `${BRAIN_DIR}/batch39_${item.word}.png`;
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
  <title>Batch 39 Review: Dining & Daily Essentials (Slots #387–#396)</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-900 antialiased p-4">
  <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm max-w-5xl mx-auto">
    <div class="mb-5 border-b border-slate-100 pb-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-extrabold text-slate-900 tracking-tight">Batch 39: Dining & Daily Essentials</h1>
          <p class="text-xs text-slate-500 mt-1">10 Clipart Symbols · Slots #387–#396 · Minimal Natural Hints · Natural Color Law · Lifespan Dignity</p>
        </div>
        <div class="flex gap-2">
          <span class="text-xs font-semibold px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-full">Dining & Daily Essentials</span>
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
          <li><strong>Knife (#387)</strong>: Completes flatware set (fork, spoon, knife); rounded butter knife blade in stainless steel.</li>
          <li><strong>Backpack (#393) vs Bag (#394)</strong>: Two-strap canvas school pack with zipper vs open-top shopping tote bag with twin carry handles.</li>
          <li><strong>Bottle (#389) vs Cup (#384)</strong>: Reusable portable bottle with spout vs open ceramic mug with handle.</li>
        </ul>
      </div>
      <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Design Rules</h3>
        <ul class="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
          <li><strong>Minimal Natural Prompts</strong>: Single natural descriptive sentence per noun archetype; no angle/perspective micromanagement.</li>
          <li><strong>Natural Color Law</strong>: Real-world finishes (stainless steel, fabric, leather, metal keys) with bold black outlines and pure white backgrounds.</li>
          <li><strong>Lifespan Dignity</strong>: Mature, clean everyday objects, zero childish cartoon faces.</li>
        </ul>
      </div>
    </div>
  </div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch39_review.html`, html, "utf8");
  console.log("Saved batch39_review.html");
}

run().catch((err) => {
  console.error("Batch 39 execution failed:", err);
  process.exit(1);
});
