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
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as C from './common.mjs';
import { build, topWords, childlike, tinydialogues, imagine, childesTrain } from './book_model.mjs';

const SAMPLE = 2500;
const BAND2AGE = { mlu_lt2: '2', mlu_2_35: '5', mlu_gt35: '5' };

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
// predict: (event) -> ranked candidate lemmas; hit = target in top 4.
export function scoreEvents(events, predict) {
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
    const hit = evs.filter((e) => predict(e).includes(e.target)).length;
    out[key] = evs.length ? hit / evs.length : 0;
  }
  // first words right after an adult turn: pos=first with a non-empty prevAdult
  for (const b of C.BANDS) {
    const pool = events.filter((e) => !C.CORE.has(e.target) && e.band === b && e.pos === 'first' && e.prevAdult.length);
    const evs = rng.shuffle([...pool]).slice(0, SAMPLE);
    const hit = evs.filter((e) => predict(e).includes(e.target)).length;
    out[b + '|afterAdult'] = evs.length ? hit / evs.length : 0;
  }
  return out;
}

export function score(book, events, { partnerBoost = false } = {}) {
  return scoreEvents(events, (e) =>
    topWords(book, e.ctx, 4, partnerBoost ? new Set(e.prevAdult) : null));
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
