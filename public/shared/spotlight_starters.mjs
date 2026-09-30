/**
 * Suggested Spotlight lists (032 C). Shipped content, not a rule: each is
 * a handful of core words, all on the 60-button home board, so a first
 * Start glows without a trip into groups. Most carry a shipped coach tip
 * (data/coach_tips.json); "that" does not yet. Founder-reviewed; an adult
 * adds one to Your lists with a tap, and from then on it is theirs.
 *
 * `first` is also what Try it glows.
 */
export const STARTER_LISTS = [
  // Ask (want, more, help), refuse (not), point at the world (that), and
  // comment (look) — not only requests (founder research, 2026-09-30).
  { id: "first", name: "First words", senses: ["sns_0013", "sns_0055", "sns_0025", "sns_0074", "sns_0011", "sns_0021"] }, // want more help not that look
  { id: "snack", name: "Snack time", senses: ["sns_0028", "sns_0029", "sns_0055", "sns_0056", "sns_0030"] }, // eat drink more all done open
  { id: "play", name: "Play time", senses: ["sns_0015", "sns_0026", "sns_0031", "sns_0021", "sns_0014"] }, // go stop turn look like
  // Moves (032 E): two words, then a button. ✨ says the whole sentence
  // — the expansion an SLP does by hand — and ❓ asks it, with no
  // question grammar to build. The recipe tells the adult what to model;
  // it never states what the button will say.
  {
    id: "sentence", name: "Make it a sentence", controls: ["fix"],
    senses: ["sns_0055", "sns_0015", "sns_0028", "sns_0027"], // more go eat play
    recipe: "Tap two words, like more + play, then ✨. Pip says the whole sentence.",
  },
  {
    id: "question", name: "Ask a question", controls: ["question"],
    senses: ["sns_0015", "sns_0013", "sns_0021", "sns_0066", "sns_0067", "sns_0068"], // go want look what where who
    recipe: "Tap two words, like go + play, then ❓ to ask it. Or start with what, where, or who.",
  },
  {
    id: "no", name: "Say no",
    senses: ["sns_0074", "sns_0072", "sns_0026", "sns_0011", "sns_0008"], // not no stop that it
    recipe: "Two words say a lot: not + that, stop + it.",
  },
];

export const starterTargets = (list) => [
  ...list.senses.map((id) => `sense:${id}`),
  ...(list.controls ?? []).map((c) => `control:${c}`),
];

/** The recipe for a saved list that started as a suggestion (by name). */
export const recipeFor = (name) => STARTER_LISTS.find((x) => x.name === name)?.recipe ?? null;
