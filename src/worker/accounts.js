/**
 * SupporterAccounts — supporter sign-in (Sync § 12.3, 015 slice 4).
 *
 * Two object shapes, one class:
 *   idFromName("dir")       — the directory: email → account, magic-link
 *                             tokens, sign-in challenges, sessions, and
 *                             the dev mailbox.
 *   idFromName("acct:<id>") — one account: passkey credentials, the
 *                             account public key, the sealed account
 *                             private key, and the wrapped user keys.
 *
 * The relay never sees a name, photo, user key, or account private key
 * in the clear — user records carry wrapped keys and a sealed profile
 * only; the account private key arrives already sealed under the
 * passkey's PRF output on the device.
 *
 * Plain class (not extends DurableObject) so Node tests can import the
 * worker graph without cloudflare:workers.
 */
import { b64u, unb64u } from "./webauthn.mjs";

const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...(init.headers || {}) },
  });
const bad = (error, status = 400) => json({ error }, { status });

const LINK_TTL_MS = 15 * 60 * 1000;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const rand = (n = 18) => b64u(crypto.getRandomValues(new Uint8Array(n)));
const sha = async (s) =>
  b64u(new Uint8Array(await crypto.subtle.digest("SHA-256",
    new TextEncoder().encode(s))));
const normEmail = (e) => String(e ?? "").trim().toLowerCase();

