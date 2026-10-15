/**
 * 044 E6 test rig - the BUILT core (apps/PipAAC/PipAAC/Core/pip-core.js) in a
 * bare vm realm with a fake host exactly as Swift supplies it, and a FAKE
 * Worker behind __pipHost "fetch" (so no paid provider - Jev, embeddings,
 * Muse - is reachable). Used by app_pictures.test.mjs and
 * app_pictures_bulk.test.mjs (one process, one fresh database, each).
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import vm from "node:vm";

const root = new URL("../../", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "pip-pics-"));
const file = join(dir, "user.sqlite");
copyFileSync(join(root, "public/fresh_db.sqlite"), file);
const db = new DatabaseSync(file);
const reader = new DatabaseSync(file);
const bind = (v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v);
const SCALE = 0.1; // compressed clock: the 350 ms paste debounce -> 35 ms
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, what, ms = 8000) => {
  const t0 = Date.now();
  while (!(await pred())) {
    if (Date.now() - t0 > ms) assert.fail(`timed out waiting for: ${what}`);
    await sleep(5);
  }
};
const b64u = (buf) => Buffer.from(buf).toString("base64url");
const unb64 = (s) => new Uint8Array(Buffer.from(s, "base64url"));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const q = (sql, ...p) => reader.prepare(sql).all(...p);

/* ---------------- the fake Worker ---------------- */

const USER = "11111111-2222-4333-8444-555555555555";
const LICENSE = "pip-life-test-license";
const png = (tag) => Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(`pic:${tag}`)]);
const cand = (id, n = 0) => ({ image_id: id, asset: id.startsWith("drw_")
  ? `/api/v1/pictures/img/${id}` : `/symbols/${id}.png`, source: "ours", score: 0.9 - n * 0.1 });

const worker = {
  log: [],
  entitled: true,
  trial: true,        // the person started a trial (the free five)
  left: 3,
  finds: new Map(),         // normalized text -> find result
  drawStatus: 200,
  drawN: 0,
  reset() {
    this.log = []; this.entitled = true; this.left = 3; this.finds = new Map(); this.drawStatus = 200;
  },
  of(path) { return this.log.filter((r) => r.path === path); },
};
const findResult = (over = {}) => ({
  candidates: [cand("img_a", 0), cand("img_b", 1), cand("img_c", 2)],
  auto: "img_a", scope: "common", kind: "None", language: "en", calibrated: true, ...over,
});
const findFor = (text) => worker.finds.get(text) ?? findResult();

function workerHandle({ url, method, headers, body }) {
  const u = new URL(url);
  const text = body ? Buffer.from(body, "base64").toString("utf8") : "";
  const json = text ? JSON.parse(text) : null;
  worker.log.push({ path: u.pathname, method, headers, body: json });
  const jsonRes = (o, status = 200) => ({ status, headers: [["content-type", "application/json"]],
    body: b64u(Buffer.from(JSON.stringify(o))) });
  // picturesAllowed (src/worker/trial.mjs): a valid license, or - with none
  // presented - a board that started its trial. A forged license is refused.
  const presented = json?.license ?? headers["x-pip-license"] ?? "";
  const licensed = presented === LICENSE || (!presented && worker.trial);
  if (u.pathname.startsWith("/api/v1/pictures/") && !(worker.entitled && licensed)) {
    return jsonRes({ error: "bad_license" }, 403);
  }
  switch (u.pathname) {
    case "/api/v1/pictures/find": return jsonRes(findFor(json.text));
    case "/api/v1/pictures/find-batch":
      return jsonRes({ results: json.items.map((i) => findFor(i.text)) });
    case "/api/v1/pictures/allowance": return jsonRes({ left: worker.left, total: 5 });
    case "/api/v1/pictures/pick":
    case "/api/v1/pictures/reject": return { status: 204, headers: [], body: "" };
    case "/api/v1/pictures/draw": {
      if (worker.drawStatus === 402) return jsonRes({ error: "allowance", left: 0 }, 402);
      worker.left -= 1;
      const key = createHash("sha256").update(`draw${worker.drawN++}`).digest("hex");
      const ev = (o) => `data: ${JSON.stringify(o)}\n\n`;
      const sse = ev({ type: "stage", stage: "planning" })
        + ev({ type: "stage", stage: "drawing" })
        + ev({ type: "done", image: png(`drawn-${key}`).toString("base64"), key, cache: "mint", left: worker.left });
      return { status: 200, headers: [["content-type", "text/event-stream"]], body: b64u(Buffer.from(sse)) };
    }
    default:
      if (u.pathname.startsWith("/api/v1/pictures/img/") || u.pathname.startsWith("/symbols/")) {
        return { status: 200, headers: [["content-type", "image/png"]],
          body: b64u(png(u.pathname.split("/").pop())) };
      }
      return { status: 404, headers: [], body: "" };
  }
}

/* ---------------- the fake host (what Swift supplies) ---------------- */

