/**
 * The wand scorer — a check the model can't influence. Compares the
 * content words of her taps with the transform output, both reduced to
 * base forms. Flags:
 *   added   — content words in the output she didn't tap (fabrication)
 *   dropped — tapped content words missing from the output (lost meaning)
 *   subject — a subject pronoun appearing with no pronoun she tapped
 *   same    — output equals input (an abstention; per the wand law, a
 *             pass — never a failure)
 *
 * Lab-only instrument. Never runs in production ("fix prompts, no
 * validators"). Over-matching on purpose: stem variants are generous so
 * flags only fire on real additions/losses, not morphology noise.
 */

/** Closed-class words a grammar pass may add — articles, auxiliaries,
 *  tense/agreement forms, negation particles, coordinators. A flagged
 *  word outside this set is a content-word fabrication by definition. */
export const GLUE = new Set([
  "a", "an", "the", "to", "of", "in", "on", "at",
  "am", "is", "are", "was", "were", "be", "been", "being",
  "do", "does", "did", "done", "doing",
  "have", "has", "had", "having",
  "will", "would", "going", "gonna",
  "not", "no", "dont", "doesnt", "didnt", "wont",
  // tokenizer splits contractions — the fragments are function words too
  "don", "doesn", "didn", "won", "t", "s", "m", "re", "ll", "ve", "d",
  "and", "or", "but", "so",
]);

/** Canonical pronoun groups — me/my/mine and I/i are the same tap.
 *  A group in the output with no group member in the input is an
 *  added subject (or object) she never expressed. */
export const PRONOUN_GROUPS = {
  me: ["i", "me", "my", "mine", "myself"],
  we: ["we", "us", "our", "ours"],
  you: ["you", "your", "yours", "yourself", "u"],
  he: ["he", "him", "his"],
  she: ["she", "her", "hers"],
  they: ["they", "them", "their", "theirs"],
  it: ["it", "its"],
};

/** Irregular verb/noun base forms. Regular -s/-ed/-ing handled by
 *  stemVariants below. */
const IRREG = {
  went: "go", gone: "go", goes: "go", going: "go", gonna: "go",
  ate: "eat", eaten: "eat", eats: "eat",
  ran: "run", runs: "run",
  said: "say", says: "say",
  saw: "see", seen: "see", sees: "see",
  did: "do", done: "do", does: "do",
  had: "have", has: "have",
  made: "make", makes: "make",
  took: "take", taken: "take", takes: "take",
  gave: "give", given: "give", gives: "give",
  came: "come", comes: "come",
  got: "get", gotten: "get", gets: "get",
  sat: "sit", sits: "sit",
  felt: "feel", feels: "feel",
  found: "find", finds: "find",
  told: "tell", tells: "tell",
  knew: "know", known: "know", knows: "know",
  thought: "think", thinks: "think",
  brought: "bring", brings: "bring",
  bought: "buy", buys: "buy",
  wore: "wear", worn: "wear", wears: "wear",
  broke: "break", broken: "break", breaks: "break",
  children: "child", kids: "kid", men: "man", women: "woman",
  people: "person", teeth: "tooth", feet: "foot", mice: "mouse",
  better: "good", best: "good", worse: "bad", worst: "bad",
};

/** Every plausible base form of a word — irregular map, then suffix
 *  strips (with consonant doubling + silent-e variants). Returns a set
 *  so matching is intersection, never a single brittle guess. */
export function stemVariants(word) {
  const w = String(word ?? "").toLowerCase().replace(/[^a-z0-9']/g, "");
  const out = new Set([w]);
  if (IRREG[w]) out.add(IRREG[w]);
  if (w.endsWith("'s")) out.add(w.slice(0, -2));
  if (w.endsWith("ies") && w.length > 4) { out.add(w.slice(0, -3) + "y"); }
  if (w.endsWith("es") && w.length > 3) out.add(w.slice(0, -2));
  if (w.endsWith("s") && w.length > 3) out.add(w.slice(0, -1));
  if (w.endsWith("ing") && w.length > 5) {
    const b = w.slice(0, -3);
    out.add(b); out.add(b + "e");
    if (b.length > 1 && b.at(-1) === b.at(-2)) out.add(b.slice(0, -1));
  }
  if (w.endsWith("ed") && w.length > 4) {
    const b = w.slice(0, -2);
    out.add(b); out.add(b + "e");
    if (b.length > 1 && b.at(-1) === b.at(-2)) out.add(b.slice(0, -1));
  }
  return out;
}

export function tokenize(text) {
  return String(text ?? "").toLowerCase()
    .replace(/[?!.,;:"'’()—–-]+/g, " ")
    .split(/\s+/).filter(Boolean);
}

const pronounGroup = (w) =>
  Object.keys(PRONOUN_GROUPS).find((g) => PRONOUN_GROUPS[g].includes(w)) ?? null;

const intersects = (a, b) => [...a].some((x) => b.has(x));

/** Content words = tokens that are neither glue nor pronouns. */
export function contentStems(text) {
  return tokenize(text)
    .filter((t) => !GLUE.has(t) && !pronounGroup(t))
    .map((t) => ({ word: t, stems: stemVariants(t) }));
}

/**
 * Score one transform output against her taps.
 * @returns {{same: boolean, added: string[], dropped: string[],
 *            subject: string[], ok: boolean}}
 */
export function scoreCell(input, output) {
  const inToks = tokenize(input), outToks = tokenize(output);
  const same = inToks.join(" ") === outToks.join(" ")
    || String(input).trim().toLowerCase() === String(output).trim().toLowerCase();

  const inGroups = new Set(inToks.map(pronounGroup).filter(Boolean));
  const subject = [...new Set(outToks.map(pronounGroup).filter(Boolean))]
    .filter((g) => !inGroups.has(g))
    // bare "it"/"you" appearing only as object filler still counts —
    // a group she didn't tap is a voice she didn't choose
    ;

  const outStems = new Set(outToks.flatMap((t) => [...stemVariants(t)]));
  const inStems = new Set(inToks.flatMap((t) => [...stemVariants(t)]));

  const added = contentStems(output)
    .filter((c) => !intersects(c.stems, inStems))
    .map((c) => c.word);
  const dropped = contentStems(input)
    .filter((c) => !intersects(c.stems, outStems))
    .map((c) => c.word);

  return {
    same,
    added: [...new Set(added)],
    dropped: [...new Set(dropped)],
    subject,
    ok: same || (!added.length && !dropped.length && !subject.length),
  };
}
