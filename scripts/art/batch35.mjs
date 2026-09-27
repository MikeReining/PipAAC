import { generateToFile } from "./gen.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH35 = [
  {
    slot: 347,
    word: "swing_set",
    displayName: "swing set",
    category: "Toy",
    framing: "object",
    hint: "A classic backyard outdoor swing set in 3/4 perspective: sturdy dark green A-frame metal legs supporting a horizontal top beam, with two empty sling swings suspended by straight steel chains hanging side by side. Clean apparatus silhouette, bold clean black outlines, natural colors, pure white background. Standalone empty playground equipment, no children, no people, no animals, no dogs, no pencils.",
    note: "Backyard A-frame swing set with two empty sling swings on chains",
  },
  {
    slot: 348,
    word: "sandbox",
    displayName: "sandbox",
    category: "Toy",
    framing: "object",
    hint: "A clean square wooden sandbox in 3/4 isometric perspective: cedar wood border frame filled with golden play sand, featuring a bright red plastic sand bucket pail and a yellow plastic sand shovel resting in the sand beside a small molded sandcastle mound. Bold clean black outlines, natural wood and sand tones with bright toy accents, pure white background. No children, no animals, no dogs, no pencils.",
    note: "Square wooden sandbox with golden sand, red pail, yellow shovel & sandcastle",
  },
  {
    slot: 349,
    word: "bike",
    displayName: "bike",
    category: "Toy",
    framing: "object",
    hint: "A classic adult-proportioned cruiser bicycle in side profile facing right: vibrant royal blue metal diamond frame, two spoked rubber wheels with black tires, upright handlebars with rubber grips, black padded saddle seat, pedals, chain guard, and kickstand. Bold clean black outlines, saturated blue frame color, pure white background. Standalone bicycle, no rider, no background scenery, no animals, no dogs, no pencils.",
    note: "Classic blue cruiser bicycle in side profile with spoked wheels",
  },
  {
    slot: 350,
    word: "scooter",
    displayName: "scooter",
    category: "Toy",
    framing: "object",
    hint: "A modern two-wheel kick scooter in side 3/4 profile: sleek aluminum and bright teal frame, upright T-bar handlebars with black rubber handgrips, narrow low foot deck with black grip tape, two small polyurethane wheels, and a rear foot brake fender. Bold clean black outlines, teal and metallic silver colors, pure white background. Standalone scooter, no rider, no animals, no dogs, no pencils.",
    note: "Teal and silver two-wheel kick scooter with T-bar handlebars",
  },
  {
    slot: 351,
    word: "skateboard",
    displayName: "skateboard",
    category: "Toy",
    framing: "object",
    hint: "A classic wooden skateboard in 3/4 isometric perspective: curved wooden deck with dark charcoal grip tape on the top surface, showing the kicktail and nose, with two aluminum metal wheel trucks mounted underneath and four bright polyurethane wheels. Bold clean black outlines, natural wood edge and clean skate colors, pure white background. Standalone skateboard, no rider, no text, no animals, no dogs, no pencils.",
    note: "Classic skateboard deck in 3/4 view showing grip tape and wheels",
  },
  {
    slot: 352,
    word: "wagon",
    displayName: "wagon",
    category: "Toy",
    framing: "object",
    hint: "A classic red metal toy pull wagon in 3/4 perspective: bright cherry red rectangular tub bed, four white steel wheels with black rubber tires, and a long black pulling handle with a comfortable oval loop grip angled forward. Bold clean black outlines, saturated red enamel color, pure white background. Standalone wagon, no cargo, no children, no text, no animals, no dogs, no pencils.",
    note: "Classic red metal toy pull wagon with 4 wheels and front pull handle",
  },
  {
    slot: 353,
    word: "chalk",
    displayName: "chalk",
    category: "Toy",
    framing: "object",
    hint: "A thick cylindrical sidewalk chalk stick in solid sky blue resting on a clean concrete sidewalk slab in 3/4 perspective, showing a bold clean chalk line drawn smoothly on the pavement beside it. Minimal restrained palette, just blue chalk on gray concrete sidewalk slab. Bold clean black outlines, calm natural colors, pure white background around the slab. No rainbow colors, no circus, no blackboard, no text, no animals, no dogs, no pencils.",
    note: "Single blue sidewalk chalk stick with clean line drawn on concrete slab",
  },
  {
    slot: 354,
    word: "jump_rope",
    displayName: "jump rope",
    category: "Toy",
    framing: "object",
    hint: "A classic jump rope in 3/4 perspective: two smooth wooden contoured handles resting neatly on the ground, with a vibrant red braided skipping rope gracefully looping in an elegant dynamic curved arc between the handles. Bold clean black outlines, rich wooden handle grain and bright red rope color, pure white background. Standalone jump rope, no jumper, no animals, no dogs, no pencils.",
    note: "Jump rope with smooth wooden handles and looping red braided cord",
  },
  {
    slot: 355,
    word: "music",
    displayName: "music",
    category: "Toy",
    framing: "object",
    hint: "The universal symbol for music: a prominent bold black Treble Clef gracefully surrounded by paired eighth notes (beamed music notes) and dynamic radiating curved sound wave ripples. Clean graphic icon aesthetic, bold clean black outlines with vivid vibrant color accents on the notes, pure white background. No headphones, no instruments, no letters, no words, no animals, no dogs, no pencils.",
    note: "Universal musical notes: bold treble clef and beamed eighth notes",
  },
  {
    slot: 356,
    word: "song",
    displayName: "song",
    category: "Toy",
    framing: "object",
    hint: "A clean sheet music score page standing upright in 3/4 perspective: crisp white sheet showing neat horizontal musical staff lines with a treble clef and black melody notes printed on the sheet, with two small musical eighth notes floating gracefully beside the page. Bold clean black outlines, crisp black and white sheet music, pure white background. Standalone sheet music, no microphone, no instruments, no letters, no words, no animals, no dogs, no pencils.",
    note: "Sheet music score page with staff lines, treble clef and melody notes",
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
  console.log(`Starting Batch 35 generation (${BATCH35.length} words: Outdoor Play, Sports & Music)...`);

  for (let i = 0; i < BATCH35.length; i++) {
    const item = BATCH35[i];
    const out = `${BRAIN_DIR}/batch35_${item.word}.png`;
    if (existsSync(out) && !process.argv.includes("--force")) {
      console.log(`Slot #${item.slot} ("${item.displayName}") already exists at ${out}. Skipping.`);
      continue;
    }
    console.log(`\n[${i + 1}/${BATCH35.length}] Generating slot #${item.slot}: "${item.displayName}"...`);
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
  for (let i = 0; i < BATCH35.length; i++) {
    const item = BATCH35[i];
    const imgPath = `${BRAIN_DIR}/batch35_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch35_grid.png`);
  console.log("Saved batch35_grid.png");

  console.log("Building 48px clinical strip...");
  const stripW = BATCH35.length * 64 + 16;
  const stripH = 64;
  const stripComposites = [];
  for (let i = 0; i < BATCH35.length; i++) {
    const item = BATCH35[i];
    const imgPath = `${BRAIN_DIR}/batch35_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch35_strip_48.png`);
  console.log("Saved batch35_strip_48.png");

  console.log("Building lightweight batch35_review.html...");
  let cards = "";
  for (const item of BATCH35) {
    const imgPath = `${BRAIN_DIR}/batch35_${item.word}.png`;
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
          <span class="text-xs font-semibold px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-full">Toys, Play & Leisure</span>
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
          <li><strong>Swing Set (#347) vs Swing (#229)</strong>: Empty A-frame equipment (noun) vs person swinging (action verb).</li>
          <li><strong>Music (#355) vs Song (#356) vs Headphones (#363)</strong>: Pure musical notes & treble clef vs vocal stage microphone with radiating melodies vs over-ear listening gear.</li>
          <li><strong>Bike (#349) vs Scooter (#350) vs Skateboard (#351)</strong>: Clear distinct silhouettes across three iconic wheeled mobility play devices.</li>
        </ul>
      </div>
      <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Design Rules</h3>
        <ul class="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
          <li><strong>Lifespan Dignity</strong>: Cruiser bike and skateboard are mature and dignified for ages 6 through adult.</li>
          <li><strong>Natural Color Law</strong>: Real-world colors, rich materials (wood, steel, rubber), bold black outlines, pure white backgrounds.</li>
          <li><strong>Clinical Legibility</strong>: Bold silhouettes tested at 48×48px.</li>
        </ul>
      </div>
    </div>
  </div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch35_review.html`, html, "utf8");
  console.log("Saved batch35_review.html");
}

run().catch((err) => {
  console.error("Batch 35 execution failed:", err);
  process.exit(1);
});
