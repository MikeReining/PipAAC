import { generateToFile } from "./gen.mjs";
import sharp from "sharp";
import { copyFileSync, existsSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

async function run() {
  console.log("Generating refined fall (strictly 2 legs, 2 arms, slipping backward)...");
  await generateToFile({
    word: "fall",
    torso: "green",
    framing: "full",
    hint: "The stick figure is slipping backward in mid-air and losing balance. The figure has exactly two arms flailing outward in the air and exactly two legs kicked up in front of them, with a small yellow banana peel on the ground below. Exactly two arms and exactly two legs, zero extra limbs.",
    out: `${BRAIN_DIR}/batch23_fall_roll2.png`,
  });
  console.log("Done fall_roll2");

  console.log("Generating refined catch (baseball glove catching ball)...");
  await generateToFile({
    word: "catch",
    torso: "green",
    framing: "full",
    hint: "The stick figure is wearing a prominent brown leather baseball glove on their hand, catching a red baseball that is landing right into the glove pocket with a subtle impact star. The other arm rests naturally at their side. Clearly catching the ball in the mitt.",
    out: `${BRAIN_DIR}/batch23_catch_roll2.png`,
  });
  console.log("Done catch_roll2");

  console.log("Generating refined drop (tumbling cup spilling water mid-air)...");
  await generateToFile({
    word: "drop",
    torso: "green",
    framing: "full",
    hint: "The stick figure has both hands held open in surprise at chest height. Right beneath their open hands, a blue cup is tumbling upside-down in mid-air, spilling a splash of water, with downward motion streak lines showing that the cup has just been dropped and is falling toward the floor.",
    out: `${BRAIN_DIR}/batch23_drop_roll2.png`,
  });
  console.log("Done drop_roll2");
}

run().catch((err) => {
  console.error("Error generating fixes:", err);
  process.exit(1);
});