const keystore = new Map();
const blobs = new Map();      // sha -> base64url bytes
const events = [];            // every "pic" event, parsed
const timers = new Map();
let ctx;
const deliver = (fn) => globalThis.setImmediate(fn);
const ops = {
  sha256: async ({ b64: x }) => b64u(createHash("sha256").update(unb64(x)).digest()),
  "keystore.get": async ({ name }) => (keystore.has(name) ? { k: "json", text: keystore.get(name) } : null),
  "keystore.put": async ({ name, text }) => { keystore.set(name, text); },
  "keystore.del": async ({ name }) => { keystore.delete(name); },
  "blob.save": async ({ sha: s, b64 }) => { blobs.set(s, b64); },
  "blob.load": async ({ sha: s }) => blobs.get(s) ?? null,
  "blob.has": async ({ sha: s }) => blobs.has(s),
  fetch: async (req) => ({ statusText: "", ...workerHandle(req) }),
};
const host = {
  baseURL: "https://worker.test",
  log: () => {},
  randomUUID: () => crypto.randomUUID(),
  randomBytes: (n) => [...crypto.getRandomValues(new Uint8Array(n))],
  dbExec: (_i, sql) => { db.exec(sql); return null; },
  dbRun: (_i, sql, p = []) => ({ changes: Number(db.prepare(sql).run(...p.map(bind)).changes) }),
  dbAll: (_i, sql, p = []) => {
    const rows = db.prepare(sql).all(...p.map(bind));
    const columns = rows.length ? Object.keys(rows[0]) : [];
    return { columns, rows: rows.map((r) => columns.map((c) =>
      r[c] instanceof Uint8Array ? { __pipBytes: [...r[c]] } : r[c])) };
  },
  call(op, id, argsJson) {
    Promise.resolve().then(() => {
      if (!ops[op]) throw new Error(`fake host: no op ${op}`);
      return ops[op](JSON.parse(argsJson));
    }).then((v) => v, (e) => e).then((out) => deliver(() => {
      if (out instanceof Error) ctx.__pipSettle(id, false, out.message);
      else ctx.__pipSettle(id, true, out === undefined ? "" : JSON.stringify(out));
    }));
  },
  cancel: () => {},
  timerStart: (tid, ms) => {
    timers.set(tid, setTimeout(() => { timers.delete(tid); deliver(() => ctx.__pipFire(tid)); }, Math.ceil(ms * SCALE)));
  },
  timerCancel: (tid) => { clearTimeout(timers.get(tid)); timers.delete(tid); },
  wsOpen() {}, wsSend() {}, wsClose() {},
  emit: (name, json) => { if (name === "pic") events.push(JSON.parse(json)); },
};
ctx = vm.createContext({ __pipHost: host, crypto: globalThis.crypto });
vm.runInContext(readFileSync(join(root, "apps/PipAAC/PipAAC/Core/pip-core.js"), "utf8"), ctx);
const j = (v) => JSON.parse(JSON.stringify(v));
const P = ctx.PIPCORE;
const pics = new Proxy({}, { get: (_, k) => (...a) => j(P.pics[k](...a)) });
const { appId } = j(P.app.appOpen(1, readFileSync(join(root, "public/catalog.json"), "utf8"), null, null));
const dbh = P.makeDb(1);
const maxSeq = () => q("SELECT COALESCE(MAX(seq),0) AS m FROM sync_op")[0].m;
const opsSince = (since) => q(
  "SELECT kind, args FROM sync_op WHERE seq > ? AND relay_seq IS NULL ORDER BY seq", since,
).map((r) => [r.kind, JSON.parse(r.args)]);
const lastRow = (kind, id) => [...events].reverse().find((e) => e.kind === kind && e.id === id && e.row)?.row;
const newWord = (name) => {
  const { id } = P.groups.createEntity(dbh, { name });
  P.groupsOps.placeItem(dbh, "grp_my_words", "entity", id);
  return id;
};
const photoOf = (id) => q("SELECT photo_key FROM personal_entity WHERE id=?", id)[0].photo_key;
const blobBytes = (key) => Buffer.from(blobs.get(key.replace("blob:", "")), "base64url");

await pics.identify(appId, USER);
await pics.testSeedLicense(appId, LICENSE);

/** Wait until the background work (fills, thumbnails) has gone quiet. */
const quiet = async () => {
  for (let n = -1, same = 0; same < 4;) {
    await sleep(25);
    same = worker.log.length === n ? same + 1 : 0;
    n = worker.log.length;
  }
};

/** The licence flag app_purchase.mjs sets on a session (ownLeft's seam). */
function appSessionLicensed(on) { P.app.appSession(appId).licensed = on; }

export {
  LICENSE, P, USER, appId, blobBytes, blobs, cand, db, dbh, events, findResult, keystore, lastRow,
  maxSeq, newWord, opsSince, photoOf, pics, png, q, quiet, sha, sleep, until, worker, appSessionLicensed,
};
