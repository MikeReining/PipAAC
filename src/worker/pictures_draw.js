/** 030 § 5 — draw: safety blocklist, per-user allowance on the ledger
 *  DO, planner (gptoss/spark lanes) and Muse synthesis, style refs, and
 *  the single-flight cache wait. Reuse first, draw last — handleDraw
 *  checks the index before a paid mint. Shared plumbing lives in
 *  pictures_shared.js. */
import { checkLicense } from "./license.mjs";
import { usageCheck, usageRecord } from "./voice.js";
import { normalizeV1 } from "../../public/shared/normalize.mjs";
import {
  captionForDrawing, drawKey, drawSubject,
} from "../shared/picture_index.mjs";
import {
  appHeaders, buildPrompt, MUSE_MODEL, OPENROUTER_ENDPOINT, plannerLane,
  styleRefBundle,
} from "../shared/draw_prompt.mjs";
import { askPlanner, PLANNER_SYSTEM } from "../shared/draw_planner.mjs";
import {
  CFG, DESC_MAX, TEXT_MAX, classify, cleanText, embed, isUnsafe, json,
  okUuid, picPost, pictureStub,
} from "./pictures_shared.js";

/* ------------------------------ draw (§ 5) ------------------------------ */

const DRAW_NS = "usage-draw";
const DRAW_DAY = 30; // abuse guard (§ 6.1)
const DRAW_MIN = 10;
const ALLOWANCE = { free: 5, lifetime: 300 }; // Pricing § 4.2
const STYLE_REFS_MANIFEST = "style-refs/manifest.json";

/** 1×1 transparent png — the default local-dev mint when neither a
 *  DRAW_SYNTH seam nor a live key is present (x-draw-cache: stub). */
const STUB_PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0));


/** The draw counter is the only identity-keyed record on this path —
 *  a lifetime total per user (§ 6.1). It lives in the ledger DO's SQLite
 *  so reservation is atomic: an R2 read-modify-write counter here could
 *  be overspent by a burst of concurrent draws (each real mint is a paid
 *  vendor call). Reserve before the mint; refund on every exit that
 *  doesn't complete one. */
const reserveAllowance = (env, uid, cap) =>
  picPost(env, "/pic/allowance/reserve", { uid, cap });
const refundAllowance = (env, uid) =>
  picPost(env, "/pic/allowance/refund", { uid }).catch(() => {});
async function allowanceLeft(env, uid, cap) {
  const res = await pictureStub(env).fetch(
    new Request(`https://tile/pic/allowance?uid=${uid}&cap=${cap}`))
    .catch(() => null);
  const { left } = (await res?.json().catch(() => ({}))) ?? {};
  return typeof left === "number" ? left : null;
}

/** Tier from the relay's entitlement row (011 § 9); anything unverifiable
 *  is free — the conservative side of a paywall. */
async function entitlementFor(env, uid) {
  try {
    if (!env.RELAY) return "free";
    const secret = env.PIP_INTERNAL_SECRET ?? env.PIP_LICENSE_SECRET;
    const res = await env.RELAY.get(env.RELAY.idFromName(uid)).fetch(
      new Request(`https://relay/users/${uid}/internal/entitlement`, {
        headers: { "x-pip-internal": secret ?? "" },
      }));
    const j = await res.json();
    return j?.entitlement === "lifetime" ? "lifetime" : "free";
  } catch {
    return "free";
  }
}


/** Style bundle, R2-side (the Worker cannot read assets/). The manifest
 *  lists every published ref as {name: "pip-v1/…", mime}; bundle picks the
 *  set per spec — null bundle (packshot) draws with no refs, like gen.mjs.
 *  Published by scripts/pictures/publish_style_refs.mjs. */