export class SupporterAccounts {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS acct_map (
          email TEXT PRIMARY KEY,
          acct_id TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS token (
          hash TEXT PRIMARY KEY,
          acct_id TEXT NOT NULL,
          exp INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS challenge (
          nonce TEXT PRIMARY KEY,
          acct_id TEXT NOT NULL,
          exp INTEGER NOT NULL,
          auth INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS session (
          hash TEXT PRIMARY KEY,
          acct_id TEXT NOT NULL,
          exp INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS mailbox (
          email TEXT PRIMARY KEY,
          link TEXT NOT NULL,
          sent_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS acct (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          acct_pub TEXT,
          sealed_priv TEXT,
          prf_salt TEXT
        );
        CREATE TABLE IF NOT EXISTS credential (
          id TEXT PRIMARY KEY,
          jwk TEXT NOT NULL,
          added_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS acct_user (
          user_id TEXT PRIMARY KEY,
          keys TEXT NOT NULL,
          sealed_profile TEXT,
          join_tokens TEXT,
          added_at INTEGER NOT NULL
        );
      `);
      // Existing dev objects predate the auth flag — add it if absent.
      for (const alter of [
        "ALTER TABLE challenge ADD COLUMN auth INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE acct_user ADD COLUMN join_tokens TEXT",
      ]) {
        try { ctx.storage.sql.exec(alter); } catch { /* already there */ }
      }
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "");
    const body = request.method === "POST"
      ? await request.json().catch(() => null) : null;
    const sql = this.ctx.storage.sql;
    const now = Date.now();
    const one = (q, ...p) => sql.exec(q, ...p).toArray()[0] ?? null;

    /* --- the directory --- */

    if (path === "/dir/link" && request.method === "POST") {
      const email = normEmail(body?.email);
      if (!email || !email.includes("@")) return bad("bad_email");
      const row = one("SELECT acct_id FROM acct_map WHERE email = ?", email);
      const acctId = row?.acct_id ?? `acct_${crypto.randomUUID().replaceAll("-", "")}`;
      if (!row) {
        sql.exec("INSERT INTO acct_map (email, acct_id, created_at) VALUES (?, ?, ?)",
          email, acctId, now);
      }
      const token = rand();
      sql.exec("INSERT INTO token (hash, acct_id, exp) VALUES (?, ?, ?)",
        await sha(token), acctId, now + LINK_TTL_MS);
      const link = `${url.searchParams.get("origin") ?? ""}/?signin=${encodeURIComponent(token)}`;
      // Dev mailbox is the honest local send path — wrangler dev has no
      // verified Email Service destination, so dev keeps the last link
      // here and the probe reads it (see GET /accounts/dev/mailbox).
      sql.exec("INSERT OR REPLACE INTO mailbox (email, link, sent_at) VALUES (?, ?, ?)",
        email, link, now);
      return json({ ok: true, acct_id: acctId, email, link });
    }

    if (path === "/dir/claim" && request.method === "POST") {
      const t = one("SELECT acct_id, exp FROM token WHERE hash = ?",
        await sha(String(body?.token ?? "")));
      if (!t || t.exp < now) return bad("link_expired", 403);
      sql.exec("DELETE FROM token WHERE hash = ?", await sha(String(body.token)));
      // The claimed link's challenge is the authorization for register
      // and credential-add — a self-minted /dir/challenge nonce is not.
      const nonce = rand();
      sql.exec("INSERT INTO challenge (nonce, acct_id, exp, auth) VALUES (?, ?, ?, 1)",
        nonce, t.acct_id, now + CHALLENGE_TTL_MS);
      const acct = one("SELECT email FROM acct_map WHERE acct_id = ?", t.acct_id);
      return json({ ok: true, acct_id: t.acct_id, challenge: nonce,
        email: acct?.email ?? null });
    }

    if (path === "/dir/challenge" && request.method === "POST") {
      const acctId = String(body?.acct_id ?? "");
      const nonce = rand();
      sql.exec("INSERT INTO challenge (nonce, acct_id, exp) VALUES (?, ?, ?)",
        nonce, acctId, now + CHALLENGE_TTL_MS);
      return json({ ok: true, challenge: nonce });
    }

    if (path === "/dir/challenge/check" && request.method === "POST") {
      const c = one("SELECT acct_id, exp, auth FROM challenge WHERE nonce = ?",
        String(body?.nonce ?? ""));
      if (!c || c.exp < now || c.acct_id !== String(body?.acct_id ?? "")) {
        return bad("bad_challenge", 403);
      }
      sql.exec("DELETE FROM challenge WHERE nonce = ?", String(body.nonce));
      return json({ ok: true, auth: !!c.auth });
    }

    if (path === "/dir/session" && request.method === "POST") {
      const s = rand();
      sql.exec("INSERT INTO session (hash, acct_id, exp) VALUES (?, ?, ?)",
        await sha(s), String(body?.acct_id ?? ""), now + SESSION_TTL_MS);
      return json({ ok: true, session: s });
    }

    if (path === "/dir/session/check" && request.method === "POST") {
      const s = one("SELECT acct_id, exp FROM session WHERE hash = ?",
        await sha(String(body?.session ?? "")));
      if (!s || s.exp < now || s.acct_id !== String(body?.acct_id ?? "")) {
        return bad("bad_session", 403);
      }
      return json({ ok: true });
    }

    if (path === "/dir/mailbox" && request.method === "GET") {
      const m = one("SELECT link, sent_at FROM mailbox WHERE email = ?",
        normEmail(url.searchParams.get("email")));
      if (!m) return bad("no_mail", 404);
      return json(m);
    }

    /* --- one account --- */

    if (path === "/acct/state" && request.method === "GET") {
      const creds = sql.exec("SELECT id FROM credential").toArray();
      const a = one("SELECT email, acct_pub FROM acct LIMIT 1");
      return json({ has_credentials: creds.length > 0, email: a?.email ?? null,
        acct_pub: a?.acct_pub ?? null });
    }

    if (path === "/acct/register" && request.method === "POST") {
      if (!body?.email || !body?.credential_id || !body?.jwk || !body?.acct_pub || !body?.prf_salt) {
        return bad("bad_request");
      }
      // An account registers once — the credential-add flow covers
      // further passkeys; re-registering must never overwrite the
      // account's public key or sealed private key.
      if (one("SELECT id FROM acct LIMIT 1")) {
        return bad("already_registered", 409);
      }
      sql.exec(
        "INSERT INTO acct (id, email, acct_pub, sealed_priv, prf_salt) VALUES (?, ?, ?, ?, ?)",
        body.acct_id, normEmail(body.email), body.acct_pub,
        JSON.stringify(body.sealed_priv), body.prf_salt ?? null);
      sql.exec(
        "INSERT OR REPLACE INTO credential (id, jwk, added_at) VALUES (?, ?, ?)",
        body.credential_id, JSON.stringify(body.jwk), now);
      return json({ ok: true });
    }

    // Sign-in's pre-flight: credential ids and the account PRF salt are
    // what navigator.credentials.get needs — ids are not secrets.
    if (path === "/acct/credentials" && request.method === "GET") {
      const a = one("SELECT prf_salt FROM acct LIMIT 1");
      const ids = sql.exec("SELECT id FROM credential").toArray().map((r) => r.id);
      return json({ credential_ids: ids, prf_salt: a?.prf_salt ?? null });
    }

    if (path === "/acct/credential" && request.method === "GET") {
      const c = one("SELECT jwk FROM credential WHERE id = ?",
        url.searchParams.get("id") ?? "");
      if (!c) return bad("unknown_credential", 404);
      return json({ jwk: JSON.parse(c.jwk) });
    }

    if (path === "/acct/credential" && request.method === "POST") {
      if (!body?.credential_id || !body?.jwk) return bad("bad_request");
      sql.exec(
        "INSERT OR REPLACE INTO credential (id, jwk, added_at) VALUES (?, ?, ?)",
        body.credential_id, JSON.stringify(body.jwk), now);
      return json({ ok: true });
    }

    if (path === "/acct/users" && request.method === "POST") {
      if (!body?.user_id || !Array.isArray(body?.keys)) return bad("bad_request");
      sql.exec(
        "INSERT OR REPLACE INTO acct_user (user_id, keys, sealed_profile, join_tokens, added_at) VALUES (?, ?, ?, ?, ?)",
        body.user_id, JSON.stringify(body.keys),
        body.sealed_profile ? JSON.stringify(body.sealed_profile) : null,
        Array.isArray(body.join_tokens) ? JSON.stringify(body.join_tokens) : null,
        now);
      return json({ ok: true });
    }

    if (path === "/acct/bundle" && request.method === "GET") {
      const a = one("SELECT sealed_priv FROM acct LIMIT 1");
      const users = sql.exec("SELECT user_id, keys, sealed_profile, join_tokens FROM acct_user")
        .toArray()
        .map((r) => ({ user_id: r.user_id, keys: JSON.parse(r.keys),
          sealed_profile: r.sealed_profile ? JSON.parse(r.sealed_profile) : null,
          join_tokens: r.join_tokens ? JSON.parse(r.join_tokens) : [] }));
      const creds = sql.exec("SELECT id FROM credential").toArray();
      return json({ sealed_priv: a?.sealed_priv ? JSON.parse(a.sealed_priv) : null,
        users, credentials: creds });
    }

    return bad("not_found", 404);
  }
}
