import sharp from "sharp";
import { writeFileSync } from "node:fs";

const OUT_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805/scratch";

// Perfect 3-mound hill matching the night image, spanning full width
// Left mound crest at (380, 1100), trough at (660, 1200)
// Central mound crest at (980, 1020), trough at (1300, 1180)
// Right mound crest at (1520, 1120)
// With a smooth green fill (#22C55E) and bold black outline (28px)
const HILL_FULL = `
  <path d="
    M -50 1650
    L -50 1350
    C 100 1200, 240 1080, 420 1090
    C 560 1100, 680 1210, 800 1200
    C 920 1190, 1000 1010, 1180 1020
    C 1300 1030, 1380 1190, 1500 1180
    C 1580 1170, 1640 1220, 1700 1300
    L 1700 1650
    Z
  " fill="#22C55E" stroke="#1A1A1A" stroke-width="28" stroke-linejoin="round" />
`;

// Clean Arrow helper: bold rounded arrow
function upwardArrow(x, y) {
  return `
    <g transform="translate(${x}, ${y})">
      <!-- Curved arrow stem -->
      <path d="M 0 160 C 10 70, 70 20, 140 0" fill="none" stroke="#1A1A1A" stroke-width="32" stroke-linecap="round" />
      <path d="M 0 160 C 10 70, 70 20, 140 0" fill="none" stroke="#F8FAFC" stroke-width="16" stroke-linecap="round" />
      <!-- Arrow head -->
      <polygon points="150,-35 170,45 85,15" fill="#1A1A1A" stroke="#1A1A1A" stroke-width="8" stroke-linejoin="round" />
    </g>
  `;
}

function downwardArrow(x, y) {
  return `
    <g transform="translate(${x}, ${y})">
      <!-- Curved arrow stem -->
      <path d="M 0 0 C 70 20, 130 70, 140 160" fill="none" stroke="#1A1A1A" stroke-width="32" stroke-linecap="round" />
      <path d="M 0 0 C 70 20, 130 70, 140 160" fill="none" stroke="#F8FAFC" stroke-width="16" stroke-linecap="round" />
      <!-- Arrow head -->
      <polygon points="140,195 75,145 160,125" fill="#1A1A1A" stroke="#1A1A1A" stroke-width="8" stroke-linejoin="round" />
    </g>
  `;
}

// Option A: Clean Sun Disc (No rays)
function sunDisc(cx, cy, r, color) {
  return `
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" stroke="#1A1A1A" stroke-width="28" />
  `;
}