async function loadDrawRefs(env, bundle) {
  if (!bundle) return [];
  const man = await env.VOICE.get(STYLE_REFS_MANIFEST).catch(() => null);
  if (!man) return [];
  const files = (JSON.parse(await man.text()).files ?? [])
    .filter((f) => String(f.name).startsWith(`${bundle}/`));
  const refs = [];
  for (const f of files) {
    const obj = await env.VOICE.get(`style-refs/${f.name}`).catch(() => null);
    if (!obj) continue;
    const bytes = new Uint8Array(await obj.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 8192) {
      bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    refs.push({ name: f.name, dataUri: `data:${f.mime};base64,${btoa(bin)}` });
  }
  return refs;
}

/** § 5.3 step 4 — one image call. env.DRAW_SYNTH is the test seam;
 *  DRAW_LIVE=1 + OPENROUTER_API_KEY is the founder-gated live path;
 *  DRAW_STUB=1 is the explicit local-dev placeholder (a deploy without a
 *  live key must 502, never serve a blank image as a drawing).
 *  The vendor body carries the prompt and style refs — never a user,
 *  device, or license id. */
async function synthesizeDraw(env, { prompt, refs }) {
  if (typeof env.DRAW_SYNTH === "function") {
    return { bytes: new Uint8Array(await env.DRAW_SYNTH(prompt, refs)), cache: "mint" };
  }
  if (env.DRAW_LIVE === "1" && env.OPENROUTER_API_KEY) {
    const body = {
      model: MUSE_MODEL,
      prompt,
      aspect_ratio: "1:1",
      output_format: "png",
    };
    if (refs.length) {
      body.input_references = refs.map((r) => ({
        type: "image_url", image_url: { url: r.dataUri },
      }));
    }
    const res = await fetch(OPENROUTER_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        ...appHeaders("pictures"),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`draw_${res.status}`);
    const b64 = (await res.json())?.data?.[0]?.b64_json;
    if (!b64) throw new Error("draw_no_image");
    return { bytes: Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), cache: "mint" };
  }
  if (env.DRAW_STUB === "1") return { bytes: STUB_PNG, cache: "stub" };
  throw new Error("draw_unavailable");
}

/** Read-only ledger row lookup — never a claim, never a charge. */
async function lookupDraw(env, key) {
  const res = await pictureStub(env).fetch(
    new Request(`https://tile/pic/draw/row?key=${key}`)).catch(() => null);
  return (await res?.json().catch(() => null))?.row ?? null;
}

/** A loser of the single-flight claim waits out the winner's mint, then
 *  serves the same row. Bounded — a dead claimant fails closed at 502. */
async function waitDraw(env, key) {
  const deadline = Date.now() + (Number(env.PIC_DRAW_WAIT_MS) || 45000);
  while (Date.now() < deadline) {
    const row = await lookupDraw(env, key);
    if (row?.status === "ready" && row.r2_key) return row;
    if (row?.status === "failed" || row?.status === "withheld") return row;
    await new Promise((r) => setTimeout(r, 400));
  }
  return null;
}

const pngResponse = (bytes, headers) =>
  new Response(bytes, {
    headers: { "content-type": "image/png", "cache-control": "private, max-age=86400", ...headers },
  });

/** POST /api/v1/pictures/draw {user_id, license, text, description?}
 *  200 image/png with x-draw-cache: hit|mint|stub + x-drawings-left.
 *  Order per § 5.3: safety → allowance → Jev → key → claim → mint. */
