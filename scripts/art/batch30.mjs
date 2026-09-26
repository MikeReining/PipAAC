import { generateToFile } from "./gen.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH30 = [
  {
    slot: 297,
    word: "home",
    displayName: "home",
    framing: "object",
    hint: "A cozy welcoming house with a pitched roof, front door, and a glowing warm golden yellow window. Centered prominently on the front facade of the house is a bright vibrant red heart emblem symbolizing warmth, love, and family. Rich warm colors, bold black outlines, pure white background.",
    note: "Cozy warm house with glowing window and red heart emblem",
  },
  {
    slot: 298,
    word: "house",
    displayName: "house",
    framing: "object",
    hint: "A clean architectural black and white line drawing of a residential house with a pitched gable roof, chimney, front door with doorknob, and two square multi-pane windows. Completely black and white monochrome line art with crisp black outlines and white fill, zero color. Pure white background.",
    note: "Monochrome black and white architectural line structure",
  },
  {
    slot: 299,
    word: "bedroom",
    displayName: "bedroom",
    framing: "object",
    hint: "An inviting bedroom scene in 3/4 perspective: a comfortable wooden bed with a headboard, a soft white pillow, and a neatly folded blanket, flanked by a small wooden nightstand with a warm glowing bedside lamp. Bold clean black outlines, warm colors, pure white background.",
    note: "Bed with headboard, pillow, blanket, and nightstand lamp",
  },
  {
    slot: 300,
    word: "living_room",
    displayName: "living room",
    framing: "object",
    hint: "A comfortable living room scene in 3/4 perspective: a cozy cushioned two-seater sofa couch, a low wooden coffee table in front, and a tall floor lamp standing beside the couch. Bold clean black outlines, warm colors, pure white background.",
    note: "Cushioned sofa couch with coffee table and floor lamp",
  },
  {
    slot: 301,
    word: "kitchen",
    displayName: "kitchen",
    framing: "object",
    hint: "A clean modern kitchen scene: a tall refrigerator on one side, adjacent to a kitchen counter with a cooking stove and oven burners, and a tea kettle on top. Bold clean black outlines, warm colors, pure white background.",
    note: "Kitchen counter with tall refrigerator and cooking stove",
  },
  {
    slot: 302,
    word: "basement",
    displayName: "basement",
    framing: "object",
    hint: "An architectural cutaway view of a house basement: a flight of wooden stairs leading downward into a lower underground room with concrete foundation walls and a small high horizontal basement hopper window near the ceiling. Bold clean black outlines, pure white background.",
    note: "Downward stairs leading to lower level with high hopper window",
  },
  {
    slot: 303,
    word: "stairs",
    displayName: "stairs",
    framing: "object",
    hint: "A standalone 3/4 perspective flight of clean wooden stairs with 4 to 5 steps and an angled handrail banister running along the side. Bold clean black outlines, warm wood tones, pure white background.",
    note: "Flight of wooden steps with handrail banister",
  },
  {
    slot: 304,
    word: "yard",
    displayName: "yard",
    framing: "object",
    hint: "A domestic residential yard: a lush green grass lawn enclosed by a clean white picket fence section, with a small leafy green shade tree and gentle sunshine. Bold clean black outlines, vibrant green colors, pure white background.",
    note: "Lush green lawn with white picket fence and small tree",
  },
  {
    slot: 305,
    word: "school",
    displayName: "school",
    framing: "object",
    hint: "A classic civic schoolhouse building exterior: warm red brick facade, double front entrance doors, symmetrical multi-pane windows, and a pitched roof crowned by a bell tower with a clock and a flagpole. Bold clean black outlines, warm red brick colors, pure white background.",
    note: "Red brick schoolhouse with rooftop bell/clock tower and flagpole",
  },
  {
    slot: 306,
    word: "classroom",
    displayName: "classroom",
    framing: "object",
    hint: "An interior classroom scene: a student wooden desk facing forward with an open notebook, in front of a large wall-mounted dark green chalkboard with a wooden frame and simple chalk drawings of basic geometric shapes. Bold clean black outlines, pure white background.",
    note: "Student wooden desk in front of green chalkboard",
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
  console.log(`Starting Batch 30 generation (${BATCH30.length} words: Places, Rooms & Community: Home & School Environments)...`);

  for (let i = 0; i < BATCH30.length; i++) {
    const item = BATCH30[i];
    const out = `${BRAIN_DIR}/batch30_${item.word}.png`;
    if (existsSync(out) && !process.argv.includes("--force")) {
      console.log(`Slot #${item.slot} ("${item.displayName}") already exists at ${out}. Skipping.`);
      continue;
    }
    console.log(`\n[${i + 1}/${BATCH30.length}] Generating slot #${item.slot}: "${item.displayName}"...`);
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
  for (let i = 0; i < BATCH30.length; i++) {
    const item = BATCH30[i];
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = pad + c * (tileSize + pad);
    const y = pad + r * (tileSize + pad);
    const imgPath = `${BRAIN_DIR}/batch30_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch30_grid.png`);
  console.log("Saved batch30_grid.png");

  console.log("Building 48x48 preview strip...");
  const stripCols = BATCH30.length;
  const stripCell = 64;
  const stripW = stripCols * stripCell;
  const stripH = stripCell;
  const stripComposites = [];

  for (let i = 0; i < BATCH30.length; i++) {
    const item = BATCH30[i];
    const imgPath = `${BRAIN_DIR}/batch30_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch30_strip_48.png`);
  console.log("Saved batch30_strip_48.png");

  console.log("Building lightweight batch30_review.html...");
  let cards = "";
  for (const item of BATCH30) {
    const imgPath = `${BRAIN_DIR}/batch30_${item.word}.png`;
    if (!existsSync(imgPath)) continue;
    const b64Main = await getWebpB64(imgPath, 180);
    const b64Mini = await getWebpB64(imgPath, 48);

    cards += `
      <div class="border border-slate-200 bg-white rounded-xl p-3 flex flex-col items-center shadow-xs hover:shadow-md transition">
        <div class="w-full flex justify-between items-center mb-1.5">
          <span class="text-[11px] font-bold text-slate-400">#${item.slot}</span>
          <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">Place (Yellow)</span>
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
  <title>Batch 30 Review: Places, Rooms & Community (Home & School)</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-900 antialiased p-4">
  <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm max-w-5xl mx-auto">
    <div class="mb-5 border-b border-slate-100 pb-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-extrabold text-slate-900 tracking-tight">Batch 30: Places, Rooms & Community</h1>
          <p class="text-xs text-slate-500 mt-1">10 Clipart Symbols · Home & School Environments · Slots #297–#306 · Yellow Fitzgerald Nouns</p>
        </div>
        <div class="flex gap-2">
          <span class="text-xs font-semibold px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full">Places & Rooms</span>
          <span class="text-xs font-semibold px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full">B&W House vs Color Home</span>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
      ${cards}
    </div>

    <div class="mt-6 pt-5 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Home vs House Disambiguation</h3>
        <ul class="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
          <li><strong>Home (#297)</strong>: Full warm color, glowing golden window, and prominent red heart emblem ("where the heart is / emotional sanctuary").</li>
          <li><strong>House (#298)</strong>: Pure architectural monochrome black & white line drawing (pitched roof, chimney, windows, door, zero color).</li>
        </ul>
      </div>

      <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Room & Civic Landmarks</h3>
        <ul class="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
          <li><strong>Basement (#302)</strong>: Cutaway descending stairs into lower subterranean room with high hopper window.</li>
          <li><strong>School (#305) vs Classroom (#306)</strong>: Schoolhouse exterior with bell/clock tower vs interior student desk + green chalkboard.</li>
          <li><strong>Yard (#304)</strong>: White picket fence + green lawn establishes domestic outdoor space vs public parks.</li>
        </ul>
      </div>
    </div>
  </div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch30_review.html`, html, "utf8");
  const sizeKB = Math.round(Buffer.byteLength(html) / 1024);
  console.log(`Saved batch30_review.html -> ${sizeKB} KB (lightweight Tailwind)`);

  try {
    execSync(`open "${BRAIN_DIR}/batch30_review.html"`);
    console.log("Opened batch30_review.html in browser");
  } catch (err) {
    console.error("Could not run open command:", err);
  }
}

run().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
