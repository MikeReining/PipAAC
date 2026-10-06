#!/usr/bin/env node
// Source-map collector — spec: docs/strategy/seo/Source_Map_Collector.md.
// Drives the installed Chrome (Playwright channel "chrome") with a persistent
// profile at data/seo/profile/. No API calls: the tool reads the same screen
// a person sees and writes down the links that are actually there.

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

import { loadSeeds, playbookSeeds, checkSeeds, expandPhrases } from "./phrases.mjs";
import { domainFor, pageTypeFor, destinationFor } from "./destination.mjs";
import { renderRunNote, mergeMap, domainDiff, parseTableRows } from "./mapfile.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SEEDS_JSON = path.join(ROOT, "docs/strategy/seo/buyer-questions.json");
const PLAYBOOK = path.join(ROOT, "docs/strategy/SEO_Playbook.md");
const DATA_DIR = path.join(ROOT, "data/seo");
const PROFILE_DIR = path.join(DATA_DIR, "profile");
const RUNS_DATA = path.join(DATA_DIR, "runs");
const NOTES_DIR = path.join(ROOT, "docs/strategy/seo/runs");
const MAP_FILE = path.join(ROOT, "docs/strategy/seo/source-map.md");
const LOCK_FILE = path.join(DATA_DIR, "collect.lock");

const QUERY_TIMEOUT_MS = 30_000;
const WALL_EXIT = 2;
const LOCKED_EXIT = 75;
const ENGINES = ["google", "chatgpt"];

// serp.mjs runs inside the page: strip the `export` keywords and expose the
// functions on window.__seo so the same source serves both page.evaluate and
// the linkedom-backed unit tests.
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0, 10);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const pause = () => sleep(3000 + Math.random() * 5000);

function usage() {
  console.log(
    "usage: npm run seo:collect -- [--dry-run] [--check-seeds] [--engine google|chatgpt] [--limit N] [--force]",
  );
  process.exit(2);
}

function parseArgs(argv) {
  const args = { engine: null, limit: null, dryRun: false, checkSeeds: false, force: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--check-seeds") args.checkSeeds = true;
    else if (a === "--force") args.force = true;
    else if (a === "--engine") args.engine = argv[++i];
    else if (a === "--limit") args.limit = Number(argv[++i]);
    else usage();
  }
  if (args.engine != null && !ENGINES.includes(args.engine)) usage();
  if (args.limit != null && (!Number.isInteger(args.limit) || args.limit < 1)) usage();
  return args;
}

export function acquireLock(dataDir = DATA_DIR, lockFile = LOCK_FILE) {
  mkdirSync(dataDir, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      writeFileSync(lockFile, `${process.pid} ${new Date().toISOString()}\n`, { flag: "wx" });
      return { ok: true };
    } catch {
      const holder = existsSync(lockFile) ? readFileSync(lockFile, "utf8").trim() : "unknown";
      const pid = Number(holder.split(" ")[0]);
      if (pid && pid !== process.pid) {
        try {
          process.kill(pid, 0);
          return { ok: false, holder };
        } catch (e) {
          if (e.code === "EPERM") return { ok: false, holder };
          // holder is dead — fall through and reclaim
        }
      }
      rmSync(lockFile, { force: true });
    }
  }
  return { ok: false, holder: "unknown" };
}

export function releaseLock(lockFile = LOCK_FILE) {
  rmSync(lockFile, { force: true });
}

class WallStop extends Error {
  constructor(kind) {
    super(kind);
    this.kind = kind;
  }
}

async function inject(page) {
  await page.evaluate(SERP_SRC);
}

async function checkWall(page) {
  const kind = await page.evaluate("window.__seo && window.__seo.detectWall(document, location.href)");
  if (kind) throw new WallStop(kind);
}

async function callSerp(page, fn, ...args) {
  return page.evaluate(`window.__seo.${fn}(${"document"}${args.length ? ", " + args.map(JSON.stringify).join(", ") : ""})`);
}

async function savePage(page, runDir, engine, question) {
  const evidence = await callSerp(page, "pageEvidence");
  const file = path.join(runDir, `${engine}-${slug(question)}.txt`);
  writeFileSync(file, evidence);
  const links = new Set(
    evidence
      .split("\n")
      .slice(evidence.split("\n").indexOf("=== LINKS ON PAGE ===") + 1)
      .map((l) => l.split("\t")[0].trim())
      .filter(Boolean),
  );
  return { file, links };
}

function makeRow(engine, question, url, title, date) {
  return {
    question,
    engine,
    url,
    domain: domainFor(url),
    pageType: pageTypeFor(url),
    realistic: "",
    destination: destinationFor({ question, url, title }),
    checked: date,
  };
}

