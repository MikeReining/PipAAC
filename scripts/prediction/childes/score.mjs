// Real-children scoreboard: score next-word books on held-out CHILDES
// child utterances. Port of ../pip-scratch/score.py — same 80/20 transcript
// split (seed 20260923), same interpolated 1-3-gram books, same 2,500
// sampled events per band/position bucket (seed 42), same metric: child's
// next non-core, in-vocab word in the top 4.
//
// Splits reported per band: later words / first words / first words right
// after an adult turn — each printed next to random (4 of the non-core
// vocab). Run: node scripts/prediction/childes/score.mjs [arms...]
// Arms: imagine | td | partner | childes | synth | all (default: all)
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as C from './common.mjs';

const SAMPLE = 2500;
const LAM3 = 0.55, LAM2 = 0.30, LAM1 = 0.15;
const BAND2AGE = { mlu_lt2: '2', mlu_2_35: '5', mlu_gt35: '5' };
const CL_BAND = { mlu_lt2: 'toddler', mlu_2_35: 'preschool', mlu_gt35: 'older' };

const WORD_RE = /[a-zA-Z']+/g;
const tokenize = (text) => text.toLowerCase().match(WORD_RE) ?? [];

// ---------- corpus readers -> raw word streams ----------
function* childlike(path, band = null) {
  const want = CL_BAND[band] ?? band;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line) continue;
    const d = JSON.parse(line);
    if (band && d.band !== want) continue;
    for (const t of d.turns) yield tokenize(t.t);
  }
}

function* tinydialogues(path) {
  const TD_RE = /\*\*([^*]+)\*\*:\s*"?([^*"]+?)"?\s*(?=\n\n|$)/g;
  for (const chunk of readFileSync(path, 'utf8').split('<|endoftext|>'))
    for (const m of chunk.matchAll(TD_RE)) yield tokenize(m[2]);
}

function* imagine(path) {
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const toks = tokenize(line);
    if (toks.length) yield toks;
  }
}

function* childesTrain(trs, trainIdx, which) {
  for (const i of [...trainIdx].sort((a, b) => a - b))
    for (const [spk, words] of trs[i])
      if (which === 'chi' ? C.CHILD_TAGS.has(spk) : C.ADULT_TAGS.has(spk)) yield words;
}

// ---------- book: ctx -> next-word counts, interpolated 1-3-gram ----------
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
        if (ctx.length >= 2) bump2(tri, ctx[ctx.length - 2] + '' + ctx[ctx.length - 1], lem, w);
        bump(uni, lem, w);
        ctx.push(lem);
      }
    }
  }
  return { uni, bi, tri, start };
}

const sortedDesc = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);

export function topWords(book, ctx, n = 4, partner = null) {
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
    const tk = c2 !== null ? tri.get(c2 + '' + c1) : null;
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
  const ranked = sortedDesc(scores).map(([w]) => w).filter((w) => !C.CORE.has(w)).slice(0, n);
  if (ranked.length < n)
    for (const [w] of sortedDesc(start)) {
      if (!C.CORE.has(w) && !ranked.includes(w)) ranked.push(w);
      if (ranked.length >= n) break;
    }
  return ranked.slice(0, n);
}

// ---------- events ----------
export function buildEvents(trs, testIdx) {
  const events = [];
  for (const i of [...testIdx].sort((a, b) => a - b)) {
    const utts = trs[i];
    if (utts.filter(([s]) => C.CHILD_TAGS.has(s)).length < 5) continue;
    const m = C.mlu(utts);
    if (m === 0) continue;
    const b = C.band(m);
    let prevAdult = [];
    for (const [spk, words] of utts) {
      const lems = C.lemmatize(words);
      if (C.CHILD_TAGS.has(spk)) {
        const ctx = [];
        for (const lem of lems) {
          if (lem === null) { ctx.length = 0; continue; }
          events.push({
            band: b,
            pos: ctx.length ? 'later' : 'first',
            ctx: ctx.slice(-2),
            prevAdult: prevAdult.slice(-8),
            target: lem,
          });
          ctx.push(lem);
        }
      } else if (C.ADULT_TAGS.has(spk)) prevAdult = lems.filter((l) => l !== null);
      else prevAdult = [];
    }
  }
  return events;
}

