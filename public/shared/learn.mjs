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

const logit = (x, w, feats = MODEL_FEATURES) =>
  feats.reduce((t, f) => t + (w[f] ?? 0) * (x[f] ?? 0), 0);

/** 017-3: the local model's feature list — `jev` is left out entirely,
 *  not just zeroed, so a Jev-shaped offer can't leak into local
 *  learning. */
const LOCAL_FEATURES = MODEL_FEATURES.filter((f) => f !== "jev");

/**
 * Learn from one closed sentence. Returns the number of impressions
 * trained on (0 for a cleared sentence or a sentence with no labeled
 * impressions — nothing was written).
 */
export function learnFromSentence(
  db, sentenceId, catalogModel, { weightSet = "local_only", at = Date.now() } = {},
) {
  const end = db
    .prepare("SELECT end_kind FROM sentence WHERE id = ?")
    .all(sentenceId)[0]?.end_kind;
  if (end !== "spoken") return 0;

  // local_only trains on every impression; with_jev trains on every
  // moment where Jev returned probabilities — answered in time or late
  // (017-3: a late answer is still valid evidence about the word). The
  // trained_jev flag makes a moment's evidence train exactly once: an
  // answer landing after Speak is picked up by a later call instead of
  // being lost or double-counted.
  // Keyboard-mode rows are metrics only: the keyboard ranker has no
  // feature vector, so training on them once wrote NaN weights (017-4).
  const imps = db
    .prepare(
      `SELECT id, candidates, jev_probs, chosen_kind, chosen_id FROM strip_impression
       WHERE sentence_id = ? AND chosen_id IS NOT NULL AND mode = 'picture'
         AND (? != 'with_jev' OR (jev_probs IS NOT NULL AND trained_jev = 0))
       ORDER BY id`,
    )
    .all(sentenceId, weightSet);
  if (!imps.length) return 0;

  const feats = weightSet === "local_only" ? LOCAL_FEATURES : MODEL_FEATURES;
  const defaults = catalogModel.weights[weightSet];
  const row = db
    .prepare(
      `SELECT weights, examples_seen FROM prediction_weights
       WHERE profile_id = 'prf_local' AND weight_set = ?`,
    )
    .all(weightSet)[0];
  const cur = row ? JSON.parse(row.weights) : { ...defaults };

  for (const imp of imps) {
    // A candidate whose features are not all finite numbers is dropped
    // from the softmax — a pick of it trains `none`, never NaN (017-4).
    // with_jev rebuilds x.jev from the stored Jev probability (017-5's
    // merged row keeps local x clean).
    const cands = JSON.parse(imp.candidates).filter((c) =>
      Object.values(c.x ?? {}).every(
        (v) => typeof v === "number" && Number.isFinite(v)));
    // The none term gets the same fold scoreCandidates applies: Jev's
    // P(none) enters through the jev weight (017-3/017-5).
    let jevNone = null;
    if (weightSet === "with_jev") {
      const probs = imp.jev_probs ? JSON.parse(imp.jev_probs) : {};
      jevNone = Math.log(Math.max(probs.none ?? 0, 1e-9));
      for (const c of cands) {
        c.x = { ...c.x, jev: Math.log(Math.max(c.jp ?? 0, 1e-9)) };
      }
    }
    const label = cands.findIndex(
      (c) => c.kind === imp.chosen_kind && c.id === imp.chosen_id);
    const logits = cands.map((c) => logit(c.x, cur, feats));
    const eN = Math.exp((cur.none_bias ?? 0)
      + (jevNone === null ? 0 : (cur.jev ?? 0) * jevNone));
    const Z = logits.reduce((a, s) => a + Math.exp(s), eN);
    for (const f of feats) {
      let g = 0;
      cands.forEach((c, i) => {
        g += (Math.exp(logits[i]) / Z - (i === label ? 1 : 0)) * (c.x[f] ?? 0);
      });
      cur[f] = (cur[f] ?? 0) - LR * (g + L2 * ((cur[f] ?? 0) - (defaults[f] ?? 0)));
    }
    const pN = eN / Z;
    cur.none_bias = (cur.none_bias ?? 0)
      - (LR * BIAS_LR) * (pN - (label === -1 ? 1 : 0)
              + L2 * ((cur.none_bias ?? 0) - (defaults.none_bias ?? 0)));
  }

  // A non-finite weight must never be persisted — JSON.stringify(NaN)
  // lands as null and reads back as 0, silently zeroing the row (017-4).
  if (!Object.values(cur).every((v) => Number.isFinite(v))) {
    console.warn("learn: non-finite weights — row left unchanged");
    return 0;
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
    (row?.examples_seen ?? 0) + imps.length, at,
  );
  if (weightSet === "with_jev") {
    const mark = db.prepare(
      "UPDATE strip_impression SET trained_jev = 1 WHERE id = ?");
    for (const imp of imps) mark.run(imp.id);
  }
  return imps.length;
}

/**
 * 017 step 4 one-time repair: a persisted weights row a pre-fix
 * keyboard impression corrupted (NaN → null on read) is reset to the
 * shipped defaults with `examples_seen = 0`. Idempotent — a clean row
 * is untouched. Called once at open from `public/db.js`; returns the
 * number of rows repaired.
 */
export function repairCorruptWeights(db, catalogModel) {
  const upd = db.prepare(
    `UPDATE prediction_weights SET weights = ?, defaults_version = ?,
       examples_seen = 0, updated_at = ?
     WHERE profile_id = ? AND weight_set = ?`,
  );
  let n = 0;
  for (const r of db
    .prepare("SELECT profile_id, weight_set, weights FROM prediction_weights")
    .all()) {
    let w;
    try { w = JSON.parse(r.weights); } catch { w = null; }
    const bad = !w || typeof w !== "object"
      || Object.values(w).some(
        (v) => typeof v !== "number" || !Number.isFinite(v));
    const defaults = catalogModel?.weights?.[r.weight_set];
    if (!bad || !defaults) continue;
    upd.run(JSON.stringify({ ...defaults }), catalogModel.version,
      Date.now(), r.profile_id, r.weight_set);
    n++;
  }
  return n;
}
