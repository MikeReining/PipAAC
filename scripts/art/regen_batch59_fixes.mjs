import { generateToFile } from "./gen.mjs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

async function regen() {
  console.log("Regenerating ready to go v2...");
  await generateToFile({
    word: "ready to go",
    torso: "pink",
    framing: "full",
    hint: "A stick figure with a pure white circular head, black dot eyes, smiling mouth, and black outlines. Pink torso. Wearing a small backpack, standing at an open brown doorframe ready to leave, stepping enthusiastically forward. Hands and head must be pure white with black outlines.",
    out: `${BRAIN_DIR}/batch59_ready_to_go_v2.png`,
  });

  console.log("Regenerating wow v2...");
  await generateToFile({
    word: "wow",
    torso: "pink",
    framing: "bust",
    hint: "A stick figure with a pure white head and black outlines, pink torso. Both arms are clearly drawn with hands touching the sides of the face in delightful astonishment. Mouth open in a clean round O of awe. Two clean solid black dot eyes wide open with wonder. Cheerful surprised smile.",
    out: `${BRAIN_DIR}/batch59_wow_v2.png`,
  });

  console.log("Regenerating maybe v2...");
  await generateToFile({
    word: "maybe",
    torso: "pink",
    framing: "bust",
    hint: "A stick figure with a pure white head, black outlines, pink torso. The stick figure tilts their head quizzically and holds both hands out in front with open palms facing upward, with one hand held slightly higher than the other like weighing two options on a balance scale. Puzzled gentle half-smile.",
    out: `${BRAIN_DIR}/batch59_maybe_v2.png`,
  });

  console.log("Done regenerating fixes!");
}

regen().catch(console.error);
