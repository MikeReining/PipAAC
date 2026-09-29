/**
 * 030 — Picture Finder: POST /api/v1/pictures/find (+ /find-batch),
 * GET /api/v1/pictures/img/<image_id>, and the founder-only
 * /admin/v1/pictures/* index routes.
 *
 * Reuse first, draw last: every find embeds "text — description" with
 * the multilingual bge-m3 model and asks the Vectorize index for the
 * pictures we already own. `auto` is computed here only — the client
 * never applies its own threshold, so AUTO_CUTOFF stays a one-number
 * config edit (data/catalog/picture_finder.json).
 *
 * One Jev call per find classifies scope (personal|common), kind
 * (Fitzgerald role) and language — classifier only, it cannot write or
 * translate. No user, device, or license id leaves this Worker (§ 8).
 */
import { checkLicense } from "./license.mjs";
import { usageCheck, usageRecord } from "./voice.js";
import { normalizeV1 } from "../../public/shared/normalize.mjs";
import pictureFinder from "../../data/catalog/picture_finder.json" with { type: "json" };
import drawBlocklist from "../../data/pictures/draw_blocklist.json" with { type: "json" };
import {
  captionForDrawing,
  decideAuto,
  drawKey,
  drawSubject,
  queryText,
  resolveLanguage,
  scoreOf,
  signalsKey,
} from "../shared/picture_index.mjs";
import {
  appHeaders,
  buildPrompt,
  DRAW_JEV_QUESTIONS,
  MUSE_MODEL,
  OPENROUTER_ENDPOINT,
  parseDrawSpec,
  styleRefBundle,
} from "../shared/draw_prompt.mjs";
import { adminOk } from "./tile.js";

const CFG = pictureFinder;

const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...(init.headers || {}) },
  });

const okUuid = (s) => typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);
const TEXT_MAX = 80;
const DESC_MAX = 120;
const BATCH_MAX = 50;
const FIND_DAY = 2000;
const FIND_MIN = 30;

const TYPESAFE_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const JEV_MODEL = "jev-latest";

const JEV_STATE = (text, description) =>
  `A caregiver typed a word or phrase into an AAC picture-board app to find or draw a picture tile for a child. text: "${text}". description (optional extra hint the caregiver wrote): "${description || "(none)"}".`;

const JEV_QUESTIONS = {
  scope: {
    type: "choice",
    instructions: "Is this a specific private person, pet, or place the child personally knows — their mom, their dog Cooper, their house — which we must never auto-draw? Or a common, shareable concept anyone's picture could illustrate?",
    criteria: {
      personal: "A specific named person, pet, or private place belonging to this child's life (a name, a relative, their pet, their home)",
      common: "A general concept, object, action, feeling, or word that any family's picture could show",
    },
  },
  kind: {
    type: "choice",
    instructions: "Which Fitzgerald color role does this word play on an AAC board?",
    criteria: {
      Yellow: "People and pronouns (names matching a person also land here)",
      Green: "Actions and verbs (want, go, eat, help-doing words)",
      Red: "Negation, warnings, emergencies, yes/no/stop",
      Pink: "Little social words and prepositions (in, on, with, please, more-position words)",
      Blue: "Describing words — adjectives, amounts, feelings as descriptors (big, happy, more)",
      Purple: "Question words (what, where, who, why, how, when)",
      None: "A thing, food, animal, place, or other fringe noun — none of the roles above",
    },
  },
  language: {
    type: "choice",
    instructions: "Which language is `text` written in? Answer for the literal string, not the meaning.",
    criteria: {
      en: "English", de: "German", es: "Spanish", fr: "French",
      it: "Italian", pt: "Portuguese", nl: "Dutch", other: "any other language",
    },
  },
};

/** Jev classify (§ 4.3): scope/kind/language in one call — forDraw adds
 *  the § 5.3 framing questions to the same round-trip. env.PICTURE_JEV
 *  is the test seam; without it or TYPESAFE_API_KEY the caller gets
 *  nulls and treats them per 029's rules (no auto-draw, Yellow, default
 *  cutoff). Model judgments — never keyword rules. */
