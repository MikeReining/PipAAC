// Source-map collector — the shared page machinery for the browser engines.
// serp.mjs runs inside the page: its source is injected as window.__seo so the
// same functions serve both page.evaluate and the linkedom-backed tests.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { slug, sleep } from "./rows.mjs";

export class WallStop extends Error {
  constructor(kind) {
    super(kind);
    this.kind = kind;
  }
}

const SERP_FUNCTIONS = [
  "extractSuggestions",
  "extractSerp",
  "extractChatGPT",
  "detectWall",
  "pageEvidence",
];
const SERP_SRC =
  "window.__seo = (() => {\n" +
  readFileSync(new URL("./serp.mjs", import.meta.url), "utf8").replace(/^export /gm, "") +
  `\nreturn { ${SERP_FUNCTIONS.join(", ")} };\n})();`;

// Injecting mid-navigation can race a document swap; evaluate throws and the
// caller's poll loop retries on the next tick.
export async function inject(page) {
  await page.evaluate(SERP_SRC);
}

export async function checkWall(page) {
  const kind = await page.evaluate("window.__seo && window.__seo.detectWall(document, location.href)");
  if (kind) throw new WallStop(kind);
}

export async function callSerp(page, fn) {
  return page.evaluate(`window.__seo.${fn}(document)`);
}

// Poll for a selector while watching for a wall — a captcha or consent page
// never shows the selector, so waiting on it alone would misreport the wall
// as a timeout.
export async function waitFor(page, sel, ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const state = await page
      .evaluate(
        `(() => { if (!window.__seo) { ${SERP_SRC} }
          return { wall: window.__seo.detectWall(document, location.href),
                   found: !!document.querySelector(${JSON.stringify(sel)}) }; })()`,
      )
      .catch(() => null);
    if (state && state.wall) throw new WallStop(state.wall);
    if (state && state.found) return true;
    await sleep(400);
  }
  return false;
}

export async function savePage(page, runDir, engine, question) {
  const evidence = await callSerp(page, "pageEvidence");
  const file = path.join(runDir, `${engine}-${slug(question)}.txt`);
  writeFileSync(file, evidence);
  const marker = "=== LINKS ON PAGE ===";
  const links = new Set(
    evidence
      .split("\n")
      .slice(evidence.split("\n").indexOf(marker) + 1)
      .map((l) => l.split("\t")[0].trim())
      .filter(Boolean),
  );
  return { file, links };
}

// Hold the process while the founder clears a wall in the open window, then
// exit 2 so the run can be rerun. Saved phrases stay saved.
export async function holdForWall(context, kind) {
  console.log(`wall: ${kind} — finish the check in the open window, then rerun.`);
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    await sleep(2000);
    const pages = context.pages();
    if (!pages.length) break;
    const still = await pages[0]
      .evaluate(
        `(() => { if (!window.__seo) { ${SERP_SRC} }
          return window.__seo.detectWall(document, location.href); })()`,
      )
      .catch(() => null);
    if (!still) break;
  }
}
