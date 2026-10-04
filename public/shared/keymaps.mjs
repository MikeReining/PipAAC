/**
 * Key maps — one per locale × letter order (phase 004, truth owner:
 * docs/product/Profile_Presentation_Modes.md § 4). Data only; all logic
 * lives in keyboard.mjs.
 *
 * Every map shares one skeleton: digits on row 1 (slots 0–9), the
 * locale's letters plus spare punctuation on rows 2–4 (slots 10–39),
 * remaining punctuation then space on row 5 (space always ends at slot
 * 47), ⌫ fixed at 48–49, and the partner row at 50–59. Because ⌫, the
 * space's right edge, the number row, and the partner row never move, a
 * bilingual child keeps most of the motor plan when the locale changes.
 *
 * `rows` lists the 30 cells of rows 2–4 left to right, top to bottom.
 * `punct` lists row-5 punctuation starting at slot 40. `dead` marks the
 * locale's dead key (two taps in a fixed order, never a long-press).
 * `alphabet` is the locale's full letter set — the word characters plus
 * what every order must cover exactly once.
 */
export const KEYMAPS = {
  en: {
    standardName: "QWERTY",
    alphabet: "abcdefghijklmnopqrstuvwxyz",
    standard: { rows: ["qwertyuiop", "asdfghjkl'", "zxcvbnm,.?"], punct: "!-" },
    abc: { rows: ["abcdefghij", "klmnopqrst", "uvwxyz',.?"], punct: "!-" },
  },
  de: {
    standardName: "QWERTZ",
    alphabet: "abcdefghijklmnopqrstuvwxyzäöüß",
    standard: { rows: ["qwertzuiop", "asdfghjklß", "yxcvbnmäöü"], punct: ",.?!" },
    abc: { rows: ["abcdefghij", "klmnopqrst", "uvwxyzäöüß"], punct: ",.?!" },
  },
  es: {
    standardName: "QWERTY",
    alphabet: "abcdefghijklmnñopqrstuvwxyz",
    dead: "´",
    standard: { rows: ["qwertyuiop", "asdfghjklñ", "zxcvbnm´,."], punct: "¿?¡!" },
    abc: { rows: ["abcdefghij", "klmnñopqrs", "tuvwxyz´,."], punct: "¿?¡!" },
  },
  fr: {
    standardName: "AZERTY",
    alphabet: "abcdefghijklmnopqrstuvwxyzéèàç",
    standard: { rows: ["azertyuiop", "qsdfghjklm", "wxcvbnéèàç"], punct: "',.?" },
    abc: { rows: ["abcdefghij", "klmnopqrst", "uvwxyzéèàç"], punct: "',.?" },
  },
};

/**
 * Answer keys (row 6, far right — slots 58–59, all locales, every order):
 * yes, no — sense ids, never English text, so each locale shows its own
 * label, drawn as the word's board tile. Founder 2026-10-03 dropped
 * wait-I'm-spelling, guess-my-word and oops (still catalog words).
 */
export const PARTNER_SENSES = ["sns_0073", "sns_0072"];
