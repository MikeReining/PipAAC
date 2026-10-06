import { generateToFile } from "./gen.mjs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

async function reroll() {
  console.log("[reroll] Rolling floor v2 (room corner with walls and baseboard)...");
  await generateToFile({
    word: "floor",
    hint: "A clean minimalist depiction of an interior room floor on a pure white background. An interior room corner where two pale light gray walls meet, with a neat clean baseboard trim running along the bottom of the walls. The wooden plank floor extends cleanly out from the baseboard into the foreground, clearly defining the floor of the room. Pure white background, bold black outline, monoline vector clipart.",
    framing: "object",
    social_scale: "zero",
    out: `${BRAIN_DIR}/batch75_muse_floor_v2.png`,
  });
  console.log("[reroll] floor v2 done!");

  console.log("[reroll] Rolling knock v2 (Pip knocking on door)...");
  await generateToFile({
    word: "knock",
    hint: "A minimalist stick figure bust with a solid green torso knocking on a door on a pure white background. Pip is standing next to a wooden door with a door handle, raising one arm with a closed fist to rap knuckles firmly against the door panel, with two neat curved impact sound vibration arcs radiating from where the knuckles strike the door. Pure white background, bold black outline, monoline vector clipart.",
    framing: "bust",
    social_scale: "solo",
    torso: "green",
    out: `${BRAIN_DIR}/batch75_muse_knock_v2.png`,
  });
  console.log("[reroll] knock v2 done!");
}

reroll();
