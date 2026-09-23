#!/usr/bin/env node
/**
 * 006 slice 3 — fit the shipped starting weights (Dual_Engine §5.3).
 *
 * Replays fixture days 1–10 through the real feature path, collecting
 * one softmax training row per pick: the candidate feature vectors the
 * ranker saw and the pick that resolved them ('none' when the pick was
 * outside the shortlist). Gradient descent fits θ + none_bias on
 * cross-entropy with light L2; a small grid sweep picks τ_tile/τ_none
 * on the same days. Writes data/prediction/defaults.json, which the
 * catalog build embeds as `catalog.prediction`.
 *
 * Run: node scripts/prediction/fit_defaults.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { createDatabase, importCatalog } from "../../src/board/catalog.mjs";
import { addPersonalEntity } from "../../src/board/entities.mjs";
import { loadSimFixture, replayDays } from "../../src/board/sim_replay.mjs";
import {
  MODEL_FEATURES,
  scoreCandidates,
  showGate,
  stripScored,
} from "../../public/shared/funnel.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const OUT = join(repoRoot, "data/prediction/defaults.json");
const { catalog, fixture } = loadSimFixture(repoRoot);

// Collect training rows on days 1–10. The zero model only needs the
// candidate set + features — eligibility is weight-independent.
const ZERO = { weights: {}, tau: { tile: 0, none: Infinity } };
const db = createDatabase(":memory:");
importCatalog(db, catalog);
const entities = fixture.entities.map((e) =>
  addPersonalEntity(db, { spokenName: e.name, category: e.category }));
const { picks } = replayDays(db, catalog, fixture, entities, {
  measureFrom: 11,
  offer: (d, sents, at) => {
    const { candidates, pNone } = stripScored(d, sents, at, "en", ZERO);
    return { candidates, shown: candidates.slice(0, 4), pNone };
  },
});
const train = picks.filter((p) => p.day <= 10).map((p) => {
  const keys = p.candidates.map((c) => `${c.kind}:${c.id}`);
  return { xs: p.candidates.map((c) => c.x), label: keys.indexOf(p.label) };
});

// Fit in two passes — one softmax model at inference, honest training:
// θ ranks candidates on rows where the pick WAS in the shortlist
// (softmax over candidates only), then none_bias calibrates
// P(label ∉ shortlist) on all rows given θ. Fitting θ jointly with a
// 78%-'none' label set just teaches every feature to suppress.
const theta = Object.fromEntries(MODEL_FEATURES.map((f) => [f, 0]));
const LR = 0.4, L2 = 0.002, EPOCHS = 600;
// Warm start at the slice-2 heuristic's ordering — the fit refines from
// a sane point instead of wandering to an all-suppress optimum.
Object.assign(theta, { invited: 2, phrase: 1.5, pair: 1.5, hour: 1.5, recency: 1, freq: 0.8 });
const ranked = train.filter((t) => t.label >= 0);
for (let epoch = 0; epoch < EPOCHS; epoch++) {
  const g = Object.fromEntries(MODEL_FEATURES.map((f) => [f, 0]));
  let loss = 0;
  for (const { xs, label } of ranked) {
    const s = xs.map((x) => MODEL_FEATURES.reduce((t, f) => t + theta[f] * x[f], 0));
    const exps = s.map(Math.exp);
    const Z = exps.reduce((a, b) => a + b, 0);
    const ps = exps.map((e) => e / Z);
    loss += -Math.log(ps[label]);
    xs.forEach((x, i) => {
      const d = ps[i] - (i === label ? 1 : 0);
      for (const f of MODEL_FEATURES) g[f] += d * x[f];
    });
  }
  for (const f of MODEL_FEATURES) theta[f] -= LR * (g[f] / ranked.length + L2 * theta[f]);
  if (epoch % 150 === 0) console.log(`epoch ${epoch} rank loss ${(loss / ranked.length).toFixed(3)}`);
}

// none_bias: binary log-loss on 'label outside the shortlist' against
// the full candidate logsumexp — the same competition `none` faces in
// the softmax at inference.
let bias = 0;
for (let epoch = 0; epoch < EPOCHS; epoch++) {
  let gb = 0, loss = 0;
  for (const { xs, label } of train) {
    const logits = xs.map((x) =>
      MODEL_FEATURES.reduce((t, f) => t + theta[f] * x[f], 0));
    const m = Math.max(...logits, 0);
    const lse = m + Math.log(logits.reduce((a, s) => a + Math.exp(s - m), 0));
    const pN = 1 / (1 + Math.exp(lse - bias));
    loss += -(label === -1 ? Math.log(pN) : Math.log(1 - pN));
    gb += pN - (label === -1 ? 1 : 0);
  }
  bias -= LR * (gb / train.length + L2 * bias);
  if (epoch % 150 === 0) console.log(`epoch ${epoch} none loss ${(loss / train.length).toFixed(3)}`);
}

// τ sweep on the same days. A hit saves the child two taps (group walk
// → strip tile); a false show costs a glance, not a tap — so hits count
// triple what a false show does.
const weights = { ...theta, none_bias: bias };
let best = null;
for (const tile of [0, 0.02, 0.05, 0.08, 0.12, 0.16, 0.2]) {
  for (const none of [0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1]) {
    let hit = 0, falseShow = 0;
    for (const { xs, label } of train) {
      const rows = xs.map((x, i) => ({ i, x, id: String(i) }));
      const { candidates, pNone } = scoreCandidates(rows, weights);
      const shown = showGate(candidates, pNone, { tile, none });
      const hitIdx = shown.findIndex((c) => c.i === label);
      if (label >= 0 && hitIdx >= 0) hit++;
      else if (shown.length > 0) falseShow++;
    }
    const hitRate = hit / train.length, falseShowRate = falseShow / train.length;
    const score = 3 * hitRate - falseShowRate;
    if (!best || score > best.score) best = { tile, none, hitRate, falseShowRate, score };
  }
}

const defaults = {
  version: `006-s3.${new Date().toISOString().slice(0, 10)}`,
  fittedOn: "src/board/fixtures/routine_days.en.json days 1–10",
  weights: {
    local_only: Object.fromEntries(
      Object.entries(weights).map(([k, v]) => [k, +v.toFixed(4)])),
    // Until any impression carries a real jev feature, with_jev starts
    // identical to local_only — the jev weight learns on-device (§ 5.5).
    with_jev: Object.fromEntries(
      Object.entries(weights).map(([k, v]) => [k, +v.toFixed(4)])),
  },
  tau: { tile: best.tile, none: best.none },
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(defaults, null, 2) + "\n");
console.log(`wrote ${OUT}`);
console.log(`train rows ${train.length}; θ ${JSON.stringify(defaults.weights.local_only)}`);
console.log(`τ tile=${best.tile} none=${best.none} — hit ${(best.hitRate * 100).toFixed(1)}% ` +
  `falseShow ${(best.falseShowRate * 100).toFixed(1)}% on days 1–10`);
