import { generateToFile } from "./gen.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH41 = [
  {
    slot: 407,
    word: "sponge",
    displayName: "sponge",
    category: "Home",
    framing: "object",
    hint: "A clean standalone yellow kitchen dish sponge with a green scouring side.",
    note: "Two-toned yellow kitchen sponge with green scouring top",
  },
  {
    slot: 408,
    word: "tape",
    displayName: "tape",
    category: "Home",
    framing: "object",
    hint: "A clean standalone roll of clear adhesive tape in a plastic dispenser.",
    note: "Desk adhesive tape roll on clear dispenser",
  },
  {
    slot: 409,
    word: "flashlight",
    displayName: "flashlight",
    category: "Home",
    framing: "object",
    hint: "A clean standalone handheld flashlight emitting a bright beam of light.",
    note: "Handheld LED flashlight shining a focused light beam",
  },
  {
    slot: 410,
    word: "bucket",
    displayName: "bucket",
    category: "Home",
    framing: "object",
    hint: "A clean standalone blue plastic cleaning bucket with a metal handle.",
    note: "Utility cleaning bucket with wire bail handle",
  },
  {
    slot: 411,
    word: "paper towel",
    displayName: "paper towel",
    category: "Home",
    framing: "object",
    hint: "A clean standalone upright roll of white paper towels with a sheet partially unrolling.",
    note: "Perforated absorbent white paper towel roll",
  },
  {
    slot: 412,
    word: "shirt",
    displayName: "shirt",
    category: "Clothing",
    framing: "object",
    hint: "A clean standalone short-sleeved cotton crewneck t-shirt.",
    note: "Casual short-sleeved cotton crewneck t-shirt",
  },
  {
    slot: 413,
    word: "pants",
    displayName: "pants",
    category: "Clothing",
    framing: "object",
    hint: "A clean standalone pair of blue denim jeans.",
    note: "Blue denim jeans with waistband and pockets",
  },
  {
    slot: 414,
    word: "shorts",
    displayName: "shorts",
    category: "Clothing",
    framing: "object",
    hint: "A clean standalone pair of casual cotton summer shorts.",
    note: "Casual knee-length summer shorts",
  },
  {
    slot: 415,
    word: "underwear",
    displayName: "underwear",
    category: "Clothing",
    framing: "object",
    hint: "A clean standalone pair of white cotton briefs.",
    note: "Comfortable white cotton undergarment briefs",
  },
  {
    slot: 416,
    word: "dress",
    displayName: "dress",
    category: "Clothing",
    framing: "object",
    hint: "A clean standalone simple casual summer dress.",
    note: "A-line casual flared summer dress",
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
  console.log(`Starting Batch 41 generation (${BATCH41.length} words: Home Tools & Clothing)...`);

  for (let i = 0; i < BATCH41.length; i++) {
    const item = BATCH41[i];
    const out = `${BRAIN_DIR}/batch41_${item.word}.png`;
    if (existsSync(out) && !process.argv.includes("--force")) {
      console.log(`Slot #${item.slot} ("${item.displayName}") already exists at ${out}. Skipping.`);
      continue;
    }
    console.log(`\n[${i + 1}/${BATCH41.length}] Generating slot #${item.slot}: "${item.displayName}"...`);
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
  for (let i = 0; i < BATCH41.length; i++) {
    const item = BATCH41[i];
    const imgPath = `${BRAIN_DIR}/batch41_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch41_grid.png`);
  console.log("Saved batch41_grid.png");

  console.log("Building 48px clinical strip...");
  const stripW = BATCH41.length * 64 + 16;
  const stripH = 64;
  const stripComposites = [];
  for (let i = 0; i < BATCH41.length; i++) {
    const item = BATCH41[i];
    const imgPath = `${BRAIN_DIR}/batch41_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch41_strip_48.png`);
  console.log("Saved batch41_strip_48.png");

  console.log("Building lightweight batch41_review.html...");
  let cards = "";
  for (const item of BATCH41) {
    const imgPath = `${BRAIN_DIR}/batch41_${item.word}.png`;
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
  <title>Batch 41 Review: Home Tools & Clothing (Slots #407–#416)</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-900 antialiased p-4">
  <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm max-w-5xl mx-auto">
    <div class="mb-5 border-b border-slate-100 pb-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-extrabold text-slate-900 tracking-tight">Batch 41: Home Tools & Clothing</h1>
          <p class="text-xs text-slate-500 mt-1">10 Clipart Symbols · Slots #407–#416 · Minimal Natural Hints · Natural Color Law · Lifespan Dignity</p>
        </div>
        <div class="flex gap-2">
          <span class="text-xs font-semibold px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-full">Tools & Apparel</span>
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
          <li><strong>Pants (#413) vs Shorts (#414)</strong>: Full-length denim jeans vs knee-length casual summer shorts.</li>
          <li><strong>Dress (#416) vs Skirt (#417 in B42)</strong>: Full one-piece bodice and flared skirt vs waistband and skirt only.</li>
          <li><strong>Paper Towel (#411) vs Napkin (#388 in B39)</strong>: Perforated upright paper towel roll vs neatly folded cloth table napkin.</li>
        </ul>
      </div>
      <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Design Rules</h3>
        <ul class="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
          <li><strong>Minimal Natural Prompts</strong>: Single natural descriptive sentence per noun archetype; trust Muse first; no angle micromanagement.</li>
          <li><strong>Natural Color Law</strong>: Real-world finishes (denim, cotton, cellulose sponge, plastic) with bold black outlines and pure white backgrounds.</li>
          <li><strong>Lifespan Dignity</strong>: Mature, clean everyday objects & clothing, zero childish cartoon faces.</li>
        </ul>
      </div>
    </div>
  </div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch41_review.html`, html, "utf8");
  console.log("Saved batch41_review.html");
}

run().catch((err) => {
  console.error("Batch 41 execution failed:", err);
  process.exit(1);
});
