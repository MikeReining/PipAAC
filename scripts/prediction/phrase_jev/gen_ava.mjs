// Ava's life as one continuous log: 21 days, day 1 = a Tuesday, so the
// last day (the test day) is a Monday school day. Her routines repeat the
// way a child's do; ~12% of the time she says a variation of a routine
// sentence; a pool of one-off sentences is scattered across the weeks.
// Nothing is curated for the test: the split is by time only.
//
//   node scripts/prediction/phrase_jev/gen_ava.mjs   -> ava_log.json
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { PyRandom } from '../childes/common.mjs';

const rng = new PyRandom(20260924);
const rand = () => rng.genrand() / 4294967296; // uniform [0, 1)
const pick = (items) => {             // weighted pick from [text, weight]
  const total = items.reduce((a, [, w]) => a + w, 0);
  let r = rand() * total;
  for (const [t, w] of items) { if ((r -= w) <= 0) return t; }
  return items.at(-1)[0];
};

// slot: [start "HH:MM", end "HH:MM", how many sentences (min,max), sentences]
const SCHOOL = [
  ['07:00', '07:20', [1, 2], [['good morning mom', 3], ['good morning dad', 3], ['where is Max', 3], ['I am hungry', 2]]],
  ['07:20', '07:45', [1, 3], [['I want juice', 6], ['I want milk', 3], ['I want cereal', 4], ['I want toast', 2], ['I want pancakes', 1], ['can I have juice', 2], ['I want more', 2]]],
  ['07:45', '08:10', [1, 2], [['I need my shoes', 4], ['where is my backpack', 3], ['go to school', 2], ["I don't want to go to school", 2], ['mom help me', 2]]],
  ['12:00', '14:00', [1, 3], [['I want to play outside', 4], ['I want to play with Leo', 3], ['can I play on the swing', 3], ['I need help', 3], ['I need to go to the bathroom', 3], ['I like the slide', 1]]],
  ['14:30', '16:00', [1, 2], [['I want a snack', 4], ['I want crackers', 3], ['I want to go home', 3], ['I am tired', 2], ['where is mom', 1]]],
  ['17:00', '18:30', [1, 3], [['I want to watch TV', 4], ['I want to watch Bluey', 4], ['I want pizza', 2], ['I want pasta', 2], ["I don't like that", 2], ['I want grandma', 1], ['call grandma', 1]]],
  ['19:00', '20:00', [2, 3], [['I want to take a bath', 3], ['read me a book', 3], ['I want the dinosaur book', 2], ['I want my blanket', 3], ['where is my bear', 2], ['I love you mom', 3], ['I love you dad', 1], ['good night', 4]]],
];
const WEEKEND = [
  SCHOOL[0], SCHOOL[1],
  ['09:30', '12:00', [1, 3], [['I want to go to the park', 3], ['I want to play with Max', 3], ["can we go to grandma's house", 2], ['I want to go swimming', 1], ['I want ice cream', 2], ['I want to play outside', 3]]],
  ['13:00', '16:00', [1, 2], [['I want a snack', 3], ['I want to watch Bluey', 2], ['I want to play outside', 3], ['I am tired', 2]]],
  SCHOOL[5], SCHOOL[6],
];
const VARIATIONS = {
  'I want juice': ['I want apple juice', 'I want juice please'],
  'I want to watch Bluey': ['I want to watch Bluey please'],
  'I want pizza': ['I want pizza for dinner'],
  'read me a book': ['read me the dinosaur book'],
  'good night': ['good night mom', 'good night dad'],
  'I need help': ['I need help please'],
  'can I play on the swing': ['can I play on the slide'],
  'I want a snack': ['I want a snack please', 'I want a cookie'],
  'I want to go to the park': ['I want to go to the park with Leo'],
  'where is Max': ['where is my dog'],
};
const ONE_OFF = [
  'my tummy hurts', 'I want to go to the zoo', 'Leo is my friend', 'I saw a big dog',
  "I don't want to take a bath", 'can I have a cookie', 'where is my red cup', 'I want to draw',
  'I am sad', 'I want to call dad', 'it is raining', 'I want to paint', 'Max is hungry',
  'I want to go to the beach', 'can I have water',
];

const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const mins = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const DAYS = ['Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon'];

const log = [];
for (let day = 1; day <= 21; day++) {
  const dow = DAYS[(day - 1) % 7];
  const slots = dow === 'Sat' || dow === 'Sun' ? WEEKEND : SCHOOL;
  const today = [];
  for (const [from, to, [lo, hi], items] of slots) {
    const n = lo + Math.floor(rand() * (hi - lo + 1));
    for (let i = 0; i < n; i++) {
      let s = pick(items);
      if (VARIATIONS[s] && rand() < 0.12) s = VARIATIONS[s][Math.floor(rand() * VARIATIONS[s].length)];
      const at = mins(from) + Math.floor(rand() * (mins(to) - mins(from)));
      today.push([s, at]);
    }
  }
  if (ONE_OFF.length && rand() < 0.7) {  // roughly one new sentence most days
    const s = ONE_OFF.splice(Math.floor(rand() * ONE_OFF.length), 1)[0];
    today.push([s, mins('08:30') + Math.floor(rand() * (mins('19:30') - mins('08:30')))]);
  }
  today.sort((a, b) => a[1] - b[1]);
  for (const [s, at] of today) log.push({ day, dow, at: hhmm(at), sentence: s });
}
const HERE = path.dirname(new URL(import.meta.url).pathname);
writeFileSync(path.join(HERE, 'ava_log.json'), JSON.stringify(log, null, 1));
const last = log.filter((e) => e.day === 21);
const seen = new Set(log.filter((e) => e.day < 21).map((e) => e.sentence));
console.log(`${log.length} sentences over 21 days; test day ${last[0].dow} has ${last.length}, of which ${last.filter((e) => seen.has(e.sentence)).length} were said before`);
