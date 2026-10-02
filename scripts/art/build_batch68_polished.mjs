import sharp from "sharp";
import { writeFileSync, readFileSync } from "node:fs";

const BRAIN_DIR = "/Users/mike/.gemini/antigravity/brain/c15bf114-5b79-4930-9236-a703da47f805";

export async function buildPolishedBatch68() {
  console.log("=== Building Polished Batch 68 Images ===");

  // ----------------------------------------------------
  // 1. SAY: Clean floating speech bubble with gap from head
  // ----------------------------------------------------
  const W_TALK = 1600, H_TALK = 1600;
  // White patch to erase sound waves in x >= 1135, y <= 980
  const patchTalkSvg = `
    <svg width="${W_TALK}" height="${H_TALK}" viewBox="0 0 ${W_TALK} ${H_TALK}" xmlns="http://www.w3.org/2000/svg">
      <rect x="1135" y="0" width="${W_TALK - 1135}" height="980" fill="#FFFFFF"/>
    </svg>
  `;
  const cleanTalk = await sharp("assets/symbols/talk.png")
    .composite([{ input: Buffer.from(patchTalkSvg), top: 0, left: 0 }])
    .png()
    .toBuffer();

  // Floating speech bubble with clear margin from head outline
  const bubbleSvg = `
    <svg width="1600" height="1600" viewBox="0 0 1600 1600" xmlns="http://www.w3.org/2000/svg">
      <path d="
        M 1260 350
        L 1520 350
        A 50 50 0 0 1 1570 400
        L 1570 590
        A 50 50 0 0 1 1520 640
        L 1310 640
        L 1145 715
        L 1245 640
        L 1260 640
        A 50 50 0 0 1 1210 590
        L 1210 400
        A 50 50 0 0 1 1260 350
        Z
      " fill="#FFFFFF" stroke="#111111" stroke-width="26" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>
  `;

  const sayBuf = await sharp(cleanTalk)
    .composite([{ input: Buffer.from(bubbleSvg), top: 0, left: 0 }])
    .png()
    .toBuffer();

  writeFileSync(`${BRAIN_DIR}/batch68_norm_say.png`, sayBuf);
  console.log("Wrote polished batch68_norm_say.png");

  // ----------------------------------------------------
  // 2. HEY: Grounded bust baseline matching say
  // ----------------------------------------------------
  const hiFigure = await sharp("assets/symbols/hi.png")
    .extract({ left: 100, top: 80, width: 1400, height: 1375 })
    .toBuffer();

  const heyBuf = await sharp({
    create: { width: 1600, height: 1600, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
  })
    .composite([{ input: hiFigure, left: 100, top: 225 }])
    .png()
    .toBuffer();

  writeFileSync(`${BRAIN_DIR}/batch68_norm_hey.png`, heyBuf);
  console.log("Wrote polished batch68_norm_hey.png");

  // ----------------------------------------------------
  // 3. WELL: Canonical flared pink torso, hand to chin, thoughtful smile, grounded
  // ----------------------------------------------------
  const smileSvg = `
    <svg width="1600" height="1600" viewBox="0 0 1600 1600" xmlns="http://www.w3.org/2000/svg">
      <!-- Cover flat mouth line -->
      <rect x="870" y="650" width="120" height="70" fill="#FFFFFF"/>
      <!-- Gentle thinking smile -->
      <path d="M 875 675 Q 925 715 975 670" fill="none" stroke="#111111" stroke-width="26" stroke-linecap="round"/>
    </svg>
  `;

  const wellBuf = await sharp("assets/symbols/why.png")
    .composite([{ input: Buffer.from(smileSvg), top: 0, left: 0 }])
    .png()
    .toBuffer();

  writeFileSync(`${BRAIN_DIR}/batch68_norm_well.png`, wellBuf);
  console.log("Wrote polished batch68_norm_well.png");

  // ----------------------------------------------------
  // 4. LET'S: Grounded two figures + green arrow with generous air cushion
  // ----------------------------------------------------
  const weFigures = await sharp("assets/symbols/we.png")
    .extract({ left: 60, top: 270, width: 1480, height: 1090 })
    .toBuffer();

  const arrowSvg = `
    <svg width="1600" height="1600" viewBox="0 0 1600 1600" xmlns="http://www.w3.org/2000/svg">
      <path d="
        M 550 190
        L 940 190
        L 940 110
        L 1150 250
        L 940 390
        L 940 310
        L 550 310
        Z
      " fill="#31A44B" stroke="#111111" stroke-width="26" stroke-linejoin="round"/>
    </svg>
  `;

  const letsBuf = await sharp({
    create: { width: 1600, height: 1600, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
  })
    .composite([
      { input: weFigures, left: 60, top: 500 },
      { input: Buffer.from(arrowSvg), left: 0, top: 0 }
    ])
    .png()
    .toBuffer();

  writeFileSync(`${BRAIN_DIR}/batch68_norm_lets.png`, letsBuf);
  console.log("Wrote polished batch68_norm_lets.png");

  // ----------------------------------------------------
  // 5. GONE: Muse dashed outline silhouette + cartoon dust puff
  // ----------------------------------------------------
  const rawGone = await sharp(`${BRAIN_DIR}/batch68_muse_gone.png`).toBuffer();
  // Tight crop with standard padding
  const trimmedGone = await sharp(rawGone).trim({ threshold: 10 }).toBuffer();
  const goneMeta = await sharp(trimmedGone).metadata();
  const gonePad = Math.max(12, Math.round(Math.max(goneMeta.width, goneMeta.height) * 0.035));
  const goneBuf = await sharp(trimmedGone)
    .extend({ top: gonePad, bottom: gonePad, left: gonePad, right: gonePad, background: { r: 255, g: 255, b: 255 } })
    .png()
    .toBuffer();
  writeFileSync(`${BRAIN_DIR}/batch68_norm_gone.png`, goneBuf);
  console.log("Wrote batch68_norm_gone.png");

  // ----------------------------------------------------
  // 6. LET: Pip by open door with warm wood open door leaf + brass knob
  // ----------------------------------------------------
  const W_LET = 1920, H_LET = 1280;
  const doorSvg = `
    <svg width="${W_LET}" height="${H_LET}" viewBox="0 0 ${W_LET} ${H_LET}" xmlns="http://www.w3.org/2000/svg">
      <!-- Open Door Leaf in Perspective -->
      <polygon points="1370,205 1160,270 1160,1105 1370,1166" fill="#945C34" stroke="#111111" stroke-width="24" stroke-linejoin="round"/>
      <!-- Recessed panel detail 1 (upper) -->
      <polygon points="1340,300 1195,345 1195,620 1340,610" fill="#7D4C2A" stroke="#111111" stroke-width="14" stroke-linejoin="round"/>
      <!-- Recessed panel detail 2 (lower) -->
      <polygon points="1340,680 1195,690 1195,1030 1340,1070" fill="#7D4C2A" stroke="#111111" stroke-width="14" stroke-linejoin="round"/>
      <!-- Doorknob on swinging edge -->
      <circle cx="1200" cy="655" r="28" fill="#FBBF24" stroke="#111111" stroke-width="14"/>
    </svg>
  `;

  const rawLetWithDoor = await sharp(`${BRAIN_DIR}/batch68_muse_let.png`)
    .composite([{ input: Buffer.from(doorSvg), top: 0, left: 0 }])
    .png()
    .toBuffer();

  const trimmedLet = await sharp(rawLetWithDoor).trim({ threshold: 10 }).toBuffer();
  const letMeta = await sharp(trimmedLet).metadata();
  const letPad = Math.max(12, Math.round(Math.max(letMeta.width, letMeta.height) * 0.035));
  const letBuf = await sharp(trimmedLet)
    .extend({ top: letPad, bottom: letPad, left: letPad, right: letPad, background: { r: 255, g: 255, b: 255 } })
    .png()
    .toBuffer();

  writeFileSync(`${BRAIN_DIR}/batch68_norm_let.png`, letBuf);
  console.log("Wrote polished batch68_norm_let.png");

  // ----------------------------------------------------
  // 7. SAID: say.png + crisp vector past badge [ ◀◀ ]
  // ----------------------------------------------------
  const badgeSvg = `
    <svg width="1600" height="1600" viewBox="0 0 1600 1600" xmlns="http://www.w3.org/2000/svg">
      <!-- Pill container -->
      <rect x="1163" y="82" width="354" height="174" rx="87" fill="#FFFFFF" stroke="#111111" stroke-width="26"/>
      <!-- Left triangle -->
      <polygon points="1328,122 1238,169 1328,216" fill="#111111"/>
      <!-- Right triangle -->
      <polygon points="1425,122 1335,169 1425,216" fill="#111111"/>
    </svg>
  `;

  const saidBuf = await sharp(sayBuf)
    .composite([{ input: Buffer.from(badgeSvg), top: 0, left: 0 }])
    .png()
    .toBuffer();

  writeFileSync(`${BRAIN_DIR}/batch68_norm_said.png`, saidBuf);
  console.log("Wrote polished batch68_norm_said.png");

  // ----------------------------------------------------
  // 8. WAY: Direct reuse of road.png
  // ----------------------------------------------------
  const roadBuf = readFileSync("assets/symbols/road.png");
  writeFileSync(`${BRAIN_DIR}/batch68_norm_way.png`, roadBuf);
  console.log("Wrote batch68_norm_way.png");

  // ----------------------------------------------------
  // 9. WATCH: Replace star with white Play triangle ▶ on screen
  // ----------------------------------------------------
  const W_WATCH = 1920, H_WATCH = 1280;
  const playSvg = `
    <svg width="${W_WATCH}" height="${H_WATCH}" viewBox="0 0 ${W_WATCH} ${H_WATCH}" xmlns="http://www.w3.org/2000/svg">
      <!-- Cover star with screen blue -->
      <rect x="1100" y="450" width="300" height="280" fill="#0C3967"/>
      <!-- Crisp white play button -->
      <polygon points="1200,495 1200,685 1355,590" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="12" stroke-linejoin="round"/>
    </svg>
  `;

  const rawWatchWithPlay = await sharp(`${BRAIN_DIR}/batch68_muse_watch.png`)
    .composite([{ input: Buffer.from(playSvg), top: 0, left: 0 }])
    .png()
    .toBuffer();

  const trimmedWatch = await sharp(rawWatchWithPlay).trim({ threshold: 10 }).toBuffer();
  const watchMeta = await sharp(trimmedWatch).metadata();
  const watchPad = Math.max(12, Math.round(Math.max(watchMeta.width, watchMeta.height) * 0.035));
  const watchBuf = await sharp(trimmedWatch)
    .extend({ top: watchPad, bottom: watchPad, left: watchPad, right: watchPad, background: { r: 255, g: 255, b: 255 } })
    .png()
    .toBuffer();

  writeFileSync(`${BRAIN_DIR}/batch68_norm_watch.png`, watchBuf);
  console.log("Wrote polished batch68_norm_watch.png");

  // ----------------------------------------------------
  // 10. TRY: Tight-cropped Muse image
  // ----------------------------------------------------
  const rawTry = await sharp(`${BRAIN_DIR}/batch68_muse_try.png`).toBuffer();
  const trimmedTry = await sharp(rawTry).trim({ threshold: 10 }).toBuffer();
  const tryMeta = await sharp(trimmedTry).metadata();
  const tryPad = Math.max(12, Math.round(Math.max(tryMeta.width, tryMeta.height) * 0.035));
  const tryBuf = await sharp(trimmedTry)
    .extend({ top: tryPad, bottom: tryPad, left: tryPad, right: tryPad, background: { r: 255, g: 255, b: 255 } })
    .png()
    .toBuffer();

  writeFileSync(`${BRAIN_DIR}/batch68_norm_try.png`, tryBuf);
  console.log("Wrote batch68_norm_try.png");

  console.log("=== All 10 Batch 68 Images Polished Successfully ===");
}

buildPolishedBatch68().catch(console.error);
