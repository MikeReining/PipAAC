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
import { checkLicense, licenseFor } from "./license.mjs";
import { indexProof } from "./restore.js";

const te = new TextEncoder();
const td = new TextDecoder();
const unb64u = (s) => {
  const bin = atob(s.replaceAll("-", "+").replaceAll("_", "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const b64u = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
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
const SEEN_FLUSH_MS = 60 * 60 * 1000;

/** A device's own name for itself — short plain text, or nothing. */
const deviceLabel = (l) => (typeof l === "string" && l.trim() ? l.trim().slice(0, 40) : null);

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
        CREATE TABLE IF NOT EXISTS join_token (
          token_hash TEXT PRIMARY KEY,
          expires INTEGER NOT NULL,
          for_acct TEXT
        );
        CREATE TABLE IF NOT EXISTS supporter (
          acct_id TEXT PRIMARY KEY,
          email TEXT,
          added_at INTEGER NOT NULL
        );
      `);
      // Persisted dev DOs from before slice 5 lack the new columns.
      for (const alter of [
        "ALTER TABLE device ADD COLUMN dh_pub TEXT",
        "ALTER TABLE device ADD COLUMN wrapped_key TEXT",
        "ALTER TABLE device ADD COLUMN epoch INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE device ADD COLUMN via_acct TEXT",
        "ALTER TABLE device ADD COLUMN label TEXT",
        "ALTER TABLE join_token ADD COLUMN for_acct TEXT",
        "ALTER TABLE supporter ADD COLUMN owner INTEGER NOT NULL DEFAULT 0",
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

  /** Any signed request counts as the user being alive (§ 11). The row
   *  is rewritten at most once an hour — a per-request write is the
   *  relay's biggest row-write source, and nothing reads a finer clock. */
  touchSeen(prev = Number(this.metaGet("last_seen") ?? 0)) {
    if (Date.now() - prev < SEEN_FLUSH_MS) return;
    this.metaSet("last_seen", Date.now());
  }

  devicePubkey(deviceId) {
    return this.ctx.storage.sql
      .exec("SELECT pubkey FROM device WHERE device_id = ?", deviceId)
      .toArray()[0]?.pubkey ?? null;
  }

  /**
   * Owner or Team (founder 2026-09-28: "an owner, and everyone else can
   * edit everything except deleting the board, managing people and the
   * license"). Derived, never stored per device: a device that joined
   * without an account tag — the creator, a device an owner paired, a
   * QR-card restore, an owner's own signed-in device — is an Owner; a
   * device that joined through a supporter account is Owner only when
   * that account is marked owner. Edits need no check: every device
   * may write ops. Only the actions the relay can see are gated.
   */
  isOwner(deviceId) {
    const row = this.ctx.storage.sql.exec(
      "SELECT via_acct FROM device WHERE device_id = ?", deviceId).toArray()[0];
    if (!row) return false;
    if (!row.via_acct) return true;
    return (this.ctx.storage.sql.exec(
      "SELECT owner FROM supporter WHERE acct_id = ?", row.via_acct).toArray()[0]?.owner ?? 0) === 1;
  }

  /** Owner devices left if `acct` stopped being an owner (or left). */
  ownersWithout(acct) {
    return this.ctx.storage.sql.exec(
      `SELECT COUNT(*) AS n FROM device d LEFT JOIN supporter s ON s.acct_id = d.via_acct
       WHERE (d.via_acct IS NULL OR s.owner = 1) AND (d.via_acct IS NULL OR d.via_acct != ?)`,
      acct).toArray()[0].n;
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

  broadcast(msg, except = null) {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
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
      const { device_id, pubkey, dh_pub, wrapped_key, recovery_proof, label } =
        await request.json().catch(() => ({}));
      if (!device_id || !pubkey) return bad("bad_bootstrap");
      this.ctx.storage.sql.exec(
        `INSERT OR IGNORE INTO device (device_id, pubkey, dh_pub, wrapped_key, epoch, added_at, label)
         VALUES (?, ?, ?, ?, 1, ?, ?)`,
        device_id, pubkey, dh_pub ?? null, wrapped_key ?? null, Date.now(), deviceLabel(label));
      if (recovery_proof) {
        this.metaSet("recovery_proof", recovery_proof);
        await indexProof(this.env, url.pathname.split("/")[2], null, recovery_proof);
      }
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
      const wsDevice = await this.verify(request, null);
      if (!wsDevice) return bad("forbidden", 403);
      this.touchSeen();
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      pair[1].serializeAttachment({ d: wsDevice.device_id });
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    // Everything else: buffered body (ops are capped small), signed.
    const bodyBytes = method === "GET" ? null : new Uint8Array(await request.arrayBuffer());

    // Account join token (§ 12.3): a supporter's fresh device presents a
    // single-use bearer token a linked device minted into the account
    // bundle. Registers like a Lifetime restore — never removes anyone.
    if (method === "POST" && route === "devices") {
      let peek = null;
      try { peek = JSON.parse(td.decode(bodyBytes)); }
      catch { /* malformed — falls through to the signed path */ }
      if (peek?.join_token) {
        const { device_id, pubkey, dh_pub } = peek;
        if (!device_id || !pubkey) return bad("bad_device");
        const hash = b64u(await crypto.subtle.digest(
          "SHA-256", te.encode(peek.join_token)));
        const row = this.ctx.storage.sql.exec(
          "SELECT token_hash, expires, for_acct FROM join_token WHERE token_hash = ?",
          hash).toArray()[0];
        if (!row || row.expires < Date.now()) return bad("forbidden", 403);
        this.ctx.storage.sql.exec(
          "DELETE FROM join_token WHERE token_hash = ?", hash);
        if (this.entitlement() !== "lifetime") {
          const known = this.ctx.storage.sql.exec(
            "SELECT COUNT(*) AS n FROM device").toArray()[0].n;
          const present = this.devicePubkey(device_id) !== null;
          if (!present && known >= 1) {
            return json({ error: "upgrade_required",
              message: "Pip Lifetime unlocks more than one linked device." }, { status: 403 });
          }
        }
        this.ctx.storage.sql.exec(
          `INSERT OR IGNORE INTO device (device_id, pubkey, dh_pub, wrapped_key, epoch, added_at, via_acct)
           VALUES (?, ?, ?, NULL, ?, ?, ?)`,
          device_id, pubkey, dh_pub ?? null, this.epoch(), Date.now(),
          row.for_acct ?? null);
        return json({ ok: true });
      }
    }

    // Worker-internal cascade (015 slice 7): deleting an account removes
    // its supporter row, every device that joined through it, and its
    // pending join tokens — the same cascade as DELETE /supporters/:id,
    // called by index.js when the account itself goes away. Auth is the
    // operator secret, which only the worker holds.
    if (method === "POST" && route === "internal/remove_supporter") {
      const secret = this.env.PIP_INTERNAL_SECRET ?? this.env.PIP_LICENSE_SECRET;
      if (!secret) return bad("internal_unavailable", 503);
      if (request.headers.get("x-pip-internal") !== secret) {
        return bad("forbidden", 403);
      }
      let parsed = null;
      try { parsed = JSON.parse(td.decode(bodyBytes)); } catch { /* fall */ }
      const acct = parsed?.acct_id ? String(parsed.acct_id) : null;
      if (!acct) return bad("bad_request");
      this.ctx.storage.sql.exec("DELETE FROM supporter WHERE acct_id = ?", acct);
      this.ctx.storage.sql.exec("DELETE FROM device WHERE via_acct = ?", acct);
      this.ctx.storage.sql.exec("DELETE FROM join_token WHERE for_acct = ?", acct);
      return json({ ok: true });
    }

    // Worker-internal entitlement read (030 § 6.1): the draw allowance
    // tiers off this, and the pictures routes hold no device signature.
    if (method === "GET" && route === "internal/entitlement") {
      const secret = this.env.PIP_INTERNAL_SECRET ?? this.env.PIP_LICENSE_SECRET;
      if (!secret) return bad("internal_unavailable", 503);
      if (request.headers.get("x-pip-internal") !== secret) {
        return bad("forbidden", 403);
      }
      return json({ entitlement: this.entitlement(),
        ...(this.metaGet("payment_issue")
          ? { payment_issue: this.metaGet("payment_issue") } : {}) });
    }

    // Worker-internal entitlement write (015 slice 6): a verified Stripe
    // webhook or a redeemed license code grants lifetime from the worker
    // side — no device signature exists at webhook time. Same secret as
    // the internal read; provenance lands in meta for the audit trail.
    if (method === "POST" && route === "internal/entitlement") {
      const secret = this.env.PIP_INTERNAL_SECRET ?? this.env.PIP_LICENSE_SECRET;
      if (!secret) return bad("internal_unavailable", 503);
      if (request.headers.get("x-pip-internal") !== secret) {
        return bad("forbidden", 403);
      }
      let parsed = null;
      try { parsed = JSON.parse(td.decode(bodyBytes)); } catch { /* fall */ }
      this.metaSet("entitlement", "lifetime");
      this.metaSet("license_source", String(parsed?.source ?? "unknown"));
      this.metaSet("license_ref", String(parsed?.ref ?? ""));
      this.metaSet("licensed_at", Date.now());
      // 043 K — a landed grant clears any recorded payment issue.
      this.ctx.storage.sql.exec("DELETE FROM meta WHERE k = 'payment_issue'");
      return json({ ok: true, entitlement: "lifetime" });
    }

    // 043 K — a delayed payment that failed, a refund, or a dispute:
    // flag the account so the app surfaces it on the next read.
    // {revoke:true} (founder ruling 2026-10-04, refund/dispute) drops the
    // lifetime grant atomically with the flag — a refunded buyer does
    // not keep the product.
    if (method === "POST" && route === "internal/payment_issue") {
      const secret = this.env.PIP_INTERNAL_SECRET ?? this.env.PIP_LICENSE_SECRET;
      if (!secret) return bad("internal_unavailable", 503);
      if (request.headers.get("x-pip-internal") !== secret) {
        return bad("forbidden", 403);
      }
      let parsed = null;
      try { parsed = JSON.parse(td.decode(bodyBytes)); } catch { /* fall */ }
      if (!parsed?.issue) {
        this.ctx.storage.sql.exec("DELETE FROM meta WHERE k = 'payment_issue'");
      } else {
        this.metaSet("payment_issue", String(parsed.issue).slice(0, 40));
      }
      if (parsed?.revoke) {
        this.ctx.storage.sql.exec(
          "DELETE FROM meta WHERE k IN ('entitlement','license_source','license_ref','licensed_at')");
      }
      return json({ ok: true });
    }

    const device = await this.verify(request, bodyBytes);
    if (!device) return bad("forbidden", 403);
    // last_seen BEFORE this request — a long-absent device refreshing it
    // now must still get its "nearly deleted" warning this once.
    const lastSeen = this.metaGet("last_seen");
    const prevSeen = Number(lastSeen ?? Date.now());
    this.touchSeen(Number(lastSeen ?? 0));
    if (!(await this.ctx.storage.getAlarm())) {
      this.ctx.storage.setAlarm(Date.now() + ALARM_PERIOD_MS);
    }

    // Owner-only: adding or removing people and devices, the key they
    // are re-keyed under, the QR card, and deleting the board. Team keeps
    // every read and edit, and may buy Pip Lifetime (founder 2026-10-02).
    const ownerOnly =
      (method === "POST" && ["devices", "supporters", "keys", "recovery", "undelete"]
        .includes(route))
      || (method === "POST" && /^supporters\/[^/]+\/owner$/.test(route))
      || (method === "DELETE"
        && (route === "" || route.startsWith("supporters/") || route.startsWith("devices/")));
    if (ownerOnly && !this.isOwner(device)) {
      return json({ error: "owner_only", message: "Only an owner can do this." }, { status: 403 });
    }

    // Free users carry one linked device at a time (§ 11). The relay —
    // not the UI — refuses a second registration; pairing surfaces the
    // upgrade message from this response.
    if (method === "POST" && route === "devices") {
      const { device_id, pubkey, dh_pub, wrapped_key, label } = JSON.parse(td.decode(bodyBytes));
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
        `INSERT OR IGNORE INTO device (device_id, pubkey, dh_pub, wrapped_key, epoch, added_at, label)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        device_id, pubkey, dh_pub ?? null, wrapped_key ?? null, epoch, Date.now(), deviceLabel(label));
      return json({ ok: true });
    }

    // A device names itself ("iPad · Safari") so the device list reads
    // like the family's devices, not key ids. Any device, its own row.
    if (method === "POST" && route === "label") {
      let label = null;
      try { label = JSON.parse(td.decode(bodyBytes)).label; } catch { /* none */ }
      this.ctx.storage.sql.exec(
        "UPDATE device SET label = ? WHERE device_id = ?", deviceLabel(label), device);
      return json({ ok: true });
    }

    // A linked device mints single-use join tokens for its account
    // bundle (§ 12.3): a supporter's fresh device redeems one above to
    // register itself. The relay stores only the SHA-256.
    if (method === "POST" && route === "join_tokens") {
      let n = 1, forAcct = null;
      try {
        const b = JSON.parse(td.decode(bodyBytes));
        n = Math.min(Math.max(Number(b.n ?? 1), 1), 8);
        forAcct = b.for_acct ? String(b.for_acct) : null;
      } catch { /* malformed body mints one untagged */ }
      // A Team device's tokens always carry its own account: its owner's
      // next device joins as Team too, never as an untagged Owner.
      if (!this.isOwner(device)) {
        forAcct = this.ctx.storage.sql.exec(
          "SELECT via_acct FROM device WHERE device_id = ?", device).toArray()[0]?.via_acct ?? null;
      }
      const expires = Date.now() + 30 * 86400000;
      const tokens = [];
      for (let i = 0; i < n; i++) {
        const t = b64u(crypto.getRandomValues(new Uint8Array(24)));
        const h = b64u(await crypto.subtle.digest("SHA-256", te.encode(t)));
        this.ctx.storage.sql.exec(
          "INSERT INTO join_token (token_hash, expires, for_acct) VALUES (?, ?, ?)",
          h, expires, forAcct);
        tokens.push(t);
      }
      return json({ tokens });
    }

    // Supporters on this user (015 slice 5): the accounts that may see
    // it. Removal cascades — every device that joined through that
    // account and every unredeemed token minted for it die together.
    if (method === "GET" && route === "supporters") {
      const rows = this.ctx.storage.sql.exec(
        "SELECT acct_id, email, added_at, owner FROM supporter ORDER BY added_at")
        .toArray().map((r) => ({ ...r, owner: r.owner === 1 }));
      return json({ supporters: rows });
    }
    // Make an account an owner, or back to team. The last owner stays.
    if (method === "POST" && /^supporters\/[^/]+\/owner$/.test(route)) {
      const target = decodeURIComponent(route.split("/")[1]);
      let parsed = null;
      try { parsed = JSON.parse(td.decode(bodyBytes)); } catch { /* fall */ }
      const owner = parsed?.owner === true;
      const known = this.ctx.storage.sql.exec(
        "SELECT 1 AS x FROM supporter WHERE acct_id = ?", target).toArray()[0];
      if (!known) return bad("no_supporter", 404);
      if (!owner && this.ownersWithout(target) === 0) return bad("last_owner", 409);
      this.ctx.storage.sql.exec(
        "UPDATE supporter SET owner = ? WHERE acct_id = ?", owner ? 1 : 0, target);
      return json({ ok: true, owner });
    }
    if (method === "POST" && route === "supporters") {
      let parsed = null;
      try { parsed = JSON.parse(td.decode(bodyBytes)); } catch { /* fall */ }
      const { acct_id, email } = parsed ?? {};
      if (!acct_id) return bad("bad_supporter");
      this.ctx.storage.sql.exec(
        "INSERT OR IGNORE INTO supporter (acct_id, email, added_at) VALUES (?, ?, ?)",
        String(acct_id), email ? String(email) : null, Date.now());
      return json({ ok: true });
    }
    if (method === "DELETE" && route.startsWith("supporters/")) {
      const target = route.slice("supporters/".length);
      if (this.ownersWithout(target) === 0) return bad("last_owner", 409);
      this.ctx.storage.sql.exec(
        "DELETE FROM supporter WHERE acct_id = ?", target);
      this.ctx.storage.sql.exec(
        "DELETE FROM device WHERE via_acct = ?", target);
      this.ctx.storage.sql.exec(
        "DELETE FROM join_token WHERE for_acct = ?", target);
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
        owner: this.isOwner(device),
        ...(this.metaGet("payment_issue") ? { payment_issue: this.metaGet("payment_issue") } : {}),
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
      await indexProof(this.env, url.pathname.split("/")[2],
        this.metaGet("recovery_proof"), recovery_proof);
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
      // 043 K — a revoked account (refund/dispute) rejects re-presented
      // license tokens; only a fresh worker-side grant reopens it.
      const issue = this.metaGet("payment_issue");
      if (issue === "refunded" || issue === "dispute") {
        return bad("payment_revoked", 403);
      }
      if (!(await checkLicense(this.env.PIP_LICENSE_SECRET, userId, license))) {
        return bad("bad_license", 403);
      }
      this.metaSet("entitlement", "lifetime");
      return json({ ok: true, entitlement: "lifetime" });
    }

    // The device-side read of the same seam: a Stripe webhook or a
    // redeemed code lands lifetime worker-side with no device
    // round-trip, so a signed device asks for its license copy here —
    // the pip-life-* token voice calls present (024). Minted fresh from
    // the relay's own truth; the relay is what proved lifetime.
    if (method === "GET" && route === "entitlement") {
      const ent = this.entitlement();
      const license = ent === "lifetime" && this.env.PIP_LICENSE_SECRET
        ? await licenseFor(this.env.PIP_LICENSE_SECRET,
            this.metaGet("user_id") ?? this.metaGet("board_id") ?? url.pathname.split("/")[2])
        : null;
      return json({ entitlement: ent, ...(license ? { license } : {}),
        ...(this.metaGet("payment_issue") ? { payment_issue: this.metaGet("payment_issue") } : {}) });
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
        "SELECT device_id, dh_pub, epoch, added_at, via_acct, label FROM device ORDER BY added_at").toArray();
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
        // ?seq=N marks how much of the op log the snapshot covers —
        // the retention sweep prunes only ops it has folded away. The
        // pair (file, watermark) only ever advances: a stale device's
        // PUT must not overwrite a newer snapshot or regress the seq
        // under it — a file behind the watermark would leave a gap in
        // the log a bootstrap can't bridge.
        const seq = Number(url.searchParams.get("seq") ?? 0);
        if (seq > Number(this.metaGet("snapshot_seq") ?? 0)) {
          await this.env.BLOBS.put(`s/${userId}`, bodyBytes);
          this.metaSet("snapshot_at", Date.now());
          this.metaSet("snapshot_seq", seq);
        }
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

  /** One warning email per supporter per idle streak (015 slice 7).
   *  `warned_for_seen` remembers which last_seen we warned about, so a
   *  daily alarm never re-mails the same streak — but a returning
   *  device bumps last_seen, and a later idle streak warns again. */
  async warnSupporters(now, lastSeen) {
    if (String(this.metaGet("warned_for_seen") ?? "") === String(lastSeen)) return 0;
    const emails = this.ctx.storage.sql.exec(
      "SELECT email FROM supporter WHERE email IS NOT NULL").toArray()
      .map((r) => r.email);
    const days = Math.max(1, Math.round(
      (lastSeen + IDLE_DELETE_MS - now) / DAY_MS));
    let sent = 0;
    for (const email of emails) {
      try {
        const raw = [
          `From: Pip <accounts@pipaac.org>`,
          `To: ${email}`,
          `Subject: A Pip board you support will be deleted soon`,
          `Content-Type: text/plain; charset=utf-8`,
          ``,
          `A Pip AAC user you support has not been opened in a long time.`,
          `Their board and words will be deleted in about ${days} days.`,
          `Open Pip on their device to keep everything.`,
        ].join("\r\n");
        let msg = raw;
        try {
          const { EmailMessage } = await import("cloudflare:email");
          msg = new EmailMessage("accounts@pipaac.org", email, raw);
        } catch { /* no cf module (tests) — the binding takes the raw */ }
        await this.env.EMAIL?.send?.(msg);
        sent++;
      } catch { /* a bad address must not stop the others */ }
    }
    // A streak with zero supporters stays un-marked — one added later
    // in the window still gets warned.
    if (emails.length) this.metaSet("warned_for_seen", String(lastSeen));
    // Dev visibility (the dev-mailbox pattern): the outbox is inspectable
    // even where no EMAIL binding exists.
    this.metaSet("warn_outbox", JSON.stringify(
      emails.map((email) => ({ email, at: now }))));
    return sent;
  }

  /** The daily sweep (§ 11). Callable directly with an injected `now`
   *  so tests can place a user at any age. Returns what it did. */
  async retentionSweep(now) {
    const deleteAt = Number(this.metaGet("delete_at") ?? 0);
    const lastSeen = Number(this.metaGet("last_seen") ?? now);
    const done = { destroyed: false, warned: false, pruned: 0, emailed: 0 };
    if ((deleteAt && deleteAt <= now) || now - lastSeen >= IDLE_DELETE_MS) {
      await this.destroy();
      done.destroyed = true;
      return done;
    }
    if (now - lastSeen >= IDLE_WARN_MS) {
      done.warned = true; // surfaced via devices/self
      done.emailed = await this.warnSupporters(now, lastSeen);
    }
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

  webSocketMessage(ws, msg) {
    // Live spotlight (013 § 4): a supporter's modeled word, or the
    // child's tap back, rides the authenticated ws to the user's other
    // devices — sealed, transient, never stored. The relay stamps `from` itself; clients cannot
    // forge it.
    let m;
    try { m = JSON.parse(msg); } catch { return; }
    if (m?.t !== "model" || typeof m.env !== "object" || !m.env ||
        JSON.stringify(m.env).length > 4096) return;
    this.broadcast({ t: "model", e: m.e ?? 1, env: m.env,
      from: ws.deserializeAttachment()?.d ?? null }, ws);
  }
  webSocketClose() { /* hibernation reaps the socket itself */ }
  webSocketError() {}
}
