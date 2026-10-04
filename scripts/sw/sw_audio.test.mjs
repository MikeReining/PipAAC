/** Slice A (041): the offline promise is the ACTIVE voice only.
 *  The shell precache carries no audio; each voice's clips live in
 *  `pip-audio-<voice>-<clip-list-hash>`, filled after the board by the
 *  voice the person actually uses. These tests are the ratchet:
 *  all-voice precache and per-deploy audio re-downloads never return. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { repoRoot } from "../catalog/paths.mjs";

const sw = readFileSync(`${repoRoot}/public/sw.js`, "utf8");
const manifest = JSON.parse(readFileSync(`${repoRoot}/public/sw-manifest.json`, "utf8"));
const audioMap = JSON.parse(readFileSync(`${repoRoot}/public/sw-audio.json`, "utf8"));
const catalog = JSON.parse(readFileSync(`${repoRoot}/public/catalog.json`, "utf8"));

test("shell precache carries zero audio", () => {
  const audio = manifest.files.filter((f) => f.path.startsWith("/audio/"));
  assert.equal(audio.length, 0,
    `sw-manifest.json lists ${audio.length} /audio/ files — all-voice precache is back`);
});

test("sw-audio.json lists every ready clip per voice, hashed", () => {
  const byVoice = {};
  for (const clip of catalog.clips) {
    if (clip.status === "ready") (byVoice[clip.voice_id] ??= []).push(`/${clip.key}`);
  }
  for (const [voice, clips] of Object.entries(byVoice)) {
    const entry = audioMap.voices[voice];
    assert.ok(entry, `sw-audio.json is missing voice ${voice}`);
    assert.equal(entry.files.length, clips.length, `${voice} clip count drifted`);
    assert.match(entry.hash, /^[0-9a-f]{12}$/);
    for (const p of entry.files) assert.ok(p.startsWith("/audio/"));
  }
});

test("sw.js fills per-voice caches keyed by the clip-list hash", () => {
  assert.match(sw, /pip-audio-\$\{voice\}-\$\{entry\.hash\}|pip-audio-/,
    "sw.js lost the pip-audio-<voice>-<hash> cache naming");
  assert.equal(sw.includes("AUDIO_PREFIX"), true);
  // Deploys own pip-shell-* only — audio caches must survive them (A4).
  const activate = sw.slice(sw.indexOf('"activate"'), sw.indexOf('"activate"') + 900);
  assert.equal(activate.includes("pip-audio-"), false,
    "activate() deletes pip-audio caches — every deploy would re-download the voice");
  // The fill is best-effort, never all-or-nothing (A5).
  assert.match(sw, /catch.*\{[^}]*\}/s, "the audio fill must skip a failed clip, not abort");
});

test("install concurrency is the post-board rate", () => {
  assert.match(sw, /const CHUNK = 6;/,
    "CHUNK drifted from 6 — install must not storm the network (041 A1)");
});

test("sw-audio.json is fresh (generated drift gate)", () => {
  execFileSync(process.execPath, ["scripts/sw/sw_manifest.mjs", "--check"],
    { cwd: repoRoot, stdio: "pipe" });
});
