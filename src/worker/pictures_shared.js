/** 030 — Picture Finder shared plumbing: response/validation helpers,
 *  the fair-use gates, Jev classification, bge-m3 embeddings, the
 *  Vectorize lookup and rank, and the Tile-ledger DO post/read stubs
 *  every pictures route shares. Routes live in pictures_find.js,
 *  pictures_signals.js, and pictures_draw.js; pictures.js is the barrel.
 *
 *  Reuse first, draw last: every find embeds "text — description" with
 *  the multilingual bge-m3 model and asks the Vectorize index for the
 *  pictures we already own. `auto` is computed here only — the client
 *  never applies its own threshold, so AUTO_CUTOFF stays a one-number
 *  config edit (data/catalog/picture_finder.json).
 *
 *  One Jev call per find classifies scope (personal|common), kind
 *  (Fitzgerald role) and language — classifier only, it cannot write or
 *  translate. No user, device, or license id leaves this Worker (§ 8).
 */
import { checkLicense } from "./license.mjs";
import { usageReserve } from "./voice.js";
import { normalizeV1 } from "../../public/shared/normalize.mjs";
import pictureFinder from "../../data/catalog/picture_finder.json" with { type: "json" };
import pictureLabels from "../../data/catalog/picture_labels.json" with { type: "json" };
import drawBlocklist from "../../data/pictures/draw_blocklist.json" with { type: "json" };
import {
  decideAuto,
  labelKey,
  queryText,
  resolveLanguage,
  scoreOf,
  signalsKey,
  spellingSuggestion,
} from "../shared/picture_index.mjs";
import { DRAW_JEV_QUESTIONS, parseDrawSpec } from "../shared/draw_prompt.mjs";

export const CFG = pictureFinder;

export const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...(init.headers || {}) },
  });

