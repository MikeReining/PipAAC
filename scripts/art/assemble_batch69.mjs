import sharp from "sharp";
import { writeFileSync, existsSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

export const BATCH69 = [
  { rank: 11, word: "bit", fileKey: "bit", label: "#11 bit", count: "6,006" },
  { rank: 12, word: "time", fileKey: "time", label: "#12 time", count: "5,910" },
  { rank: 13, word: "move", fileKey: "move", label: "#13 move", count: "4,473" },
  { rank: 14, word: "dear", fileKey: "dear", label: "#14 dear", count: "4,337" },
  { rank: 15, word: "from", fileKey: "from", label: "#15 from", count: "3,955" },
  { rank: 16, word: "nice", fileKey: "nice", label: "#16 nice", count: "3,866" },
  { rank: 17, word: "about", fileKey: "about", label: "#17 about", count: "3,844" },
  { rank: 18, word: "piece", fileKey: "piece", label: "#18 piece", count: "3,809" },
  { rank: 19, word: "mean", fileKey: "mean", label: "#19 mean", count: "3,803" },
  { rank: 20, word: "balloon", fileKey: "balloon", label: "#20 balloon", count: "3,768" },
  { rank: "REF", word: "bathroom", fileKey: "bathroom", label: "bathroom (refresh)", count: "Catalog" },
  { rank: "REF", word: "naptime", fileKey: "naptime", label: "naptime (refresh)", count: "Catalog" },
];

export async function assembleAll() {
  console.log("=== Assembling Review Grid and 48px Strip for Batch 69 ===");

  // Review Grid: 3 rows x 4 columns
  const cardW = 280;
  const cardH = 340;
  const gap = 16;
  const cols = 4;
  const rows = 3;
  const gridW = cols * cardW + (cols + 1) * gap;
  const gridH = rows * cardH + (rows + 1) * gap;

  const composites = [];

  for (let idx = 0; idx < BATCH69.length; idx++) {
    const item = BATCH69[idx];
    const normPath = `${BRAIN_DIR}/batch69_norm_${item.fileKey}.png`;
    if (!existsSync(normPath)) {
      console.warn(`[WARN] Missing ${normPath}`);
      continue;
    }

    const c = idx % cols;
    const r = Math.floor(idx / cols);
    const left = gap + c * (cardW + gap);
    const top = gap + r * (cardH + gap);

    const isRefresh = item.rank === "REF";
    const strokeColor = isRefresh ? "#10B981" : "#3B82F6";

    // Card background with rounded outline
    const cardBgSvg = `
      <svg width="${cardW}" height="${cardH}" viewBox="0 0 ${cardW} ${cardH}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${cardW}" height="${cardH}" rx="16" fill="#FFFFFF" stroke="${strokeColor}" stroke-width="2.5"/>
        <text x="${cardW / 2}" y="${cardH - 24}" font-family="system-ui, -apple-system, sans-serif" font-size="17" font-weight="700" fill="#0F172A" text-anchor="middle">${item.label}</text>
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
    create: { width: gridW, height: gridH, channels: 4, background: { r: 248, g: 250, b: 252, alpha: 1 } },
  })
    .composite(composites)
    .png()
    .toBuffer();

  writeFileSync(`${BRAIN_DIR}/batch69_grid.png`, gridBuf);
  console.log(`Wrote review grid to ${BRAIN_DIR}/batch69_grid.png`);

  // Build 48px motor strip
  const motorSize = 48;
  const motorGap = 12;
  const stripW = BATCH69.length * motorSize + (BATCH69.length + 1) * motorGap;
  const stripH = motorSize + motorGap * 2 + 20; // extra space for text labels underneath
  const stripComposites = [];

  for (let idx = 0; idx < BATCH69.length; idx++) {
    const item = BATCH69[idx];
    const normPath = `${BRAIN_DIR}/batch69_norm_${item.fileKey}.png`;
    if (!existsSync(normPath)) continue;

    const left = motorGap + idx * (motorSize + motorGap);
    const top = motorGap;

    const isRefresh = item.rank === "REF";
    const tileStroke = isRefresh ? "#10B981" : "#CBD5E1";

    const tileSvg = `
      <svg width="${motorSize}" height="${motorSize + 20}" viewBox="0 0 ${motorSize} ${motorSize + 20}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${motorSize}" height="${motorSize}" rx="8" fill="#FFFFFF" stroke="${tileStroke}" stroke-width="1.5"/>
        <text x="${motorSize / 2}" y="${motorSize + 14}" font-family="system-ui, -apple-system, sans-serif" font-size="9" font-weight="600" fill="#475569" text-anchor="middle">${item.word}</text>
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
    create: { width: stripW, height: stripH, channels: 4, background: { r: 248, g: 250, b: 252, alpha: 1 } },
  })
    .composite(stripComposites)
    .png()
    .toBuffer();

  writeFileSync(`${BRAIN_DIR}/batch69_strip_48.png`, stripBuf);
  console.log(`Wrote 48px motor strip to ${BRAIN_DIR}/batch69_strip_48.png`);
}

if (process.argv[1]?.endsWith("assemble_batch69.mjs")) {
  assembleAll().catch(console.error);
}
