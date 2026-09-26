import fs from "node:fs";
import sharp from "sharp";

const brainDir = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH27 = [
  { slot: 265, word: "wake_up", displayName: "wake up", color: "green", note: "Sitting upright in bed stretching arms upward, morning sunbeams" },
  { slot: 266, word: "family", displayName: "family", color: "yellow", note: "Loving trio: two adults embracing with child centered in front" },
  { slot: 271, word: "baby", displayName: "baby", color: "yellow", note: "Seated infant in yellow onesie holding a rattle" },
  { slot: 272, word: "brother", displayName: "brother", color: "yellow", note: "Pip side-by-side with spiky-haired boy (he), arrow pointing to brother" },
  { slot: 273, word: "sister", displayName: "sister", color: "yellow", note: "Pip side-by-side with ponytail girl (she), arrow pointing to sister" },
  { slot: 274, word: "grandma", displayName: "grandma", color: "yellow", note: "Dignified elder with round wire spectacles and neat silver hair bun" },
  { slot: 275, word: "grandpa", displayName: "grandpa", color: "yellow", note: "Dignified elder with round spectacles, silver beard, and cane handle" },
  { slot: 279, word: "pet", displayName: "pet", color: "yellow", note: "Pip gently stroking the head of a happy companion dog" },
  { slot: 280, word: "teacher", displayName: "teacher", color: "yellow", note: "Standing beside classroom chalkboard with ABC, holding pointer" },
  { slot: 284, word: "friend", displayName: "friend", color: "yellow", note: "Two equal-height peer figures in yellow shirts giving a high-five" },
];

async function getWebpB64(path, size) {
  const buf = fs.readFileSync(path);
  const thumb = await sharp(buf)
    .resize(size, size, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .webp({ quality: 75 })
    .toBuffer();
  return thumb.toString("base64");
}

async function run() {
  console.log("Generating review assets for Batch 27...");

  // 1. Build composite grid
  const cols = 5;
  const rows = 2;
  const tileSize = 300;
  const pad = 10;
  const gridW = cols * tileSize + (cols + 1) * pad;
  const gridH = rows * tileSize + (rows + 1) * pad;

  const composites = [];
  for (let i = 0; i < BATCH27.length; i++) {
    const item = BATCH27[i];
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = pad + c * (tileSize + pad);
    const y = pad + r * (tileSize + pad);
    const imgPath = `${brainDir}/batch27_${item.word}.png`;
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
    .toFile(`${brainDir}/batch27_grid.png`);

  console.log("Updated batch27_grid.png");

  // 2. Build 48px preview strip
  const stripCols = BATCH27.length;
  const stripCell = 64;
  const stripW = stripCols * stripCell;
  const stripH = stripCell;
  const stripComposites = [];

  for (let i = 0; i < BATCH27.length; i++) {
    const item = BATCH27[i];
    const imgPath = `${brainDir}/batch27_${item.word}.png`;
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
    .toFile(`${brainDir}/batch27_strip_48.png`);

  console.log("Updated batch27_strip_48.png");

  // 3. Build HTML review
  let cards = "";
  for (const item of BATCH27) {
    const imgPath = `${brainDir}/batch27_${item.word}.png`;
    const b64Main = await getWebpB64(imgPath, 180);
    const b64Mini = await getWebpB64(imgPath, 48);
    const colorBadge = item.color === "green" 
      ? `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">Action (Green)</span>`
      : `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">Person (Yellow)</span>`;

    cards += `
      <div class="border border-slate-200 bg-white rounded-xl p-3 flex flex-col items-center shadow-xs hover:shadow-md transition">
        <div class="w-full flex justify-between items-center mb-1.5">
          <span class="text-[11px] font-bold text-slate-400">#${item.slot}</span>
          ${colorBadge}
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
  <title>Batch 27 Review: Awakening & Family Roles</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-900 antialiased p-4">
  <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm max-w-5xl mx-auto">
    <div class="mb-5 border-b border-slate-100 pb-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-extrabold text-slate-900 tracking-tight">Batch 27: Awakening & Family Roles (Slots 265–284)</h1>
          <p class="text-xs text-slate-500 mt-1">10 Clipart Symbols · Fitzgerald Yellow (People) + Green (Wake up) · Lifespan Dignity Law · 1:1 Square Canvases</p>
        </div>
        <div class="flex gap-2">
          <span class="text-xs font-semibold px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">10 Images Ready</span>
          <span class="text-xs font-semibold px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full">mama & dada aliased</span>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
      ${cards}
    </div>

    <div class="mt-6 pt-5 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Design Invariant Alignment</h3>
        <ul class="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
          <li><strong>Fitzgerald Yellow Torso</strong>: Applied across all people/family roles (slots 266–284).</li>
          <li><strong>Fitzgerald Green Torso</strong>: Applied to action verb <code>wake up</code> (#265).</li>
          <li><strong>Lifespan Dignity Law</strong>: Grandma and Grandpa avoid caricature; feature dignified wire spectacles, clean silver hair/beard, and walking cane.</li>
          <li><strong>Direct Kinship Continuity</strong>: Brother and Sister reuse the distinct hairstyles from <code>he</code> and <code>she</code> with clear directional arrows.</li>
          <li><strong>Zero Cost Aliasing</strong>: <code>mama</code> (#269) and <code>dada</code> (#270) alias directly to <code>mom.png</code> and <code>dad.png</code>.</li>
        </ul>
      </div>

      <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Clinical Legibility Check (48×48px)</h3>
        <ul class="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
          <li><strong>Wake up</strong>: Arms stretching upward and sunbeams pop sharply at 48px.</li>
          <li><strong>Family</strong>: Distinct 3-figure silhouette (parents + child) clearly legible.</li>
          <li><strong>Brother / Sister</strong>: Black pointers clearly indicate the target figure.</li>
          <li><strong>Grandma / Grandpa</strong>: Bun and spectacles / cane and beard instantly recognizable.</li>
          <li><strong>Friend / Pet / Teacher</strong>: High-five contact point, dog pet contact, and chalkboard ABC read instantly.</li>
        </ul>
      </div>
    </div>
  </div>
</body>
</html>`;

  fs.writeFileSync(`${brainDir}/batch27_review.html`, html, "utf8");
  const sizeKB = Math.round(Buffer.byteLength(html) / 1024);
  console.log(`Saved batch27_review.html -> ${sizeKB} KB (lightweight Tailwind)`);
}

run().catch(console.error);