export async function handleDraw(request, env, ctx) {
  const body = await request.json().catch(() => null);
  const uid = typeof body?.user_id === "string" ? body.user_id : null;
  if (!okUuid(uid)) return json({ error: "bad_user_id" }, { status: 400 });
  if (!(await checkLicense(env.PIP_LICENSE_SECRET, uid, body?.license))) {
    return json({ error: "bad_license" }, { status: 403 });
  }
  const text = cleanText(body?.text, TEXT_MAX);
  const description = cleanText(body?.description, DESC_MAX);
  if (!text || (body?.description != null && description === null)) {
    return json({ error: "bad_text" }, { status: 400 });
  }
  if (!env.VOICE || !env.TILE_LEDGER || !env.AI || !env.PICTURES) {
    return json({ error: "pictures_unavailable" }, { status: 503 });
  }

  // 1 — safety, before any Jev/vendor call (422 unsafe).
  if (isUnsafe(text, description)) {
    return json({ error: "unsafe" }, { status: 422 });
  }

  const tier = await entitlementFor(env, uid);
  const cap = ALLOWANCE[tier] ?? ALLOWANCE.free;

  /* The draw is a real pipeline — for metaphor words the planner alone
   * can think for ~25s before Muse starts. Clients sending
   * `Accept: text/event-stream` get honest stage events as each phase
   * begins (checking → reading → planning → drawing → saving) plus the
   * planner's hint the moment it is written; every label the UI shows
   * is a thing that actually happened. Everything else keeps the
   * blocking image/png contract. */
  const sse = request.headers.get("accept")?.includes("text/event-stream");
  if (!sse) {
    const r = await runDraw(env, { uid, text, description, cap }, () => {});
    return r.png ? pngResponse(r.png, r.headers) : json(r.body, { status: r.status });
  }
  const { readable, writable } = new TransformStream();
  const enc = new TextEncoder();
  const writer = writable.getWriter();
  let chain = Promise.resolve();
  const send = (o) =>
    (chain = chain.then(() =>
      writer.write(enc.encode(`data: ${JSON.stringify(o)}\n\n`)).catch(() => {})));
  const emit = (stage, extra = {}) => send({ type: "stage", stage, ...extra });
  const work = (async () => {
    try {
      const r = await runDraw(env, { uid, text, description, cap }, emit);
      await chain; // every stage lands before the terminal event
      if (r.png) {
        await send({ type: "done", key: r.key, cache: r.cache,
          left: r.left, image: b64encode(r.png) });
      } else {
        await send({ type: "error", status: r.status, ...r.body });
      }
    } catch {
      await send({ type: "error", status: 502, error: "draw_failed" }).catch(() => {});
    }
    await chain.catch(() => {});
    await writer.close().catch(() => {});
  })();
  ctx?.waitUntil?.(work);
  return new Response(readable, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
    },
  });
}

const b64encode = (bytes) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(s);
};

/** The planner's hint for a mint — Jev's imagery picks the lane
 *  (plannerLane: literal → gptoss, metaphor → spark). env.DRAW_PLAN is
 *  the test seam; live mints need the OpenRouter chat key that
 *  DRAW_LIVE already requires. A planner failure never blocks a
 *  drawing — the hint falls back to the adult's description. */
async function planDrawHint(env, { text, description, spec }) {
  try {
    if (typeof env.DRAW_PLAN === "function") {
      return (await env.DRAW_PLAN({ text, description, spec })) || null;
    }
    const { hint } = await askPlanner({
      lane: plannerLane(spec), text, description, spec,
      apiKey: env.OPENROUTER_API_KEY, system: PLANNER_SYSTEM,
      app: "pictures", signal: AbortSignal.timeout(45_000),
    });
    return hint || null;
  } catch {
    return null;
  }
}

/** The draw pipeline after auth/safety — one failure boundary from
 *  claim to ready. emit(stage, extra) reports real phases to SSE
 *  clients; classic callers pass a no-op. Returns { png, headers } to
 *  serve or { status, body } to fail. */
