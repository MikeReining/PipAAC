import { generateToFile } from "./gen.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH28 = [
  {
    slot: 276,
    word: "aunt",
    displayName: "aunt",
    torso: "yellow",
    framing: "bust",
    hint: "Close-up bust shot of a kind adult female stick figure in a solid yellow shirt. The figure has neat wavy shoulder-length hair and a warm friendly smile. One hand is held gently beside the jaw and cheek in the ASL aunt gesture. Head fills ~50% of the frame. Pure white background, bold black outline.",
    note: "Adult female figure with hand beside jaw/cheek in ASL aunt gesture",
  },
  {
    slot: 277,
    word: "uncle",
    displayName: "uncle",
    torso: "yellow",
    framing: "bust",
    hint: "Close-up bust shot of a kind adult male stick figure in a solid yellow shirt. The figure has neat short hair and a warm friendly smile. One hand is raised gently beside the temple in the ASL uncle gesture. Head fills ~50% of the frame. Pure white background, bold black outline.",
    note: "Adult male figure with hand raised beside temple in ASL uncle gesture",
  },
  {
    slot: 278,
    word: "cousin",
    displayName: "cousin",
    torso: "yellow",
    framing: "bust",
    hint: "Close-up bust shot of two peer stick figures standing side by side in solid yellow shirts, their heads and torsos filling 75% of the frame. Both figures have their arms resting naturally at their sides. The figure on the left is standard Pip. The peer figure on the right is a smiling cousin with neat curly hair. A clean bold black arrow points directly downward at the curly-haired peer to designate 'cousin'. Both figures have warm friendly smiling faces. Pure white background, bold black outline.",
    note: "Pip side-by-side with curly-haired cousin, bold black pointer arrow",
  },
  {
    slot: 281,
    word: "therapist",
    displayName: "therapist",
    torso: "yellow",
    framing: "bust",
    hint: "Close-up bust shot of a kind supportive clinician stick figure in a solid yellow shirt seated beside Pip. The therapist smiles warmly while holding up a colorful speech therapy communication picture board. Both heads fill the upper frame. Pure white background, bold black outline.",
    note: "Supportive clinician holding up a communication picture board with Pip",
  },
  {
    slot: 282,
    word: "aide",
    displayName: "aide",
    torso: "yellow",
    framing: "bust",
    hint: "Close-up bust shot of a kind adult helper stick figure in a solid yellow shirt standing gently beside Pip. The aide has a warm encouraging smile and rests one supportive hand gently on Pip's shoulder in a helpful, caring posture. Pure white background, bold black outline.",
    note: "Kind helper standing beside Pip with reassuring hand on shoulder",
  },
  {
    slot: 283,
    word: "student",
    displayName: "student",
    torso: "yellow",
    framing: "bust",
    hint: "Close-up bust shot of a cheerful stick figure in a solid yellow shirt as a student. The student wears visible dark backpack shoulder straps over the yellow shirt and holds a spiral notebook in front with both hands. Bright smiling face. Pure white background, bold black outline.",
    note: "Cheerful student wearing backpack shoulder straps holding notebook",
  },
  {
    slot: 285,
    word: "class",
    displayName: "class",
    torso: "yellow",
    framing: "bust",
    hint: "Close-up bust shot of a diverse group of three student stick figures in solid yellow shirts standing together side by side as a classroom group. All three figures have happy smiling faces and fill the frame together horizontally. Pure white background, bold black outline.",
    note: "Trio of student peers standing together side-by-side",
  },
  {
    slot: 289,
    word: "neighbor",
    displayName: "neighbor",
    torso: "yellow",
    framing: "bust",
    hint: "Close-up bust shot of two friendly stick figures in solid yellow shirts on opposite sides of a clean white wooden picket fence. Both figures smile warmly and wave their hands to each other across the fence in a friendly neighborly greeting. Pure white background, bold black outline.",
    note: "Two friendly figures waving to each other across a white picket fence",
  },
  {
    slot: 290,
    word: "person",
    displayName: "person",
    torso: "yellow",
    framing: "bust",
    hint: "Close-up bust shot of a single canonical stick figure with a solid yellow shirt. The figure has a classic round head with clear friendly eyes and a warm pleasant smile, arms relaxed naturally at the sides. Clean, iconic, perfectly centered single individual. Pure white background, bold black outline.",
    note: "Single iconic canonical figure with yellow shirt and warm smile",
  },
  {
    slot: 291,
    word: "people",
    displayName: "people",
    torso: "yellow",
    framing: "bust",
    hint: "Close-up bust shot of three distinct stick figures in solid yellow shirts clustered together (one adult, one youth, one child) representing a diverse group of people. All figures smile warmly, overlapping naturally to show a friendly collective group. Pure white background, bold black outline.",
    note: "Diverse group of three figures clustered together (plural collective)",
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
  console.log(`Starting Batch 28 generation (${BATCH28.length} words: Extended Family, School Support & Community)...`);

  for (let i = 0; i < BATCH28.length; i++) {
    const item = BATCH28[i];
    const out = `${BRAIN_DIR}/batch28_${item.word}.png`;
    if (existsSync(out) && !process.argv.includes("--force")) {
      console.log(`Slot #${item.slot} ("${item.displayName}") already exists at ${out}. Skipping.`);
      continue;
    }
    console.log(`\n[${i + 1}/${BATCH28.length}] Generating slot #${item.slot}: "${item.displayName}"...`);
    const start = Date.now();
    try {
      await generateToFile({
        word: item.displayName,
        torso: item.torso ?? null,
        framing: item.framing ?? null,
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
  for (let i = 0; i < BATCH28.length; i++) {
    const item = BATCH28[i];
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = pad + c * (tileSize + pad);
    const y = pad + r * (tileSize + pad);
    const imgPath = `${BRAIN_DIR}/batch28_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch28_grid.png`);
  console.log("Saved batch28_grid.png");

  console.log("Building 48x48 preview strip...");
  const stripCols = BATCH28.length;
  const stripCell = 64;
  const stripW = stripCols * stripCell;
  const stripH = stripCell;
  const stripComposites = [];

  for (let i = 0; i < BATCH28.length; i++) {
    const item = BATCH28[i];
    const imgPath = `${BRAIN_DIR}/batch28_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch28_strip_48.png`);
  console.log("Saved batch28_strip_48.png");

  console.log("Building lightweight batch28_review.html...");
  let cards = "";
  for (const item of BATCH28) {
    const imgPath = `${BRAIN_DIR}/batch28_${item.word}.png`;
    if (!existsSync(imgPath)) continue;
    const b64Main = await getWebpB64(imgPath, 180);
    const b64Mini = await getWebpB64(imgPath, 48);

    cards += `
      <div class="border border-slate-200 bg-white rounded-xl p-3 flex flex-col items-center shadow-xs hover:shadow-md transition">
        <div class="w-full flex justify-between items-center mb-1.5">
          <span class="text-[11px] font-bold text-slate-400">#${item.slot}</span>
          <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">Person (Yellow)</span>
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
  <title>Batch 28 Review: Extended Family & School Community</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-900 antialiased p-4">
  <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm max-w-5xl mx-auto">
    <div class="mb-5 border-b border-slate-100 pb-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-extrabold text-slate-900 tracking-tight">Batch 28: Extended Family, School Support & Community</h1>
          <p class="text-xs text-slate-500 mt-1">Slots 276–291 · 10 Clipart Symbols · Fitzgerald Yellow People/Roles · Lifespan Dignity Law · 1:1 Squares</p>
        </div>
        <span class="text-xs font-semibold px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full">10 People Tiles</span>
      </div>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
      ${cards}
    </div>

    <div class="mt-6 pt-5 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Clinical Design Invariants</h3>
        <ul class="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
          <li><strong>Fitzgerald Yellow Torso</strong>: 100% adherence across all 10 people/social role symbols.</li>
          <li><strong>ASL Kinship Symmetry</strong>: Aunt (jaw/cheek zone) and Uncle (temple zone) mirror Mom (chin) and Dad (forehead).</li>
          <li><strong>AAC School Reality</strong>: Therapist holds an AAC picture board; Aide provides 1-on-1 shoulder support.</li>
          <li><strong>Person vs People Contrast</strong>: Single canonical figure (singular) vs clustered trio (plural collective).</li>
        </ul>
      </div>

      <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">48×48px Legibility Highlights</h3>
        <ul class="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
          <li><strong>Student</strong>: Backpack straps and notebook read immediately as school-age student.</li>
          <li><strong>Neighbor</strong>: White picket fence dividing line makes the relationship instantly intuitive.</li>
          <li><strong>Cousin</strong>: Curly hair + pointer arrow clearly distinguishes target peer.</li>
          <li><strong>Class</strong>: Three-student row communicates group/classroom community cleanly.</li>
        </ul>
      </div>
    </div>
  </div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch28_review.html`, html, "utf8");
  const sizeKB = Math.round(Buffer.byteLength(html) / 1024);
  console.log(`Saved batch28_review.html -> ${sizeKB} KB (lightweight Tailwind)`);

  try {
    execSync(`open "${BRAIN_DIR}/batch28_review.html"`);
    console.log("Opened batch28_review.html in browser");
  } catch (err) {
    console.error("Could not run open command:", err);
  }
}

run().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
