/**
 * 028 slice 1 heavy Works Test — the TileLedger DO in real `wrangler dev`.
 *
 * The light test (tile.test.mjs) covers mint semantics over node:sqlite;
 * this proves the DO survives the real runtime: durable SQLite, single
 * flight, R2 streaming, and the dev silent-stub (no TILE_LIVE → mints
 * return the silent clip, never a vendor call).
 *
 * Run: scripts/test.sh src/worker/tile.heavy.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { licenseFor } from "./license.mjs";

const PORT = 8892;
const BASE = `http://127.0.0.1:${PORT}`;
const repoRoot = join(import.meta.dirname, "../..");

const devVars = Object.fromEntries(
  readFileSync(join(repoRoot, ".dev.vars"), "utf8").split("\n")
    .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/))
    .filter(Boolean).map((m) => [m[1], m[2]]));
const SECRET = devVars.PIP_LICENSE_SECRET;

const UID = "11111111-2222-3333-4444-555555555555";
const UID2 = "99999999-aaaa-bbbb-cccc-dddddddddddd";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wrangler;

before(async () => {
  const stateDir = mkdtempSync(join(tmpdir(), "pip-tile-"));
  // The developer's .dev.vars may carry TILE_LIVE/ELEVENLABS_API_KEY — this
  // test owns its env file so the stub path is what runs, never a vendor call.
  const envFile = join(stateDir, ".dev.vars");
  writeFileSync(envFile, `PIP_LICENSE_SECRET=${SECRET}\n`);
  wrangler = spawn("npx", ["wrangler", "dev", "--port", String(PORT),
    "--ip", "127.0.0.1", "--persist-to", stateDir, "--env-file", envFile],
    { cwd: repoRoot, stdio: "ignore" });
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    const ok = await fetch(`${BASE}/health`).then((r) => r.ok).catch(() => false);
    if (ok) return;
  }
  throw new Error("wrangler dev did not come up");
});

after(() => { wrangler?.kill("SIGTERM"); });

const tile = async (body, uid = UID) =>
  fetch(`${BASE}/api/v1/voice/tile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user_id: uid,
      license: await licenseFor(SECRET, uid),
      voice: "voi_default_en",
      locale: "en",
      ...body,
    }),
  });

test("tile DO: stub mint → shared hit → held → flag → replaced → admin gate", async () => {
  // Dev stub: no TILE_LIVE → a silent mp3, never a vendor call.
  const r1 = await tile({ text: "durian" });
  assert.equal(r1.status, 200);
  assert.equal(r1.headers.get("x-tile-cache"), "stub");
  assert.equal(r1.headers.get("x-tile-version"), "1");
  assert.equal(r1.headers.get("content-type"), "audio/mpeg");

  // Same text → ledger hit; case/space collapses; second license hits.
  const r2 = await tile({ text: "  Durian " });
  assert.equal(r2.headers.get("x-tile-cache"), "hit");
  const r3 = await tile({ text: "durian" }, UID2);
  assert.equal(r3.headers.get("x-tile-cache"), "hit");

  // Held: unsupported locale and non-Latin text — recorded, no audio.
  const h1 = await tile({ text: "gato", locale: "es" });
  assert.equal(h1.status, 422);
  assert.equal((await h1.json()).held, "locale");
  const h2 = await tile({ text: "你好" });
  assert.equal(h2.status, 422);
  assert.equal((await h2.json()).held, "chars");

  // Flag: 204 even when the clip is the stub.
  const flag = await fetch(`${BASE}/api/v1/voice/tile/flag`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user_id: UID, license: await licenseFor(SECRET, UID),
      voice: "voi_default_en", locale: "en", text: "durian",
    }),
  });
  assert.equal(flag.status, 204);

  // Replaced sweep answers a list (empty here — nothing rejected/reminted).
  const sweep = await fetch(
    `${BASE}/api/v1/voice/tile/replaced?since=0&voice=voi_default_en`, {
      headers: {
        "x-pip-user": UID,
        "x-pip-license": await licenseFor(SECRET, UID),
      },
    });
  assert.equal(sweep.status, 200);
  const { ids } = await sweep.json();
  assert.deepEqual(ids, []);

  // Admin gate: without PIP_ADMIN_TOKEN the admin routes refuse everyone.
  const adm = await fetch(`${BASE}/admin/v1/tile-voice/recent`);
  assert.equal(adm.status, 401);
});
