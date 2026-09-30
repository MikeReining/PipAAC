import sharp from "sharp";
import { writeFileSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const ASSETS_DIR = "assets/symbols";
const PUBLIC_DIR = "public/symbols";

export const BATCH57 = [
  { slot: 567, word: "again", type: "again" },
  { slot: 568, word: "always", type: "always" },
  { slot: 569, word: "never", type: "never" },
  { slot: 570, word: "sometimes", type: "sometimes" },
  { slot: 571, word: "first", type: "sequence", cardIndex: 3 },
  { slot: 572, word: "next", type: "sequence", cardIndex: 2 },
  { slot: 573, word: "then", type: "sequence", cardIndex: 1 },
  { slot: 574, word: "last", type: "sequence", cardIndex: 0 },
  { slot: 575, word: "minute", type: "clock", clockType: "minute" },
  { slot: 576, word: "hour", type: "clock", clockType: "hour" },
];

// ---------------------------------------------------------------------------
// 1. AGAIN (#567) - Symmetrical circular 2-arrow sweep
// ---------------------------------------------------------------------------
export function buildAgainSvg() {
  const cx = 800, cy = 800, R = 440;
  function rad(d) { return (d * Math.PI) / 180; }

  // Sweeping 125 degrees gives a clean, generous gap (~55 degrees) exactly like media_1790792303947.png
  const startDeg = 175;
  const endDeg = 300;

  const sx = cx + R * Math.cos(rad(startDeg));
  const sy = cy + R * Math.sin(rad(startDeg));
  const ex = cx + R * Math.cos(rad(endDeg));
  const ey = cy + R * Math.sin(rad(endDeg));

  const tang = rad(endDeg + 90);
  const tx = Math.cos(tang);
  const ty = Math.sin(tang);
  const norm = rad(endDeg);
  const nx = Math.cos(norm);
  const ny = Math.sin(norm);

  const headLen = 170;
  const halfBase = 115;
  const tipX = ex + headLen * tx;
  const tipY = ey + headLen * ty;
  const b1X = ex + halfBase * nx;
  const b1Y = ey + halfBase * ny;
  const b2X = ex - halfBase * nx;
  const b2Y = ey - halfBase * ny;

  function makeHalf(isOutline) {
    const stroke = isOutline ? "#0F172A" : "#2563EB";
    const strokeW = isOutline ? 164 : 112;
    const arrowFill = isOutline ? "#0F172A" : "#2563EB";
    const arrowStroke = isOutline ? "#0F172A" : "#2563EB";
    const arrowW = isOutline ? 52 : 0;

    return `
      <path d="M ${sx} ${sy} A ${R} ${R} 0 0 1 ${ex} ${ey}" fill="none" stroke="${stroke}" stroke-width="${strokeW}" stroke-linecap="round" />
      <polygon points="${tipX},${tipY} ${b1X},${b1Y} ${b2X},${b2Y}" fill="${arrowFill}" stroke="${arrowStroke}" stroke-width="${arrowW}" stroke-linejoin="round" />
    `;
  }

  return `
    <svg width="1600" height="1600" viewBox="0 0 1600 1600" xmlns="http://www.w3.org/2000/svg">
      <rect width="1600" height="1600" fill="#FFFFFF" />
      <!-- Dark Outline Layer -->
      <g>
        ${makeHalf(true)}
      </g>
      <g transform="rotate(180 800 800)">
        ${makeHalf(true)}
      </g>
      <!-- Pip Blue Fill Layer -->
      <g>
        ${makeHalf(false)}
      </g>
      <g transform="rotate(180 800 800)">
        ${makeHalf(false)}
      </g>
    </svg>
  `;
}

// ---------------------------------------------------------------------------
// 2. ALWAYS (#568) - Pure mathematical infinity lemniscate in Pip Blue
// ---------------------------------------------------------------------------
export function buildAlwaysSvg() {
  const infPath = "M 800 800 C 960 560, 1340 560, 1340 800 C 1340 1040, 960 1040, 800 800 C 640 560, 260 560, 260 800 C 260 1040, 640 1040, 800 800 Z";
  return `
    <svg width="1600" height="1600" viewBox="0 0 1600 1600" xmlns="http://www.w3.org/2000/svg">
      <rect width="1600" height="1600" fill="#FFFFFF" />
      <!-- Outer black contour -->
      <path d="${infPath}" fill="none" stroke="#0F172A" stroke-width="88" stroke-linecap="round" stroke-linejoin="round" />
      <!-- Inner vibrant blue fill -->
      <path d="${infPath}" fill="none" stroke="#2563EB" stroke-width="56" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `;
}

// ---------------------------------------------------------------------------
// 3. NEVER (#569) - Universal ISO prohibition symbol over black infinity loop
// ---------------------------------------------------------------------------
export function buildNeverSvg() {
  const infPath = "M 800 800 C 960 560, 1340 560, 1340 800 C 1340 1040, 960 1040, 800 800 C 640 560, 260 560, 260 800 C 260 1040, 640 1040, 800 800 Z";
  return `
    <svg width="1600" height="1600" viewBox="0 0 1600 1600" xmlns="http://www.w3.org/2000/svg">
      <rect width="1600" height="1600" fill="#FFFFFF" />
      
      <!-- Black infinity symbol (exact match to always geometry) -->
      <path d="${infPath}" fill="none" stroke="#0F172A" stroke-width="72" stroke-linecap="round" stroke-linejoin="round" />
      
      <!-- Red Universal Prohibition Ring (ISO 7010 standard) -->
      <circle cx="800" cy="800" r="540" fill="none" stroke="#DC2626" stroke-width="96" />
      
      <!-- 45° diagonal slash from top-left to bottom-right -->
      <line x1="418" y1="418" x2="1182" y2="1182" stroke="#DC2626" stroke-width="96" stroke-linecap="round" />
    </svg>
  `;
}

// ---------------------------------------------------------------------------
// 4. SOMETIMES (#570) - Clinical AAC standard: "Sometimes YES, Sometimes NO"
// ---------------------------------------------------------------------------
export function buildSometimesSvg() {
  return `
    <svg width="1600" height="1600" viewBox="0 0 1600 1600" xmlns="http://www.w3.org/2000/svg">
      <rect width="1600" height="1600" fill="#FFFFFF" />

      <!-- Left: Green Checkmark (Yes) -->
      <g transform="translate(180, 400)">
        <circle cx="280" cy="400" r="240" fill="#DCFCE7" stroke="#22C55E" stroke-width="32" />
        <polyline points="140,400 240,500 420,290" fill="none" stroke="#16A34A" stroke-width="56" stroke-linecap="round" stroke-linejoin="round" />
      </g>

      <!-- Center divider / slash -->
      <line x1="800" y1="460" x2="800" y2="1140" stroke="#CBD5E1" stroke-width="24" stroke-linecap="round" stroke-dasharray="24 32" />

      <!-- Right: Red X (No) -->
      <g transform="translate(700, 400)">
        <circle cx="460" cy="400" r="240" fill="#FEE2E2" stroke="#EF4444" stroke-width="32" />
        <line x1="320" y1="260" x2="600" y2="540" stroke="#DC2626" stroke-width="56" stroke-linecap="round" />
        <line x1="600" y1="260" x2="320" y2="540" stroke="#DC2626" stroke-width="56" stroke-linecap="round" />
      </g>
    </svg>
  `;
}

// ---------------------------------------------------------------------------
// 5-8. SEQUENCE QUARTET (#571-#574) - first, next, then, last
// ---------------------------------------------------------------------------
export function buildSequenceSvg(activeCardIndex) {
  // 4 cards: [4], [3], [2], [1] from left to right!
  // activeCardIndex: 3 = "first" ([1] is active)
  // activeCardIndex: 2 = "next"  ([2] is active)
  // activeCardIndex: 1 = "then"  ([3] is active)
  // activeCardIndex: 0 = "last"  ([4] is active)

  const cardNums = ["4", "3", "2", "1"];
  const cardX = [140, 440, 740, 1040];
  const cardW = 260;
  const cardH = 640;
  const cardY = 380;
  const rx = 40;

  const flX = 1370;
  const flW = 90;
  const flTop = 320;
  const flBot = 1320;
  const flH = flBot - flTop; // 1000

  // Checkered finish line
  const rows = 16;
  const rowH = flH / rows;
  const colW = flW / 2;
  let checkerboard = "";
  for (let r = 0; r < rows; r++) {
    const y = flTop + r * rowH;
    const c1 = r % 2 === 0 ? "#1E293B" : "#FFFFFF";
    const c2 = r % 2 === 0 ? "#FFFFFF" : "#1E293B";
    checkerboard += `<rect x="${flX}" y="${y}" width="${colW}" height="${rowH}" fill="${c1}" />`;
    checkerboard += `<rect x="${flX + colW}" y="${y}" width="${colW}" height="${rowH}" fill="${c2}" />`;
  }

  // Motion arrow underneath
  const arrowY = 1180;
  const arrowStartX = 140;
  const arrowEndX = 1330;

  // Render cards
  let cardsHtml = "";
  for (let i = 0; i < 4; i++) {
    const isAct = i === activeCardIndex;
    const x = cardX[i];
    const num = cardNums[i];

    if (isAct) {
      cardsHtml += `
        <!-- Active Card: ${num} -->
        <rect x="${x}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${rx}" fill="#2563EB" stroke="#0F172A" stroke-width="28" />
        <text x="${x + cardW / 2}" y="${cardY + cardH / 2 + 100}" font-family="system-ui, -apple-system, sans-serif" font-size="280" font-weight="900" fill="#FFFFFF" text-anchor="middle">${num}</text>
      `;
    } else {
      cardsHtml += `
        <!-- Inactive Card: ${num} -->
        <rect x="${x}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${rx}" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="20" />
        <text x="${x + cardW / 2}" y="${cardY + cardH / 2 + 100}" font-family="system-ui, -apple-system, sans-serif" font-size="280" font-weight="900" fill="#94A3B8" text-anchor="middle">${num}</text>
      `;
    }
  }

  return `
    <svg width="1600" height="1600" viewBox="0 0 1600 1600" xmlns="http://www.w3.org/2000/svg">
      <rect width="1600" height="1600" fill="#FFFFFF" />

      <!-- Cards -->
      ${cardsHtml}

      <!-- Motion Arrow Line -->
      <line x1="${arrowStartX}" y1="${arrowY}" x2="${arrowEndX}" y2="${arrowY}" stroke="#64748B" stroke-width="24" stroke-linecap="round" />
      <polygon points="${arrowEndX + 20},${arrowY} ${arrowEndX - 60},${arrowY - 45} ${arrowEndX - 60},${arrowY + 45}" fill="#64748B" stroke="#0F172A" stroke-width="12" stroke-linejoin="round" />

      <!-- Checkered Finish Line Bar -->
      <g id="finish-line">
        ${checkerboard}
        <rect x="${flX}" y="${flTop}" width="${flW}" height="${flH}" fill="none" stroke="#0F172A" stroke-width="24" rx="12" />
      </g>
    </svg>
  `;
}

// ---------------------------------------------------------------------------
// 9-10. DURATION PAIR (#575-#576) - minute & hour
// ---------------------------------------------------------------------------
export function buildClockSvg(type) {
  const isMinute = type === "minute";

  const wedge = isMinute ? `
    <!-- 10-minute / sector wedge from 12:00 to 1:00 (30 deg) -->
    <path d="M 800 800 L 800 320 A 480 480 0 0 1 1040 384 Z" fill="#93C5FD" opacity="0.5" />
    <path d="M 800 800 L 1040 384" stroke="#2563EB" stroke-width="24" stroke-linecap="round" />
  ` : `
    <!-- Full hour 360° circular sweep perimeter arrow -->
    <circle cx="800" cy="800" r="480" fill="#93C5FD" opacity="0.25" />
    <path d="M 800 240 A 560 560 0 1 1 760 242" fill="none" stroke="#2563EB" stroke-width="48" stroke-linecap="round" />
    <polygon points="740,140 880,240 740,340" fill="#2563EB" stroke="#0F172A" stroke-width="24" stroke-linejoin="round" />
  `;

  const hands = isMinute ? `
    <!-- Inactive short hour hand (to 3:00) -->
    <line x1="800" y1="800" x2="1040" y2="800" stroke="#94A3B8" stroke-width="44" stroke-linecap="round" />
    <!-- Active long minute hand (to 12:00) -->
    <line x1="800" y1="800" x2="800" y2="340" stroke="#0F172A" stroke-width="64" stroke-linecap="round" />
    <line x1="800" y1="800" x2="800" y2="340" stroke="#2563EB" stroke-width="40" stroke-linecap="round" />
  ` : `
    <!-- Inactive long minute hand (to 12:00) -->
    <line x1="800" y1="800" x2="800" y2="340" stroke="#94A3B8" stroke-width="40" stroke-linecap="round" />
    <!-- Active short hour hand (to 3:00) -->
    <line x1="800" y1="800" x2="1040" y2="800" stroke="#0F172A" stroke-width="68" stroke-linecap="round" />
    <line x1="800" y1="800" x2="1040" y2="800" stroke="#2563EB" stroke-width="44" stroke-linecap="round" />
  `;

  return `
    <svg width="1600" height="1600" viewBox="0 0 1600 1600" xmlns="http://www.w3.org/2000/svg">
      <rect width="1600" height="1600" fill="#FFFFFF" />
      
      <!-- Dial face -->
      <circle cx="800" cy="800" r="500" fill="#FFFFFF" stroke="#0F172A" stroke-width="48" />

      ${wedge}

      <!-- 4 Cardinal Ticks -->
      <line x1="800" y1="330" x2="800" y2="390" stroke="#0F172A" stroke-width="24" stroke-linecap="round" />
      <line x1="1270" y1="800" x2="1210" y2="800" stroke="#0F172A" stroke-width="24" stroke-linecap="round" />
      <line x1="800" y1="1270" x2="800" y2="1210" stroke="#0F172A" stroke-width="24" stroke-linecap="round" />
      <line x1="330" y1="800" x2="390" y2="800" stroke="#0F172A" stroke-width="24" stroke-linecap="round" />

      ${hands}

      <!-- Center pin -->
      <circle cx="800" cy="800" r="48" fill="#0F172A" />
      <circle cx="800" cy="800" r="28" fill="#2563EB" />
    </svg>
  `;
}

// ---------------------------------------------------------------------------
// Main Assembly & Mastering
// ---------------------------------------------------------------------------
export async function assembleAll() {
  for (const item of BATCH57) {
    let svg = "";
    if (item.type === "again") {
      svg = buildAgainSvg();
    } else if (item.type === "always") {
      svg = buildAlwaysSvg();
    } else if (item.type === "never") {
      svg = buildNeverSvg();
    } else if (item.type === "sometimes") {
      svg = buildSometimesSvg();
    } else if (item.type === "sequence") {
      svg = buildSequenceSvg(item.cardIndex);
    } else if (item.type === "clock") {
      svg = buildClockSvg(item.clockType);
    }

    const pngBuf = await sharp(Buffer.from(svg)).png().toBuffer();

    // 1. Save normalized master in brain
    writeFileSync(`${BRAIN_DIR}/batch57_norm_${item.word}.png`, pngBuf);

    // 2. Master directly to assets/symbols & public/symbols
    writeFileSync(`${ASSETS_DIR}/${item.word}.png`, pngBuf);
    writeFileSync(`${PUBLIC_DIR}/${item.word}.png`, pngBuf);

    console.log(`Mastered #${item.slot} ${item.word} -> assets/symbols & public/symbols`);
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
  for (let i = 0; i < BATCH57.length; i++) {
    const item = BATCH57[i];
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = c * cardW;
    const y = r * cardH;

    const imgPath = `${BRAIN_DIR}/batch57_norm_${item.word}.png`;
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
    .toFile(`${BRAIN_DIR}/batch57_grid.png`);

  const stripW = BATCH57.length * 64 + 16;
  const stripH = 64;
  const stripComposites = [];
  for (let i = 0; i < BATCH57.length; i++) {
    const item = BATCH57[i];
    const mini = await sharp(`${BRAIN_DIR}/batch57_norm_${item.word}.png`)
      .resize(48, 48, { fit: "contain", background: { r: 255, g: 255, b: 255 } })
      .toBuffer();
    stripComposites.push({ input: mini, top: 8, left: i * 64 + 8 });
  }

  await sharp({
    create: { width: stripW, height: stripH, channels: 3, background: { r: 241, g: 245, b: 249 } }
  })
    .composite(stripComposites)
    .png()
    .toFile(`${BRAIN_DIR}/batch57_strip_48.png`);

  console.log("Built batch57_grid.png and batch57_strip_48.png");
}

async function main() {
  await assembleAll();
  await buildReviewGrid();
  console.log("\nAll 10 Batch 57 tiles successfully assembled and mastered!");
}

if (process.argv[1] && process.argv[1].endsWith("assemble_batch57.mjs")) {
  main().catch(console.error);
}
