/**
 * UserRelay — one Durable Object per user (Sync_And_Web_Editing § 6).
 *
 * The relay is blind: it stores and orders ciphertext envelopes, never
 * plaintext. What it knows: user id, allowed device public keys, op
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
import { checkLicense } from "./license.mjs";

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

// Retention (§ 6/§ 11): a user is never deleted for payment. Deletion
// happens only on family request (30-day undo) or after 3 idle years;
// a device returning in the final 6 months gets a warning.
const DAY_MS = 24 * 60 * 60 * 1000;
const DELETE_GRACE_MS = 30 * DAY_MS;
const IDLE_DELETE_MS = 3 * 365 * DAY_MS;
const IDLE_WARN_MS = IDLE_DELETE_MS - 183 * DAY_MS;
const OP_PRUNE_MS = 30 * DAY_MS;
const ALARM_PERIOD_MS = DAY_MS;

export class UserRelay {
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

  metaGet(k) {
    return this.ctx.storage.sql.exec(
      "SELECT v FROM meta WHERE k = ?", k).toArray()[0]?.v ?? null;
  }

  metaSet(k, v) {
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)", k, String(v));
  }

  epoch() {
    return Number(this.metaGet("key_epoch") ?? 1);
  }

  /** 'free' | 'lifetime' — relay-held truth; the client only asks. */
  entitlement() {
    return this.metaGet("entitlement") ?? "free";
  }

  /** Any signed request counts as the user being alive (§ 11). */
  touchSeen() {
    this.metaSet("last_seen", Date.now());
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
    const route = url.pathname.split("/").slice(3).join("/"); // after /users/:id
    const method = request.method;

    // The user creator registers itself at creation — the one call an
    // unknown device may make. It also leaves the recovery proof: the
    // SHA-256 of the recovery root, which a restore presents in place
    // of a device signature. The relay stores the proof, never the key.
    if (method === "POST" && route === "bootstrap") {
      // 015 slice 2: clients choose the user id (their registry id), so
      // a DO may already be initialized — refuse rather than graft a
      // stranger's device onto someone else's user.
      if (this.metaGet("user_id") ?? this.metaGet("board_id")) {
        return bad("conflict", 409);
      }
      const { device_id, pubkey, dh_pub, wrapped_key, recovery_proof } =
        await request.json().catch(() => ({}));
      if (!device_id || !pubkey) return bad("bad_bootstrap");
      this.ctx.storage.sql.exec(
        `INSERT OR IGNORE INTO device (device_id, pubkey, dh_pub, wrapped_key, epoch, added_at)
         VALUES (?, ?, ?, ?, 1, ?)`,
        device_id, pubkey, dh_pub ?? null, wrapped_key ?? null, Date.now());
      if (recovery_proof) this.metaSet("recovery_proof", recovery_proof);
      // Retention bookkeeping starts at birth: the alarm sweeps daily.
      this.metaSet("user_id", url.pathname.split("/")[2]);
      this.metaSet("last_seen", Date.now());
      this.ctx.storage.setAlarm(Date.now() + ALARM_PERIOD_MS);
      return json({ ok: true });
    }

    // Recovery sheet (§ 9): whoever presents the sheet's proof gets
    // registered as a device at the current epoch, then drains the op
    // log like any linked device. Bearer credential — the sheet is the
    // family's last resort, so it opens the door it was printed for.
    if (method === "POST" && route === "restore") {
      const { device_id, pubkey, dh_pub, proof } = await request.json().catch(() => ({}));
      const stored = this.ctx.storage.sql.exec(
        "SELECT v FROM meta WHERE k = 'recovery_proof'").toArray()[0]?.v;
      if (!device_id || !pubkey || !proof || !stored) return bad("forbidden", 403);
      let a, b;
      try { a = unb64u(proof); b = unb64u(stored); } catch { return bad("forbidden", 403); }
      let diff = a.length === b.length ? 0 : 1;
      for (let i = 0; i < Math.min(a.length, b.length); i++) diff |= a[i] ^ b[i];
      if (diff) return bad("forbidden", 403);
      // Restore moves the user (§ 11): on a free user the card's new
      // device replaces the old set — the old device is unlinked, not
      // added to. Lifetime keeps every linked device.
      const moved = this.entitlement() !== "lifetime";
      if (moved) {
        this.ctx.storage.sql.exec("DELETE FROM device");
      }
      this.ctx.storage.sql.exec(
        `INSERT OR IGNORE INTO device (device_id, pubkey, dh_pub, wrapped_key, epoch, added_at)
         VALUES (?, ?, ?, NULL, ?, ?)`,
        device_id, pubkey, dh_pub ?? null, this.epoch(), Date.now());
      return json({ ok: true, epoch: this.epoch(), moved,
        // 015 slice 3: keys sealed to the card's root cover epochs from
        // before the card was replaced — the restore unpacks them.
        recovery_bundle: this.metaGet("recovery_bundle") ?? null });
    }

    // WebSocket upgrade — auth via query params.
    if (method === "GET" && route === "ws") {
      if (request.headers.get("Upgrade") !== "websocket") return bad("expected_websocket", 426);
      if (!(await this.verify(request, null))) return bad("forbidden", 403);
      this.touchSeen();
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    // Everything else: buffered body (ops are capped small), signed.
    const bodyBytes = method === "GET" ? null : new Uint8Array(await request.arrayBuffer());
    const device = await this.verify(request, bodyBytes);
    if (!device) return bad("forbidden", 403);
    // last_seen BEFORE this request — a long-absent device refreshing it
    // now must still get its "nearly deleted" warning this once.
    const prevSeen = Number(this.metaGet("last_seen") ?? Date.now());
    this.touchSeen();
    if (!(await this.ctx.storage.getAlarm())) {
      this.ctx.storage.setAlarm(Date.now() + ALARM_PERIOD_MS);
    }

    // Free users carry one linked device at a time (§ 11). The relay —
    // not the UI — refuses a second registration; pairing surfaces the
    // upgrade message from this response.
    if (method === "POST" && route === "devices") {
      const { device_id, pubkey, dh_pub, wrapped_key } = JSON.parse(td.decode(bodyBytes));
      if (!device_id || !pubkey) return bad("bad_device");
      if (this.entitlement() !== "lifetime") {
        const known = this.ctx.storage.sql.exec(
          "SELECT COUNT(*) AS n FROM device").toArray()[0].n;
        const present = this.devicePubkey(device_id) !== null;
        if (!present && known >= 1) {
          return json({ error: "upgrade_required",
            message: "Pip Lifetime unlocks more than one linked device." }, { status: 403 });
        }
      }
      const epoch = this.epoch();
      this.ctx.storage.sql.exec(
        `INSERT OR IGNORE INTO device (device_id, pubkey, dh_pub, wrapped_key, epoch, added_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        device_id, pubkey, dh_pub ?? null, wrapped_key ?? null, epoch, Date.now());
      return json({ ok: true });
    }

    // The calling device's own row — this is how a device picks up the
    // wrapped user key after pairing, and after a rotation. Entitlement
    // and pending-deletion state ride along so the app can warn.
    if (method === "GET" && route === "devices/self") {
      const row = this.ctx.storage.sql.exec(
        "SELECT device_id, dh_pub, wrapped_key, epoch FROM device WHERE device_id = ?",
        device).toArray()[0];
      const idleAt = prevSeen + IDLE_DELETE_MS;
      return json({
        ...row, current_epoch: this.epoch(),
        entitlement: this.entitlement(),
        ...(this.metaGet("delete_at") ? { delete_at: Number(this.metaGet("delete_at")) } : {}),
        ...(idleAt - Date.now() <= IDLE_DELETE_MS - IDLE_WARN_MS ? { idle_delete_at: idleAt } : {}),
      });
    }

    // Replace the QR card (015 slice 3): a linked device posts the new
    // root's proof plus the epoch-key bundle sealed to that root; the
    // old card's restore stops working at once.
    if (method === "POST" && route === "recovery") {
      const { recovery_proof, recovery_bundle } = JSON.parse(td.decode(bodyBytes));
      if (!recovery_proof) return bad("bad_recovery");
      this.metaSet("recovery_proof", recovery_proof);
      if (recovery_bundle) this.metaSet("recovery_bundle", recovery_bundle);
      return json({ ok: true });
    }

    // Dev-path activation (011/9): a signed device presents a license
    // minted against PIP_LICENSE_SECRET. Real purchases mint the same
    // token when the payments slice lands — this seam stays.
    if (method === "POST" && route === "entitlement") {
      const { license } = JSON.parse(td.decode(bodyBytes));
      const userId = this.metaGet("user_id") ?? this.metaGet("board_id")
        ?? url.pathname.split("/")[2];
      if (!this.env.PIP_LICENSE_SECRET) return bad("licenses_unavailable", 503);
      if (!(await checkLicense(this.env.PIP_LICENSE_SECRET, userId, license))) {
        return bad("bad_license", 403);
      }
      this.metaSet("entitlement", "lifetime");
      return json({ ok: true, entitlement: "lifetime" });
    }

    // Family-requested deletion (§ 11): a signed device schedules the
    // user for deletion after the 30-day undo window. The user keeps
    // working until then; undelete cancels outright.
    if (method === "DELETE" && route === "") {
      const deleteAt = Date.now() + DELETE_GRACE_MS;
      this.metaSet("delete_at", deleteAt);
      return json({ ok: true, delete_at: deleteAt });
    }

    if (method === "POST" && route === "undelete") {
      this.ctx.storage.sql.exec("DELETE FROM meta WHERE k = 'delete_at'");
      return json({ ok: true });
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
      const userId = url.pathname.split("/")[2];
      if (method === "PUT") {
        await this.env.BLOBS.put(`s/${userId}`, bodyBytes);
        this.metaSet("snapshot_at", Date.now());
        // ?seq=N marks how much of the op log the snapshot covers —
        // the retention sweep prunes only ops it has folded away.
        const seq = Number(url.searchParams.get("seq") ?? 0);
        if (seq > 0) this.metaSet("snapshot_seq", seq);
        return json({ ok: true });
      }
      if (method === "GET") {
        const obj = await this.env.BLOBS.get(`s/${userId}`);
        if (!obj) return bad("not_found", 404);
        return new Response(obj.body, { headers: { "content-type": "application/octet-stream" } });
      }
    }

    return bad("not_found", 404);
  }

  /** Physical deletion: every blob + snapshot under the user prefix,
   *  then the DO's own storage. Only retentionSweep reaches here —
   *  nothing about entitlement ever deletes data. */
  async destroy() {
    const userId = this.metaGet("user_id") ?? this.metaGet("board_id");
    if (userId) {
      let cursor;
      do {
        const listing = await this.env.BLOBS.list({ prefix: `b/${userId}/`, cursor });
        for (const obj of listing.objects ?? []) await this.env.BLOBS.delete(obj.key);
        cursor = listing.truncated ? listing.cursor : undefined;
      } while (cursor);
      await this.env.BLOBS.delete(`s/${userId}`);
    }
    await this.ctx.storage.deleteAll();
    await this.ctx.storage.deleteAlarm();
  }

  /** The daily sweep (§ 11). Callable directly with an injected `now`
   *  so tests can place a user at any age. Returns what it did. */
  async retentionSweep(now) {
    const deleteAt = Number(this.metaGet("delete_at") ?? 0);
    const lastSeen = Number(this.metaGet("last_seen") ?? now);
    const done = { destroyed: false, warned: false, pruned: 0 };
    if ((deleteAt && deleteAt <= now) || now - lastSeen >= IDLE_DELETE_MS) {
      await this.destroy();
      done.destroyed = true;
      return done;
    }
    if (now - lastSeen >= IDLE_WARN_MS) done.warned = true; // surfaced via devices/self
    const snapSeq = Number(this.metaGet("snapshot_seq") ?? 0);
    if (snapSeq > 0) {
      done.pruned = this.ctx.storage.sql.exec(
        "SELECT COUNT(*) AS n FROM op WHERE relay_seq <= ? AND created_at < ?",
        snapSeq, now - OP_PRUNE_MS).toArray()[0].n;
      this.ctx.storage.sql.exec(
        "DELETE FROM op WHERE relay_seq <= ? AND created_at < ?",
        snapSeq, now - OP_PRUNE_MS);
    }
    return done;
  }

  async alarm() {
    await this.retentionSweep(Date.now());
    this.ctx.storage.setAlarm(Date.now() + ALARM_PERIOD_MS);
  }

  webSocketMessage() { /* clients never send — ops go through POST */ }
  webSocketClose() { /* hibernation reaps the socket itself */ }
  webSocketError() {}
}
