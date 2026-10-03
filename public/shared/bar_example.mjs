/**
 * The fixed example shown under the sentence-bar settings and on the
 * Lifetime page: what each button does to one set of taps. Static on
 * purpose — free, instant, offline, and never a model call. Every result
 * is the live output of the shipped prompts (qwen3.8-27b, temperature 0),
 * verified 2026-10-03 after the keep-every-tapped-word rule; re-verify
 * with the sentence lab whenever src/shared/transform_prompts.mjs
 * changes. "mom" and "work" are both on the core board.
 */
export const BAR_EXAMPLE = {
  taps: ["mom", "work"],
  rows: [
    { c: "fix", name: "Fix it", out: "Mom is working." },
    { c: "question", name: "Question", out: "Is Mom working?" },
    { c: "past", name: "Past", out: "Mom worked." },
    { c: "future", name: "Future", out: "Mom is going to work." },
  ],
};
