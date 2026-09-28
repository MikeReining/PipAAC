/**
 * 023 — the transform buttons' bar state.
 *
 * A successful model call replaces the bar's items with the returned
 * sentence (typed words — grammar packaging isn't a sense pick) and
 * records which shape the bar now holds: the tense trio is a
 * three-position switch and ❓ lights while the bar is a question
 * (§ 4.2: selected state lives in the sentence, not the button).
 *
 * - ❓ sets question; the tense buttons keep it if the result still
 *   ends with a question mark ("changing tense never removes the
 *   question"), ✨ is judged the same way.
 * - Tense buttons set tense; ✨ and ❓ never move it.
 * - Clearing the bar resets both — renderBar owns that (no items, no
 *   state to display).
 */
export function applyTransform(sentence, out, mode, barState) {
  sentence.length = 0;
  for (const w of String(out).split(/\s+/).filter(Boolean)) {
    sentence.push({ kind: "typed", id: null, text: w });
  }
  if (mode === "question") barState.question = true;
  else barState.question = /[?¿]\s*$/.test(out);
  if (mode === "past" || mode === "present" || mode === "future") {
    barState.tense = mode;
  }
}

/* Display-only lemma candidates for a model-supplied token, strongest
 * first. The caller validates each against the label table — a wrong
 * guess can only mean no art, never the wrong symbol. Past-tense labels
 * don't ship yet, so irregulars the transform will actually produce are
 * named here; the build-side lemmatizer (scripts/prediction/childes/
 * common.mjs: IRREG) is the source this mirrors. */
const IRREG_LEMMA = {
  went: "go", ate: "eat", took: "take", saw: "see", said: "say",
  had: "have", got: "get", made: "make", came: "come", gave: "give",
  ran: "run", fell: "fall", sat: "sit", broke: "break", did: "do",
  told: "tell", found: "find", felt: "feel", left: "leave", lost: "lose",
  slept: "sleep", kept: "keep", held: "hold", heard: "hear", won: "win",
  bit: "bite", hid: "hide", forgot: "forget", wore: "wear", woke: "wake",
  threw: "throw", drew: "draw", flew: "fly", grew: "grow", knew: "know",
  rode: "ride", sang: "sing", drank: "drink", swam: "swim", stole: "steal",
  tore: "tear", drove: "drive", wrote: "write", spoke: "speak",
  chose: "choose", bought: "buy", brought: "bring", thought: "think",
  taught: "teach", caught: "catch", sold: "sell", spent: "spend",
  cut: "cut", put: "put", hit: "hit", hurt: "hurt", shut: "shut",
};

/** Ordered surfaces to try against the label table: the token itself,
 *  its irregular lemma, then stripped endings (wanted→want,
 *  coming→come, babies→baby, stopped→stop). */
export function wordLemmaCandidates(token) {
  const t = String(token).toLowerCase();
  const out = [t];
  if (IRREG_LEMMA[t]) out.push(IRREG_LEMMA[t]);
  const push = (w) => { if (w && w !== t && !out.includes(w)) out.push(w); };
  if (t.endsWith("ies")) push(t.slice(0, -3) + "y");
  if (t.endsWith("ied")) push(t.slice(0, -3) + "y");
  for (const suf of ["ing", "ed"]) {
    if (t.endsWith(suf) && t.length > suf.length + 1) {
      const stem = t.slice(0, -suf.length);
      push(stem + "e"); // coming -> come, loved -> love
      push(stem);       // playing -> play, wanted -> want
      if (stem.at(-1) === stem.at(-2)) push(stem.slice(0, -1)); // stopped -> stop
    }
  }
  if (t.endsWith("es")) push(t.slice(0, -2)); // buses -> bus
  else if (t.endsWith("s") && t.length > 2) push(t.slice(0, -1));
  return out;
}
