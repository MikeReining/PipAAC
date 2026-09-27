import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

// Polish music (roll2: beamed eighth notes) to 1500x1500 centered in 1920x1920
const musicBuf = readFileSync(`${BRAIN_DIR}/batch35_music_roll2.png`);
const polishedMusic = await sharp(musicBuf)
  .resize(1500, 1500, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
  .extend({
    top: 210,
    bottom: 210,
    left: 210,
    right: 210,
    background: { r: 255, g: 255, b: 255, alpha: 1 },
  })
  .png()
  .toBuffer();
writeFileSync(`${BRAIN_DIR}/batch35_music.png`, polishedMusic);
console.log("Updated batch35_music.png to clean beamed eighth notes with breathing room.");

// Polish song (roll2: headphones with music notes) to 1600x1600 centered in 1920x1920
const songBuf = readFileSync(`${BRAIN_DIR}/batch35_song_roll2.png`);
const polishedSong = await sharp(songBuf)
  .resize(1600, 1600, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
  .extend({
    top: 160,
    bottom: 160,
    left: 160,
    right: 160,
    background: { r: 255, g: 255, b: 255, alpha: 1 },
  })
  .png()
  .toBuffer();
writeFileSync(`${BRAIN_DIR}/batch35_song.png`, polishedSong);
console.log("Updated batch35_song.png to headphones with music notes with breathing room.");

const BATCH35 = [
  { slot: 347, word: "swing_set", displayName: "swing set", category: "Toy", note: "Backyard A-frame swing set with two empty sling swings on chains" },
  { slot: 348, word: "sandbox", displayName: "sandbox", category: "Toy", note: "Square wooden sandbox with golden sand, red pail, yellow shovel & sandcastle" },
  { slot: 349, word: "bike", displayName: "bike", category: "Toy", note: "Classic blue cruiser bicycle in side profile with spoked wheels" },
  { slot: 350, word: "scooter", displayName: "scooter", category: "Toy", note: "Teal and silver two-wheel kick scooter with T-bar handlebars" },
  { slot: 351, word: "skateboard", displayName: "skateboard", category: "Toy", note: "Classic skateboard deck in 3/4 view showing grip tape and wheels" },
  { slot: 352, word: "wagon", displayName: "wagon", category: "Toy", note: "Classic red metal toy pull wagon with 4 wheels and front pull handle" },
  { slot: 353, word: "chalk", displayName: "chalk", category: "Toy", note: "Single blue sidewalk chalk stick with clean line drawn on concrete slab" },
  { slot: 354, word: "jump_rope", displayName: "jump rope", category: "Toy", note: "Jump rope with smooth wooden handles and looping red braided cord" },
  { slot: 355, word: "music", displayName: "music", category: "Toy", note: "Pure universal symbol: bold beamed musical eighth notes" },
  { slot: 356, word: "song", displayName: "song", category: "Toy", note: "Over-ear headphones with musical notes floating in center" },
];

console.log("\nRebuilding composite grid...");
const cols = 5;
const rows = 2;
const tileSize = 300;
const pad = 10;
const gridW = cols * tileSize + (cols + 1) * pad;
const gridH = rows * tileSize + (rows + 1) * pad;

const composites = [];
for (let i = 0; i < BATCH35.length; i++) {
  const item = BATCH35[i];
  const imgPath = `${BRAIN_DIR}/batch35_${item.word}.png`;
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
  .toFile(`${BRAIN_DIR}/batch35_grid.png`);
console.log("Saved batch35_grid.png");

console.log("Rebuilding 48px clinical strip...");
const stripW = BATCH35.length * 64 + 16;
const stripH = 64;
const stripComposites = [];
for (let i = 0; i < BATCH35.length; i++) {
  const item = BATCH35[i];
  const imgPath = `${BRAIN_DIR}/batch35_${item.word}.png`;
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
  .toFile(`${BRAIN_DIR}/batch35_strip_48.png`);
console.log("Saved batch35_strip_48.png");

async function getWebpB64(path, size) {
  const buf = readFileSync(path);
  const thumb = await sharp(buf)
    .resize(size, size, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .webp({ quality: 75 })
    .toBuffer();
  return thumb.toString("base64");
}

let cards = "";
for (const item of BATCH35) {
  const imgPath = `${BRAIN_DIR}/batch35_${item.word}.png`;
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
  <title>Batch 35 Review: Outdoor Play, Movement & Music (Slots #347–#356)</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-900 antialiased p-4">
  <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm max-w-5xl mx-auto">
    <div class="mb-5 border-b border-slate-100 pb-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-extrabold text-slate-900 tracking-tight">Batch 35: Outdoor Play, Movement & Music</h1>
          <p class="text-xs text-slate-500 mt-1">10 Clipart Symbols · Slots #347–#356 · Natural Color Law · Lifespan Dignity</p>
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
        <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Category Invariants & Disambiguation</h3>
        <ul class="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
          <li><strong>Music (#355) vs Song (#356)</strong>: Pure musical notes (beamed eighth notes) for music vs over-ear headphones with musical notes for song (listening to a track).</li>
          <li><strong>Chalk (#353)</strong>: Restrained single sky-blue chalk stick drawing a clean line on a gray concrete slab (anti-circus, max 2 colors).</li>
          <li><strong>Swing Set (#347) vs Swing (#229)</strong>: Empty A-frame equipment (noun) vs person swinging (action verb).</li>
        </ul>
      </div>
      <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Design Rules</h3>
        <ul class="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
          <li><strong>Lifespan Dignity</strong>: Cruiser bike, skateboard, and headphones are mature and dignified for ages 6 through adult.</li>
          <li><strong>Natural Color Law</strong>: Real-world colors, rich materials (wood, steel, rubber), bold black outlines, pure white backgrounds.</li>
          <li><strong>Clinical Legibility</strong>: Bold silhouettes tested at 48×48px.</li>
        </ul>
      </div>
    </div>
  </div>
</body>
</html>`;

writeFileSync(`${BRAIN_DIR}/batch35_review.html`, html, "utf8");
console.log("Saved updated batch35_review.html");
