/**
 * 017 step 13 — the comparison arms. Every arm is
 * {name, offer, afterSentence?} — replayArms runs each on its own
 * database over the identical frozen schedule (017-1), and the bench
 * prices every pick through actions.mjs. An arm never scores itself:
 * the report reads the painted `shown` set + the answer key.
 *
 *   A0 nopred       — strip always empty
 *   A1 backoff      — classic AAC prediction: n-gram backoff over this
 *                     user's own past sentences, top slots always shown
 *   A2 frozen       — ranker+learner vendored at the phase-start commit
 *   A3 improved     — the working tree (liveOffer + learnFromSentence)
 *   A4/A4t          — A3 + a Jev offer (registered only when --jev is
 *                     given; step 14 wires the real cache)
 *   O1 oracle-rerank— A3's shortlist, target first when retrievable
 *   O2 oracle-strip — every non-core target shown (the ceiling)
 *   W  chains       — step 22, not built
 *
 * Every arm learns prequentially: the shipped defaults first, each
 * moment scored before it is learned from.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { liveOffer } from "../../../src/board/sim_replay.mjs";
import { learnFromSentence } from "../../../public/shared/learn.mjs";
import * as frozen from "./frozen/funnel.mjs";
import { learnFromSentence as frozenLearn, loadWeights as frozenLoadWeights } from "./frozen/learn.mjs";

/** Phase-start shipped defaults — A2 runs the code AND weights of the
 *  phase-start commit, not today's refit. */
const PHASE_START_MODEL = JSON.parse(readFileSync(
  join(import.meta.dirname, "frozen/defaults_phase_start.json"), "utf8"));

const key = (m) => `${m.kind}:${m.id}`;
const hourOf = (at) => new Date(at).getHours();

/** All enabled non-core senses + active entities — A1's pool. */
function poolRows(db) {
  const senses = db.prepare(
    `SELECT s.id FROM sense s
     WHERE NOT EXISTS (SELECT 1 FROM core_cell c
       WHERE c.sense_id = s.id AND c.layout = 'grid60')
       AND NOT EXISTS (SELECT 1 FROM sense_mask m
       WHERE m.sense_id = s.id AND m.status = 'hidden')`,
  ).all().map((r) => ({ kind: "sense", id: r.id }));
  const ents = db.prepare(
    "SELECT id FROM personal_entity WHERE status = 'active'",
  ).all().map((r) => ({ kind: "entity", id: r.id }));
  return [...senses, ...ents];
}

/** A1: counts learned from this user's own closed sentences. */
function backoffArm() {
  const bi = new Map(), tri = new Map(), uni = new Map(), byHour = new Map();
  const bump = (m, k) => m.set(k, (m.get(k) ?? 0) + 1);
  const seqFor = (db, sid) => db.prepare(
    `SELECT item_kind, item_id, selected_at FROM learner_event_log
     WHERE sentence_id = ? AND position IS NOT NULL ORDER BY position`,
  ).all(sid).map((r) => ({ k: `${r.item_kind}:${r.item_id}`, at: r.selected_at }));

  const score = (ctx, cand, hour) => {
    const c3 = ctx.slice(-3).join("|"), c2 = ctx.slice(-2).join("|"),
      c1 = ctx.slice(-1).join("|");
    if (tri.has(`${c3}>${cand}`)) return 4 + tri.get(`${c3}>${cand}`);
    if (bi.has(`${c2}>${cand}`)) return 3 + bi.get(`${c2}>${cand}`);
    if (uni.has(`${c1}>${cand}`)) return 2 + uni.get(`${c1}>${cand}`);
    return (byHour.get(`${hour}>${cand}`) ?? 0) * 0.01 + (uni.get(cand) ?? 0) * 0.001;
  };

  return {
    name: "A1 backoff",
    offer: (db, sents, at) => {
      const ctx = sents.map(key);
      const hour = hourOf(at);
      const rows = poolRows(db)
        .map((r) => ({ ...r, x: {}, s: score(ctx, key(r), hour) }))
        .sort((a, b) => b.s - a.s)
        .slice(0, 16);
      for (const r of rows) r.p = r.s;
      return { candidates: rows, shown: rows.slice(0, 4), pNone: 0 };
    },
    afterSentence: (db, sent) => {
      const seq = seqFor(db, sent.id);
      for (let i = 0; i < seq.length; i++) {
        const t = seq[i].k;
        bump(uni, t);
        bump(byHour, `${hourOf(seq[i].at)}>${t}`);
        if (i >= 1) bump(uni, `${seq[i - 1].k}>${t}`);
        if (i >= 2) bump(bi, `${seq.slice(i - 2, i).map((s) => s.k).join("|")}>${t}`);
        if (i >= 3) bump(tri, `${seq.slice(i - 3, i).map((s) => s.k).join("|")}>${t}`);
      }
    },
  };
}

