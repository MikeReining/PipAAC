#!/usr/bin/env node
/**
 * Which catalog words still need pictures? Compares the master lists to files on disk.
 *
 * Core (launch): data/launch_lexicon.json vs assets/symbols/ — same matching as
 * scripts/catalog/build_catalog.mjs (spoken text, underscores as spaces; no _rollN).
 *
 * Extended (phase 010): data/extended_lexicon.json rows with art: draw vs
 * out/extended_art/<id>.png and optional review.json decisions.
 *
 *   node scripts/art/art_gaps.mjs
 *   node scripts/art/art_gaps.mjs --json
 *   node scripts/art/art_gaps.mjs --extended
 *   node scripts/art/art_gaps.mjs --extended --json
 *   node scripts/art/art_gaps.mjs --min-slot 525 --limit 10
 *   node scripts/art/art_gaps.mjs --walk groups --limit 10
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadGlyphWords } from "./gen.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../catalog/build_catalog.mjs";
import { repoRoot, DEFAULT_LEXICON_PATH } from "../catalog/paths.mjs";

const MAP_MD = join(repoRoot, "docs/product/Core_Coordinate_Map.md");

const SYMBOLS_ROOT = join(repoRoot, "assets/symbols");
const EXTENDED_LEXICON_PATH = join(repoRoot, "data/extended_lexicon.json");
const EXTENDED_ART_ROOT = join(repoRoot, "out/extended_art");
const EXTENDED_REVIEW_PATH = join(EXTENDED_ART_ROOT, "review.json");

/** @type {readonly string[]} */
export const SYMBOL_EXT_PREF = [".png", ".svg", ".jpg", ".jpeg"];

/**
 * Build spokenText → preferred filename map from assets/symbols (catalog build parity).
 * @param {string} symbolsRoot
 */
export function indexSymbolFiles(symbolsRoot) {
  /** @type {Map<string, string>} */
  const fileByWord = new Map();
  if (!existsSync(symbolsRoot)) return fileByWord;
  for (const file of readdirSync(symbolsRoot)) {
    if (/_roll\d*\./.test(file)) continue;
    const ext = file.slice(file.lastIndexOf("."));
    if (!SYMBOL_EXT_PREF.includes(ext)) continue;
    const word = file.slice(0, -ext.length).replace(/_/g, " ");
    const prev = fileByWord.get(word);
    const prevPref = prev
      ? SYMBOL_EXT_PREF.indexOf(prev.slice(prev.lastIndexOf(".")))
      : -1;
    if (!prev || SYMBOL_EXT_PREF.indexOf(ext) < prevPref) {
      fileByWord.set(word, file);
    }
  }
  return fileByWord;
}

/**
 * @param {string} spokenText
 * @param {Map<string, string>} fileByWord
 * @returns {{ file: string | null, kind: "picture" | "glyph" | "missing" }}
 */
export function resolveCoreSymbol(spokenText, fileByWord, glyphWords) {
  const key = spokenText;
  const file = fileByWord.get(key) ?? null;
  if (file) {
    return { file, kind: file.endsWith(".svg") ? "glyph" : "picture" };
  }
  const slug = spokenText.toLowerCase().replace(/\s+/g, "_");
  if (glyphWords.has(spokenText.toLowerCase()) || glyphWords.has(slug)) {
    return { file: null, kind: "glyph" };
  }
  return { file: null, kind: "missing" };
}

/**
 * @param {{ entries: Array<{ slot: number, spokenText: string, partOfSpeech?: string, category?: string | null, visualStyle?: string }> }} lexicon
 * @param {string} symbolsRoot
 * @param {Set<string>} glyphWords
 */
