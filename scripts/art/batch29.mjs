import { generateToFile } from "./gen.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH29 = [
  {
    slot: 293,
    word: "doctor",
    displayName: "doctor",
    torso: "yellow",
    framing: "bust",
    hint: "Close-up bust shot of a kind stick figure as a doctor. The figure wears a white medical lab coat over a solid yellow shirt. A black stethoscope is draped around the neck with the chest piece visible. On the chest pocket of the white coat is a crisp blue square hospital ID badge with a bold white capital 'H' inside. The figure has TWO complete arms, holding a medical clipboard in one hand, with a warm reassuring smile. Head fills ~50% of the frame. Pure white background, bold black outline.",
    note: "Doctor in white coat with stethoscope and blue hospital 'H' badge",
  },
  {
    slot: 294,
    word: "nurse",
    displayName: "nurse",
    torso: "yellow",
    framing: "bust",
    hint: "Close-up bust shot of a caring stick figure as a hospital nurse. The figure wears a soft medical scrub top over a solid yellow undershirt. A black stethoscope is draped around the neck. On the scrub lapel is a crisp blue square hospital ID badge with a bold white capital 'H' inside. The figure has TWO complete arms, with hands held together in front in a comforting caring gesture, with a kind loving smile. Head fills ~50% of the frame. Pure white background, bold black outline.",
    note: "Nurse in medical scrubs with stethoscope and blue hospital 'H' badge",
  },
  {
    slot: 295,
    word: "babysitter",
    displayName: "babysitter",
    torso: "yellow",
    framing: "bust",
    hint: "Close-up shot of a friendly youth caregiver stick figure in a solid yellow shirt as a babysitter, seated beside a cheerful small toddler stick figure. The babysitter has TWO complete arms, holding open a colorful picture storybook with the child, both looking at the book with warm happy smiles. Cozy nurturing childcare scene. Pure white background, bold black outline.",
    note: "Babysitter reading a colorful picture storybook with a toddler",
  },
  {
    slot: 286,
    word: "firefighter",
    displayName: "firefighter",
    torso: "yellow",
    framing: "bust",
    hint: "Close-up bust shot of a brave, friendly stick figure as a firefighter. The figure wears a heavy fire jacket with bold reflective yellow and silver stripes over a yellow shirt, and a classic red firefighter helmet with a shield emblem on front. The figure has TWO complete arms resting naturally at the sides, standing tall with a warm friendly smile. Head fills ~50% of the frame. Pure white background, bold black outline.",
    note: "Firefighter in jacket with reflective stripes and red helmet with shield",
  },
  {
    slot: 287,
    word: "police_officer",
    displayName: "police officer",
    torso: "yellow",
    framing: "bust",
    hint: "Close-up bust shot of a friendly, approachable stick figure as a police officer. The figure wears a dark uniform shirt with a shiny silver police shield badge on the chest over a yellow collar, and a classic dark peaked police officer cap with a silver badge in the center. The figure has TWO complete arms resting naturally down at the sides, with a warm pleasant smile. Head fills ~50% of the frame. Pure white background, bold black outline.",
    note: "Police officer in uniform with silver shield badge and peaked cap",
  },
  {
    slot: 288,
    word: "bus_driver",
    displayName: "bus driver",
    torso: "yellow",
    framing: "bust",
    hint: "Close-up shot of a cheerful stick figure in a solid yellow shirt as a school bus driver. The figure wears a driver's peaked cap and sits behind a large round black steering wheel with TWO complete hands gripping the wheel. Behind the driver is the clean outline of a yellow school bus front windshield and side mirror. The driver has a bright friendly smile. Pure white background, bold black outline.",
    note: "Bus driver with peaked cap holding steering wheel in front of school bus",
  },
  {
    slot: 292,
    word: "kids",
    displayName: "kids",
    torso: "yellow",
    framing: "bust",
    hint: "Close-up bust shot of two cheerful school-age children stick figures in solid yellow shirts. Both figures are slightly smaller with playful hairstyles (one with curly hair, one with short hair). Both figures have TWO complete arms, standing shoulder-to-shoulder with their inner arms around each other's shoulders in a warm friendly hug. Both have bright wide smiling faces. Pure white background, bold black outline.",
    note: "Two cheerful peer children standing together with arms around shoulders",
  },
  {
    slot: 296,
    word: "name",
    displayName: "name",
    torso: null,
    framing: "object",
    hint: "A clean, iconic rectangular adhesive name tag sticker. At the top is a bold red banner with white uppercase text saying 'HELLO'. Below the red banner is a clean white area with bold text saying 'my name is' in clean black letters, followed by a bold black blank horizontal underline line for writing a name. Clean graphic badge, isolated on pure white background, bold black outline, high contrast.",
    note: "Classic 'HELLO my name is' adhesive badge with blank underline",
  },
  {
    slot: 674,
    word: "man",
    displayName: "man",
    torso: "yellow",
    framing: "bust",
    hint: "Close-up bust shot of a canonical adult male stick figure in a solid yellow shirt. The figure has neat, short dark hair and a warm, dignified, friendly smile. The figure has TWO complete arms resting naturally straight down at the sides with clear circular hands. Clean, mature, dignified demographic representation. Head fills ~50% of the frame. Pure white background, bold black outline.",
    note: "Adult male stick figure with neat short hair and arms at sides",
  },
  {
    slot: 675,
    word: "woman",
    displayName: "woman",
    torso: "yellow",
    framing: "bust",
    hint: "Close-up bust shot of a canonical adult female stick figure in a solid yellow shirt. The figure has neat, wavy shoulder-length hair and a warm, dignified, friendly smile. The figure has TWO complete arms resting naturally straight down at the sides with clear circular hands. Clean, mature, dignified demographic representation. Head fills ~50% of the frame. Pure white background, bold black outline.",
    note: "Adult female stick figure with neat wavy hair and arms at sides",
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
  console.log(`Starting Batch 29 generation (${BATCH29.length} words: Healthcare, Community Helpers & Demographics)...`);

  for (let i = 0; i < BATCH29.length; i++) {
    const item = BATCH29[i];
    const out = `${BRAIN_DIR}/batch29_${item.word}.png`;
    if (existsSync(out) && !process.argv.includes("--force")) {
      console.log(`Slot #${item.slot} ("${item.displayName}") already exists at ${out}. Skipping.`);
      continue;
    }
    console.log(`\n[${i + 1}/${BATCH29.length}] Generating slot #${item.slot}: "${item.displayName}"...`);
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
  for (let i = 0; i < BATCH29.length; i++) {
    const item = BATCH29[i];
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = pad + c * (tileSize + pad);
    const y = pad + r * (tileSize + pad);
    const imgPath = `${BRAIN_DIR}/batch29_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch29_grid.png`);
  console.log("Saved batch29_grid.png");

  console.log("Building 48x48 preview strip...");
  const stripCols = BATCH29.length;
  const stripCell = 64;
  const stripW = stripCols * stripCell;
  const stripH = stripCell;
  const stripComposites = [];

  for (let i = 0; i < BATCH29.length; i++) {
    const item = BATCH29[i];
    const imgPath = `${BRAIN_DIR}/batch29_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch29_strip_48.png`);
  console.log("Saved batch29_strip_48.png");

  console.log("Building lightweight batch29_review.html...");
  let cards = "";
  for (const item of BATCH29) {
    const imgPath = `${BRAIN_DIR}/batch29_${item.word}.png`;
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
  <title>Batch 29 Review: Healthcare, Community Helpers & Demographics</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-900 antialiased p-4">
  <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm max-w-5xl mx-auto">
    <div class="mb-5 border-b border-slate-100 pb-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-extrabold text-slate-900 tracking-tight">Batch 29: Healthcare, Community Helpers & Demographics</h1>
          <p class="text-xs text-slate-500 mt-1">10 Clipart Symbols · Blue Hospital "H" Sign · Two-Arm Anatomy · Completes 100% of People & Roles (35/35)</p>
        </div>
        <div class="flex gap-2">
          <span class="text-xs font-semibold px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">100% People Complete</span>
          <span class="text-xs font-semibold px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full">boy & girl aliased</span>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
      ${cards}
    </div>

    <div class="mt-6 pt-5 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Hospital "H" Sign & Clinical Invariants</h3>
        <ul class="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
          <li><strong>Universal Hospital "H"</strong>: Applied via crisp blue ID badge with white "H" to both <code>doctor</code> and <code>nurse</code> for immediate healthcare anchoring.</li>
          <li><strong>Two-Arm Anatomical Completeness</strong>: Explicitly enforced on doctor, nurse, firefighter, police officer, bus driver, man, and woman.</li>
          <li><strong>Role Differentiation</strong>: Firefighter (reflective jacket & helmet), Police (peaked cap & badge), Bus Driver (steering wheel & bus window).</li>
        </ul>
      </div>

      <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">48×48px Scaling & Zero-Spend Aliases</h3>
        <ul class="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
          <li><strong>Name Badge</strong>: Bold red 'HELLO' banner and underline pop as self-intro tile.</li>
          <li><strong>Kids</strong>: Dual-figure peer hug clearly distinct from adult/child aide tiles.</li>
          <li><strong>Zero-Spend Aliases</strong>: <code>boy</code> (#672) and <code>girl</code> (#673) alias directly to <code>he.png</code> and <code>she.png</code>.</li>
        </ul>
      </div>
    </div>
  </div>
</body>
</html>`;

  writeFileSync(`${BRAIN_DIR}/batch29_review.html`, html, "utf8");
  const sizeKB = Math.round(Buffer.byteLength(html) / 1024);
  console.log(`Saved batch29_review.html -> ${sizeKB} KB (lightweight Tailwind)`);

  try {
    execSync(`open "${BRAIN_DIR}/batch29_review.html"`);
    console.log("Opened batch29_review.html in browser");
  } catch (err) {
    console.error("Could not run open command:", err);
  }
}

run().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
