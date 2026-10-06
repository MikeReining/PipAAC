// Source-map collector — Slice B: ChatGPT at chatgpt.com in the collector's
// Chrome window. A new chat per phrase, the phrase sent as written, citation
// links only — URLs in the model's prose are not citations.

import { inject, checkWall, callSerp, waitFor, savePage } from "./browser.mjs";
import { linkRows, makeRow, assertInEvidence, sleep } from "./rows.mjs";

const QUERY_TIMEOUT_MS = 30_000;

// Returns true when the phrase was processed; false when the composer never
// appeared, meaning the engine is not usable this run.
export async function chatgptPhrase(page, runDir, phrase, date, emit, notes) {
  await page.goto("https://chatgpt.com/", { waitUntil: "domcontentloaded" });
  await inject(page);
  await checkWall(page);
  const composerSel = '#prompt-textarea, div[contenteditable="true"], textarea';
  if (!(await waitFor(page, composerSel, 15000))) return false;
  const composer = await page.$(composerSel);
  await composer.click();
  await page.keyboard.type(phrase, { delay: 40 + Math.random() * 30 });
  await page.keyboard.press("Enter");
  if (
    !(await waitFor(
      page,
      '[data-message-author-role="assistant"], .agent-turn, article',
      QUERY_TIMEOUT_MS,
    ))
  ) {
    notes.push(`chatgpt — "${phrase}": timed out`);
    return true;
  }
  // Wait until the answer stops: body text stable across three 1s samples,
  // or the same 30s give-up fires.
  let last = "";
  let stable = 0;
  const deadline = Date.now() + QUERY_TIMEOUT_MS;
  while (Date.now() < deadline && stable < 3) {
    const text = await page.evaluate(() => document.body.innerText).catch(() => "");
    if (text === last) stable += 1;
    else {
      stable = 0;
      last = text;
    }
    await sleep(1000);
  }
  try {
    await page.locator('button:has-text("Sources")').first().click({ timeout: 1500 });
    await sleep(800);
  } catch {
    // no sources panel — links may still be footnotes or cards
  }
  const { links: evidenceSet } = await savePage(page, runDir, "chatgpt", phrase);
  const citations = await callSerp(page, "extractChatGPT");
  const rows = citations.length
    ? linkRows("ChatGPT", phrase, citations, date)
    : [{ ...makeRow("ChatGPT", phrase, "", "", date), note: "no citations shown" }];
  if (!citations.length) notes.push(`chatgpt — "${phrase}": no citations shown`);
  assertInEvidence(rows, evidenceSet, "chatgpt", phrase);
  emit(rows);
  return true;
}
