/**
 * 023/024 slice 3 Works Test — the transform buttons' bar state.
 *
 * The result replaces the bar as typed words; the trio is a
 * three-position switch; a question survives a tense change; ✨ never
 * moves tense; ❓ never moves tense.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyTransform } from "../../public/shared/txbar.mjs";

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

test("fix never moves tense; question never moves tense", () => {
  const { sentence, st } = fresh();
  applyTransform(sentence, "He went to school.", "past", st);
  applyTransform(sentence, "He went to the school.", "fix", st);
  assert.equal(st.tense, "past");
  applyTransform(sentence, "Did he go to the school?", "question", st);
  assert.equal(st.tense, "past");
  assert.equal(st.question, true);
});

test("present returns the bar and speaks present", () => {
  const { sentence, st } = fresh();
  applyTransform(sentence, "I'm not going to school.", "future", st);
  applyTransform(sentence, "I don't go to school.", "present", st);
  assert.equal(st.tense, "present");
});
