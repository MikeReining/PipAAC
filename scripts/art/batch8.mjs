import { generateToFile } from "./gen.mjs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const BATCH = [
  {
    word: "see",
    prompt: [
      "We are trying to teach a child the concept of: see.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "Do not include any text in the image.",
      "Close-up shot of a stick figure from the chest up with a solid green torso. The stick figure is raising one hand in a two-finger V shape pointing at its eyes.",
    ].join("\n"),
  },
  {
    word: "read",
    prompt: [
      "We are trying to teach a child the concept of: read.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "Do not include any text in the image.",
      "Close-up shot of a stick figure from the chest up with a solid green torso. The stick figure is holding an open book with both hands, looking down happily at the pages.",
    ].join("\n"),
  },
  {
    word: "feel",
    prompt: [
      "We are trying to teach a child the concept of: feel.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "Do not include any text in the image.",
      "Close-up shot of a stick figure from the chest up with a solid green torso. The stick figure has a gentle, peaceful facial expression and is placing one flat hand gently over its heart on its chest.",
    ].join("\n"),
  },
  {
    word: "tell",
    prompt: [
      "We are trying to teach a child the concept of: tell.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "Do not include any text in the image.",
      "Close-up shot of a stick figure from the chest up with a solid green torso. The stick figure has an open mouth as if speaking cheerfully, with one hand cupped near its mouth gesturing outward.",
    ].join("\n"),
  },
  {
    word: "think",
    prompt: [
      "We are trying to teach a child the concept of: think.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "Do not include any text in the image.",
      "Close-up shot of a stick figure from the chest up with a solid green torso. The stick figure is looking up thoughtfully at a puffy thought bubble cloud floating above its head.",
    ].join("\n"),
  },
  {
    word: "find",
    prompt: [
      "We are trying to teach a child the concept of: find.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "Do not include any text in the image.",
      "Close-up shot of a stick figure from the chest up with a solid green torso. The stick figure is happily holding a magnifying glass in front of its eye, looking through it with excitement.",
    ].join("\n"),
  },
  {
    word: "work",
    prompt: [
      "We are trying to teach a child the concept of: work.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "Do not include any text in the image.",
      "Close-up shot of a stick figure from the chest up with a solid green torso. The stick figure is holding a simple wooden hammer tool in one hand, busily working on a block.",
    ].join("\n"),
  },
  {
    word: "wait",
    prompt: [
      "We are trying to teach a child the concept of: wait.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "Do not include any text in the image.",
      "Close-up shot of a stick figure from the chest up with a solid green torso. The stick figure is resting its chin on its hands with a calm, patient expression, beside a classic hourglass showing sand trickling.",
    ].join("\n"),
  },
  {
    word: "have",
    prompt: [
      "We are trying to teach a child the concept of: have.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "Do not include any text in the image.",
      "Close-up shot of a stick figure from the chest up with a solid green torso. The stick figure is smiling happily, holding a simple gift box in both hands close to its chest.",
    ].join("\n"),
  },
  {
    word: "how",
    prompt: [
      "We are trying to teach a child the concept of: how.",
      "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
      "Do not include any text in the image.",
      "Close-up shot of a stick figure from the chest up with a solid pink torso. The stick figure has a curious inquisitive face, holding two large jigsaw puzzle pieces in its hands, figuring out how they fit together.",
    ].join("\n"),
  },
];

async function run() {
  console.log(`Starting Batch 8: ${BATCH.length} words, strictly 1 roll each...`);
  for (let i = 0; i < BATCH.length; i++) {
    const item = BATCH[i];
    const dest = `${BRAIN_DIR}/batch8_${item.word.replace(/\s+/g, "_")}.png`;
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
  console.log("Batch 8 generation complete.");
}

run().catch(console.error);
