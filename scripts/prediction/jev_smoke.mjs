/**
 * 006 slice 5 live smoke (Dual_Engine § 3.4): real Jev round-trips
 * through the local Worker (jevRank → :8794/jev/rank → api.typesafe.ai),
 * measured on the replay walker's semantics.
 *
 *   node scripts/prediction/jev_smoke.mjs [--cap 16] [--from 1]
 *
 * --cap truncates the shortlist sent to Jev (8/16/32 comparison);
 * --from replays earlier days as history and measures from that day on
 * (default 1 = the day-1 cold start). Needs the agent copy running with
 * TYPESAFE_API_KEY in .dev.vars.
 */
import { join } from "node:path";
import { createDatabase, importCatalog } from "../../src/board/catalog.mjs";
import { addPersonalEntity } from "../../src/board/entities.mjs";
import { loadSimFixture } from "../../src/board/sim_replay.mjs";
import {
  closeSentence, fillChosen, logSelection, openSentence,
  scoreCandidates, showGate, stripScored,
} from "../../public/shared/funnel.mjs";
import { applyJev } from "../../public/shared/funnel.mjs";
import { buildJevRequest, jevProbabilities, jevRank, jevTerm } from "../../public/shared/jev.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const ORIGIN = opt("origin", "http://localhost:8794");
const CAP = Number(opt("cap", 16));
const FROM = Number(opt("from", 1));
const LOCALE = "en";

const repoRoot = join(import.meta.dirname, "../..");
const { catalog, fixture } = loadSimFixture(repoRoot);
const MODEL = catalog.prediction;

const isCore = (db, kind, id) =>
  kind === "sense" && db.prepare(
    "SELECT 1 FROM core_cell WHERE layout = 'grid60' AND sense_id = ?").all(id).length > 0;

/** A Jev offer: local shortlist (capped) → sanitized request → live
 *  Worker → applyJev under with_jev weights → gate. */
const jevOffer = (stats) => async (db, sents, at) => {
  const model = { weights: MODEL.weights.with_jev, tau: MODEL.tau };
  let { candidates, pNone } = stripScored(db, sents, at, LOCALE, model);
  candidates = candidates.slice(0, CAP);
  ({ candidates, pNone } = scoreCandidates(candidates, model.weights));
  const req = buildJevRequest(
    candidates.map((c) => jevTerm(db, c, LOCALE)),
    sents.map((c) => jevTerm(db, c, LOCALE)).filter(Boolean),
    null,
  );
  if (!req) {
    stats.skipped++;
    return { candidates, shown: showGate(candidates, pNone, model.tau), pNone };
  }
  const t0 = performance.now();
  try {
    const res = await jevRank(req, { origin: ORIGIN });
    stats.calls++; stats.ms.push(performance.now() - t0); stats.model = res.model;
    const probs = jevProbabilities(res);
    if (!probs) { stats.errors++; return { candidates, shown: showGate(candidates, pNone, model.tau), pNone }; }
    const rr = applyJev(candidates, probs, model.weights);
    return { candidates: rr.candidates, shown: showGate(rr.candidates, rr.pNone, model.tau), pNone: rr.pNone };
  } catch {
    stats.errors++;
    return { candidates, shown: showGate(candidates, pNone, model.tau), pNone };
  }
};

const localOffer = async (db, sents, at) => {
  const model = { weights: MODEL.weights.local_only, tau: MODEL.tau };
  const { candidates, pNone } = stripScored(db, sents, at, LOCALE, model);
  return { candidates, shown: showGate(candidates, pNone, model.tau), pNone };
};

async function replay(offer) {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  const entities = fixture.entities.map((e) =>
    addPersonalEntity(db, { spokenName: e.name, category: e.category }));
  const senseId = new Map(
    catalog.labels.filter((l) => l.kind === "lemma" && l.locale === LOCALE)
      .map((l) => [l.text, l.sense_id]));
  const entId = new Map(entities.map((e) => [e.spokenName, e.id]));
  const resolve = (w) =>
    entId.has(w) ? { kind: "entity", id: entId.get(w) } : { kind: "sense", id: senseId.get(w) };

  let taps = 0, words = 0, hits = 0, offers = 0, falseShows = 0;
  for (const day of fixture.days) {
    const measuring = day.day >= FROM;
    // History days run the local offer — identical priors for both arms
    // and no wasted calls; Jev only fires on measured days.
    const active = measuring ? offer : localOffer;
    const routine = day.kind === "school" ? fixture.schoolDay : fixture.weekendDay;
    const daySents = [...routine.sentences, ...(fixture.unscripted[String(day.day)] ?? [])]
      .sort((a, b) => a.at.localeCompare(b.at));
    for (const s of daySents) {
      const sid = openSentence(db, Date.now());
      const members = [];
      for (const [i, w] of s.words.entries()) {
        const sents = members.map((m) => ({ kind: m.kind, id: m.id }));
        const { shown } = members.length
          ? await active(db, sents, Date.now())
          : { shown: [] };
        const pick = resolve(w);
        const key = `${pick.kind}:${pick.id}`;
        const inShown = shown.some((c) => `${c.kind}:${c.id}` === key);
        if (members.length && measuring) {
          offers++; if (inShown) hits++; if (shown.length && !inShown) falseShows++;
        }
        const source = inShown ? "strip" : isCore(db, pick.kind, pick.id) ? "grid" : "group";
        fillChosen(db, sid, { kind: pick.kind, id: pick.id, source });
        logSelection(db, pick.kind, pick.id, Date.now(), { sentenceId: sid, position: i, source });
        members.push(pick);
        if (measuring) { words++; taps += source === "group" ? 3 : 1; }
      }
      closeSentence(db, sid, Date.now(), "spoken");
    }
  }
  return {
    offers, hits, hitRate: offers ? +(hits / offers).toFixed(3) : 0,
    falseShowRate: offers ? +(falseShows / offers).toFixed(3) : 0,
    taps, words, tapsPerWord: +(taps / words).toFixed(3),
  };
}

const stats = { calls: 0, errors: 0, skipped: 0, ms: [], model: null };
const local = await replay(localOffer);
const jev = await replay(jevOffer(stats));
const ms = stats.ms.sort((a, b) => a - b);
console.log(JSON.stringify({
  window: { cap: CAP, measureFrom: FROM },
  local_only: local,
  with_jev: jev,
  jev: {
    model: stats.model, calls: stats.calls, errors: stats.errors, skipped: stats.skipped,
    ms_median: ms.length ? +ms[ms.length >> 1].toFixed(0) : null,
    ms_p90: ms.length ? +ms[Math.floor(ms.length * 0.9)].toFixed(0) : null,
  },
}, null, 2));
