/**
 * 028 — tile voice library: POST /api/v1/voice/tile (+ /flag, /replaced)
 * and the founder-only /admin/v1/tile-voice/* routes.
 *
 * Mint once, serve forever: every word a supporter adds synthesizes
 * exactly once per (voice_key, locale, profile, normalized text), lands
 * in R2 under tile/<voice_key>/<id>.mp3, and replays from the ledger.
 * The TileLedger Durable Object claims mints atomically — two devices
 * asking for the same word in the same second make one vendor call.
 *
 * Dev safety (§ slice 1): without TILE_SYNTH (tests) or TILE_LIVE=1 +
 * ELEVENLABS_API_KEY (real dev minting), mints return a short silent
 * mp3 with x-tile-cache: stub — a dev server never spends money.
 */
import tileVoices from "../../data/catalog/tile_voices.json" with { type: "json" };
import { usageCheck, usageRecord } from "./voice.js";
import { normalizeV1 } from "../../public/shared/normalize.mjs";
import {
  TILE_PROFILE,
  TILE_TEXT_ALLOW_RE,
  TILE_TEXT_MAX,
  formatElevenV4IpaLine,
  ipaOverrideForSoundEffectLabel,
  normalizeIpaField,
  tileMintText,
} from "../shared/tile_recipe.mjs";
import * as ledger from "./tile_ledger.mjs";
import * as pictureLedger from "./picture_ledger.mjs";
import * as trial from "./trial.mjs";

const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...(init.headers || {}) },
  });

const VOICES = new Map(tileVoices.voices.map((v) => [v.voice_key, v]));

// § 13 config — per-license caps (the global cap is TILE_DAY_MINTS, a var).
const LICENSE_DAY_MINTS = 100;
const LICENSE_MIN_MINTS = 20;
const FLAG_DAY_LIMIT = 50;
const FLAG_MIN_LIMIT = 10;

/** ~0.3 s of digital silence — the dev stub clip (ffmpeg anullsrc,
 *  24 kbps mono). Real mints need TILE_LIVE=1 + ELEVENLABS_API_KEY. */
const SILENT_MP3_B64 =
  "//MwxAAAAANIAAAAAExBTUVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//MyxEEAAANIAAAAAFVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zMMSDAAADSAAAAABVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zMsS9AAADSAAAAABVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/8zDEvgAAA0gAAAAAVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/8zDEvgAAA0gAAAAAVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/8zLEvQAAA0gAAAAAVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//MwxL4AAANIAAAAAFVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//MwxL4AAANIAAAAAFVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//MyxL0AAANIAAAAAFVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zMMS+AAADSAAAAABVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zMsS9AAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/8zDEvgAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/8zDEvgAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=";
const SILENT_MP3 = Uint8Array.from(atob(SILENT_MP3_B64), (c) => c.charCodeAt(0));

/** ElevenLabs v4 — text + voice only; no user, device, or license id
 *  ever leaves this Worker (028 § 8, same rule as 024 rule 8). */
async function synthesizeElevenLabs(env, mintText, voice) {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voice.voice_id}`, {
      method: "POST",
      headers: {
        "xi-api-key": env.ELEVENLABS_API_KEY,
        "content-type": "application/json",
        accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: mintText,
        model_id: voice.model,
        voice_settings: voice.voice_settings,
      }),
    });
  if (!res.ok) throw new Error(`elevenlabs_${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** 028 § 6 — auto-hints recorded on the row, shown in review, never gate. */
function mintChecks(bytes, text) {
  const durationMs = Math.round((bytes * 8) / 128); // 128 kbps mp3
  return {
    duration_ms: durationMs,
    duration_ok: durationMs >= 150 && durationMs <= 500 + 120 * text.length,
    silence_ok: bytes >= 512,
  };
}

const audioResponse = (bytes, { cache, version }) =>
  new Response(bytes, {
    status: 200,
    headers: {
      "content-type": "audio/mpeg",
      "x-tile-cache": cache,
      "x-tile-version": String(version),
    },
  });

/** Materialize a shared mint payload — every single-flight waiter gets
 *  its own Response (a stream body serves one reader only). */
const payloadResponse = (p) => p.kind === "audio"
  ? audioResponse(p.bytes, { cache: p.cache, version: p.version })
  : json(p.data, { status: p.status });

const tileStub = (env) =>
  env.TILE_LEDGER.get(env.TILE_LEDGER.idFromName("ledger"));

const okUuid = (s) => typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);

