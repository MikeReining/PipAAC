/**
 * 023/024 slice 3 Works Test — the transform buttons' bar state.
 *
 * The result replaces the bar as typed words; the trio is a
 * three-position switch; a question survives a tense change; ⏪/⏩ move
 * tense, and anything derived from her taps (✨ ❓ ▶) reads as present.
 * The provenance law: transforms read her saved taps, ▶ restores them
 * with no model, and any edit voids the snapshot.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyTransform, noteBarEdit, restoreBar, snapshotBar, transformSource,
  wordLemmaCandidates,
} from "../../public/shared/txbar.mjs";

const fresh = () => ({
  sentence: [{ kind: "sense", id: "s1", text: "i" }, { kind: "sense", id: "s2", text: "go" }, { kind: "sense", id: "s3", text: "park" }],
  st: { tense: "present", question: false },
});

test("past: bar becomes typed words, tense is past", () => {
  const { sentence, st } = fresh();
  applyTransform(sentence, "I went to the park.", "past", st);
  assert.deepEqual(sentence.map((i) => i.text), ["I", "went", "to", "the", "park."]);
  assert.ok(sentence.every((i) => i.kind === "typed"));
  assert.equal(st.tense, "past");
  assert.equal(st.question, false);
});

test("a tense change never removes the question", () => {
  const { sentence, st } = fresh();
  applyTransform(sentence, "Did he go to school?", "question", st);
  assert.equal(st.question, true);
  applyTransform(sentence, "Is he going to school?", "future", st);
  assert.equal(st.tense, "future");
  assert.equal(st.question, true); // still ends with ?
});

test("tense on a statement clears the question state it doesn't hold", () => {
  const { sentence, st } = fresh();
  applyTransform(sentence, "Did he go?", "question", st);
  applyTransform(sentence, "He went.", "past", st);
  assert.equal(st.question, false); // the bar holds a statement now
});

test("✨/❓ outputs derive from taps, so they read as present", () => {
  const { sentence, st } = fresh();
  applyTransform(sentence, "He went to school.", "past", st);
  applyTransform(sentence, "He went to the school.", "fix", st);
  assert.equal(st.tense, "present"); // fixed taps, not a tense chain
  applyTransform(sentence, "Did he go to the school?", "question", st);
  assert.equal(st.tense, "present");
  assert.equal(st.question, true);
});

test("present returns the bar and speaks present", () => {
  const { sentence, st } = fresh();
  applyTransform(sentence, "I'm not going to school.", "future", st);
  applyTransform(sentence, "I don't go to school.", "present", st);
  assert.equal(st.tense, "present");
});

/* The provenance law — her taps are the source, never model output. */

test("snapshot once: the first transform's input survives chains", () => {
  const { sentence, st } = fresh();
  snapshotBar(sentence, st); // ✨ lands
  applyTransform(sentence, "I want to go park.", "fix", st);
  snapshotBar(sentence, st); // second transform must NOT overwrite
  assert.deepEqual(st.preTransform.map((i) => i.text), ["i", "go", "park"]);
  assert.deepEqual(transformSource(sentence, st).map((i) => i.text),
    ["i", "go", "park"]); // ⏩ reads taps, not the model's words
});

test("restoreBar: ▶ puts her exact items back — ids, kinds, no model", () => {
  const { sentence, st } = fresh();
  snapshotBar(sentence, st);
  applyTransform(sentence, "I went to the park.", "past", st);
  assert.equal(sentence[0].kind, "typed");
  assert.equal(restoreBar(sentence, st), true);
  assert.deepEqual(sentence.map((i) => [i.kind, i.id, i.text]),
    [["sense", "s1", "i"], ["sense", "s2", "go"], ["sense", "s3", "park"]]);
  assert.equal(st.tense, "present");
  assert.equal(st.question, false);
  assert.equal(st.preTransform, null);
  // restore leaves a clean bar — a second ▶ is just a speak
  assert.equal(restoreBar(sentence, st), false);
});

test("noteBarEdit: any edit voids the snapshot and flags", () => {
  const { sentence, st } = fresh();
  snapshotBar(sentence, st);
  applyTransform(sentence, "I went to the park.", "past", st);
  sentence.push({ kind: "sense", id: "s4", text: "again" });
  noteBarEdit(st);
  assert.equal(st.preTransform, null);
  assert.equal(st.tense, "present");
  assert.equal(st.question, false);
  // transforms now read the edited bar, not the dead snapshot
  assert.equal(transformSource(sentence, st).at(-1).text, "again");
});

/* Display-only lemma candidates — the label table is still the arbiter;
 * these just give it the forms a transform will emit. */
test("lemma candidates cover past forms, inflections, irregulars", () => {
  assert.equal(wordLemmaCandidates("wanted").includes("want"), true); // loved -> love order
  assert.equal(wordLemmaCandidates("went")[1], "go");
  assert.equal(wordLemmaCandidates("coming").includes("come"), true);
  assert.equal(wordLemmaCandidates("stopped").includes("stop"), true);
  assert.equal(wordLemmaCandidates("babies").includes("baby"), true);
  assert.equal(wordLemmaCandidates("burger")[0], "burger"); // unchanged words try first
  assert.equal(wordLemmaCandidates("i").length, 1); // nothing spurious
});