// Poll for a selector while watching for a wall — a captcha or consent page
// never shows #search, so waiting on the selector alone would misreport the
// wall as a timeout. Re-injects __seo when navigation wiped it.
async function waitFor(page, sel, ms) {
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

async function waitSerp(page, question, notes) {
  const found = await waitFor(page, "#search, #rso, #center_col", QUERY_TIMEOUT_MS);
  if (!found) notes.push(`google — "${question}": timed out`);
  else await sleep(600);
  return found;
}

function serpRows(engine, question, links, date) {
  return links.map(({ url, title }) => makeRow(engine, question, url, title, date));
}

function assertInEvidence(rows, links, engine, question) {
  for (const r of rows) {
    if (r.url && !links.has(r.url)) {
      throw new Error(`proof failed: ${engine} row url not on the page for "${question}": ${r.url}`);
    }
  }
}

// Type each seed, read the suggestion dropdown, Enter, then read the whole
// results page (organic, AI overview, PAA, related). Persisted per seed in
// expansion.json so an interrupted run resumes instead of re-asking Google.
async function googleSeed(page, runDir, seed, date, emit, notes) {
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
  const rows = [
    ...serpRows("Google", seed, serp.organic, date),
    ...serpRows("Google AI", seed, serp.aiOverview ?? [], date),
  ];
  if (serp.aiOverview === null) notes.push(`google — "${seed}": no AI overview`);
  if (!serp.organic.length) notes.push(`google — "${seed}": no organic results`);
  assertInEvidence(rows, links, "google", seed);
  emit(rows);
  return { extras: [...suggestions, ...serp.peopleAlsoAsk, ...serp.related], done: true };
}

// Citation pass for a phrase the expansion pass did not already land on.
async function googlePhrase(page, runDir, phrase, date, emit, notes) {
  await page.goto(`https://www.google.com/search?q=${encodeURIComponent(phrase)}`, {
    waitUntil: "domcontentloaded",
  });
  await inject(page);
  await checkWall(page);
  if (!(await waitSerp(page, phrase, notes))) return;
  await checkWall(page);
  const { links } = await savePage(page, runDir, "google", phrase);
  const serp = await callSerp(page, "extractSerp");
  const rows = [
    ...serpRows("Google", phrase, serp.organic, date),
    ...serpRows("Google AI", phrase, serp.aiOverview ?? [], date),
  ];
  if (serp.aiOverview === null) notes.push(`google — "${phrase}": no AI overview`);
  assertInEvidence(rows, links, "google", phrase);
  emit(rows);
}

async function chatgptPhrase(page, runDir, phrase, date, emit, notes) {
  await page.goto("https://chatgpt.com/", { waitUntil: "domcontentloaded" });
  await inject(page);
  await checkWall(page);
  if (!(await waitFor(page, '#prompt-textarea, div[contenteditable="true"], textarea', 15000))) {
    return false;
  }
  const composer = await page.$('#prompt-textarea, div[contenteditable="true"], textarea');
  await composer.click();
  await page.keyboard.type(phrase, { delay: 40 + Math.random() * 30 });
  await page.keyboard.press("Enter");
  if (!(await waitFor(page, '[data-message-author-role="assistant"], .agent-turn, article', QUERY_TIMEOUT_MS))) {
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
    ? serpRows("ChatGPT", phrase, citations, date)
    : [{ ...makeRow("ChatGPT", phrase, "", "", date), note: "no citations shown" }];
  if (!citations.length) notes.push(`chatgpt — "${phrase}": no citations shown`);
  assertInEvidence(rows, evidenceSet, "chatgpt", phrase);
  emit(rows);
  return true;
}

// Hold the process while the founder clears a wall in the open window, then
// exit 2 so the run can be rerun. Saved phrases stay saved.
async function holdForWall(context, kind) {
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

function loadSaved(rowsFile) {
  const done = new Set();
  if (!existsSync(rowsFile)) return done;
  for (const line of readFileSync(rowsFile, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      done.add(`${r.engine}|${r.question}`);
    } catch {
      // partial line at the tail of an interrupted run — ignore
    }
  }
  return done;
}

function previousNote(notesDir, dateStr) {
  const prev = readdirSync(notesDir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f) && f < `${dateStr}.md`)
    .sort()
    .pop();
  return prev ? readFileSync(path.join(notesDir, prev), "utf8") : "";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const seeds = loadSeeds(SEEDS_JSON);
  const drift = checkSeeds(seeds, playbookSeeds(readFileSync(PLAYBOOK, "utf8")));
  if (!drift.ok) {
    console.error("seed drift — edit buyer-questions.json and SEO_Playbook.md § Buyer questions together:");
    for (const s of drift.missingFromJson) console.error(`  in playbook, missing from json: ${s}`);
    for (const s of drift.missingFromPlaybook) console.error(`  in json, missing from playbook: ${s}`);
    process.exit(1);
  }
  if (args.checkSeeds) {
    console.log(`seeds ok — ${seeds.length} phrases match the playbook`);
    return;
  }
  if (args.dryRun) {
    console.log(`phrase queue (${seeds.length} seeds; expansion happens live):`);
    for (const s of seeds) console.log(`- ${s}`);
    return;
  }

  const lock = acquireLock();
  if (!lock.ok) {
    console.error(`seo:collect already running — lock: ${LOCK_FILE} (${lock.holder})`);
    process.exit(LOCKED_EXIT);
  }

  const dateStr = today();
  const runDir = path.join(RUNS_DATA, dateStr);
  mkdirSync(runDir, { recursive: true });
  mkdirSync(NOTES_DIR, { recursive: true });
  const rowsFile = path.join(runDir, "rows.jsonl");
  const expansionFile = path.join(runDir, "expansion.json");
  const saved = args.force ? new Set() : loadSaved(rowsFile);
  const expansion =
    !args.force && existsSync(expansionFile) ? JSON.parse(readFileSync(expansionFile, "utf8")) : {};

  const engines = args.engine ? [args.engine] : ENGINES;
  const allRows = [];
  const notes = [];
  const emit = (rows) => {
    allRows.push(...rows);
    appendFileSync(rowsFile, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
    for (const r of rows) saved.add(`${r.engine}|${r.question}`);
  };

  let context = null;
  try {
    context = await chromium.launchPersistentContext(PROFILE_DIR, {
      channel: "chrome",
      headless: false,
    });
    const page = context.pages()[0] || (await context.newPage());
    let firstQuery = true;
    const between = async () => {
      if (firstQuery) firstQuery = false;
      else await pause();
    };

    const runSeeds = args.limit ? seeds.slice(0, args.limit) : seeds;
    let dropped = [];

    if (engines.includes("google")) {
      for (const seed of runSeeds) {
        if (expansion[seed] && !args.force) continue;
        await between();
        const res = await googleSeed(page, runDir, seed, dateStr, emit, notes);
        expansion[seed] = res;
        writeFileSync(expansionFile, JSON.stringify(expansion, null, 2));
      }
    }
    const expanded = expandPhrases(seeds, seeds.map((s) => expansion[s]?.extras ?? []));
    const phrases = expanded.phrases;
    dropped = expanded.dropped;

    if (engines.includes("google") && !args.limit) {
      for (const phrase of phrases) {
        if (saved.has(`Google|${phrase}`) || expansion[phrase]?.done) continue;
        await between();
        await googlePhrase(page, runDir, phrase, dateStr, emit, notes);
      }
    }

    if (engines.includes("chatgpt")) {
      for (const phrase of args.limit ? runSeeds : phrases) {
        if (saved.has(`ChatGPT|${phrase}`)) continue;
        try {
          await between();
          const ok = await chatgptPhrase(page, runDir, phrase, dateStr, emit, notes);
          if (!ok) {
            notes.push("chatgpt: engine not available");
            break;
          }
        } catch (e) {
          if (e instanceof WallStop) throw e;
          notes.push("chatgpt: engine not available");
          break;
        }
      }
    }
    notes.push("gemini: engine not available", "perplexity: engine not available");

    const note = renderRunNote({ date: dateStr, seeds, phrases, dropped, rows: allRows, notes });
    writeFileSync(path.join(NOTES_DIR, `${dateStr}.md`), note);

    const existing = existsSync(MAP_FILE) ? readFileSync(MAP_FILE, "utf8") : null;
    const merged = mergeMap(existing, allRows);
    writeFileSync(MAP_FILE, merged.text);

    const diff = domainDiff(previousNote(NOTES_DIR, dateStr), allRows);
    const blanks = parseTableRows(merged.text)
      .filter((r) => !r.destination)
      .map((r) => r.domain || r.url);
    console.log(
      `run note: docs/strategy/seo/runs/${dateStr}.md — ${allRows.length} rows, ${merged.added.length} new on the map`,
    );
    console.log(`new domains: ${diff.added.length ? diff.added.join(", ") : "none"}`);
    console.log(`disappeared domains: ${diff.gone.length ? diff.gone.join(", ") : "none"}`);
    console.log(`blank destinations: ${blanks.length ? blanks.join(", ") : "none"}`);
  } catch (e) {
    if (e instanceof WallStop) {
      if (context) await holdForWall(context, e.kind);
      releaseLock();
      process.exit(WALL_EXIT);
    }
    releaseLock();
    throw e;
  }
  if (context) await context.close().catch(() => {});
  releaseLock();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => {
    console.error(`seo:collect failed: ${e.message}`);
    process.exit(1);
  });
}
