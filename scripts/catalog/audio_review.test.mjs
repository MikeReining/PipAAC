import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  ACTIVE_THRESHOLD_DBFS,
  FRAME_MS,
  MIN_INTERNAL_SILENCE_MS,
  MIN_RENEWED_ACTIVITY_MS,
  REASON_ACTIVITY_AFTER_SILENCE,
  REASON_DECODE_FAILED,
  REASON_NO_ACTIVITY,
  REASON_NOT_SINGLE_LEXICAL_WORD,
  analyzePcm,
  auditGeneratedWordAudio,
  cliMain,
  decodePcmToMono16k,
  hasFfmpeg,
  isSingleLexicalWord,
} from "./audio_review.mjs";

const SR = 16000;

function tone(ms, amp = 0.3) {
  const n = Math.round((SR * ms) / 1000);
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i += 1) {
    pcm[i] = Math.round(Math.sin((2 * Math.PI * 440 * i) / SR) * amp * 32767);
  }
  return pcm;
}

function silence(ms) {
  return new Int16Array(Math.round((SR * ms) / 1000));
}

function concat(...arrays) {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Int16Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

function activeFrames(n) {
  return tone(n * FRAME_MS);
}

function silentFrames(n) {
  return silence(n * FRAME_MS);
}

function fakeDecode(pcm, sampleRate = SR) {
  return () => ({ pcm, sampleRate });
}

function tmpFile() {
  return join(mkdtempSync(join(tmpdir(), "audio-review-")), "sample.mp3");
}

test("classifies single lexical words, and rejects phrases, digits, punctuation", () => {
  assert.equal(isSingleLexicalWord("can't"), true);
  assert.equal(isSingleLexicalWord("mother-in-law"), true);
  assert.equal(isSingleLexicalWord("sniff"), true);
  assert.equal(isSingleLexicalWord("ice cream"), false);
  assert.equal(isSingleLexicalWord("3+4"), false);
});

test("speech -> 200ms silence -> 80ms tail returns activity_after_silence", () => {
  const pcm = concat(tone(500), silence(200), tone(80));
  const result = auditGeneratedWordAudio({
    filePath: "x.mp3",
    spokenText: "sniff",
    decode: fakeDecode(pcm),
  });
  assert.equal(result.outcome, "review");
  assert.deepEqual(result.reasons, [{ code: REASON_ACTIVITY_AFTER_SILENCE, atMs: 700 }]);
});

test("trailing silence after a single region does not trigger", () => {
  const result = auditGeneratedWordAudio({
    filePath: "x.mp3",
    spokenText: "puff",
    decode: fakeDecode(concat(tone(600), silence(300))),
  });
  assert.equal(result.outcome, "pass");
});

test("aligned 20ms frames prove the silence threshold: 7 silent frames pass, 8 review", () => {
  const seven = analyzePcm(concat(activeFrames(5), silentFrames(7), activeFrames(3)), { sampleRate: SR });
  assert.equal(seven.flag, null);

  const eight = analyzePcm(concat(activeFrames(5), silentFrames(8), activeFrames(3)), { sampleRate: SR });
  assert.equal(eight.flag?.code, REASON_ACTIVITY_AFTER_SILENCE);
});

test("a decoder failure returns review", () => {
  const throwing = auditGeneratedWordAudio({
    filePath: "x.mp3",
    spokenText: "cat",
    decode: () => {
      throw new Error("boom");
    },
  });
  assert.equal(throwing.outcome, "review");
  assert.equal(throwing.reasons[0].code, REASON_DECODE_FAILED);
});

test("cliMain: review exits 1, pass exits 0", () => {
  const reviewCode = cliMain(["audit", "--file", "x.mp3", "--spoken", "sniff", "--json"], {
    stdout: () => {},
    hasFfmpeg: () => true,
    audit: () => ({
      outcome: "review",
      reasons: [{ code: REASON_ACTIVITY_AFTER_SILENCE, atMs: 1151 }],
      measurements: { durationMs: 1840 },
    }),
  });
  assert.equal(reviewCode, 1);

  const passCode = cliMain(["audit", "--file", "x.mp3", "--spoken", "cat"], {
    stdout: () => {},
    hasFfmpeg: () => true,
    audit: () => ({ outcome: "pass", reasons: [], measurements: {} }),
  });
  assert.equal(passCode, 0);
});

test("decodePcmToMono16k round-trips PCM through real ffmpeg", (t) => {
  if (!hasFfmpeg()) {
    t.skip("ffmpeg is not installed");
    return;
  }
  const broken = concat(tone(500), silence(200), tone(80));
  const filePath = tmpFile();
  const buffer = Buffer.alloc(44 + broken.length * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + broken.length * 2, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SR, 24);
  buffer.writeUInt32LE(SR * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(broken.length * 2, 40);
  for (let i = 0; i < broken.length; i += 1) {
    buffer.writeInt16LE(broken[i], 44 + i * 2);
  }
  writeFileSync(filePath, buffer);
  const result = auditGeneratedWordAudio({
    filePath,
    spokenText: "sniff",
    decode: decodePcmToMono16k,
  });
  assert.equal(result.outcome, "review");
  assert.deepEqual(result.reasons, [{ code: REASON_ACTIVITY_AFTER_SILENCE, atMs: 700 }]);
});
