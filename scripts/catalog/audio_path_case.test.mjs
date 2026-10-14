// Every audio path the app asks for must name a tracked file with the
// exact same case. macOS disks ignore case, so a `Goodbye/` folder
// answered `audio/goodbye/…` locally while Cloudflare and iPad storage
// returned nothing — four words were silent in production (2026-10-14).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = new URL("../../", import.meta.url).pathname;
const tracked = new Set(
  execFileSync("git", ["ls-files", "public/audio"], { cwd: root, encoding: "utf8" })
    .split("\n").filter(Boolean).map((p) => p.slice("public/".length)),
);
const audioKeys = (file) =>
  [...readFileSync(join(root, file), "utf8").matchAll(/"\/?(audio\/[^"]+\.mp3)"/g)].map((m) => m[1]);

for (const file of ["public/catalog.json", "public/sw-audio.json"]) {
  test(`${file}: every audio path is a tracked file, exact case`, () => {
    const keys = audioKeys(file);
    assert.ok(keys.length > 100, `expected audio paths in ${file}`);
    const missing = [...new Set(keys)].filter((k) => !tracked.has(k));
    assert.deepEqual(missing, []);
  });
}
