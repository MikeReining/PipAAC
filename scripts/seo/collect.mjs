#!/usr/bin/env node
// Source-map collector — spec: docs/strategy/seo/Source_Map_Collector.md.
// Drives the installed Chrome (Playwright channel "chrome") with a persistent
// profile at data/seo/profile/, and Gemini through the local agy CLI.
// No API calls: the tool reads the same screen a person sees (or the local
// engine's own printed output) and writes down the links that are there.

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
import { sleep } from "./rows.mjs";
import { WallStop, holdForWall } from "./browser.mjs";
import { googleSeed, googlePhrase } from "./google.mjs";
import { chatgptPhrase } from "./chatgpt.mjs";
import { geminiPhrase } from "./gemini.mjs";
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

const WALL_EXIT = 2;
const LOCKED_EXIT = 75;
const ENGINES = ["google", "chatgpt", "gemini"];

const today = () => new Date().toISOString().slice(0, 10);
const pause = () => sleep(3000 + Math.random() * 5000);

function usage() {
  console.log(
    "usage: npm run seo:collect -- [--dry-run] [--check-seeds] [--engine google|chatgpt|gemini] [--limit N] [--force]",
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
  const getPage = async () => {
    if (!context) {
      context = await chromium.launchPersistentContext(PROFILE_DIR, {
        channel: "chrome",
        headless: false,
      });
    }
    return context.pages()[0] || (await context.newPage());
  };

  try {
    let firstQuery = true;
    const between = async () => {
      if (firstQuery) firstQuery = false;
      else await pause();
    };

    const runSeeds = args.limit ? seeds.slice(0, args.limit) : seeds;
    let dropped = [];

    if (engines.includes("google")) {
      const page = await getPage();
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
      const page = await getPage();
      for (const phrase of phrases) {
        if (saved.has(`Google|${phrase}`) || expansion[phrase]?.done) continue;
        await between();
        await googlePhrase(page, runDir, phrase, dateStr, emit, notes);
      }
    }

    if (engines.includes("chatgpt")) {
      const page = await getPage();
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

    if (engines.includes("gemini")) {
      for (const phrase of args.limit ? runSeeds : phrases) {
        if (saved.has(`Gemini|${phrase}`)) continue;
        try {
          await between();
          await geminiPhrase(runDir, phrase, dateStr, emit, notes);
        } catch (e) {
          if (e instanceof WallStop) throw e;
          if (e.code === "TIMEOUT") {
            notes.push(`gemini — "${phrase}": timed out`);
            continue;
          }
          notes.push("gemini: engine not available");
          break;
        }
      }
    }

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
      else console.log(`wall: ${e.kind} — rerun to continue.`);
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
