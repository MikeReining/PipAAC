/**
 * 042 — Help: search by meaning, and Write to us.
 *
 * GET  /api/v1/help/search?q=…  → {version, hits:[{id, score}]}
 *   The query and every help entry (public/help.en.json, via
 *   `helpDocs`) are embedded with the picture finder's model; the
 *   ranking is cosine. Entry vectors are made once per help version and
 *   kept in the isolate and the colo cache. Readable from the marketing
 *   site (its FAQ uses the same answers).
 *
 * POST /api/v1/help/write {message, email?, details?}
 *   → emails the Pip team (hello@pipaac.org), Reply-To the sender.
 *   Never carries board content: `details` is the short list the form
 *   shows the adult before sending.
 */
import help from "../../public/help.en.json" with { type: "json" };
import { helpDocs, rankByMeaning } from "../../public/shared/help_search.mjs";
import { embed } from "./pictures_shared.js";
import { ipHashFor } from "./trial.mjs";
import { usageCheck, usageRecord } from "./voice.js";

export const HELP_TO = "hello@pipaac.org";
const HELP_FROM = "accounts@pipaac.org"; // the verified sender (SSOT)
// A hit under a tenth of the best one's score is noise (measured on the
// probe set: scripts/help/search_probe.mjs, 042 § Proof).
const KEEP_RATIO = 0.1;
const SITE_ORIGINS = new Set(["https://pipaac.org", "https://www.pipaac.org"]);

const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...(init.headers || {}) },
  });

// Two stages: embeddings find the POOL nearest entries (recall), then a
// cross-encoder reads the query against each one's text (precision) —
// short queries ("past tense") are where embeddings alone go wrong.
const POOL = 20;
const RERANK_MODEL = "@cf/baai/bge-reranker-base";
const textOf = new Map();
for (const d of helpDocs(help)) {
  if (!textOf.has(d.id) || d.text.length > textOf.get(d.id).length) textOf.set(d.id, d.text.slice(0, 600));
}
async function rerank(env, q, pool) {
  const res = await env.AI.run(RERANK_MODEL, {
    query: q, contexts: pool.map((h) => ({ text: textOf.get(h.id) })), top_k: 8,
  });
  const ranked = (res?.response ?? [])
    .map(({ id, score }) => ({ id: pool[id]?.id, score }))
    .filter((h) => h.id)
    .sort((a, b) => b.score - a.score);
  // Scores are relative to the query: keep what's near the best one.
  const floor = (ranked[0]?.score ?? 0) * KEEP_RATIO;
  return ranked.filter((h) => h.score >= floor).slice(0, 6);
}

let vectors = null; // {version, docs:[{id, vec}]} for this isolate
async function docVectors(env) {
  if (vectors?.version === help.version) return vectors.docs;
  const key = new Request(`https://help.cache/vectors/${help.version}`);
  const cache = globalThis.caches?.default;
  const hit = await cache?.match(key).catch(() => null);
  let docs = hit ? await hit.json() : null;
  if (!docs) {
    const all = helpDocs(help);
    docs = [];
    for (let i = 0; i < all.length; i += 50) {
      const batch = all.slice(i, i + 50);
      const vecs = await embed(env, batch.map((d) => d.text));
      batch.forEach((d, j) => docs.push({ id: d.id, vec: vecs[j] }));
    }
    await cache?.put(key, new Response(JSON.stringify(docs), {
      headers: { "cache-control": "max-age=2592000" },
    })).catch(() => {});
  }
  vectors = { version: help.version, docs };
  return docs;
}

/** Per-IP fair use (production only, like the other anonymous routes). */
async function overLimit(request, env, ns, { day, minute }) {
  if (env?.ENVIRONMENT === "development" || !env?.VOICE) return null;
  const ipHash = await ipHashFor(env, request);
  if (!ipHash) return null;
  const gate = await usageCheck(env, { ns, uid: ipHash, chars: 1, maxChars: 1, dayBudget: day, minBudget: minute });
  await usageRecord(env, { ns, uid: ipHash, chars: 1, over: gate.allowed ? null : gate.over });
  return gate.allowed ? null : gate.over;
}

export async function handleHelpSearch(request, env, url) {
  const origin = request.headers.get("origin");
  const cors = SITE_ORIGINS.has(origin) ? { "access-control-allow-origin": origin, vary: "origin" } : {};
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 200);
  if (q.length < 2) return json({ version: help.version, hits: [] }, { headers: cors });
  if (!env?.AI) return json({ error: "help_search_unavailable" }, { status: 503, headers: cors });
  const over = await overLimit(request, env, "usage-help-search", { day: 500, minute: 40 });
  if (over) return json({ error: "fair_use", over }, { status: 429, headers: cors });
  try {
    const [docs, [qvec]] = await Promise.all([docVectors(env), embed(env, [q])]);
    const pool = rankByMeaning(qvec, docs, { top: POOL });
    const hits = (await rerank(env, q, pool))
      .map(({ id, score }) => ({ id, score: Math.round(score * 1000) / 1000 }));
    return json({ version: help.version, hits }, { headers: cors });
  } catch {
    return json({ error: "help_search_failed" }, { status: 502, headers: cors });
  }
}

const oneLine = (s, n) => String(s ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

/** The message as a raw RFC 5322 email. Pure — the test reads this. */
export function composeHelpEmail({ message, email, details }) {
  const body = String(message ?? "").replace(/\r\n?/g, "\n").trim();
  const reply = EMAIL_RE.test(oneLine(email, 200)) ? oneLine(email, 200) : null;
  const facts = Object.entries(details && typeof details === "object" ? details : {})
    .slice(0, 12)
    .map(([k, v]) => `${oneLine(k, 40)}: ${oneLine(v, 120)}`);
  const subject = oneLine(body, 70) || "(no text)";
  return [
    `Message-ID: <${crypto.randomUUID()}@pipaac.org>`,
    `Date: ${new Date().toUTCString()}`,
    `MIME-Version: 1.0`,
    `From: Pip Help <${HELP_FROM}>`,
    `To: ${HELP_TO}`,
    ...(reply ? [`Reply-To: ${reply}`] : []),
    `Subject: Pip help: ${subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    body.replace(/\n/g, "\r\n"),
    ``,
    `--`,
    reply ? `From: ${reply} (reply to this email)` : `No email given: they can't be answered.`,
    ...facts,
  ].join("\r\n");
}

export async function handleHelpWrite(request, env) {
  const input = await request.json().catch(() => null);
  const message = String(input?.message ?? "").trim();
  if (!message) return json({ error: "empty" }, { status: 400 });
  if (message.length > 5000) return json({ error: "too_long" }, { status: 400 });
  const over = await overLimit(request, env, "usage-help-write", { day: 20, minute: 3 });
  if (over) return json({ error: "fair_use", over }, { status: 429 });
  const raw = composeHelpEmail(input);
  if (!env?.EMAIL) return json({ ok: true, sent: false }); // wrangler dev: nowhere to send
  try {
    const { EmailMessage } = await import("cloudflare:email");
    await env.EMAIL.send(new EmailMessage(HELP_FROM, HELP_TO, raw));
    return json({ ok: true, sent: true });
  } catch (e) {
    console.error("help write: send failed", e?.message);
    return json({ error: "send_failed" }, { status: 502 });
  }
}