export const okUuid = (s) => typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);
export const TEXT_MAX = 80;
export const DESC_MAX = 120;
export const BATCH_MAX = 50;
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
export async function classify(env, { text, description, forDraw = false }) {
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
    signal: AbortSignal.timeout(30_000), // 043 I — bounded provider call
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

export async function embed(env, texts) {
  const res = await env.AI.run(CFG.embed_model, { text: texts });
  const data = res?.data;
  if (!Array.isArray(data) || data.length !== texts.length) {
    throw new Error("embed_shape");
  }
  return data;
}

export const pictureStub = (env) =>
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
export async function findOne(env, { text, description, locale, binding = "PICTURES", includePending = false }) {
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

  const rescored = matches
    .map((m) => ({
      image_id: m.id,
      asset: m.metadata?.asset ?? null,
      source: m.metadata?.source ?? null,
      caption: m.metadata?.caption ?? null,
      status: m.metadata?.status ?? "approved",
      cosine: m.score,
      score: scoreOf(m.score, signals?.counts?.[m.id] ?? {}, CFG),
    }))
    .sort((a, b) => b.score - a.score);
  let candidates = rescored.slice(0, CFG.top_k);
  // `pool` is the full fetched set and `direct` the lexical label
  // map — identity can rank below fetch_k in the embedding entirely
  // ("eat", "no"), so the dictionary is the tier-1 authority (§ 4.2).
  const lKey = labelKey(text);
  const tier1Eligible = jev.scope === "common" && language === "en"
    && lKey && !normalizeV1(String(description ?? ""));
  const direct = tier1Eligible
    ? (env.PICTURE_LABELS ?? pictureLabels.labels)?.[lKey] ?? null
    : null;
  // Homograph = the label names two CATALOG senses (orange colour vs
  // fruit). Same-word duplicate art from extended/drawn doesn't count.
  const homograph = new Set((direct ?? [])
    .filter((e) => e.source === "catalog")
    .map((e) => e.sense ?? e.image_id)).size > 1;
  const auto = decideAuto(
    { candidates, pool: rescored, pinned: signals?.pinned ?? null,
      blocked: signals?.blocked ?? [], text, description, scope: jev.scope,
      direct },
    CFG, language);
  // Homograph ("bat" the animal / the baseball bat): the label's own
  // images lead the choices so the adult picks the right sense —
  // nothing auto-applies on a coin-flip embedding score.
  if (homograph) {
    const listed = new Set(candidates.map((c) => c.image_id));
    const skipped = new Set(signals?.blocked ?? []);
    const extra = (direct ?? [])
      .filter((e) => !listed.has(e.image_id) && !skipped.has(e.image_id))
      .map((e) => ({ image_id: e.image_id, asset: e.asset, source: e.source,
        caption: e.caption, status: "approved", cosine: null, score: null }));
    candidates = [...extra, ...candidates].slice(0, CFG.top_k);
  }
  // A tier-1 pick can rank below fetch_k (or not be embedded yet); the
  // client applies `auto` only when it is among the candidates, and
  // otherwise would spend a drawing on a word we already have a picture for.
  if (auto && !candidates.some((c) => c.image_id === auto)) {
    const e = (direct ?? []).find((d) => d.image_id === auto);
    if (e) {
      candidates = [{ image_id: e.image_id, asset: e.asset, source: e.source,
        caption: e.caption, status: "approved", cosine: null, score: null },
      ...candidates].slice(0, CFG.top_k);
    }
  }
  // § 4.2 typo suggestion — only when the word is no label at all and
  // nothing applied: a near-label whose image the embedding also
  // surfaced ("bananna"→"banana", never "crocs"→"cross").
  const suggestion = !auto && !homograph && tier1Eligible && !direct
    ? spellingSuggestion({
      key: lKey, labels: env.PICTURE_LABELS ?? pictureLabels.labels, pool: rescored,
    })
    : null;
  // `calibrated` tells the add card whether "nothing close" means "draw
  // one" — until the founder saves a cutoff (§ 7, default 1.01 = never
  // auto) every miss would spend a drawing, so 029 shows the four instead.
  return {
    candidates, auto, scope: jev.scope, kind: jev.kind, language,
    homograph, suggestion, calibrated: CFG.auto_cutoff <= 1,
  };
}

/** Shared gate for find routes: ids, license, bindings, fair use.
 *  Takes the already-parsed body — a Request body reads once. */
export async function findGuard(body, env, n = 1) {
  const uid = typeof body?.user_id === "string" ? body.user_id : null;
  if (!okUuid(uid)) return { err: json({ error: "bad_user_id" }, { status: 400 }) };
  if (!(await checkLicense(env.PIP_LICENSE_SECRET, uid, body?.license))) {
    return { err: json({ error: "bad_license" }, { status: 403 }) };
  }
  if (!env.AI || !env.PICTURES) {
    return { err: json({ error: "pictures_unavailable" }, { status: 503 }) };
  }
  const gate = await usageReserve(env, {
    ns: "usage-pic", uid, chars: n, maxChars: BATCH_MAX,
    dayBudget: FIND_DAY, minBudget: FIND_MIN,
  });
  if (!gate.allowed) {
    return { err: json({ error: "fair_use", over: gate.over }, { status: 429 }) };
  }
  return { uid };
}

/** normalize + length rule (§ 9): rejects over-length, never truncates. */
export const cleanText = (v, max) => {
  const t = normalizeV1(typeof v === "string" ? v : "");
  return t.length <= max ? t : null;
};


export const picPost = (env, path, body = {}) =>
  pictureStub(env).fetch(new Request(`https://tile${path}`, {
    method: "POST", body: JSON.stringify(body),
  }));

const BLOCK_TERMS = drawBlocklist.terms.map((t) => normalizeV1(t));

/** § 5.3 step 1 — the safety blocklist refuses before Jev/Muse. Whole-word
 *  match on the normalized pair so "Essex" never trips "sex". */
export function isUnsafe(text, description) {
  const hay = ` ${normalizeV1(`${text} ${description}`)} `;
  return BLOCK_TERMS.some((t) => t && hay.includes(` ${t} `));
}
