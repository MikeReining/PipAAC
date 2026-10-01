import sharp from "sharp";

const YELLOW = "#fcc51d";
const BLACK = "#111111";

const svg = `
<svg width="1600" height="1600" viewBox="0 0 1600 1600" xmlns="http://www.w3.org/2000/svg">
  <rect width="1600" height="1600" fill="#ffffff"/>

  <!-- ==================== LEFT FIGURE: SPEAKER ==================== -->
  <!-- Left arm dangling -->
  <path d="M 260 670 Q 180 1000 110 1350" fill="none" stroke="${BLACK}" stroke-width="26" stroke-linecap="round"/>
  <circle cx="95" cy="1390" r="48" fill="#ffffff" stroke="${BLACK}" stroke-width="26"/>

  <!-- Speaker Torso (white) -->
  <path d="M 280 620 L 210 1450 L 450 1450 L 420 620 Z" fill="#ffffff" stroke="${BLACK}" stroke-width="26" stroke-linejoin="round"/>

  <!-- Pointing Stick Arm: single stroke from right shoulder -->
  <path d="M 420 700 Q 620 730 840 780" fill="none" stroke="${BLACK}" stroke-width="26" stroke-linecap="round"/>

  <!-- Pointing Mitten Hand: single finger extended pointing at listener -->
  <g transform="translate(830, 700) rotate(14)">
    <!-- Wrist cap, thumb, index finger, curled fingers -->
    <path d="M 10 75 
             C 10 40, 30 15, 60 15 
             C 75 15, 85 25, 95 38 
             C 105 38, 120 38, 180 38 
             C 200 38, 205 68, 180 68 
             C 140 68, 130 68, 120 68 
             C 135 75, 140 90, 130 105 
             C 120 115, 105 125, 75 125 
             C 40 125, 10 110, 10 75 Z" 
          fill="#ffffff" stroke="${BLACK}" stroke-width="26" stroke-linejoin="round" stroke-linecap="round"/>
  </g>

  <!-- Speaker Head & Neck -->
  <line x1="330" y1="530" x2="330" y2="620" stroke="${BLACK}" stroke-width="26" stroke-linecap="round"/>
  <circle cx="340" cy="350" r="210" fill="#ffffff" stroke="${BLACK}" stroke-width="26"/>
  <!-- Neutral Face -->
  <ellipse cx="270" cy="340" rx="16" ry="24" fill="${BLACK}"/>
  <ellipse cx="410" cy="340" rx="16" ry="24" fill="${BLACK}"/>
  <line x1="300" y1="450" x2="380" y2="450" stroke="${BLACK}" stroke-width="22" stroke-linecap="round"/>

  <!-- ==================== RIGHT FIGURE: YOU (LISTENER) ==================== -->
  <!-- Bilateral Stick Arms outside torso -->
  <path d="M 1060 690 Q 940 980 880 1300" fill="none" stroke="${BLACK}" stroke-width="26" stroke-linecap="round"/>
  <circle cx="865" cy="1340" r="48" fill="#ffffff" stroke="${BLACK}" stroke-width="26"/>

  <path d="M 1300 690 Q 1420 980 1480 1300" fill="none" stroke="${BLACK}" stroke-width="26" stroke-linecap="round"/>
  <circle cx="1495" cy="1340" r="48" fill="#ffffff" stroke="${BLACK}" stroke-width="26"/>

  <!-- Listener Torso (solid yellow fill, clean trapezoid) -->
  <path d="M 1080 640 L 990 1400 L 1370 1400 L 1280 640 Z" fill="${YELLOW}" stroke="${BLACK}" stroke-width="26" stroke-linejoin="round"/>

  <!-- Listener Head & Neck -->
  <line x1="1180" y1="530" x2="1180" y2="640" stroke="${BLACK}" stroke-width="26" stroke-linecap="round"/>
  <circle cx="1180" cy="350" r="210" fill="#ffffff" stroke="${BLACK}" stroke-width="26"/>
  <!-- Neutral Face (matching legacy you) -->
  <ellipse cx="1110" cy="340" rx="16" ry="24" fill="${BLACK}"/>
  <ellipse cx="1250" cy="340" rx="16" ry="24" fill="${BLACK}"/>
  <line x1="1140" y1="450" x2="1220" y2="450" stroke="${BLACK}" stroke-width="22" stroke-linecap="round"/>

</svg>
`;

await sharp(Buffer.from(svg)).png().toFile("/tmp/vector_you.png");
console.log("Rendered /tmp/vector_you.png");
