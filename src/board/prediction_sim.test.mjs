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
 * model (data/prediction/defaults.json — hist/hour/freq/recency/book
 * features, softmax over shortlist ∪ none, τ show gate). The measured
 * assertions compare against the slice-2 instrumented baseline, not
 * against zero: hit rate must not regress. False-show is reported, not
 * gated — 017 step 7 deliberately widened the offer, and R18's
 * holdback on real use decides whether showing pays.
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
import {
  buildSchedule, loadSimFixture, modelOffer, replayArms, replayDays, simTime,
} from "./sim_replay.mjs";
import { predictionReport, stripScored, logSelection } from "../../public/shared/funnel.mjs";
import { jevDeliverable } from "../../public/shared/jev.mjs";

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

test("simulation: the fitted model beats the instrumented baseline", async () => {
  const db = openDb();
  const entities = addEntities(db);
  const { mTaps, mWords, measureStart } = await replayDays(db, catalog, fixture, entities, {
    measureFrom: 11, offer: modelOffer(MODEL),
  });
  const report = predictionReport(db, { from: measureStart });
  const tapsPerWord = +(mTaps / mWords).toFixed(3);
  console.log("slice 3 measured:", JSON.stringify({ ...report, tapsPerWord }));
  assert.ok(report.picks > 50, "held-out days must have real picks");
  // vs slice-2 baseline: hit 23.7%, falseShow 36.4%. The baseline's
  // taps/word (1.39) isn't comparable — slice 4 stopped logging
  // impressions at position 0, so the honest tap claim is head-to-head:
  // the gate must not cost taps versus showing the same ranking always.
  // 017 step 7 widened the pool deliberately — every supported word can
  // show — so false-show rises by design; whether showing pays is R18's
  // holdback question on real use, not a synthetic threshold. Hit rate
  // is the regression floor here; false-show is reported, not gated.
  assert.ok(report.hitRate >= 0.25, `hit rate regressed: ${report.hitRate}`);
  console.log(`  false-show (reported, R18 settles): ${(report.falseShowRate * 100).toFixed(1)}%`);

  const db2 = openDb();
  const entities2 = addEntities(db2);
  const alwaysOffer = (d, sents, at) => {
    const { candidates, pNone } = stripScored(d, sents, at, "en", {
      weights: MODEL.weights.local_only, tau: MODEL.tau,
    });
    return { candidates, shown: candidates.slice(0, 4), pNone };
  };
  const always = await replayDays(db2, catalog, fixture, entities2, {
    measureFrom: 11, offer: alwaysOffer,
  });
  const alwaysTaps = always.mTaps / always.mWords;
  console.log("always-show taps/word:", alwaysTaps.toFixed(3));
  assert.ok(
    tapsPerWord <= alwaysTaps + 0.001,
    `the gate must not cost taps: gated ${tapsPerWord} vs always-show ${alwaysTaps}`,
  );
});

