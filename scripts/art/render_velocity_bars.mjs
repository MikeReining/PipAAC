import sharp from "sharp";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

function renderBarSvg(filledCount, totalCount = 4) {
  const width = 1200;
  const height = 280;
  const rx = 140;
  const strokeWidth = 36;
  const slant = 40; // horizontal skew offset for speed angle

  const pad = 20;
  const innerW = width - 2 * strokeWidth;
  const innerH = height - 2 * strokeWidth;
  const segW = (innerW - (totalCount + 1) * pad) / totalCount;
  
  let segs = "";
  for (let i = 0; i < totalCount; i++) {
    const isFilled = i < filledCount;
    const x = strokeWidth + pad + i * (segW + pad);
    const y = strokeWidth + pad;
    const fill = isFilled ? (i >= 2 ? "#FB8C00" : "#1E88E5") : "#E2E8F0";
    
    segs += `<polygon points="${x + slant},${y} ${x + segW + slant},${y} ${x + segW},${y + innerH - 2*pad} ${x},${y + innerH - 2*pad}" fill="${fill}" />\n`;
  }

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <clipPath id="pill-clip">
        <rect x="${strokeWidth}" y="${strokeWidth}" width="${innerW}" height="${innerH}" rx="${rx - strokeWidth}" />
      </clipPath>
    </defs>
    <rect x="${strokeWidth/2}" y="${strokeWidth/2}" width="${width - strokeWidth}" height="${height - strokeWidth}" rx="${rx}" fill="#FFFFFF" stroke="#1A1A1A" stroke-width="${strokeWidth}" />
    <g clip-path="url(#pill-clip)">
      ${segs}
    </g>
  </svg>`;
}

async function main() {
  const fastSvg = renderBarSvg(3, 4); // 3 of 4 filled
  const slowSvg = renderBarSvg(1, 4); // 1 of 4 filled

  const fastBuf = await sharp(Buffer.from(fastSvg)).png().toBuffer();
  const slowBuf = await sharp(Buffer.from(slowSvg)).png().toBuffer();

  await sharp(fastBuf).toFile(`${BRAIN_DIR}/bar_fast.png`);
  await sharp(slowBuf).toFile(`${BRAIN_DIR}/bar_slow.png`);

  // Comparison panel
  await sharp({
    create: {
      width: 1400,
      height: 800,
      channels: 4,
      background: { r: 248, g: 250, b: 252, alpha: 1 }
    }
  }).composite([
    { input: fastBuf, top: 80, left: 100 },
    { input: slowBuf, top: 440, left: 100 }
  ]).png().toFile(`${BRAIN_DIR}/bars_preview.png`);

  // Also make 48px version
  await sharp(`${BRAIN_DIR}/bars_preview.png`)
    .resize(120, 68, { fit: "contain", background: { r: 248, g: 250, b: 252, alpha: 1 } })
    .toFile(`${BRAIN_DIR}/bars_preview_48.png`);

  console.log("Rendered velocity bars successfully!");
}

main().catch(console.error);
