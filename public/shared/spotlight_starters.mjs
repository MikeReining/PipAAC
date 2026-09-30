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
  // question grammar to build. `move` is one example to model, drawn as
  // the tiles themselves (E5); `recipe` is the line under it. Neither
  // states what the button will say.
  {
    id: "sentence", name: "Make it a sentence", controls: ["fix"],
    senses: ["sns_0055", "sns_0015", "sns_0028", "sns_0027"], // more go eat play
    move: ["sense:sns_0055", "sense:sns_0027", "control:fix"], // more → play → ✨
    recipe: "Two words, then ✨: Pip says the whole sentence.",
  },
  {
    id: "question", name: "Ask a question", controls: ["question"],
    senses: ["sns_0015", "sns_0013", "sns_0021", "sns_0066", "sns_0067", "sns_0068"], // go want look what where who
    move: ["sense:sns_0015", "sense:sns_0021", "control:question"], // go → look → ❓
    recipe: "Two words, then ❓ asks it. Or start with what, where, or who.",
  },
  {
    id: "no", name: "Say no",
    senses: ["sns_0074", "sns_0072", "sns_0026", "sns_0011", "sns_0008"], // not no stop that it
    move: ["sense:sns_0074", "sense:sns_0011"], // not → that
    recipe: "Two words say a lot. Point while you say them.",
  },
];

/** The one worked example Spotlight teaches with (032, founder
 *  2026-09-30: the page and Try it showed three different examples and it
 *  read as nonsense). The page's picture and every Try it card use these
 *  tiles. What glows is never listed here — it is whatever First words
 *  holds, so the picture always matches what Try it lights on the board.
 *  `tap` is a dimmed word: the picture taps it, card 2 asks for it, and
 *  card 3's move is First words' `more` + it + ✨. */
export const SHOWCASE = {
  tiles: ["sns_0001", "sns_0013", "sns_0055", "sns_0015", "sns_0026", "sns_0025"], // I want more go stop help
  tap: "sns_0015", // go
  lead: "sns_0055", // more — glows, and starts the move
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
