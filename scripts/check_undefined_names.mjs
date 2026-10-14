#!/usr/bin/env node
/**
 * Gate: every name the web app uses is imported, declared, or a browser
 * global. 2026-10-14: devices-ui.js called pollPair without importing it;
 * node tests drove the helper directly, so pairing broke in production.
 * Reads only TS2304/TS2552 ("cannot find name") from tsc over public/.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// Real globals TypeScript's DOM lib doesn't declare, per file.
const ALLOWED = [
  ["public/board/recovery-ui.js", "BarcodeDetector"], // Shape Detection API, feature-tested
  ["public/sw.js", "clients"], // ServiceWorkerGlobalScope
];
const r = spawnSync(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "-p", join(root, "tsconfig.undef.json")],
  { cwd: root, encoding: "utf8", maxBuffer: 64 << 20 });
const bad = r.stdout.split("\n")
  .map((l) => /^(.+?)\(\d+,\d+\): error TS(?:2304|2552): Cannot find name '([^']+)'/.exec(l))
  .filter(Boolean)
  .filter(([, file, name]) => !ALLOWED.some(([f, n]) => f === file && n === name))
  .map(([line]) => line);
if (bad.length) {
  console.error(`undefined names (missing import?):\n  ${bad.join("\n  ")}`);
  process.exit(1);
}
console.log("undefined names: none");
