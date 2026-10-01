import sharp from "sharp";
import { writeFileSync, existsSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";
const ASSETS_DIR = "assets/symbols";
const PUBLIC_DIR = "public/symbols";

const BLUE = "#2563EB";        // Pip Blue canonical
const BLUE_TINT = "#DBEAFE";   // Soft blue background
const GREY = "#DDDAD3";        // Neutral comparison grey (matches some.png)
const GREY_LIGHT = "#F8FAFC";   // Card surface
const BLACK = "#0F172A";       // Monoline outline ink
const WHITE = "#FFFFFF";

export const BATCH63 = [
  { slot: 641, word: "very", buildSvg: buildVerySvg },
  { slot: 642, word: "too", isImage: true, imagePath: `${BRAIN_DIR}/batch63_muse_too_canonical.png` },
  { slot: 643, word: "just", buildSvg: buildJustSvg },
  { slot: 644, word: "also", buildSvg: buildAlsoSvg },
  { slot: 645, word: "only", buildSvg: buildOnlySvg },
  { slot: 646, word: "still", isImage: true, imagePath: `${BRAIN_DIR}/batch63_muse_still_canonical.png` },
  { slot: 647, word: "one", buildSvg: () => buildNumberSvg(1) },
  { slot: 648, word: "two", buildSvg: () => buildNumberSvg(2) },
  { slot: 649, word: "three", buildSvg: () => buildNumberSvg(3) },
  { slot: 650, word: "four", buildSvg: () => buildNumberSvg(4) },
];

// 1. VERY (#641) - White megaphone blasting out 3 large, bold blue soundwaves
export function buildVerySvg() {
  return `
  <svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
    <rect width="1024" height="1024" fill="${WHITE}"/>
    
    <!-- Megaphone Cone -->
    <path d="M 230 460 L 460 300 L 460 724 L 230 564 Z" 
          fill="${WHITE}" stroke="${BLACK}" stroke-width="28" stroke-linejoin="round"/>
          
    <!-- Megaphone Mouth Rim (Front Oval) -->
    <ellipse cx="460" cy="512" rx="36" ry="212" fill="${GREY_LIGHT}" stroke="${BLACK}" stroke-width="28"/>
    
    <!-- Rear Mouthpiece -->
    <rect x="150" y="470" width="84" height="84" rx="16" fill="${BLACK}"/>
    
    <!-- Handle -->
    <path d="M 280 580 L 250 740 Q 250 770 280 770 L 310 770 Q 340 770 340 740 L 350 600" 
          fill="${WHITE}" stroke="${BLACK}" stroke-width="26" stroke-linejoin="round"/>

    <!-- 3 Large Bold Expanding Blue Soundwaves ())) -->
    <g stroke="${BLUE}" stroke-linecap="round" fill="none">
      <!-- Wave 1 -->
      <path d="M 560 380 A 180 180 0 0 1 560 644" stroke-width="40"/>
      <!-- Wave 2 -->
      <path d="M 680 290 A 280 280 0 0 1 680 734" stroke-width="44"/>
      <!-- Wave 3 -->
      <path d="M 800 200 A 380 380 0 0 1 800 824" stroke-width="48"/>
    </g>
  </svg>
  `;
}

// 2. TOO (#642) - 3/4 perspective cup with visible oval rim, overflowing water cascading down sides and pooling onto a wide puddle below
export function buildTooSvg() {
  return `
  <svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
    <rect width="1024" height="1024" fill="${WHITE}"/>
    
    <!-- Wide Puddle of Spilled Blue Water on the surface -->
    <ellipse cx="512" cy="870" rx="400" ry="70" fill="${BLUE}" stroke="${BLACK}" stroke-width="28"/>
    <ellipse cx="420" cy="855" rx="170" ry="24" fill="${BLUE_TINT}"/>

    <!-- Glass Tumbler Body -->
    <path d="M 322 340 L 358 840 Q 358 875 398 875 L 626 875 Q 666 875 666 840 L 702 340" 
          fill="${WHITE}" stroke="${BLACK}" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>

    <!-- Blue Water filling glass body -->
    <path d="M 356 840 L 668 840 L 702 340 L 322 340 Z" fill="${BLUE}"/>

    <!-- Left & Right Overflow Cascades pouring down outer walls -->
    <path d="M 322 340 C 280 340, 260 390, 270 470 C 280 520, 320 510, 326 440 Z" 
          fill="${BLUE}" stroke="${BLACK}" stroke-width="24" stroke-linejoin="round"/>
    <path d="M 702 340 C 744 340, 764 390, 754 470 C 744 520, 704 510, 698 440 Z" 
          fill="${BLUE}" stroke="${BLACK}" stroke-width="24" stroke-linejoin="round"/>

    <!-- 3/4 Perspective Circular/Oval Top Rim of the Cup (Open rim you can look into) -->
    <ellipse cx="512" cy="340" rx="190" ry="55" fill="${BLUE}" stroke="${BLACK}" stroke-width="28"/>
    
    <!-- Water highlight on top rim -->
    <ellipse cx="470" cy="330" rx="110" ry="22" fill="${BLUE_TINT}"/>

    <!-- Falling Splash Droplets -->
    <circle cx="260" cy="570" r="26" fill="${BLUE}" stroke="${BLACK}" stroke-width="20"/>
    <circle cx="764" cy="570" r="26" fill="${BLUE}" stroke="${BLACK}" stroke-width="20"/>
  </svg>
  `;
}

// 3. JUST (#643) - Clean target slot + large blue block + bold, prominent downward arrow
export function buildJustSvg() {
  return `
  <svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
    <rect width="1024" height="1024" fill="${WHITE}"/>
    
    <!-- Bold, prominent Downward Insertion Arrow -->
    <g stroke="${BLACK}" stroke-linecap="round" stroke-linejoin="round">
      <line x1="512" y1="80" x2="512" y2="250" stroke-width="36"/>
      <polygon points="512,285 412,175 612,175" fill="${BLACK}"/>
    </g>

    <!-- Large Target Slot (Dashed outline representing the matching receptacle) -->
    <rect x="252" y="340" width="520" height="520" rx="44" fill="${GREY_LIGHT}" stroke="${BLACK}" stroke-width="28" stroke-dasharray="28 20"/>

    <!-- The Blue Block: Perfectly fitting flush inside the slot with zero gap -->
    <rect x="252" y="340" width="520" height="520" rx="44" fill="${BLUE}" stroke="${BLACK}" stroke-width="28"/>

    <!-- Precision Flush Corner Ticks (shows zero clearance / exact fit) -->
    <g stroke="${WHITE}" stroke-width="20" stroke-linecap="round" stroke-linejoin="round" fill="none">
      <path d="M 312 420 L 312 370 L 362 370"/>
      <path d="M 662 370 L 712 370 L 712 420"/>
      <path d="M 712 790 L 712 830 L 662 830"/>
      <path d="M 362 830 L 312 830 L 312 790"/>
    </g>
  </svg>
  `;
}

// 4. ALSO (#644) - Pair of Pip Blue circles + bold + sign + another Pip Blue circle (balanced spacing)
export function buildAlsoSvg() {
  return `
  <svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
    <rect width="1024" height="1024" fill="${WHITE}"/>
    <!-- Base pair of Pip Blue circles on left -->
    <g stroke="${BLACK}" stroke-width="26">
      <circle cx="240" cy="350" r="120" fill="${BLUE}"/>
      <circle cx="240" cy="674" r="120" fill="${BLUE}"/>
    </g>
    <!-- Bold plus sign in center: "in addition / also" -->
    <g stroke="${BLACK}" stroke-width="38" stroke-linecap="round">
      <line x1="490" y1="422" x2="490" y2="602"/>
      <line x1="400" y1="512" x2="580" y2="512"/>
    </g>
    <!-- The "also" third Pip Blue circle joining on right -->
    <circle cx="754" cy="512" r="120" fill="${BLUE}" stroke="${BLACK}" stroke-width="26"/>
  </svg>
  `;
}

// 5. ONLY (#645) - 4-circle grid matching all/some: 1 bright Pip Blue circle, 3 neutral grey circles (ZERO BRACKETS)
export function buildOnlySvg() {
  return `
  <svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
    <rect width="1024" height="1024" fill="${WHITE}"/>
    <!-- 3 Neutral Grey Circles (identical style to some.png) -->
    <g stroke="${BLACK}" stroke-width="28">
      <circle cx="694" cy="330" r="145" fill="${GREY}"/>
      <circle cx="330" cy="694" r="145" fill="${GREY}"/>
      <circle cx="694" cy="694" r="145" fill="${GREY}"/>
    </g>
    <!-- The single ONLY Pip Blue circle (top-left) -->
    <circle cx="330" cy="330" r="145" fill="${BLUE}" stroke="${BLACK}" stroke-width="28"/>
  </svg>
  `;
}

// 7-10. NUMBERS (#647-#650) - Bold white numeral on Pip Blue card + blue counting tokens
export function buildNumberSvg(n) {
  let tokensSvg = "";
  const tokenY = 820;
  const tokenR = 64;
  if (n === 1) {
    tokensSvg = `<circle cx="512" cy="${tokenY}" r="${tokenR}" fill="${BLUE}" stroke="${BLACK}" stroke-width="20"/>`;
  } else if (n === 2) {
    tokensSvg = `
      <circle cx="392" cy="${tokenY}" r="${tokenR}" fill="${BLUE}" stroke="${BLACK}" stroke-width="20"/>
      <circle cx="632" cy="${tokenY}" r="${tokenR}" fill="${BLUE}" stroke="${BLACK}" stroke-width="20"/>
    `;
  } else if (n === 3) {
    tokensSvg = `
      <circle cx="292" cy="${tokenY}" r="${tokenR}" fill="${BLUE}" stroke="${BLACK}" stroke-width="20"/>
      <circle cx="512" cy="${tokenY}" r="${tokenR}" fill="${BLUE}" stroke="${BLACK}" stroke-width="20"/>
      <circle cx="732" cy="${tokenY}" r="${tokenR}" fill="${BLUE}" stroke="${BLACK}" stroke-width="20"/>
    `;
  } else if (n === 4) {
    tokensSvg = `
      <circle cx="227" cy="${tokenY}" r="58" fill="${BLUE}" stroke="${BLACK}" stroke-width="18"/>
      <circle cx="417" cy="${tokenY}" r="58" fill="${BLUE}" stroke="${BLACK}" stroke-width="18"/>
      <circle cx="607" cy="${tokenY}" r="58" fill="${BLUE}" stroke="${BLACK}" stroke-width="18"/>
      <circle cx="797" cy="${tokenY}" r="58" fill="${BLUE}" stroke="${BLACK}" stroke-width="18"/>
    `;
  }

  return `
  <svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
    <rect width="1024" height="1024" fill="${WHITE}"/>
    <!-- Pip Blue Numeral Card -->
    <rect x="220" y="120" width="584" height="520" rx="48" fill="${BLUE}" stroke="${BLACK}" stroke-width="26"/>
    <!-- Large bold white numeral -->
    <text x="512" y="515" font-family="system-ui, -apple-system, sans-serif" font-size="390" font-weight="900" fill="${WHITE}" text-anchor="middle" dominant-baseline="alphabetic">${n}</text>
    <!-- Counting Tokens -->
    <g>
      ${tokensSvg}
    </g>
  </svg>
  `;
}

// Content-fit tight crop with 3.5% margin
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
  for (const item of BATCH63) {
    let rawPngBuf;
    if (item.isImage) {
      rawPngBuf = await sharp(item.imagePath).png().toBuffer();
    } else {
      const svg = item.buildSvg();
      rawPngBuf = await sharp(Buffer.from(svg)).png().toBuffer();
    }
    const croppedPngBuf = await tightCropBuffer(rawPngBuf);

    // Save normalized master to brain directory
    writeFileSync(`${BRAIN_DIR}/batch63_norm_${item.word}.png`, croppedPngBuf);
    console.log(`Generated & normalized #${item.slot} ${item.word}`);
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
  for (let i = 0; i < BATCH63.length; i++) {
    const item = BATCH63[i];
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = c * cardW;
    const y = r * cardH;

    const imgPath = `${BRAIN_DIR}/batch63_norm_${item.word}.png`;
    const imgBuf = await sharp(imgPath).resize(270, 270, { fit: "contain", background: { r: 255, g: 255, b: 255 } }).toBuffer();

    const cardSvg = `<svg width="${cardW}" height="${cardH}" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="8" width="${cardW - 16}" height="${cardH - 16}" rx="16" fill="#FFFFFF" stroke="#2563EB" stroke-width="2" />
      <text x="${cardW / 2}" y="325" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="bold" fill="#0F172A" text-anchor="middle">#${item.slot} ${item.word}</text>
    </svg>`;

    composites.push({ input: Buffer.from(cardSvg), top: y, left: x });
    composites.push({ input: imgBuf, top: y + 20, left: x + 25 });
  }

  await sharp({
    create: { width: gridW, height: gridH, channels: 3, background: { r: 241, g: 245, b: 249 } }
  })
    .composite(composites)
    .png()
    .toFile(`${BRAIN_DIR}/batch63_grid.png`);

  const stripW = BATCH63.length * 64 + 16;
  const stripH = 64;
  const stripComposites = [];
  for (let i = 0; i < BATCH63.length; i++) {
    const item = BATCH63[i];
    const mini = await sharp(`${BRAIN_DIR}/batch63_norm_${item.word}.png`)
      .resize(48, 48, { fit: "contain", background: { r: 255, g: 255, b: 255 } })
      .toBuffer();
    stripComposites.push({ input: mini, top: 8, left: i * 64 + 8 });
  }

  await sharp({
    create: { width: stripW, height: stripH, channels: 3, background: { r: 241, g: 245, b: 249 } }
  })
    .composite(stripComposites)
    .png()
    .toFile(`${BRAIN_DIR}/batch63_strip_48.png`);

  console.log("Built batch63_grid.png and batch63_strip_48.png");
}

async function main() {
  await assembleAll();
  await buildReviewGrid();
  console.log("\nAll 10 Batch 63 symbols successfully assembled and ready for review!");
}

if (process.argv[1] && process.argv[1].endsWith("assemble_batch63.mjs")) {
  main().catch(console.error);
}
