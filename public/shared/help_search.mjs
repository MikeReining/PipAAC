/**
 * 042 — Help search over public/help.en.json (answers + Settings rows).
 *
 * Two passes, one list:
 *   - `localHits`: on the device, instant and offline — words in the
 *     query found at the start of words in the entry.
 *   - search by meaning: the Worker embeds the query and every entry
 *     (`helpDocs` is the one place an entry becomes text) and ranks by
 *     cosine — "emotions" finds Feeling faces with no word in common.
 * `mergeHits` puts meaning first, then any local hit it missed.
 */

/** Every searchable text as {id, text}. Ids: `a:<answer id>` and
 *  `s:<index into settings>`. An answer is embedded twice, as its
 *  question alone (short, phrased like a search) and with its answer;
 *  an entry scores its best text. A Settings row with no words beyond
 *  its label is left out: a near-empty text matches everything a little. */
export function helpDocs(help) {
  return [
    ...help.answers.flatMap((a) => [
      { id: `a:${a.id}`, text: a.q },
      { id: `a:${a.id}`, text: `${a.q}\n${a.a}` },
    ]),
    ...help.settings.flatMap((s, i) => (s.text.length < 20 ? [] : [{
      id: `s:${i}`,
      text: `${s.title === s.label ? s.title : `${s.title}: ${s.label}`}. ${s.text}`,
    }])),
  ];
}

const words = (q) => q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
// Words that tell a search nothing on their own ("how do I…").
const FILLER = new Set(
  "a an and are be can do does for how i if in is it me my of on or the to what when where why with you your they them their".split(" "),
);

/** Instant pass: each query word (min 2 letters, not filler) found at
 *  the start of a word. The question or label counts double. */
export function localHits(help, query) {
  const qs = words(query).filter((w) => w.length > 1 && !FILLER.has(w));
  if (!qs.length) return [];
  const starts = (text) => {
    const ws = words(text);
    return qs.filter((q) => ws.some((w) => w.startsWith(q))).length;
  };
  const hits = [];
  const add = (id, head, body) => {
    const score = 2 * starts(head) + starts(body);
    // `all`: every query word is somewhere in the entry.
    if (score) hits.push({ id, score, all: starts(`${head} ${body}`) === qs.length });
  };
  help.answers.forEach((a) => add(`a:${a.id}`, a.q, a.a));
  help.settings.forEach((s, i) => add(`s:${i}`, s.label, s.text));
  return hits.sort((x, y) => y.score - x.score).slice(0, 8);
}

/** Cosine ranking (vectors as plain arrays); an id with several texts
 *  keeps its best score. */
export function rankByMeaning(queryVec, docVecs, { top = 8, min = 0 } = {}) {
  const norm = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  const qn = norm(queryVec);
  const best = new Map();
  for (const { id, vec } of docVecs) {
    let dot = 0;
    for (let i = 0; i < vec.length; i++) dot += vec[i] * queryVec[i];
    const score = dot / (qn * norm(vec));
    if (score >= min && score > (best.get(id) ?? -1)) best.set(id, score);
  }
  return [...best].map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, top);
}

/** Meaning first, then local hits it missed. Once meaning has answered,
 *  a local hit must hold every query word ("things" alone is noise). */
export function mergeHits(meaning, local) {
  const seen = new Set(meaning.map((h) => h.id));
  return [...meaning, ...local.filter((h) => !seen.has(h.id) && (!meaning.length || h.all))];
}
