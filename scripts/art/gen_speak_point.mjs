import { generateToFile } from "./gen.mjs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

async function run() {
  console.log("Generating speak roll 2 (pointing to mouth, solo bust with green shirt)...");
  const res = await generateToFile({
    word: "speak",
    torso: "green",
    framing: "bust",
    hint: "Close-up bust shot of a single stick figure with a solid green torso and an open smiling mouth. One hand is raised with a single extended index finger pointing directly toward the mouth in the clinical speech cue for 'speak'. The other arm curves naturally down along the torso. Head fills ~50% of the frame. Pure white background, bold monoline black outline.",
    out: `${BRAIN_DIR}/batch24_speak_roll2.png`,
  });
  console.log("Generated prompt:\n", res.prompt);
  console.log("Saved to:", res.dest);
}

run().catch((err) => {
  console.error("Error generating speak roll 2:", err);
  process.exit(1);
});
