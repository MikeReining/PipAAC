/**
 * Permissive model for unit tests: the show gate never suppresses and
 * every candidate clears τ_tile, so eligibility/ordering assertions stay
 * about *who may appear*, not about fitted weights. The fitted product
 * model lives in data/prediction/defaults.json and is exercised by
 * prediction_sim.test.mjs.
 */
export const TEST_MODEL = {
  weights: {
    invited: 2, phrase: 1.5, pair: 1.5, hour: 1,
    recency: 1, freq: 0.5, occasion: 0, echo: 0, fresh: 0, jev: 0,
    none_bias: 0,
  },
  tau: { tile: 0, none: Infinity },
};
