import { generateToFile } from "./gen.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH34 = [
  {
    slot: 337,
    word: "action_figure",
    displayName: "action figure",
    category: "Toy",
    framing: "object",
    hint: "A classic posable action figure toy standing in a dynamic hero pose in 3/4 perspective: sculpted athletic physique, futuristic superhero suit in navy blue with red boots and gauntlets, a golden chest emblem, and clearly visible posable ball joints at the shoulders, elbows, and knees. Bold clean black outlines, saturated primary toy colors, pure white background. Standalone toy, no human person, no face details, no text, no animals, no dogs, no pencils.",
    note: "Posable articulated action figure in hero pose with visible joints",
  },
  {
    slot: 338,
    word: "bubbles",
    displayName: "bubbles",
    category: "Toy",
    framing: "object",
    hint: "A bright blue circular bubble wand with a handle, with a playful floating stream of several transparent spherical soap bubbles drifting upward: delicate circular outlines with soft iridescent blue and pastel rainbow reflections, each bubble featuring crisp white curved glare highlights. Bold clean black outlines, clear luminous highlights, pure white background. No animals, no dogs, no pencils.",
    note: "Blue bubble wand with floating iridescent spherical soap bubbles",
  },
  {
    slot: 339,
    word: "play_dough",
    displayName: "play dough",
    category: "Toy",
    framing: "object",
    hint: "A classic modeling dough toy in 3/4 perspective: an open bright yellow plastic tub or canister with its red lid resting beside it on the surface, and a vibrant squish-molded lump or swirl of bright blue modeling dough sitting in front of the tub. Bold clean black outlines, bright solid plastic colors, pure white background. No text, no letters, no logos, no animals, no dogs, no pencils.",
    note: "Open yellow dough tub with red lid and lump of blue modeling dough",
  },
  {
    slot: 340,
    word: "toy_car",
    displayName: "toy car",
    category: "Toy",
    framing: "object",
    hint: "A classic die-cast metal toy sports car in 3/4 isometric perspective: vibrant cherry red painted diecast body, sleek retro-modern coupe profile, glossy black rubber wheels with silver hubcaps, and clean tinted windshield. Distinctly reads as a collectible toy model car, not a real street vehicle. Bold clean black outlines, saturated red enamel color, pure white background. No background scenery, no roads, no animals, no dogs, no pencils.",
    note: "Red die-cast toy coupe car with black wheels and silver hubcaps",
  },
  {
    slot: 341,
    word: "toy_train",
    displayName: "toy train",
    category: "Toy",
    framing: "object",
    hint: "A classic wooden toy train steam locomotive engine resting on a short section of straight wooden railway track in 3/4 perspective: bright red wooden cab, blue cylinder boiler, black smokestack, yellow wheels with silver hub pins, and a front magnetic metal peg coupler. Clearly a crafted wooden toy train, not an industrial transit train. Bold clean black outlines, rich toy enamel colors, pure white background. No animals, no dogs, no pencils.",
    note: "Classic wooden toy train locomotive on wooden railway track",
  },
  {
    slot: 342,
    word: "stuffed_animal",
    displayName: "stuffed animal",
    category: "Toy",
    framing: "object",
    hint: "A classic plush teddy bear stuffed animal sitting upright in 3/4 perspective: soft warm caramel-brown plush fur, round padded ears, cute stitched dark nose and smile on a lighter tan muzzle, black button eyes, and visible stitched felt paw pads on its upright feet. Warm, cuddly, dignified stuffed toy archetype. Bold clean black outlines, warm natural brown tones, pure white background. No clothes, no text, no animals, no dogs, no pencils.",
    note: "Classic plush brown teddy bear sitting upright with stitched muzzle",
  },
  {
    slot: 343,
    word: "dinosaur",
    displayName: "dinosaur",
    category: "Toy",
    framing: "object",
    hint: "A classic green Tyrannosaurus Rex dinosaur toy figurine in side 3/4 profile: standing on two strong hind legs with a long tapered balancing tail, small two-clawed forearms, textured olive green scales with a lighter cream belly, a ridged spine, and an open friendly jaw with clean white teeth. Bold iconic silhouette, bold clean black outlines, natural earthy green colors, pure white background. No background scenery, no trees, no text, no dogs, no pencils.",
    note: "Green bipedal T-Rex dinosaur figure with textured scales and long tail",
  },
  {
    slot: 344,
    word: "robot",
    displayName: "robot",
    category: "Toy",
    framing: "object",
    hint: "A retro-modern friendly toy robot standing upright in 3/4 perspective: boxy silver-gray metallic torso, square head with a playful spring antenna on top, glowing turquoise round circular eyes, a colorful analog dial gauge and buttons on its chest plate, segmented flexible arms ending in two-prong pincer hands, and sturdy square mechanical boots. Bold clean black outlines, metallic silver with bright cyan and yellow accents, pure white background. No text, no animals, no dogs, no pencils.",
    note: "Silver toy robot with spring antenna, glowing eyes, chest dial & pincers",
  },
  {
    slot: 345,
    word: "legos",
    displayName: "legos",
    category: "Toy",
    framing: "object",
    hint: "A crisp 3D isometric stack of classic interlocking plastic toy building bricks: a bright red 2x4 rectangular brick firmly snapped on top of a larger bright blue brick, with a smaller bright yellow 2x2 brick beside them, clearly displaying the iconic raised cylindrical circular studs on their top surfaces. Bold clean black outlines, clean glossy primary plastic colors, pure white background. No brand logos, no text, no animals, no dogs, no pencils.",
    note: "Interlocking red, blue, and yellow plastic building bricks with studs",
  },
  {
    slot: 346,
    word: "board_game",
    displayName: "board game",
    category: "Toy",
    framing: "object",
    hint: "A classic tabletop board game in 3/4 isometric perspective: a colorful square game board laid flat, featuring a winding path of distinct colored game spaces leading to a central star finish, with two classic wooden player pawns (one red meeple pawn, one blue meeple pawn) standing on the track, and a single white six-sided die with black pips resting on the board corner. Bold clean black outlines, vibrant board colors, pure white background. No text, no letters, no animals, no dogs, no pencils.",
    note: "Winding path game board with red & blue meeples and single die",
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
  console.log(`Starting Batch 34 generation (${BATCH34.length} words: Toys, Play, Media & Leisure)...`);

  for (let i = 0; i < BATCH34.length; i++) {
    const item = BATCH34[i];
    const out = `${BRAIN_DIR}/batch34_${item.word}.png`;
    if (existsSync(out) && !process.argv.includes("--force")) {
      console.log(`Slot #${item.slot} ("${item.displayName}") already exists at ${out}. Skipping.`);
      continue;
    }
    console.log(`\n[${i + 1}/${BATCH34.length}] Generating slot #${item.slot}: "${item.displayName}"...`);
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
  for (let i = 0; i < BATCH34.length; i++) {
    const item = BATCH34[i];
    const imgPath = `${BRAIN_DIR}/batch34_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch34_grid.png`);
  console.log("Saved batch34_grid.png");

  console.log("Building 48px clinical strip...");
  const stripW = BATCH34.length * 64 + 16;
  const stripH = 64;
  const stripComposites = [];
  for (let i = 0; i < BATCH34.length; i++) {
    const item = BATCH34[i];
    const imgPath = `${BRAIN_DIR}/batch34_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch34_strip_48.png`);
  console.log("Saved batch34_strip_48.png");

  console.log("Building lightweight batch34_review.html...");
  let cards = "";
  for (const item of BATCH34) {
    const imgPath = `${BRAIN_DIR}/batch34_${item.word}.png`;
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
  <title>Batch 34 Review: Toys, Play, Media & Leisure (Slots #337–#346)</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-900 antialiased p-4">
  <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm max-w-5xl mx-auto">
    <div class="mb-5 border-b border-slate-100 pb-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-extrabold text-slate-900 tracking-tight">Batch 34: Toys, Play, Media & Leisure</h1>
          <p class="text-xs text-slate-500 mt-1">10 Clipart Symbols · Slots #337–#346 · Natural Color Law · Lifespan Dignity</p>
        </div>
        <div class="flex gap-2">
          <span class="text-xs font-semibold px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-full">Toys & Play</span>
          <span class="text-xs font-semibold px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">10 New Tiles</span>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
      ${cards}
    </div>

    <div class="mt-6 pt-5 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Toy Category Invariants</h3>
        <ul class="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
          <li><strong>Toy Car (#340) & Toy Train (#341)</strong>: Explicitly rendered as toy models (diecast car & wooden train engine on track) to clearly distinguish them from real vehicles in Category 7.</li>
          <li><strong>Legos (#345) vs Blocks (#334)</strong>: Interlocking studded plastic bricks (red/blue/yellow) vs natural wooden blocks.</li>
          <li><strong>Action Figure (#337) vs Doll (#336)</strong>: Posable superhero with ball joints vs stitched soft cloth rag doll.</li>
        </ul>
      </div>
      <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Design Rules</h3>
        <ul class="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
          <li><strong>Lifespan Dignity</strong>: Universal toys (teddy bear, robot, board game, dinosaur) appealing across ages 3 to adult without babyish aesthetics.</li>
          <li><strong>Natural Color Law</strong>: Natural toy pigments, bold black outlines, pure white backgrounds.</li>
          <li><strong>Clinical Legibility</strong>: Crisp, bold silhouettes tested at 48×48px.</li>
        </ul>
      </div>
    </div>
  </div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch34_review.html`, html, "utf8");
  console.log("Saved batch34_review.html");
}

run().catch((err) => {
  console.error("Batch 34 execution failed:", err);
  process.exit(1);
});
