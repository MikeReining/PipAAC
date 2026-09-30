import sharp from "sharp";
import { writeFileSync } from "node:fs";

const OUT_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805/scratch";

// 1. The shared 3-mound green hill geometry
// Canvas 1600x1600
// Hill base from y=1050 to y=1500
// Left mound: peak around x=380, y=1180
// Middle mound: peak around x=800, y=1080
// Right mound: peak around x=1220, y=1180
const HILL_PATH = `
  M 120 1520
  L 120 1340
  C 200 1200, 300 1140, 420 1150
  C 540 1160, 650 1080, 800 1060
  C 950 1040, 1060 1160, 1180 1150
  C 1300 1140, 1400 1200, 1480 1340
  L 1480 1520
  Z
`;

const HILL_SVG = `
  <path d="${HILL_PATH}" fill="#22C55E" stroke="#1A1A1A" stroke-width="28" stroke-linejoin="round" />
`;

// Sun dimensions
const SUN_R = 190;
const SUN_FILL_DAY = "#FACC15";   // bright warm yellow
const SUN_FILL_EVE = "#F97316";   // warm sunset orange

// Version A: Sun with NO rays (pure clean disc)
function buildMorningA() {
  // Sun rising on the left: center at x=450, y=1160 (half emerging behind left mound)
  return `<svg width="1600" height="1600" xmlns="http://www.w3.org/2000/svg">
    <rect width="1600" height="1600" fill="#FFFFFF" />
    
    <!-- Sun (behind hill) -->
    <circle cx="430" cy="1160" r="${SUN_R}" fill="${SUN_FILL_DAY}" stroke="#1A1A1A" stroke-width="26" />
    
    <!-- The Hill -->
    ${HILL_SVG}
    
    <!-- Upward rising motion arrow on the left of sun -->
    <path d="M 230 1120 Q 240 960 330 880" fill="none" stroke="#1A1A1A" stroke-width="24" stroke-linecap="round" />
    <polygon points="330,850 355,910 295,890" fill="#1A1A1A" />
  </svg>`;
}

function buildAfternoonA() {
  // Sun at high noon: center at x=800, y=520
  return `<svg width="1600" height="1600" xmlns="http://www.w3.org/2000/svg">
    <rect width="1600" height="1600" fill="#FFFFFF" />
    
    <!-- Sun high at noon -->
    <circle cx="800" cy="520" r="${SUN_R}" fill="${SUN_FILL_DAY}" stroke="#1A1A1A" stroke-width="26" />
    
    <!-- Minimal cute white cloud on right -->
    <g transform="translate(1020, 620) scale(1.1)">
      <path d="M 50 80 A 40 40 0 0 1 120 50 A 55 55 0 0 1 210 55 A 40 40 0 0 1 260 90 A 35 35 0 0 1 240 130 L 60 130 A 35 35 0 0 1 50 80 Z" fill="#F8FAFC" stroke="#1A1A1A" stroke-width="22" stroke-linejoin="round" />
    </g>
    
    <!-- The Hill -->
    ${HILL_SVG}
  </svg>`;
}

function buildEveningA() {
  // Sun setting on the right: center at x=1170, y=1160 (half sunken behind right mound)
  return `<svg width="1600" height="1600" xmlns="http://www.w3.org/2000/svg">
    <rect width="1600" height="1600" fill="#FFFFFF" />
    
    <!-- Sun setting (behind hill) -->
    <circle cx="1170" cy="1160" r="${SUN_R}" fill="${SUN_FILL_EVE}" stroke="#1A1A1A" stroke-width="26" />
    
    <!-- The Hill -->
    ${HILL_SVG}
    
    <!-- Downward setting motion arrow on the right of sun -->
    <path d="M 1270 880 Q 1360 960 1370 1120" fill="none" stroke="#1A1A1A" stroke-width="24" stroke-linecap="round" />
    <polygon points="1370,1150 1345,1090 1405,1110" fill="#1A1A1A" />
  </svg>`;
}

function buildNightA() {
  // Night sky dome matching the hill bounds
  return `<svg width="1600" height="1600" xmlns="http://www.w3.org/2000/svg">
    <rect width="1600" height="1600" fill="#FFFFFF" />
    
    <!-- Deep navy night sky dome -->
    <path d="M 120 1520 L 120 1100 C 120 500, 1480 500, 1480 1100 L 1480 1520 Z" fill="#1E293B" stroke="#1A1A1A" stroke-width="26" stroke-linejoin="round" />
    
    <!-- Golden crescent moon high on the right -->
    <path d="M 1050 480 A 180 180 0 1 0 1180 840 A 150 150 0 1 1 1050 480 Z" fill="#FACC15" stroke="#1A1A1A" stroke-width="24" stroke-linejoin="round" />
    
    <!-- Twinkle stars -->
    <!-- Star 1 (center) -->
    <g transform="translate(680, 620) scale(1.4)">
      <polygon points="0,-25 7,-7 25,0 7,7 0,25 -7,7 -25,0 -7,-7" fill="#FDE047" stroke="#1A1A1A" stroke-width="6" stroke-linejoin="round" />
    </g>
    <!-- Star 2 (left) -->
    <g transform="translate(420, 720) scale(1.2)">
      <polygon points="0,-25 7,-7 25,0 7,7 0,25 -7,7 -25,0 -7,-7" fill="#FDE047" stroke="#1A1A1A" stroke-width="6" stroke-linejoin="round" />
    </g>
    <!-- Star 3 (high left) -->
    <g transform="translate(520, 500) scale(1.0)">
      <polygon points="0,-25 7,-7 25,0 7,7 0,25 -7,7 -25,0 -7,-7" fill="#FDE047" stroke="#1A1A1A" stroke-width="6" stroke-linejoin="round" />
    </g>
    <!-- Star 4 (lower middle) -->
    <g transform="translate(860, 760) scale(1.1)">
      <polygon points="0,-25 7,-7 25,0 7,7 0,25 -7,7 -25,0 -7,-7" fill="#FDE047" stroke="#1A1A1A" stroke-width="6" stroke-linejoin="round" />
    </g>
    <!-- Star 5 (far right) -->
    <g transform="translate(1320, 680) scale(1.0)">
      <polygon points="0,-25 7,-7 25,0 7,7 0,25 -7,7 -25,0 -7,-7" fill="#FDE047" stroke="#1A1A1A" stroke-width="6" stroke-linejoin="round" />
    </g>
    
    <!-- The EXACT Same Hill -->
    ${HILL_SVG}
  </svg>`;
}

async function renderAll() {
  const mSvg = buildMorningA();
  const aSvg = buildAfternoonA();
  const eSvg = buildEveningA();
  const nSvg = buildNightA();

  const mBuf = await sharp(Buffer.from(mSvg)).png().toBuffer();
  const aBuf = await sharp(Buffer.from(aSvg)).png().toBuffer();
  const eBuf = await sharp(Buffer.from(eSvg)).png().toBuffer();
  const nBuf = await sharp(Buffer.from(nSvg)).png().toBuffer();

  writeFileSync(`${OUT_DIR}/test_morning.png`, mBuf);
  writeFileSync(`${OUT_DIR}/test_afternoon.png`, aBuf);
  writeFileSync(`${OUT_DIR}/test_evening.png`, eBuf);
  writeFileSync(`${OUT_DIR}/test_night.png`, nBuf);

  // Build a 4-card review strip
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
    .toFile(`${OUT_DIR}/test_day_strip.png`);

  console.log("Rendered test_day_strip.png successfully!");
}

renderAll().catch(console.error);
