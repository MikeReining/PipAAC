import sharp from "sharp";
import { copyFileSync, readFileSync, writeFileSync, existsSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

// Save roll1 of bubbles
if (!existsSync(`${BRAIN_DIR}/batch34_bubbles_roll1.png`)) {
  copyFileSync(`${BRAIN_DIR}/batch34_bubbles.png`, `${BRAIN_DIR}/batch34_bubbles_roll1.png`);
}

// Fit bubbles_roll2 comfortably with 88% scale inside 1920x1920
const bubblesRoll2Buf = readFileSync(`${BRAIN_DIR}/batch34_bubbles_roll2.png`);
const polishedBubbles = await sharp(bubblesRoll2Buf)
  .resize(1690, 1690, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
  .extend({
    top: 115,
    bottom: 115,
    left: 115,
    right: 115,
    background: { r: 255, g: 255, b: 255, alpha: 1 },
  })
  .png()
  .toBuffer();
writeFileSync(`${BRAIN_DIR}/batch34_bubbles.png`, polishedBubbles);
console.log("Updated batch34_bubbles.png with perfectly enclosed roll2 and breathing room.");

// Check teddy bear: give stuffed animal 88% scale inside 1920x1920 so the ears have breathing room
const bearBuf = readFileSync(`${BRAIN_DIR}/batch34_stuffed_animal.png`);
const polishedBear = await sharp(bearBuf)
  .resize(1690, 1690, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
  .extend({
    top: 115,
    bottom: 115,
    left: 115,
    right: 115,
    background: { r: 255, g: 255, b: 255, alpha: 1 },
  })
  .png()
  .toBuffer();
writeFileSync(`${BRAIN_DIR}/batch34_stuffed_animal.png`, polishedBear);
console.log("Updated batch34_stuffed_animal.png with breathing room around ears.");

const BATCH34 = [
  { slot: 337, word: "action_figure", displayName: "action figure", category: "Toy", note: "Posable articulated action figure in hero pose with visible joints" },
  { slot: 338, word: "bubbles", displayName: "bubbles", category: "Toy", note: "Blue bubble wand with 5 floating iridescent soap bubbles" },
  { slot: 339, word: "play_dough", displayName: "play dough", category: "Toy", note: "Open yellow dough tub with red lid and swirl of blue modeling dough" },
  { slot: 340, word: "toy_car", displayName: "toy car", category: "Toy", note: "Red die-cast toy coupe car with black wheels and silver hubcaps" },
  { slot: 341, word: "toy_train", displayName: "toy train", category: "Toy", note: "Classic wooden toy train locomotive on wooden railway track" },
  { slot: 342, word: "stuffed_animal", displayName: "stuffed animal", category: "Toy", note: "Classic plush brown teddy bear sitting upright with stitched muzzle" },
  { slot: 343, word: "dinosaur", displayName: "dinosaur", category: "Toy", note: "Green bipedal T-Rex dinosaur figure with textured scales and long tail" },
  { slot: 344, word: "robot", displayName: "robot", category: "Toy", note: "Silver toy robot with spring antenna, glowing eyes, chest dial & pincers" },
  { slot: 345, word: "legos", displayName: "legos", category: "Toy", note: "Interlocking red, blue, and yellow plastic building bricks with studs" },
  { slot: 346, word: "board_game", displayName: "board game", category: "Toy", note: "Winding path game board with red & blue meeples and single die" },
];

console.log("\nRebuilding composite grid...");
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

console.log("Rebuilding 48px clinical strip...");
const stripW = BATCH34.length * 64 + 16;
const stripH = 64;
const stripComposites = [];
for (let i = 0; i < BATCH34.length; i++) {
  const item = BATCH34[i];
  const imgPath = `${BRAIN_DIR}/batch34_${item.word}.png`;
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

async function getWebpB64(path, size) {
  const buf = readFileSync(path);
  const thumb = await sharp(buf)
    .resize(size, size, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .webp({ quality: 75 })
    .toBuffer();
  return thumb.toString("base64");
}

let cards = "";
for (const item of BATCH34) {
  const imgPath = `${BRAIN_DIR}/batch34_${item.word}.png`;
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
          <li><strong>Action Figure (#337) vs Doll (#336)</strong>: Posable superhero with visible articulation ball joints vs stitched soft cloth rag doll.</li>
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
console.log("Saved updated batch34_review.html");
