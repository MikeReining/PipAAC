/**
 * Suggested Spotlight lists (032 C). Shipped content, not a rule: each is
 * a handful of core words that already carry a shipped coach tip
 * (data/coach_tips.json), all on the 60-button home board, so a first
 * Start glows without a trip into groups. Founder-reviewed; an adult
 * adds one to Your lists with a tap, and from then on it is theirs.
 *
 * `first` is also what Try it glows.
 */
export const STARTER_LISTS = [
  { id: "first", name: "First words", senses: ["sns_0013", "sns_0055", "sns_0025", "sns_0026", "sns_0056"] }, // want more help stop all done
  { id: "snack", name: "Snack time", senses: ["sns_0028", "sns_0029", "sns_0055", "sns_0056", "sns_0030"] }, // eat drink more all done open
  { id: "play", name: "Play time", senses: ["sns_0015", "sns_0026", "sns_0031", "sns_0021", "sns_0014"] }, // go stop turn look like
];

export const starterTargets = (list) => list.senses.map((id) => `sense:${id}`);
