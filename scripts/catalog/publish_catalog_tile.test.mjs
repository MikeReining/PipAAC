import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";

import { buildClipRecord, mergeGeneratedAudioFile } from "./publish_catalog_tile.mjs";

test("buildClipRecord uses content-addressed key", () => {
  const dir = mkdtempSync(join(tmpdir(), "pip-tile-pub-"));
  const mp3 = join(dir, "x.mp3");
  writeFileSync(mp3, "fake-mp3-bytes");
  const clip = buildClipRecord("chips", mp3, "WWMMC6k9tdar0BthUenK");
  assert.match(clip.key, /^audio\/chips\/[a-f0-9]{12}\.mp3$/);
  assert.equal(clip.spokenText, "chips");
  assert.equal(clip.source, "elevenlabs");
});

test("mergeGeneratedAudioFile upserts by slot", () => {
  const dir = mkdtempSync(join(tmpdir(), "pip-gen-audio-"));
  const path = join(dir, "generated_audio.json");
  writeFileSync(
    path,
    JSON.stringify({
      schemaVersion: 1,
      entries: [{ slot: 1, spokenText: "a", clip: { key: "audio/a/old.mp3" } }],
    }),
  );
  const clip = { key: "audio/b/new.mp3", sha256: "abc", source: "elevenlabs", voice: "v", spokenText: "b" };
  mergeGeneratedAudioFile(path, 2, "b", clip);
  const doc = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(doc.entries.length, 2);
  assert.equal(doc.entries.find((e) => e.slot === 2).clip.key, "audio/b/new.mp3");
});
