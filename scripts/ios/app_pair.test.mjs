/**
 * 044 C3 — the pairing facade's guards. The protocol itself is proven
 * end to end by scripts/ios/e2e_sync.sh (real relay, real second device);
 * these pin the two things that broke while building it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

const root = new URL("../../", import.meta.url).pathname;

test("app_pair takes crypto from the iOS host module, never the web's WebCrypto one", () => {
  const src = readFileSync(join(root, "scripts/ios/app_pair.mjs"), "utf8");
  const imports = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(imports.includes("./host/sync_crypto_host.mjs"));
  // scripts/ios modules are NOT import-swapped by build_core (only public/shared importers are):
  // a direct sync_crypto.mjs import would bundle crypto.subtle.generateKey, which JSC lacks.
  assert.ok(!imports.some((i) => /\/sync_crypto\.mjs$/.test(i)), "imports the web sync_crypto directly");
});

test("PIPCORE.pair exposes offer/join/cancel and the web's code helpers", () => {
  const ctx = vm.createContext({ __pipHost: { log() {}, emit() {} } });
  vm.runInContext(readFileSync(join(root, "apps/PipAAC/PipAAC/Core/pip-core.js"), "utf8"), ctx);
  const ok = vm.runInContext(`(() => {
    const p = PIPCORE.pair;
    return JSON.stringify([typeof p.offer, typeof p.join, typeof p.offerCancel, typeof p.joinCancel,
      p.cleanCode("ab-cd 12345xyz"), p.showCode("ABCD2345")]);
  })()`, ctx);
  assert.deepEqual(JSON.parse(ok),
    ["function", "function", "function", "function", "ABCD1234", "ABCD 2345"]);
});