test("unscripted sentences: show rate and hit-on-shown are reported (R18)", async () => {
  const db = openDb();
  const entities = addEntities(db);
  const { picks } = await replayDays(db, catalog, fixture, entities, {
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
  // 017 step 7 widened the offer deliberately — the "usually silent" gate
  // is gone. On unscripted moments the model can only offer routine or
  // generic words, so hit-on-shown is small by construction. Whether a
  // wrong offer costs time is R18's holdback question on real use —
  // this leg reports the numbers, it doesn't grade them.
  const hits = shown.filter((p) => p.shownKeys.includes(p.label)).length;
  const shownRate = shown.length / unscriptedPicks.length;
  const hitOnShown = shown.length ? hits / shown.length : 0;
  console.log(
    `  unscripted: shown ${shown.length}/${unscriptedPicks.length}` +
    ` (${(shownRate * 100).toFixed(0)}%), hit-on-shown ${(hitOnShown * 100).toFixed(1)}% vs random ~0.6%`,
  );
  assert.ok(shownRate >= 0 && shownRate <= 1 && hitOnShown >= 0,
    "the R18 inputs must be real numbers");
});

test("negative control: a ranker that shows nothing scores zero", async () => {
  const db = openDb();
  const entities = addEntities(db);
  const { mTaps, mWords, measureStart } = await replayDays(db, catalog, fixture, entities, {
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

/* 017 step 1 — one clock, one walker. The walker reads only the frozen
 * schedule; stubbing Date.now to throw must not stop a replay, and the
 * same replay on any real date must produce identical events. */
test("one clock: the walker never reads the wall clock (017-1)", async () => {
  const db = openDb();
  const entities = addEntities(db);
  const realNow = Date.now;
  Date.now = () => { throw new Error("wall clock read during replay"); };
  try {
    const r = await replayDays(db, catalog, fixture, entities, {
      measureFrom: 11, offer: modelOffer(MODEL),
    });
    assert.ok(r.words > 50, "replay completed under a dead wall clock");
    assert.ok(r.picks.every((p) => p.at >= simTime(1, "00:00")
      && p.at <= simTime(15, "00:00")),
      "every pick landed on the frozen 2026-01-05 anchor week");
  } finally {
    Date.now = realNow;
  }
});

test("one clock: 07:50 and 19:50 give different hour features and offers", async () => {
  const db = openDb();
  addEntities(db);
  // A word the child picks every evening vs one picked every morning —
  // hour bucketing must rank them differently inside their windows.
  const lemma = (text) => catalog.labels.find(
    (l) => l.kind === "lemma" && l.locale === "en" && l.text === text)?.sense_id;
  const juice = lemma("juice"), milk = lemma("milk"), want = lemma("want");
  assert.ok(juice && milk && want, "fixture lemmas must exist in the catalog");
  for (let d = 1; d <= 5; d++) {
    logSelection(db, "sense", juice, simTime(d, "19:50"), {});
    logSelection(db, "sense", milk, simTime(d, "07:50"), {});
  }
  const model = { weights: MODEL.weights.local_only, tau: MODEL.tau };
  const sents = [{ kind: "sense", id: want }];
  const am = stripScored(db, sents, simTime(8, "07:50"), "en", model);
  const pm = stripScored(db, sents, simTime(8, "19:50"), "en", model);
  const hourOf = (sc, id) => sc.candidates.find((c) => c.id === id)?.x.hour;
  assert.notEqual(hourOf(am, juice), hourOf(pm, juice),
    "the same history must light the hour feature differently by time of day");
  const rank = (sc, id) => sc.candidates.findIndex((c) => c.id === id);
  assert.ok(rank(am, milk) < rank(am, juice), "morning word outranks at 07:50");
  assert.ok(rank(pm, juice) < rank(pm, milk), "evening word outranks at 19:50");
});

test("one clock: every arm replays identical picks and times, byte-identical across runs", async () => {
  const arm = (tag) => {
    const db = openDb();
    const entities = fixture.entities.map((e, i) =>
      addPersonalEntity(db, { id: `ent_sim_${i}`, spokenName: e.name, category: e.category }));
    return { name: tag, db, entities, offer: modelOffer(MODEL) };
  };
  const a = await replayArms(catalog, fixture, [arm("x"), arm("y")], { measureFrom: 11 });
  assert.deepEqual(
    a.x.picks.map((p) => [p.at, p.position, p.label]),
    a.y.picks.map((p) => [p.at, p.position, p.label]),
    "arms saw the same frozen event stream");
  // A second run on another real moment is byte-identical — the bench
  // cannot drift with the calendar.
  const b = await replayArms(catalog, fixture, [arm("x"), arm("y")], { measureFrom: 11 });
  assert.equal(JSON.stringify(a.x.picks), JSON.stringify(b.x.picks));
  assert.equal(a.x.mTaps, b.x.mTaps);
  assert.equal(a.x.mWords, b.x.mWords);
});

/* 017 step 2 — the app and the bench share one deliverability rule:
 * no fixed window; an answer that arrives after the moment's deadline
 * (the next pick / sentence close) or while a reach is underway never
 * repaints — but it is still evidence. */
test("jevDeliverable: the single timing rule (017-2)", () => {
  assert.equal(jevDeliverable({ answeredAt: 800, reachStartedAt: 900 }), true);
  assert.equal(jevDeliverable({ answeredAt: 1000, reachStartedAt: 900 }), false,
    "a tile must never change under a reaching hand");
  assert.equal(jevDeliverable({ answeredAt: 30_000, reachStartedAt: null }), true,
    "no fixed window — a slow answer to an open moment still delivers");
  assert.equal(jevDeliverable({ answeredAt: 800, reachStartedAt: null, moved: true }), false,
    "an answer after the moment closed can't help that pick");
});

/** A stub Jev arm that is always right (shows the upcoming pick) and
 *  answers `latencyMs` after the moment opened. */
const alwaysRightJev = (catalog, fixture, latencyMs) => {
  const sched = buildSchedule(fixture, { measureFrom: 11 });
  const wordAt = new Map();
  for (const item of sched.sents) {
    for (const p of item.words) wordAt.set(p.at, p.w);
  }
  return (db, sents, at, resolve, base) => {
    const pick = resolve(wordAt.get(at));
    return { ...base, jev: {
      answeredAt: at + latencyMs, latencyMs, probs: { c1: 0.9, none: 0.1 },
      model: "stub", candidates: base.candidates,
      shown: [{ kind: pick.kind, id: pick.id }], pNone: 0,
    }};
  };
};

test("timing: a late-but-right Jev gains theoretically, delivers nothing (017-2)", async () => {
  const senseId = new Map(
    catalog.labels.filter((l) => l.kind === "lemma" && l.locale === "en")
      .map((l) => [l.text, l.sense_id]));
  const mkArm = (name, latencyMs) => {
    const db = openDb();
    const entities = fixture.entities.map((e, i) =>
      addPersonalEntity(db, { id: `ent_sim_${i}`, spokenName: e.name, category: e.category }));
    const entId = new Map(entities.map((e) => [e.spokenName, e.id]));
    const resolve = (w) => entId.has(w)
      ? { kind: "entity", id: entId.get(w) }
      : { kind: "sense", id: senseId.get(w) };
    const stub = alwaysRightJev(catalog, fixture, latencyMs);
    const offer = async (d, sents, at) => {
      const base = modelOffer(MODEL)(d, sents, at);
      return stub(d, sents, at, resolve, base);
    };
    return { name, db, entities, offer };
  };
  // Answers arrive 5 s out — past every 1.5 s pick gap, so moved.
  const late = await replayArms(catalog, fixture,
    [mkArm("late", 5000)], { measureFrom: 11 });
  // Answers arrive at 400 ms — before the 900 ms reach boundary of the
  // next pick; no cutoff kills them.
  const early = await replayArms(catalog, fixture,
    [mkArm("early", 400)], { measureFrom: 11 });

  const stats = (r) => {
    const mid = r.picks.filter((p) => p.position > 0 && p.altShownKeys !== null
      ? p.at >= r.measureStart : false);
    const all = r.picks.filter((p) => p.at >= r.measureStart && p.position > 0);
    const hits = (keys) => all.filter((p) =>
      (keys === "theo" ? p.altShownKeys ?? p.shownKeys : p.shownKeys)
        .includes(p.label)).length;
    return { all: all.length, delivered: hits("delivered"), theoretical: hits("theo") };
  };
  const L = stats(late.late), E = stats(early.early);
  assert.ok(L.all > 20 && E.all > 20, "enough measured strip moments");
  // Late: every answer was theoretically perfect but none painted.
  assert.equal(L.theoretical, L.all, "always-right stub: 100% theoretical");
  const dbLocal = openDb();
  const entsLocal = fixture.entities.map((e, i) =>
    addPersonalEntity(dbLocal, { id: `ent_sim_${i}`, spokenName: e.name, category: e.category }));
  const localOnly = await replayDays(dbLocal, catalog, fixture, entsLocal,
    { measureFrom: 11, offer: modelOffer(MODEL) });
  const localHits = localOnly.picks.filter(
    (p) => p.at >= localOnly.measureStart && p.position > 0
      && p.shownKeys.includes(p.label)).length;
  assert.equal(L.delivered, localHits,
    "delivered = the local offer exactly — nothing arrived in time");
  // Early: everything delivered, so delivered = theoretical.
  assert.equal(E.delivered, E.all,
    "a 400 ms answer with 1.5 s picks always delivers (no 150 ms cutoff)");
  assert.equal(E.delivered, E.theoretical);
});