/* ------------------------------- routes -------------------------------- */

/** POST /api/v1/voice/tile — mint-once tile audio (028 § 4.6). */
export async function handleTile(request, env, ctx) {
  const body = await request.json().catch(() => null);
  const uid = typeof body?.user_id === "string" ? body.user_id : null;
  if (!okUuid(uid)) return json({ error: "bad_user_id" }, { status: 400 });
  if (!(await trial.entitled(env, uid, body?.license))) {
    return json({ error: "bad_license" }, { status: 403 });
  }
  if (!env.VOICE || !env.TILE_LEDGER) {
    return json({ error: "voice_unavailable" }, { status: 503 });
  }
  const voice = typeof body?.voice === "string" ? VOICES.get(body.voice) : null;
  if (!voice || voice.status !== "active") {
    return json({ error: "bad_voice" }, { status: 400 });
  }
  const text = normalizeV1(typeof body?.text === "string" ? body.text : "");
  if (!text || text.length > TILE_TEXT_MAX) {
    return json({ error: "bad_text" }, { status: 400 });
  }
  const locale = typeof body?.locale === "string" ? body.locale : "";
  const stub = tileStub(env);

  // § 4.2/4.3 — held words are recorded (demand signal for v2), never minted.
  const held = !TILE_TEXT_ALLOW_RE.test(text) ? "chars"
    : !voice.locales.includes(locale) ? "locale"
    : null;
  if (held) {
    await stub.fetch(new Request("https://tile/held", {
      method: "POST",
      body: JSON.stringify({ locale, text, reason: held }),
    }));
    return json({ error: "held", held }, { status: 422 });
  }

  const source = body?.source == null ? "user_typed"
    : ledger.CLIENT_SOURCES.has(body.source) ? body.source : null;
  if (source === null) return json({ error: "bad_source" }, { status: 400 });

  const id = await ledger.tileClipId(voice.voice_key, locale, text);
  const peek = await (await stub.fetch(new Request("https://tile/peek", {
    method: "POST", body: JSON.stringify({ id }),
  }))).json();

  // § 4.7 — only a fresh mint counts; hits are free and uncounted.
  if (peek.disposition === "mint") {
    const gate = await usageCheck(env, {
      ns: "usage-tile", uid, chars: 1, maxChars: 1,
      dayBudget: LICENSE_DAY_MINTS, minBudget: LICENSE_MIN_MINTS,
    });
    if (!gate.allowed) {
      await usageRecord(env, { ns: "usage-tile", uid, chars: 0, over: gate.over });
      return json({ error: "fair_use", over: gate.over }, { status: 429 });
    }
  }

  const res = await stub.fetch(new Request("https://tile/clip", {
    method: "POST",
    body: JSON.stringify({
      id, voice_key: voice.voice_key, locale, text, source,
    }),
  }));
  if (res.ok && res.headers.get("x-tile-billed") === "1") {
    const after = usageRecord(env, { ns: "usage-tile", uid, chars: 1 });
    if (ctx?.waitUntil) ctx.waitUntil(after); else await after;
  }
  return res;
}

/** POST /api/v1/voice/tile/flag — "Sounds wrong" (§ 5.5). A review
 *  signal, never a takedown; the tile keeps playing. */
export async function handleTileFlag(request, env) {
  const body = await request.json().catch(() => null);
  const uid = typeof body?.user_id === "string" ? body.user_id : null;
  if (!okUuid(uid)) return json({ error: "bad_user_id" }, { status: 400 });
  if (!(await trial.entitled(env, uid, body?.license))) {
    return json({ error: "bad_license" }, { status: 403 });
  }
  if (!env.VOICE || !env.TILE_LEDGER) {
    return json({ error: "voice_unavailable" }, { status: 503 });
  }
  const text = normalizeV1(typeof body?.text === "string" ? body.text : "");
  if (!text || text.length > TILE_TEXT_MAX) {
    return json({ error: "bad_text" }, { status: 400 });
  }
  const gate = await usageCheck(env, {
    ns: "usage-tileflag", uid, chars: 1, maxChars: 1,
    dayBudget: FLAG_DAY_LIMIT, minBudget: FLAG_MIN_LIMIT,
  });
  if (!gate.allowed) {
    await usageRecord(env, { ns: "usage-tileflag", uid, chars: 0, over: gate.over });
    return json({ error: "fair_use", over: gate.over }, { status: 429 });
  }
  const locale = typeof body?.locale === "string" ? body.locale : "";
  const id = await ledger.tileClipId(String(body?.voice ?? ""), locale, text);
  await tileStub(env).fetch(new Request("https://tile/flag", {
    method: "POST", body: JSON.stringify({ id }),
  }));
  await usageRecord(env, { ns: "usage-tileflag", uid, chars: 1 });
  return new Response(null, { status: 204 });
}

