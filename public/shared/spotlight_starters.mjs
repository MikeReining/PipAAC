/**
 * Suggested Spotlight lists (032 C). Shipped content, not a rule: each is
 * a handful of core words, all on the 60-button home board, so a first
 * Start glows without a trip into groups. Most carry a shipped coach tip
 * (data/coach_tips.json); "that" does not yet. Founder-reviewed; an adult
 * adds one to Your lists with a tap, and from then on it is theirs.
 *
 * `first` also decides which showcase tiles glow (SHOWCASE below).
 */
export const STARTER_LISTS = [
  // Ask (want, more, help), refuse (not), point at the world (that), and
  // comment (look) — not only requests (founder research, 2026-09-30).
  { id: "first", name: "First words", senses: ["sns_0013", "sns_0055", "sns_0025", "sns_0074", "sns_0011", "sns_0021"] }, // want more help not that look
  { id: "snack", name: "Snack time", senses: ["sns_0028", "sns_0029", "sns_0055", "sns_0056", "sns_0030"] }, // eat drink more all done open
  { id: "play", name: "Play time", senses: ["sns_0015", "sns_0026", "sns_0031", "sns_0021", "sns_0014"] }, // go stop turn look like
  // Moves (032 E; rebuilt for the wand law, 2026-09-30): two words, then a
  // button. ✨ is a grammar pass — it adds only the little words (is,
  // are, a, the, to) and never a word the child didn't tap, never a guess.
  // ❓ asks the same words as a question, with no question grammar to
  // build. Every word pair here is proven in the sentence-lab battery
  // (out/sentence_lab, run v5): "we play" → "We are playing." / "Are we
  // playing?", "it good" → "It is good." / "Is it good?", "mom play" →
  // "Mom is playing." / "Is Mom playing?". `move` is the example drawn as
  // tiles (E5); `recipe` is the line under it — it never promises more
  // than the battery shows.
  {
    id: "sentence", name: "Add the little words", controls: ["fix"],
    senses: ["sns_0009", "sns_0267", "sns_0008", "sns_0027", "sns_0059"], // we mom it play good
    move: ["sense:sns_0009", "sense:sns_0027", "control:fix"], // we → play → ✨
    recipe: "✨ adds only the little words, like is, are, a, the. It never guesses or adds a word.",
  },
  {
    id: "question", name: "Ask a question", controls: ["question"],
    senses: ["sns_0009", "sns_0267", "sns_0008", "sns_0027", "sns_0059", "sns_0066", "sns_0067", "sns_0068"], // we mom it play good what where who
    move: ["sense:sns_0009", "sense:sns_0027", "control:question"], // we → play → ❓
    recipe: "Two words, then ❓ asks them as a question. Or start with what, where, or who.",
  },
  {
    id: "no", name: "Say no",
    senses: ["sns_0074", "sns_0072", "sns_0026", "sns_0011", "sns_0008"], // not no stop that it
    move: ["sense:sns_0074", "sense:sns_0011"], // not → that
    recipe: "Two words say a lot. Point while you say them.",
  },
];

/** The one worked example Spotlight teaches with (032, founder
 *  2026-09-30): the page's picture, every Try it card, and the board
 *  during Try it use these tiles. The ones First words holds glow, and
 *  Try it lights exactly those, so card and board match. `tap` is a
 *  dimmed word: the picture taps it and card 2 asks for it. `move` is
 *  the pair card 3 lights with ✨ and card 4 asks with ❓ — a happy,
 *  shared pair (founder: never lead with a negative feeling), proven in
 *  the battery: "We are playing." / "Are we playing?". */
export const SHOWCASE = {
  tiles: ["sns_0001", "sns_0013", "sns_0055", "sns_0009", "sns_0027", "sns_0025"], // I want more we play help
  tap: "sns_0027", // play
  move: ["sns_0009", "sns_0027"], // we → play
};
/** Is a showcase tile lit by First words? */
export const showcaseLit = (id) => STARTER_LISTS[0].senses.includes(id);

export const starterTargets = (list) => [
  ...list.senses.map((id) => `sense:${id}`),
  ...(list.controls ?? []).map((c) => `control:${c}`),
];

/** The suggestion a saved list started as (matched by name), or null —
 *  its move and recipe show on the saved card too. */
export const starterFor = (name) => STARTER_LISTS.find((x) => x.name === name) ?? null;