async function classify(env, { text, description, forDraw = false }) {
  if (typeof env.PICTURE_JEV === "function") {
    const r = await env.PICTURE_JEV({ text, description, forDraw });
    return {
      scope: r?.scope ?? null,
      kind: r?.kind ?? null,
      language: r?.language ?? null,
      language_probs: r?.language_probs ?? {},
      draw: r?.draw ?? (forDraw ? parseDrawSpec(null) : null),
    };
  }
  if (!env.TYPESAFE_API_KEY) {
    return {
      scope: null, kind: null, language: null, language_probs: {},
      draw: forDraw ? parseDrawSpec(null) : null,
    };
  }
  const res = await fetch(TYPESAFE_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.TYPESAFE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: JEV_MODEL,
      state: JEV_STATE(text, description),
      questions: forDraw ? { ...JEV_QUESTIONS, ...DRAW_JEV_QUESTIONS } : JEV_QUESTIONS,
    }),
  });
  if (!res.ok) throw new Error(`jev_${res.status}`);
  const data = await res.json();
  return {
    scope: data?.answers?.scope?.choice ?? null,
    kind: data?.answers?.kind?.choice ?? null,
    language: data?.answers?.language?.choice ?? null,
    language_probs: data?.answers?.language?.probabilities ?? {},
    draw: forDraw ? parseDrawSpec(data?.answers) : null,
  };
}

async function embed(env, texts) {
  const res = await env.AI.run(CFG.embed_model, { text: texts });
  const data = res?.data;
  if (!Array.isArray(data) || data.length !== texts.length) {
    throw new Error("embed_shape");
  }
  return data;
}

const pictureStub = (env) =>
  env.TILE_LEDGER.get(env.TILE_LEDGER.idFromName("ledger"));

/** Founder pins/blocks + anonymous pick/reject counts for one signals
 *  key each — the same call the pick/reject writers fill in later
 *  slices. No DO bound → empty signal (tests, bare dev). */
async function rankSignals(env, items) {
  if (!env.TILE_LEDGER) {
    return items.map(() => ({ pinned: null, blocked: [], counts: {} }));
  }
  const res = await pictureStub(env).fetch(new Request("https://tile/pic/rank", {
    method: "POST",
    body: JSON.stringify({ items }),
  }));
  if (!res.ok) return items.map(() => ({ pinned: null, blocked: [], counts: {} }));
  return (await res.json()).items;
}

/** One find: classify -> embed -> query -> rescore -> auto.
 *  `binding` picks the Vectorize index (main find is always PICTURES);
 *  `includePending` is for the calibration page only — never the app. */
