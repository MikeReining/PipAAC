/**
 * 011 slice 4 Works Test — the relay (heavy: spawns `wrangler dev`).
 *
 * Two device clients against a real local relay. A creates the board and
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
  getBoardKey,
  getDeviceIdentity,
  memoryKeyStore,
  openOp,
  sealBlob,
  openBlob,
} from "../../public/shared/sync_crypto.mjs";
import { relayClient } from "../../public/shared/sync_client.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const PORT = 8877;
const BASE = `http://127.0.0.1:${PORT}`;
const repoRoot = join(import.meta.dirname, "../..");
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

const mkDevice = async () => {
  const store = memoryKeyStore();
  const identity = await getDeviceIdentity(store);
  const boardKey = await getBoardKey(store); // same key in both stores? no —
  return { store, identity, boardKey };
};

test("relay: sequence, fan-out, auth, catch-up, blobs", async () => {
  // Two devices. One board key — in the real flow pairing delivers it
  // (slice 5); here we hand B the same CryptoKey directly.
  const aStore = memoryKeyStore();
  const a = await getDeviceIdentity(aStore);
  const boardKey = await getBoardKey(aStore);
  const bStore = memoryKeyStore();
  const b = await getDeviceIdentity(bStore);
  await bStore.put("board_key", boardKey);

  const openDb = () => {
    const db = createDatabase(":memory:");
    importCatalog(db, catalog);
    return db;
  };

  // A creates the board (bootstrap registers its device).
  const board = await fetch(`${BASE}/boards`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ device_id: a.deviceId, pubkey: await exportPublicKey(a.verify) }),
  }).then((r) => r.json());
  assert.ok(board.board_id, "no board_id");

  const clientA = relayClient({ boardId: board.board_id, baseUrl: BASE, identity: a, boardKey });
  const clientB = relayClient({ boardId: board.board_id, baseUrl: BASE, identity: b, boardKey });

  // B is unknown until A allows it.
  await assert.rejects(clientB.fetchOps(0), /403/);
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
  const decrypted = await openOp(boardKey, received[0].ops[0].env);
  assert.equal(decrypted.op_id, opsA[0].op_id);
  assert.match(decrypted.args, /Cooper/); // readable only after board-key decrypt

  // An unsigned and an unknown-device request both get 403.
  assert.equal((await fetch(`${BASE}/boards/${board.board_id}/ops?after=0`)).status, 403);
  const stranger = relayClient({
    boardId: board.board_id, baseUrl: BASE,
    identity: await getDeviceIdentity(memoryKeyStore()), boardKey,
  });
  await assert.rejects(stranger.fetchOps(0), /403/);

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
  const blob = await sealBlob(boardKey, globalThis.crypto.getRandomValues(new Uint8Array(8192)));
  await clientA.putBlob(blob);
  const envBack = await clientB.getBlob(blob.sha);
  assert.deepEqual(await openBlob(boardKey, { sha: blob.sha, env: envBack }),
    await openBlob(boardKey, blob));
});
