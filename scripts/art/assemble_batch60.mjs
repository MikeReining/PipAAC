import sharp from "sharp";
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const ASSETS_DIR = "assets/symbols";
const PUBLIC_DIR = "public/symbols";

export const BATCH60 = [
  { slot: 603, word: "emergency", fileKey: "emergency" },
  { slot: 604, word: "no way", fileKey: "no_way", targetFileName: "no way" },
  { slot: 605, word: "don't", fileKey: "dont", targetFileName: "don't" },
  { slot: 616, word: "can't", fileKey: "cant", targetFileName: "can't" },
  { slot: 617, word: "won't", fileKey: "wont", targetFileName: "won't" },
  { slot: 618, word: "didn't", fileKey: "didnt", targetFileName: "didn't" },
  { slot: 678, word: "ow", fileKey: "ow" },
  { slot: 685, word: "wait, I'm spelling", fileKey: "wait_im_spelling", targetFileName: "wait, I'm spelling" },
  { slot: 686, word: "guess my word", fileKey: "guess_my_word", targetFileName: "guess my word" },
  { slot: 687, word: "oops", fileKey: "oops" },
];

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

export async function normalizeAll() {
  for (const item of BATCH60) {
    const rawPath = `${BRAIN_DIR}/batch60_${item.fileKey}.png`;
    if (!existsSync(rawPath)) {
      throw new Error(`Missing raw file: ${rawPath}`);
    }
    const rawBuf = readFileSync(rawPath);
    const normBuf = await normalize(rawBuf);
    writeFileSync(`${BRAIN_DIR}/batch60_norm_${item.fileKey}.png`, normBuf);
    console.log(`Normalized: batch60_norm_${item.fileKey}.png`);
  }
}

export async function buildReviewGrid() {
  const cols = 5;
  const rows = 2;
  const cardW = 320;
  const cardH = 370;
  const gridW = cols * cardW;
  const gridH = rows * cardH;

  const composites = [];
  for (let i = 0; i < BATCH60.length; i++) {
    const item = BATCH60[i];
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = c * cardW;
    const y = r * cardH;

    const imgPath = `${BRAIN_DIR}/batch60_norm_${item.fileKey}.png`;
    const imgBuf = await sharp(imgPath).resize(280, 280).toBuffer();

    const cardSvg = `<svg width="${cardW}" height="${cardH}" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="8" width="${cardW - 16}" height="${cardH - 16}" rx="16" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="2" />
      <text x="${cardW / 2}" y="325" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="bold" fill="#0F172A" text-anchor="middle">#${item.slot} ${item.word}</text>
    </svg>`;

    composites.push({ input: Buffer.from(cardSvg), top: y, left: x });
    composites.push({ input: imgBuf, top: y + 20, left: x + 20 });
  }

  await sharp({
    create: { width: gridW, height: gridH, channels: 3, background: { r: 241, g: 245, b: 249 } }
  })
    .composite(composites)
    .png()
    .toFile(`${BRAIN_DIR}/batch60_grid.png`);

  const stripW = BATCH60.length * 64 + 16;
  const stripH = 64;
  const stripComposites = [];
  for (let i = 0; i < BATCH60.length; i++) {
    const item = BATCH60[i];
    const mini = await sharp(`${BRAIN_DIR}/batch60_norm_${item.fileKey}.png`)
      .resize(48, 48, { fit: "contain", background: { r: 255, g: 255, b: 255 } })
      .toBuffer();
    stripComposites.push({ input: mini, top: 8, left: i * 64 + 8 });
  }

  await sharp({
    create: { width: stripW, height: stripH, channels: 3, background: { r: 241, g: 245, b: 249 } }
  })
    .composite(stripComposites)
    .png()
    .toFile(`${BRAIN_DIR}/batch60_strip_48.png`);

  console.log("Built batch60_grid.png and batch60_strip_48.png");
}

export async function masterAll() {
  for (const item of BATCH60) {
    const src = `${BRAIN_DIR}/batch60_norm_${item.fileKey}.png`;
    const targetName = item.targetFileName || item.word;
    const destAssets = `${ASSETS_DIR}/${targetName}.png`;
    const destPublic = `${PUBLIC_DIR}/${targetName}.png`;

    copyFileSync(src, destAssets);
    copyFileSync(src, destPublic);
    console.log(`Mastered: ${targetName}.png -> assets & public`);
  }
}

async function main() {
  await normalizeAll();
  await buildReviewGrid();
  if (process.argv.includes("--master")) {
    await masterAll();
  }
  console.log("\nBatch 60 assembly completed successfully!");
}

if (process.argv[1] && process.argv[1].endsWith("assemble_batch60.mjs")) {
  main().catch(console.error);
}
