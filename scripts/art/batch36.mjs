import { generateToFile } from "./gen.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH36 = [
  {
    slot: 357,
    word: "tablet",
    displayName: "tablet",
    category: "Media",
    framing: "object",
    hint: "A modern touchscreen tablet computer in 3/4 perspective: sleek dark bezel surrounding a bright active display screen showing a colorful 3x3 grid of clean app icons, resting at a gentle angle. Bold clean black outlines, modern tech styling, pure white background. Standalone device, no hands, no human face, no text, no animals, no dogs, no pencils.",
    note: "Touchscreen tablet showing 3x3 grid of colorful app icons on display",
  },
  {
    slot: 358,
    word: "ipad",
    displayName: "iPad",
    category: "Media",
    framing: "object",
    hint: "An iconic Apple iPad tablet in 3/4 perspective: minimalist premium silver aluminum casing, thin symmetrical black screen borders, with the glossy retina screen displaying a clean colorful home screen with dock bar at the bottom. Bold clean black outlines, metallic silver edge and sleek glass screen, pure white background. Standalone device, no brand logos, no text, no animals, no dogs, no pencils.",
    note: "Sleek silver aluminum iPad with thin bezels and colorful home screen",
  },
  {
    slot: 359,
    word: "phone",
    displayName: "phone",
    category: "Media",
    framing: "object",
    hint: "A modern smartphone in 3/4 perspective standing upright: sleek dark metal frame, edge-to-edge glass touchscreen displaying a clean interface with a prominent green phone call icon and app tiles, rounded corners, and a top speaker slit. Bold clean black outlines, dark slate and glass colors, pure white background. Standalone phone, no hands, no text, no animals, no dogs, no pencils.",
    note: "Modern smartphone standing upright with green call icon on screen",
  },
  {
    slot: 360,
    word: "tv",
    displayName: "TV",
    category: "Media",
    framing: "object",
    hint: "A modern widescreen flat-panel television in 3/4 perspective: sleek ultra-thin black frame, large 16:9 dark glass display screen with a subtle diagonal reflection, supported on a sturdy desktop twin-leg TV stand. Bold clean black outlines, dark charcoal and slate glass colors, pure white background. Standalone TV appliance, no background room, no text, no animals, no dogs, no pencils.",
    note: "Widescreen flat-panel television on desktop stand with thin black bezel",
  },
  {
    slot: 361,
    word: "movie",
    displayName: "movie",
    category: "Media",
    framing: "object",
    hint: "The universal symbol for a movie: a classic black-and-white director's film clapperboard (clapboard) standing open in 3/4 perspective beside a striped red-and-white bucket overflowing with golden popped popcorn. Bold clean black outlines, iconic movie theater colors, pure white background. No text, no letters, no human faces, no animals, no dogs, no pencils.",
    note: "Movie director clapperboard paired with red-and-white popcorn bucket",
  },
  {
    slot: 362,
    word: "video",
    displayName: "video",
    category: "Media",
    framing: "object",
    hint: "The universal symbol for video playback: a bold rounded rectangular media video player screen in 3/4 isometric perspective with a prominent bright white triangular Play button (▶) centered on a vibrant red or blue screen background, showing a subtle video timeline bar along the bottom. Bold clean black outlines, high contrast video play icon, pure white background. No text, no letters, no animals, no dogs, no pencils.",
    note: "Video player screen with prominent centered white Play triangle button",
  },
  {
    slot: 363,
    word: "headphones",
    displayName: "headphones",
    category: "Media",
    framing: "object",
    hint: "A modern pair of high-fidelity over-ear headphones in 3/4 perspective: padded adjustable headband, plush cushioned earcups with metallic pivot yokes, and a neat detachable audio cable with a gold mini-jack plug resting on the surface. Pure physical audio hardware, zero musical notes, zero sound waves. Bold clean black outlines, sleek graphite gray and matte black finishes, pure white background. No human head, no text, no animals, no dogs, no pencils.",
    note: "Physical over-ear headphones with padded earcups and audio jack (no notes)",
  },
  {
    slot: 364,
    word: "computer",
    displayName: "computer",
    category: "Media",
    framing: "object",
    hint: "A modern open laptop computer in 3/4 perspective: metallic silver aluminum clamshell body, open display screen angled upward showing a clean blue desktop workspace, slim lower deck with black chiclet keyboard and trackpad. Bold clean black outlines, silver aluminum and crisp screen colors, pure white background. Standalone laptop, no hands, no text, no animals, no dogs, no pencils.",
    note: "Open silver laptop computer with angled screen, keyboard & trackpad",
  },
  {
    slot: 365,
    word: "camera",
    displayName: "camera",
    category: "Media",
    framing: "object",
    hint: "A classic compact digital camera in 3/4 perspective: textured black and silver body, prominent circular optical zoom lens in the center with glass lens reflection rings, top shutter release button, mode dial, and small flash window. Bold clean black outlines, metallic silver and black grip textures, pure white background. Standalone camera, no strap, no hands, no text, no animals, no dogs, no pencils.",
    note: "Compact digital camera with central optical zoom lens and shutter button",
  },
  {
    slot: 366,
    word: "paper",
    displayName: "paper",
    category: "Media",
    framing: "object",
    hint: "A single clean sheet of white writing paper in 3/4 perspective: crisp rectangular white page resting on a flat surface, showing faint light blue ruled writing lines, a neat folded/dog-eared top corner, and a slight paper shadow underneath. Bold clean black outlines, clean white paper with faint blue lines, pure white background. Standalone sheet of paper, blank writing sheet, no drawings, no music notes, no text, no animals, no dogs, no pencils.",
    note: "Single sheet of lined writing paper with dog-eared top corner",
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
  console.log(`Starting Batch 36 generation (${BATCH36.length} words: Media, Tech & Creative Arts)...`);

  for (let i = 0; i < BATCH36.length; i++) {
    const item = BATCH36[i];
    const out = `${BRAIN_DIR}/batch36_${item.word}.png`;
    if (existsSync(out) && !process.argv.includes("--force")) {
      console.log(`Slot #${item.slot} ("${item.displayName}") already exists at ${out}. Skipping.`);
      continue;
    }
    console.log(`\n[${i + 1}/${BATCH36.length}] Generating slot #${item.slot}: "${item.displayName}"...`);
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

  console.log("Building 48px clinical strip...");
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

  console.log("Building lightweight batch36_review.html...");
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
          <li><strong>Headphones (#363) vs Song (#356)</strong>: Physical audio hardware with cable (zero music notes) vs headphones with floating music notes.</li>
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

run().catch((err) => {
  console.error("Batch 36 execution failed:", err);
  process.exit(1);
});
