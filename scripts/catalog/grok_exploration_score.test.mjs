import assert from "node:assert/strict";
import { test } from "node:test";

import { scoreWhisperTranscript } from "./grok_exploration_score.mjs";

test("rejects swallowed can't as can", () => {
  const r = scoreWhisperTranscript("can't", "Can.", { whisperMustMatch: ["can't"] });
  assert.equal(r.ok, false);
});

test("accepts can't with apostrophe", () => {
  const r = scoreWhisperTranscript("can't", "Can't.", { whisperMustMatch: ["can't", "cant"] });
  assert.equal(r.ok, true);
});

test("rejects won't heard as one", () => {
  const r = scoreWhisperTranscript("won't", "One.", { whisperMustMatch: ["won't"] });
  assert.equal(r.ok, false);
});
