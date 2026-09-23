/**
 * Jev live smoke (Dual_Engine § 3.4): real Jev round-trips through the
 * local Worker (jevRank → :8794/jev/rank → api.typesafe.ai), measured on
 * the shared walker's frozen schedule (017-1 — no wall clock here; the
 * same run on any real date replays identical picks and times).
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
import {
  buildSchedule, loadSimFixture, replayArms,
} from "../../src/board/sim_replay.mjs";
import {
  applyJev, scoreCandidates, showGate, stripScored,
} from "../../public/shared/funnel.mjs";
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
const { measureStart } = buildSchedule(fixture, { measureFrom: FROM });

const localOffer = async (db, sents, at) => {
  const model = { weights: MODEL.weights.local_only, tau: MODEL.tau };
  const { candidates, pNone } = stripScored(db, sents, at, LOCALE, model);
  return { candidates, shown: showGate(candidates, pNone, model.tau), pNone };
};

/** A Jev offer: local shortlist (capped) → sanitized request → live
 *  Worker → applyJev under with_jev weights → gate. History days fall
 *  back to the local offer so both arms build identical priors (and no
 *  calls are wasted). */
const jevOffer = (stats) => async (db, sents, at) => {
  if (at < measureStart) return localOffer(db, sents, at);
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

const isCore = (db, kind, id) =>
  kind === "sense" && db.prepare(
    "SELECT 1 FROM core_cell WHERE layout = 'grid60' AND sense_id = ?").all(id).length > 0;

/** Measured strip moments → offer/hit/false-show + taps per word, all
 *  from the walker's recorded picks (a pick is a strip moment when
 *  position > 0 — the first tile shows idle starters). */
const measure = (db, result) => {
  const mid = result.picks.filter((p) => p.at >= measureStart && p.position > 0);
  const hits = mid.filter((p) => p.shownKeys.includes(p.label)).length;
  const falseShows = mid.filter(
    (p) => p.shownKeys.length && !p.shownKeys.includes(p.label)).length;
  let taps = 0, words = 0;
  for (const p of result.picks.filter((p) => p.at >= measureStart)) {
    const { kind, id } = { kind: p.label.split(":")[0], id: p.label.split(":")[1] };
    words++;
    taps += p.shownKeys.includes(p.label) || isCore(db, kind, id) ? 1 : 3;
  }
  return {
    offers: mid.length, hits,
    hitRate: mid.length ? +(hits / mid.length).toFixed(3) : 0,
    falseShowRate: mid.length ? +(falseShows / mid.length).toFixed(3) : 0,
    taps, words, tapsPerWord: words ? +(taps / words).toFixed(3) : 0,
  };
};

const newArm = (name, offer) => {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  const entities = fixture.entities.map((e) =>
    addPersonalEntity(db, { spokenName: e.name, category: e.category }));
  return { name, db, entities, offer };
};

const stats = { calls: 0, errors: 0, skipped: 0, ms: [], model: null };
const localArm = newArm("local_only", localOffer);
const jevArm = newArm("with_jev", jevOffer(stats));
const res = await replayArms(catalog, fixture, [localArm, jevArm], { measureFrom: FROM });
const ms = stats.ms.sort((a, b) => a - b);
console.log(JSON.stringify({
  window: { cap: CAP, measureFrom: FROM },
  local_only: measure(localArm.db, res.local_only),
  with_jev: measure(jevArm.db, res.with_jev),
  jev: {
    model: stats.model, calls: stats.calls, errors: stats.errors, skipped: stats.skipped,
    ms_median: ms.length ? +ms[ms.length >> 1].toFixed(0) : null,
    ms_p90: ms.length ? +ms[Math.floor(ms.length * 0.9)].toFixed(0) : null,
  },
}, null, 2));
