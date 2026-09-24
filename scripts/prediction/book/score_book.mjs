// Score the shipped opening book (data/prediction/opening_book.en.json)
// through the item-1 real-children scorer — the file itself, via the same
// lookup the device uses (public/shared/opening_book.mjs). Prints every
// hit rate beside random, split later / first / after-adult per MLU band.
//
// Held-outs: CHILDES test transcripts (primary scoreboard),
// TinyDialogues val child turns (book never reads them), Imagine dev.
//
// Usage: node scripts/prediction/book/score_book.mjs [book.json]
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as C from '../childes/common.mjs';
import { buildEvents, scoreEvents, scoreOrder } from '../childes/score.mjs';
import { tokenize } from '../childes/book_model.mjs';
import { bookTop } from '../../../public/shared/opening_book.mjs';
import { NO_WINDOW } from '../../../public/shared/funnel.mjs';
import { BOOK_PATH } from './build_book.mjs';

// val events from a TinyDialogues file: child-speaker turns only.
// The file is one <|endoftext|>-terminated dialogue per line; turns are
// "**Speaker**: text" chunks joined by literal \n\n escapes. The child
// is the dominant speaker (Toddler at age 2, Child at age 5).
function tdValEvents(file, band) {
  const speakerCounts = {};
  const dialogues = [];
  for (const chunk of readFileSync(file, 'utf8').split('<|endoftext|>')) {
    const turns = [];
    for (const piece of chunk.split('\\n\\n')) {
      const m = piece.trim().match(/^\*\*([^*]+)\*\*:\s*"?([\s\S]*?)"?\s*$/);
      if (m) turns.push([m[1].trim(), tokenize(m[2])]);
    }
    if (!turns.length) continue;
    for (const [s] of turns) speakerCounts[s] = (speakerCounts[s] ?? 0) + 1;
    dialogues.push(turns);
  }
  const child = Object.entries(speakerCounts).sort((a, b) => b[1] - a[1])[0][0];
  const events = [];
  for (const turns of dialogues) {
    let prevAdult = [];
    for (const [spk, words] of turns) {
      const lems = C.lemmatize(words);
      if (spk === child) {
        const ctx = [];
        for (const lem of lems) {
          if (lem === null) { ctx.length = 0; continue; }
          events.push({ band, pos: ctx.length ? 'later' : 'first', ctx: ctx.slice(-2), prevAdult: prevAdult.slice(-8), target: lem });
          ctx.push(lem);
        }
      } else prevAdult = lems.filter((l) => l !== null);
    }
  }
  return events;
}

function imagineEvents(file) {
  const events = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const lems = C.lemmatize(tokenize(line));
    const ctx = [];
    for (const lem of lems) {
      if (lem === null) { ctx.length = 0; continue; }
      events.push({ band: 'imagine', pos: ctx.length ? 'later' : 'first', ctx: ctx.slice(-2), prevAdult: [], target: lem });
      ctx.push(lem);
    }
  }
  return events;
}

const pct = (x) => (x * 100).toFixed(1) + '%';

function printTable(label, out) {
  console.log(`\n== ${label} ==   (random ${pct(C.RANDOM_HIT)} non-core / ${pct(4 / C.LEMMAS.length)} all-words)`);
  for (const b of C.BANDS)
    console.log(
      `  ${C.BAND_LABEL[b].padEnd(10)} later ${pct(out[b + '|later'] ?? 0)}   ` +
      `first ${pct(out[b + '|first'] ?? 0)}   after-adult ${pct(out[b + '|afterAdult'] ?? 0)}   ` +
      `all ${pct(out[b + '|all'] ?? 0)}   'no' ${pct(out[b + '|noSlot'] ?? 0)} (off ${pct(out[b + '|noPlain'] ?? 0)})`,
    );
}

async function main() {
  const bookFile = process.argv[2] ?? BOOK_PATH;
  if (!existsSync(bookFile)) throw new Error(`no book at ${bookFile} — run build_book.mjs`);
  const book = JSON.parse(readFileSync(bookFile, 'utf8'));
  const predict = (e) => bookTop(book, e.band, e.ctx, 4, C.CORE);

  const trs = C.loadTranscripts();
  const { test } = C.splitIdx(trs.length);
  const events = buildEvents(trs, test);
  printTable(`opening book — CHILDES held-out (${path.basename(bookFile)})`, {
    ...scoreEvents(events, predict),
    // R21: the file's own ranking, core words included, through the same
    // noSlotOrder the strip paints with.
    ...scoreOrder(events, (e) => bookTop(book, e.band, e.ctx, NO_WINDOW)),
  });

  for (const [band, file] of [['mlu_lt2', C.TD_VAL('2')], ['mlu_2_35', C.TD_VAL('5')]]) {
    if (!existsSync(file)) continue;
    const evs = tdValEvents(file, band);
    const out = scoreEvents(evs, predict);
    console.log(`\n== TD-val ${path.basename(file)} (${evs.length} events, ${band} book) ==`);
    console.log(`  later ${pct(out[band + '|later'] ?? 0)}   first ${pct(out[band + '|first'] ?? 0)}`);
  }

  const dev = path.join(C.CACHE, 'imagine_dev.txt');
  if (existsSync(dev)) {
    const evs = imagineEvents(dev);
    // Imagine writers are adults — score against the mid band as background
    const out = scoreEvents(evs.map((e) => ({ ...e, band: 'mlu_2_35' })), predict);
    console.log(`\n== Imagine dev (${evs.length} events) ==`);
    console.log(`  later ${pct(out['mlu_2_35|later'] ?? 0)}   first ${pct(out['mlu_2_35|first'] ?? 0)}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
