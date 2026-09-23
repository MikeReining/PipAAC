import { generateToFile } from "./gen.mjs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH = [
  {
    word: "we",
    prompt: [
      "We are trying to teach a child the concept of: we.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "Do not include any text in the image.",
      "Close-up shot of two stick figures from the chest up. Both stick figures have solid yellow torsos and are standing side-by-side smiling happily together.",
    ].join("\n"),
  },
  {
    word: "they",
    prompt: [
      "We are trying to teach a child the concept of: they.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "Do not include any text in the image.",
      "Two stick figures from the chest up with solid yellow torsos standing together on the right side. A black outline pointing hand enters from the left edge of the frame pointing directly at the two stick figures.",
    ].join("\n"),
  },
  {
    word: "mine",
    prompt: [
      "We are trying to teach a child the concept of: mine.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "Do not include any text in the image.",
      "Close-up shot of a stick figure from the chest up. The stick figure's torso is solid yellow. The stick figure is happily hugging a small round ball close against its chest with both arms.",
    ].join("\n"),
  },
  {
    word: "this",
    prompt: [
      "We are trying to teach a child the concept of: this.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "Do not include any text in the image.",
      "A single yellow cube block in the foreground. A black outline pointing hand is right next to the block, pointing directly down at it.",
    ].join("\n"),
  },
  {
    word: "who",
    prompt: [
      "We are trying to teach a child the concept of: who.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "Do not include any text in the image.",
      "Close-up shot of a stick figure from the chest up with a solid pink torso. The stick figure has a curious questioning face with a tilted head, pointing one hand toward a simple yellow silhouette of a person.",
    ].join("\n"),
  },
  {
    word: "same",
    prompt: [
      "We are trying to teach a child the concept of: same.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "Do not include any text in the image.",
      "Two identical round balls side-by-side. Both balls have the exact same size, bold black outline, and solid blue fill.",
    ].join("\n"),
  },
  {
    word: "different",
    prompt: [
      "We are trying to teach a child the concept of: different.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "Do not include any text in the image.",
      "Two different geometric shapes side-by-side: a round ball on the left and a square block on the right. Both shapes are filled solid blue with bold black outlines.",
    ].join("\n"),
  },
  {
    word: "under",
    prompt: [
      "We are trying to teach a child the concept of: under.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "Do not include any text in the image.",
      "A simple clean diagram with no human figures: a flat 2D wooden table with two legs. Directly underneath the table between the two legs is a bold pink arrow pointing straight down.",
    ].join("\n"),
  },
  {
    word: "over",
    prompt: [
      "We are trying to teach a child the concept of: over.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "Do not include any text in the image.",
      "A simple clean graphic diagram with no human figures: a simple low box, with a bold pink curved arrow arcing up and over the top of the box.",
    ].join("\n"),
  },
  {
    word: "away",
    prompt: [
      "We are trying to teach a child the concept of: away.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "Do not include any text in the image.",
      "A simple clean graphic diagram with no human figures: a solid black circle on the left, with a bold pink straight arrow pointing far away to the right.",
    ].join("\n"),
  },
];

async function run() {
  console.log(`Starting Batch 7: ${BATCH.length} words, strictly 1 roll each...`);
  for (let i = 0; i < BATCH.length; i++) {
    const item = BATCH[i];
    const dest = `${BRAIN_DIR}/batch7_${item.word.replace(/\s+/g, "_")}.png`;
    console.log(`[${i + 1}/${BATCH.length}] Generating "${item.word}"...`);
    const started = Date.now();
    try {
      await generateToFile({
        word: item.word,
        prompt: item.prompt,
        out: dest,
      });
      console.log(`  -> wrote ${dest} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    } catch (err) {
      console.error(`  -> ERROR for ${item.word}:`, err.message);
    }
  }
  console.log("Batch 7 generation complete.");
}

run().catch(console.error);
