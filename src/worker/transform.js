/**
 * 023 — POST /api/v1/transform: the transform buttons' model call.
 *
 * The Groq key lives here, never in the client (023 §5.3). Prompts live
 * in src/shared/transform_prompts.mjs — the grammar-pass strings proven
 * in the sentence-lab battery (the wand law: her words + glue, abstain
 * rather than guess). The client sends the sentence with
 * her people's names already swapped for placeholders (name_shield) —
 * names never leave the device, so the Worker and Groq only ever see
 * PERSON1-shaped text.
 *
 * Same license gate + fair-use shape as the voice endpoint: transforms
 * cost ~100× less, so the budgets are looser, in their own usage-tr/
 * namespace so voice can't starve them. 039: a press with no license
 * rides the one-time taste pool (taste.mjs — atomic spend, a speak
 * grant for the result, a per-connection cap on new tasting profiles).
 * env.GROQ_CHAT is the test seam; without it or GROQ_API_KEY the caller
 * gets 503 and the button speaks the sentence as built.
 */
import { checkLicense } from "./license.mjs";
import { usageCheck, usageRecord } from "./voice.js";
import {
  ipHashFor, tasteRefund, tasteReserve, writeSpeakGrant,
} from "./taste.mjs";
import { TRANSFORM_PROMPTS, transformPrompt } from "../shared/transform_prompts.mjs";

export { TRANSFORM_PROMPTS };

const MODEL = "qwen/qwen3.8-27b";
const MAX_INPUT_CHARS = 160;
const DAY_CHAR_BUDGET = 20000;   // ~200 transformed sentences/day
const MINUTE_REQUEST_BURST = 30; // a furious button-tapper, still sane

const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...(init.headers || {}) },
  });

async function groq(env, mode, text, shape) {
  if (typeof env.GROQ_CHAT === "function") return env.GROQ_CHAT(mode, text, shape);
  if (!env.GROQ_API_KEY) return null;
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0, // same sentence + button → same answer (model rules)
      messages: [
        { role: "system", content: transformPrompt(mode, shape) },
        { role: "user", content: text },
      ],
    }),
  });
  if (!res.ok) throw new Error(`groq_${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? null;
}

export async function handleTransform(request, env) {
  const body = await request.json().catch(() => null);
  const uid = typeof body?.user_id === "string" ? body.user_id : null;
  if (!uid || !/^[0-9a-f-]{36}$/i.test(uid)) {
    return json({ error: "bad_user_id" }, { status: 400 });
  }
  /* 039: no license presented rides the one-time taste pool; a token
   * that was offered and failed stays a hard bad_license, so the client
   * can tell a forged/stale license from an empty pool. */
  const presented = typeof body?.license === "string" && body.license ? body.license : null;
  const licensed = await checkLicense(env.PIP_LICENSE_SECRET, uid, presented);
  if (!licensed && presented) {
    return json({ error: "bad_license" }, { status: 403 });
  }
  const mode = body?.mode;
  if (!TRANSFORM_PROMPTS[mode]) return json({ error: "bad_mode" }, { status: 400 });
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || text.length > MAX_INPUT_CHARS) {
    return json({ error: "bad_text" }, { status: 400 });
  }
  if (!env.VOICE) return json({ error: "transform_unavailable" }, { status: 503 });
  if (!licensed && !env.TILE_LEDGER) {
    return json({ error: "transform_unavailable" }, { status: 503 });
  }

  const gate = await usageCheck(env, { ns: "usage-tr", uid, chars: text.length,
    maxChars: MAX_INPUT_CHARS, dayBudget: DAY_CHAR_BUDGET,
    minBudget: MINUTE_REQUEST_BURST });
  if (!gate.allowed) {
    await usageRecord(env, { ns: "usage-tr", uid, chars: 0, over: gate.over });
    return json({ error: "fair_use", over: gate.over }, { status: 429 });
  }

  /* The bar's shape composes with the press: ❓ carries the bar's tense
   * so the question matches it; ⏪/⏩ on an existing question carry the
   * question flag so the tense change keeps it (023 founder ruling). */
  const shape = {
    tense: ["past", "future"].includes(body?.tense) ? body.tense : "present",
    question: body?.question === true,
  };

  /* 039 § 4.1 — a tap is one successful model call. Reserve before the
   * call (the ledger DO is atomic: two parallel presses can't both take
   * the last tap); a call that returns no text refunds it, so failures,
   * offline presses and re-speaks cost nothing. */
  let taste = null;
  if (!licensed) {
    taste = await tasteReserve(env, { uid, ipHash: await ipHashFor(env, request) });
    if (!taste?.ok) return json({ error: "taste_exhausted" }, { status: 403 });
  }

  let out;
  try {
    out = await groq(env, mode, text, shape);
  } catch {
    if (taste) await tasteRefund(env, uid);
    return json({ error: "groq_failed" }, { status: 502 });
  }
  if (!out) {
    if (taste) await tasteRefund(env, uid);
    return json({ error: "transform_unavailable" }, { status: 503 });
  }

  await usageRecord(env, { ns: "usage-tr", uid, chars: text.length });
  if (taste) {
    /* The result deserves the real sentence voice (§ 2): grant one
     * speak of this exact text — still name-masked; the client echoes
     * it back as taste_text. */
    await writeSpeakGrant(env, uid, out);
    return json({ text: out, taste: { left: taste.left } });
  }
  return json({ text: out });
}
