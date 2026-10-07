#!/usr/bin/env node
/**
 * 024 slice 7 (names half) — the common-names list behind the shared
 * voice cache's privacy line (024 § 5). A sentence joins the shared R2
 * cache only when every word is a catalog word, a form, or a common
 * name; this builder decides "common".
 *
 * Rule, per country (launch countries only — US, UK):
 *   - all-time rank ≤ 2000 by summed births (the § 5 cut), OR
 *   - top 1000 of the source's last 15 years (names of today's
 *     siblings and classmates that haven't accumulated all-time yet), OR
 *   - UK only: a name in the E&W top-100 snapshots 1904–1994 —
 *     children name parents and grandparents too.
 * The UK is pooled from its three statistical nations (E&W, Scotland,
 * NI) — each nation's own top 1000 counts, so a top-Scottish name
 * isn't diluted by England's population.
 *
 * Inputs — gitignored `cache/names/` (raw rda → csv; fetch + convert
 * commands are in data/prediction/SOURCES.md):
 *   us_name_year.csv   name,year,n       SSA national 1880–2017
 *   uk_name_year.csv   name,nation,year,n  ONS 1996–2020 / NISRA 1997–2020 / NRS 1974–2020
 *   uk_rankings.csv    name,year,rank,sex  E&W top-100 snapshots 1904–1994
 *
 * Usage: node scripts/catalog/build_common_names.mjs [--check]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "../..");
const CACHE = join(root, "cache/names");
const DEST = join(root, "data/catalog/common_names.en.json");

const ALL_TIME_TOP = 2000;
const RECENT_TOP = 1000;
const RECENT_YEARS = 15;
const UK_NATION_TOP = 1000;

const need = (f) => {
  const p = join(CACHE, f);
  if (!existsSync(p)) {
    console.error(`missing ${p} — see data/prediction/SOURCES.md for fetch/convert commands`);
    process.exit(1);
  }
  return readFileSync(p, "utf8");
};

/** Minimal CSV reader: header row, optionally quoted fields. */
const rows = (csv) => {
  const [head, ...lines] = csv.trim().split("\n");
  const cols = head.split(",");
  return lines.filter(Boolean).map((line) => {
    const cells = [];
    for (let i = 0, cur = "", q = false; i <= line.length; i++) {
      const ch = line[i];
      if (ch === '"') q = !q;
      else if ((ch === "," || ch === undefined) && !q) { cells.push(cur); cur = ""; }
      else cur += ch;
    }
    return Object.fromEntries(cols.map((c, i) => [c, cells[i]]));
  });
};

/** name -> total births, optionally over a year window. */
const tally = (list, minYear) => {
  const sums = new Map();
  for (const r of list) {
    if (minYear && Number(r.year) < minYear) continue;
    const k = String(r.name).toLowerCase();
    sums.set(k, (sums.get(k) ?? 0) + Number(r.n));
  }
  return sums;
};

const top = (sums, n) =>
  [...sums.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);

const maxYear = (list) => list.reduce((m, r) => Math.max(m, Number(r.year)), 0);

const chosen = new Set();

// --- US (SSA, 1880–2017) ---
const us = rows(need("us_name_year.csv"));
const usMaxYear = maxYear(us);
for (const n of top(tally(us), ALL_TIME_TOP)) chosen.add(n);
for (const n of top(tally(us, usMaxYear - RECENT_YEARS + 1), RECENT_TOP)) chosen.add(n);

// --- UK (ONS E&W + NISRA NI + NRS Scotland) ---
const uk = rows(need("uk_name_year.csv"));
const ukMaxYear = maxYear(uk);
for (const nation of new Set(uk.map((r) => r.nation))) {
  const nat = uk.filter((r) => r.nation === nation);
  for (const n of top(tally(nat), UK_NATION_TOP)) chosen.add(n);
}
for (const n of top(tally(uk, ukMaxYear - RECENT_YEARS + 1), RECENT_TOP)) chosen.add(n);
for (const r of rows(need("uk_rankings.csv"))) chosen.add(String(r.name).toLowerCase());

/** Keep single tokens the Worker's eligibility check can match —
 *  letters plus interior ' or - (o'brien is a surname anyway, but
 *  don't re-stringify weird input). */
const names = [...chosen]
  .map((n) => n.trim())
  .filter((n) => /^[\p{L}][\p{L}'-]*[\p{L}]$/u.test(n) || /^[\p{L}]{2,}$/u.test(n))
  .filter((n) => n.length >= 2);
names.sort();

const out = {
  version: `common-names.${new Date().toISOString().slice(0, 10)}`,
  locale: "en",
  names: [...new Set(names)],
};

if (process.argv.includes("--check")) {
  const cur = JSON.parse(readFileSync(DEST, "utf8"));
  const same = JSON.stringify(cur.names) === JSON.stringify(out.names);
  console.log(same ? "up to date" : "STALE — regenerate");
  process.exit(same ? 0 : 1);
}
writeFileSync(DEST, JSON.stringify(out, null, 1) + "\n");
console.log(`${out.names.length} names -> ${DEST}`);
