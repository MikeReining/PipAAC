import { generateToFile } from "./gen.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH33 = [
  {
    slot: 327,
    word: "outside",
    displayName: "outside",
    category: "Place",
    framing: "object",
    hint: "An open front doorway framing a vibrant sunny outdoor view: bright yellow sun in a blue sky, lush green grass lawn, and a leafy shade tree seen through the open door frame. Bold clean black outlines, natural vibrant outdoor colors, pure white background around the door. No animals, no dogs, no pencils.",
    note: "Open doorway framing sunny green outdoors with lawn and tree",
  },
  {
    slot: 328,
    word: "inside",
    displayName: "inside",
    category: "Place",
    framing: "object",
    hint: "An open front doorway framing a warm and cozy interior living room: a rich wooden floor, a soft woven area rug, a comfortable armchair, and a warm glowing floor lamp seen through the open door frame. Bold clean black outlines, warm natural interior colors, pure white background around the door. No animals, no dogs, no pencils.",
    note: "Open doorway framing cozy interior room with rug and lamp",
  },
  {
    slot: 329,
    word: "street",
    displayName: "street",
    category: "Place",
    framing: "object",
    hint: "A paved neighborhood street in central vanishing-point perspective: a clean dark asphalt road with dashed white centerlines, bordered by concrete curbs, sidewalks, and a classic lamppost on the side. Bold clean black outlines, natural colors, pure white background. No animals, no dogs, no pencils.",
    note: "Paved asphalt road with dashed white centerlines and sidewalk",
  },
  {
    slot: 330,
    word: "town",
    displayName: "town",
    category: "Place",
    framing: "object",
    hint: "A zoomed-out elevated landscape view of a small picturesque countryside town or village nestled among rolling green hills: a cluster of charming small houses with colorful gabled roofs, a central church steeple rising above the village, and a small paved road winding into the town. Wide landscape perspective, bold clean black outlines, natural colors, pure white background above the hills. No animals, no dogs, no pencils.",
    note: "Zoomed-out village overlook with clustered houses nestled in hills",
  },
  {
    slot: 331,
    word: "church",
    displayName: "church",
    category: "Place",
    framing: "object",
    hint: "A traditional church building in 3/4 perspective: clean stone facade, pitched roof, arched stained-glass windows, double arched wooden entrance doors, and a tall bell steeple crowned with a simple cross on top. Bold clean black outlines, natural stone and warm wood colors, pure white background. No animals, no dogs, no pencils.",
    note: "Traditional stone church building with tall steeple and cross",
  },
  {
    slot: 332,
    word: "toy",
    displayName: "toy",
    category: "Toy",
    framing: "object",
    hint: "A single classic 3x3 Rubik's puzzle cube toy in 3/4 perspective: a colorful twisty cube with vibrant red, blue, yellow, and green square faces, with the top layer slightly twisted at an angle. Bold clean black outlines, bright primary colors, pure white background. Standalone singular toy, no other toys, no animals, no dogs, no pencils.",
    note: "Singular 3x3 colorful twisty puzzle cube toy",
  },
  {
    slot: 333,
    word: "ball",
    displayName: "ball",
    category: "Toy",
    framing: "object",
    hint: "A classic multi-colored playground toy ball: a bold round play ball with alternating curved panels of bright red, yellow, and blue, with a slight subtle bounce shadow beneath on a pure white background. Bold clean black outlines, vibrant primary colors, pure white background. No animals, no dogs, no pencils.",
    note: "Multi-colored primary red, yellow, blue playground play ball",
  },
  {
    slot: 334,
    word: "blocks",
    displayName: "blocks",
    category: "Toy",
    framing: "object",
    hint: "A neat playful stack of four colorful wooden cubic toy building blocks: red, blue, yellow, and green wooden cube blocks stacked in a mini tower, with large simple embossed letters (A, B, C) and numbers on the faces. Bold clean black outlines, natural painted wood colors, pure white background. No animals, no dogs, no pencils.",
    note: "Mini stack of four colorful wooden toy building blocks",
  },
  {
    slot: 335,
    word: "puzzle",
    displayName: "puzzle",
    category: "Toy",
    framing: "object",
    hint: "A colorful jigsaw puzzle with four interlocking puzzle pieces (red, blue, yellow, and green), with three pieces connected together and one piece hovering slightly above, ready to fit into place. Bold clean black outlines, vibrant primary colors, pure white background. No animals, no dogs, no pencils.",
    note: "Four interlocking colorful primary jigsaw puzzle pieces",
  },
  {
    slot: 336,
    word: "doll",
    displayName: "doll",
    category: "Toy",
    framing: "object",
    hint: "A friendly, classic cloth rag doll in 3/4 perspective: soft yarn hair, simple round stitched button eyes, a gentle embroidered smile, and a neat floral fabric dress with short sleeves and white apron. Clean standalone doll, bold clean black outlines, natural colors, pure white background. No animals, no dogs, no pencils.",
    note: "Classic friendly cloth rag doll in neat fabric dress",
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
  console.log(`Starting Batch 33 generation (${BATCH33.length} words: Final Places + Toys & Play)...`);

  for (let i = 0; i < BATCH33.length; i++) {
    const item = BATCH33[i];
    const out = `${BRAIN_DIR}/batch33_${item.word}.png`;
    if (existsSync(out) && !process.argv.includes("--force")) {
      console.log(`Slot #${item.slot} ("${item.displayName}") already exists at ${out}. Skipping.`);
      continue;
    }
    console.log(`\n[${i + 1}/${BATCH33.length}] Generating slot #${item.slot}: "${item.displayName}"...`);
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
  for (let i = 0; i < BATCH33.length; i++) {
    const item = BATCH33[i];
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = pad + c * (tileSize + pad);
    const y = pad + r * (tileSize + pad);
    const imgPath = `${BRAIN_DIR}/batch33_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch33_grid.png`);
  console.log("Saved batch33_grid.png");

  console.log("Building 48x48 preview strip...");
  const stripCols = BATCH33.length;
  const stripCell = 64;
  const stripW = stripCols * stripCell;
  const stripH = stripCell;
  const stripComposites = [];

  for (let i = 0; i < BATCH33.length; i++) {
    const item = BATCH33[i];
    const imgPath = `${BRAIN_DIR}/batch33_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch33_strip_48.png`);
  console.log("Saved batch33_strip_48.png");

  console.log("Building lightweight batch33_review.html...");
  let cards = "";
  for (const item of BATCH33) {
    const imgPath = `${BRAIN_DIR}/batch33_${item.word}.png`;
    if (!existsSync(imgPath)) continue;
    const b64Main = await getWebpB64(imgPath, 180);
    const b64Mini = await getWebpB64(imgPath, 48);
    const badgeColor = item.category === "Place" ? "bg-amber-100 text-amber-800" : "bg-purple-100 text-purple-800";

    cards += `
      <div class="border border-slate-200 bg-white rounded-xl p-3 flex flex-col items-center shadow-xs hover:shadow-md transition">
        <div class="w-full flex justify-between items-center mb-1.5">
          <span class="text-[11px] font-bold text-slate-400">#${item.slot}</span>
          <span class="text-[10px] font-bold px-1.5 py-0.5 rounded ${badgeColor}">${item.category}</span>
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
  <title>Batch 33 Review: Places (Final 5) & Toys / Play (First 5)</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-900 antialiased p-4">
  <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm max-w-5xl mx-auto">
    <div class="mb-5 border-b border-slate-100 pb-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-extrabold text-slate-900 tracking-tight">Batch 33: Places & Communities + Toys & Play</h1>
          <p class="text-xs text-slate-500 mt-1">10 Clipart Symbols · Slots #327–#336 · Completes 100% of Places (35/35) · Natural Color Law</p>
        </div>
        <div class="flex gap-2">
          <span class="text-xs font-semibold px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full">100% Places Complete</span>
          <span class="text-xs font-semibold px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-full">Toys & Play Launch</span>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
      ${cards}
    </div>

    <div class="mt-6 pt-5 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Places & Community Invariants</h3>
        <ul class="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
          <li><strong>Outside (#327) vs Inside (#328)</strong>: Doorway looking out to sunny lawn/trees vs doorway looking into warm floor, rug, and lamp.</li>
          <li><strong>Town (#330)</strong>: Zoomed-out elevated landscape view of clustered houses and steeple nestled in rolling hills (village overlook).</li>
          <li><strong>Street (#329) & Church (#331)</strong>: Paved asphalt road with dashed lines vs stone church with steeple and cross.</li>
        </ul>
      </div>

      <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Singular Toy Precision & Lifespan Dignity</h3>
        <ul class="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
          <li><strong>Toy (#332)</strong>: Single 3×3 Rubik's puzzle cube avoids plural "toys" confusion and preserves lifespan dignity.</li>
          <li><strong>Ball, Blocks & Puzzle (#333–#335)</strong>: Primary colored play ball, stack of 4 cubic wooden blocks, and interlocking jigsaw pieces.</li>
          <li><strong>Doll (#336)</strong>: Classic cloth rag doll with yarn hair and dress.</li>
        </ul>
      </div>
    </div>
  </div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch33_review.html`, html, "utf8");
  const sizeKB = Math.round(Buffer.byteLength(html) / 1024);
  console.log(`Saved batch33_review.html -> ${sizeKB} KB (lightweight Tailwind)`);

  try {
    execSync(`open "${BRAIN_DIR}/batch33_review.html"`);
    console.log("Opened batch33_review.html in browser");
  } catch (err) {
    console.error("Could not run open command:", err);
  }
}

run().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
