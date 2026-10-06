// Source-map collector — Slice A: Google. Seed expansion from the suggestion
// dropdown, People Also Ask, and related searches; citation rows from the
// first results page's organic list and the AI overview when it is shown.

import { inject, checkWall, callSerp, waitFor, savePage } from "./browser.mjs";
import { linkRows, assertInEvidence, sleep } from "./rows.mjs";

const QUERY_TIMEOUT_MS = 30_000;

async function waitSerp(page, question, notes) {
  const found = await waitFor(page, "#search, #rso, #center_col", QUERY_TIMEOUT_MS);
  if (!found) notes.push(`google — "${question}": timed out`);
  else await sleep(600);
  return found;
}

function serpToRows(serp, question, date, notes) {
  if (serp.aiOverview === null) notes.push(`google — "${question}": no AI overview`);
  if (!serp.organic.length) notes.push(`google — "${question}": no organic results`);
  return [
    ...linkRows("Google", question, serp.organic, date),
    ...linkRows("Google AI", question, serp.aiOverview ?? [], date),
  ];
}

// Expansion pass: type each seed, read the dropdown, Enter, then read the
// whole results page. Persisted per seed in expansion.json so an interrupted
// run resumes instead of re-asking Google.
export async function googleSeed(page, runDir, seed, date, emit, notes) {
  await page.goto("https://www.google.com/", { waitUntil: "domcontentloaded" });
  await inject(page);
  await checkWall(page);
  if (!(await waitFor(page, 'textarea[name="q"], input[name="q"]', QUERY_TIMEOUT_MS))) {
    notes.push(`google — "${seed}": timed out`);
    return { extras: [], done: false };
  }
  const box = await page.$('textarea[name="q"], input[name="q"]');
  await box.click();
  await page.keyboard.type(seed, { delay: 50 + Math.random() * 40 });
  let suggestions = [];
  try {
    await page.waitForSelector('[role="option"]', { timeout: 4000 });
    suggestions = await callSerp(page, "extractSuggestions");
  } catch {
    // dropdown stayed closed — still press Enter
  }
  await page.keyboard.press("Enter");
  if (!(await waitSerp(page, seed, notes))) return { extras: [], done: false };
  const { links } = await savePage(page, runDir, "google", seed);
  const serp = await callSerp(page, "extractSerp");
  const rows = serpToRows(serp, seed, date, notes);
  assertInEvidence(rows, links, "google", seed);
  emit(rows);
  return { extras: [...suggestions, ...serp.peopleAlsoAsk, ...serp.related], done: true };
}

// Citation pass for a phrase the expansion pass did not already land on.
export async function googlePhrase(page, runDir, phrase, date, emit, notes) {
  await page.goto(`https://www.google.com/search?q=${encodeURIComponent(phrase)}`, {
    waitUntil: "domcontentloaded",
  });
  await inject(page);
  await checkWall(page);
  if (!(await waitSerp(page, phrase, notes))) return;
  const { links } = await savePage(page, runDir, "google", phrase);
  const serp = await callSerp(page, "extractSerp");
  const rows = serpToRows(serp, phrase, date, notes);
  assertInEvidence(rows, links, "google", phrase);
  emit(rows);
}
