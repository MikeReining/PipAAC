/**
 * PairingLobby — one Durable Object per pairing code (§ 3 pairing).
 *
 * The new device posts its public keys under a short-lived 8-char code.
 * The linked device reads them (scan or type the code), and on Allow
 * writes the grant: the board key wrapped to the new device's dh key.
 * The new device polls until granted or the window (10 min) lapses.
 *
 * The lobby is blind like the relay: it holds public keys and wrapped
 * ciphertext. The grant cannot be verified here (the board's device list
 * lives in the board's DO) — a forged grant just fails to unwrap on the
 * new device. Grants are write-once; first one wins.
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
        CREATE TABLE IF NOT EXISTS req (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          device_id TEXT NOT NULL,
          sig_pub TEXT NOT NULL,
          dh_pub TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS grant (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          board_id TEXT NOT NULL,
          eph TEXT NOT NULL,
          iv TEXT NOT NULL,
          wrapped TEXT NOT NULL,
          by_device TEXT NOT NULL,
          refused TEXT,
          created_at INTEGER NOT NULL
        );
      `);
      try { ctx.storage.sql.exec("ALTER TABLE grant ADD COLUMN refused TEXT"); } catch { /* there */ }
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    const tail = url.pathname.split("/").slice(3).join("/"); // after /pair/:code
    const req = this.ctx.storage.sql.exec("SELECT * FROM req WHERE id = 1").toArray()[0];
    const grant = this.ctx.storage.sql.exec("SELECT * FROM grant WHERE id = 1").toArray()[0];
    const expired = req && Date.now() - req.created_at > WINDOW_MS;

    if (request.method === "POST" && tail === "init") {
      if (req) return bad("exists", 409);
      const { device_id, sig_pub, dh_pub } = await request.json().catch(() => ({}));
      if (!device_id || !sig_pub || !dh_pub) return bad("bad_request");
      this.ctx.storage.sql.exec(
        "INSERT INTO req (id, device_id, sig_pub, dh_pub, created_at) VALUES (1, ?, ?, ?, ?)",
        device_id, sig_pub, dh_pub, Date.now());
      return json({ ok: true });
    }

    if (request.method === "GET" && tail === "") {
      if (!req) return bad("not_found", 404);
      if (expired) return bad("expired", 410);
      return json({
        status: grant ? (grant.refused ? "refused" : "granted") : "pending",
        device_id: req.device_id, sig_pub: req.sig_pub, dh_pub: req.dh_pub,
        ...(grant ? { grant: {
          board_id: grant.board_id, eph: grant.eph, iv: grant.iv,
          wrapped: grant.wrapped, by_device: grant.by_device,
          ...(grant.refused ? { refused: grant.refused } : {}),
        } } : {}),
      });
    }

    // The linked device either grants (wrapped board key) or refuses
    // (e.g. the relay rejected a second device on a free board) — the
    // new device deserves an answer either way.
    if (request.method === "POST" && tail === "grant") {
      if (!req) return bad("not_found", 404);
      if (expired) return bad("expired", 410);
      if (grant) return bad("already_granted", 409);
      const g = await request.json().catch(() => ({}));
      const refused = typeof g.refused === "string" && g.refused;
      if (!refused && (!g.board_id || !g.eph || !g.iv || !g.wrapped || !g.by_device)) {
        return bad("bad_request");
      }
      this.ctx.storage.sql.exec(
        `INSERT INTO grant (id, board_id, eph, iv, wrapped, by_device, refused, created_at)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
        g.board_id ?? "", g.eph ?? "", g.iv ?? "", g.wrapped ?? "",
        g.by_device ?? "", refused || null, Date.now());
      return json({ ok: true });
    }

    return bad("not_found", 404);
  }
}
