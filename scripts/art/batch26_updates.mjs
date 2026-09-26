import { generateToFile } from "./gen.mjs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

async function run() {
  console.log("Generating kiss roll 2...");
  await generateToFile({
    word: "kiss",
    torso: "green",
    framing: "bust",
    hint: "Close-up bust shot of a stick figure with a solid green torso blowing a kiss. The mouth is puckered into a distinct small round 'o' shape blowing air forward. One hand is held up near the puckered lips with an open palm tilted upward blowing, and a single clean solid red heart floats gently in the air just in front of the hand with small subtle air puff motion dashes. Eyes closed in happy curved arcs. Head fills ~50% of the square frame. Pure white background, bold black outline.",
    out: `${BRAIN_DIR}/batch26_kiss_roll2.png`,
  });
  console.log("Done kiss roll 2!");

  console.log("Generating sleep roll 2 (no wooden bed, large pillow, blue blanket, Zzz)...");
  await generateToFile({
    word: "sleep",
    torso: "green",
    framing: "bust",
    hint: "Close-up square framing of a stick figure with a solid green shirt sleeping peacefully in bed, with no wooden bed frame. The figure's head rests sideways on a large, soft white pillow with peaceful closed curved eyes and a serene gentle smile. A cozy blue blanket is pulled up snugly to mid-chest with hands resting over the top edge. Three clean black 'Z z z' symbols float gently in the air above the head. Head and pillow fill ~65% of the square frame. Pure white background, bold black outline.",
    out: `${BRAIN_DIR}/batch26_sleep_roll2.png`,
  });
  console.log("Done sleep roll 2!");
}

run().catch((err) => {
  console.error("Failed to generate updates:", err);
  process.exit(1);
});
