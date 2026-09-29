import catalog from "../../data/catalog/catalog.json" with { type: "json" };
import phraseTable from "../../data/prediction/phrase_table.en.json" with { type: "json" };
import formTable from "../../data/prediction/form_table.en.json" with { type: "json" };
import feelingVoice from "../../data/catalog/feeling_voice.json" with { type: "json" };
import { UserRelay } from "./relay.js";
import { PairingLobby } from "./lobby.js";
import { SupporterAccounts } from "./accounts.js";
import { verifyAssertion } from "./webauthn.mjs";
import { handleResearch } from "./research.js";
import { handleSpeak } from "./voice.js";
import { handleTransform } from "./transform.js";
import { handleTile, handleTileAdmin, handleTileFlag, handleTileReplaced, TileLedger } from "./tile.js";
import {
  handleAllowance, handleDraw, handleFind, handleFindBatch,
  handlePictureImage, handlePicturesAdmin,
} from "./pictures.js";
import { licenseFor } from "./license.mjs";

export { UserRelay, PairingLobby, SupporterAccounts, TileLedger };

const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...(init.headers || {}) },
  });

// Passkeys register on the registrable domain so credentials survive host
// moves within pipaac.org (e.g. marketing root ↔ app.); localhost dev keeps
// the request host.
const rpIdFor = (hostname) =>
  hostname === "pipaac.org" || hostname.endsWith(".pipaac.org")
    ? "pipaac.org" : hostname;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";

    if (path === "/health") {
      return json({ ok: true, service: "pipaac" });
    }

    if (path === "/catalog.json") {
      return json(catalog);
    }

    // The children phrase table (smart bar v2): aggregate
    // phrase → next-item counts — counts only, never source text.
    if (path === "/phrase_table.en.json") {
      return json(phraseTable);
    }

    // Grammar help (021): phrase-context → form-feature counts —
    // counts on sense ids only, no text.
    if (path === "/form_table.en.json") {
      return json(formTable);
    }

    // Expressive voice (025 § 3): sense id -> feeling for the lit-face
    // suggestion. Ships inside catalog.json as feelingVoice once the
    // Ara rebuild lands; this route is the bridge until then.
    if (path === "/feeling_voice.json") {
      return json(feelingVoice);
    }

    // Whole-sentence voice (024 slice 1): shared R2 cache for Pip-word
    // sentences, per-license fair-use counting, no ids upstream.
    if (path === "/api/v1/voice/speak" && request.method === "POST") {
      return handleSpeak(request, env, ctx);
    }

    // Tile voice library (028): mint-once ElevenLabs clips behind the
    // TileLedger DO — hits are free, fresh mints are quota'd, the ledger
    // never learns who asked.
    if (path === "/api/v1/voice/tile" && request.method === "POST") {
      return handleTile(request, env, ctx);
    }
    if (path === "/api/v1/voice/tile/flag" && request.method === "POST") {
      return handleTileFlag(request, env);
    }
    if (path === "/api/v1/voice/tile/replaced" && request.method === "GET") {
      return handleTileReplaced(request, env, url);
    }
    if (path.startsWith("/admin/v1/tile-voice")) {
      return handleTileAdmin(request, env, url);
    }

    // Picture Finder (030): reuse-first matching over the pictures we
    // own — Vectorize + Workers AI; auto is computed server-side only.
    if (path === "/api/v1/pictures/find" && request.method === "POST") {
      return handleFind(request, env, ctx);
    }
    if (path === "/api/v1/pictures/find-batch" && request.method === "POST") {
      return handleFindBatch(request, env, ctx);
    }
    if (path === "/api/v1/pictures/draw" && request.method === "POST") {
      return handleDraw(request, env, ctx);
    }
    if (path === "/api/v1/pictures/allowance" && request.method === "GET") {
      return handleAllowance(request, env);
    }
    const picImgMatch = path.match(/^\/api\/v1\/pictures\/img\/([A-Za-z0-9_]+)$/);
    if (picImgMatch && request.method === "GET") {
      return handlePictureImage(request, env, picImgMatch[1]);
    }
    if (path.startsWith("/admin/v1/pictures")) {
      return handlePicturesAdmin(request, env, url);
    }

    // Dev only: localhost self-activates — mints the same pip-life token
    // the Devices paste flow would, so preview needs no license ritual.
    // Double-gated: ENVIRONMENT=development AND a loopback hostname.
    if (path === "/api/v1/voice/dev-license" && request.method === "POST") {
      const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      if (env.ENVIRONMENT !== "development" || !loopback || !env.PIP_LICENSE_SECRET) {
        return json({ error: "not_found" }, { status: 404 });
      }
      const body = await request.json().catch(() => null);
      const uid = typeof body?.user_id === "string" ? body.user_id : null;
      if (!uid || !/^[0-9a-f-]{36}$/i.test(uid)) {
        return json({ error: "bad_user_id" }, { status: 400 });
      }
      return json({ license: await licenseFor(env.PIP_LICENSE_SECRET, uid) });
    }

    // Transform buttons (023): the Groq key lives here — the client
    // sends the sentence with her names already masked to placeholders.
    if (path === "/api/v1/transform" && request.method === "POST") {
      return handleTransform(request, env);
    }

    // "Help improve Pip" intake (Stats_And_Progress § 6.3): whitelisted
    // daily totals only, keyed by a random research id.
    if (path === "/research") {
      return handleResearch(request, env);
    }

    // Sync relay (Sync_And_Web_Editing § 6): one Durable Object per user
    // orders ops and fans them out. The relay stores ciphertext only.
    if (path === "/users" && request.method === "POST" && env?.RELAY) {
      const body = await request.json().catch(() => null);
      if (!body?.device_id || !body?.pubkey) {
        return json({ error: "bad_request" }, { status: 400 });
      }
      // 015 slice 2: the client's registry id becomes the relay id, so
      // a user knows its own name before it links. A supplied id that
      // collides with an initialized user gets 409 from bootstrap —
      // the id is claimed, not hijackable.
      const userId = typeof body.user_id === "string"
        && /^[0-9a-f-]{36}$/i.test(body.user_id)
        ? body.user_id : crypto.randomUUID();
      const stub = env.RELAY.get(env.RELAY.idFromName(userId));
      const init = await stub.fetch(new Request(
        `https://relay/users/${userId}/bootstrap`,
        { method: "POST", body: JSON.stringify({
          device_id: body.device_id, pubkey: body.pubkey,
          dh_pub: body.dh_pub, recovery_proof: body.recovery_proof }) }));
      if (!init.ok) return init;
      return json({ user_id: userId });
    }
    const userMatch = env?.RELAY && path.match(/^\/users\/([^/]+)(\/.*)?$/);
    if (userMatch) {
      const stub = env.RELAY.get(env.RELAY.idFromName(userMatch[1]));
      return stub.fetch(request);
    }

    // Pairing lobby (§ 3): a short-lived code stands up a lobby; the new
    // device polls it; the linked device writes the wrapped-key grant.
    if (path === "/pair" && request.method === "POST" && env?.PAIR) {
      const body = await request.json().catch(() => null);
      if (!body?.device_id || !body?.sig_pub || !body?.dh_pub) {
        return json({ error: "bad_request" }, { status: 400 });
      }
      // 8-char code, unambiguous alphabet — the adult types this.
      const ABC = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
      const bytes = crypto.getRandomValues(new Uint8Array(8));
      const code = [...bytes].map((b) => ABC[b % ABC.length]).join("");
      const stub = env.PAIR.get(env.PAIR.idFromName(code));
      const init = await stub.fetch(new Request(`https://lobby/pair/${code}/init`, {
        method: "POST", body: JSON.stringify(body) }));
      if (!init.ok) return init;
      return json({ pair: code });
    }
    const pairMatch = env?.PAIR && path.match(/^\/pair\/([A-Z0-9]{8})(\/.*)?$/);
    if (pairMatch) {
      const stub = env.PAIR.get(env.PAIR.idFromName(pairMatch[1]));
      return stub.fetch(request);
    }

    /* --- Supporter accounts (Sync § 12.3, 015 slice 4) ---
     * Email + passkey sign-in. The relay stores sealed keys only: the
     * account private key arrives sealed under the passkey's PRF output,
     * user keys arrive wrapped to the account public key. */
    const acctDir = () =>
      env.ACCOUNTS.get(env.ACCOUNTS.idFromName("dir"));
    const acctStub = (id) =>
      env.ACCOUNTS.get(env.ACCOUNTS.idFromName(`acct:${id}`));

    if (path === "/accounts/link" && request.method === "POST" && env?.ACCOUNTS) {
      const body = await request.json().catch(() => null);
      const email = String(body?.email ?? "").trim().toLowerCase();
      if (!email.includes("@")) return json({ error: "bad_email" }, { status: 400 });
      const r = await acctDir().fetch(new Request(
        `https://accounts/dir/link?origin=${encodeURIComponent(url.origin)}`,
        { method: "POST", body: JSON.stringify({ email }) }));
      if (!r.ok) return r;
      const { link } = await r.json();
      // Cloudflare Email Service when bound (needs a verified sender);
      // wrangler dev has none — the DO's dev mailbox holds the link and
      // GET /accounts/dev/mailbox returns it in development only.
      let sent = false;
      if (env?.EMAIL) {
        try {
          const { EmailMessage } = await import("cloudflare:email");
          const raw = [
            `From: Pip <accounts@pipaac.org>`,
            `To: ${email}`,
            `Subject: Your Pip sign-in link`,
            `Content-Type: text/plain; charset=utf-8`,
            ``,
            `Open this link on the device you want to sign in:`,
            link,
            ``,
            `It works once and expires in 15 minutes.`,
          ].join("\r\n");
          await env.EMAIL.send(new EmailMessage("accounts@pipaac.org", email, raw));
          sent = true;
        } catch { sent = false; }
      }
      return json({ ok: true, sent,
        ...(env.ENVIRONMENT === "development" ? { dev_link: link } : {}) });
    }

    if (path === "/accounts/dev/mailbox" && request.method === "GET" && env?.ACCOUNTS) {
      if (env.ENVIRONMENT !== "development") return json({ error: "not_found" }, { status: 404 });
      const email = url.searchParams.get("email") ?? "";
      return acctDir().fetch(new Request(
        `https://accounts/dir/mailbox?email=${encodeURIComponent(email)}`));
    }

    if (path === "/accounts/claim" && request.method === "POST" && env?.ACCOUNTS) {
      const body = await request.json().catch(() => null);
      const claim = await acctDir().fetch(new Request(
        "https://accounts/dir/claim", { method: "POST", body: JSON.stringify(body) }));
      if (!claim.ok) return claim;
      const { acct_id, challenge, email } = await claim.json();
      const state = await (await acctStub(acct_id).fetch(
        new Request("https://accounts/acct/state"))).json();
      return json({ ok: true, account_id: acct_id, challenge,
        has_credentials: state.has_credentials, email });
    }

    /* --- supporter invites (015 slice 5) ---
     * P creates an invite for S's email → the emailed link opens into a
     * normal sign-in → S claims → the invite waits for P's Allow → P's
     * device grants wrapped keys → S reads them at status. */
    const inviteMatch = env?.ACCOUNTS && path.match(/^\/accounts\/invites\/([A-Za-z0-9_-]+)$/);
    if (inviteMatch && request.method === "POST") {
      const token = inviteMatch[1];
      const body = await request.json().catch(() => null);
      const dirPost = (p, b) => acctDir().fetch(new Request(
        `https://accounts/dir/invite${p}`, { method: "POST", body: JSON.stringify(b) }));
      if (body?.action === "open") {
        return dirPost("/open", { token });
      }
      if (body?.action === "claim") {
        const r = await dirPost("/claim", { token, session: body?.session });
        if (!r.ok) return r;
        const { to_acct } = await r.json();
        const state = await (await acctStub(to_acct).fetch(
          new Request("https://accounts/acct/state"))).json();
        if (state.acct_pub) {
          await dirPost("/bind", { token, to_acct_pub: state.acct_pub });
        }
        return json({ ok: true, status: "pending_allow", to_acct });
      }
      if (body?.action === "grant" || body?.action === "decline"
        || body?.action === "revoke") {
        return dirPost(`/${body.action}`, { token, ...body });
      }
      return json({ error: "bad_action" }, { status: 400 });
    }
    if (inviteMatch && request.method === "GET") {
      const token = inviteMatch[1];
      const session = url.searchParams.get("session") ?? "";
      return acctDir().fetch(new Request(
        "https://accounts/dir/invite/status", { method: "POST",
          body: JSON.stringify({ token, session }) }));
    }

    // Account deletion (015 slice 7, DECIDED 2026-09-23): a supporter
    // is only a supporter — deleting the account removes ITS access on
    // every user's relay, then the account itself. The cascade runs
    // first; a failed leg aborts the delete rather than stranding
    // access for a dead account.
    const acctDel = env?.ACCOUNTS
      && path.match(/^\/accounts\/(acct_[0-9a-f]+)$/);
    if (acctDel && request.method === "DELETE") {
      const acctId = acctDel[1];
      const session = url.searchParams.get("session") ?? "";
      const chk = await acctDir().fetch(new Request(
        "https://accounts/dir/session/check", { method: "POST",
          body: JSON.stringify({ session, acct_id: acctId }) }));
      if (!chk.ok) return chk;
      const internal = env.PIP_INTERNAL_SECRET ?? env.PIP_LICENSE_SECRET;
      const { user_ids } = await (await acctStub(acctId).fetch(
        new Request("https://accounts/acct/users/list"))).json();
      if (env?.RELAY && internal) {
        for (const uid of user_ids ?? []) {
          const r = await env.RELAY.get(env.RELAY.idFromName(uid)).fetch(
            new Request(`https://relay/users/${uid}/internal/remove_supporter`, {
              method: "POST",
              headers: { "x-pip-internal": internal },
              body: JSON.stringify({ acct_id: acctId }),
            }));
          if (!r.ok) return json({ error: "cascade_failed" }, { status: 502 });
        }
      }
      await acctStub(acctId).fetch(new Request(
        "https://accounts/acct/destroy", { method: "POST" }));
      await acctDir().fetch(new Request(
        "https://accounts/dir/acct/deleted", { method: "POST",
          body: JSON.stringify({ acct_id: acctId }) }));
      return json({ ok: true });
    }

    const acctMatch = env?.ACCOUNTS && path.match(/^\/accounts\/(acct_[0-9a-f]+)\/([a-z]+)$/);
    if (acctMatch) {
      const [, acctId, op] = acctMatch;
      // Sign-in pre-flight: credential ids + the account PRF salt are
      // the inputs navigator.credentials.get needs. Ids are not secrets.
      if (op === "credentials" && request.method === "GET") {
        return acctStub(acctId).fetch(new Request("https://accounts/acct/credentials"));
      }
      if (op === "state" && request.method === "GET") {
        return acctStub(acctId).fetch(new Request("https://accounts/acct/state"));
      }
      const body = await request.json().catch(() => null);
      if (op === "register") {
        const chk = await acctDir().fetch(new Request(
          "https://accounts/dir/challenge/check", { method: "POST",
            body: JSON.stringify({ nonce: body?.challenge, acct_id: acctId }) }));
        if (!chk.ok) return chk;
        // Registering (or adding a credential below) needs the challenge
        // a claimed email link minted — a self-minted nonce proves
        // nothing about who controls the address.
        if (!(await chk.json()).auth) {
          return json({ error: "link_required" }, { status: 403 });
        }
        const reg = await acctStub(acctId).fetch(new Request(
          "https://accounts/acct/register", { method: "POST",
            body: JSON.stringify({ ...body, acct_id: acctId }) }));
        if (!reg.ok) return reg;
        const sess = await acctDir().fetch(new Request(
          "https://accounts/dir/session", { method: "POST",
            body: JSON.stringify({ acct_id: acctId }) }));
        return json({ ok: true, session: (await sess.json()).session });
      }
      if (op === "challenge") {
        return acctDir().fetch(new Request(
          "https://accounts/dir/challenge", { method: "POST",
            body: JSON.stringify({ acct_id: acctId }) }));
      }
      if (op === "credential") {
        // Adding a passkey to an existing account: the claimed email
        // link is the authorization — never rewrites acct_pub, the
        // sealed private key, or the PRF salt.
        const chk = await acctDir().fetch(new Request(
          "https://accounts/dir/challenge/check", { method: "POST",
            body: JSON.stringify({ nonce: body?.challenge, acct_id: acctId }) }));
        if (!chk.ok) return chk;
        if (!(await chk.json()).auth) {
          return json({ error: "link_required" }, { status: 403 });
        }
        return acctStub(acctId).fetch(new Request(
          "https://accounts/acct/credential", { method: "POST", body: JSON.stringify(body) }));
      }
      if (op === "assert") {
        const chk = await acctDir().fetch(new Request(
          "https://accounts/dir/challenge/check", { method: "POST",
            body: JSON.stringify({ nonce: body?.challenge, acct_id: acctId }) }));
        if (!chk.ok) return chk;
        const cred = await acctStub(acctId).fetch(new Request(
          `https://accounts/acct/credential?id=${encodeURIComponent(body?.credential_id ?? "")}`));
        if (!cred.ok) return cred;
        try {
          await verifyAssertion(await cred.json(), body, {
            challenge: body.challenge,
            rpId: rpIdFor(url.hostname),
            origins: [url.origin],
          });
        } catch (e) {
          return json({ error: "assertion_failed", detail: String(e.message ?? e) },
            { status: 403 });
        }
        const bundle = await (await acctStub(acctId).fetch(
          new Request("https://accounts/acct/bundle"))).json();
        const sess = await acctDir().fetch(new Request(
          "https://accounts/dir/session", { method: "POST",
            body: JSON.stringify({ acct_id: acctId }) }));
        return json({ ok: true, session: (await sess.json()).session, ...bundle });
      }
      if (op === "users") {
        const chk = await acctDir().fetch(new Request(
          "https://accounts/dir/session/check", { method: "POST",
            body: JSON.stringify({ session: body?.session, acct_id: acctId }) }));
        if (!chk.ok) return chk;
        return acctStub(acctId).fetch(new Request(
          "https://accounts/acct/users", { method: "POST", body: JSON.stringify(body) }));
      }
      if (op === "invites") {
        if (request.method === "POST") {
          const chk = await acctDir().fetch(new Request(
            "https://accounts/dir/session/check", { method: "POST",
              body: JSON.stringify({ session: body?.session, acct_id: acctId }) }));
          if (!chk.ok) return chk;
          const r = await acctDir().fetch(new Request(
            `https://accounts/dir/invite?origin=${encodeURIComponent(url.origin)}`,
            { method: "POST", body: JSON.stringify(body) }));
          if (!r.ok) return r;
          const { link } = await r.json();
          let sent = false;
          if (env?.EMAIL && body?.email) {
            try {
              const { EmailMessage } = await import("cloudflare:email");
              const raw = [
                `From: Pip <accounts@pipaac.org>`,
                `To: ${body.email}`,
                `Subject: You've been invited to support a Pip user`,
                `Content-Type: text/plain; charset=utf-8`,
                ``,
                `Open this link to accept:`,
                link,
                ``,
                `The family approves the share on their device before anything syncs.`,
              ].join("\r\n");
              await env.EMAIL.send(new EmailMessage("accounts@pipaac.org", body.email, raw));
              sent = true;
            } catch { sent = false; }
          }
          return json({ ok: true, sent,
            ...(env.ENVIRONMENT === "development" ? { dev_link: link } : {}) });
        }
        if (request.method === "GET") {
          const session = url.searchParams.get("session") ?? "";
          const chk = await acctDir().fetch(new Request(
            "https://accounts/dir/session/check", { method: "POST",
              body: JSON.stringify({ session, acct_id: acctId }) }));
          if (!chk.ok) return chk;
          return acctDir().fetch(new Request(
            "https://accounts/dir/invites", { method: "POST",
              body: JSON.stringify({ session }) }));
        }
      }
      return json({ error: "not_found" }, { status: 404 });
    }

    // Static shell. COOP/COEP make the page cross-origin isolated so the
    // SQLite WASM OPFS database can persist on-device.
    if (!env?.ASSETS) {
      return json({ error: "not_found", path }, { status: 404 });
    }
    const res = await env.ASSETS.fetch(request);
    const headers = new Headers(res.headers);
    headers.set("Cross-Origin-Opener-Policy", "same-origin");
    headers.set("Cross-Origin-Embedder-Policy", "require-corp");
    headers.set("Cross-Origin-Resource-Policy", "same-origin");
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  },
};
