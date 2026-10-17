#!/usr/bin/env node
/**
 * Symbol-size probe: boots the real board at iPad sizes, switches the
 * Cells layout, and measures what a child sees — rendered tile, label
 * strip, label font, and the drawn symbol — from the page's own boxes.
 * Medians over picture tiles. Run against an agent copy:
 *   node scripts/probes/symbol_size_probe.mjs [origin] [screenshot dir]
 * Baseline 2026-10-16 (10th-gen iPad landscape, before → after the
 * one-line label strip + landscape side strip): grid60 symbol 59 → 78px,
 * grid90 34 → 47px, grid90 label 8 → 11px.
 */
import { chromium } from "playwright-core";

const ORIGIN = process.argv[2] ?? "http://localhost:21088";
const SHOTS = process.argv[3] ?? null;
const SIZES = {
  "iPad10-land": [1180, 820], "iPad10-port": [820, 1180],
  "iPadMini-land": [1133, 744], "iPadPro13-land": [1376, 1032],
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
for (const [name, [width, height]] of Object.entries(SIZES)) {
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`${ORIGIN}/?reseed`);
  await page.waitForFunction(
    () => window.pip?.db && document.querySelectorAll("#grid .cell img").length > 10,
    null, { timeout: 60000 },
  );
  for (const layout of ["grid60", "grid90"]) {
    await page.evaluate((l) => {
      window.pip.db.prepare("UPDATE learner_profile SET board_layout = ? WHERE id = 'prf_local'").run(l);
      window.pip.repaint();
    }, layout);
    await page.waitForTimeout(2500); // fonts.ready + the label fit pass
    const m = await page.evaluate(() => {
      const cells = [...document.querySelectorAll("#grid .cell")].filter((c) => c.querySelector(".tart img"));
      const box = (e) => e.getBoundingClientRect();
      const med = (a) => Math.round(a.sort((x, y) => x - y)[a.length >> 1]);
      return {
        tile: `${med(cells.map((c) => box(c).width))}x${med(cells.map((c) => box(c).height))}`,
        strip: med(cells.map((c) => box(c.querySelector(".tlabel")).height)),
        font: med(cells.map((c) => parseFloat(getComputedStyle(c.querySelector(".tlabel")).fontSize))),
        symbol: med(cells.map((c) => Math.min(box(c.querySelector(".tart img")).width, box(c.querySelector(".tart img")).height))),
      };
    });
    console.log(name.padEnd(15), layout, JSON.stringify(m));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-${layout}.png` });
  }
  await ctx.close();
}
await browser.close();
