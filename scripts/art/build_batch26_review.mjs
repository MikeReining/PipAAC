import fs from "node:fs";
import sharp from "sharp";

const brainDir = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH26 = [
  { slot: 255, word: "remember", displayName: "remember", note: "Temple touch + backward arc arrow into past (Roll 2)" },
  { slot: 256, word: "forget", displayName: "forget", note: "Forehead wipe + outward arrow & ? in ASL (Roll 2)" },
  { slot: 257, word: "choose", displayName: "choose", note: "Pointing down selecting red ball vs blue block" },
  { slot: 258, word: "show", displayName: "show", note: "Holding up sun drawing with both hands" },
  { slot: 259, word: "ask", displayName: "ask", note: "Raising hand high with ?" },
  { slot: 260, word: "hug", displayName: "hug", note: "Two figures in warm tight embrace" },
  { slot: 261, word: "kiss", displayName: "kiss", note: "Blowing kiss from open palm with red heart" },
  { slot: 262, word: "laugh", displayName: "laugh", note: "Open-mouth belly laugh with curved eyes" },
  { slot: 263, word: "cry", displayName: "cry", note: "Streaming blue tears + wiping cheek" },
  { slot: 264, word: "sleep", displayName: "sleep", note: "Peacefully sleeping in bed under blue blanket (square)" },
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

  // Comparisons for remember and forget
  const rem1 = await getWebpB64(`${brainDir}/batch26_remember_roll1.png`, 140);
  const rem2 = await getWebpB64(`${brainDir}/batch26_remember.png`, 140);
  const for1 = await getWebpB64(`${brainDir}/batch26_forget_roll1.png`, 140);
  const for2 = await getWebpB64(`${brainDir}/batch26_forget.png`, 140);

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
</head>
<body class="bg-transparent text-[var(--foreground)] antialiased p-3">
  <div class="bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] rounded-xl p-4 shadow-sm max-w-4xl mx-auto">
    <div class="mb-4">
      <h2 class="text-[var(--foreground)] font-bold text-lg">Batch 26 (Review): Cognitive, Social & Emotional Actions (Slots 255–264)</h2>
      <p class="text-[var(--muted-foreground)] text-xs mt-0.5">All 10 Passed Invariants · Fitzgerald Green · Lifespan Dignity Law · ASL Clinical Cues</p>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
      ${cards}
    </div>

    <div class="mt-6 pt-4 border-t border-[var(--border)]">
      <h3 class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Re-roll Detail: Precision Clinical Upgrades</h3>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="p-3 bg-slate-50 rounded-lg border border-slate-200">
          <div class="text-xs font-bold text-slate-700 mb-2">#255 remember: Roll 1 vs Roll 2</div>
          <div class="flex gap-3 items-center">
            <div class="flex flex-col items-center">
              <img src="data:image/webp;base64,${rem1}" class="w-24 h-24 object-contain bg-white rounded border border-slate-200" />
              <span class="text-[10px] text-slate-500 mt-1">Roll 1 (S-curve at shoulder)</span>
            </div>
            <span class="text-slate-400 font-bold text-sm">→</span>
            <div class="flex flex-col items-center">
              <img src="data:image/webp;base64,${rem2}" class="w-24 h-24 object-contain bg-white rounded border border-emerald-400 ring-2 ring-emerald-100" />
              <span class="text-[10px] font-bold text-emerald-700 mt-1">Roll 2 (Clean arch to past)</span>
            </div>
          </div>
          <p class="text-[11px] text-slate-600 mt-2">Roll 2 cleanly detaches the recall arrow, arching smoothly up and backward into the past away from Pip's head.</p>
        </div>

        <div class="p-3 bg-slate-50 rounded-lg border border-slate-200">
          <div class="text-xs font-bold text-slate-700 mb-2">#256 forget: Roll 1 vs Roll 2</div>
          <div class="flex gap-3 items-center">
            <div class="flex flex-col items-center">
              <img src="data:image/webp;base64,${for1}" class="w-24 h-24 object-contain bg-white rounded border border-slate-200" />
              <span class="text-[10px] text-slate-500 mt-1">Roll 1 (Second arm sideways)</span>
            </div>
            <span class="text-slate-400 font-bold text-sm">→</span>
            <div class="flex flex-col items-center">
              <img src="data:image/webp;base64,${for2}" class="w-24 h-24 object-contain bg-white rounded border border-emerald-400 ring-2 ring-emerald-100" />
              <span class="text-[10px] font-bold text-emerald-700 mt-1">Roll 2 (Pure ASL sign + ?)</span>
            </div>
          </div>
          <p class="text-[11px] text-slate-600 mt-2">Roll 2 perfectly models the canonical ASL wipe: hand at brow, clean black outward arrow, natural arm at side, and ? overhead.</p>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

  fs.writeFileSync(`${brainDir}/batch26_review.html`, html, "utf8");
  console.log(`Saved batch26_review.html -> ${Math.round(Buffer.byteLength(html) / 1024)} KB`);
}

run().catch(console.error);