// Option B: Canonical Sun with 8 clean rounded rays
function sunWithRays(cx, cy, r, rayLen, color) {
  let rays = "";
  for (let i = 0; i < 8; i++) {
    const angle = (i * 45 * Math.PI) / 180;
    const x1 = cx + (r + 14) * Math.cos(angle);
    const y1 = cy + (r + 14) * Math.sin(angle);
    const x2 = cx + (r + rayLen) * Math.cos(angle);
    const y2 = cy + (r + rayLen) * Math.sin(angle);
    rays += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#1A1A1A" stroke-width="32" stroke-linecap="round" />`;
    rays += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="18" stroke-linecap="round" />`;
  }
  return `
    <g>
      ${rays}
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" stroke="#1A1A1A" stroke-width="28" />
    </g>
  `;
}

// Night Moon and Stars
function nightSky(useDome = true) {
  const dome = useDome ? `
    <path d="M -50 1650 L -50 1100 C -50 350, 1650 350, 1650 1100 L 1650 1650 Z" fill="#1E293B" stroke="#1A1A1A" stroke-width="28" stroke-linejoin="round" />
  ` : `<rect width="1600" height="1600" fill="#1E293B" />`;

  return `
    ${dome}
    <!-- Chunky Golden Crescent Moon -->
    <path d="M 1120 440 A 240 240 0 1 0 1300 880 A 200 200 0 1 1 1120 440 Z" fill="#FACC15" stroke="#1A1A1A" stroke-width="26" stroke-linejoin="round" />
    
    <!-- Stars -->
    <g transform="translate(680, 580) scale(1.6)">
      <polygon points="0,-25 7,-7 25,0 7,7 0,25 -7,7 -25,0 -7,-7" fill="#FDE047" stroke="#1A1A1A" stroke-width="6" stroke-linejoin="round" />
    </g>
    <g transform="translate(380, 720) scale(1.3)">
      <polygon points="0,-25 7,-7 25,0 7,7 0,25 -7,7 -25,0 -7,-7" fill="#FDE047" stroke="#1A1A1A" stroke-width="6" stroke-linejoin="round" />
    </g>
    <g transform="translate(500, 480) scale(1.1)">
      <polygon points="0,-25 7,-7 25,0 7,7 0,25 -7,7 -25,0 -7,-7" fill="#FDE047" stroke="#1A1A1A" stroke-width="6" stroke-linejoin="round" />
    </g>
    <g transform="translate(880, 780) scale(1.2)">
      <polygon points="0,-25 7,-7 25,0 7,7 0,25 -7,7 -25,0 -7,-7" fill="#FDE047" stroke="#1A1A1A" stroke-width="6" stroke-linejoin="round" />
    </g>
    <g transform="translate(1380, 680) scale(1.1)">
      <polygon points="0,-25 7,-7 25,0 7,7 0,25 -7,7 -25,0 -7,-7" fill="#FDE047" stroke="#1A1A1A" stroke-width="6" stroke-linejoin="round" />
    </g>
    <g transform="translate(1420, 460) scale(0.9)">
      <polygon points="0,-25 7,-7 25,0 7,7 0,25 -7,7 -25,0 -7,-7" fill="#FDE047" stroke="#1A1A1A" stroke-width="6" stroke-linejoin="round" />
    </g>
  `;
}

// Generate Strip Option A (Clean Sun Disc, no rays)
async function renderOptionA() {
  const m = `<svg width="1600" height="1600" xmlns="http://www.w3.org/2000/svg">
    <rect width="1600" height="1600" fill="#FFFFFF" />
    ${sunDisc(420, 1100, 220, "#FACC15")}
    ${HILL_FULL}
    ${upwardArrow(200, 860)}
  </svg>`;

  const a = `<svg width="1600" height="1600" xmlns="http://www.w3.org/2000/svg">
    <rect width="1600" height="1600" fill="#FFFFFF" />
    ${sunDisc(800, 520, 220, "#FACC15")}
    <!-- Cute friendly cloud -->
    <g transform="translate(1040, 620) scale(1.2)">
      <path d="M 50 80 A 40 40 0 0 1 120 50 A 55 55 0 0 1 210 55 A 40 40 0 0 1 260 90 A 35 35 0 0 1 240 130 L 60 130 A 35 35 0 0 1 50 80 Z" fill="#F8FAFC" stroke="#1A1A1A" stroke-width="22" stroke-linejoin="round" />
    </g>
    ${HILL_FULL}
  </svg>`;

  const e = `<svg width="1600" height="1600" xmlns="http://www.w3.org/2000/svg">
    <rect width="1600" height="1600" fill="#FFFFFF" />
    ${sunDisc(1180, 1100, 220, "#FB923C")}
    ${HILL_FULL}
    ${downwardArrow(1260, 860)}
  </svg>`;

  const n = `<svg width="1600" height="1600" xmlns="http://www.w3.org/2000/svg">
    <rect width="1600" height="1600" fill="#FFFFFF" />
    ${nightSky(true)}
    ${HILL_FULL}
  </svg>`;

  return [m, a, e, n];
}

// Generate Strip Option B (Sun with 8 chunky clean rays)
async function renderOptionB() {
  const m = `<svg width="1600" height="1600" xmlns="http://www.w3.org/2000/svg">
    <rect width="1600" height="1600" fill="#FFFFFF" />
    ${sunWithRays(420, 1100, 190, 80, "#FACC15")}
    ${HILL_FULL}
    ${upwardArrow(180, 840)}
  </svg>`;

  const a = `<svg width="1600" height="1600" xmlns="http://www.w3.org/2000/svg">
    <rect width="1600" height="1600" fill="#FFFFFF" />
    ${sunWithRays(800, 520, 190, 80, "#FACC15")}
    <!-- Cute friendly cloud -->
    <g transform="translate(1080, 640) scale(1.1)">
      <path d="M 50 80 A 40 40 0 0 1 120 50 A 55 55 0 0 1 210 55 A 40 40 0 0 1 260 90 A 35 35 0 0 1 240 130 L 60 130 A 35 35 0 0 1 50 80 Z" fill="#F8FAFC" stroke="#1A1A1A" stroke-width="22" stroke-linejoin="round" />
    </g>
    ${HILL_FULL}
  </svg>`;

  const e = `<svg width="1600" height="1600" xmlns="http://www.w3.org/2000/svg">
    <rect width="1600" height="1600" fill="#FFFFFF" />
    ${sunWithRays(1180, 1100, 190, 80, "#FB923C")}
    ${HILL_FULL}
    ${downwardArrow(1260, 840)}
  </svg>`;

  const n = `<svg width="1600" height="1600" xmlns="http://www.w3.org/2000/svg">
    <rect width="1600" height="1600" fill="#FFFFFF" />
    ${nightSky(true)}
    ${HILL_FULL}
  </svg>`;

  return [m, a, e, n];
}

async function main() {
  const svgsA = await renderOptionA();
  const svgsB = await renderOptionB();

  const bufsA = await Promise.all(svgsA.map(s => sharp(Buffer.from(s)).png().toBuffer()));
  const bufsB = await Promise.all(svgsB.map(s => sharp(Buffer.from(s)).png().toBuffer()));

  // Composite 2-row comparison grid: Row 1 = Option A (Disc), Row 2 = Option B (8 Clean Rays)
  const cardW = 300;
  const cardH = 340;
  const gridW = 4 * cardW;
  const gridH = 2 * cardH + 60;

  const names = ["#553 morning", "#554 afternoon", "#555 evening", "#556 night"];
  const comps = [];

  // Row 1 header
  const h1Svg = `<svg width="${gridW}" height="30"><text x="20" y="22" font-family="system-ui, sans-serif" font-size="18" font-weight="bold" fill="#334155">Option A: Clean Sun Disc (No Rays)</text></svg>`;
  comps.push({ input: Buffer.from(h1Svg), top: 5, left: 0 });

  for (let i = 0; i < 4; i++) {
    const x = i * cardW;
    const y = 35;
    const mini = await sharp(bufsA[i]).resize(260, 260).toBuffer();
    const cardSvg = `<svg width="${cardW}" height="${cardH}" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="6" width="${cardW - 12}" height="${cardH - 12}" rx="14" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="2" />
      <text x="${cardW / 2}" y="300" font-family="system-ui, sans-serif" font-size="20" font-weight="bold" fill="#0F172A" text-anchor="middle">${names[i]}</text>
    </svg>`;
    comps.push({ input: Buffer.from(cardSvg), top: y, left: x });
    comps.push({ input: mini, top: y + 15, left: x + 20 });
  }

  // Row 2 header
  const h2Svg = `<svg width="${gridW}" height="30"><text x="20" y="22" font-family="system-ui, sans-serif" font-size="18" font-weight="bold" fill="#334155">Option B: Canonical Sun with 8 Clean Chunky Rays</text></svg>`;
  comps.push({ input: Buffer.from(h2Svg), top: cardH + 40, left: 0 });

  for (let i = 0; i < 4; i++) {
    const x = i * cardW;
    const y = cardH + 70;
    const mini = await sharp(bufsB[i]).resize(260, 260).toBuffer();
    const cardSvg = `<svg width="${cardW}" height="${cardH}" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="6" width="${cardW - 12}" height="${cardH - 12}" rx="14" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="2" />
      <text x="${cardW / 2}" y="300" font-family="system-ui, sans-serif" font-size="20" font-weight="bold" fill="#0F172A" text-anchor="middle">${names[i]}</text>
    </svg>`;
    comps.push({ input: Buffer.from(cardSvg), top: y, left: x });
    comps.push({ input: mini, top: y + 15, left: x + 20 });
  }

  await sharp({
    create: { width: gridW, height: gridH, channels: 3, background: { r: 241, g: 245, b: 249 } }
  })
    .composite(comps)
    .png()
    .toFile(`${OUT_DIR}/compare_day_options.png`);

  console.log("Built compare_day_options.png!");
}

main().catch(console.error);
