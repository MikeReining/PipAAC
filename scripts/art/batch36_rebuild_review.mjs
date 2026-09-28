import { readFileSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH36 = [
  {
    slot: 357,
    word: "tablet",
    displayName: "tablet",
    category: "Media",
    note: "Touchscreen tablet showing 3x3 grid of colorful app icons on display",
  },
  {
    slot: 358,
    word: "ipad",
    displayName: "iPad",
    category: "Media",
    note: "Sleek silver aluminum iPad with thin bezels and colorful home screen",
  },
  {
    slot: 359,
    word: "phone",
    displayName: "phone",
    category: "Media",
    note: "Modern smartphone standing upright with green call icon on screen",
  },
  {
    slot: 360,
    word: "tv",
    displayName: "TV",
    category: "Media",
    note: "Widescreen flat-panel television on desktop stand with thin black bezel",
  },
  {
    slot: 361,
    word: "movie",
    displayName: "movie",
    category: "Media",
    note: "Movie director clapperboard paired with red-and-white popcorn bucket",
  },
  {
    slot: 362,
    word: "video",
    displayName: "video",
    category: "Media",
    note: "Video player screen with prominent centered white Play triangle button",
  },
  {
    slot: 363,
    word: "headphones",
    displayName: "headphones",
    category: "Media",
    note: "Physical over-ear headphones with padded earcups and audio jack (no notes)",
  },
  {
    slot: 364,
    word: "computer",
    displayName: "computer",
    category: "Media",
    note: "Open silver laptop computer with angled screen, keyboard & trackpad",
  },
  {
    slot: 365,
    word: "camera",
    displayName: "camera",
    category: "Media",
    note: "Compact digital camera with central optical zoom lens and shutter button",
  },
  {
    slot: 366,
    word: "paper",
    displayName: "paper",
    category: "Media",
    note: "Single sheet of lined writing paper with dog-eared top corner",
  },
];

async function getWebpB64(path, size) {
  const buf = readFileSync(path);
  const thumb = await sharp(buf)
    .resize(size, size, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .webp({ quality: 75 })
    .toBuffer();
  return thumb.toString("base64");
}

async function rebuild() {
  console.log("Rebuilding composite grid...");
  const cols = 5;
  const rows = 2;
  const tileSize = 300;
  const pad = 10;
  const gridW = cols * tileSize + (cols + 1) * pad;
  const gridH = rows * tileSize + (rows + 1) * pad;

  const composites = [];
  for (let i = 0; i < BATCH36.length; i++) {
    const item = BATCH36[i];
    const imgPath = `${BRAIN_DIR}/batch36_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch36_grid.png`);
  console.log("Saved batch36_grid.png");

  console.log("Rebuilding 48px clinical strip...");
  const stripW = BATCH36.length * 64 + 16;
  const stripH = 64;
  const stripComposites = [];
  for (let i = 0; i < BATCH36.length; i++) {
    const item = BATCH36[i];
    const imgPath = `${BRAIN_DIR}/batch36_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch36_strip_48.png`);
  console.log("Saved batch36_strip_48.png");

  console.log("Rebuilding batch36_review.html...");
  let cards = "";
  for (const item of BATCH36) {
    const imgPath = `${BRAIN_DIR}/batch36_${item.word}.png`;
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
  <title>Batch 36 Review: Media, Tech & Creative Arts (Slots #357–#366)</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-900 antialiased p-4">
  <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm max-w-5xl mx-auto">
    <div class="mb-5 border-b border-slate-100 pb-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-extrabold text-slate-900 tracking-tight">Batch 36: Media, Tech & Creative Arts</h1>
          <p class="text-xs text-slate-500 mt-1">10 Clipart Symbols · Slots #357–#366 · Natural Color Law · Lifespan Dignity</p>
        </div>
        <div class="flex gap-2">
          <span class="text-xs font-semibold px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-full">Toys & Media</span>
          <span class="text-xs font-semibold px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">10 New Tiles</span>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
      ${cards}
    </div>

    <div class="mt-6 pt-5 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Media & Tech Invariants</h3>
        <ul class="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
          <li><strong>TV (#360) vs Movie (#361) vs Video (#362)</strong>: Physical TV appliance on stand vs clapperboard + popcorn vs digital player screen with centered Play button.</li>
          <li><strong>Headphones (#363) vs Song (#356)</strong>: Single physical audio headset with cord/jack (zero music notes) vs headphones with floating music notes.</li>
          <li><strong>Tablet (#357) vs iPad (#358) vs Phone (#359)</strong>: Generic touchscreen app grid vs premium silver iPad with dock vs vertical handheld smartphone with call icon.</li>
        </ul>
      </div>
      <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Design Rules</h3>
        <ul class="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
          <li><strong>Lifespan Dignity</strong>: Modern electronics with authentic proportions and clean screens, avoiding babyish styling.</li>
          <li><strong>Natural Color Law</strong>: Real-world finishes (aluminum silver, matte black, slate glass), bold black outlines, pure white backgrounds.</li>
          <li><strong>Clinical Legibility</strong>: Bold silhouettes tested at 48×48px.</li>
        </ul>
      </div>
    </div>
  </div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch36_review.html`, html, "utf8");
  console.log("Saved batch36_review.html");
}

rebuild().catch((err) => {
  console.error("Rebuild failed:", err);
  process.exit(1);
});
