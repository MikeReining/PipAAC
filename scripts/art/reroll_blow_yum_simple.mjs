import { generateToFile } from "./gen.mjs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

async function reroll() {
  console.log("[reroll] Rolling blow v3 (simple: Pip blowing up a balloon)...");
  await generateToFile({
    word: "blow",
    hint: "Pip blowing up a round red balloon.",
    framing: "bust",
    social_scale: "solo",
    torso: "green",
    out: `${BRAIN_DIR}/batch77_muse_blow_v3.png`,
  });
  console.log("[reroll] blow v3 done!");

  console.log("[reroll] Rolling yum v3 (simple: circular smiley face with mouth and tongue expressing yummy)...");
  await generateToFile({
    word: "yum",
    hint: "A circular smiley face with happy closed eyes and tongue expressing 'yummy'.",
    framing: "face",
    social_scale: "solo",
    out: `${BRAIN_DIR}/batch77_muse_yum_v3.png`,
  });
  console.log("[reroll] yum v3 done!");
}

reroll();