// ---------- score ----------
export function score(book, events, { partnerBoost = false } = {}) {
  const rng = new C.PyRandom(42);
  const by = new Map();
  for (const e of events) {
    if (C.CORE.has(e.target)) continue;
    const key = e.band + '|' + e.pos;
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(e);
  }
  const out = {};
  for (const [key, evs0] of by) {
    const evs = rng.shuffle([...evs0]).slice(0, SAMPLE);
    const hit = evs.filter((e) =>
      topWords(book, e.ctx, 4, partnerBoost ? new Set(e.prevAdult) : null).includes(e.target),
    ).length;
    out[key] = evs.length ? hit / evs.length : 0;
  }
  // first words right after an adult turn: pos=first with a non-empty prevAdult
  for (const b of C.BANDS) {
    const pool = events.filter((e) => !C.CORE.has(e.target) && e.band === b && e.pos === 'first' && e.prevAdult.length);
    const evs = rng.shuffle([...pool]).slice(0, SAMPLE);
    const hit = evs.filter((e) =>
      topWords(book, e.ctx, 4, partnerBoost ? new Set(e.prevAdult) : null).includes(e.target),
    ).length;
    out[b + '|afterAdult'] = evs.length ? hit / evs.length : 0;
  }
  return out;
}

const pct = (x) => (x * 100).toFixed(1) + '%';
const rPct = (C.RANDOM_HIT * 100).toFixed(1) + '%';

function report(label, out) {
  console.log(`\n== ${label} ==   (random ${rPct})`);
  for (const b of C.BANDS)
    console.log(
      `  ${C.BAND_LABEL[b].padEnd(10)} later ${pct(out[b + '|later'] ?? 0)}   ` +
      `first ${pct(out[b + '|first'] ?? 0)}   after-adult ${pct(out[b + '|afterAdult'] ?? 0)}`,
    );
}

async function main() {
  const args = process.argv.slice(2);
  const arms = args.length ? args : ['all'];
  const want = (a) => arms.includes(a) || arms.includes('all');

  console.log('loading transcripts...');
  const trs = C.loadTranscripts();
  const { test, train } = C.splitIdx(trs.length);
  console.log(`${trs.length} transcripts, ${test.size} held out`);
  const events = buildEvents(trs, test);
  console.log(`events: ${events.length} (non-core ${events.filter((e) => !C.CORE.has(e.target)).length})`);

  if (want('childes')) {
    report('CHILDES child speech', score(build([[1.0, childesTrain(trs, train, 'chi')]]), events));
    report('CHILDES caregiver speech', score(build([[1.0, childesTrain(trs, train, 'ad')]]), events));
  }
  if (want('imagine')) {
    if (!existsSync(C.IMAGINE_TRAIN)) throw new Error(`missing ${C.IMAGINE_TRAIN}`);
    report('Adult AAC (Imagine)', score(build([[1.0, imagine(C.IMAGINE_TRAIN)]]), events));
  }
  if (want('td')) {
    for (const band of C.BANDS) {
      const evs = events.filter((e) => e.band === band);
      const book = build([[1.0, tinydialogues(C.TD(BAND2AGE[band]))]]);
      report(`TinyDialogues age-${BAND2AGE[band]} -> ${C.BAND_LABEL[band]}`, score(book, evs));
    }
  }
  if (want('partner')) {
    for (const band of C.BANDS) {
      const evs = events.filter((e) => e.band === band);
      const book = build([[1.0, tinydialogues(C.TD(BAND2AGE[band]))]]);
      report(`TinyDialogues + partner -> ${C.BAND_LABEL[band]}`, score(book, evs, { partnerBoost: true }));
    }
  }
  if (want('synth')) {
    for (const band of C.BANDS) {
      const evs = events.filter((e) => e.band === band);
      report(`childlike synth -> ${C.BAND_LABEL[band]}`, score(build([[1.0, childlike(C.CHILDLIKE, band)]]), evs));
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
