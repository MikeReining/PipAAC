import sharp from "sharp";
import { writeFileSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

export function renderFluidBarSvg(fillPercent) {
  const width = 1200;
  const height = 240;
  const rx = 120;
  const strokeWidth = 36;

  const innerW = width - 2 * strokeWidth;
  const innerH = height - 2 * strokeWidth;
  const fillW = Math.round(innerW * fillPercent);

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <clipPath id="fluid-clip">
        <rect x="${strokeWidth}" y="${strokeWidth}" width="${innerW}" height="${innerH}" rx="${rx - strokeWidth}" />
      </clipPath>
    </defs>
    <!-- Background track in Pale Gray -->
    <rect x="${strokeWidth}" y="${strokeWidth}" width="${innerW}" height="${innerH}" rx="${rx - strokeWidth}" fill="#E2E8F0" />
    
    <!-- Active Fluid Fill in Descriptor Blue -->
    <g clip-path="url(#fluid-clip)">
      <rect x="${strokeWidth}" y="${strokeWidth}" width="${fillW}" height="${innerH}" fill="#1E88E5" />
    </g>

    <!-- Outer pill border -->
    <rect x="${strokeWidth / 2}" y="${strokeWidth / 2}" width="${width - strokeWidth}" height="${height - strokeWidth}" rx="${rx}" fill="none" stroke="#1A1A1A" stroke-width="${strokeWidth}" />
  </svg>`;
}

async function testBars() {
  const fastBarSvg = renderFluidBarSvg(0.85); // 85% fill
  const slowBarSvg = renderFluidBarSvg(0.18); // 18% fill

  const fastBarBuf = await sharp(Buffer.from(fastBarSvg)).png().toBuffer();
  const slowBarBuf = await sharp(Buffer.from(slowBarSvg)).png().toBuffer();

  await sharp(fastBarBuf).toFile(`${BRAIN_DIR}/fluid_bar_fast.png`);
  await sharp(slowBarBuf).toFile(`${BRAIN_DIR}/fluid_bar_slow.png`);

  const comp = await sharp({
    create: {
      width: 1400,
      height: 700,
      channels: 4,
      background: { r: 248, g: 250, b: 252, alpha: 1 }
    }
  }).composite([
    { input: fastBarBuf, top: 100, left: 100 },
    { input: slowBarBuf, top: 400, left: 100 }
  ]).png().toFile(`${BRAIN_DIR}/fluid_bars_preview.png`);

  await sharp(`${BRAIN_DIR}/fluid_bars_preview.png`)
    .resize(120, 60, { fit: "contain" })
    .toFile(`${BRAIN_DIR}/fluid_bars_preview_48.png`);

  console.log("Rendered clean fluid progress bars!");
}

testBars().catch(console.error);