export function computeCoreGaps(lexicon, symbolsRoot, glyphWords) {
  const fileByWord = indexSymbolFiles(symbolsRoot);
  /** @type {Array<{ slot: number, spokenText: string, partOfSpeech?: string, category?: string | null, visualStyle?: string, expectedFile: string }>} */
  const missing = [];
  let have = 0;
  for (const e of lexicon.entries) {
    const resolved = resolveCoreSymbol(e.spokenText, fileByWord, glyphWords);
    if (resolved.file) {
      have++;
      continue;
    }
    if (resolved.kind === "glyph") {
      missing.push({
        slot: e.slot,
        spokenText: e.spokenText,
        partOfSpeech: e.partOfSpeech,
        category: e.category ?? null,
        visualStyle: e.visualStyle,
        expectedFile: `${e.spokenText.toLowerCase().replace(/\s+/g, "_")}.svg`,
        note: "glyph word — needs hand-drawn SVG, not Muse",
      });
      continue;
    }
    missing.push({
      slot: e.slot,
      spokenText: e.spokenText,
      partOfSpeech: e.partOfSpeech,
      category: e.category ?? null,
      visualStyle: e.visualStyle,
      expectedFile: `${e.spokenText.toLowerCase().replace(/\s+/g, "_")}.png`,
    });
  }
  missing.sort((a, b) => a.slot - b.slot);
  const nextBatch = missing
    .filter((m) => !m.note)
    .slice(0, 10)
    .map((m) => ({ slot: m.slot, spokenText: m.spokenText }));
  return {
    tier: "core",
    symbolsRoot,
    totalEntries: lexicon.entries.length,
    haveSymbol: have,
    missingCount: missing.length,
    missing,
    nextBatchOfTen: nextBatch,
  };
}

/**
 * @param {{ entries: Array<{ id: string, text: string, spokenText: string, category: string, art: string }> }} extended
 * @param {string} artRoot
 * @param {Record<string, string>} review
 */
export function computeExtendedGaps(extended, artRoot, review) {
  const drawRows = extended.entries.filter((e) => e.art === "draw");
  /** @type {Array<{ id: string, text: string, category: string, status: string, path: string | null }>} */
  const rows = [];
  const counts = {
    missing: 0,
    needsReview: 0,
    approved: 0,
    reroll: 0,
    reject: 0,
  };

  for (const e of drawRows) {
    const path = join(artRoot, `${e.id}.png`);
    const hasFile = existsSync(path);
    const decision = review[e.id] ?? null;
    let status;
    if (!hasFile) {
      status = "missing";
      counts.missing++;
    } else if (decision === "approve") {
      status = "approved";
      counts.approved++;
    } else if (decision === "reroll") {
      status = "reroll";
      counts.reroll++;
    } else if (decision === "reject") {
      status = "reject";
      counts.reject++;
    } else {
      status = "needs_review";
      counts.needsReview++;
    }
    rows.push({
      id: e.id,
      text: e.text,
      category: e.category,
      status,
      path: hasFile ? path : null,
    });
  }

  rows.sort((a, b) => a.id.localeCompare(b.id));
  return {
    tier: "extended",
    artRoot,
    totalDrawRows: drawRows.length,
    counts,
    rows,
    missing: rows.filter((r) => r.status === "missing"),
    needsReview: rows.filter((r) => r.status === "needs_review"),
  };
}

/**
 * Missing Muse tiles in built-in group index order (deduped globally).
 * @param {{ missing: Array<{ slot: number, spokenText: string, note?: string }> }} coreGaps
 * @param {{ groups: Array<{ id: string, index_slot: number }>, groupMembers: Array<{ group_id: string, item_kind: string, item_id: string }> }} catalog
 * @param {number} limit
 */
export function computeGroupWalkQueue(coreGaps, catalog, limit = 10) {
  const missingBySense = new Map(
    coreGaps.missing
      .filter((m) => !m.note)
      .map((m) => [`sns_${String(m.slot).padStart(4, "0")}`, m]),
  );
  const groups = [...catalog.groups].sort((a, b) => a.index_slot - b.index_slot);
  const memByGroup = new Map();
  for (const m of catalog.groupMembers) {
    if (m.item_kind !== "sense") continue;
    if (!memByGroup.has(m.group_id)) memByGroup.set(m.group_id, []);
    memByGroup.get(m.group_id).push(m.item_id);
  }
  const seen = new Set();
  /** @type {Array<{ slot: number, spokenText: string, group: string }>} */
  const queue = [];
  for (const g of groups) {
    const groupKey = g.id.replace(/^grp_/, "");
    for (const senseId of memByGroup.get(g.id) ?? []) {
      const row = missingBySense.get(senseId);
      if (!row || seen.has(row.slot)) continue;
      seen.add(row.slot);
      queue.push({ slot: row.slot, spokenText: row.spokenText, group: groupKey });
    }
  }
  return {
    walk: "groups",
    queueLength: queue.length,
    queue,
    nextBatchOfTen: queue.slice(0, limit),
  };
}