/**
 * The arm list. `model` is catalog.prediction (shipped defaults).
 * `jev` — a function (db, sents, at) → {probs, candidates, shown, pNone,
 * model, latencyMs} | null — is optional; A4/A4t register only with it.
 */
export function buildArms({ model, jev = null } = {}) {
  const localOffer = liveOffer(model);
  const a3learn = (db, sent) =>
    learnFromSentence(db, sent.id, model, { weightSet: "local_only" });

  const arms = [
    {
      name: "A0 nopred",
      offer: () => ({ candidates: [], shown: [], pNone: 0 }),
      afterSentence: a3learn, // learns anyway — its evidence is the baseline's too
    },
    backoffArm(),
    {
      name: "A2 frozen",
      offer: (db, sents, at) => {
        const lw = frozenLoadWeights(db, PHASE_START_MODEL);
        const m = { weights: lw.weights, tau: PHASE_START_MODEL.tau };
        const { candidates, pNone } = frozen.stripScored(db, sents, at, "en", m);
        return {
          candidates,
          shown: frozen.showGate(candidates, pNone, m.tau),
          pNone,
          wl: { w: m.weights, tau: m.tau, seen: lw.examplesSeen },
        };
      },
      afterSentence: (db, sent) =>
        frozenLearn(db, sent.id, PHASE_START_MODEL, { weightSet: "local_only" }),
    },
    {
      name: "A3 improved",
      offer: localOffer,
      afterSentence: a3learn,
    },
  ];

  // O1: A3's ranking, the target first when the shortlist holds it.
  arms.push({
    name: "O1 oracle-rerank",
    offer: async (db, sents, at, ctx) => {
      const o = await localOffer(db, sents, at);
      const i = o.candidates.findIndex((c) => key(c) === ctx.target);
      const shown = i >= 0
        ? [o.candidates[i], ...o.candidates.filter((_, j) => j !== i).slice(0, 3)]
        : [];
      return { ...o, shown };
    },
    afterSentence: a3learn,
  });
  // O2: the single-word ceiling — every non-core target shown alone.
  arms.push({
    name: "O2 oracle-strip",
    offer: (db, sents, at, ctx) => {
      const [kind, id] = ctx.target.split(":");
      return {
        candidates: [{ kind, id, x: {}, s: 1, p: 1 }],
        shown: [{ kind, id, x: {}, s: 1, p: 1 }],
        pNone: 0,
      };
    },
    afterSentence: a3learn,
  });

  if (jev) {
    // A4 delivered: the walker's jev side-channel + jevDeliverable
    // decides whether the rerank painted. A4t: every answer counts.
    for (const [name, theoretical] of [["A4 jev-delivered", false], ["A4t jev-theoretical", true]]) {
      arms.push({
        name,
        offer: async (db, sents, at) => {
          const o = await localOffer(db, sents, at);
          const j = await jev(db, sents, at);
          if (!j) return o;
          return { ...o, jev: { ...j, answeredAt: at + (j.latencyMs ?? 0) } };
        },
        afterSentence: theoretical
          ? a3learn // A4t's with_jev evidence is identical; kept separate in the report
          : a3learn,
      });
    }
  }
  return arms;
}
