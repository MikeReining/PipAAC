import { generateToFile } from "./gen.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH37 = [
  {
    slot: 367,
    word: "markers",
    displayName: "markers",
    category: "Toys",
    framing: "object",
    hint: "Three clean standalone colored markers with caps resting side by side.",
    note: "Three colored markers with caps resting side by side",
  },
  {
    slot: 368,
    word: "crayons",
    displayName: "crayons",
    category: "Toys",
    framing: "object",
    hint: "A clean standalone small box of colorful pointed wax crayons.",
    note: "Small box of colorful pointed wax crayons",
  },
  {
    slot: 369,
    word: "book",
    displayName: "book",
    category: "Toys",
    framing: "object",
    hint: "A clean standalone open hardcover book with white pages and a ribbon bookmark.",
    note: "Open hardcover book with clean pages and ribbon bookmark",
  },
  {
    slot: 370,
    word: "chair",
    displayName: "chair",
    category: "Home",
    framing: "object",
    hint: "A clean standalone wooden dining chair with a slatted backrest.",
    note: "Wooden dining chair with slatted backrest",
  },
  {
    slot: 371,
    word: "couch",
    displayName: "couch",
    category: "Home",
    framing: "object",
    hint: "A clean standalone comfortable living room couch with soft cushions.",
    note: "Comfortable living room couch with soft cushions",
  },
  {
    slot: 372,
    word: "table",
    displayName: "table",
    category: "Home",
    framing: "object",
    hint: "A clean standalone wooden dining table.",
    note: "Sturdy wooden dining table",
  },
  {
    slot: 373,
    word: "bed",
    displayName: "bed",
    category: "Home",
    framing: "object",
    hint: "A clean standalone neatly made single bed with a pillow and blanket.",
    note: "Neatly made single bed with pillow and blanket",
  },
  {
    slot: 374,
    word: "door",
    displayName: "door",
    category: "Home",
    framing: "object",
    hint: "A clean standalone wooden interior door slightly ajar in its frame.",
    note: "Interior wooden door slightly ajar in frame",
  },
  {
    slot: 375,
    word: "window",
    displayName: "window",
    category: "Home",
    framing: "object",
    hint: "A clean standalone four-pane window looking out to a sunny blue sky.",
    note: "Four-pane window looking out to sunny blue sky",
  },
  {
    slot: 376,
    word: "lamp",
    displayName: "lamp",
    category: "Home",
    framing: "object",
    hint: "A clean standalone tabletop reading lamp with a soft glowing shade.",
    note: "Tabletop reading lamp with soft glowing shade",
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
  console.log(`Starting Batch 37 generation (${BATCH37.length} words: Minimal, Un-Policed Hints)...`);

  for (let i = 0; i < BATCH37.length; i++) {
    const item = BATCH37[i];
    const out = `${BRAIN_DIR}/batch37_${item.word}.png`;
    if (existsSync(out) && !process.argv.includes("--force")) {
      console.log(`Slot #${item.slot} ("${item.displayName}") already exists at ${out}. Skipping.`);
      continue;
    }
    console.log(`\n[${i + 1}/${BATCH37.length}] Generating slot #${item.slot}: "${item.displayName}"...`);
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
  for (let i = 0; i < BATCH37.length; i++) {
    const item = BATCH37[i];
    const imgPath = `${BRAIN_DIR}/batch37_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch37_grid.png`);
  console.log("Saved batch37_grid.png");

  console.log("Building 48px clinical strip...");
  const stripW = BATCH37.length * 64 + 16;
  const stripH = 64;
  const stripComposites = [];
  for (let i = 0; i < BATCH37.length; i++) {
    const item = BATCH37[i];
    const imgPath = `${BRAIN_DIR}/batch37_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch37_strip_48.png`);
  console.log("Saved batch37_strip_48.png");

  console.log("Building lightweight batch37_review.html...");
  let cards = "";
  for (const item of BATCH37) {
    const imgPath = `${BRAIN_DIR}/batch37_${item.word}.png`;
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
  <title>Batch 37 Review: Creative Arts & Home Furniture (Slots #367–#376)</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-900 antialiased p-4">
  <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm max-w-5xl mx-auto">
    <div class="mb-5 border-b border-slate-100 pb-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-extrabold text-slate-900 tracking-tight">Batch 37: Creative Arts & Home Furniture</h1>
          <p class="text-xs text-slate-500 mt-1">10 Clipart Symbols · Slots #367–#376 · Minimal Natural Hints · Natural Color Law · Lifespan Dignity</p>
        </div>
        <div class="flex gap-2">
          <span class="text-xs font-semibold px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-full">Creative & Home</span>
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
          <li><strong>Markers (#367) vs Crayons (#368)</strong>: Standalone markers with caps vs small box of pointed wax crayons.</li>
          <li><strong>Chair (#370) vs Couch (#371)</strong>: Wooden dining chair with slatted back vs comfortable living room sofa with soft cushions.</li>
          <li><strong>Door (#374) vs Window (#375)</strong>: Wooden door slightly ajar in frame vs four-pane window looking out to blue sky.</li>
        </ul>
      </div>
      <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Design Rules</h3>
        <ul class="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
          <li><strong>Minimal Natural Prompts</strong>: Single natural descriptive sentence per noun archetype; no angle/perspective micromanagement.</li>
          <li><strong>Natural Color Law</strong>: Natural wood, fabric, and ceramic finishes with bold black outlines and pure white backgrounds.</li>
          <li><strong>Lifespan Dignity</strong>: Mature, clean furniture and art supplies, zero childish cartoon faces.</li>
        </ul>
      </div>
    </div>
  </div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch37_review.html`, html, "utf8");
  console.log("Saved batch37_review.html");
}

run().catch((err) => {
  console.error("Batch 37 execution failed:", err);
  process.exit(1);
});
