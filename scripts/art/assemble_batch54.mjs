import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

// Single-dimension robust normalizer to 1600x1600 with 82% coverage
export async function normalize(inputBuf) {
  const { data, info } = await sharp(inputBuf).raw().toBuffer({ resolveWithObject: true });
  let minX = info.width, maxX = 0, minY = info.height, maxY = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * info.channels;
      if (data[idx] < 245 || data[idx + 1] < 245 || data[idx + 2] < 245) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const bw = maxX - minX;
  const bh = maxY - minY;
  if (bw <= 0 || bh <= 0) return inputBuf;

  const targetMax = Math.round(1600 * 0.82);
  const resizeOptions = bw >= bh ? { width: targetMax } : { height: targetMax };

  const cropped = await sharp(inputBuf)
    .extract({ left: minX, top: minY, width: bw, height: bh })
    .resize(resizeOptions)
    .toBuffer();

  const croppedMeta = await sharp(cropped).metadata();

  return await sharp({
    create: {
      width: 1600,
      height: 1600,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([
      {
        input: cropped,
        top: Math.round((1600 - croppedMeta.height) / 2),
        left: Math.round((1600 - croppedMeta.width) / 2),
      },
    ])
    .png()
    .toBuffer();
}

// 1. #535 full
export async function buildFull() {
  const src = `${BRAIN_DIR}/glass_full.png`;
  const buf = readFileSync(src);
  const norm = await normalize(buf);
  writeFileSync(`${BRAIN_DIR}/batch54_full.png`, norm);
  console.log("Built batch54_full.png");
}

// 2. #536 safe
export async function buildSafe() {
  const src = `${BRAIN_DIR}/safe_shield.png`;
  const buf = readFileSync(src);
  const norm = await normalize(buf);
  writeFileSync(`${BRAIN_DIR}/batch54_safe.png`, norm);
  console.log("Built batch54_safe.png");
}

// 3. #537 dangerous
export async function buildDangerous() {
  const src = `${BRAIN_DIR}/dangerous_triangle.png`;
  const buf = readFileSync(src);
  const norm = await normalize(buf);
  writeFileSync(`${BRAIN_DIR}/batch54_dangerous.png`, norm);
  console.log("Built batch54_dangerous.png");
}

// 4. #538 easy
export async function buildEasy() {
  const src = `${BRAIN_DIR}/puzzle_easy.png`;
  const buf = readFileSync(src);
  const norm = await normalize(buf);
  writeFileSync(`${BRAIN_DIR}/batch54_easy.png`, norm);
  console.log("Built batch54_easy.png");
}

// 5. #539 difficult
export async function buildDifficult() {
  const src = `${BRAIN_DIR}/puzzle_difficult.png`;
  const buf = readFileSync(src);
  const norm = await normalize(buf);
  writeFileSync(`${BRAIN_DIR}/batch54_difficult.png`, norm);
  console.log("Built batch54_difficult.png");
}

// 6. #540 right
export async function buildRight() {
  const rightSvg = `<svg width="1600" height="1600" xmlns="http://www.w3.org/2000/svg">
    <!-- Outer black shadow/outline for checkbox -->
    <rect x="290" y="310" width="980" height="980" rx="140" fill="none" stroke="#1A1A1A" stroke-width="120" stroke-linejoin="round" />
    <!-- Checkbox green stroke -->
    <rect x="290" y="310" width="980" height="980" rx="140" fill="#FFFFFF" stroke="#16A34A" stroke-width="84" stroke-linejoin="round" />
    <!-- Inner black contour -->
    <rect x="290" y="310" width="980" height="980" rx="140" fill="none" stroke="#1A1A1A" stroke-width="20" stroke-linejoin="round" />

    <!-- Checkmark black outline -->
    <path d="M 460 780 L 710 1030 L 1360 380" fill="none" stroke="#1A1A1A" stroke-width="150" stroke-linecap="round" stroke-linejoin="round" />
    <!-- Checkmark green stroke -->
    <path d="M 460 780 L 710 1030 L 1360 380" fill="none" stroke="#22C55E" stroke-width="114" stroke-linecap="round" stroke-linejoin="round" />
  </svg>`;

  const buf = await sharp(Buffer.from(rightSvg)).png().toBuffer();
  const norm = await normalize(buf);
  writeFileSync(`${BRAIN_DIR}/batch54_right.png`, norm);
  console.log("Built batch54_right.png");
}

// 7. #541 wrong
export async function buildWrong() {
  const wrongSvg = `<svg width="1600" height="1600" xmlns="http://www.w3.org/2000/svg">
    <!-- Outer black shadow/outline for checkbox -->
    <rect x="310" y="310" width="980" height="980" rx="140" fill="none" stroke="#1A1A1A" stroke-width="120" stroke-linejoin="round" />
    <!-- Checkbox red stroke -->
    <rect x="310" y="310" width="980" height="980" rx="140" fill="#FFFFFF" stroke="#DC2626" stroke-width="84" stroke-linejoin="round" />
    <!-- Inner black contour -->
    <rect x="310" y="310" width="980" height="980" rx="140" fill="none" stroke="#1A1A1A" stroke-width="20" stroke-linejoin="round" />

    <!-- X mark black outline -->
    <line x1="480" y1="480" x2="1120" y2="1120" stroke="#1A1A1A" stroke-width="150" stroke-linecap="round" />
    <line x1="1120" y1="480" x2="480" y2="1120" stroke="#1A1A1A" stroke-width="150" stroke-linecap="round" />
    <!-- X mark red stroke -->
    <line x1="480" y1="480" x2="1120" y2="1120" stroke="#EF4444" stroke-width="114" stroke-linecap="round" />
    <line x1="1120" y1="480" x2="480" y2="1120" stroke="#EF4444" stroke-width="114" stroke-linecap="round" />
  </svg>`;

  const buf = await sharp(Buffer.from(wrongSvg)).png().toBuffer();
  const norm = await normalize(buf);
  writeFileSync(`${BRAIN_DIR}/batch54_wrong.png`, norm);
  console.log("Built batch54_wrong.png");
}

// 8. #542 new & #543 old
export async function buildCars() {
  // Mask out corner watermark on car_modern_new.png (bottom right corner x>=1650, y>=1000)
  const cleanNewBuf = await sharp(`${BRAIN_DIR}/car_modern_new.png`)
    .composite([
      {
        input: {
          create: {
            width: 300,
            height: 300,
            channels: 3,
            background: { r: 255, g: 255, b: 255 },
          },
        },
        top: 980,
        left: 1620,
      },
    ])
    .png()
    .toBuffer();
  const normNew = await normalize(cleanNewBuf);
  writeFileSync(`${BRAIN_DIR}/batch54_new.png`, normNew);

  const oldBuf = readFileSync(`${BRAIN_DIR}/car_antique_old.png`);
  const normOld = await normalize(oldBuf);
  writeFileSync(`${BRAIN_DIR}/batch54_old.png`, normOld);

  console.log("Built batch54_new.png and batch54_old.png");
}

// 10. #544 pretty
export async function buildPretty() {
  const src = `${BRAIN_DIR}/flower_pretty.png`;
  const buf = readFileSync(src);
  const norm = await normalize(buf);
  writeFileSync(`${BRAIN_DIR}/batch54_pretty.png`, norm);
  console.log("Built batch54_pretty.png");
}

export const BATCH54 = [
  { slot: 535, word: "full" },
  { slot: 536, word: "safe" },
  { slot: 537, word: "dangerous" },
  { slot: 538, word: "easy" },
  { slot: 539, word: "difficult" },
  { slot: 540, word: "right" },
  { slot: 541, word: "wrong" },
  { slot: 542, word: "new" },
  { slot: 543, word: "old" },
  { slot: 544, word: "pretty" },
];

export async function buildReviewGrid() {
  const cols = 5;
  const rows = 2;
  const cardW = 320;
  const cardH = 370;
  const gridW = cols * cardW;
  const gridH = rows * cardH;

  const composites = [];
  for (let i = 0; i < BATCH54.length; i++) {
    const item = BATCH54[i];
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = c * cardW;
    const y = r * cardH;

    const imgPath = `${BRAIN_DIR}/batch54_${item.word}.png`;
    const imgBuf = await sharp(imgPath).resize(280, 280).toBuffer();

    const cardSvg = `<svg width="${cardW}" height="${cardH}" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="8" width="${cardW - 16}" height="${cardH - 16}" rx="16" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="2" />
      <text x="${cardW / 2}" y="325" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="bold" fill="#0F172A" text-anchor="middle">#${item.slot} ${item.word}</text>
    </svg>`;

    composites.push({ input: Buffer.from(cardSvg), top: y, left: x });
    composites.push({ input: imgBuf, top: y + 20, left: x + 20 });
  }

  await sharp({
    create: { width: gridW, height: gridH, channels: 3, background: { r: 241, g: 245, b: 249 } }
  })
    .composite(composites)
    .png()
    .toFile(`${BRAIN_DIR}/batch54_grid.png`);

  const stripW = BATCH54.length * 64 + 16;
  const stripH = 64;
  const stripComposites = [];
  for (let i = 0; i < BATCH54.length; i++) {
    const item = BATCH54[i];
    const mini = await sharp(`${BRAIN_DIR}/batch54_${item.word}.png`)
      .resize(48, 48, { fit: "contain", background: { r: 255, g: 255, b: 255 } })
      .toBuffer();
    stripComposites.push({ input: mini, top: 8, left: i * 64 + 8 });
  }

  await sharp({
    create: { width: stripW, height: stripH, channels: 3, background: { r: 241, g: 245, b: 249 } }
  })
    .composite(stripComposites)
    .png()
    .toFile(`${BRAIN_DIR}/batch54_strip_48.png`);

  console.log("Built batch54_grid.png and batch54_strip_48.png");
}

async function main() {
  await buildFull();
  await buildSafe();
  await buildDangerous();
  await buildEasy();
  await buildDifficult();
  await buildRight();
  await buildWrong();
  await buildCars();
  await buildPretty();
  await buildReviewGrid();
  console.log("All 10 Batch 54 tiles assembled successfully!");
}

if (process.argv[1] && process.argv[1].endsWith("assemble_batch54.mjs")) {
  main().catch(console.error);
}
