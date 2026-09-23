/**
 * 011 slice 6 Works Test — photos and recordings (heavy: spawns
 * `wrangler dev`).
 *
 * A photo added on A shows on B: the op carries `blob:<sha256>` and the
 * sealed bytes live in R2; B fetches lazily, opens under the right
 * epoch, verifies the hash. Corrupt one byte of the stored blob and B
 * rejects it — the tile falls back to name and color, never a broken
 * image.
 *
 * Run: scripts/test.sh src/worker/blob.heavy.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  exportDhPublic,
  exportPublicKey,
  getUserKey,
  getDeviceIdentity,
  memoryKeyStore,
  newUserKey,
  openBlob,
  putUserKey,
  sealBlob,
  unwrapUserKey,
  wrapUserKey,
} from "../../public/shared/sync_crypto.mjs";
import { licenseFor } from "./license.mjs";
import { relayClient } from "../../public/shared/sync_client.mjs";

const PORT = 8879;
const BASE = `http://127.0.0.1:${PORT}`;

const repoRoot = join(import.meta.dirname, "../..");

// 015 s6–7: a free user carries one device — these tests pair a
// second, so they activate Lifetime with a dev-minted license.
const licenseSecret = Object.fromEntries(
  readFileSync(join(repoRoot, ".dev.vars"), "utf8").split("\n")
    .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/))
    .filter(Boolean).map((m) => [m[1], m[2]])).PIP_LICENSE_SECRET;
const makeLifetime = async (client, userId) =>
  client.setEntitlement(await licenseFor(licenseSecret, userId));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wrangler;

before(async () => {
  const stateDir = mkdtempSync(join(tmpdir(), "pip-blob-"));
  wrangler = spawn("npx", ["wrangler", "dev", "--port", String(PORT), "--ip", "127.0.0.1",
    "--persist-to", stateDir], { cwd: repoRoot, stdio: "ignore" });
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    if (await fetch(`${BASE}/health`).then((r) => r.ok).catch(() => false)) return;
  }
  throw new Error("wrangler dev did not come up");
});

after(() => { wrangler?.kill("SIGTERM"); });

test("a photo on A shows on B; a corrupted blob is rejected", async () => {
  const aStore = memoryKeyStore();
  const a = await getDeviceIdentity(aStore);
  const userId = crypto.randomUUID(); // client-chosen (015 slice 2)
  const userKey = await getUserKey(aStore, userId);
  const bStore = memoryKeyStore();
  const b = await getDeviceIdentity(bStore);
  await putUserKey(bStore, userId, userKey, 1);

  const user = await fetch(`${BASE}/users`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      device_id: a.deviceId, pubkey: await exportPublicKey(a.verify),
      dh_pub: await exportDhPublic(a.dh.publicKey),
    }),
  }).then((r) => r.json());
  const clientA = relayClient({ userId: user.user_id, baseUrl: BASE, identity: a, userKey });
  await makeLifetime(clientA, user.user_id);
  await clientA.addDevice(b.deviceId, await exportPublicKey(b.verify),
    { dh_pub: await exportDhPublic(b.dh.publicKey) });
  const clientB = relayClient({ userId: user.user_id, baseUrl: BASE, identity: b, userKey });

  // A adds a photo — a real PNG header + body. The op carries blob:<sha>.
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...globalThis.crypto.getRandomValues(new Uint8Array(2000))]);
  const sealed = await sealBlob(userKey, png, 1);
  await clientA.putBlob(sealed);

  // B fetches lazily: env back, opens under epoch-1 key, bytes identical.
  const envB = await clientB.getBlob(sealed.sha);
  assert.equal(envB.e, 1);
  assert.deepEqual(await openBlob(userKey, { sha: sealed.sha, env: envB }), png);

  // The relay stored ciphertext, not the photo.
  const stored = await clientB.getBlob(sealed.sha);
  const ctBytes = Buffer.from(stored.ct.replaceAll("-", "+").replaceAll("_", "/"), "base64");
  assert.equal(ctBytes.indexOf(Buffer.from([0x89, 0x50, 0x4e, 0x47])), -1);

  // Corrupt one byte of the stored blob: PUT a tampered envelope at a
  // different sha (as if the object itself were damaged).
  const tampered = { ...sealed.env, ct: sealed.env.ct.slice(0, -4) + "AAAA" };
  await clientA.putBlob({ sha: "ff".repeat(32), env: tampered });
  const bad = await clientB.getBlob("ff".repeat(32));
  await assert.rejects(openBlob(userKey, { sha: "ff".repeat(32), env: bad }));
  // …and a hash forged to match still fails — GCM authenticates the ct.
  await assert.rejects(openBlob(userKey, { sha: tampered.iv, env: bad }));

  // Unknown blob → 404.
  await assert.rejects(clientB.getBlob("aa".repeat(32)), /404/);

  // After rotation B still opens epoch-1 blobs, and new blobs seal under
  // the new epoch.
  const key2 = await newUserKey();
  await clientA.rotateKeys(2, {
    [a.deviceId]: await wrapUserKey(key2, await exportDhPublic(a.dh.publicKey)),
    [b.deviceId]: await wrapUserKey(key2, await exportDhPublic(b.dh.publicKey)),
  });
  const self = await clientB.selfKey();
  const bKey2 = await unwrapUserKey(b.dh.privateKey, JSON.parse(self.wrapped_key));
  assert.deepEqual(await openBlob(userKey, { sha: sealed.sha, env: envB }), png);
  const sealed2 = await sealBlob(bKey2, png, 2);
  assert.equal(sealed2.env.e, 2);
  await clientB.putBlob(sealed2);
  const back2 = await clientB.getBlob(sealed2.sha);
  assert.deepEqual(await openBlob(bKey2, { sha: sealed2.sha, env: back2 }), png);
  await assert.rejects(openBlob(userKey, { sha: sealed2.sha, env: back2 })); // old key can't
});
