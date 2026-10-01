import sharp from "sharp";
const ARTIFACT_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

const YELLOW_TOP = "#ffde59";
const YELLOW_LEFT = "#f4b41a";
const YELLOW_RIGHT = "#df9e0b";
const BLACK = "#111111";

// 7. something: Cube with a question mark badge in upper right
const somethingSvg = `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" fill="#ffffff"/>
  <!-- Isometric Cube slightly left-centered -->
  <g stroke="${BLACK}" stroke-width="24" stroke-linejoin="round" stroke-linecap="round">
    <polygon points="460,320 680,440 460,560 240,440" fill="${YELLOW_TOP}"/>
    <polygon points="240,440 460,560 460,800 240,680" fill="${YELLOW_LEFT}"/>
    <polygon points="680,440 460,560 460,800 680,680" fill="${YELLOW_RIGHT}"/>
  </g>
  <!-- Question Mark Badge in upper right -->
  <g stroke="${BLACK}" stroke-width="16" stroke-linejoin="round" stroke-linecap="round">
    <circle cx="760" cy="260" r="140" fill="#ffffff"/>
    <text x="760" y="325" font-family="sans-serif" font-size="190" font-weight="900" fill="${BLACK}" text-anchor="middle" stroke="none">?</text>
  </g>
</svg>
`;

await sharp(Buffer.from(somethingSvg)).png().toFile(`${ARTIFACT_DIR}/batch62_something.png`);

// 8. someone: Pip persona (assets/symbols/person.png) with Question Mark Badge in upper right
const questionBadgeSvg = `
<svg width="1600" height="1600" viewBox="0 0 1600 1600" xmlns="http://www.w3.org/2000/svg">
  <g stroke="${BLACK}" stroke-width="24" stroke-linejoin="round" stroke-linecap="round">
    <circle cx="1280" cy="280" r="180" fill="#ffffff"/>
    <text x="1280" y="365" font-family="sans-serif" font-size="250" font-weight="900" fill="${BLACK}" text-anchor="middle" stroke="none">?</text>
  </g>
</svg>
`;

await sharp("assets/symbols/person.png")
  .composite([{ input: Buffer.from(questionBadgeSvg), top: 0, left: 0 }])
  .png()
  .toFile(`${ARTIFACT_DIR}/batch62_someone.png`);

console.log("Created something and someone");
