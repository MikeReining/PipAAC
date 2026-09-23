/**
 * Learning on the device (Dual_Engine §5.5, schema §6.2e).
 *
 * After each spoken sentence the device takes one gradient step per
 * impression on the log loss, with an L2 pull toward the shipped
 * defaults — a child with little data behaves like the default, and
 * weights drift as evidence accumulates. The label is the pick the
 * child actually made (chosen_* on the impression); a pick outside the
 * shortlist trains `none`. Cleared sentences are metrics only — their
 * target is unknown, so they never touch the weights.
 *
 * `local_only` learns from every impression; `with_jev` only from
 * impressions where Jev answered. Weights never leave the device.
 */
import { MODEL_FEATURES } from "./funnel.mjs";

const LR = 0.3;      // one online step per impression — modest, bounded
const L2 = 0.05;     // pull toward the shipped defaults
const BIAS_LR = 0.1;  // none_bias moves slower than feature weights:
                      // a child's pick-outside-shortlist rate includes
                      // retrieval misses (new words), not just bad offers —
                      // let ordering evidence land before the gate moves.
const BURN_IN = 50;  // "a child with little data behaves like the default":
                     // the row accumulates from day one, but the strip runs
                     // defaults until ~50 impressions back the drift.

/** The weights the strip should run now: the child's row if it exists,
 *  else the shipped defaults (not yet written — first Speak creates it). */
export function loadWeights(db, catalogModel, weightSet = "local_only") {
  const row = db
    .prepare(
      `SELECT weights, examples_seen FROM prediction_weights
       WHERE profile_id = 'prf_local' AND weight_set = ?`,
    )
    .all(weightSet)[0];
  if (row && row.examples_seen >= BURN_IN) {
    return { weights: JSON.parse(row.weights), examplesSeen: row.examples_seen };
  }
  return {
    weights: { ...catalogModel.weights[weightSet] },
    examplesSeen: row?.examples_seen ?? 0,
  };
}

const logit = (x, w) =>
  MODEL_FEATURES.reduce((t, f) => t + (w[f] ?? 0) * x[f], 0);

/**
 * Learn from one closed sentence. Returns the number of impressions
 * trained on (0 for a cleared sentence or a sentence with no labeled
 * impressions — nothing was written).
 */
export function learnFromSentence(
  db, sentenceId, catalogModel, { weightSet = "local_only" } = {},
) {
  const end = db
    .prepare("SELECT end_kind FROM sentence WHERE id = ?")
    .all(sentenceId)[0]?.end_kind;
  if (end !== "spoken") return 0;

  // local_only trains on every impression; with_jev only where Jev
  // actually answered — re-ranked impressions are its only evidence.
  const imps = db
    .prepare(
      `SELECT candidates, chosen_kind, chosen_id FROM strip_impression
       WHERE sentence_id = ? AND chosen_id IS NOT NULL
         AND (? = 'local_only' OR jev_status = 'answered')
       ORDER BY id`,
    )
    .all(sentenceId, weightSet);
  if (!imps.length) return 0;

  const defaults = catalogModel.weights[weightSet];
  const row = db
    .prepare(
      `SELECT weights, examples_seen FROM prediction_weights
       WHERE profile_id = 'prf_local' AND weight_set = ?`,
    )
    .all(weightSet)[0];
  const cur = row ? JSON.parse(row.weights) : { ...defaults };

  for (const imp of imps) {
    const cands = JSON.parse(imp.candidates);
    const label = cands.findIndex(
      (c) => c.kind === imp.chosen_kind && c.id === imp.chosen_id);
    const logits = cands.map((c) => logit(c.x, cur));
    const eN = Math.exp(cur.none_bias ?? 0);
    const Z = logits.reduce((a, s) => a + Math.exp(s), eN);
    for (const f of MODEL_FEATURES) {
      let g = 0;
      cands.forEach((c, i) => {
        g += (Math.exp(logits[i]) / Z - (i === label ? 1 : 0)) * c.x[f];
      });
      cur[f] = (cur[f] ?? 0) - LR * (g + L2 * ((cur[f] ?? 0) - (defaults[f] ?? 0)));
    }
    const pN = eN / Z;
    cur.none_bias = (cur.none_bias ?? 0)
      - (LR * BIAS_LR) * (pN - (label === -1 ? 1 : 0)
              + L2 * ((cur.none_bias ?? 0) - (defaults.none_bias ?? 0)));
  }

  db.prepare(
    `INSERT INTO prediction_weights
       (profile_id, weight_set, weights, defaults_version, examples_seen, updated_at)
     VALUES ('prf_local', ?, ?, ?, ?, ?)
     ON CONFLICT(profile_id, weight_set) DO UPDATE SET
       weights = excluded.weights,
       defaults_version = excluded.defaults_version,
       examples_seen = excluded.examples_seen,
       updated_at = excluded.updated_at`,
  ).run(
    weightSet, JSON.stringify(cur), catalogModel.version,
    (row?.examples_seen ?? 0) + imps.length, Date.now(),
  );
  return imps.length;
}
