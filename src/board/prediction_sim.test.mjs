/**
 * 006 slice 2 Works Test — the instrument: impressions, metrics,
 * simulation.
 *
 * A hand-written 14-day fixture (routine_days.en.json) replays through
 * the real logging path — openSentence, logImpression, fillChosen,
 * logSelection, closeSentence. Days 1–10 build history; days 11–14 are
 * measured by predictionReport: shortlist recall, strip hit rate,
 * false-show rate, strip share — plus taps per word (1 if the pick was
 * a shown tile or a core cell, else the 3-tap group path).
 *
 * Negative control: a ranker that returns nothing scores 0% hit rate
 * and pays the full group-path taps — the metric can fail.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { addPersonalEntity } from "./entities.mjs";
import {
  closeSentence,
  fillChosen,
  logImpression,
  logSelection,
  openSentence,
  predictionReport,
  STRIP_CAP,
  stripScored,
} from "../../public/shared/funnel.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const lexicon = JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8"));
const mapRaw = readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8");
const catalog = buildCatalog(lexicon, parseCoordinateMapMarkdown(mapRaw));
const fixture = JSON.parse(
  readFileSync(join(repoRoot, "src/board/fixtures/routine_days.en.json"), "utf8"),
);

const openDb = () => {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  return db;
};

const isCore = (db, kind, id) =>
  kind === "sense" &&
  db.prepare(
    "SELECT 1 AS x FROM core_cell WHERE layout = 'grid60' AND sense_id = ?",
  ).all(id).length > 0;

/**
 * Replay the fixture. For every pick: the strip's offer is recorded as
 * an impression, then the pick lands — the child takes a shown tile when
 * the strip offers the word, else taps the grid or walks the group path.
 * `ranker` can be replaced to break the strip on purpose (control).
 */
function replay(db, entities, { ranker = stripScored, measureFrom } = {}) {
  const senseId = new Map();
  for (const l of catalog.labels.filter((l) => l.kind === "lemma" && l.locale === "en")) {
    senseId.set(l.text, l.sense_id);
  }
  const entId = new Map(entities.map((e) => [e.spokenName ?? e.name, e.id]));
  const resolve = (w) => {
    if (entId.has(w)) return { kind: "entity", id: entId.get(w) };
    const id = senseId.get(w);
    assert.ok(id, `fixture word has no catalog lemma: ${w}`);
    return { kind: "sense", id };
  };

  const day0 = new Date(); day0.setHours(0, 0, 0, 0);
  const dayBase = day0.getTime() - 14 * 86400000; // fixture day 1 = 14 days ago
  const atFor = (day, hhmm) => {
    const [h, m] = hhmm.split(":").map(Number);
    const d = new Date(dayBase + (day - 1) * 86400000);
    d.setHours(h, m, 0, 0);
    return d.getTime();
  };
  const measureStart = atFor(measureFrom ?? 15, "00:00");

  let taps = 0, words = 0;
  let mTaps = 0, mWords = 0; // measured days only
  for (const day of fixture.days) {
    const routine = day.kind === "school" ? fixture.schoolDay : fixture.weekendDay;
    const extras = fixture.unscripted[String(day.day)] ?? [];
    const sents = [...routine.sentences, ...extras].sort((a, b) =>
      a.at.localeCompare(b.at));
    for (const s of sents) {
      const sid = openSentence(db, atFor(day.day, s.at));
      let members = [];
      s.words.forEach((w, i) => {
        const at = atFor(day.day, s.at) + i * 1500; // 1.5 s between picks
        const sentsState = members.map((m) => ({ kind: m.kind, id: m.id }));
        const scored = ranker(db, sentsState, at, "en");
        const shown = scored.slice(0, STRIP_CAP).map((c) => `${c.kind}:${c.id}`);
        const pick = resolve(w);
        const pickKey = `${pick.kind}:${pick.id}`;
        const source = shown.includes(pickKey) ? "strip"
          : isCore(db, pick.kind, pick.id) ? "grid" : "group";
        logImpression(db, {
          sentenceId: sid, position: i, shownAt: at,
          candidates: scored.map((c) => ({ kind: c.kind, id: c.id, x: c.x ?? {} })),
          shown,
        });
        fillChosen(db, sid, { kind: pick.kind, id: pick.id, source });
        logSelection(db, pick.kind, pick.id, at,
          { sentenceId: sid, position: i, source });
        members.push(pick);
        const cost = source === "group" ? 3 : 1;
        words++; taps += cost;
        if (at >= measureStart) { mWords++; mTaps += cost; }
      });
      closeSentence(db, sid, atFor(day.day, s.at) + s.words.length * 1500, "spoken");
    }
  }
  return { taps, words, mTaps, mWords, measureStart };
}

test("the fixture's words all resolve — the fixture, not the ranker, is checked", () => {
  const db = openDb();
  const senseId = new Set(
    catalog.labels.filter((l) => l.kind === "lemma" && l.locale === "en").map((l) => l.text),
  );
  const all = [
    ...fixture.schoolDay.sentences,
    ...fixture.weekendDay.sentences,
    ...Object.values(fixture.unscripted).flat(),
  ].flatMap((s) => s.words);
  const ents = new Set(fixture.entities.map((e) => e.name));
  const missing = all.filter((w) => !senseId.has(w) && !ents.has(w));
  assert.deepEqual(missing, []);
});

test("simulation: baseline metrics on held-out days 11–14", () => {
  const db = openDb();
  const entities = fixture.entities.map((e) =>
    addPersonalEntity(db, { spokenName: e.name, category: e.category }));
  const { taps, words, mTaps, mWords, measureStart } =
    replay(db, entities, { measureFrom: 11 });
  const report = predictionReport(db, { from: measureStart });
  console.log("slice 2 baseline:", JSON.stringify({
    ...report, tapsPerWord: +(mTaps / mWords).toFixed(3),
  }));
  assert.ok(report.picks > 100, "held-out days must have real picks");
  assert.ok(report.hitRate > 0, "the strip must sometimes hit");
  assert.ok(report.stripShare > 0, "the child takes the strip when it offers");
});

test("negative control: a ranker that shows nothing scores zero", () => {
  const db = openDb();
  const entities = fixture.entities.map((e) =>
    addPersonalEntity(db, { spokenName: e.name, category: e.category }));
  const { mTaps, mWords, measureStart } = replay(db, entities, {
    measureFrom: 11, ranker: () => [],
  });
  const report = predictionReport(db, { from: measureStart });
  assert.equal(report.hitRate, 0);
  assert.equal(report.stripShare, 0);
  // Every pick pays its real path price: 1 for a core cell, 3 for the
  // group walk — nothing saves a tap when the strip is empty.
  const corePicks = db.prepare(
    `SELECT COUNT(*) AS n FROM learner_event_log l
     JOIN core_cell c ON c.sense_id = l.item_id AND c.layout = 'grid60'
     WHERE l.item_kind = 'sense' AND l.selected_at >= ?`,
  ).all(measureStart)[0].n;
  assert.equal(mTaps, corePicks + (mWords - corePicks) * 3);
});
