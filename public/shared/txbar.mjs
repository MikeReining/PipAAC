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
 * - ⏪/⏩ set tense; ✨ reads untensed taps so its output is present;
 *   ❓ keeps whatever tense the bar shows — it re-wraps that sentence.
 * - Clearing the bar resets both — renderBar owns that (no items, no
 *   state to display).
 *
 * Provenance (the play-button law): the first transform snapshots her
 * taps into barState.preTransform; every later button reads THAT copy,
 * never the last model output, and ▶ puts it back with no model call.
 * Any edit to the bar voids the snapshot — noteBarEdit — because the
 * bar then holds her words again by definition.
 */
export function applyTransform(sentence, out, mode, barState) {
  sentence.length = 0;
  for (const w of String(out).split(/\s+/).filter(Boolean)) {
    sentence.push({ kind: "typed", id: null, text: w });
  }
  if (mode === "question") barState.question = true;
  else barState.question = /[?¿]\s*$/.test(out);
  if (mode === "past" || mode === "future") barState.tense = mode;
  else if (mode !== "question") barState.tense = "present";
  // ❓ keeps whatever tense the bar shows — it re-wraps that sentence.
}

/** Snapshot her taps the moment the first transform lands — once, and
 *  never overwritten by a second transform. */
export function snapshotBar(sentence, barState) {
  if (!barState.preTransform) {
    barState.preTransform = sentence.map((it) => ({ ...it }));
  }
}

/** What a transform reads: her taps while a snapshot lives, the bar
 *  otherwise. */
export function transformSource(sentence, barState) {
  return barState.preTransform ?? sentence;
}

/** ▶ puts her words back exactly — no model, works offline. Only on a
 *  past/future bar: after ✨ or ❓ the bar is already present, so ▶
 *  just speaks what's shown. Returns true when a restore happened. */
export function restoreBar(sentence, barState) {
  if (!barState.preTransform || barState.tense === "present") return false;
  sentence.splice(
    0, sentence.length, ...barState.preTransform.map((it) => ({ ...it })),
  );
  barState.preTransform = null;
  barState.tense = "present";
  barState.question = false;
  return true;
}

/** Any edit to the bar (tap, typed word, backspace, clear) voids the
 *  snapshot and the transform flags — the bar holds her words again. */
export function noteBarEdit(barState) {
  barState.preTransform = null;
  barState.tense = "present";
  barState.question = false;
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