async function findOne(env, { text, description, locale, binding = "PICTURES", includePending = false }) {
  let jev;
  try {
    jev = await classify(env, { text, description });
  } catch {
    jev = { scope: null, kind: null, language: null, language_probs: {} };
  }
  const language = resolveLanguage({
    choice: jev.language, probabilities: jev.language_probs, locale,
  });
  const [vec] = await embed(env, [queryText(text, description)]);
  const raw = await env[binding].query(vec, {
    topK: CFG.fetch_k,
    returnMetadata: "all",
  });
  const matches = (raw?.matches ?? [])
    .filter((m) => includePending
      || (m.metadata?.status ?? "approved") === "approved");

  const skey = signalsKey(jev.scope, text, description);
  const [signals] = await rankSignals(env, [{
    text_norm: skey, image_ids: matches.map((m) => m.id),
  }]);

  const candidates = matches
    .map((m) => ({
      image_id: m.id,
      asset: m.metadata?.asset ?? null,
      source: m.metadata?.source ?? null,
      caption: m.metadata?.caption ?? null,
      status: m.metadata?.status ?? "approved",
      cosine: m.score,
      score: scoreOf(m.score, signals?.counts?.[m.id] ?? {}, CFG),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, CFG.top_k);
  const auto = decideAuto(
    { candidates, pinned: signals?.pinned ?? null, blocked: signals?.blocked ?? [] },
    CFG, language);
  return { candidates, auto, scope: jev.scope, kind: jev.kind, language };
}

/** Shared gate for find routes: ids, license, bindings, fair use.
 *  Takes the already-parsed body — a Request body reads once. */
async function findGuard(body, env, n = 1) {
  const uid = typeof body?.user_id === "string" ? body.user_id : null;
  if (!okUuid(uid)) return { err: json({ error: "bad_user_id" }, { status: 400 }) };
  if (!(await checkLicense(env.PIP_LICENSE_SECRET, uid, body?.license))) {
    return { err: json({ error: "bad_license" }, { status: 403 }) };
  }
  if (!env.AI || !env.PICTURES) {
    return { err: json({ error: "pictures_unavailable" }, { status: 503 }) };
  }
  const gate = await usageCheck(env, {
    ns: "usage-pic", uid, chars: n, maxChars: BATCH_MAX,
    dayBudget: FIND_DAY, minBudget: FIND_MIN,
  });
  if (!gate.allowed) {
    await usageRecord(env, { ns: "usage-pic", uid, chars: 0, over: gate.over });
    return { err: json({ error: "fair_use", over: gate.over }, { status: 429 }) };
  }
  return { uid };
}

/** normalize + length rule (§ 9): rejects over-length, never truncates. */
const cleanText = (v, max) => {
  const t = normalizeV1(typeof v === "string" ? v : "");
  return t.length <= max ? t : null;
};

/** POST /api/v1/pictures/find {user_id, license, text, description?, locale} */
export async function handleFind(request, env, ctx) {
  const body = await request.json().catch(() => null);
  const { uid, err } = await findGuard(body, env);
  if (err) return err;
  const text = cleanText(body?.text, TEXT_MAX);
  const description = cleanText(body?.description, DESC_MAX);
  if (!text || description === null) {
    return json({ error: "bad_text" }, { status: 400 });
  }
  const result = await findOne(env, { text, description, locale: body?.locale });
  const after = usageRecord(env, { ns: "usage-pic", uid, chars: 1 });
  if (ctx?.waitUntil) ctx.waitUntil(after); else await after;
  return json(result);
}

/** POST /api/v1/pictures/find-batch {…, items:[{text, description?}]×≤50} */
export async function handleFindBatch(request, env, ctx) {
  const body = await request.json().catch(() => null);
  const items = Array.isArray(body?.items) ? body.items : null;
  if (!items || items.length === 0 || items.length > BATCH_MAX) {
    return json({ error: "bad_items" }, { status: 400 });
  }
  const { uid, err } = await findGuard(body, env, items.length);
  if (err) return err;
  const cleaned = items.map((it) => ({
    text: cleanText(it?.text, TEXT_MAX),
    description: cleanText(it?.description, DESC_MAX),
  }));
  const results = await Promise.all(cleaned.map(async (it) =>
    it.text && it.description !== null
      ? findOne(env, { ...it, locale: body?.locale })
      : { error: "bad_text" }));
  const after = usageRecord(env, { ns: "usage-pic", uid, chars: items.length });
  if (ctx?.waitUntil) ctx.waitUntil(after); else await after;
  return json({ results });
}

/* ------------------------------ pick (§ 6.2) ------------------------------ */

const PICK_NS = "usage-pick";
const PICK_DAY = 200; // § 6.2 — one account cannot steer everyone's ranking
const PICK_MIN = 30;

/** POST /api/v1/pictures/pick {user_id, license, text, description?,
 *  image_id} → 204. Anonymous crowd signal: the row key is the § 3.3
 *  signals key, so a personal pick stores the description, never a name —
 *  scope comes from Jev (the client can hint but never decides). */
export async function handlePick(request, env, ctx) {
  const body = await request.json().catch(() => null);
  const uid = typeof body?.user_id === "string" ? body.user_id : null;
  if (!okUuid(uid)) return json({ error: "bad_user_id" }, { status: 400 });
  if (!(await checkLicense(env.PIP_LICENSE_SECRET, uid, body?.license))) {
    return json({ error: "bad_license" }, { status: 403 });
  }
  const text = cleanText(body?.text, TEXT_MAX);
  const description = cleanText(body?.description, DESC_MAX);
  const imageId = typeof body?.image_id === "string" ? body.image_id.slice(0, 128) : null;
  if (!text || (body?.description != null && description === null) || !imageId) {
    return json({ error: "bad_request" }, { status: 400 });
  }
  if (!env.VOICE || !env.TILE_LEDGER) {
    return json({ error: "pictures_unavailable" }, { status: 503 });
  }
  const guard = await usageCheck(env, {
    ns: PICK_NS, uid, chars: 1, maxChars: 1, dayBudget: PICK_DAY, minBudget: PICK_MIN,
  });
  if (!guard.allowed) {
    await usageRecord(env, { ns: PICK_NS, uid, chars: 0, over: guard.over });
    return json({ error: "fair_use", over: guard.over }, { status: 429 });
  }

  let jev;
  try {
    jev = await classify(env, { text, description });
  } catch {
    jev = null;
  }
  // Fail closed: a null scope stored "common" would write a personal
  // name into the anonymous pick table. The client never decides scope.
  if (!jev?.scope) {
    return json({ error: "classify_unavailable" }, { status: 503 });
  }
  const scope = jev.scope === "personal" ? "personal" : "common";
  if (scope === "personal" && !description) {
    return json({ error: "bad_description" }, { status: 400 });
  }
  const textNorm = signalsKey(scope, text, description);
  if (!textNorm) return json({ error: "bad_request" }, { status: 400 });

  const res = await picPost(env, "/pic/pick", { text_norm: textNorm, image_id: imageId });
  if (!res.ok) return json({ error: "pick_failed" }, { status: 502 });
  await usageRecord(env, { ns: PICK_NS, uid, chars: 1 });
  return new Response(null, { status: 204 });
}

/* ------------------------------ reject (§ 6.3) ---------------------------- */

const REJECT_NS = "usage-reject";
const REJECT_ACTIONS = new Set(["pick", "photo", "draw"]);

/** POST /api/v1/pictures/reject {user_id, license, text, description?,
 *  ours, action: pick|photo|draw, theirs?} → 204. The adult replaced the
 *  picture we chose: demote ours for everyone and keep one anonymous
 *  disagreement row for the § 5.5 review. A photo is counted, never seen;
 *  a personal rejection keys on the description, never the name. */
export async function handleReject(request, env, ctx) {
  const body = await request.json().catch(() => null);
  const uid = typeof body?.user_id === "string" ? body.user_id : null;
  if (!okUuid(uid)) return json({ error: "bad_user_id" }, { status: 400 });
  if (!(await checkLicense(env.PIP_LICENSE_SECRET, uid, body?.license))) {
    return json({ error: "bad_license" }, { status: 403 });
  }
  const text = cleanText(body?.text, TEXT_MAX);
  const description = cleanText(body?.description, DESC_MAX);
  const ours = typeof body?.ours === "string" ? body.ours.slice(0, 128) : null;
  const action = body?.action;
  const theirs = typeof body?.theirs === "string" ? body.theirs.slice(0, 128) : null;
  if (!text || (body?.description != null && description === null)
      || !ours || !REJECT_ACTIONS.has(action)) {
    return json({ error: "bad_request" }, { status: 400 });
  }
  if (action === "photo" && theirs) {
    return json({ error: "bad_request" }, { status: 400 }); // photos are never seen
  }
  if (action === "draw" && !/^drw_[0-9a-f]{64}$/.test(theirs ?? "")) {
    return json({ error: "bad_request" }, { status: 400 }); // theirs is the new drw_*
  }
  if (!env.VOICE || !env.TILE_LEDGER) {
    return json({ error: "pictures_unavailable" }, { status: 503 });
  }
  // § 5.5 shows reject descriptions on the founder's review page — only
  // descriptions that pass the § 5.3 safety check may be stored there.
  if (isUnsafe(text, description)) {
    return json({ error: "unsafe" }, { status: 422 });
  }
  const guard = await usageCheck(env, {
    ns: REJECT_NS, uid, chars: 1, maxChars: 1, dayBudget: PICK_DAY, minBudget: PICK_MIN,
  });
  if (!guard.allowed) {
    await usageRecord(env, { ns: REJECT_NS, uid, chars: 0, over: guard.over });
    return json({ error: "fair_use", over: guard.over }, { status: 429 });
  }

  let jev;
  try {
    jev = await classify(env, { text, description });
  } catch {
    jev = null;
  }
  // Fail closed: a null scope stored "common" would leak a name into the
  // disagreement rows and onto the founder's review page (§ 5.5, § 8).
  if (!jev?.scope) {
    return json({ error: "classify_unavailable" }, { status: 503 });
  }
  const scope = jev.scope === "personal" ? "personal" : "common";
  if (scope === "personal" && !description) {
    return json({ error: "bad_description" }, { status: 400 });
  }
  const textNorm = signalsKey(scope, text, description);
  if (!textNorm) return json({ error: "bad_request" }, { status: 400 });

  const res = await picPost(env, "/pic/reject", {
    text_norm: textNorm, ours, action,
    theirs: action === "photo" ? null : theirs,
    description, scope,
  });
  if (!res.ok) return json({ error: "reject_failed" }, { status: 502 });
  await usageRecord(env, { ns: REJECT_NS, uid, chars: 1 });
  return new Response(null, { status: 204 });
}

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

const BLOCK_TERMS = drawBlocklist.terms.map((t) => normalizeV1(t));

/** § 5.3 step 1 — the safety blocklist refuses before Jev/Muse. Whole-word
 *  match on the normalized pair so "Essex" never trips "sex". */
export function isUnsafe(text, description) {
  const hay = ` ${normalizeV1(`${text} ${description}`)} `;
  return BLOCK_TERMS.some((t) => t && hay.includes(` ${t} `));
}

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

const picPost = (env, path, body = {}) =>
  pictureStub(env).fetch(new Request(`https://tile${path}`, {
    method: "POST", body: JSON.stringify(body),
  }));

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
  const headersFor = (cache, left, key) => ({
    "x-draw-cache": cache,
    ...(left == null ? {} : { "x-drawings-left": String(left) }),
    "x-draw-key": key,
  });
  const serveRow = async (row, cache, left) => {
    const obj = await env.VOICE.get(row.r2_key).catch(() => null);
    if (!obj) return null;
    return pngResponse(await obj.arrayBuffer(), headersFor(cache, left, row.key));
  };

  // 2 — an existing picture stays free even at 0 left (§ 0.5). This
  // read-only lookup needs no vendor call: both candidate keys are
  // computable locally — a personal key hashes the description alone,
  // and only the hash reaches our own DO (the name never leaves this
  // Worker). The 402 below applies to a miss only.
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
    const served =
      await serveRow(readyRow, "hit", await allowanceLeft(env, uid, cap));
    if (served) return served;
    // ready row, missing bytes — fall through and mint it again
  } else if (withheldRow) {
    return json({ error: "unsafe" }, { status: 422 });
  }

  // 3 — allowance (§ 6.1): atomic lifetime reservation + 30/day guard.
  let rs;
  try {
    rs = await (await reserveAllowance(env, uid, cap)).json();
  } catch {
    return json({ error: "draw_unavailable" }, { status: 503 });
  }
  const refund = () => refundAllowance(env, uid);
  if (!rs.reserved) {
    // § 6.1 — the client offers a photo (and later a top-up) at zero.
    return json(
      { error: "allowance", left: 0, total: cap, suggest: "photo" },
      { status: 402 });
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
    return json({ error: "fair_use", over: guard.over }, { status: 429 });
  }

  // 4 — Jev: scope/kind/language + the framing spec, one call. A null
  // scope fails closed (§ 8): "Cooper" treated as common would leak the
  // name into the prompt, the ledger, and the review page. 503 before
  // any ledger claim or vendor call — the client never decides scope.
  let jev;
  try {
    jev = await classify(env, { text, description, forDraw: true });
  } catch {
    jev = null;
  }
  if (!jev?.scope) {
    await refund();
    return json({ error: "classify_unavailable" }, { status: 503 });
  }
  const scope = jev.scope === "personal" ? "personal" : "common";
  // A person/pet with no description has nothing to draw (and the name
  // alone is never drawable — it never reaches the prompt).
  if (scope === "personal" && !description) {
    await refund();
    return json({ error: "bad_description" }, { status: 400 });
  }

  // The name never leaves this Worker: a personal subject draws the
  // description ("our golden retriever"), never "Cooper" (§ 3.3, § 8).
  const subject = drawSubject({ scope, text, description });
  const key = await drawKey(CFG.style_version, subject);
  const promptWord = scope === "personal" ? normalizeV1(description) : text;
  const prompt = buildPrompt({
    word: promptWord,
    torso: jev.kind && jev.kind !== "None" ? jev.kind.toLowerCase() : null,
    hint: scope === "personal" ? null : (description || null),
    framing: jev.draw.framing,
    hand: jev.draw.hand_mode,
    social_scale: jev.draw.social_scale,
    entity_mode: jev.draw.entity_mode,
    packaging: jev.draw.packaging,
  });

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
    return json({ error: "draw_unavailable" }, { status: 503 });
  }

  if (claimed.disposition !== "mint") await refund();
  if (claimed.disposition === "hit") {
    return (await serveRow(claimed.row, "hit", leftFree))
      ?? json({ error: "draw_failed" }, { status: 502 });
  }
  if (claimed.disposition === "withheld") {
    return json({ error: "unsafe" }, { status: 422 });
  }
  if (claimed.disposition === "failed_wait") {
    return json({ error: "draw_failed", retry_after: claimed.row.retry_after }, { status: 502 });
  }
  if (claimed.disposition === "minting") {
    const row = await waitDraw(env, key);
    if (row?.status === "ready") {
      return (await serveRow(row, "hit", leftFree))
        ?? json({ error: "draw_failed" }, { status: 502 });
    }
    if (row?.status === "withheld") {
      return json({ error: "unsafe" }, { status: 422 });
    }
    return json({ error: "draw_failed" }, { status: 502 });
  }

  // 6 — we hold the claim: synth, store, index — the reservation we made
  // is the charge. Everything from the paid call through ledger-ready is
  // one failure boundary: any throw marks the row failed (retry_after
  // frees the next request immediately — no 10-minute minting tombstone),
  // refunds the allowance, and 502s.
  const fail = async () => {
    await picPost(env, "/pic/draw/fail", { key, retryAfter: Date.now() + 60_000 })
      .catch(() => {});
    await refund();
    return json({ error: "draw_failed" }, { status: 502 });
  };
  let minted;
  try {
    const refs = await loadDrawRefs(env, styleRefBundle(jev.draw));
    minted = await synthesizeDraw(env, { prompt, refs });
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
  return pngResponse(minted.bytes, headersFor(minted.cache, left, key));
}

