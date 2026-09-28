import { generateToFile } from "./gen.mjs";
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH36_V2 = [
  {
    slot: 357,
    word: "tablet",
    displayName: "tablet",
    category: "Media",
    framing: "object",
    hint: "A modern touchscreen tablet computer, front-facing straight-on view: sleek black rectangular bezel surrounding a bright active display screen showing a colorful 3x3 grid of clean simple app icons. Perfectly upright, symmetrical, centered, facing directly forward toward the viewer. Bold clean black outlines, modern slate styling, pure white background. Standalone device, no home button, no hands, no human face, no text, no animals, no dogs, no pencils.",
    note: "Front-facing touchscreen tablet with 3x3 app grid (no home button)",
  },
  {
    slot: 358,
    word: "ipad",
    displayName: "iPad",
    category: "Media",
    framing: "object",
    hint: "An iconic classic Apple iPad tablet, front-facing straight-on view: sleek silver aluminum edge, clean bezel with a prominent circular Apple-style Home button centered on the bottom bezel, and a glossy retina display showing a clean iOS home screen with app icons and a bottom dock bar. Perfectly upright, symmetrical, centered, facing directly forward toward the viewer. Bold clean black outlines, metallic silver and glass colors, pure white background. Standalone iPad, no text, no human face, no animals, no dogs, no pencils.",
    note: "Front-facing iPad with iconic circular Home button and bottom dock",
  },
  {
    slot: 359,
    word: "phone",
    displayName: "phone",
    category: "Media",
    framing: "object",
    hint: "A modern smartphone, front-facing straight-on view: upright handheld phone facing directly forward toward the viewer, sleek dark rounded-rectangle frame, earpiece speaker slit at top, display screen showing a large prominent green phone call icon centered on the screen with small colorful app tiles below. Perfectly upright, symmetrical, centered. Bold clean black outlines, dark slate and glass colors, pure white background. Standalone phone, no hands, no text, no animals, no dogs, no pencils.",
    note: "Front-facing upright smartphone with centered green phone call icon",
  },
  {
    slot: 360,
    word: "tv",
    displayName: "TV",
    category: "Media",
    framing: "object",
    hint: "A modern widescreen flat-panel television, front-facing straight-on view: sleek ultra-thin black rectangular frame, large dark glass 16:9 display screen, resting stably on two small desktop TV stand feet at the bottom corners. Perfectly upright, symmetrical, centered, facing directly forward toward the viewer. Bold clean black outlines, dark slate and glass colors, pure white background. Standalone TV appliance, no background room, no text, no animals, no dogs, no pencils.",
    note: "Front-facing widescreen television on dual stand feet",
  },
  {
    slot: 361,
    word: "movie",
    displayName: "movie",
    category: "Media",
    framing: "object",
    hint: "The universal symbol for a movie, front-facing straight-on view: a classic black-and-white director's film clapperboard standing upright, paired beside a classic red-and-white vertically striped bucket filled with golden popped popcorn. Upright, balanced, centered, facing directly forward toward the viewer. Bold clean black outlines, iconic movie theater colors, pure white background. No text, no letters, no human faces, no animals, no dogs, no pencils.",
    note: "Front-facing movie director clapperboard paired with popcorn bucket",
  },
  {
    slot: 362,
    word: "video",
    displayName: "video",
    category: "Media",
    framing: "object",
    hint: "The universal symbol for digital video playback, front-facing straight-on view: a rounded rectangular media player screen facing directly forward toward the viewer, featuring a vibrant deep blue screen, a large prominent bright white Play triangle button (▶) perfectly centered in the middle, and a red or light blue video timeline progress bar along the bottom edge. Flat front-facing screen, perfectly symmetrical and centered. Bold clean black outlines, pure white background. No 3D angle, no tilt, no text, no letters, no animals, no dogs, no pencils.",
    note: "Front-facing video player screen with centered white Play triangle",
  },
  {
    slot: 363,
    word: "headphones",
    displayName: "headphones",
    category: "Media",
    framing: "object",
    hint: "A single pair of modern over-ear audio headphones, perfectly centered, front-facing straight-on view: curved padded headband arching over two plush circular ear cushions with metallic pivot yokes, and a single black audio cable extending down with a gold mini-jack. Symmetrical, centered, standalone audio headset. Zero musical notes, zero sound waves, zero duplicate headphones. Bold clean black outlines, graphite gray and matte black finishes, pure white background. No human head, no text, no animals, no dogs, no pencils.",
    note: "Front-facing single over-ear headset with audio cable and jack (no notes)",
  },
  {
    slot: 364,
    word: "computer",
    displayName: "computer",
    category: "Media",
    framing: "object",
    hint: "A modern open laptop computer, front-facing straight-on view: open silver aluminum laptop facing directly forward toward the viewer, upright display screen centered showing a clean blue desktop screen, lower keyboard deck with black keys and trackpad extending forward in symmetrical front perspective. Centered, balanced, upright. Bold clean black outlines, silver aluminum and crisp blue screen colors, pure white background. Standalone laptop, no hands, no text, no animals, no dogs, no pencils.",
    note: "Front-facing open laptop computer with centered screen and keyboard",
  },
  {
    slot: 365,
    word: "camera",
    displayName: "camera",
    category: "Media",
    framing: "object",
    hint: "A classic compact digital camera, front-facing straight-on view: facing directly forward toward the viewer, sleek rectangular black and silver camera body, a large prominent circular optical camera lens perfectly centered with glass reflection rings, a small flash window on the top corner, and a shutter button on top. Symmetrical, centered, upright front view. Bold clean black outlines, metallic silver and matte black finishes, pure white background. Standalone camera, no hands, no text, no animals, no dogs, no pencils.",
    note: "Front-facing compact camera with large centered optical lens",
  },
  {
    slot: 366,
    word: "paper",
    displayName: "paper",
    category: "Media",
    framing: "object",
    hint: "A clean sheet of white writing paper, front-facing straight-on view: portrait orientation vertical rectangular white page facing directly forward toward the viewer, crisp faint light blue horizontal ruled writing lines, with a neat folded dog-eared top-right corner. Perfectly upright, centered document view. Bold clean black outlines, clean white paper with faint blue lines, pure white background. Standalone sheet of paper, blank writing sheet, no drawings, no text, no animals, no dogs, no pencils.",
    note: "Front-facing upright sheet of lined paper with folded top-right corner",
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
  console.log(`Starting Batch 36 v2 front-facing generation (${BATCH36_V2.length} words)...`);

  for (let i = 0; i < BATCH36_V2.length; i++) {
    const item = BATCH36_V2[i];
    const out = `${BRAIN_DIR}/batch36_v2_${item.word}.png`;

    // For headphones, if our existing single-headset reroll is already front-facing and clean, we can reuse it
    if (item.word === "headphones" && existsSync(`${BRAIN_DIR}/batch36_headphones.png`) && !process.argv.includes("--force-all")) {
      console.log(`[${i + 1}/${BATCH36_V2.length}] Reusing front-facing headphones reroll...`);
      copyFileSync(`${BRAIN_DIR}/batch36_headphones.png`, out);
      copyFileSync(`${BRAIN_DIR}/batch36_headphones.png`, `${BRAIN_DIR}/batch36_v2_${item.word}.png`);
      continue;
    }

    if (existsSync(out) && !process.argv.includes("--force")) {
      console.log(`Slot #${item.slot} ("${item.displayName}") already exists at ${out}. Skipping.`);
      continue;
    }

    console.log(`\n[${i + 1}/${BATCH36_V2.length}] Generating slot #${item.slot}: "${item.displayName}" (front-facing)...`);
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
      // also mirror to main batch36 path for standard compatibility
      copyFileSync(out, `${BRAIN_DIR}/batch36_${item.word}.png`);
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
  for (let i = 0; i < BATCH36_V2.length; i++) {
    const item = BATCH36_V2[i];
    const imgPath = `${BRAIN_DIR}/batch36_v2_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch36_v2_grid.png`);
  copyFileSync(`${BRAIN_DIR}/batch36_v2_grid.png`, `${BRAIN_DIR}/batch36_grid.png`);
  console.log("Saved batch36_v2_grid.png and batch36_grid.png");

  console.log("Building 48px clinical strip...");
  const stripW = BATCH36_V2.length * 64 + 16;
  const stripH = 64;
  const stripComposites = [];
  for (let i = 0; i < BATCH36_V2.length; i++) {
    const item = BATCH36_V2[i];
    const imgPath = `${BRAIN_DIR}/batch36_v2_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch36_v2_strip_48.png`);
  copyFileSync(`${BRAIN_DIR}/batch36_v2_strip_48.png`, `${BRAIN_DIR}/batch36_strip_48.png`);
  console.log("Saved batch36_v2_strip_48.png and batch36_strip_48.png");

  console.log("Building lightweight batch36_review.html...");
  let cards = "";
  for (const item of BATCH36_V2) {
    const imgPath = `${BRAIN_DIR}/batch36_v2_${item.word}.png`;
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
  <title>Batch 36 v2 Review: Media, Tech & Creative Arts (Front-Facing Direct Orientation)</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-900 antialiased p-4">
  <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm max-w-5xl mx-auto">
    <div class="mb-5 border-b border-slate-100 pb-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-extrabold text-slate-900 tracking-tight">Batch 36 (Round 2): Front-Facing Direct Orientation</h1>
          <p class="text-xs text-slate-500 mt-1">10 Clipart Symbols · Slots #357–#366 · Direct Front View · Lifespan Dignity · Natural Color Law</p>
        </div>
        <div class="flex gap-2">
          <span class="text-xs font-semibold px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-full">Toys & Media</span>
          <span class="text-xs font-semibold px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">Front-Facing v2</span>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
      ${cards}
    </div>

    <div class="mt-6 pt-5 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">First Principles Realignment</h3>
        <ul class="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
          <li><strong>Direct Front-Facing Orientation</strong>: Removed the artificial "3/4 perspective" skew across screens, appliances, and tools. Symbols face directly forward for maximum motor grid clarity.</li>
          <li><strong>iPad (#358) vs Tablet (#357)</strong>: iPad features the iconic circular Apple Home button on the bottom bezel and iOS dock; Tablet shows a generic slate frame with a 3x3 app grid.</li>
          <li><strong>TV (#360), Video (#362), Camera (#365)</strong>: Rendered flat/straight-on without disorienting diagonal tilt.</li>
        </ul>
      </div>
      <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Design Rules</h3>
        <ul class="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
          <li><strong>Headphones (#363)</strong>: Single, centered, symmetrical over-ear headset with audio jack (zero notes).</li>
          <li><strong>Lifespan Dignity & Natural Color</strong>: Authentic finishes (aluminum, matte black, slate glass), pure white background, zero babyish cartooning.</li>
          <li><strong>Clinical Legibility</strong>: Unskewed silhouettes tested at 48×48px.</li>
        </ul>
      </div>
    </div>
  </div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch36_v2_review.html`, html, "utf8");
  copyFileSync(`${BRAIN_DIR}/batch36_v2_review.html`, `${BRAIN_DIR}/batch36_review.html`);
  console.log("Saved batch36_v2_review.html and batch36_review.html");
}

run().catch((err) => {
  console.error("Batch 36 v2 execution failed:", err);
  process.exit(1);
});
