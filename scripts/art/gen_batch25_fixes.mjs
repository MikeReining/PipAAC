import { generateToFile } from "./gen.mjs";
import sharp from "sharp";
import { copyFileSync, existsSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

async function run() {
  console.log("1. Generating refined cook (strictly 2 arms, bilateral shoulders, no extra wing strokes)...");
  await generateToFile({
    word: "cook",
    torso: "green",
    framing: "bust",
    hint: "Close-up bust shot of a stick figure with a solid green torso. The figure has exactly two arms: the right hand holds a wooden spoon actively stirring inside a silver cooking pot on the stove, and the left hand holds the side handle of the pot steady. Exactly two arms, bilateral shoulder origins, zero extra limbs or extra arm strokes. Pure white background, bold black outline.",
    out: `${BRAIN_DIR}/batch25_cook_roll2.png`,
  });
  console.log("Done cook_roll2");

  console.log("\n2. Centering and maximizing clean up (trimming excess landscape margins)...");
  const origCleanUp = `${BRAIN_DIR}/batch25_clean_up.png`;
  if (existsSync(origCleanUp)) {
    const trimmedBuf = await sharp(origCleanUp)
      .trim()
      .toBuffer({ resolveWithObject: true });
    
    console.log(`Trimmed clean up to: ${trimmedBuf.info.width}x${trimmedBuf.info.height}`);
    
    // Fit into 1024x1024 square with 40px padding
    const maxDim = Math.max(trimmedBuf.info.width, trimmedBuf.info.height);
    const targetSize = 1024;
    const padding = 48;
    const availSize = targetSize - (padding * 2);
    
    const scaled = await sharp(trimmedBuf.data)
      .resize(availSize, availSize, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .toBuffer();
    
    await sharp({
      create: {
        width: targetSize,
        height: targetSize,
        channels: 3,
        background: { r: 255, g: 255, b: 255 }
      }
    })
    .composite([{ input: scaled, top: padding, left: padding }])
    .png()
    .toFile(`${BRAIN_DIR}/batch25_clean_up_centered.png`);
    
    console.log(`Saved centered clean up -> ${BRAIN_DIR}/batch25_clean_up_centered.png`);
  }
}

run().catch((err) => {
  console.error("Error generating fixes:", err);
  process.exit(1);
});
