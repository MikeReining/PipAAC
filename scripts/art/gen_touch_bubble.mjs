import { generateToFile } from "./gen.mjs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

async function run() {
  console.log("Generating touch roll 2 (gently touching floating soap bubble, compact solo bust)...");
  const res = await generateToFile({
    word: "touch",
    torso: "green",
    framing: "bust",
    hint: "Close-up bust shot of a single friendly stick figure with a solid green torso centered in the frame. Floating right in front of the stick figure's chest is a single clean, translucent shiny soap bubble with subtle blue-violet highlight reflection. The figure's arm bends naturally forward from the shoulder, gently touching the curved surface of the soap bubble with an extended index finger. The other arm rests naturally along the torso. Head fills ~50% of the frame. Compact square composition, zero outstretched arms. Pure white background, bold black outline.",
    out: `${BRAIN_DIR}/batch25_touch_roll2.png`,
  });
  console.log("Generated prompt:\n", res.prompt);
  console.log("Saved to:", res.dest);
}

run().catch((err) => {
  console.error("Error generating touch roll 2:", err);
  process.exit(1);
});
