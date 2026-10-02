import sharp from "sharp";
import { writeFileSync, existsSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

export const BATCH67 = [
  { slot: 694, word: "banana bread", fileKey: "banana_bread", imagePath: `${BRAIN_DIR}/batch67_muse_banana_bread.png` },
  { slot: 695, word: "goldfish crackers", fileKey: "goldfish_crackers", imagePath: `${BRAIN_DIR}/batch67_muse_goldfish_crackers.png` },
  { slot: 696, word: "pudding", fileKey: "pudding", imagePath: `${BRAIN_DIR}/batch67_muse_pudding.png` },
  { slot: 697, word: "jello", fileKey: "jello", imagePath: `${BRAIN_DIR}/batch67_muse_jello.png` },
  { slot: 700, word: "chocolate", fileKey: "chocolate", imagePath: `${BRAIN_DIR}/batch67_muse_chocolate.png` },
  { slot: 712, word: "cantaloupe", fileKey: "cantaloupe", imagePath: `${BRAIN_DIR}/batch67_muse_cantaloupe.png` },
  { slot: 719, word: "hot chocolate", fileKey: "hot_chocolate", imagePath: `${BRAIN_DIR}/batch67_muse_hot_chocolate.png` },
  { slot: 720, word: "milkshake", fileKey: "milkshake", imagePath: `${BRAIN_DIR}/batch67_muse_milkshake_v2.png` },
];

export async function tightCropBuffer(pngBuf, marginPct = 0.035) {
  const trimmed = await sharp(pngBuf).trim({ threshold: 10 }).toBuffer();
  const meta = await sharp(trimmed).metadata();
  const pad = Math.max(12, Math.round(Math.max(meta.width, meta.height) * marginPct));
  return await sharp(trimmed)
    .extend({
      top: pad,
      bottom: pad,
      left: pad,
      right: pad,
      background: { r: 255, g: 255, b: 255 },
    })
    .png()
    .toBuffer();
}

export async function assembleAll() {
  for (const item of BATCH67) {
    if (!existsSync(item.imagePath)) {
      console.warn(`[WARN] Skipping ${item.word}: ${item.imagePath} not found.`);
      continue;
    }
    const rawPngBuf = await sharp(item.imagePath).png().toBuffer();
    const normBuf = await tightCropBuffer(rawPngBuf, 0.035);
    const normPath = `${BRAIN_DIR}/batch67_norm_${item.fileKey}.png`;
    writeFileSync(normPath, normBuf);
    console.log(`Normalized #${item.slot} ${item.word}`);
  }

  // Create review grid (2 rows x 4 columns)
  const cardW = 280;
  const cardH = 340;
  const gap = 16;
  const cols = 4;
  const rows = 2;
  const gridW = cols * cardW + (cols + 1) * gap;
  const gridH = rows * cardH + (rows + 1) * gap;

  const composites = [];

  for (let idx = 0; idx < BATCH67.length; idx++) {
    const item = BATCH67[idx];
    const normPath = `${BRAIN_DIR}/batch67_norm_${item.fileKey}.png`;
    if (!existsSync(normPath)) continue;

    const c = idx % cols;
    const r = Math.floor(idx / cols);
    const left = gap + c * (cardW + gap);
    const top = gap + r * (cardH + gap);

    // Card background with rounded outline
    const cardBgSvg = `
      <svg width="${cardW}" height="${cardH}" viewBox="0 0 ${cardW} ${cardH}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${cardW}" height="${cardH}" rx="16" fill="#FFFFFF" stroke="#3B82F6" stroke-width="2"/>
        <text x="${cardW / 2}" y="${cardH - 24}" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="700" fill="#0F172A" text-anchor="middle">#${item.slot} ${item.word}</text>
      </svg>
    `;
    const cardBgBuf = await sharp(Buffer.from(cardBgSvg)).png().toBuffer();
    composites.push({ input: cardBgBuf, left, top });

    // Inner symbol resized to 240x240 inside card
    const symbolBuf = await sharp(normPath)
      .resize(240, 240, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toBuffer();
    composites.push({ input: symbolBuf, left: left + 20, top: top + 20 });
  }

  const gridBuf = await sharp({
    create: { width: gridW, height: gridH, channels: 4, background: { r: 248, g: 250, b: 252, alpha: 1 } }
  }).composite(composites).png().toBuffer();

  writeFileSync(`${BRAIN_DIR}/batch67_grid.png`, gridBuf);
  console.log(`Wrote review grid to ${BRAIN_DIR}/batch67_grid.png`);

  // Build 48px motor strip
  const motorSize = 48;
  const motorGap = 12;
  const stripW = BATCH67.length * motorSize + (BATCH67.length + 1) * motorGap;
  const stripH = motorSize + motorGap * 2;
  const stripComposites = [];

  for (let idx = 0; idx < BATCH67.length; idx++) {
    const item = BATCH67[idx];
    const normPath = `${BRAIN_DIR}/batch67_norm_${item.fileKey}.png`;
    if (!existsSync(normPath)) continue;

    const left = motorGap + idx * (motorSize + motorGap);
    const top = motorGap;

    const tileSvg = `
      <svg width="${motorSize}" height="${motorSize}" viewBox="0 0 ${motorSize} ${motorSize}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${motorSize}" height="${motorSize}" rx="8" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.5"/>
      </svg>
    `;
    const tileBgBuf = await sharp(Buffer.from(tileSvg)).png().toBuffer();
    stripComposites.push({ input: tileBgBuf, left, top });

    const innerSize = 40;
    const innerBuf = await sharp(normPath)
      .resize(innerSize, innerSize, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toBuffer();
    stripComposites.push({ input: innerBuf, left: left + 4, top: top + 4 });
  }

  const stripBuf = await sharp({
    create: { width: stripW, height: stripH, channels: 4, background: { r: 241, g: 245, b: 249, alpha: 1 } }
  }).composite(stripComposites).png().toBuffer();

  writeFileSync(`${BRAIN_DIR}/batch67_strip_48.png`, stripBuf);
  console.log(`Wrote 48px strip to ${BRAIN_DIR}/batch67_strip_48.png`);
}

if (process.argv[1]?.endsWith("assemble_batch67.mjs")) {
  assembleAll().catch(console.error);
}
