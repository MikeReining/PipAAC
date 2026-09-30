import sharp from "sharp";
import { writeFileSync } from "node:fs";

const OUT_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805/scratch";

// 1. LOCKED FIXED HORIZON
// Base at y=1600.
// Hill curve peaks at y=1100, valleys at y=1220.
// Identical across all 4 cards, zero vertical shifting!
const HILL_PATH = `
  M 0 1600
  L 0 1350
  C 120 1200, 240 1080, 420 1090
  C 560 1100, 680 1210, 800 1200
  C 920 1190, 1000 1010, 1180 1020
  C 1300 1030, 1420 1190, 1500 1180
  C 1560 1170, 1600 1200, 1600 1250
  L 1600 1600
  Z
`;

const HILL_SVG = `<path d="${HILL_PATH}" fill="#22C55E" stroke="#1A1A1A" stroke-width="28" stroke-linejoin="round" />`;

// 2. SUN WITH 8 PILL-SHAPED RAYS (matching founder's reference)
function buildSun(cx, cy, color) {
  const r = 160;
  const rayStart = 200;
  const rayEnd = 275;
  let rays = "";
  for (let i = 0; i < 8; i++) {
    const angle = (i * 45 * Math.PI) / 180;
    const x1 = cx + rayStart * Math.cos(angle);
    const y1 = cy + rayStart * Math.sin(angle);
    const x2 = cx + rayEnd * Math.cos(angle);
    const y2 = cy + rayEnd * Math.sin(angle);
    // Outer black stroke for capsule ray
    rays += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#1A1A1A" stroke-width="48" stroke-linecap="round" />`;
    // Inner colored fill for capsule ray
    rays += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="28" stroke-linecap="round" />`;
  }
  return `
    <g id="sun">
      ${rays}
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" stroke="#1A1A1A" stroke-width="26" />
    </g>
  `;
}

// 3. BOLD, CHUNKY ARROWS WITH CLEAR SEPARATION
function chunkyUpArrow(x, y) {
  // Bold arrow pointing diagonally up-right (45 deg)
  return `
    <g transform="translate(${x}, ${y}) rotate(-45)">
      <!-- Outer black border -->
      <path d="M -25 90 L 25 90 L 25 10 L 65 10 L 0 -80 L -65 10 L -25 10 Z" fill="#F8FAFC" stroke="#1A1A1A" stroke-width="24" stroke-linejoin="round" />
      <!-- Colored inner arrow -->
      <path d="M -20 85 L 20 85 L 20 15 L 55 15 L 0 -65 L -55 15 L -20 15 Z" fill="#FACC15" />
    </g>
  `;
}

function chunkyDownArrow(x, y) {
  // Bold arrow pointing diagonally down-right (135 deg)
  return `
    <g transform="translate(${x}, ${y}) rotate(135)">
      <!-- Outer black border -->
      <path d="M -25 90 L 25 90 L 25 10 L 65 10 L 0 -80 L -65 10 L -25 10 Z" fill="#F8FAFC" stroke="#1A1A1A" stroke-width="24" stroke-linejoin="round" />
      <!-- Colored inner arrow -->
      <path d="M -20 85 L 20 85 L 20 15 L 55 15 L 0 -65 L -55 15 L -20 15 Z" fill="#FB923C" />
    </g>
  `;
}

// Build SVG for each
function getMorningSvg() {
  return `<svg width="1600" height="1600" xmlns="http://www.w3.org/2000/svg">
    <rect width="1600" height="1600" fill="#FFFFFF" />
    <!-- Sun rising on left, behind hill -->
    ${buildSun(420, 1070, "#FACC15")}
    <!-- The Hill (occludes lower part of sun and lower rays) -->
    ${HILL_SVG}
    <!-- Bold chunky rising arrow clearly separated in sky above-left -->
    ${chunkyUpArrow(160, 720)}
  </svg>`;
}

function getAfternoonSvg() {
  return `<svg width="1600" height="1600" xmlns="http://www.w3.org/2000/svg">
    <rect width="1600" height="1600" fill="#FFFFFF" />
    <!-- Sun high at noon, center of sky -->
    ${buildSun(800, 480, "#FACC15")}
    <!-- Cute friendly cloud on right -->
    <g transform="translate(1080, 580) scale(1.15)">
      <path d="M 50 80 A 40 40 0 0 1 120 50 A 55 55 0 0 1 210 55 A 40 40 0 0 1 260 90 A 35 35 0 0 1 240 130 L 60 130 A 35 35 0 0 1 50 80 Z" fill="#F8FAFC" stroke="#1A1A1A" stroke-width="22" stroke-linejoin="round" />
    </g>
    <!-- The Hill -->
    ${HILL_SVG}
  </svg>`;
}

function getEveningSvg() {
  return `<svg width="1600" height="1600" xmlns="http://www.w3.org/2000/svg">
    <rect width="1600" height="1600" fill="#FFFFFF" />
    <!-- Sun setting on right, behind hill -->
    ${buildSun(1180, 1070, "#FB923C")}
    <!-- The Hill (occludes lower part of sun and lower rays) -->
    ${HILL_SVG}
    <!-- Bold chunky setting arrow clearly separated in sky above-right -->
    ${chunkyDownArrow(1440, 720)}
  </svg>`;
}

function getNightSvg() {
  return `<svg width="1600" height="1600" xmlns="http://www.w3.org/2000/svg">
    <rect width="1600" height="1600" fill="#FFFFFF" />
    <!-- Deep navy night sky dome above hill -->
    <path d="M 0 1600 L 0 1100 C 0 350, 1600 350, 1600 1100 L 1600 1600 Z" fill="#1E293B" stroke="#1A1A1A" stroke-width="28" stroke-linejoin="round" />
    <!-- Golden crescent moon -->
    <path d="
      M 1250 440
      A 250 250 0 1 1 1100 960
      C 1250 910, 1380 740, 1250 440
      Z
    " fill="#FACC15" stroke="#1A1A1A" stroke-width="26" stroke-linejoin="round" />
    <!-- Twinkle stars -->
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
    <!-- The EXACT Same Hill -->
    ${HILL_SVG}
  </svg>`;
}

async function main() {
  const mBuf = await sharp(Buffer.from(getMorningSvg())).png().toBuffer();
  const aBuf = await sharp(Buffer.from(getAfternoonSvg())).png().toBuffer();
  const eBuf = await sharp(Buffer.from(getEveningSvg())).png().toBuffer();
  const nBuf = await sharp(Buffer.from(getNightSvg())).png().toBuffer();

  writeFileSync(`${OUT_DIR}/fixed_morning.png`, mBuf);
  writeFileSync(`${OUT_DIR}/fixed_afternoon.png`, aBuf);
  writeFileSync(`${OUT_DIR}/fixed_evening.png`, eBuf);
  writeFileSync(`${OUT_DIR}/fixed_night.png`, nBuf);

  // 4-tile review strip
  const cardW = 320;
  const cardH = 370;
  const stripW = 4 * cardW;
  const stripH = cardH;

  const items = [
    { name: "morning", buf: mBuf, slot: 553 },
    { name: "afternoon", buf: aBuf, slot: 554 },
    { name: "evening", buf: eBuf, slot: 555 },
    { name: "night", buf: nBuf, slot: 556 },
  ];

  const comps = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const x = i * cardW;
    const mini = await sharp(it.buf).resize(280, 280).toBuffer();
    const cardSvg = `<svg width="${cardW}" height="${cardH}" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="8" width="${cardW - 16}" height="${cardH - 16}" rx="16" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="2" />
      <text x="${cardW / 2}" y="325" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="bold" fill="#0F172A" text-anchor="middle">#${it.slot} ${it.name}</text>
    </svg>`;
    comps.push({ input: Buffer.from(cardSvg), top: 0, left: x });
    comps.push({ input: mini, top: 20, left: x + 20 });
  }

  await sharp({
    create: { width: stripW, height: stripH, channels: 3, background: { r: 241, g: 245, b: 249 } }
  })
    .composite(comps)
    .png()
    .toFile(`${OUT_DIR}/fixed_day_strip.png`);

  // Also build 48px mini strip to check clinical legibility
  const mini48Comps = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const mini48 = await sharp(it.buf).resize(48, 48, { fit: "contain", background: { r: 255, g: 255, b: 255 } }).toBuffer();
    mini48Comps.push({ input: mini48, top: 8, left: i * 64 + 8 });
  }

  await sharp({
    create: { width: 4 * 64 + 16, height: 64, channels: 3, background: { r: 241, g: 245, b: 249 } }
  })
    .composite(mini48Comps)
    .png()
    .toFile(`${OUT_DIR}/fixed_day_strip_48.png`);

  console.log("Built fixed_day_strip.png and fixed_day_strip_48.png!");
}

main().catch(console.error);
