/**
 * Shared simulation walker for 006 — one replay path for the works test
 * (prediction_sim.test.mjs) and the offline fit
 * (scripts/prediction/fit_defaults.mjs) so the fitted weights are tuned
 * on exactly the evidence the test measures.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";
import {
  closeSentence,
  fillChosen,
  logImpression,
  logSelection,
  openSentence,
  showGate,
  stripScored,
} from "../../public/shared/funnel.mjs";
import { loadWeights } from "../../public/shared/learn.mjs";

export function loadSimFixture(repoRoot) {
  const lexicon = JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8"));
  const mapRaw = readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8");
  const catalog = buildCatalog(lexicon, parseCoordinateMapMarkdown(mapRaw));
  const fixture = JSON.parse(
    readFileSync(join(repoRoot, "src/board/fixtures/routine_days.en.json"), "utf8"),
  );
  return { catalog, fixture };
}

const isCore = (db, kind, id) =>
  kind === "sense" &&
  db.prepare(
    "SELECT 1 AS x FROM core_cell WHERE layout = 'grid60' AND sense_id = ?",
  ).all(id).length > 0;

/** The shipped model's offer: scored shortlist + gated tiles. Takes the
 *  full catalog.prediction blob and resolves the local_only set — the
 *  sim has no Jev. */
export const modelOffer = (catalogModel) => (db, sents, at) => {
  const model = {
    weights: catalogModel.weights.local_only,
    tau: catalogModel.tau,
  };
  const { candidates, pNone } = stripScored(db, sents, at, "en", model);
  const shown = showGate(candidates, pNone, model.tau);
  return { candidates, shown, pNone };
};

/** What the board actually runs (slice 4): the child's learned weights
 *  when prediction_weights has a row, else the shipped defaults. */
export const liveOffer = (catalogModel) => (db, sents, at) => {
  const model = {
    weights: loadWeights(db, catalogModel).weights,
    tau: catalogModel.tau,
  };
  const { candidates, pNone } = stripScored(db, sents, at, "en", model);
  const shown = showGate(candidates, pNone, model.tau);
  return { candidates, shown, pNone };
};

/**
 * Replay the fixture. For every pick the strip's offer is recorded as an
 * impression, then the pick lands — the child takes a shown tile when the
 * strip offers the word, else taps the grid or walks the group path.
 *
 * `offer(db, sents, at)` → {candidates, shown, pNone}; pass a stub that
 * returns {candidates: [], shown: [], pNone: 0} to break the strip on
 * purpose (negative control). Every pick is also pushed onto `picks`
 * with its candidate features — the fit script trains on those.
 */
export function replayDays(db, catalog, fixture, entities, { offer, measureFrom, days } = {}) {
  const senseId = new Map();
  for (const l of catalog.labels.filter((l) => l.kind === "lemma" && l.locale === "en")) {
    senseId.set(l.text, l.sense_id);
  }
  const entId = new Map(entities.map((e) => [e.spokenName ?? e.name, e.id]));
  const resolve = (w) => {
    if (entId.has(w)) return { kind: "entity", id: entId.get(w) };
    const id = senseId.get(w);
    if (!id) throw new Error(`fixture word has no catalog lemma: ${w}`);
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
  const picks = [];
  const sents = [];          // {id, day, endKind} — slice 4 learns per sentence
  for (const day of fixture.days) {
    if (days && !days.includes(day.day)) continue;
    const routine = day.kind === "school" ? fixture.schoolDay : fixture.weekendDay;
    const extras = fixture.unscripted[String(day.day)] ?? [];
    const daySents = [...routine.sentences, ...extras].sort((a, b) =>
      a.at.localeCompare(b.at));
    for (const s of daySents) {
      const sid = openSentence(db, atFor(day.day, s.at));
      let members = [];
      s.words.forEach((w, i) => {
        const at = atFor(day.day, s.at) + i * 1500; // 1.5 s between picks
        const sentsState = members.map((m) => ({ kind: m.kind, id: m.id }));
        // The strip only renders mid-sentence — a sentence's first pick
        // shows idle starters, never a strip moment (board.js renderStrip).
        const { candidates, shown, pNone } = sentsState.length
          ? offer(db, sentsState, at)
          : { candidates: [], shown: [], pNone: 0 };
        const shownKeys = shown.map((c) => `${c.kind}:${c.id}`);
        const pick = resolve(w);
        const pickKey = `${pick.kind}:${pick.id}`;
        const source = shownKeys.includes(pickKey) ? "strip"
          : isCore(db, pick.kind, pick.id) ? "grid" : "group";
        if (sentsState.length) {
          logImpression(db, {
            sentenceId: sid, position: i, shownAt: at,
            candidates: candidates.map((c) => ({ kind: c.kind, id: c.id, x: c.x ?? {} })),
            shown: shownKeys, pNone,
          });
        }
        fillChosen(db, sid, { kind: pick.kind, id: pick.id, source });
        logSelection(db, pick.kind, pick.id, at,
          { sentenceId: sid, position: i, source });
        members.push(pick);
        picks.push({ at, day: day.day, candidates, shownKeys, label: pickKey });
        const cost = source === "group" ? 3 : 1;
        words++; taps += cost;
        if (at >= measureStart) { mWords++; mTaps += cost; }
      });
      closeSentence(db, sid, atFor(day.day, s.at) + s.words.length * 1500, "spoken");
      sents.push({ id: sid, day: day.day, endKind: "spoken" });
    }
  }
  return { taps, words, mTaps, mWords, measureStart, picks, sents };
}
