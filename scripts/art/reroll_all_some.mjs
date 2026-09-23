import { generateToFile } from "./gen.mjs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

async function main() {
  console.log("Re-rolling 'all' and 'some' (1 roll each) with clean cluster prompts...");

  const allPrompt = [
    "We are trying to teach a child the concept of: all.",
    "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
    "Do not include any text in the image.",
    "A clean graphic cluster of four identical round balls grouped closely together in a 2x2 square formation. All four balls are filled solid blue with bold black outlines. Pure white background, no boxes, no other shapes, no arrows.",
  ].join("\n");

  const somePrompt = [
    "We are trying to teach a child the concept of: some.",
    "Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.",
    "Do not include any text in the image.",
    "A clean graphic cluster of four identical round balls grouped closely together in the exact same 2x2 square formation. Two balls are filled solid blue with bold black outlines, and the other two balls have a pale light grey fill with the same bold black outlines. Pure white background, no boxes, no other shapes, no arrows.",
  ].join("\n");

  console.log("Generating 'all'...");
  await generateToFile({
    prompt: allPrompt,
    out: `${BRAIN_DIR}/batch6_all_reroll.png`,
  });
  console.log("Generated 'all'!");

  console.log("Generating 'some'...");
  await generateToFile({
    prompt: somePrompt,
    out: `${BRAIN_DIR}/batch6_some_reroll.png`,
  });
  console.log("Generated 'some'!");
}

main().catch(console.error);
