/**
 * 017 step 11 — persona draws for the synthetic users. Pure and seeded:
 * one mulberry32 stream per user id, so regenerating a user is stable
 * independent of how many other users exist. The generator NEVER
 * imports a predictor module — the answer key must stay independent of
 * the ranker (the synth test greps these imports).
 *
 * Eval-only patterns (users 81–100): every eval user gets a pattern
 * absent from the fit/tune pool — night-shift household, vacation week,
 * new sibling mid-month, comment-heavy talker — so a model tuned on
 * 1–80 can't have memorized the eval shape.
 */

export const GENERATOR_VERSION = "1.0.0";
export const SEED = 20260923;
export const USER_COUNT = 100;
export const EVAL_FROM = 81;

/** mulberry32 — tiny deterministic PRNG. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const range = (r, lo, hi) => lo + r() * (hi - lo);
const irange = (r, lo, hi) => Math.floor(range(r, lo, hi + 1));

export const NAME_POOL = [
  "Mama", "Dada", "Grandma", "Grandpa", "Buddy", "Rosie", "Max",
  "Lily", "Sam", "Aunt Jo", "Uncle Ray", "Nana", "Papa", "Zeke",
  "Molly", "Bear", "Ducky", "Fluffy", "Rex", "Coco",
];
export const ENTITY_CATEGORIES = [
  "People, Family & Roles", "Toys, Play, Media & Leisure",
  "Animals & Nature",
];

const TZ_POOL = [-480, -420, -360, -300, -240, 0, 60, 120, 540, 600];

/**
 * Draw one persona. `id` 1–100; eval ids get a special pattern first,
 * then the shared draws — the pattern is visible in the file so a
 * reviewer sees eval users really differ.
 */
export function drawPersona(id) {
  const r = mulberry32(SEED ^ (id * 2654435761));
  const p = {
    id,
    pattern: "standard",
    routine: range(r, 0.3, 1),               // schedule tightness
    vocabSize: irange(r, 30, 300),
    zipf: range(r, 0.4, 1.4),                // preference skew
    repetition: range(r, 0, 0.4),            // verbatim-repeat chance
    noveltyPerWeek: irange(r, 0, 15),
    jitterMin: irange(r, 0, 45),             // ± minutes on every slot
    weekendShiftMin: irange(r, 0, 120),      // later schedule on weekends
    changeDay: irange(r, 12, 20),            // mid-month schedule change
    entityCount: irange(r, 2, 8),
    msgMix: {                                // message-type weights
      request: range(r, 0.3, 0.6),
      comment: range(r, 0.1, 0.4),
      question: range(r, 0.02, 0.2),
      refusal: range(r, 0.03, 0.15),
      social: range(r, 0.02, 0.15),
    },
    repairRate: range(r, 0, 0.08),           // wrong pick → backspace
    echoRate: range(r, 0.1, 0.7),            // share of partner word reused
    answerRate: range(r, 0.2, 0.5),          // share of messages that answer a partner
    telegraphic: r() < 0.5,                  // mostly 1–3 word messages
    decidingMsMean: range(r, 1200, 6000),    // pause before each message
    decidingMsSd: range(r, 0.3, 0.8),        // lognormal sigma
    tzOffsetMin: pick(r, TZ_POOL),
    llmShare: range(r, 0.1, 0.5),            // share of llm-bank messages
    categoryBias: {},                        // filled below
    bank: {},                                // filled below
  };
  // Occasion salience: which parts of the day this user talks most in.
  for (const oc of OCCASIONS) p.categoryBias[oc] = range(r, 0.5, 1.5);

  if (id >= EVAL_FROM) {
    const patterns = ["night_shift", "vacation_week", "new_sibling", "comment_heavy"];
    p.pattern = patterns[(id - EVAL_FROM) % patterns.length];
    if (p.pattern === "night_shift") {
      p.nightShiftH = 5;                     // whole schedule +5 h
      p.routine = Math.max(p.routine, 0.7);
    } else if (p.pattern === "vacation_week") {
      p.vacationDays = [10, 16];             // all-home days
    } else if (p.pattern === "new_sibling") {
      p.siblingDay = irange(r, 12, 18);      // entity joins mid-month
    } else if (p.pattern === "comment_heavy") {
      p.msgMix.comment = 0.6;
      p.msgMix.request = 0.15;
      p.llmShare = Math.max(p.llmShare, 0.5);
    }
  }
  return p;
}

/** The occasion clock a day is built from: [name, baseHHMM, msgs/day max]. */
export const OCCASIONS = [
  "wakeup", "breakfast", "getting_dressed", "leaving", "school",
  "lunch", "snack", "play", "outing", "sick", "dinner", "bath", "bedtime",
];
export const OCCASION_CLOCK = {
  wakeup: ["07:15", 2],
  breakfast: ["07:40", 3],
  getting_dressed: ["08:10", 2],
  leaving: ["08:35", 2],
  school: ["10:30", 3],
  lunch: ["12:15", 3],
  snack: ["15:30", 2],
  play: ["16:30", 4],
  outing: ["17:30", 2],
  dinner: ["18:15", 3],
  bath: ["19:20", 2],
  bedtime: ["19:55", 3],
  sick: ["10:00", 3],
};
/** School-day occasions — weekends and vacation drop the school block. */
export const SCHOOL_ONLY = new Set(["school", "leaving"]);
