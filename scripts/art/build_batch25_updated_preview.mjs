import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const ITEMS = [
  { slot: 245, word: "share", file: "batch25_share.png", desc: "Offering half cookie with both hands" },
  { slot: 246, word: "clean up", file: "batch25_clean_up_centered.png", desc: "Placing red block into blue toy box (centered)" },
  { slot: 247, word: "wash", file: "batch25_wash.png", desc: "Washing hands with soap under faucet" },
  { slot: 248, word: "wipe", file: "batch25_wipe.png", desc: "Wiping table surface with yellow cloth" },
  { slot: 249, word: "cook", file: "batch25_cook_roll2.png", desc: "Stirring pot with spoon & holding handle (2 arms)" },
  { slot: 250, word: "build", file: "batch25_build.png", desc: "Yellow hard hat & hammer on wood frame" },
  { slot: 251, word: "fix", file: "batch25_fix.png", desc: "Tightening bolt on gear with wrench" },
  { slot: 252, word: "hold", file: "batch25_hold.png", desc: "Cradling brown teddy bear against chest" },
  { slot: 253, word: "touch", file: "batch25_touch_roll2.png", desc: "Gently touching floating soap bubble" },
  { slot: 254, word: "know", file: "batch25_know.png", desc: "Fingertip touching temple in ASL know sign" },
];

async function run() {
  console.log("Building finalized composite grid for Batch 25...");
  const cols = 5;
  const rows = 2;
  const tileSize = 300;
  const pad = 10;
  const gridW = cols * tileSize + (cols + 1) * pad;
  const gridH = rows * tileSize + (rows + 1) * pad;

  const composites = [];
  for (let i = 0; i < ITEMS.length; i++) {
    const item = ITEMS[i];
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = pad + c * (tileSize + pad);
    const y = pad + r * (tileSize + pad);
    const imgPath = `${BRAIN_DIR}/${item.file}`;
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
    .toFile(`${BRAIN_DIR}/batch25_grid.png`);

  console.log("Building finalized 48x48 preview strip...");
  const stripCell = 64;
  const stripW = ITEMS.length * stripCell;
  const stripH = stripCell;
  const stripComposites = [];

  for (let i = 0; i < ITEMS.length; i++) {
    const item = ITEMS[i];
    const imgPath = `${BRAIN_DIR}/${item.file}`;
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
    .toFile(`${BRAIN_DIR}/batch25_strip_48.png`);

  console.log("Building lightweight finalized gallery HTML...");
  let cards = "";
  for (const item of ITEMS) {
    const imgPath = `${BRAIN_DIR}/${item.file}`;
    const imgBuf = readFileSync(imgPath);
    const thumbBuf = await sharp(imgBuf)
      .resize(200, 200, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .webp({ quality: 75 })
      .toBuffer();
    const miniBuf = await sharp(imgBuf)
      .resize(48, 48, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .webp({ quality: 90 })
      .toBuffer();
    const b64 = thumbBuf.toString("base64");
    const miniB64 = miniBuf.toString("base64");

    cards += `
      <div class="border border-[var(--border)] bg-white rounded-xl p-3 flex flex-col items-center shadow-xs">
        <div class="w-full flex justify-between items-center mb-1.5">
          <span class="text-[11px] font-bold text-slate-400">#${item.slot}</span>
          <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">Pass</span>
        </div>
        <img src="data:image/webp;base64,${b64}" class="w-36 h-36 object-contain rounded border border-slate-100" alt="${item.word}" />
        <div class="mt-2 font-bold text-sm capitalize text-[var(--foreground)]">${item.word}</div>
        <div class="text-[11px] text-slate-500 text-center mt-0.5 line-clamp-2">${item.desc}</div>
        <div class="mt-2 pt-2 border-t border-slate-100 w-full flex items-center justify-center gap-2">
          <span class="text-[10px] text-slate-400 font-medium">48px:</span>
          <img src="data:image/webp;base64,${miniB64}" class="w-8 h-8 rounded border border-slate-200" alt="48px" />
        </div>
      </div>
    `;
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
</head>
<body class="bg-transparent text-[var(--foreground)] antialiased p-3">
  <div class="bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] rounded-xl p-4 shadow-sm max-w-4xl mx-auto">
    <div class="mb-4">
      <h2 class="text-[var(--foreground)] font-bold text-lg">Batch 25 (Finalized): Daily Living, Care & Cognitive Actions (Slots 245–254)</h2>
      <p class="text-[var(--muted-foreground)] text-xs mt-0.5">All 10 Passed Invariants · Clean Up Centered · Cook Re-rolled with 2 Arms</p>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
      ${cards}
    </div>
  </div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch25_review.html`, html, "utf8");
  console.log("All finalized previews created successfully!");
}

run().catch((err) => {
  console.error("Error creating previews:", err);
  process.exit(1);
});
