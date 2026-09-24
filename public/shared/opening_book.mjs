/**
 * The shipped opening book — read-only lookup, shared by the device
 * (funnel `book` feature + strip retrieval) and the repo scorers.
 * File shape (data/prediction/opening_book.en.json, built by
 * scripts/prediction/book/build_book.mjs):
 *   { version: 2, bands: { <band>: { tri: { "w1 w2": {w: p} },
 *                    bi: { "w1": {w: p} }, uni: {w: p}, start: {w: p} } } }
 *
 * Scoring mirrors the scorer's interpolated model: 0.55·P(tri) +
 * 0.30·P(bi) + 0.15·P(uni); an empty context reads the start table.
 * A 2-word context missing its tri row still gets its bi + uni parts,
 * like the scorer does.
 */

const LAM3 = 0.55, LAM2 = 0.30, LAM1 = 0.15;

/** Map(word -> interpolated probability) for a context of 0–2 lemmas. */
export function bookScores(book, band, ctx) {
  const b = book?.bands?.[band];
  const scores = new Map();
  if (!b) return scores;
  if (!ctx.length) {
    for (const [w, p] of Object.entries(b.start)) scores.set(w, p);
    return scores;
  }
  const add = (table, lam) => {
    for (const [w, p] of Object.entries(table ?? {}))
      scores.set(w, (scores.get(w) ?? 0) + lam * p);
  };
  if (ctx.length >= 2) add(b.tri[ctx[ctx.length - 2] + ' ' + ctx[ctx.length - 1]], LAM3);
  add(b.bi[ctx[ctx.length - 1]], LAM2);
  // uni applies only to words already scored (interpolation parity)
  for (const w of [...scores.keys()])
    scores.set(w, scores.get(w) + LAM1 * (b.uni[w] ?? 0));
  return scores;
}

/** Ranked next words for a context; `filter` drops words (core cells,
 *  hidden senses). Fills from the start table when the context is thin. */
export function bookTop(book, band, ctx, n = 4, filter = null) {
  const b = book?.bands?.[band];
  if (!b) return [];
  const scores = bookScores(book, band, ctx);
  const ok = (w) => !filter || !filter.has(w);
  const ranked = [...scores.entries()]
    .sort((a, c) => c[1] - a[1])
    .map(([w]) => w)
    .filter(ok)
    .slice(0, n);
  if (ranked.length < n)
    for (const w of Object.keys(b.start)) {
      if (ok(w) && !ranked.includes(w)) ranked.push(w);
      if (ranked.length >= n) break;
    }
  return ranked.slice(0, n);
}

/** log P(word | ctx) — the funnel's `book` feature. Missing words get a
 *  floor so the feature is finite and learnable. */
export function bookLogP(book, band, ctx, word, floor = 1e-6) {
  const p = bookScores(book, band, ctx).get(word) ?? 0;
  return Math.log(Math.max(p, floor));
}