/** GET /api/v1/pictures/allowance — headers x-pip-user / x-pip-license. */
export async function handleAllowance(request, env) {
  const uid = request.headers.get("x-pip-user");
  if (!okUuid(uid)) return json({ error: "bad_user_id" }, { status: 400 });
  if (!(await checkLicense(
    env.PIP_LICENSE_SECRET, uid, request.headers.get("x-pip-license")))) {
    return json({ error: "bad_license" }, { status: 403 });
  }
  if (!env.TILE_LEDGER) {
    return json({ error: "pictures_unavailable" }, { status: 503 });
  }
  const tier = await entitlementFor(env, uid);
  const cap = ALLOWANCE[tier] ?? ALLOWANCE.free;
  const res = await pictureStub(env).fetch(
    new Request(`https://tile/pic/allowance?uid=${uid}&cap=${cap}`));
  const { left } = await res.json().catch(() => ({}));
  if (typeof left !== "number") {
    return json({ error: "pictures_unavailable" }, { status: 503 });
  }
  return json({ left, total: cap });
}

/** GET /api/v1/pictures/img/<image_id> — license-gated streams for
 *  extended-library art (EXT_ART bucket) and drawn pictures (VOICE
 *  bucket `drawing/`). Catalog images are public/ statics and never
 *  reach this route. */
