import { generateToFile } from "./gen.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

export const BATCH44 = [
  {
    slot: 437,
    word: "belt",
    displayName: "belt",
    category: "Clothing",
    framing: "object",
    hint: "A clean standalone brown leather belt with a shiny metal buckle.",
    note: "Coiled brown leather waist belt with metallic buckle",
  },
  {
    slot: 438,
    word: "pocket",
    displayName: "pocket",
    category: "Clothing",
    framing: "object",
    hint: "A clean standalone denim patch pocket with yellow topstitching.",
    note: "Denim jeans patch pocket with contrast topstitching",
  },
  {
    slot: 439,
    word: "sandals",
    displayName: "sandal",
    category: "Clothing",
    framing: "object",
    hint: "A clean standalone tan leather open-toe summer strap sandal with buckle.",
    note: "Single prominent tan strap sandal filling ~80% of canvas",
  },
  {
    slot: 440,
    word: "animal",
    displayName: "animal",
    category: "Animals",
    framing: "object",
    hint: "A clean standalone friendly South American tapir animal with distinct snout and sturdy body standing in profile.",
    note: "Distinctive large animal archetype (tapir) standing in profile",
  },
  {
    slot: 441,
    word: "dog",
    displayName: "dog",
    category: "Animals",
    framing: "object",
    hint: "A clean standalone friendly golden-brown retriever dog wearing a bright red collar, sitting upright.",
    note: "Adult golden-brown retriever dog with red collar",
  },
  {
    slot: 442,
    word: "cat",
    displayName: "cat",
    category: "Animals",
    framing: "object",
    hint: "A clean standalone orange ginger tabby cat sitting upright with alert ears and a curled tail.",
    note: "Adult ginger orange tabby cat",
  },
  {
    slot: 443,
    word: "puppy",
    displayName: "puppy",
    category: "Animals",
    framing: "object",
    hint: "A clean standalone playful white and black spotted dalmatian puppy with floppy ears and conspicuously large, oversized puppy paws.",
    note: "Spotted puppy with oversized baby paws and floppy ears",
  },
  {
    slot: 444,
    word: "kitten",
    displayName: "kitten",
    category: "Animals",
    framing: "object",
    hint: "A clean standalone soft silver-gray striped kitten with big curious wide eyes and tiny paws.",
    note: "Silver-gray baby kitten with large curious eyes",
  },
  {
    slot: 445,
    word: "bird",
    displayName: "bird",
    category: "Animals",
    framing: "object",
    hint: "A clean standalone colorful songbird perched upright on a small wooden twig.",
    note: "Perched colorful songbird with feathered wing and beak",
  },
  {
    slot: 446,
    word: "bunny",
    displayName: "bunny",
    category: "Animals",
    framing: "object",
    hint: "A clean standalone soft white rabbit sitting upright with long upright ears.",
    note: "White bunny rabbit sitting with upright ears and pink nose",
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

export async function run() {
  console.log(`Starting Batch 44 generation (${BATCH44.length} words: Clothing Finale & Animal Launch)...`);

  for (let i = 0; i < BATCH44.length; i++) {
    const item = BATCH44[i];
    const out = `${BRAIN_DIR}/batch44_${item.word}.png`;
    if (existsSync(out) && !process.argv.includes("--force")) {
      console.log(`Slot #${item.slot} ("${item.displayName}") already exists at ${out}. Skipping.`);
      continue;
    }
    console.log(`\n[${i + 1}/${BATCH44.length}] Generating slot #${item.slot}: "${item.displayName}"...`);
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
  for (let i = 0; i < BATCH44.length; i++) {
    const item = BATCH44[i];
    const imgPath = `${BRAIN_DIR}/batch44_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch44_grid.png`);
  console.log("Saved batch44_grid.png");

  console.log("Building 48px clinical strip...");
  const stripW = BATCH44.length * 64 + 16;
  const stripH = 64;
  const stripComposites = [];
  for (let i = 0; i < BATCH44.length; i++) {
    const item = BATCH44[i];
    const imgPath = `${BRAIN_DIR}/batch44_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch44_strip_48.png`);
  console.log("Saved batch44_strip_48.png");

  console.log("Building lightweight batch44_review.html...");
  let cards = "";
  for (const item of BATCH44) {
    const imgPath = `${BRAIN_DIR}/batch44_${item.word}.png`;
    if (!existsSync(imgPath)) continue;
    const b64Main = await getWebpB64(imgPath, 180);
    const b64Mini = await getWebpB64(imgPath, 48);

    cards += `
      <div class="border border-slate-200 bg-white rounded-xl p-3 flex flex-col items-center shadow-xs hover:shadow-md transition">
        <div class="w-full flex justify-between items-center mb-1.5">
          <span class="text-[11px] font-bold text-slate-400">#${item.slot}</span>
          <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">${item.category}</span>
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
  <title>Batch 44 Review: Clothing Finale & Animals Launch (Slots #437–#446)</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-900 antialiased p-4">
  <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm max-w-5xl mx-auto">
    <div class="mb-5 border-b border-slate-100 pb-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-extrabold text-slate-900 tracking-tight">Batch 44: Clothing Finale & Animals Launch</h1>
          <p class="text-xs text-slate-500 mt-1">10 Clipart Symbols · Slots #437–#446 · Disambiguated Archetypes · Lifespan Dignity</p>
        </div>
        <div class="flex gap-2">
          <span class="text-xs font-semibold px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-full">Clothing Finale (3)</span>
          <span class="text-xs font-semibold px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full">Animals Launch (7)</span>
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
          <li><strong>Dog (#441) vs Puppy (#443)</strong>: Adult alert dog with mature proportions vs baby puppy with floppy ears and softer contours.</li>
          <li><strong>Cat (#442) vs Kitten (#444)</strong>: Adult sleek cat with alert ears vs tiny baby kitten with large curious eyes.</li>
          <li><strong>Animal (#440)</strong>: Paw print archetype representing the generic animal concept on AAC boards.</li>
        </ul>
      </div>
      <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Design Rules</h3>
        <ul class="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
          <li><strong>Minimal Natural Prompts</strong>: Single natural descriptive sentence per noun archetype; trust Muse first.</li>
          <li><strong>Dignity & Maturity</strong>: Real domestic animals and wildlife; zero clownish cartoon faces.</li>
          <li><strong>48px Silhouette Contrast</strong>: Clear isolated profiles and stances legible at iPad grid size.</li>
        </ul>
      </div>
    </div>
  </div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch44_review.html`, html, "utf8");
  console.log("Saved batch44_review.html");
}

if (process.argv[1] && process.argv[1].endsWith("batch44.mjs")) {
  run().catch((err) => {
    console.error("Batch 44 execution failed:", err);
    process.exit(1);
  });
}
