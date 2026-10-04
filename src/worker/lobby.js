/**
 * PairingLobby — one Durable Object per pairing code (§ 3 pairing).
 *
 * The device that already has the user opens an offer: the worker mints
 * a short-lived 8-char code and the device shows it (and a QR / link).
 * The new device types the code and claims the lobby with its public
 * keys. The offering device, still polling, registers it on the relay
 * and writes the grant: the user key wrapped to the new device's dh key.
 * The new device polls until granted or the window (10 min) lapses.
 *
 * The lobby is blind like the relay: it holds public keys and wrapped
 * ciphertext. The grant cannot be verified here (the user's device list
 * lives in the user's DO) — a forged grant just fails to unwrap on the
 * new device. Claims and grants are write-once; first one wins.
 */

const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...(init.headers || {}) },
  });
const bad = (error, status = 400) => json({ error }, { status });

const WINDOW_MS = 10 * 60 * 1000;

export class PairingLobby {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS offer (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS req (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          device_id TEXT NOT NULL,
          sig_pub TEXT NOT NULL,
          dh_pub TEXT NOT NULL,
          label TEXT,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS grant (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          user_id TEXT NOT NULL,
          eph TEXT NOT NULL,
          iv TEXT NOT NULL,
          wrapped TEXT NOT NULL,
          by_device TEXT NOT NULL,
          refused TEXT,
          created_at INTEGER NOT NULL
        );
      `);
      try { ctx.storage.sql.exec("ALTER TABLE req ADD COLUMN label TEXT"); } catch { /* there */ }
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    const tail = url.pathname.split("/").slice(3).join("/"); // after /pair/:code
    const sql = (q, ...a) => this.ctx.storage.sql.exec(q, ...a).toArray()[0];
    const offer = sql("SELECT * FROM offer WHERE id = 1");
    const req = sql("SELECT * FROM req WHERE id = 1");
    const grant = sql("SELECT * FROM grant WHERE id = 1");
    const expired = offer && Date.now() - offer.created_at > WINDOW_MS;

    if (request.method === "POST" && tail === "init") {
      if (offer) return bad("exists", 409);
      this.ctx.storage.sql.exec(
        "INSERT INTO offer (id, created_at) VALUES (1, ?)", Date.now());
      // Self-destruct a minute after the window lapses — a lobby has no
      // other cleanup, so expired codes would otherwise persist forever.
      this.ctx.storage.setAlarm(Date.now() + WINDOW_MS + 60_000);
      return json({ ok: true });
    }

    if (!offer) return bad("not_found", 404);
    if (expired) return bad("expired", 410);

    // The new device claims the code with its public keys. First claim
    // wins — a second device typing the same code is told it is used.
    if (request.method === "POST" && tail === "claim") {
      if (req) return bad("taken", 409);
      const { device_id, sig_pub, dh_pub, label } = await request.json().catch(() => ({}));
      if (!device_id || !sig_pub || !dh_pub) return bad("bad_request");
      this.ctx.storage.sql.exec(
        `INSERT INTO req (id, device_id, sig_pub, dh_pub, label, created_at)
         VALUES (1, ?, ?, ?, ?, ?)`,
        device_id, sig_pub, dh_pub,
        typeof label === "string" ? label.slice(0, 40) : null, Date.now());
      return json({ ok: true });
    }

    if (request.method === "GET" && tail === "") {
      return json({
        status: grant ? (grant.refused ? "refused" : "granted") : req ? "claimed" : "open",
        ...(req ? { device_id: req.device_id, sig_pub: req.sig_pub,
          dh_pub: req.dh_pub, label: req.label } : {}),
        ...(grant ? { grant: {
          user_id: grant.user_id, eph: grant.eph, iv: grant.iv,
          wrapped: grant.wrapped, by_device: grant.by_device,
          ...(grant.refused ? { refused: grant.refused } : {}),
        } } : {}),
      });
    }

    // The offering device either grants (wrapped user key) or refuses
    // (e.g. the relay rejected a second device on a free user) — the
    // new device deserves an answer either way.
    if (request.method === "POST" && tail === "grant") {
      if (!req) return bad("not_claimed", 409);
      if (grant) return bad("already_granted", 409);
      const g = await request.json().catch(() => ({}));
      const refused = typeof g.refused === "string" && g.refused;
      if (!refused && (!g.user_id || !g.eph || !g.iv || !g.wrapped || !g.by_device)) {
        return bad("bad_request");
      }
      this.ctx.storage.sql.exec(
        `INSERT INTO grant (id, user_id, eph, iv, wrapped, by_device, refused, created_at)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
        g.user_id ?? "", g.eph ?? "", g.iv ?? "", g.wrapped ?? "",
        g.by_device ?? "", refused || null, Date.now());
      return json({ ok: true });
    }

    return bad("not_found", 404);
  }

  /** The window's cleanup: drop every row so the DO's storage is gone. */
  async alarm() {
    await this.ctx.storage.deleteAll();
  }
}