export async function handlePictureImage(request, env, imageId) {
  const uid = request.headers.get("x-pip-user");
  if (!okUuid(uid)) return json({ error: "bad_user_id" }, { status: 400 });
  if (!(await checkLicense(
    env.PIP_LICENSE_SECRET, uid, request.headers.get("x-pip-license")))) {
    return json({ error: "bad_license" }, { status: 403 });
  }
  let obj = null;
  if (imageId.startsWith("ext_")) {
    const slug = imageId.slice(4);
    if (!/^[a-z0-9_]+$/.test(slug)) return json({ error: "not_found" }, { status: 404 });
    obj = await env.EXT_ART?.get(`symbols/extended/${slug}.png`).catch(() => null);
  } else if (imageId.startsWith("drw_")) {
    const key = imageId.slice(4);
    if (!/^[0-9a-f]{64}$/.test(key)) return json({ error: "not_found" }, { status: 404 });
    obj = await env.VOICE?.get(`drawing/${key}.png`).catch(() => null);
  }
  if (!obj) return json({ error: "not_found" }, { status: 404 });
  return new Response(obj.body, {
    headers: { "content-type": "image/png", "cache-control": "private, max-age=86400" },
  });
}

/* ----------------------------- admin routes ---------------------------- */

const INDEX_BINDINGS = {
  main: "PICTURES",
  calibration: "PICTURES_CALIB",
};

