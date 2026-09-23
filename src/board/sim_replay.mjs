/**
 * Shared simulation walker — one replay path for the works test
 * (prediction_sim.test.mjs), the offline fit
 * (scripts/prediction/fit_defaults.mjs), and the bench arms (017-1).
 *
 * 017 step 1 — one clock, one walker: every pick's time comes from a
 * frozen schedule anchored to Monday 2026-01-05 (fixture day 1). Nothing
 * in this file or the logging calls it makes reads the wall clock —
 * stub `Date.now` to throw and a replay still completes. `replayArms`
 * runs the same schedule for every arm (each with its own database),
 * so arms differ only in their offer, never in picks or times.
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
 *  sim has no Jev. Offers may be async (a Jev arm awaits the network). */
export const modelOffer = (catalogModel) => (db, sents, at) => {
  const model = {
    weights: catalogModel.weights.local_only,
    tau: catalogModel.tau,
  };
  const { candidates, pNone } = stripScored(db, sents, at, "en", model);
  const shown = showGate(candidates, pNone, model.tau);
  return { candidates, shown, pNone, wl: { w: model.weights, tau: model.tau } };
};

/** What the board actually runs (slice 4): the child's learned weights
 *  when prediction_weights has a row, else the shipped defaults. */
export const liveOffer = (catalogModel) => (db, sents, at) => {
  const lw = loadWeights(db, catalogModel);
  const model = { weights: lw.weights, tau: catalogModel.tau };
  const { candidates, pNone } = stripScored(db, sents, at, "en", model);
  const shown = showGate(candidates, pNone, model.tau);
  return { candidates, shown, pNone,
    wl: { w: model.weights, tau: model.tau, seen: lw.examplesSeen } };
};

/** The frozen calendar (017-1): fixture day 1 is always Monday
 *  2026-01-05 — the fixture's school/weekend kinds follow a Mon–Sun
 *  week and features() buckets events by the real weekday, so the
 *  anchor can never float to whatever today happens to be. */
export const SIM_ANCHOR = new Date(2026, 0, 5);

/** Sim-clock time for (fixture day, "HH:MM") — local midnight of
 *  day 1 is SIM_ANCHOR; days count forward from there. */
export function simTime(day, hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(SIM_ANCHOR.getTime() + (day - 1) * 86400000);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

const DEFAULT_GAP_MS = 1500;

/**
 * The frozen event stream (017-1): every sentence and pick time for the
 * requested days, computed once and shared by every arm. A sentence may
 * carry per-pick `gaps` (ms between picks — the step-11 answer key's
 * timing); without them picks land 1.5 s apart, as before.
 */
export function buildSchedule(fixture, { measureFrom, days } = {}) {
  const sents = [];
  for (const day of fixture.days) {
    if (days && !days.includes(day.day)) continue;
    const routine = day.kind === "school" ? fixture.schoolDay : fixture.weekendDay;
    const extras = fixture.unscripted[String(day.day)] ?? [];
    const daySents = [...routine.sentences, ...extras].sort((a, b) =>
      a.at.localeCompare(b.at));
    for (const s of daySents) {
      const sentAt = simTime(day.day, s.at);
      const gap = (i) => s.gaps?.[i] ?? DEFAULT_GAP_MS;
      let at = sentAt;
      const words = s.words.map((w, i) => {
        const pick = { w, at, position: i };
        at += gap(i);
        return pick;
      });
      sents.push({ day: day.day, sentAt, closeAt: at, words });
    }
  }
  return { measureStart: simTime(measureFrom ?? 15, "00:00"), sents };
}

/**
 * Replay one frozen schedule into one database. For every pick the
 * strip's offer is recorded as an impression, then the pick lands — the
 * child takes a shown tile when the strip offers the word, else taps
 * the grid or walks the group path.
 *
 * `offer(db, sents, at)` → {candidates, shown, pNone, wl?} — may be
 * async; pass a stub returning {candidates: [], shown: [], pNone: 0} to
 * break the strip on purpose (negative control). `wl` is stored on the
 * impression as weights_local so the moment replays (017-5).
 * `afterSentence(db, sent)` runs after each close — an arm's learning
 * step goes here, at the sentence's sim-close time.
 */
export async function replayDays(db, catalog, fixture, entities, { offer, measureFrom, days, schedule, afterSentence } = {}) {
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

  const sched = schedule ?? buildSchedule(fixture, { measureFrom, days });
  const measureStart = sched.measureStart;

  let taps = 0, words = 0;
  let mTaps = 0, mWords = 0; // measured days only
  const picks = [];
  const sents = [];          // {id, day, endKind, closeAt}
  for (const item of sched.sents) {
    const sid = openSentence(db, item.sentAt);
    const members = [];
    for (const p of item.words) {
      const sentsState = members.map((m) => ({ kind: m.kind, id: m.id }));
      // The strip only renders mid-sentence — a sentence's first pick
      // shows idle starters, never a strip moment (board.js renderStrip).
      const o = sentsState.length
        ? await offer(db, sentsState, p.at)
        : { candidates: [], shown: [], pNone: 0 };
      const { candidates, shown, pNone } = o;
      const shownKeys = shown.map((c) => `${c.kind}:${c.id}`);
      const pick = resolve(p.w);
      const pickKey = `${pick.kind}:${pick.id}`;
      const source = shownKeys.includes(pickKey) ? "strip"
        : isCore(db, pick.kind, pick.id) ? "grid" : "group";
      if (sentsState.length) {
        logImpression(db, {
          sentenceId: sid, position: p.position, shownAt: p.at,
          candidates: candidates.map((c) => ({
            kind: c.kind, id: c.id, x: c.x ?? {}, s: c.s, p: c.p })),
          shown: shownKeys, pNone,
          weightsLocal: o.wl ?? null,
        });
      }
      fillChosen(db, sid, { kind: pick.kind, id: pick.id, source });
      logSelection(db, pick.kind, pick.id, p.at,
        { sentenceId: sid, position: p.position, source });
      members.push(pick);
      picks.push({ at: p.at, day: item.day, position: p.position,
        candidates, shownKeys, label: pickKey });
      const cost = source === "group" ? 3 : 1;
      words++; taps += cost;
      if (p.at >= measureStart) { mWords++; mTaps += cost; }
    }
    closeSentence(db, sid, item.closeAt, "spoken");
    sents.push({ id: sid, day: item.day, endKind: "spoken", closeAt: item.closeAt });
    afterSentence?.(db, sents[sents.length - 1]);
  }
  return { taps, words, mTaps, mWords, measureStart, picks, sents };
}

/**
 * One frozen stream, every arm (017-1): each arm gets
 * `{name, db, entities, offer, afterSentence?}` — its own database —
 * and replays the identical schedule. Picks and times are identical by
 * construction; only what each arm did with them can differ. Returns
 * `{name: replayDays result}`.
 */
export async function replayArms(catalog, fixture, arms, { measureFrom, days } = {}) {
  const schedule = buildSchedule(fixture, { measureFrom, days });
  const out = {};
  for (const arm of arms) {
    out[arm.name] = await replayDays(arm.db, catalog, fixture, arm.entities, {
      offer: arm.offer, schedule, afterSentence: arm.afterSentence,
    });
  }
  return out;
}
