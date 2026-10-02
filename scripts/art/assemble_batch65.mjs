import sharp from "sharp";
import { writeFileSync, existsSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const ASSETS_DIR = "assets/symbols";
const PUBLIC_DIR = "public/symbols";

export const BATCH65 = [
  { slot: 661, word: "ketchup", imagePath: `${BRAIN_DIR}/batch65_muse_ketchup.png` },
  { slot: 662, word: "fries", imagePath: `${BRAIN_DIR}/batch65_muse_fries.png` },
  { slot: 663, word: "poop", imagePath: `${BRAIN_DIR}/batch65_svg_poop_v3.png` },
  { slot: 664, word: "pee", imagePath: `${BRAIN_DIR}/batch65_muse_pee.png` },
  { slot: 665, word: "hit", imagePath: `${BRAIN_DIR}/batch65_muse_hit.png` },
  { slot: 666, word: "bite", imagePath: `${BRAIN_DIR}/batch65_muse_bite_cookie.png` },
  { slot: 667, word: "break", imagePath: `${BRAIN_DIR}/batch65_muse_break.png` },
  { slot: 668, word: "scratch", imagePath: `${BRAIN_DIR}/batch65_muse_scratch.png` },
  { slot: 669, word: "close", imagePath: `${BRAIN_DIR}/batch65_muse_close_v5.png` },
  { slot: 670, word: "shut", imagePath: `${BRAIN_DIR}/batch65_muse_shut.png` },
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
  for (const item of BATCH65) {
    if (!existsSync(item.imagePath)) {
      console.warn(`[WARN] Skipping ${item.word}: ${item.imagePath} not found.`);
      continue;
    }
    const rawPngBuf = await sharp(item.imagePath).png().toBuffer();
    const normBuf = await tightCropBuffer(rawPngBuf, 0.035);
    const normPath = `${BRAIN_DIR}/batch65_norm_${item.word}.png`;
    writeFileSync(normPath, normBuf);
    console.log(`Normalized #${item.slot} ${item.word}`);
  }

  // Create review grid (2 rows x 5 columns)
  const cardW = 280;
  const cardH = 340;
  const gap = 16;
  const cols = 5;
  const rows = 2;
  const gridW = cols * cardW + (cols + 1) * gap;
  const gridH = rows * cardH + (rows + 1) * gap;

  const composites = [];

  for (let idx = 0; idx < BATCH65.length; idx++) {
    const item = BATCH65[idx];
    const normPath = `${BRAIN_DIR}/batch65_norm_${item.word}.png`;
    if (!existsSync(normPath)) continue;

    const c = idx % cols;
    const r = Math.floor(idx / cols);
    const left = gap + c * (cardW + gap);
    const top = gap + r * (cardH + gap);

    // Card background with rounded outline
    const cardBgSvg = `
      <svg width="${cardW}" height="${cardH}" viewBox="0 0 ${cardW} ${cardH}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${cardW}" height="${cardH}" rx="16" fill="#FFFFFF" stroke="#3B82F6" stroke-width="2"/>
        <text x="${cardW / 2}" y="${cardH - 24}" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="700" fill="#0F172A" text-anchor="middle">#${item.slot} ${item.word}</text>
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

  writeFileSync(`${BRAIN_DIR}/batch65_grid.png`, gridBuf);

  // Build 48px motor strip
  const motorSize = 48;
  const motorGap = 12;
  const stripW = BATCH65.length * motorSize + (BATCH65.length + 1) * motorGap;
  const stripH = motorSize + motorGap * 2;
  const stripComposites = [];

  for (let idx = 0; idx < BATCH65.length; idx++) {
    const item = BATCH65[idx];
    const normPath = `${BRAIN_DIR}/batch65_norm_${item.word}.png`;
    if (!existsSync(normPath)) continue;

    const left = motorGap + idx * (motorSize + motorGap);
    const top = motorGap;

    const tileBuf = await sharp(normPath)
      .resize(motorSize, motorSize, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toBuffer();

    stripComposites.push({ input: tileBuf, left, top });
  }

  const stripBuf = await sharp({
    create: { width: stripW, height: stripH, channels: 4, background: { r: 241, g: 245, b: 249, alpha: 1 } }
  }).composite(stripComposites).png().toBuffer();

  writeFileSync(`${BRAIN_DIR}/batch65_strip_48.png`, stripBuf);
  console.log("Built batch65_grid.png and batch65_strip_48.png\n");
}

if (process.argv[1]?.endsWith("assemble_batch65.mjs")) {
  assembleAll().catch(console.error);
}
