import assert from "node:assert/strict";
import { test } from "node:test";

import { FRAME_MS } from "./audio_review.mjs";
import { findDetachedBurstCutSample, resolveBackupEndCutSample, rmsFrames } from "./audio_stop_burst.mjs";

const SR = 16000;

function tone(ms, amp = 0.3, freq = 440) {
  const n = Math.round((SR * ms) / 1000);
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i += 1) {
    pcm[i] = Math.round(Math.sin((2 * Math.PI * freq * i) / SR) * amp * 32767);
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

test("findDetachedBurstCutSample keeps full length when there is no post-gap burst", () => {
  const pcm = concat(tone(400), silence(80));
  assert.equal(findDetachedBurstCutSample(pcm, SR), pcm.length);
});

test("findDetachedBurstCutSample cuts before a short burst after >=25ms quiet", () => {
  const word = tone(500, 0.35);
  const gap = silence(40);
  const burst = tone(30, 0.2, 200);
  const pcm = concat(word, gap, burst);
  const cut = findDetachedBurstCutSample(pcm, SR);
  assert.ok(cut < pcm.length, "should detect burst");
  assert.ok(cut <= word.length + gap.length + 100, "cut should land near burst start");
});

test("resolveBackupEndCutSample removes long ElevenLabs tail", () => {
  const word = tone(420, 0.35);
  const tail = silence(2500);
  const spike = tone(20, 0.25, 200);
  const pcm = concat(word, tail, spike);
  const resolved = resolveBackupEndCutSample(pcm, SR);
  assert.equal(resolved.mode, "trailing_tail");
  assert.ok(resolved.cutSample < pcm.length * 0.3);
  assert.ok(resolved.trailingMs >= 350);
});

test("resolveBackupEndCutSample leaves short takes alone", () => {
  const pcm = concat(tone(700, 0.35), silence(30));
  const resolved = resolveBackupEndCutSample(pcm, SR);
  assert.equal(resolved.mode, "none");
  assert.equal(resolved.cutSample, pcm.length);
});

test("rmsFrames matches hop sizing", () => {
  const pcm = tone(100);
  const { hop, frames } = rmsFrames(pcm, SR, 0.005);
  assert.equal(hop, Math.round(SR * 0.005));
  assert.ok(frames.length > 0);
  assert.ok(FRAME_MS === 20);
});
