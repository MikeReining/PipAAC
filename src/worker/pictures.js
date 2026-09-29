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
import {
  decideAuto,
  queryText,
  resolveLanguage,
  scoreOf,
  signalsKey,
} from "../shared/picture_index.mjs";
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

/** Jev classify (§ 4.3): scope/kind/language in one call. env.PICTURE_JEV
 *  is the test seam; without it or TYPESAFE_API_KEY the caller gets
 *  nulls and treats them per 029's rules (no auto-draw, Yellow, default
 *  cutoff). Model judgments — never keyword rules. */
async function classify(env, { text, description }) {
  if (typeof env.PICTURE_JEV === "function") {
    const r = await env.PICTURE_JEV({ text, description });
    return {
      scope: r?.scope ?? null,
      kind: r?.kind ?? null,
      language: r?.language ?? null,
      language_probs: r?.language_probs ?? {},
    };
  }
  if (!env.TYPESAFE_API_KEY) {
    return { scope: null, kind: null, language: null, language_probs: {} };
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
      questions: JEV_QUESTIONS,
    }),
  });
  if (!res.ok) throw new Error(`jev_${res.status}`);
  const data = await res.json();
  return {
    scope: data?.answers?.scope?.choice ?? null,
    kind: data?.answers?.kind?.choice ?? null,
    language: data?.answers?.language?.choice ?? null,
    language_probs: data?.answers?.language?.probabilities ?? {},
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

/** One find: classify -> embed -> query -> rescore -> auto. */
async function findOne(env, { text, description, locale }) {
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
  const raw = await env.PICTURES.query(vec, {
    topK: CFG.fetch_k,
    returnMetadata: "all",
  });
  const matches = (raw?.matches ?? [])
    .filter((m) => (m.metadata?.status ?? "approved") === "approved");

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

  return json({ error: "not_found" }, { status: 404 });
}
