#!/usr/bin/env node
/**
 * 036 § A — generate the service-worker precache manifest.
 *
 *   node scripts/sw/sw_manifest.mjs           # write outputs
 *   node scripts/sw/sw_manifest.mjs --check   # drift gate (check:fast)
 *
 * Outputs:
 *   public/sw-manifest.json — {buildId, files:[{path, bytes, sha256}]},
 *     the URL list public/sw.js precaches at install.
 *   public/sw-build.js     — `self.SW_VERSION` (the human version) and
 *     `self.SW_BUILD` (`<version>-<content hash>`), importScripts'd by
 *     sw.js so each installed SW instance knows which versioned cache
 *     it owns (a manifest bump alone triggers the browser's SW update
 *     check, since importScripts resources are byte-compared).
 *
 * Everything under public/ is classified deliberately: a file that
 * lands outside PRECACHE_FILES / PRECACHE_DIRS / EXCLUDE fails the build
 * — a silently-unprecached boot dependency is exactly the lie this gate
 * exists to catch. `VERSION` is the founder-facing number (2026-10-05:
 * "what version are you on?" must be answerable). Bump it in the slice
 * that ships the change:
 *   patch (1.0.0 → 1.0.1) — fixes and small changes
 *   minor (1.0.x → 1.1.0) — a shipped feature or slice
 *   major (1.x → 2.0.0)   — founder call only
 * The content hash still rides along in SW_BUILD, so identical
 * VERSIONs never collide and support can ask for the exact build.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { repoRoot } from "../catalog/paths.mjs";

const PUBLIC = join(repoRoot, "public");
const VERSION = "1.1.0";

const PRECACHE_FILES = [
  "index.html",
  "board.js",
  "db.js",
  "catalog.json",
  "fresh_db.sqlite",
  "offline.html",
  "form_answers.en.json",
  "suggest_answers.en.json",
  "feeling_voice.json",
  "help.en.json",
  "manifest.webmanifest",
];
const PRECACHE_DIRS = [
  "board",
  "brand",
  "fonts",
  "icons",
  "shared",
  "symbols",
  "vendor",
];
/** 041 Slice A: audio is deliberately out of the shell precache. Each
 *  voice's clips fill their own `pip-audio-<voice>-<hash>` cache after
 *  the board appears — sw-audio.json below is the map. */
const EXCLUDE_DIRS = new Set([
  "audio",
]);
/** Named exclusions — SW machinery. */
const EXCLUDE_FILES = new Set([
  "_headers",
  "sw.js",
  "sw-build.js",
  "sw-manifest.json",
  "sw-audio.json",
]);

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

const walk = (dir, out) => {
  for (const name of readdirSync(join(PUBLIC, dir)).sort()) {
    if (name.startsWith(".")) continue;
    const rel = join(dir, name);
    const stat = statSync(join(PUBLIC, rel));
    if (stat.isDirectory()) walk(rel, out);
    else out.push(rel);
  }
};

const files = [];   // { path: "/x", bytes, sha256 }
const push = (rel, buf) =>
  files.push({ path: `/${rel.split("/").join("/")}`, bytes: buf.length, sha256: sha256(buf) });

const failures = [];
for (const entry of readdirSync(PUBLIC).sort()) {
  if (entry.startsWith(".")) continue;
  const stat = statSync(join(PUBLIC, entry));
  if (stat.isDirectory()) {
    if (!PRECACHE_DIRS.includes(entry)) {
      if (!EXCLUDE_DIRS.has(entry)) {
        failures.push(`unclassified public/${entry}/ — add to PRECACHE_DIRS or name its exclusions`);
      }
      continue;
    }
    const under = [];
    walk(entry, under);
    for (const rel of under.sort()) {
      push(rel, readFileSync(join(PUBLIC, rel)));
    }
  } else if (PRECACHE_FILES.includes(entry)) {
    push(entry, readFileSync(join(PUBLIC, entry)));
  } else if (EXCLUDE_FILES.has(entry) || entry.endsWith(".html")) {
    continue; // preview/review/lab pages are dev tooling, not shell
  } else {
    failures.push(`unclassified public/${entry} — precache it or exclude it deliberately`);
  }
}

files.sort((a, b) => a.path.localeCompare(b.path));

/* Per-voice audio map for the background fill (041 A2/A4). The shell
 * never carries clips; the SW reads this file when the page announces
 * the active voice, then fills `pip-audio-<voice>-<hash>`. The hash is
 * the voice's clip-list identity — a voice whose clips changed gets a
 * new cache, untouched voices keep theirs. */
const catalog = JSON.parse(readFileSync(join(PUBLIC, "catalog.json"), "utf8"));
const audioVoices = {};
for (const clip of catalog.clips) {
  if (clip.status !== "ready") continue;
  (audioVoices[clip.voice_id] ??= []).push({ path: `/${clip.key}`, sha256: clip.sha256 });
}
const swAudio = { voices: {} };
for (const [voice, clips] of Object.entries(audioVoices)) {
  clips.sort((a, b) => a.path.localeCompare(b.path));
  const hash = sha256(Buffer.from(
    clips.map((c) => `${c.sha256} ${c.path}`).join("\n"))).slice(0, 12);
  swAudio.voices[voice] = { hash, files: clips.map((c) => c.path) };
}
// Compact — the map is SW cargo, not a human-reviewed document.
const swAudioJson = JSON.stringify(swAudio) + "\n";

const buildId = `${VERSION}-${sha256(
  Buffer.from(files.map((f) => `${f.sha256} ${f.path}`).join("\n")),
).slice(0, 12)}`;
const manifest = JSON.stringify({ buildId, files }, null, 2) + "\n";
const swBuild = `// Generated by scripts/sw/sw_manifest.mjs — do not edit.\n`
  + `self.SW_VERSION = "${VERSION}";\nself.SW_BUILD = "${buildId}";\n`;

if (failures.length) {
  for (const f of failures) console.error(`sw-manifest: ${f}`);
  process.exit(1);
}

const readOr = (name) => {
  try { return readFileSync(join(PUBLIC, name), "utf8"); } catch { return null; }
};
const drift = [
  ["sw-manifest.json", manifest],
  ["sw-build.js", swBuild],
  ["sw-audio.json", swAudioJson],
].filter(([name, want]) => readOr(name) !== want).map(([name]) => name);

const stats = `${files.length} files, ${(files.reduce((s, f) => s + f.bytes, 0) / 1048576).toFixed(1)} MB, build ${buildId}`;
if (process.argv.includes("--check")) {
  if (drift.length) {
    for (const name of drift) console.error(`sw-manifest: stale ${name} — run scripts/sw/sw_manifest.mjs`);
    process.exit(1);
  }
  console.log(`sw-manifest OK — ${stats}`);
} else {
  writeFileSync(join(PUBLIC, "sw-manifest.json"), manifest, "utf8");
  writeFileSync(join(PUBLIC, "sw-build.js"), swBuild, "utf8");
  writeFileSync(join(PUBLIC, "sw-audio.json"), swAudioJson, "utf8");
  console.log(`sw-manifest: ${stats}`);
}
