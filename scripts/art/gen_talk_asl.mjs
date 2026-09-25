import { generateToFile } from "./gen.mjs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

async function run() {
  console.log("Generating ASL talk roll 2 (two-handed reciprocal converse sign, solo bust)...");
  const res = await generateToFile({
    word: "talk",
    torso: "green",
    framing: "bust",
    hint: "Close-up bust shot of a single stick figure with a solid green torso and warm engaged smile. The stick figure is performing the American Sign Language (ASL) sign for TALK / CONVERSE: both hands are held in front of the chest with index fingers pointing upward, alternating back and forth toward each other in reciprocal dialogue. Head fills ~50% of the frame. Pure white background, bold black outline.",
    out: `${BRAIN_DIR}/batch24_talk_roll2.png`,
  });
  console.log("Generated prompt:", res.prompt);
  console.log("Saved to:", res.dest);
}

run().catch((err) => {
  console.error("Error generating ASL talk:", err);
  process.exit(1);
});
