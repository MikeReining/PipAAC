import { generateToFile } from "./gen.mjs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

async function run() {
  console.log("Generating car_antique_old...");
  await generateToFile({
    word: "old car",
    framing: "object",
    hint: "A classic antique vintage 1910s oldmobile car on a pure white background. High upright vintage boxy carriage body in dark vintage green or maroon, huge thin spoked carriage wheels, polished brass radiator grille, round brass lantern headlights on front fenders, running boards along the bottom, and a classic vintage brass squeeze-bulb horn on the side. Bold clean black outlines, flat cartoon vector clipart style, thick lines, pure white background, no driver, no background, AAC symbol.",
    out: `${BRAIN_DIR}/car_antique_old.png`,
  });
  console.log("Generated car_antique_old.png");

  console.log("Generating car_modern_new...");
  await generateToFile({
    word: "new electric car",
    framing: "object",
    hint: "A sleek, ultra-modern aerodynamic electric car (Tesla-style EV sedan) on a pure white background. Streamlined futuristic curves in bright shiny vibrant electric blue, smooth aerodynamic glass roof, sleek minimalist front with narrow modern LED headlights, modern aerodynamic turbine alloy wheels, flush door handles, gleaming showroom shine with a bright yellow twinkle star sparkle near the hood. Bold clean black outlines, flat cartoon vector clipart style, thick lines, pure white background, no driver, no background, AAC symbol.",
    out: `${BRAIN_DIR}/car_modern_new.png`,
  });
  console.log("Generated car_modern_new.png");
}

run().catch((err) => {
  console.error("Generation error:", err);
  process.exit(1);
});
