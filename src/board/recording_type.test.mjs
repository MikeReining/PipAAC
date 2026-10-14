/**
 * 044 C4 - new desktop recordings are iPad-playable when the browser can
 * record MP4/AAC; webm stays the last resort (and is sniffed as webm).
 * Run: scripts/test.sh src/board/recording_type.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickRecordingType, sniffType } from "../../public/shared/mediatype.mjs";

const mr = (...ok) => ({ isTypeSupported: (t) => ok.includes(t) });

test("a browser that records MP4/AAC is asked for it", () => {
  assert.equal(pickRecordingType(mr("audio/mp4;codecs=mp4a.40.2", "audio/webm")), "audio/mp4;codecs=mp4a.40.2");
  assert.equal(pickRecordingType(mr("audio/mp4", "audio/webm;codecs=opus")), "audio/mp4");
});

test("webm-only browsers (older Chrome, Firefox) get the default as the last resort", () => {
  assert.equal(pickRecordingType(mr("audio/webm;codecs=opus", "audio/ogg")), undefined);
  assert.equal(pickRecordingType({}), undefined);
  assert.equal(pickRecordingType(undefined), undefined);
});

test("a Chrome webm recording is recognized as webm (the iPad shows its honest state)", () => {
  assert.equal(sniffType(Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0])), "audio/webm");
});
