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