/** Founder-only index plumbing: embeds captions through Workers AI and
 *  upserts into the Vectorize binding. Bearer PIP_ADMIN_TOKEN. */
export async function handlePicturesAdmin(request, env, url) {
  if (!(await adminOk(request, env))) {
    return json({ error: "unauthorized" }, { status: 401 });
  }
  const path = url.pathname;

  if (path === "/admin/v1/pictures/index" && request.method === "POST") {
    const body = await request.json().catch(() => null);
    const binding = INDEX_BINDINGS[body?.index ?? "main"];
    const rows = Array.isArray(body?.rows) ? body.rows : null;
    if (!binding || !rows || rows.length === 0 || rows.length > 256) {
      return json({ error: "bad_request" }, { status: 400 });
    }
    const index = env[binding];
    if (!env.AI || !index) return json({ error: "pictures_unavailable" }, { status: 503 });
    const captions = rows.map((r) => String(r?.caption ?? ""));
    if (captions.some((c) => !c)) return json({ error: "bad_caption" }, { status: 400 });
    const vectors = await embed(env, captions);
    await index.upsert(rows.map((r, i) => ({
      id: String(r.image_id),
      values: vectors[i],
      metadata: {
        asset: String(r.asset ?? ""),
        source: String(r.source ?? ""),
        status: String(r.status ?? "approved"),
        caption: captions[i],
        fitzgerald_role: String(r.fitzgerald_role ?? ""),
        lens: String(r.lens ?? ""),
        caption_version: Number(r.caption_version ?? CFG.caption_version),
      },
    })));
    return json({ upserted: rows.length });
  }

  if (path === "/admin/v1/pictures/index/info" && request.method === "GET") {
    const info = {};
    for (const [name, binding] of Object.entries(INDEX_BINDINGS)) {
      info[name] = env[binding] ? await env[binding].describe().catch(() => null) : null;
    }
    return json(info);
  }

  // § 9 — founder view of recent drawings (newest first, paginated).
  if (path === "/admin/v1/pictures/recent" && request.method === "GET") {
    if (!env.TILE_LEDGER) return json({ error: "pictures_unavailable" }, { status: 503 });
    const res = await pictureStub(env).fetch(new Request(
      `https://tile/pic/draw/recent?before=${url.searchParams.get("before") ?? ""}&limit=${url.searchParams.get("limit") ?? ""}`));
    return json(await res.json());
  }

  // § 5.5 — "where families disagreed with us": common-scope rows only,
  // grouped (text, ours), with what families chose instead.
  if (path === "/admin/v1/pictures/disagreements" && request.method === "GET") {
    if (!env.TILE_LEDGER) return json({ error: "pictures_unavailable" }, { status: 503 });
    const res = await pictureStub(env).fetch(new Request(
      `https://tile/pic/disagreements?limit=${url.searchParams.get("limit") ?? ""}`));
    return json(await res.json());
  }
  // Founder rulings — each is logged with a timestamp (§ 5.5). Pin makes
  // their picture the auto default for everyone; block keeps ours listed
  // but never auto; dismiss hides the group until new rejections arrive.
  // Promote and redraw only queue (admin_log) — redraws run founder-gated
  // in batches of at most ten, never silently.
  if (path.startsWith("/admin/v1/pictures/disagreements/")
      && request.method === "POST") {
    if (!env.TILE_LEDGER) return json({ error: "pictures_unavailable" }, { status: 503 });
    const action = path.split("/").pop();
    const body = await request.json().catch(() => null);
    const textNorm = typeof body?.text_norm === "string" ? body.text_norm : null;
    const theirs = typeof body?.theirs === "string" ? body.theirs : null;
    const ours = typeof body?.ours === "string" ? body.ours : null;
    const description = cleanText(body?.description, DESC_MAX);
    if (!textNorm) return json({ error: "bad_request" }, { status: 400 });

    const doPost = (p, b) => picPost(env, p, b).then((r) => r.ok);
    let ok = false;
    if (action === "pin") {
      ok = theirs && await doPost("/pic/pin", { text_norm: textNorm, image_id: theirs });
    } else if (action === "unpin") {
      ok = await doPost("/pic/unpin", { text_norm: textNorm });
    } else if (action === "block") {
      ok = theirs && await doPost("/pic/block", { text_norm: textNorm, image_id: theirs });
    } else if (action === "unblock") {
      ok = theirs && await doPost("/pic/unblock", { text_norm: textNorm, image_id: theirs });
    } else if (action === "dismiss") {
      ok = ours && await doPost("/pic/dismiss", { textNorm, ours });
    } else if (action === "promote" || action === "redraw") {
      // The log entry IS the queue — one row, no second write. A redraw
      // queue row without a hint is useless (§ 5.5: their description is
      // the hint).
      if (action === "redraw" && !description) {
        return json({ error: "bad_request" }, { status: 400 });
      }
      ok = await doPost("/pic/admin-log", {
        action, textNorm, ours, theirs, detail: description ?? undefined,
      });
      return ok ? new Response(null, { status: 204 })
        : json({ error: "bad_request" }, { status: 400 });
    } else {
      return json({ error: "not_found" }, { status: 404 });
    }
    if (!ok) return json({ error: "bad_request" }, { status: 400 });
    await doPost("/pic/admin-log", {
      action, textNorm, ours, theirs, detail: description ?? undefined,
    });
    return new Response(null, { status: 204 });
  }

  // Calibration page (§ 7): same pipeline as find, on the chosen index,
  // including pending rows — founder-only, never the app's find path.
  if (path === "/admin/v1/pictures/find" && request.method === "POST") {
    const body = await request.json().catch(() => null);
    const binding = INDEX_BINDINGS[body?.index ?? "calibration"];
    const items = Array.isArray(body?.items) ? body.items : null;
    if (!binding || !items || items.length === 0 || items.length > BATCH_MAX) {
      return json({ error: "bad_request" }, { status: 400 });
    }
    if (!env.AI || !env[binding]) {
      return json({ error: "pictures_unavailable" }, { status: 503 });
    }
    const results = await Promise.all(items.map((it) => {
      const text = cleanText(it?.text, TEXT_MAX);
      const description = cleanText(it?.description, DESC_MAX);
      return text && description !== null
        ? findOne(env, {
          text, description, locale: it?.locale ?? body?.locale,
          binding, includePending: true,
        })
        : { error: "bad_text" };
    }));
    return json({ results });
  }

  return json({ error: "not_found" }, { status: 404 });
}
