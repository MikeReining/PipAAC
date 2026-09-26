import { generateToFile } from "./gen.mjs";
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

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

async function zoomDoor(name) {
  const file = `${BRAIN_DIR}/batch33_${name}.png`;
  const trimmedBuf = await sharp(file).trim().toBuffer();
  const trimmedMeta = await sharp(trimmedBuf).metadata();

  const targetH = 1650;
  const targetW = Math.round(trimmedMeta.width * (targetH / trimmedMeta.height));
  const resized = await sharp(trimmedBuf).resize(targetW, targetH, { fit: "contain" }).toBuffer();

  const final = await sharp({
    create: {
      width: 1920,
      height: 1920,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([{ input: resized, gravity: "center" }])
    .png()
    .toBuffer();

  writeFileSync(file, final);
  console.log(`Zoomed ${name} successfully! Door is now ${targetW}x${targetH} centered in 1920x1920.`);
}

async function getWebpB64(path, size) {
  const buf = readFileSync(path);
  const thumb = await sharp(buf)
    .resize(size, size, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .webp({ quality: 75 })
    .toBuffer();
  return thumb.toString("base64");
}

const RE_ROLLS = [
  {
    slot: 329,
    word: "street",
    displayName: "street",
    framing: "object",
    hint: "A neighborhood street scene viewed horizontally from the sidewalk: in the foreground is a concrete sidewalk with a clean curb edge, in the middle is a dark asphalt street running horizontally across the frame with white painted pedestrian crosswalk stripes, and across the street is the opposite sidewalk with a classic black lamppost and a green shade tree. Empty street, no cars, no vehicles, bold clean black outlines, natural colors, pure white background. No animals, no dogs, no pencils.",
    note: "Horizontal neighborhood street with sidewalk curb, asphalt crosswalk & lamppost",
  },
  {
    slot: 333,
    word: "ball",
    displayName: "ball",
    framing: "object",
    hint: "A classic black and white soccer ball in 3/4 perspective: traditional geometric pattern of black pentagons surrounded by white hexagons, with a subtle ground shadow beneath. Bold clean black outlines, classic black and white sports ball, pure white background. No animals, no dogs, no pencils, no other balls.",
    note: "Classic black and white soccer ball with traditional hexagon/pentagon pattern",
  },
  {
    slot: 334,
    word: "blocks",
    displayName: "blocks",
    framing: "object",
    hint: "A neat stack of three plain wooden toy building blocks in 3/4 perspective: natural warm wood grain and smooth rounded edges, completely blank surfaces with zero letters, zero numbers, and no writing of any kind. Simple, calm wooden children's play blocks, bold clean black outlines, warm natural wood tones, pure white background. No animals, no dogs, no pencils.",
    note: "Stack of plain natural wooden toy building blocks (zero letters or numbers)",
  },
];

async function run() {
  console.log("Applying manual zoom on outside and inside...");
  await zoomDoor("outside");
  await zoomDoor("inside");

  console.log("\nGenerating re-rolls for street, ball, and blocks...");
  for (const item of RE_ROLLS) {
    const dest = `${BRAIN_DIR}/batch33_${item.word}.png`;
    const backup = `${BRAIN_DIR}/batch33_${item.word}_roll1.png`;
    if (existsSync(dest) && !existsSync(backup)) {
      copyFileSync(dest, backup);
      console.log(`Backed up roll 1 to ${backup}`);
    }

    console.log(`Generating slot #${item.slot}: "${item.displayName}"...`);
    const start = Date.now();
    try {
      await generateToFile({
        word: item.displayName,
        torso: null,
        framing: item.framing ?? "object",
        hint: item.hint,
        out: dest,
      });
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`Done slot #${item.slot}: "${item.displayName}" in ${elapsed}s -> ${dest}`);
      await padToSquare(dest);
    } catch (err) {
      console.error(`FAILED slot #${item.slot}: "${item.displayName}"`, err);
    }
  }

  const BATCH33 = [
    { slot: 327, word: "outside", displayName: "outside", category: "Place", note: "Zoomed doorway framing sunny green outdoors with lawn and tree" },
    { slot: 328, word: "inside", displayName: "inside", category: "Place", note: "Zoomed doorway framing cozy interior room with rug and lamp" },
    { slot: 329, word: "street", displayName: "street", category: "Place", note: "Horizontal neighborhood street with sidewalk curb, asphalt crosswalk & lamppost" },
    { slot: 330, word: "town", displayName: "town", category: "Place", note: "Zoomed-out village overlook with clustered houses nestled in hills" },
    { slot: 331, word: "church", displayName: "church", category: "Place", note: "Traditional stone church building with tall steeple and cross" },
    { slot: 332, word: "toy", displayName: "toy", category: "Toy", note: "Singular 3×3 colorful twisty puzzle cube toy" },
    { slot: 333, word: "ball", displayName: "ball", category: "Toy", note: "Classic black & white soccer ball (traditional pattern, calm contrast)" },
    { slot: 334, word: "blocks", displayName: "blocks", category: "Toy", note: "Stack of plain natural wooden blocks (zero letters/numbers, no clutter)" },
    { slot: 335, word: "puzzle", displayName: "puzzle", category: "Toy", note: "Four interlocking colorful primary jigsaw puzzle pieces" },
    { slot: 336, word: "doll", displayName: "doll", category: "Toy", note: "Classic friendly cloth rag doll in neat fabric dress" },
  ];

  console.log("\nRebuilding composite grid...");
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
    const resized = await sharp(imgPath)
      .resize(tileSize, tileSize, { fit: "contain", background: { r: 255, g: 255, b: 255 } })
      .toBuffer();
    composites.push({ input: resized, top: y, left: x });
  }

  await sharp({
    create: { width: gridW, height: gridH, channels: 3, background: { r: 241, g: 245, b: 249 } },
  })
    .composite(composites)
    .png()
    .toFile(`${BRAIN_DIR}/batch33_grid.png`);

  console.log("Rebuilding 48x48 preview strip...");
  const stripCols = BATCH33.length;
  const stripCell = 64;
  const stripW = stripCols * stripCell;
  const stripH = stripCell;
  const stripComposites = [];

  for (let i = 0; i < BATCH33.length; i++) {
    const item = BATCH33[i];
    const imgPath = `${BRAIN_DIR}/batch33_${item.word}.png`;
    const mini = await sharp(imgPath)
      .resize(48, 48, { fit: "contain", background: { r: 255, g: 255, b: 255 } })
      .toBuffer();
    stripComposites.push({ input: mini, top: 8, left: i * stripCell + 8 });
  }

  await sharp({
    create: { width: stripW, height: stripH, channels: 3, background: { r: 248, g: 250, b: 252 } },
  })
    .composite(stripComposites)
    .png()
    .toFile(`${BRAIN_DIR}/batch33_strip_48.png`);

  let cards = "";
  for (const item of BATCH33) {
    const imgPath = `${BRAIN_DIR}/batch33_${item.word}.png`;
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
          <h1 class="text-xl font-extrabold text-slate-900 tracking-tight">Batch 33: Places & Communities + Toys & Play (Refined)</h1>
          <p class="text-xs text-slate-500 mt-1">10 Clipart Symbols · Slots #327–#336 · Completes 100% of Places (35/35) · Natural Color & Anti-Overload</p>
        </div>
        <div class="flex gap-2">
          <span class="text-xs font-semibold px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full">100% Places Complete</span>
          <span class="text-xs font-semibold px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">Calmed Color Palette</span>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
      ${cards}
    </div>

    <div class="mt-6 pt-5 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Refinements & Perspective</h3>
        <ul class="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
          <li><strong>Outside (#327) & Inside (#328)</strong>: Manually zoomed in tight via Sharp to eliminate dead white margins; doorway now fills 85% of tile height.</li>
          <li><strong>Street (#329)</strong>: Re-rolled as horizontal neighborhood street with sidewalk curb, asphalt roadway, painted crosswalk, and lamppost (no highway).</li>
          <li><strong>Town (#330)</strong>: Elevated village overlook of clustered houses and steeple nestled in rolling hills.</li>
        </ul>
      </div>

      <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Anti-Overload & Playful Simplicity</h3>
        <ul class="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
          <li><strong>Ball (#333)</strong>: Re-rolled as classic black-and-white soccer ball (geometric pattern, calm contrast, zero rainbow circus).</li>
          <li><strong>Blocks (#334)</strong>: Re-rolled as stack of plain natural wooden blocks with zero text, letters, or numbers.</li>
          <li><strong>Toy (#332)</strong>: Single 3×3 Rubik's cube preserves singular precision and dignity across all ages.</li>
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
