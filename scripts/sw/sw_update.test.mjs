/** 2026-10-05 — the stuck "downloading" line. An iPad sat on "newer
 *  version … is downloading" for minutes on gigabit internet: the label
 *  was inferred (`mine ≠ latest`), nothing had triggered the install,
 *  the install itself was a ~900-fetch storm iOS could suspend
 *  mid-flight, and one hung fetch had no timeout. These are the
 *  ratchets:
 *    1. the page triggers registration.update() when a diff is real —
 *       "downloading" is a state the registration reports, never a
 *       guess from comparing build ids,
 *    2. installs reuse unchanged files from the previous shell cache
 *       (manifest sentinel) — a diff install lands inside iOS's
 *       worker-suspend window,
 *    3. every precache fetch has a timeout — one stalled request can't
 *       wedge install forever,
 *    4. the worker reports progress (pip-shell-progress) and its build
 *       answer carries SW_VERSION so Settings can show "1.1.0". */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { repoRoot } from "../catalog/paths.mjs";

const sw = readFileSync(`${repoRoot}/public/sw.js`, "utf8");
const version = readFileSync(`${repoRoot}/public/board/version.js`, "utf8");
const swBuild = readFileSync(`${repoRoot}/public/sw-build.js`, "utf8");
const manifest = JSON.parse(readFileSync(`${repoRoot}/public/sw-manifest.json`, "utf8"));

test("sw-build carries a human semver and a content-hash build id", () => {
  const v = /SW_VERSION\s*=\s*"([^"]+)"/.exec(swBuild)?.[1];
  assert.match(v ?? "", /^\d+\.\d+\.\d+$/, "SW_VERSION must be semver");
  const b = /SW_BUILD\s*=\s*"([^"]+)"/.exec(swBuild)?.[1];
  assert.ok(b?.startsWith(`${v}-`), "SW_BUILD must be <version>-<hash>");
  assert.equal(manifest.buildId, b, "manifest buildId and sw-build.js diverged");
});

test("every precache fetch carries a timeout", () => {
  const put = sw.slice(sw.indexOf("async function precachePut"));
  assert.ok(/AbortController|AbortSignal/.test(put),
    "precachePut lost its abort — one stalled fetch wedges install");
  assert.ok(put.includes("signal:"), "precachePut fetch ignores the abort signal");
});

test("install reuses unchanged files from the previous shell cache", () => {
  const install = sw.slice(sw.indexOf('addEventListener("install"'),
    sw.indexOf('addEventListener("activate"'));
  assert.ok(install.includes("SHELL_META"),
    "install no longer reads the old cache's manifest sentinel — every "
    + "deploy re-fetches ~900 files, outside iOS's worker-suspend window");
  assert.ok(/cache\.put\(f\.path, hit\)/.test(install),
    "matching files must copy cache-to-cache, not re-download");
  assert.ok(/cache\.put\(SHELL_META/.test(install),
    "the new shell must write its own sentinel for the next update");
});

test("the installing worker reports real progress to pages", () => {
  assert.ok(sw.includes('"pip-shell-progress"'),
    "no progress broadcast — Settings can only guess at 'downloading'");
  assert.ok(sw.includes("includeUncontrolled"),
    "progress must reach the uncontrolled first-visit page too");
});

test("the worker's build answer carries the human version", () => {
  assert.ok(/pip-build.*postMessage\(\s*\{[^}]*version/s.test(sw),
    "pip-build must answer {build, version} for the Settings line");
});

test("version.js observes real SW state and can trigger the update", () => {
  assert.ok(version.includes(".update()"),
    "nothing triggers an update — 'downloading' would be a lie again");
  assert.ok(version.includes("installing") && version.includes("updatefound"),
    "the downloading state must come from the registration's worker");
  assert.ok(version.includes("redundant"),
    "a failed install must surface — otherwise 'downloading' hangs forever");
  assert.ok(version.includes("pip-shell-progress"),
    "the progress bar must be fed by the worker, not invented");
});
