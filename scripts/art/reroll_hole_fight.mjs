import { generateToFile } from "./gen.mjs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

async function reroll() {
  console.log("[reroll] Rolling hole v2 (ground pit with soil mound and shovel)...");
  await generateToFile({
    word: "hole",
    hint: "A clean minimalist depiction of a hole in the ground on a pure white background. A neat circular hole dug into a patch of green grass lawn, with dark shaded depth descending down into the hole. Right beside the hole sits a small neat mound of freshly dug brown soil earth, with a small garden shovel standing upright in the dirt pile. Pure white background, bold black outline, monoline vector clipart.",
    framing: "object",
    social_scale: "zero",
    out: `${BRAIN_DIR}/batch76_muse_hole_v2.png`,
  });
  console.log("[reroll] hole v2 done!");

  console.log("[reroll] Rolling fight v2 (Pip solo boxer with red gloves)...");
  await generateToFile({
    word: "fight",
    hint: "A minimalist stick figure bust with a solid green torso ready to fight on a pure white background. Pip is facing forward in an athletic boxing guard stance, raising both hands wearing large bold red padded boxing gloves up in front of the chin, with a determined focused expression ready to spar. Pure white background, bold black outline, monoline vector clipart.",
    framing: "bust",
    social_scale: "solo",
    torso: "green",
    out: `${BRAIN_DIR}/batch76_muse_fight_v2.png`,
  });
  console.log("[reroll] fight v2 done!");
}

reroll();
