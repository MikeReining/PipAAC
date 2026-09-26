import { generateToFile } from "./gen.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH31 = [
  {
    slot: 307,
    word: "playground",
    displayName: "playground",
    framing: "object",
    hint: "An outdoor playground scene in 3/4 perspective: a clean A-frame swing set with two swings hanging down beside a bright red playground slide with a climbing ladder, set on a patch of green grass with a soft wood mulch play area. Bold clean black outlines, natural vibrant colors, pure white background. No animals, no dogs, no pencils.",
    note: "Playground slide with climbing ladder and A-frame swing set",
  },
  {
    slot: 308,
    word: "gym",
    displayName: "gym",
    framing: "object",
    hint: "A clean fitness weight room scene in 3/4 perspective: a sturdy black padded workout bench with a chrome barbell racked across upright supports with round black weight plates, and a pair of classic hexagonal dumbbells resting on a black rubber gym floor mat. Bold clean black outlines, natural colors, pure white background. No animals, no dogs, no pencils.",
    note: "Fitness weight bench with barbell and pair of hex dumbbells",
  },
  {
    slot: 309,
    word: "cafeteria",
    displayName: "cafeteria",
    framing: "object",
    hint: "A school cafeteria dining scene: a classic rectangular compartmentalized lunch tray with a carton of milk, a sandwich, and a shiny red apple, resting on a long folding cafeteria dining table with attached round bench stools. Bold clean black outlines, natural colors, pure white background. No animals, no dogs, no pencils.",
    note: "Divided school lunch tray on folding cafeteria bench table",
  },
  {
    slot: 310,
    word: "library",
    displayName: "library",
    framing: "object",
    hint: "A cozy library reading scene in 3/4 perspective: a tall wooden bookcase neatly filled with colorful books with red, blue, and green book spines, flanked by a comfortable cushioned reading armchair and a small side table with a green banker's reading lamp. Bold clean black outlines, natural colors, pure white background. No animals, no dogs, no pencils.",
    note: "Tall bookcase filled with books, reading chair and lamp",
  },
  {
    slot: 311,
    word: "hallway",
    displayName: "hallway",
    framing: "object",
    hint: "A school hallway corridor viewed with central vanishing-point perspective: a clean corridor lined with neat blue metal lockers along one wall, classroom door frames, a polished tiled floor, and overhead lights. Bold clean black outlines, natural colors, pure white background. No animals, no dogs, no pencils.",
    note: "Corridor with blue metal lockers, classroom doors and tiled floor",
  },
  {
    slot: 312,
    word: "desk",
    displayName: "desk",
    framing: "object",
    hint: "A clean standalone wooden study desk in 3/4 perspective with four sturdy legs, a side drawer with a metal pull handle, and a neat desktop with an open notepad and a small pencil holder cup. Standalone furniture piece, bold clean black outlines, warm natural wood tones, pure white background. No animals, no dogs.",
    note: "Standalone wooden study desk with drawer, notepad and pencil cup",
  },
  {
    slot: 313,
    word: "park",
    displayName: "park",
    framing: "object",
    hint: "A scenic public park setting: a curved paved walking path running through a lush green grass lawn, two tall leafy green shade trees, a classic slatted wooden park bench, and gentle sunshine. Bold clean black outlines, vibrant natural green colors, pure white background. No animals, no dogs, no pencils.",
    note: "Paved walking path through green park lawn with trees and bench",
  },
  {
    slot: 314,
    word: "store",
    displayName: "store",
    framing: "object",
    hint: "A retail clothing shop storefront in 3/4 perspective: a classic striped fabric awning over a large glass display window showing stylish clothing and jackets on a display rack, and a glass entrance door. Bold clean black outlines, natural colors, pure white background. No animals, no dogs, no pencils.",
    note: "Retail clothing storefront with striped awning and window display",
  },
  {
    slot: 315,
    word: "grocery_store",
    displayName: "grocery store",
    framing: "object",
    hint: "A neighborhood grocery store and fresh food market storefront in 3/4 perspective: a storefront with a green fabric awning, entrance door, and outdoor wooden market display crates overflowing with fresh colorful fruits like red apples, oranges, and bananas displayed under the awning. Bold clean black outlines, natural vibrant food colors, pure white background. No animals, no dogs, no pencils.",
    note: "Market storefront with awning and outdoor wooden fruit display crates",
  },
  {
    slot: 316,
    word: "restaurant",
    displayName: "restaurant",
    framing: "object",
    hint: "A restaurant dining table set for a meal: a clean dining table covered with a white tablecloth, two dining chairs, a ceramic dinner plate with a metal fork and knife, a water drinking glass, and an upright restaurant table menu standing in the center. Bold clean black outlines, natural colors, pure white background. No animals, no dogs, no pencils.",
    note: "Dining table with tablecloth, chairs, dinner setting and menu",
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
  console.log(`Starting Batch 31 generation (${BATCH31.length} words: Places, Rooms & Community: Community & School Facilities)...`);

  for (let i = 0; i < BATCH31.length; i++) {
    const item = BATCH31[i];
    const out = `${BRAIN_DIR}/batch31_${item.word}.png`;
    if (existsSync(out) && !process.argv.includes("--force")) {
      console.log(`Slot #${item.slot} ("${item.displayName}") already exists at ${out}. Skipping.`);
      continue;
    }
    console.log(`\n[${i + 1}/${BATCH31.length}] Generating slot #${item.slot}: "${item.displayName}"...`);
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
  for (let i = 0; i < BATCH31.length; i++) {
    const item = BATCH31[i];
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = pad + c * (tileSize + pad);
    const y = pad + r * (tileSize + pad);
    const imgPath = `${BRAIN_DIR}/batch31_${item.word}.png`;
    if (!existsSync(imgPath)) continue;
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
    .toFile(`${BRAIN_DIR}/batch31_grid.png`);
  console.log("Saved batch31_grid.png");

  console.log("Building 48x48 preview strip...");
  const stripCols = BATCH31.length;
  const stripCell = 64;
  const stripW = stripCols * stripCell;
  const stripH = stripCell;
  const stripComposites = [];

  for (let i = 0; i < BATCH31.length; i++) {
    const item = BATCH31[i];
    const imgPath = `${BRAIN_DIR}/batch31_${item.word}.png`;
    if (!existsSync(imgPath)) continue;
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
    .toFile(`${BRAIN_DIR}/batch31_strip_48.png`);
  console.log("Saved batch31_strip_48.png");

  console.log("Building lightweight batch31_review.html...");
  let cards = "";
  for (const item of BATCH31) {
    const imgPath = `${BRAIN_DIR}/batch31_${item.word}.png`;
    if (!existsSync(imgPath)) continue;
    const b64Main = await getWebpB64(imgPath, 180);
    const b64Mini = await getWebpB64(imgPath, 48);

    cards += `
      <div class="border border-slate-200 bg-white rounded-xl p-3 flex flex-col items-center shadow-xs hover:shadow-md transition">
        <div class="w-full flex justify-between items-center mb-1.5">
          <span class="text-[11px] font-bold text-slate-400">#${item.slot}</span>
          <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">Place</span>
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
  <title>Batch 31 Review: Places, Rooms & Community (Facilities & Community)</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-900 antialiased p-4">
  <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm max-w-5xl mx-auto">
    <div class="mb-5 border-b border-slate-100 pb-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-extrabold text-slate-900 tracking-tight">Batch 31: Places, Rooms & Community</h1>
          <p class="text-xs text-slate-500 mt-1">10 Clipart Symbols · Facilities & Community Outings · Slots #307–#316 · Natural Color Law</p>
        </div>
        <div class="flex gap-2">
          <span class="text-xs font-semibold px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">Natural Colors</span>
          <span class="text-xs font-semibold px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full">Storefront Symmetry</span>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
      ${cards}
    </div>

    <div class="mt-6 pt-5 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Storefront Symmetry & Disambiguation</h3>
        <ul class="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
          <li><strong>Store (#314) vs Grocery Store (#315)</strong>: Both share charming storefront architecture; Store features clothing in display window, Grocery Store features outdoor wooden crates with fresh apples, oranges, and bananas.</li>
          <li><strong>Playground (#307) vs Park (#313)</strong>: Play equipment (swings + slide) vs open walking path with park bench and trees.</li>
        </ul>
      </div>

      <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Lifespan Dignity & Facilities</h3>
        <ul class="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
          <li><strong>Gym (#308)</strong>: Weight room fitness setting (padded bench, barbell, hex dumbbells) rather than a basketball court.</li>
          <li><strong>Cafeteria (#309) vs Restaurant (#316)</strong>: School lunch tray on folding bench table vs set dining table with tablecloth & menu.</li>
        </ul>
      </div>
    </div>
  </div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch31_review.html`, html, "utf8");
  const sizeKB = Math.round(Buffer.byteLength(html) / 1024);
  console.log(`Saved batch31_review.html -> ${sizeKB} KB (lightweight Tailwind)`);

  try {
    execSync(`open "${BRAIN_DIR}/batch31_review.html"`);
    console.log("Opened batch31_review.html in browser");
  } catch (err) {
    console.error("Could not run open command:", err);
  }
}

run().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