/** GET /api/v1/voice/tile/replaced?since=<ms>&voice=<key> — daily client
 *  sweep: text hashes of clips replaced or withheld since `since`, so
 *  devices evict rejected audio (§ 5.3). License rides in headers. */
export async function handleTileReplaced(request, env, url) {
  const uid = request.headers.get("x-pip-user");
  if (!okUuid(uid)) return json({ error: "bad_user_id" }, { status: 400 });
  if (!(await trial.entitled(env, uid, request.headers.get("x-pip-license")))) {
    return json({ error: "bad_license" }, { status: 403 });
  }
  if (!env.TILE_LEDGER) return json({ error: "voice_unavailable" }, { status: 503 });
  const since = Number(url.searchParams.get("since") ?? 0) || 0;
  const voice = url.searchParams.get("voice") ?? "";
  const res = await tileStub(env).fetch(new Request(
    `https://tile/replaced?since=${since}&voice=${encodeURIComponent(voice)}`));
  if (!res.ok) return res;
  const { texts } = await res.json();
  const ids = [];
  for (const t of texts ?? []) ids.push(await ledger.tileTextHash(normalizeV1(t)));
  return json({ ids, next: Date.now() });
}

/* ---------------------------- admin routes ----------------------------- */

/** Founder-only review plumbing (§ 4.6): Bearer PIP_ADMIN_TOKEN. The
 *  ledger is reached for state; audio still streams from R2. */
/** Constant-time bearer check — a leaked prefix must not shave the
 *  search space via timing. Uses the Workers primitive when present;
 *  the byte loop is the portable fallback (Node tests lack the API). */
const teAdmin = new TextEncoder();
export async function adminOk(request, env) {
  if (!env.PIP_ADMIN_TOKEN) return false;
  const got = teAdmin.encode(request.headers.get("authorization") ?? "");
  const want = teAdmin.encode(`Bearer ${env.PIP_ADMIN_TOKEN}`);
  if (got.byteLength !== want.byteLength) return false;
  if (typeof crypto.subtle.timingSafeEqual === "function") {
    return crypto.subtle.timingSafeEqual(got, want);
  }
  let diff = 0;
  for (let i = 0; i < got.byteLength; i++) diff |= got[i] ^ want[i];
  return diff === 0;
}

export async function handleTileAdmin(request, env, url) {
  if (!(await adminOk(request, env))) {
    return json({ error: "unauthorized" }, { status: 401 });
  }
  if (!env.TILE_LEDGER) return json({ error: "voice_unavailable" }, { status: 503 });
  const stub = tileStub(env);
  const path = url.pathname;

  if (path === "/admin/v1/tile-voice/recent" && request.method === "GET") {
    return stub.fetch(new Request(`https://tile/recent${url.search}`));
  }
  if (path === "/admin/v1/tile-voice/held" && request.method === "GET") {
    return stub.fetch(new Request("https://tile/held-list"));
  }
  if (path === "/admin/v1/tile-voice/review" && request.method === "POST") {
    return stub.fetch(new Request("https://tile/review", {
      method: "POST", body: await request.text(),
    }));
  }
  if (path === "/admin/v1/tile-voice/remint" && request.method === "POST") {
    return stub.fetch(new Request("https://tile/remint", {
      method: "POST", body: await request.text(),
    }));
  }
  if (path === "/admin/v1/tile-voice/usage" && request.method === "GET") {
    return stub.fetch(new Request(`https://tile/usage${url.search}`));
  }
  if (path === "/admin/v1/tile-voice/seed" && request.method === "POST") {
    return stub.fetch(new Request("https://tile/seed", {
      method: "POST", body: await request.text(),
    }));
  }
  const rowMatch = path.match(/^\/admin\/v1\/tile-voice\/row\/([0-9a-f]{64})$/);
  if (rowMatch && request.method === "GET") {
    return stub.fetch(new Request(`https://tile/row?id=${rowMatch[1]}`));
  }
  const audioMatch = path.match(/^\/admin\/v1\/tile-voice\/audio\/([0-9a-f]{64})$/);
  if (audioMatch && request.method === "GET") {
    return stub.fetch(new Request(`https://tile/audio?id=${audioMatch[1]}`));
  }
  return json({ error: "not_found" }, { status: 404 });
}