function loadReview() {
  if (!existsSync(EXTENDED_REVIEW_PATH)) return {};
  try {
    return JSON.parse(readFileSync(EXTENDED_REVIEW_PATH, "utf8"));
  } catch {
    return {};
  }
}

function printCoreHuman(report) {
  console.log(`Core launch art (${report.symbolsRoot})`);
  console.log(`  ${report.haveSymbol}/${report.totalEntries} have a symbol file`);
  console.log(`  ${report.missingCount} still need art`);
  if (report.minSlot != null) {
    console.log(`  (filtered to slot >= ${report.minSlot})`);
  }
  if (report.nextBatchOfTen.length) {
    const batch = report.nextBatchOfTen
      .map((w) => `#${w.slot} ${w.spokenText}${w.group ? ` (${w.group})` : ""}`)
      .join(", ");
    console.log(`  Next ${report.nextBatchOfTen.length} Muse tiles: ${batch}`);
  }
  console.log("");
  for (const m of report.missing) {
    const tag = m.note ? ` [${m.note}]` : "";
    console.log(`  #${String(m.slot).padStart(3, " ")}  ${m.spokenText}  →  ${m.expectedFile}${tag}`);
  }
}

function printExtendedHuman(report) {
  console.log(`Extended library (art: draw) — ${report.artRoot}`);
  const c = report.counts;
  console.log(
    `  ${report.totalDrawRows} rows: ${c.missing} missing file, ${c.needsReview} need review, ${c.approved} approved, ${c.reroll} reroll, ${c.reject} reject`,
  );
  if (report.missing.length) {
    console.log("\n  Missing PNG (first 40):");
    for (const r of report.missing.slice(0, 40)) {
      console.log(`    ${r.id}  (${r.text})`);
    }
    if (report.missing.length > 40) {
      console.log(`    … and ${report.missing.length - 40} more (use --json)`);
    }
  }
}

function parseSlotFlag(name, fallback = null) {
  const i = process.argv.indexOf(name);
  if (i === -1 || i + 1 >= process.argv.length) return fallback;
  const n = Number(process.argv[i + 1]);
  return Number.isFinite(n) ? n : fallback;
}

function main() {
  const json = process.argv.includes("--json");
  const extended = process.argv.includes("--extended");
  const walkGroups = process.argv.includes("--walk") && process.argv.includes("groups");
  const minSlot = parseSlotFlag("--min-slot", null);
  const batchLimit = parseSlotFlag("--limit", 10) ?? 10;
  const glyphWords = loadGlyphWords();

  const lexicon = JSON.parse(readFileSync(DEFAULT_LEXICON_PATH, "utf8"));
  let core = computeCoreGaps(lexicon, SYMBOLS_ROOT, glyphWords);
  let groupWalk = null;

  if (walkGroups) {
    const catalog = buildCatalog(
      lexicon,
      parseCoordinateMapMarkdown(readFileSync(MAP_MD, "utf8")),
    );
    groupWalk = computeGroupWalkQueue(core, catalog, batchLimit);
    core = {
      ...core,
      walk: groupWalk.walk,
      nextBatchOfTen: groupWalk.nextBatchOfTen,
    };
  } else if (minSlot != null) {
    const filtered = core.missing.filter((m) => m.slot >= minSlot);
    core = {
      ...core,
      minSlot,
      missing: filtered,
      missingCount: filtered.length,
      nextBatchOfTen: filtered
        .filter((m) => !m.note)
        .slice(0, batchLimit)
        .map((m) => ({ slot: m.slot, spokenText: m.spokenText })),
    };
  } else {
    core.nextBatchOfTen = core.missing
      .filter((m) => !m.note)
      .slice(0, batchLimit)
      .map((m) => ({ slot: m.slot, spokenText: m.spokenText }));
  }

  if (extended) {
    const extLex = JSON.parse(readFileSync(EXTENDED_LEXICON_PATH, "utf8"));
    const ext = computeExtendedGaps(extLex, EXTENDED_ART_ROOT, loadReview());
    if (json) {
      console.log(JSON.stringify({ core, extended: ext }, null, 2));
      return;
    }
    printCoreHuman(core);
    console.log("");
    printExtendedHuman(ext);
    return;
  }

  if (json) {
    console.log(JSON.stringify(groupWalk ? { core, groupWalk } : core, null, 2));
    return;
  }
  if (walkGroups) {
    console.log(`Group walk: ${groupWalk.queueLength} missing Muse tiles in index order\n`);
  }
  printCoreHuman(core);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
