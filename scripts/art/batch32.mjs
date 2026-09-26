import { generateToFile } from "./gen.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH32 = [
  {
    slot: 317,
    word: "pool",
    displayName: "pool",
    framing: "object",
    hint: "A clean in-ground swimming pool in 3/4 perspective with clear turquoise blue water, featuring a classic diving board with a chrome ladder stand extending over the deep end of the water. Clean minimal pool deck, bold clean black outlines, natural colors, pure white background. No animals, no dogs, no pencils.",
    note: "In-ground pool with clear blue water and classic diving board",
  },
  {
    slot: 318,
    word: "beach",
    displayName: "beach",
    framing: "object",
    hint: "A sunny beach scene: golden sand in the foreground with gentle turquoise ocean waves washing ashore, a colorful beach umbrella planted in the sand beside a beach towel, and a bright sunny sky on the horizon. Bold clean black outlines, natural colors, pure white background. No animals, no dogs, no pencils.",
    note: "Golden sand beach with gentle ocean waves and beach umbrella",
  },
  {
    slot: 319,
    word: "zoo",
    displayName: "zoo",
    framing: "object",
    hint: "A zoo animal park scene: a clean wooden viewing fence with green trees behind it, and a tall friendly giraffe with brown spots peeking its head and long neck over the fence. Bold clean black outlines, natural colors, pure white background. No text, no letters, no dogs, no pencils.",
    note: "Zoo enclosure fence with tall friendly giraffe peeking over",
  },
  {
    slot: 320,
    word: "doctor_office",
    displayName: "doctor office",
    framing: "object",
    hint: "A doctor's medical examination room in 3/4 perspective: an adjustable padded medical exam table with a roll of clean white sanitary paper draped across it, a small stainless steel tray table with a stethoscope, and an eye chart hanging on the wall. Bold clean black outlines, natural colors, pure white background. No animals, no dogs, no pencils.",
    note: "Doctor exam room with padded table, sanitary paper roll & stethoscope",
  },
  {
    slot: 321,
    word: "hospital",
    displayName: "hospital",
    framing: "object",
    hint: "A modern hospital medical center building exterior in 3/4 perspective: double glass entrance doors under a covered entryway, a prominent blue square hospital sign with a bold white capital 'H' on the front facade, and a clean white ambulance with red stripe parked out front. Bold clean black outlines, natural colors, pure white background. No animals, no dogs, no pencils.",
    note: "Modern hospital building with ambulance and Blue Hospital 'H' sign",
  },
  {
    slot: 322,
    word: "museum",
    displayName: "museum",
    framing: "object",
    hint: "A grand classical museum building facade in 3/4 perspective: wide stone front entrance steps leading up to majestic classical stone columns and a triangular roof pediment. Bold clean black outlines, natural stone and warm grey colors, pure white background. No text, no animals, no dogs, no pencils.",
    note: "Neoclassical museum building with wide steps, columns and pediment",
  },
  {
    slot: 323,
    word: "movie_theater",
    displayName: "movie theater",
    framing: "object",
    hint: "A movie theater auditorium scene: a large glowing white cinema movie projection screen in the front, rows of comfortable red velvet cinema seats viewed from behind, and a red-and-white striped bucket of buttery popcorn in the foreground. Bold clean black outlines, natural colors, pure white background. No animals, no dogs, no pencils.",
    note: "Glowing movie cinema screen with red velvet seats and popcorn bucket",
  },
  {
    slot: 324,
    word: "mall",
    displayName: "mall",
    framing: "object",
    hint: "A modern multi-level indoor shopping mall atrium in 3/4 perspective: an open interior concourse with a glass skylight ceiling, crisscrossing moving escalators connecting upper and lower shopping levels, and storefront display windows. Bold clean black outlines, natural colors, pure white background. No animals, no dogs, no pencils.",
    note: "Multi-level indoor shopping mall atrium with crisscrossing escalators",
  },
  {
    slot: 325,
    word: "farm",
    displayName: "farm",
    framing: "object",
    hint: "A picturesque countryside farm scene in 3/4 perspective: a classic red wooden barn with white X-brace trim on the double doors, a tall round metal silo beside the barn, and a wooden split-rail pasture fence on green grass. Bold clean black outlines, natural colors, pure white background. No animals, no dogs, no pencils.",
    note: "Classic red farm barn with white X-brace trim, silo and pasture fence",
  },
  {
    slot: 326,
    word: "airport",
    displayName: "airport",
    framing: "object",
    hint: "An airport scene in 3/4 perspective: a modern airport terminal building with a tall air traffic control tower, and a white commercial passenger jet airplane parked on the tarmac at an airport gate. Bold clean black outlines, natural colors, pure white background. No animals, no dogs, no pencils.",
    note: "Airport tarmac with passenger jet airplane and air traffic control tower",
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
  console.log(`Starting Batch 32 generation (${BATCH32.length} words: Places, Rooms & Community: Community Destinations & Outings)...`);

  for (let i = 0; i < BATCH32.length; i++) {
    const item = BATCH32[i];
    const out = `${BRAIN_DIR}/batch32_${item.word}.png`;
    if (existsSync(out) && !process.argv.includes("--force")) {
      console.log(`Slot #${item.slot} ("${item.displayName}") already exists at ${out}. Skipping.`);
      continue;
    }
    console.log(`\n[${i + 1}/${BATCH32.length}] Generating slot #${item.slot}: "${item.displayName}"...`);
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
  for (let i = 0; i < BATCH32.length; i++) {
    const item = BATCH32[i];
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = pad + c * (tileSize + pad);
    const y = pad + r * (tileSize + pad);
    const imgPath = `${BRAIN_DIR}/batch32_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch32_grid.png`);
  console.log("Saved batch32_grid.png");

  console.log("Building 48x48 preview strip...");
  const stripCols = BATCH32.length;
  const stripCell = 64;
  const stripW = stripCols * stripCell;
  const stripH = stripCell;
  const stripComposites = [];

  for (let i = 0; i < BATCH32.length; i++) {
    const item = BATCH32[i];
    const imgPath = `${BRAIN_DIR}/batch32_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch32_strip_48.png`);
  console.log("Saved batch32_strip_48.png");

  console.log("Building lightweight batch32_review.html...");
  let cards = "";
  for (const item of BATCH32) {
    const imgPath = `${BRAIN_DIR}/batch32_${item.word}.png`;
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
  <title>Batch 32 Review: Places, Rooms & Community (Destinations & Outings)</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-900 antialiased p-4">
  <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm max-w-5xl mx-auto">
    <div class="mb-5 border-b border-slate-100 pb-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-extrabold text-slate-900 tracking-tight">Batch 32: Places, Rooms & Community</h1>
          <p class="text-xs text-slate-500 mt-1">10 Clipart Symbols · Community Destinations & Public Venues · Slots #317–#326 · Natural Color Law</p>
        </div>
        <div class="flex gap-2">
          <span class="text-xs font-semibold px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">Natural Colors</span>
          <span class="text-xs font-semibold px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full">Diving Board Pool vs Beach</span>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
      ${cards}
    </div>

    <div class="mt-6 pt-5 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Aquatic & Healthcare Disambiguation</h3>
        <ul class="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
          <li><strong>Pool (#317) vs Beach (#318)</strong>: Pool features a diving board over turquoise water (no life ring clutter); Beach features natural ocean surf, sand, and beach umbrella.</li>
          <li><strong>Doctor Office (#320) vs Hospital (#321)</strong>: Interior exam table with sanitary paper roll vs major medical building exterior with ambulance and Blue Hospital "H" sign.</li>
        </ul>
      </div>

      <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Civic & Community Anchors</h3>
        <ul class="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
          <li><strong>Museum (#322) & Theater (#323)</strong>: Neoclassical stone pillars and steps vs cinema screen with red velvet seats & popcorn.</li>
          <li><strong>Mall (#324), Farm (#325) & Airport (#326)</strong>: Multi-level concourse with escalators vs classic red barn with silo vs airport jet on tarmac with control tower.</li>
        </ul>
      </div>
    </div>
  </div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch32_review.html`, html, "utf8");
  const sizeKB = Math.round(Buffer.byteLength(html) / 1024);
  console.log(`Saved batch32_review.html -> ${sizeKB} KB (lightweight Tailwind)`);

  try {
    execSync(`open "${BRAIN_DIR}/batch32_review.html"`);
    console.log("Opened batch32_review.html in browser");
  } catch (err) {
    console.error("Could not run open command:", err);
  }
}

run().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
