import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseLaunchLexiconMarkdown } from "./extract_launch_lexicon.mjs";
import { clipPayloadFromWbb, summarizeAudioResolution } from "./wbb_audio.mjs";
import { localPathForAudioKey, r2GetArgs } from "./storage.mjs";
import { repoRoot } from "./paths.mjs";

test("parseLaunchLexiconMarkdown extracts 656 tier 1+2 words", () => {
  const raw = readFileSync(join(repoRoot, "docs/product/Initial_Vocabulary_600.md"), "utf8");
  const parsed = parseLaunchLexiconMarkdown(raw);
  assert.equal(parsed.entries.length, 656);
  assert.equal(parsed.entries[0].spokenText, "I");
  assert.equal(parsed.entries[0].tier, 1);
  const tier1 = parsed.entries.filter((e) => e.tier === 1);
  assert.equal(tier1.length, 83);
});

test("clipPayloadFromWbb maps manifest fields", () => {
  const payload = clipPayloadFromWbb({
    id: "aud_abc",
    key: "audio/dog/deadbeeff00d.mp3",
    verifiedSha256: "deadbeeff00ddeadbeeff00ddeadbeeff00ddeadbeeff00ddeadbeeff00d",
    source: "bitsboard-recorded",
    voice: "recorded",
    spokenText: "dog",
    senseId: "dog",
  });
  assert.deepEqual(payload, {
    key: "audio/dog/deadbeeff00d.mp3",
    sha256: "deadbeeff00ddeadbeeff00ddeadbeeff00ddeadbeeff00ddeadbeeff00d",
    source: "bitsboard-recorded",
    voice: "recorded",
    wbbAudioId: "aud_abc",
    spokenText: "dog",
  });
});

test("summarizeAudioResolution counts hits and misses", () => {
  const summary = summarizeAudioResolution([
    { status: "hit" },
    { status: "hit" },
    { status: "miss" },
  ]);
  assert.deepEqual(summary, { total: 3, hits: 2, misses: 1 });
});

test("localPathForAudioKey mirrors R2 layout", () => {
  const path = localPathForAudioKey("/cache", "audio/cat/abc123def456.mp3");
  assert.equal(path, "/cache/audio/cat/abc123def456.mp3");
});

test("r2GetArgs targets workbookbench-catalog", () => {
  assert.deepEqual(r2GetArgs("audio/x/y.mp3", "/tmp/y.mp3"), [
    "r2",
    "object",
    "get",
    "workbookbench-catalog/audio/x/y.mp3",
    "--file",
    "/tmp/y.mp3",
    "--remote",
  ]);
});