async function runDraw(env, { uid, text, description, cap }, emit) {
  const err = (status, body) => ({ status, body });
  const headersFor = (cache, left, key) => ({
    "x-draw-cache": cache,
    ...(left == null ? {} : { "x-drawings-left": String(left) }),
    "x-draw-key": key,
  });
  const serveRow = async (row, cache, left) => {
    const obj = await env.VOICE.get(row.r2_key).catch(() => null);
    if (!obj) return null;
    return {
      png: new Uint8Array(await obj.arrayBuffer()),
      headers: headersFor(cache, left, row.key),
      key: row.key, cache, left,
    };
  };

  // 2 — an existing picture stays free even at 0 left (§ 0.5). This
  // read-only lookup needs no vendor call: both candidate keys are
  // computable locally — a personal key hashes the description alone,
  // and only the hash reaches our own DO (the name never leaves this
  // Worker). The 402 below applies to a miss only.
  emit("checking");
  const keyCommon = await drawKey(CFG.style_version,
    drawSubject({ scope: "common", text, description }));
  const keyPersonal = description ? await drawKey(CFG.style_version,
    drawSubject({ scope: "personal", text, description })) : null;
  let readyRow = null, withheldRow = null;
  for (const k of [keyCommon, keyPersonal].filter(Boolean)) {
    const row = await lookupDraw(env, k);
    if (row?.status === "ready" && row.r2_key) readyRow ??= row;
    if (row?.status === "withheld") withheldRow ??= row;
  }
  if (readyRow) {
    emit("serving");
    const served =
      await serveRow(readyRow, "hit", await allowanceLeft(env, uid, cap));
    if (served) return served;
    // ready row, missing bytes — fall through and mint it again
  } else if (withheldRow) {
    return err(422, { error: "unsafe" });
  }

  // 3 — allowance (§ 6.1): atomic lifetime reservation + 30/day guard.
  let rs;
  try {
    rs = await (await reserveAllowance(env, uid, cap)).json();
  } catch {
    return err(503, { error: "draw_unavailable" });
  }
  const refund = () => refundAllowance(env, uid);
  if (!rs.reserved) {
    // § 6.1 — the client offers a photo (and later a top-up) at zero.
    return err(402,
      { error: "allowance", left: 0, total: cap, suggest: "photo" });
  }
  // `rs.left` counts this reservation; a non-mint exit refunds it, so the
  // honest uncharged remainder on a free hit is one more.
  const left = rs.left;
  const leftFree = Math.min(cap, left + 1);
  const guard = await usageCheck(env, {
    ns: DRAW_NS, uid, chars: 1, maxChars: 1, dayBudget: DRAW_DAY, minBudget: DRAW_MIN,
  });
  if (!guard.allowed) {
    await refund();
    await usageRecord(env, { ns: DRAW_NS, uid, chars: 0, over: guard.over });
    return err(429, { error: "fair_use", over: guard.over });
  }

  // 4 — Jev: scope/kind/language + the framing spec, one call. A null
  // scope fails closed (§ 8): "Cooper" treated as common would leak the
  // name into the prompt, the ledger, and the review page. 503 before
  // any ledger claim or vendor call — the client never decides scope.
  emit("reading");
  let jev;
  try {
    jev = await classify(env, { text, description, forDraw: true });
  } catch {
    jev = null;
  }
  if (!jev?.scope) {
    await refund();
    return err(503, { error: "classify_unavailable" });
  }
  const scope = jev.scope === "personal" ? "personal" : "common";
  // A person/pet with no description has nothing to draw (and the name
  // alone is never drawable — it never reaches the prompt).
  if (scope === "personal" && !description) {
    await refund();
    return err(400, { error: "bad_description" });
  }

  // The name never leaves this Worker: a personal subject draws the
  // description ("our golden retriever"), never "Cooper" (§ 3.3, § 8).
  const subject = drawSubject({ scope, text, description });
  const key = await drawKey(CFG.style_version, subject);
  const promptWord = scope === "personal" ? normalizeV1(description) : text;

  // 5 — ledger claim: hit serves, minting waits, mint draws once. Every
  // non-mint disposition refunds the reservation — nothing was drawn.
  let claimed;
  try {
    claimed = await (await picPost(env, "/pic/draw/claim", {
      key, text: scope === "personal" ? normalizeV1(description) : text,
      description, scope, kind: jev.kind, lens: jev.draw.framing,
    })).json();
  } catch {
    await refund();
    return err(503, { error: "draw_unavailable" });
  }

  if (claimed.disposition !== "mint") await refund();
  if (claimed.disposition === "hit") {
    emit("serving");
    return (await serveRow(claimed.row, "hit", leftFree))
      ?? err(502, { error: "draw_failed" });
  }
  if (claimed.disposition === "withheld") {
    return err(422, { error: "unsafe" });
  }
  if (claimed.disposition === "failed_wait") {
    return err(502, { error: "draw_failed", retry_after: claimed.row.retry_after });
  }
  if (claimed.disposition === "minting") {
    emit("waiting");
    const row = await waitDraw(env, key);
    if (row?.status === "ready") {
      emit("serving");
      return (await serveRow(row, "hit", leftFree))
        ?? err(502, { error: "draw_failed" });
    }
    if (row?.status === "withheld") {
      return err(422, { error: "unsafe" });
    }
    return err(502, { error: "draw_failed" });
  }

  // 5b — the planner writes the hint for common-scope mints. Jev's
  // imagery picks the lane (literal → fast, metaphor → reasoning); a
  // personal subject's description IS the hint and needs none. The
  // planner only runs when a live mint can follow — never for a stub.
  const willPlan = scope === "common"
    && (typeof env.DRAW_PLAN === "function"
      || (env.DRAW_LIVE === "1" && env.OPENROUTER_API_KEY));
  if (willPlan) emit("planning", { lane: plannerLane(jev.draw) });
  const planned = willPlan
    ? await planDrawHint(env, { text, description, spec: jev.draw })
    : null;
  if (planned) emit("planned", { hint: planned });
  const prompt = buildPrompt({
    word: promptWord,
    torso: jev.kind && jev.kind !== "None" ? jev.kind.toLowerCase() : null,
    hint: scope === "personal" ? null : (planned ?? (description || null)),
    framing: jev.draw.framing,
    hand: jev.draw.hand_mode,
    social_scale: jev.draw.social_scale,
    entity_mode: jev.draw.entity_mode,
    packaging: jev.draw.packaging,
  });

  // 6 — we hold the claim: synth, store, index — the reservation we made
  // is the charge. Everything from the paid call through ledger-ready is
  // one failure boundary: any throw marks the row failed (retry_after
  // frees the next request immediately — no 10-minute minting tombstone),
  // refunds the allowance, and 502s.
  const fail = async () => {
    await picPost(env, "/pic/draw/fail", { key, retryAfter: Date.now() + 60_000 })
      .catch(() => {});
    await refund();
    return err(502, { error: "draw_failed" });
  };
  let minted;
  try {
    emit("drawing");
    const refs = await loadDrawRefs(env, styleRefBundle(jev.draw));
    minted = await synthesizeDraw(env, { prompt, refs });
    emit("saving");
    const r2Key = `drawing/${key}.png`;
    await env.VOICE.put(r2Key, minted.bytes);
    const ready = await picPost(env, "/pic/draw/ready", { key, r2Key });
    if (!ready.ok) throw new Error("ready_failed");
  } catch {
    return fail();
  }

  // The next family finds this drawing by its description-derived caption
  // (§ 3.3) — upsert inline so the very next find sees it. A stub mint
  // never indexes: a placeholder that exists only in dev R2 would point
  // the real index at a picture that doesn't exist.
  try {
    const caption = minted.cache === "stub" ? null
      : captionForDrawing({ scope, text, description });
    if (caption) {
      const [vec] = await embed(env, [caption]);
      await env.PICTURES.upsert([{
        id: `drw_${key}`,
        values: vec,
        metadata: {
          asset: `/api/v1/pictures/img/drw_${key}`,
          source: "drawn",
          status: "approved",
          caption,
          fitzgerald_role: jev.kind ?? "",
          lens: jev.draw.framing,
          caption_version: CFG.caption_version,
        },
      }]);
    }
  } catch { /* a missed index row costs nothing — the ledger still serves */ }

  await usageRecord(env, { ns: DRAW_NS, uid, chars: 1 });
  return {
    png: minted.bytes,
    headers: headersFor(minted.cache, left, key),
    key, cache: minted.cache, left,
  };
}


export { ALLOWANCE, entitlementFor };
