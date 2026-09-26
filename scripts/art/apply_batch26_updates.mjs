import fs from "node:fs";
import sharp from "sharp";

const brainDir = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

async function getWebpB64(path, size) {
  const buf = fs.readFileSync(path);
  const thumb = await sharp(buf)
    .resize(size, size, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .webp({ quality: 75 })
    .toBuffer();
  return thumb.toString("base64");
}

async function run() {
  // Promote the 3 new assets to their final batch26 slots
  // Backup roll 1 of kiss and sleep
  if (!fs.existsSync(`${brainDir}/batch26_kiss_roll1.png`)) {
    fs.copyFileSync(`${brainDir}/batch26_kiss.png`, `${brainDir}/batch26_kiss_roll1.png`);
  }
  if (!fs.existsSync(`${brainDir}/batch26_sleep_roll1.png`)) {
    fs.copyFileSync(`${brainDir}/batch26_sleep.png`, `${brainDir}/batch26_sleep_roll1.png`);
  }
  if (!fs.existsSync(`${brainDir}/batch26_forget_unflipped.png`)) {
    fs.copyFileSync(`${brainDir}/batch26_forget.png`, `${brainDir}/batch26_forget_unflipped.png`);
  }

  // Copy updated files
  fs.copyFileSync(`${brainDir}/batch26_forget_flipped.png`, `${brainDir}/batch26_forget.png`);
  fs.copyFileSync(`${brainDir}/batch26_kiss_roll2.png`, `${brainDir}/batch26_kiss.png`);
  fs.copyFileSync(`${brainDir}/batch26_sleep_roll2.png`, `${brainDir}/batch26_sleep.png`);

  const BATCH26 = [
    { slot: 255, word: "remember", displayName: "remember", note: "Temple touch + backward arc arrow into past" },
    { slot: 256, word: "forget", displayName: "forget", note: "Forehead wipe + arrow into past (flipped) & ?" },
    { slot: 257, word: "choose", displayName: "choose", note: "Pointing down selecting red ball vs blue block" },
    { slot: 258, word: "show", displayName: "show", note: "Holding up sun drawing with both hands" },
    { slot: 259, word: "ask", displayName: "ask", note: "Raising hand high with ?" },
    { slot: 260, word: "hug", displayName: "hug", note: "Two figures in warm tight embrace" },
    { slot: 261, word: "kiss", displayName: "kiss", note: "Puckered 'o' mouth blowing heart with air dashes" },
    { slot: 262, word: "laugh", displayName: "laugh", note: "Open-mouth belly laugh with curved eyes" },
    { slot: 263, word: "cry", displayName: "cry", note: "Streaming blue tears + wiping cheek" },
    { slot: 264, word: "sleep", displayName: "sleep", note: "Head on fluffy pillow under blue blanket with Zzz" },
  ];

  let cards = "";
  for (const item of BATCH26) {
    const imgPath = `${brainDir}/batch26_${item.word}.png`;
    const b64Main = await getWebpB64(imgPath, 180);
    const b64Mini = await getWebpB64(imgPath, 48);

    cards += `
      <div class="border border-[var(--border)] bg-white rounded-xl p-3 flex flex-col items-center shadow-xs">
        <div class="w-full flex justify-between items-center mb-1.5">
          <span class="text-[11px] font-bold text-slate-400">#${item.slot}</span>
          <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">Pass</span>
        </div>
        <img src="data:image/webp;base64,${b64Main}" class="w-36 h-36 object-contain rounded border border-slate-100" alt="${item.displayName}" />
        <div class="mt-2 font-bold text-sm capitalize text-[var(--foreground)]">${item.displayName}</div>
        <div class="text-[11px] text-slate-500 text-center mt-0.5 line-clamp-2">${item.note}</div>
        <div class="mt-2 pt-2 border-t border-slate-100 w-full flex items-center justify-center gap-2">
          <span class="text-[10px] text-slate-400 font-medium">48px:</span>
          <img src="data:image/webp;base64,${b64Mini}" class="w-8 h-8 rounded border border-slate-200" alt="48px" />
        </div>
      </div>
    `;
  }

  // Comparisons for forget, kiss, and sleep
  const forBefore = await getWebpB64(`${brainDir}/batch26_forget_unflipped.png`, 140);
  const forAfter = await getWebpB64(`${brainDir}/batch26_forget.png`, 140);
  const forMiniBefore = await getWebpB64(`${brainDir}/batch26_forget_unflipped.png`, 48);
  const forMiniAfter = await getWebpB64(`${brainDir}/batch26_forget.png`, 48);

  const kissBefore = await getWebpB64(`${brainDir}/batch26_kiss_roll1.png`, 140);
  const kissAfter = await getWebpB64(`${brainDir}/batch26_kiss.png`, 140);
  const kissMiniBefore = await getWebpB64(`${brainDir}/batch26_kiss_roll1.png`, 48);
  const kissMiniAfter = await getWebpB64(`${brainDir}/batch26_kiss.png`, 48);

  const sleepBefore = await getWebpB64(`${brainDir}/batch26_sleep_roll1.png`, 140);
  const sleepAfter = await getWebpB64(`${brainDir}/batch26_sleep.png`, 140);
  const sleepMiniBefore = await getWebpB64(`${brainDir}/batch26_sleep_roll1.png`, 48);
  const sleepMiniAfter = await getWebpB64(`${brainDir}/batch26_sleep.png`, 48);

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
</head>
<body class="bg-transparent text-[var(--foreground)] antialiased p-3">
  <div class="bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] rounded-xl p-4 shadow-sm max-w-4xl mx-auto">
    <div class="mb-4">
      <h2 class="text-[var(--foreground)] font-bold text-lg">Batch 26 (Updated): Cognitive, Social & Emotional Actions (Slots 255–264)</h2>
      <p class="text-[var(--muted-foreground)] text-xs mt-0.5">Updated with Flipped Forget (Past Timeline), Puckered Kiss with Motion Air Trail, and Full-Scale Sleep (Pillow + Blanket + Zzz)</p>
    </div>

    <!-- 3 Targeted Updates Highlight Section -->
    <div class="mb-6 p-4 bg-emerald-50/50 rounded-xl border border-emerald-200">
      <h3 class="text-xs font-extrabold text-emerald-900 uppercase tracking-wider mb-3">Targeted Refinements (Before vs After)</h3>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        <!-- Forget -->
        <div class="p-3 bg-white rounded-lg border border-slate-200 shadow-xs flex flex-col items-center">
          <div class="text-xs font-bold text-slate-800 mb-2">#256 forget: Flipped to Past</div>
          <div class="flex items-center gap-2">
            <div class="flex flex-col items-center">
              <img src="data:image/webp;base64,${forBefore}" class="w-20 h-20 object-contain rounded border border-slate-200" />
              <div class="flex items-center gap-1 mt-1">
                <span class="text-[9px] text-slate-400">48px:</span>
                <img src="data:image/webp;base64,${forMiniBefore}" class="w-6 h-6 object-contain rounded border border-slate-200" />
              </div>
              <span class="text-[9px] text-slate-500 mt-0.5">Points Right (Future)</span>
            </div>
            <span class="text-emerald-500 font-bold text-base">→</span>
            <div class="flex flex-col items-center">
              <img src="data:image/webp;base64,${forAfter}" class="w-20 h-20 object-contain rounded border border-emerald-400 ring-2 ring-emerald-100" />
              <div class="flex items-center gap-1 mt-1">
                <span class="text-[9px] text-emerald-600 font-bold">48px:</span>
                <img src="data:image/webp;base64,${forMiniAfter}" class="w-6 h-6 object-contain rounded border border-emerald-300" />
              </div>
              <span class="text-[9px] font-bold text-emerald-700 mt-0.5">Points Left (Past)</span>
            </div>
          </div>
          <p class="text-[11px] text-slate-600 mt-2 text-center">Flipped toward past timeline with clean forward-facing question mark.</p>
        </div>

        <!-- Kiss -->
        <div class="p-3 bg-white rounded-lg border border-slate-200 shadow-xs flex flex-col items-center">
          <div class="text-xs font-bold text-slate-800 mb-2">#261 kiss: Puckered "O" Mouth</div>
          <div class="flex items-center gap-2">
            <div class="flex flex-col items-center">
              <img src="data:image/webp;base64,${kissBefore}" class="w-20 h-20 object-contain rounded border border-slate-200" />
              <div class="flex items-center gap-1 mt-1">
                <span class="text-[9px] text-slate-400">48px:</span>
                <img src="data:image/webp;base64,${kissMiniBefore}" class="w-6 h-6 object-contain rounded border border-slate-200" />
              </div>
              <span class="text-[9px] text-slate-500 mt-0.5">Static Smile</span>
            </div>
            <span class="text-emerald-500 font-bold text-base">→</span>
            <div class="flex flex-col items-center">
              <img src="data:image/webp;base64,${kissAfter}" class="w-20 h-20 object-contain rounded border border-emerald-400 ring-2 ring-emerald-100" />
              <div class="flex items-center gap-1 mt-1">
                <span class="text-[9px] text-emerald-600 font-bold">48px:</span>
                <img src="data:image/webp;base64,${kissMiniAfter}" class="w-6 h-6 object-contain rounded border border-emerald-300" />
              </div>
              <span class="text-[9px] font-bold text-emerald-700 mt-0.5">Puckered "O" + Air Trail</span>
            </div>
          </div>
          <p class="text-[11px] text-slate-600 mt-2 text-center">Distinct puckered blowing mouth with air puff dashes floating to red heart.</p>
        </div>

        <!-- Sleep -->
        <div class="p-3 bg-white rounded-lg border border-slate-200 shadow-xs flex flex-col items-center">
          <div class="text-xs font-bold text-slate-800 mb-2">#264 sleep: 50% Larger Silhouette</div>
          <div class="flex items-center gap-2">
            <div class="flex flex-col items-center">
              <img src="data:image/webp;base64,${sleepBefore}" class="w-20 h-20 object-contain rounded border border-slate-200" />
              <div class="flex items-center gap-1 mt-1">
                <span class="text-[9px] text-slate-400">48px:</span>
                <img src="data:image/webp;base64,${sleepMiniBefore}" class="w-6 h-6 object-contain rounded border border-slate-200" />
              </div>
              <span class="text-[9px] text-slate-500 mt-0.5">Letterboxed Wooden Bed</span>
            </div>
            <span class="text-emerald-500 font-bold text-base">→</span>
            <div class="flex flex-col items-center">
              <img src="data:image/webp;base64,${sleepAfter}" class="w-20 h-20 object-contain rounded border border-emerald-400 ring-2 ring-emerald-100" />
              <div class="flex items-center gap-1 mt-1">
                <span class="text-[9px] text-emerald-600 font-bold">48px:</span>
                <img src="data:image/webp;base64,${sleepMiniAfter}" class="w-6 h-6 object-contain rounded border border-emerald-300" />
              </div>
              <span class="text-[9px] font-bold text-emerald-700 mt-0.5">Large Pillow + Zzz</span>
            </div>
          </div>
          <p class="text-[11px] text-slate-600 mt-2 text-center">Bed frame eliminated; head and cozy blanket fill frame with floating Zzz.</p>
        </div>

      </div>
    </div>

    <!-- Complete 10 Tiles Grid -->
    <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
      ${cards}
    </div>
  </div>
</body>
</html>`;

  fs.writeFileSync(`${brainDir}/batch26_review.html`, html, "utf8");
  console.log(`Saved updated batch26_review.html -> ${Math.round(Buffer.byteLength(html) / 1024)} KB`);

  // Rebuild Composite Grid and 48px Strip
  const cols = 5;
  const rows = 2;
  const tileSize = 300;
  const pad = 10;
  const gridW = cols * tileSize + (cols + 1) * pad;
  const gridH = rows * tileSize + (rows + 1) * pad;

  const composites = [];
  for (let i = 0; i < BATCH26.length; i++) {
    const item = BATCH26[i];
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = pad + c * (tileSize + pad);
    const y = pad + r * (tileSize + pad);
    const imgPath = `${brainDir}/batch26_${item.word}.png`;
    const resized = await sharp(imgPath)
      .resize(tileSize, tileSize, { fit: "contain", background: { r: 255, g: 255, b: 255 } })
      .toBuffer();
    composites.push({ input: resized, top: y, left: x });
  }

  await sharp({
    create: { width: gridW, height: gridH, channels: 3, background: { r: 241, g: 245, b: 249 } }
  })
  .composite(composites)
  .png()
  .toFile(`${brainDir}/batch26_grid.png`);
  console.log("Updated batch26_grid.png");

  // Rebuild 48px Strip
  const stripCell = 64;
  const stripW = BATCH26.length * stripCell;
  const stripH = stripCell;
  const stripComposites = [];

  for (let i = 0; i < BATCH26.length; i++) {
    const item = BATCH26[i];
    const imgPath = `${brainDir}/batch26_${item.word}.png`;
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
    create: { width: stripW, height: stripH, channels: 3, background: { r: 248, g: 250, b: 252 } }
  })
  .composite(stripComposites)
  .png()
  .toFile(`${brainDir}/batch26_strip_48.png`);
  console.log("Updated batch26_strip_48.png");

  // Also create a 3-tile comparison strip image
  const compW = 3 * 300 + 4 * 10;
  const compH = 300 + 2 * 10;
  const compItems = [
    `${brainDir}/batch26_forget.png`,
    `${brainDir}/batch26_kiss.png`,
    `${brainDir}/batch26_sleep.png`,
  ];
  const compList = [];
  for (let i = 0; i < compItems.length; i++) {
    const res = await sharp(compItems[i]).resize(300, 300).toBuffer();
    compList.push({ input: res, top: 10, left: 10 + i * (300 + 10) });
  }
  await sharp({ create: { width: compW, height: compH, channels: 3, background: { r: 241, g: 245, b: 249 } } })
    .composite(compList)
    .png()
    .toFile(`${brainDir}/batch26_three_updates.png`);
  console.log("Saved batch26_three_updates.png");
}

run().catch(console.error);