/* ---------------------------- the ledger DO ---------------------------- */

export class TileLedger {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    /** Single flight (§ 3): one in-flight mint per clip id; concurrent
     *  callers share the promise and each wraps its own Response. */
    this.inflight = new Map();
    ctx.blockConcurrencyWhile(() => {
      ledger.ensureSchema(ctx.storage.sql);
      pictureLedger.ensureSchema(ctx.storage.sql);
      trial.ensureSchema(ctx.storage.sql);
    });
  }

  get sql() { return this.ctx.storage.sql; }
  now() {
    return typeof this.env.TILE_NOW === "function" ? this.env.TILE_NOW() : Date.now();
  }
  dayCap() { return Number(this.env.TILE_DAY_MINTS ?? 500) || 500; }
  trialDays() {
    const v = this.env.TRIAL_DAYS;
    return v == null ? trial.TRIAL_DAYS : Number(v) || 0;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const p = url.pathname;
    const body = async () => request.json().catch(() => null);

    if (p === "/peek" && request.method === "POST") {
      const { id } = (await body()) ?? {};
      return json({ disposition: ledger.clipDisposition(this.sql, id, this.now()) });
    }
    if (p === "/clip" && request.method === "POST") {
      return this.serveClip((await body()) ?? {});
    }
    if (p === "/held" && request.method === "POST") {
      const { locale, text, reason } = (await body()) ?? {};
      if (typeof text === "string" && reason) {
        ledger.recordHeld(this.sql, {
          locale: String(locale ?? ""), text, reason, now: this.now() });
      }
      return new Response(null, { status: 204 });
    }
    if (p === "/flag" && request.method === "POST") {
      const { id } = (await body()) ?? {};
      ledger.flagClip(this.sql, id);
      return new Response(null, { status: 204 });
    }
    if (p === "/recent" && request.method === "GET") {
      const q = url.searchParams;
      const day = ledger.utcDay(this.now());
      const info = ledger.dayRow(this.sql, day) ?? { mints: 0, alerted: 0 };
      return json({
        rows: ledger.listRecent(this.sql, {
          source: q.get("source"), review: q.get("review"),
          flagged: q.get("flagged") === "1", before: q.get("before"),
          limit: q.get("limit"),
        }),
        day: { day, mints: info.mints, alerted: info.alerted, cap: this.dayCap() },
      });
    }
    if (p === "/held-list" && request.method === "GET") {
      return json({ rows: ledger.listHeld(this.sql) });
    }
    if (p === "/review" && request.method === "POST") {
      const { ids, review } = (await body()) ?? {};
      if (!Array.isArray(ids) || !["approved", "rejected"].includes(review)) {
        return json({ error: "bad_request" }, { status: 400 });
      }
      return json({ updated: ledger.applyReview(this.sql, ids, review, this.now()) });
    }
    if (p === "/remint" && request.method === "POST") {
      return this.remint((await body()) ?? {});
    }
    if (p === "/replaced" && request.method === "GET") {
      const texts = ledger.listReplaced(this.sql, {
        since: url.searchParams.get("since"),
        voiceKey: url.searchParams.get("voice"),
      }).map((r) => r.text);
      return json({ texts });
    }
    /** § 10 slice 7 — register existing R2 clips (catalog audio) as
     *  ready seed rows so identical typed text hits. Founder tooling;
     *  never overwrites an existing row. The DO derives ids — the id
     *  recipe is ledger-owned, scripts must not recompute it. */
    if (p === "/seed" && request.method === "POST") {
      const { rows } = (await body()) ?? {};
      if (!Array.isArray(rows) || rows.length > 500) {
        return json({ error: "bad_request" }, { status: 400 });
      }
      let inserted = 0, skipped = 0;
      for (const r of rows) {
        const voice = VOICES.get(String(r?.voice_key ?? ""));
        const text = normalizeV1(String(r?.text ?? ""));
        const locale = String(r?.locale ?? "en");
        if (!voice || !text || typeof r?.r2_key !== "string" || !r.r2_key) {
          skipped++;
          continue;
        }
        const id = await ledger.tileClipId(voice.voice_key, locale, text);
        ledger.seedClip(this.sql, {
          id, voiceKey: voice.voice_key, locale, text,
          mintText: r.mint_text ?? text, model: voice.model,
          profile: TILE_PROFILE, r2Key: r.r2_key,
          bytes: r.bytes, durationMs: r.duration_ms,
          now: this.now(),
        }) ? inserted++ : skipped++;
      }
      return json({ inserted, skipped });
    }
    /** 030 — the picture ledger shares this DO (§ 5.1): rank inputs
     *  (pins, blocks, pick/reject counts) for find's scoring. */
    if (p === "/pic/rank" && request.method === "POST") {
      const { items } = (await body()) ?? {};
      return json({ items: pictureLedger.rankSignals(this.sql, items) });
    }
    /** § 6.2 anonymous pick — the caller sends the signals key, never a
     *  personal name (the Worker resolves scope before this call). */
    if (p === "/pic/pick" && request.method === "POST") {
      const { text_norm, image_id } = (await body()) ?? {};
      if (!text_norm || !image_id) return json({ error: "bad_request" }, { status: 400 });
      pictureLedger.recordPick(this.sql, { textNorm: text_norm, imageId: image_id });
      return new Response(null, { status: 204 });
    }
    /** § 6.3 rejection — demote ours + one anonymous disagreement row. */
    if (p === "/pic/reject" && request.method === "POST") {
      const b = (await body()) ?? {};
      if (!b.text_norm || !b.ours || !b.action) {
        return json({ error: "bad_request" }, { status: 400 });
      }
      pictureLedger.recordReject(this.sql, {
        textNorm: b.text_norm, ours: b.ours, action: b.action,
        theirs: b.theirs, description: b.description, scope: b.scope,
        now: this.now(),
      });
      return new Response(null, { status: 204 });
    }
    /** § 5.5 review + rulings. */
    if (p === "/pic/disagreements" && request.method === "GET") {
      return json({ rows: pictureLedger.listDisagreements(this.sql, {
        limit: url.searchParams.get("limit"),
      }) });
    }
    if (p === "/pic/dismiss" && request.method === "POST") {
      const b = (await body()) ?? {};
      pictureLedger.dismissDisagreement(this.sql, { ...b, now: this.now() });
      return new Response(null, { status: 204 });
    }
    if (p === "/pic/pin" && request.method === "POST") {
      const b = (await body()) ?? {};
      if (!b.text_norm || !b.image_id) return json({ error: "bad_request" }, { status: 400 });
      pictureLedger.pin(this.sql, { textNorm: b.text_norm, imageId: b.image_id, now: this.now() });
      return new Response(null, { status: 204 });
    }
    if (p === "/pic/unpin" && request.method === "POST") {
      const { text_norm } = (await body()) ?? {};
      pictureLedger.unpin(this.sql, text_norm);
      return new Response(null, { status: 204 });
    }
    if (p === "/pic/block" && request.method === "POST") {
      const b = (await body()) ?? {};
      if (!b.text_norm || !b.image_id) return json({ error: "bad_request" }, { status: 400 });
      pictureLedger.block(this.sql, { textNorm: b.text_norm, imageId: b.image_id, now: this.now() });
      return new Response(null, { status: 204 });
    }
    if (p === "/pic/unblock" && request.method === "POST") {
      const b = (await body()) ?? {};
      pictureLedger.unblock(this.sql, { textNorm: b.text_norm, imageId: b.image_id });
      return new Response(null, { status: 204 });
    }
    if (p === "/pic/admin-log" && request.method === "POST") {
      const b = (await body()) ?? {};
      pictureLedger.adminLog(this.sql, { ...b, now: this.now() });
      return new Response(null, { status: 204 });
    }
    /** The only identity-keyed record on this path: the per-user draw
     *  allowance (030 § 6.1). Atomic reserve + refund — an R2 read-modify-
     *  write counter can be overspent by concurrent draws. */
    if (p === "/pic/allowance/reserve" && request.method === "POST") {
      const { uid, cap } = (await body()) ?? {};
      return json(pictureLedger.reserveDraw(this.sql, {
        uid: String(uid), cap: Number(cap) || 0 }));
    }
    if (p === "/pic/allowance/refund" && request.method === "POST") {
      const { uid } = (await body()) ?? {};
      pictureLedger.refundDraw(this.sql, { uid: String(uid) });
      return new Response(null, { status: 204 });
    }
    if (p === "/pic/allowance" && request.method === "GET") {
      return json(pictureLedger.drawAllowance(this.sql, {
        uid: url.searchParams.get("uid") ?? "",
        cap: Number(url.searchParams.get("cap")) || 0 }));
    }
    /** Draw ledger (030 § 5.1): claim is the single-flight gate — the DO
     *  row decides who mints; the worker does synth/R2/index after. */
    if (p === "/pic/draw/claim" && request.method === "POST") {
      const b = (await body()) ?? {};
      return json(pictureLedger.claimDraw(this.sql, { ...b, now: this.now() }));
    }
    if (p === "/pic/draw/ready" && request.method === "POST") {
      const b = (await body()) ?? {};
      pictureLedger.finishDraw(this.sql, { ...b, now: this.now() });
      return new Response(null, { status: 204 });
    }
    if (p === "/pic/draw/fail" && request.method === "POST") {
      const b = (await body()) ?? {};
      pictureLedger.failDraw(this.sql, { ...b, now: this.now() });
      return new Response(null, { status: 204 });
    }
    if (p === "/pic/draw/row" && request.method === "GET") {
      const row = pictureLedger.getDraw(this.sql, url.searchParams.get("key"));
      return row ? json({ row }) : json({ error: "not_found" }, { status: 404 });
    }
    if (p === "/pic/draw/recent" && request.method === "GET") {
      return json({ rows: pictureLedger.listDraws(this.sql, {
        before: url.searchParams.get("before"),
        limit: url.searchParams.get("limit"),
      }) });
    }
    /** 040 — the 7-day trial: one timestamp per user, insert-if-absent.
     *  Same shared-DO pattern as the picture ledger. env.TRIAL_DAYS is
     *  the Works-Test seam (§ 9: forced to 0 shows the day-8 product). */
    if (p === "/trial/start" && request.method === "POST") {
      const { uid, ip_hash } = (await body()) ?? {};
      return json(trial.trialStart(this.sql, {
        uid: String(uid), ipHash: typeof ip_hash === "string" ? ip_hash : null,
        day: ledger.utcDay(this.now()), now: this.now(),
        trialDays: this.trialDays() }));
    }
    if (p === "/trial/status" && request.method === "GET") {
      return json(trial.trialStatus(this.sql, {
        uid: String(url.searchParams.get("uid") ?? ""), now: this.now(),
        trialDays: this.trialDays() }));
    }
    if (p === "/usage" && request.method === "GET") {
      return json(ledger.mintedChars(this.sql, {
        from: Number(url.searchParams.get("from")) || 0,
        to: Number(url.searchParams.get("to")) || Number.MAX_SAFE_INTEGER,
      }));
    }
    if (p === "/row" && request.method === "GET") {
      const row = ledger.getClip(this.sql, url.searchParams.get("id"));
      return row ? json({ row }) : json({ error: "not_found" }, { status: 404 });
    }
    if (p === "/audio" && request.method === "GET") {
      const row = ledger.getClip(this.sql, url.searchParams.get("id"));
      if (!row?.r2_key) return json({ error: "not_found" }, { status: 404 });
      const bytes = await this.clipBytes(row);
      if (!bytes) return json({ error: "not_found" }, { status: 404 });
      return new Response(bytes, {
        headers: { "content-type": "audio/mpeg", "x-tile-version": String(row.version) },
      });
    }
    return json({ error: "not_found" }, { status: 404 });
  }

  /** Ready-row audio may live in VOICE (minted tiles) or in the shipped
   *  static bundle (catalog seeds point at audio/… which is in
   *  public/, not the VOICE bucket). R2 first, then ASSETS. */
  async clipBytes(row) {
    const obj = await this.env.VOICE.get(row.r2_key).catch(() => null);
    if (obj) return obj.arrayBuffer();
    if (row.r2_key.startsWith("audio/") && this.env.ASSETS) {
      const res = await this.env.ASSETS
        .fetch(`https://assets/${row.r2_key}`).catch(() => null);
      if (res?.ok) return res.arrayBuffer();
    }
    return null;
  }

  /** The mint path (§ 3): ready → stream; withheld → 409; failed inside
   *  retry_after → 502; otherwise single-flight claim → synth → R2.
   *  Single-flight shares a payload descriptor, never a Response — one
   *  stream body can't serve two callers, so each materializes its own. */
  async serveClip({ id, voice_key: voiceKey, locale, text, source }) {
    const now = this.now();
    const row = ledger.getClip(this.sql, id);

    if (row?.status === "ready" && row.r2_key) {
      const bytes = await this.clipBytes(row);
      if (bytes) {
        ledger.touchHit(this.sql, id);
        return audioResponse(bytes, { cache: "hit", version: row.version });
      }
      // No bytes anywhere — demote the row so claimMint can reclaim it,
      // then fall through and re-mint (claimMint refuses 'ready').
      ledger.missingObject(this.sql, id);
    }
    if (row?.status === "withheld") {
      return json({ error: "withheld" }, { status: 409 });
    }
    if (row?.status === "failed" && row.retry_after && row.retry_after > now) {
      return json({ error: "mint_failed" }, { status: 502 });
    }

    let work = this.inflight.get(id);
    if (!work && row?.status === "minting") {
      // Claimed before this DO was evicted — give a fresh claim its
      // window, reclaim it after (§ 4.5: stale at 60 s).
      const settled = await this.waitMinting(id);
      if (settled && !settled.rerun) {
        if (settled.kind === "audio") ledger.touchHit(this.sql, id);
        return payloadResponse(settled);
      }
      work = this.inflight.get(id);
    }
    const origin = !work;
    if (origin) {
      work = this.mintClip({ id, voiceKey, locale, text, source });
      this.inflight.set(id, work);
      work.finally(() => this.inflight.delete(id)).catch(() => {});
    }
    const payload = await work;
    if (payload?.rerun) {
      return this.serveClip({ id, voice_key: voiceKey, locale, text, source });
    }
    if (payload?.kind === "audio") ledger.touchHit(this.sql, id);
    const res = payloadResponse(payload);
    // Only the request that made the vendor call counts a mint against
    // its license — single-flight waiters got a shared clip for free.
    if (origin && payload?.kind === "audio" && payload.cache === "mint") {
      res.headers.set("x-tile-billed", "1");
    }
    return res;
  }

  /** A minting row with no in-memory promise: poll until the claimant
   *  finishes or the claim goes stale. Returns a payload or null. */
  async waitMinting(id) {
    const bound = Date.now() + ledger.MINTING_STALE_MS + 30_000;
    for (;;) {
      const row = ledger.getClip(this.sql, id);
      if (!row) return { kind: "json", data: { error: "mint_failed" }, status: 502 };
      if (row.status === "ready" && row.r2_key) {
        const bytes = await this.clipBytes(row);
        if (bytes) {
          return { kind: "audio", bytes,
            cache: "hit", version: row.version };
        }
      }
      if (row.status === "withheld") {
        return { kind: "json", data: { error: "withheld" }, status: 409 };
      }
      if (row.status === "failed") {
        return { kind: "json", data: { error: "mint_failed" }, status: 502 };
      }
      const now = this.now();
      if (now - (row.claimed_at ?? row.created_at) >= ledger.MINTING_STALE_MS) {
        return null; // stale — caller reclaims
      }
      const inFlight = this.inflight.get(id);
      if (inFlight) return inFlight;
      if (Date.now() > bound) return null;
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  async mintClip({ id, voiceKey, locale, text, source }) {
    const now = this.now();
    const cap = this.dayCap();
    const day = ledger.utcDay(now);
    if (ledger.dayMints(this.sql, day) >= cap) {
      return { kind: "json", data: { error: "budget" }, status: 503 };
    }
    const voice = VOICES.get(voiceKey);
    if (!voice) return { kind: "json", data: { error: "bad_voice" }, status: 400 };
    const mintText = tileMintText(text);
    const { claim } = ledger.claimMint(this.sql, {
      id, voiceKey, locale, text, mintText,
      model: voice.model, profile: TILE_PROFILE, source, now,
    });
    if (!claim) return { rerun: true };

    const mints = ledger.bumpDayMints(this.sql, day);
    // § 4.7 — 80% marker once per day; the review tool banners on it.
    if (mints >= Math.ceil(cap * 0.8)) {
      const row0 = ledger.dayRow(this.sql, day);
      if (row0 && !row0.alerted) {
        ledger.markDayAlerted(this.sql, day);
        console.warn(`tile-alert ${day}: ${mints}/${cap} mints`);
        this.env.VOICE.put(`tile-alert/${day}`,
          JSON.stringify({ day, mints, cap, at: now })).catch(() => {});
      }
    }

    try {
      const { audio, stub } = await this.synth(mintText, voice);
      if (!audio?.length) throw new Error("empty_synth");
      const checks = mintChecks(audio.length, text);
      const r2Key = `tile/${voiceKey}/${id}.mp3`;
      await this.env.VOICE.put(r2Key, audio);
      ledger.completeMint(this.sql, {
        id, voiceKey, chars: stub ? 0 : mintText.length, r2Key,
        bytes: audio.length,
        durationMs: checks.duration_ms, checks, now: this.now(),
      });
      const done = ledger.getClip(this.sql, id);
      return { kind: "audio", bytes: audio,
        cache: stub ? "stub" : "mint", version: done.version };
    } catch {
      ledger.failMint(this.sql, { id, now: this.now() });
      return { kind: "json", data: { error: "mint_failed" }, status: 502 };
    }
  }

  /** § slice 1 — synth seam: TILE_SYNTH in tests; real ElevenLabs only
   *  when TILE_LIVE=1 AND a key is set; the silent stub is development
   *  only — in production an unconfigured synth must fail, never cache
   *  a clip of silence as ready. */
  async synth(mintText, voice) {
    if (typeof this.env.TILE_SYNTH === "function") {
      return { audio: await this.env.TILE_SYNTH(mintText, { voice }), stub: false };
    }
    if (this.env.TILE_LIVE === "1" && this.env.ELEVENLABS_API_KEY) {
      return { audio: await synthesizeElevenLabs(this.env, mintText, voice), stub: false };
    }
    if (this.env.ENVIRONMENT === "development") {
      return { audio: SILENT_MP3, stub: true };
    }
    throw new Error("synth_unconfigured");
  }

  /** Admin remint (§ 4.6): plain re-runs the recipe; ipa needs an
   *  explicit ipa (the Groq lookup stays a founder-side lab tool) or a
   *  known sound-effect override. */
  async remint({ id, mode, ipa }) {
    const row = ledger.getClip(this.sql, id);
    if (!row) return json({ error: "not_found" }, { status: 404 });
    const voice = VOICES.get(row.voice_key);
    if (!voice) return json({ error: "bad_voice" }, { status: 400 });
    if (!["plain", "ipa"].includes(mode)) {
      return json({ error: "bad_mode" }, { status: 400 });
    }
    let mintText;
    if (mode === "ipa") {
      let wrapped;
      try {
        wrapped = normalizeIpaField(
          ipa || ipaOverrideForSoundEffectLabel(row.text) || "");
      } catch {
        return json({ error: "bad_ipa" }, { status: 400 });
      }
      if (!wrapped) return json({ error: "ipa_required" }, { status: 400 });
      mintText = formatElevenV4IpaLine(row.text, wrapped);
    } else {
      mintText = tileMintText(row.text);
    }
    try {
      const { audio, stub } = await this.synth(mintText, voice);
      if (!audio?.length) throw new Error("empty_synth");
      const version = row.version + 1;
      const r2Key = `tile/${row.voice_key}/${id}.v${version}.mp3`;
      await this.env.VOICE.put(r2Key, audio);
      const checks = mintChecks(audio.length, row.text);
      ledger.applyRemint(this.sql, {
        id, voiceKey: row.voice_key, chars: stub ? 0 : mintText.length,
        r2Key, mintText, bytes: audio.length,
        durationMs: checks.duration_ms, checks, now: this.now(),
      });
      return json({ id, version });
    } catch {
      return json({ error: "mint_failed" }, { status: 502 });
    }
  }
}
