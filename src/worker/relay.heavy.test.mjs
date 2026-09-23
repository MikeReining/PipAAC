/**
 * 011 slice 4 Works Test — the relay (heavy: spawns `wrangler dev`).
 *
 * Two device clients against a real local relay. A creates the user and
 * allows B. A edits → B's socket receives the op within 2 s. A request
 * signed by an unknown key gets 403. B goes offline, A edits 20 times,
 * B reconnects and catches up. A sealed blob round-trips through R2.
 *
 * Run: scripts/test.sh src/worker/relay.heavy.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDatabase, importCatalog } from "../board/catalog.mjs";
import { createEntity, placeItem } from "../../public/shared/groups.mjs";
import { listOps } from "../../public/shared/ops.mjs";
import {
  exportPublicKey,
  getUserKey,
  getDeviceIdentity,
  memoryKeyStore,
  openOp,
  sealBlob,
  openBlob,
} from "../../public/shared/sync_crypto.mjs";
import { licenseFor } from "./license.mjs";
import { relayClient } from "../../public/shared/sync_client.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const PORT = 8877;
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

const lexicon = JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8"));
const catalog = buildCatalog(lexicon, parseCoordinateMapMarkdown(readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8")));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wrangler;

before(async () => {
  const stateDir = mkdtempSync(join(tmpdir(), "pip-relay-"));
  wrangler = spawn("npx", ["wrangler", "dev", "--port", String(PORT), "--ip", "127.0.0.1",
    "--persist-to", stateDir], { cwd: repoRoot, stdio: "ignore" });
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    const ok = await fetch(`${BASE}/health`).then((r) => r.ok).catch(() => false);
    if (ok) return;
  }
  throw new Error("wrangler dev did not come up");
});

after(() => { wrangler?.kill("SIGTERM"); });

test("relay: sequence, fan-out, auth, catch-up, blobs", async () => {
  // Two devices. One user key — in the real flow pairing delivers it
  // (slice 5); here we hand B the same CryptoKey directly.
  const aStore = memoryKeyStore();
  const a = await getDeviceIdentity(aStore);
  const userKey = await getUserKey(aStore);
  const bStore = memoryKeyStore();
  const b = await getDeviceIdentity(bStore);
  await bStore.put("user_key", userKey);

  const openDb = () => {
    const db = createDatabase(":memory:");
    importCatalog(db, catalog);
    return db;
  };

  // A creates the user (bootstrap registers its device).
  const user = await fetch(`${BASE}/users`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ device_id: a.deviceId, pubkey: await exportPublicKey(a.verify) }),
  }).then((r) => r.json());
  assert.ok(user.user_id, "no user_id");

  const clientA = relayClient({ userId: user.user_id, baseUrl: BASE, identity: a, userKey });
  await makeLifetime(clientA, user.user_id);
  const clientB = relayClient({ userId: user.user_id, baseUrl: BASE, identity: b, userKey });

  // B is unknown until A allows it.
  await assert.rejects(clientB.fetchOps(0), (e) => e.status === 403);
  await clientA.addDevice(b.deviceId, await exportPublicKey(b.verify));
  assert.equal((await clientB.fetchOps(0)).latest, 0);

  // B listens; A edits; the op arrives inside 2 s.
  const received = [];
  const ws = new WebSocket(await clientB.wsUrl());
  ws.onmessage = (ev) => received.push(JSON.parse(ev.data));
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  const dbA = openDb();
  createEntity(dbA, { name: "Cooper" });
  const opsA = listOps(dbA);
  const { ops: seqs } = await clientA.submit(opsA);
  assert.equal(seqs[0].relay_seq, 1);

  const deadline = Date.now() + 2000;
  while (Date.now() < deadline && !received.length) await sleep(50);
  assert.ok(received.length, "B did not receive the op within 2 s");
  const decrypted = await openOp(userKey, received[0].ops[0].env);
  assert.equal(decrypted.op_id, opsA[0].op_id);
  assert.match(decrypted.args, /Cooper/); // readable only after user-key decrypt

  // An unsigned and an unknown-device request both get 403.
  assert.equal((await fetch(`${BASE}/users/${user.user_id}/ops?after=0`)).status, 403);
  const stranger = relayClient({
    userId: user.user_id, baseUrl: BASE,
    identity: await getDeviceIdentity(memoryKeyStore()), userKey,
  });
  await assert.rejects(stranger.fetchOps(0), (e) => e.status === 403);

  // B goes offline; A edits 20 times; B catches up and matches.
  ws.close();
  await sleep(300);
  for (let i = 0; i < 20; i++) {
    const { id } = createEntity(dbA, { name: `E${i}` });
    placeItem(dbA, "grp_people", "entity", id);
  }
  await clientA.submit(listOps(dbA).slice(opsA.length));
  const catchup = await clientB.fetchOps(0);
  assert.equal(catchup.latest, 1 + 40); // 1 first op + 20×(create+place)
  assert.equal(catchup.ops.length, 41);
  const ids = new Set();
  for (const r of catchup.ops) ids.add((await clientB.openOp(r.env)).op_id);
  assert.equal(ids.size, listOps(dbA).length); // every local op confirmed

  // Blob round-trip: sealed bytes up, envelope back, opens identical.
  const blob = await sealBlob(userKey, globalThis.crypto.getRandomValues(new Uint8Array(8192)));
  await clientA.putBlob(blob);
  const envBack = await clientB.getBlob(blob.sha);
  assert.deepEqual(await openBlob(userKey, { sha: blob.sha, env: envBack }),
    await openBlob(userKey, blob));
});
