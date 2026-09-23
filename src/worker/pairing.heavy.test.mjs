/**
 * 011 slice 5 Works Test — pairing, linked devices, revoke (heavy:
 * spawns `wrangler dev`).
 *
 * The real flow: the new device posts its public keys under an 8-char
 * code and polls; the linked device reads them, taps Allow (registers
 * the device + writes the wrapped-key grant); the new device unwraps the
 * board key and syncs. Before Allow it reads nothing. After Remove its
 * next write is rejected and post-rotation ops are sealed under a key it
 * never received.
 *
 * Run: scripts/test.sh src/worker/pairing.heavy.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDatabase, importCatalog } from "../board/catalog.mjs";
import { createEntity } from "../../public/shared/groups.mjs";
import { listOps } from "../../public/shared/ops.mjs";
import {
  exportDhPublic,
  exportPublicKey,
  getBoardKey,
  getDeviceIdentity,
  memoryKeyStore,
  newBoardKey,
  openOp,
  putBoardKey,
  unwrapBoardKey,
  wrapBoardKey,
} from "../../public/shared/sync_crypto.mjs";
import { pairClient, relayClient } from "../../public/shared/sync_client.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const PORT = 8878;
const BASE = `http://127.0.0.1:${PORT}`;
const repoRoot = join(import.meta.dirname, "../..");
const lexicon = JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8"));
const catalog = buildCatalog(lexicon, parseCoordinateMapMarkdown(readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8")));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wrangler;

before(async () => {
  const stateDir = mkdtempSync(join(tmpdir(), "pip-pair-"));
  wrangler = spawn("npx", ["wrangler", "dev", "--port", String(PORT), "--ip", "127.0.0.1",
    "--persist-to", stateDir], { cwd: repoRoot, stdio: "ignore" });
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    if (await fetch(`${BASE}/health`).then((r) => r.ok).catch(() => false)) return;
  }
  throw new Error("wrangler dev did not come up");
});

after(() => { wrangler?.kill("SIGTERM"); });

test("pair through the real flow; revoke locks out and rotates", async () => {
  // A — the linked device, board creator.
  const aStore = memoryKeyStore();
  const a = await getDeviceIdentity(aStore);
  const boardKey = await getBoardKey(aStore);
  // B — the new device. It does NOT have the board key.
  const bStore = memoryKeyStore();
  const b = await getDeviceIdentity(bStore);

  const dbA = createDatabase(":memory:");
  importCatalog(dbA, catalog);

  // A creates the board (with its dh pub so later rotations can wrap to it).
  const board = await fetch(`${BASE}/boards`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      device_id: a.deviceId,
      pubkey: await exportPublicKey(a.verify),
      dh_pub: await exportDhPublic(a.dh.publicKey),
    }),
  }).then((r) => r.json());
  const clientA = relayClient({ boardId: board.board_id, baseUrl: BASE, identity: a, boardKey });
  const lobby = pairClient(BASE);

  // B shows a code (the QR payload is these fields + the code).
  const { pair } = await lobby.request(b.deviceId,
    await exportPublicKey(b.verify), await exportDhPublic(b.dh.publicKey));
  assert.match(pair, /^[A-Z0-9]{8}$/);

  // Before Allow: B reads nothing on the board.
  const blindB = relayClient({ boardId: board.board_id, baseUrl: BASE, identity: b, boardKey });
  await assert.rejects(blindB.fetchOps(0), /403/);
  assert.equal((await lobby.status(pair)).status, "pending");

  // A types the code → sees B's keys → Allow: register B on the board
  // and write the wrapped-key grant.
  const req = await lobby.status(pair);
  assert.equal(req.device_id, b.deviceId);
  const wrapped = await wrapBoardKey(boardKey, req.dh_pub);
  await clientA.addDevice(b.deviceId, req.sig_pub, { dh_pub: req.dh_pub });
  await lobby.grant(pair, { board_id: board.board_id, by_device: a.deviceId, ...wrapped });

  // B polls → granted → unwraps → now it can read and write.
  const st = await lobby.status(pair);
  assert.equal(st.status, "granted");
  const bKey = await unwrapBoardKey(b.dh.privateKey, st.grant);
  await putBoardKey(bStore, bKey, 1);
  const clientB = relayClient({ boardId: board.board_id, baseUrl: BASE, identity: b, boardKey: bKey });
  assert.equal((await clientB.fetchOps(0)).latest, 0);

  // Syncs both ways.
  createEntity(dbA, { name: "Cooper" });
  await clientA.submit(listOps(dbA));
  const seen = await clientB.fetchOps(0);
  assert.equal((await openOp(bKey, seen.ops[0].env)).op_id, listOps(dbA)[0].op_id);
  const dbB = createDatabase(":memory:");
  importCatalog(dbB, catalog);
  createEntity(dbB, { name: "Bee toy" });
  await clientB.submit(listOps(dbB));
  const seenA = await clientA.fetchOps(0);
  assert.equal(seenA.ops.length, 2);

  // Remove B → its next write and read are rejected.
  await clientA.removeDevice(b.deviceId);
  await assert.rejects(clientB.fetchOps(0), /403/);
  createEntity(dbB, { name: "sneaky" });
  await assert.rejects(clientB.submit(listOps(dbB).slice(1)), /403/);

  // Rotation: a new board key, wrapped to each remaining device (A only).
  const key2 = await newBoardKey();
  await clientA.rotateKeys(2, {
    [a.deviceId]: await wrapBoardKey(key2, await exportDhPublic(a.dh.publicKey)),
  });
  const self = await clientA.selfKey();
  assert.equal(self.current_epoch, 2);
  const aKey2 = await unwrapBoardKey(a.dh.privateKey, JSON.parse(self.wrapped_key));
  await putBoardKey(aStore, aKey2, 2);

  // A's post-removal op is sealed under the epoch-2 key — B never got it.
  createEntity(dbA, { name: "After" });
  const { ops: seqs } = await relayClient(
    { boardId: board.board_id, baseUrl: BASE, identity: a, boardKey: aKey2 },
  ).submit(listOps(dbA).slice(1));
  assert.equal(seqs[0].epoch, 2);
  const fetched = (await clientA.fetchOps(2)).ops[0];
  await assert.rejects(openOp(boardKey, fetched.env)); // B's key opens nothing
  assert.equal((await openOp(aKey2, fetched.env)).kind, "create_entity");
});
