/**
 * BoardRelay — one Durable Object per board (Sync_And_Web_Editing § 6).
 *
 * The relay is blind: it stores and orders ciphertext envelopes, never
 * plaintext. What it knows: board id, allowed device public keys, op
 * sizes and times. Each request is signed by an allowed device key —
 * signature over `${method}\n${path}\n${sha256(body)}` in
 * x-pip-device / x-pip-sig / x-pip-ts (10-minute freshness window).
 * WebSocket clients authenticate with the same scheme as query params.
 *
 * Sequencing: POST /ops assigns the next relay_seq, stores the envelope,
 * and fans it out to connected sockets. GET /ops?after=N is the catch-up
 * path for a device that was offline. Blobs and snapshots stream to R2.
 *
 * Plain class (not extends DurableObject) so Node unit tests can import
 * the worker graph without cloudflare:workers.
 */

const te = new TextEncoder();
const td = new TextDecoder();
const unb64u = (s) => {
  const bin = atob(s.replaceAll("-", "+").replaceAll("_", "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const hex = (buf) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...(init.headers || {}) },
  });
const bad = (error, status = 400) => json({ error }, { status });

const TS_WINDOW_MS = 10 * 60 * 1000;
const MAX_OP_BYTES = 64 * 1024;

export class BoardRelay {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS device (
          device_id TEXT PRIMARY KEY,
          pubkey TEXT NOT NULL,
          dh_pub TEXT,
          wrapped_key TEXT,
          epoch INTEGER NOT NULL DEFAULT 1,
          added_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS op (
          relay_seq INTEGER PRIMARY KEY AUTOINCREMENT,
          op_id TEXT NOT NULL UNIQUE,
          device_id TEXT NOT NULL,
          env TEXT NOT NULL,
          epoch INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS meta (
          k TEXT PRIMARY KEY,
          v TEXT NOT NULL
        );
      `);
      // Persisted dev DOs from before slice 5 lack the new columns.
      for (const alter of [
        "ALTER TABLE device ADD COLUMN dh_pub TEXT",
        "ALTER TABLE device ADD COLUMN wrapped_key TEXT",
        "ALTER TABLE device ADD COLUMN epoch INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE op ADD COLUMN epoch INTEGER NOT NULL DEFAULT 1",
      ]) {
        try { ctx.storage.sql.exec(alter); } catch { /* column already there */ }
      }
    });
  }

  epoch() {
    return Number(this.ctx.storage.sql.exec(
      "SELECT v FROM meta WHERE k = 'key_epoch'").toArray()[0]?.v ?? 1);
  }

  devicePubkey(deviceId) {
    return this.ctx.storage.sql
      .exec("SELECT pubkey FROM device WHERE device_id = ?", deviceId)
      .toArray()[0]?.pubkey ?? null;
  }

  async verify(request, bodyBytes) {
    const url = new URL(request.url);
    const headers = request.headers;
    const q = url.searchParams;
    const device = headers.get("x-pip-device") ?? q.get("device");
    const sig = headers.get("x-pip-sig") ?? q.get("sig");
    const ts = Number(headers.get("x-pip-ts") ?? q.get("ts"));
    if (!device || !sig || !ts) return null;
    if (Math.abs(Date.now() - ts) > TS_WINDOW_MS) return null;
    const pubkey = this.devicePubkey(device);
    if (!pubkey) return null;
    const bodyHash = hex(await crypto.subtle.digest("SHA-256", bodyBytes ?? new Uint8Array()));
    // WS clients sign GET\n<path>\n<ts> — they cannot set headers.
    const canonical = headers.get("x-pip-device")
      ? `${request.method}\n${url.pathname}\n${ts}\n${bodyHash}`
      : `GET\n${url.pathname}\n${ts}`;
    const key = await crypto.subtle.importKey("spki", unb64u(pubkey),
      { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" }, key, unb64u(sig), te.encode(canonical));
    return ok ? device : null;
  }

  broadcast(msg) {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(text); } catch { /* socket closing */ }
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    const route = url.pathname.split("/").slice(3).join("/"); // after /boards/:id
    const method = request.method;

    // The board creator registers itself at creation — the one call an
    // unknown device may make.
    if (method === "POST" && route === "bootstrap") {
      const { device_id, pubkey, dh_pub, wrapped_key } = await request.json().catch(() => ({}));
      if (!device_id || !pubkey) return bad("bad_bootstrap");
      this.ctx.storage.sql.exec(
        `INSERT OR IGNORE INTO device (device_id, pubkey, dh_pub, wrapped_key, epoch, added_at)
         VALUES (?, ?, ?, ?, 1, ?)`,
        device_id, pubkey, dh_pub ?? null, wrapped_key ?? null, Date.now());
      return json({ ok: true });
    }

    // WebSocket upgrade — auth via query params.
    if (method === "GET" && route === "ws") {
      if (request.headers.get("Upgrade") !== "websocket") return bad("expected_websocket", 426);
      if (!(await this.verify(request, null))) return bad("forbidden", 403);
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    // Everything else: buffered body (ops are capped small), signed.
    const bodyBytes = method === "GET" ? null : new Uint8Array(await request.arrayBuffer());
    const device = await this.verify(request, bodyBytes);
    if (!device) return bad("forbidden", 403);

    if (method === "POST" && route === "devices") {
      const { device_id, pubkey, dh_pub, wrapped_key } = JSON.parse(td.decode(bodyBytes));
      if (!device_id || !pubkey) return bad("bad_device");
      const epoch = this.epoch();
      this.ctx.storage.sql.exec(
        `INSERT OR IGNORE INTO device (device_id, pubkey, dh_pub, wrapped_key, epoch, added_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        device_id, pubkey, dh_pub ?? null, wrapped_key ?? null, epoch, Date.now());
      return json({ ok: true });
    }

    // The calling device's own row — this is how a device picks up the
    // wrapped board key after pairing, and after a rotation.
    if (method === "GET" && route === "devices/self") {
      const row = this.ctx.storage.sql.exec(
        "SELECT device_id, dh_pub, wrapped_key, epoch FROM device WHERE device_id = ?",
        device).toArray()[0];
      return json({ ...row, current_epoch: this.epoch() });
    }

    if (method === "GET" && route === "devices") {
      const rows = this.ctx.storage.sql.exec(
        "SELECT device_id, dh_pub, epoch, added_at FROM device ORDER BY added_at").toArray();
      return json({ devices: rows, current_epoch: this.epoch() });
    }

    // Key rotation (§ 3 revoke): the signer posts a new epoch and a
    // wrapped key per remaining device. Only devices still in the table
    // receive a wrapped key — a removed device gets nothing.
    if (method === "POST" && route === "keys") {
      const { epoch, wrapped } = JSON.parse(td.decode(bodyBytes));
      if (!epoch || !wrapped || epoch <= this.epoch()) return bad("bad_epoch");
      const allowed = new Set(
        this.ctx.storage.sql.exec("SELECT device_id FROM device").toArray()
          .map((r) => r.device_id));
      for (const [dev, wk] of Object.entries(wrapped)) {
        if (!allowed.has(dev)) continue;
        this.ctx.storage.sql.exec(
          "UPDATE device SET wrapped_key = ?, epoch = ? WHERE device_id = ?",
          JSON.stringify(wk), epoch, dev);
      }
      this.ctx.storage.sql.exec(
        "INSERT OR REPLACE INTO meta (k, v) VALUES ('key_epoch', ?)", String(epoch));
      return json({ ok: true, epoch });
    }

    if (method === "DELETE" && route.startsWith("devices/")) {
      const target = route.slice("devices/".length);
      this.ctx.storage.sql.exec("DELETE FROM device WHERE device_id = ?", target);
      // Key rotation lives with pairing (slice 5); removal alone just
      // locks the door — old ops stay readable to nobody new.
      return json({ ok: true });
    }

    if (method === "POST" && route === "ops") {
      const { ops } = JSON.parse(td.decode(bodyBytes));
      if (!Array.isArray(ops) || !ops.length) return bad("no_ops");
      const epoch = this.epoch();
      const assigned = [];
      const fresh = [];
      for (const op of ops) {
        const env = JSON.stringify(op.env);
        if (env.length > MAX_OP_BYTES) return bad("op_too_large", 413);
        const row = this.ctx.storage.sql.exec(
          `INSERT OR IGNORE INTO op (op_id, device_id, env, epoch, created_at) VALUES (?, ?, ?, ?, ?)
           RETURNING relay_seq`,
          op.op_id, device, env, epoch, Date.now()).toArray()[0];
        if (row) {
          assigned.push({ relay_seq: row.relay_seq, op_id: op.op_id, epoch });
          fresh.push({ relay_seq: row.relay_seq, op_id: op.op_id, device_id: device,
            epoch, env: op.env });
        } else {
          // Resubmitted op — already sequenced; do not fan it out again.
          const seq = this.ctx.storage.sql.exec(
            "SELECT relay_seq FROM op WHERE op_id = ?", op.op_id).toArray()[0].relay_seq;
          assigned.push({ relay_seq: seq, op_id: op.op_id });
        }
      }
      if (fresh.length) this.broadcast({ t: "ops", ops: fresh });
      return json({ ops: assigned });
    }

    if (method === "GET" && route === "ops") {
      const after = Number(url.searchParams.get("after") ?? 0);
      const rows = this.ctx.storage.sql.exec(
        `SELECT relay_seq, op_id, device_id, epoch, env FROM op
         WHERE relay_seq > ? ORDER BY relay_seq`, after).toArray();
      const latest = this.ctx.storage.sql.exec(
        "SELECT MAX(relay_seq) AS m FROM op").toArray()[0].m ?? 0;
      return json({ ops: rows.map((r) => ({ ...r, env: JSON.parse(r.env) })), latest });
    }

    if (route.startsWith("blobs/")) {
      const sha = route.slice("blobs/".length);
      const key = `b/${url.pathname.split("/")[2]}/${sha}`;
      if (method === "PUT") {
        await this.env.BLOBS.put(key, bodyBytes);
        return json({ ok: true, sha });
      }
      if (method === "GET") {
        const obj = await this.env.BLOBS.get(key);
        if (!obj) return bad("not_found", 404);
        return new Response(obj.body, { headers: { "content-type": "application/octet-stream" } });
      }
    }

    if (route === "snapshot") {
      const boardId = url.pathname.split("/")[2];
      if (method === "PUT") {
        await this.env.BLOBS.put(`s/${boardId}`, bodyBytes);
        this.ctx.storage.sql.exec(
          "INSERT OR REPLACE INTO meta (k, v) VALUES ('snapshot_at', ?)", String(Date.now()));
        return json({ ok: true });
      }
      if (method === "GET") {
        const obj = await this.env.BLOBS.get(`s/${boardId}`);
        if (!obj) return bad("not_found", 404);
        return new Response(obj.body, { headers: { "content-type": "application/octet-stream" } });
      }
    }

    return bad("not_found", 404);
  }

  webSocketMessage() { /* clients never send — ops go through POST */ }
  webSocketClose() { /* hibernation reaps the socket itself */ }
  webSocketError() {}
}
