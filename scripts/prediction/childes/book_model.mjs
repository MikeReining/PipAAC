// The interpolated 1-3-gram book model — shared by the scorer
// (score.mjs), the book builder (book/build_book.mjs), and the shipped
// file's scorer (book/score_book.mjs). Ported 1:1 from scratch score.py.
import { readFileSync } from 'node:fs';
import * as C from './common.mjs';

export const LAM3 = 0.55, LAM2 = 0.30, LAM1 = 0.15;

const WORD_RE = /[a-zA-Z']+/g;
export const tokenize = (text) => text.toLowerCase().match(WORD_RE) ?? [];

// ---------- corpus readers -> raw word streams ----------
export function* childlike(path, band = null) {
  const CL_BAND = { mlu_lt2: 'toddler', mlu_2_35: 'preschool', mlu_gt35: 'older' };
  const want = CL_BAND[band] ?? band;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line) continue;
    const d = JSON.parse(line);
    if (band && d.band !== want) continue;
    for (const t of d.turns) yield tokenize(t.t);
  }
}

export function* tinydialogues(path) {
  const TD_RE = /\*\*([^*]+)\*\*:\s*"?([^*"]+?)"?\s*(?=\n\n|$)/g;
  for (const chunk of readFileSync(path, 'utf8').split('<|endoftext|>'))
    for (const m of chunk.matchAll(TD_RE)) yield tokenize(m[2]);
}

export function* imagine(path) {
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const toks = tokenize(line);
    if (toks.length) yield toks;
  }
}

// CHILDES train stream; band filters to transcripts whose child MLU
// lands in that band (per-band books), which selects chi/ad speaker turns.
export function* childesTrain(trs, trainIdx, which, band = null) {
  for (const i of [...trainIdx].sort((a, b) => a - b)) {
    if (band && C.band(C.mlu(trs[i])) !== band) continue;
    for (const [spk, words] of trs[i])
      if (which === 'chi' ? C.CHILD_TAGS.has(spk) : C.ADULT_TAGS.has(spk)) yield words;
  }
}

// ---------- book: ctx -> next-word counts ----------
export function build(streams) {
  const uni = new Map(), bi = new Map(), tri = new Map(), start = new Map();
  const bump = (m, k, w) => m.set(k, (m.get(k) ?? 0) + w);
  const bump2 = (m, k, w2, w) => {
    if (!m.has(k)) m.set(k, new Map());
    bump(m.get(k), w2, w);
  };
  for (const [w, stream] of streams) {
    for (const words of stream) {
      const lems = C.lemmatize(words);
      const ctx = [];
      let first = true;
      for (const lem of lems) {
        if (lem === null) { ctx.length = 0; first = true; continue; }
        if (first) { bump(start, lem, w); first = false; }
        if (ctx.length >= 1) bump2(bi, ctx[ctx.length - 1], lem, w);
        if (ctx.length >= 2) bump2(tri, ctx[ctx.length - 2] + ' ' + ctx[ctx.length - 1], lem, w);
        bump(uni, lem, w);
        ctx.push(lem);
      }
    }
  }
  return { uni, bi, tri, start };
}

export const sortedDesc = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);

export function topWords(book, ctx, n = 4, partner = null, { core = false } = {}) {
  const { uni, bi, tri, start } = book;
  const scores = new Map();
  if (!ctx.length) {
    // empty ctx: start distribution over first 2n candidates (scratch parity)
    const cands = sortedDesc(start).slice(0, 2 * n);
    const tot = cands.reduce((a, [, v]) => a + v, 0) || 1;
    for (const [w, v] of cands) scores.set(w, v / tot);
  } else {
    const c1 = ctx[ctx.length - 1];
    const c2 = ctx.length >= 2 ? ctx[ctx.length - 2] : null;
    const uniTot = [...uni.values()].reduce((a, b) => a + b, 0);
    const tk = c2 !== null ? tri.get(c2 + ' ' + c1) : null;
    if (tk) {
      const tot = [...tk.values()].reduce((a, b) => a + b, 0);
      for (const [w, v] of tk) scores.set(w, (scores.get(w) ?? 0) + LAM3 * (v / tot));
    }
    const bk = bi.get(c1);
    if (bk) {
      const tot = [...bk.values()].reduce((a, b) => a + b, 0);
      for (const [w, v] of bk) scores.set(w, (scores.get(w) ?? 0) + LAM2 * (v / tot));
    }
    for (const w of [...scores.keys()]) scores.set(w, scores.get(w) + LAM1 * (uni.get(w) ?? 0) / uniTot);
  }
  if (partner) for (const w of partner) scores.set(w, (scores.get(w) ?? 0) + 2);
  // R21: `core` returns board words too — the default metric stays
  // non-core-only (the bar was fringe-only before item 6).
  const offer = (w) => core || !C.CORE.has(w);
  const ranked = sortedDesc(scores).map(([w]) => w).filter(offer).slice(0, n);
  if (ranked.length < n)
    for (const [w] of sortedDesc(start)) {
      if (offer(w) && !ranked.includes(w)) ranked.push(w);
      if (ranked.length >= n) break;
    }
  return ranked.slice(0, n);
}
