import { generateToFile } from "./gen.mjs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

async function reroll() {
  console.log("[reroll] Rolling even v2 (slender vertical scale, strictly level horizontal beam)...");
  await generateToFile({
    word: "even",
    hint: "A clean minimalist depiction of 'even' (equal and balanced) on a pure white background. A classic two-pan balance scale with a slender narrow vertical center post and a compact base. The crossbar balance beam is strictly horizontal, perfectly level and flat with zero tilt. Two identical small blue cubes of equal weight sit on the left and right pans in perfect balance. Pure white background, bold black outline, monoline vector clipart.",
    framing: "object",
    social_scale: "zero",
    out: `${BRAIN_DIR}/batch77_muse_even_v2.png`,
  });
  console.log("[reroll] even v2 done!");

  console.log("[reroll] Rolling yum v2 (clean circular face icon licking lips, no torso)...");
  await generateToFile({
    word: "yum",
    hint: "A clean minimalist emoji-style face icon for 'yum' on a pure white background. A simple bold round circular head outline, with two happy closed crescent smiling eyes and a cheerful open smile with a cute pink tongue licking the corner of the mouth in delight. Pure white background, bold black outline, monoline vector clipart.",
    framing: "object",
    social_scale: "zero",
    out: `${BRAIN_DIR}/batch77_muse_yum_v2.png`,
  });
  console.log("[reroll] yum v2 done!");

  console.log("[reroll] Rolling blow v2 (Pip blowing up a red balloon with puffed cheeks)...");
  await generateToFile({
    word: "blow",
    hint: "A minimalist stick figure bust with a solid green torso blowing up a balloon on a pure white background. Pip is in side profile holding a bright red balloon to the mouth with both hands, with round puffed-out cheeks, actively blowing air to inflate the round balloon. Pure white background, bold black outline, monoline vector clipart.",
    framing: "bust",
    social_scale: "solo",
    torso: "green",
    out: `${BRAIN_DIR}/batch77_muse_blow_v2.png`,
  });
  console.log("[reroll] blow v2 done!");
}

reroll();
