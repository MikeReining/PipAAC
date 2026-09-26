import assert from "node:assert/strict";
import { test } from "node:test";

import { scoreTake, scoreWhisperTranscript } from "./grok_exploration_score.mjs";

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

test("go period echo loses to the plain take", () => {
  const recipe = { whisperMustMatch: ["go"] };
  const plain = scoreTake({
    word: "go",
    recipe,
    filePath: "data/samples/batch-07-core/takes/go_plain.mp3",
    whisperText: "go",
    spokenForGate: "go",
  });
  const period = scoreTake({
    word: "go",
    recipe,
    filePath: "data/samples/batch-07-core/takes/go_period.mp3",
    whisperText: "go",
    spokenForGate: "go",
  });
  assert.equal(period.notes.includes("echo_return"), true);
  assert.equal(plain.notes.includes("echo_return"), false);
  assert.ok(plain.score > period.score);
});

test("minute plain residue loses to the period take", () => {
  const recipe = { whisperMustMatch: ["minute"], durationMs: [600, 1400] };
  const plain = scoreTake({
    word: "minute",
    recipe,
    filePath: "data/samples/batch-05-careful/takes/minute_plain.mp3",
    whisperText: "minute",
    spokenForGate: "minute",
  });
  const period = scoreTake({
    word: "minute",
    recipe,
    filePath: "data/samples/batch-05-careful/takes/minute_period.mp3",
    whisperText: "minute",
    spokenForGate: "minute",
  });
  assert.equal(plain.notes.includes("residue_shelf"), true);
  assert.equal(period.notes.includes("residue_shelf"), false);
  assert.ok(period.score > plain.score);
});
