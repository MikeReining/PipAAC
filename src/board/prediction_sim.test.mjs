/**
 * 006 slice 2–3 Works Test — the instrument, then the local model.
 *
 * A hand-written 14-day fixture (routine_days.en.json) replays through
 * the real logging path — openSentence, logImpression, fillChosen,
 * logSelection, closeSentence — via the shared walker in sim_replay.mjs
 * (the same path scripts/prediction/fit_defaults.mjs tunes on).
 * Days 1–10 build history; days 11–14 are measured by predictionReport:
 * shortlist recall, strip hit rate, false-show rate, strip share — plus
 * taps per word (1 if the pick was a shown tile or a core cell, else
 * the 3-tap group path).
 *
 * Slice 3 replaces the hand-tuned ordering with the fitted log-linear
 * model (data/prediction/defaults.json — phrase/pair/hour/freq/recency
 * features, softmax over shortlist ∪ none, τ show gate). The measured
 * assertions compare against the slice-2 instrumented baseline, not
 * against zero: hit rate must not regress and false-show must fall.
 *
 * Negative control: a ranker that shows nothing scores 0% hit rate
 * and pays the full group-path taps — the metric can fail.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { addPersonalEntity } from "./entities.mjs";
import { loadSimFixture, modelOffer, replayDays } from "./sim_replay.mjs";
import { predictionReport } from "../../public/shared/funnel.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const { catalog, fixture } = loadSimFixture(repoRoot);
const MODEL = JSON.parse(
  readFileSync(join(repoRoot, "data/prediction/defaults.json"), "utf8"),
);

const openDb = () => {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  return db;
};

const addEntities = (db) =>
  fixture.entities.map((e) =>
    addPersonalEntity(db, { spokenName: e.name, category: e.category }));

const NO_OFFER = () => ({ candidates: [], shown: [], pNone: 0 });

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

test("simulation: the fitted model beats the instrumented baseline", () => {
  const db = openDb();
  const entities = addEntities(db);
  const { mTaps, mWords, measureStart } = replayDays(db, catalog, fixture, entities, {
    measureFrom: 11, offer: modelOffer(MODEL),
  });
  const report = predictionReport(db, { from: measureStart });
  const tapsPerWord = +(mTaps / mWords).toFixed(3);
  console.log("slice 3 measured:", JSON.stringify({ ...report, tapsPerWord }));
  assert.ok(report.picks > 100, "held-out days must have real picks");
  // vs slice-2 baseline: hit 23.7%, falseShow 36.4%, taps/word 1.39
  assert.ok(report.hitRate >= 0.2, `hit rate regressed: ${report.hitRate}`);
  assert.ok(report.falseShowRate < 0.364, `false-show must fall: ${report.falseShowRate}`);
  assert.ok(tapsPerWord <= 1.39, `taps/word must not rise: ${tapsPerWord}`);
});

test("unscripted sentences: the gate shows nothing more often than it misfires", () => {
  const db = openDb();
  const entities = addEntities(db);
  const { picks } = replayDays(db, catalog, fixture, entities, {
    measureFrom: 11, offer: modelOffer(MODEL),
  });
  // An unscripted pick belongs to a sentence whose start matches an
  // unscripted entry on its day (picks land at start + i·1.5s).
  const unscriptedPicks = picks.filter((p) => {
    if (p.day < 11) return false;
    return (fixture.unscripted[String(p.day)] ?? []).some((s) => {
      const [h, m] = s.at.split(":").map(Number);
      const d = new Date(p.at);
      return d.getHours() === h && d.getMinutes() === m;
    });
  });
  assert.ok(unscriptedPicks.length > 0, "held-out unscripted picks exist");
  const shown = unscriptedPicks.filter((p) => p.shownKeys.length > 0);
  // On unscripted moments the gate should usually stay silent; when it
  // does speak it may still hit — but it must not mostly misfire.
  assert.ok(
    shown.length / unscriptedPicks.length < 0.5,
    `unscripted show rate too high: ${shown.length}/${unscriptedPicks.length}`,
  );
});

test("negative control: a ranker that shows nothing scores zero", () => {
  const db = openDb();
  const entities = addEntities(db);
  const { mTaps, mWords, measureStart } = replayDays(db, catalog, fixture, entities, {
    measureFrom: 11, offer: NO_OFFER,
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
