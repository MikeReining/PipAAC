/**
 * POST /research — the "Help improve Pip" intake
 * (Stats_And_Progress § 6.3).
 *
 * One POST per stats_day per device: whitelisted daily totals keyed by
 * a random research id. The whitelist is enforced by construction —
 * `validateResearch` returns a NEW object containing only allowed
 * fields, so a strip can't be bypassed by forgetting a delete. Storage
 * is Workers Analytics Engine (`RESEARCH` binding): append-only
 * analytics, no per-request auth, no writes back.
 */

const RE = {
  rid: /^res_[0-9a-f-]{8,64}$/,
  sense: /^sns_[0-9a-z-]{1,64}$/,
  short: /^[a-z0-9._-]{1,32}$/i,
};

const int = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;

const PATHS = new Set(["grid", "strip", "group", "keyboard"]);

/** Returns a clean payload or null. Extra keys reject the whole POST —
 *  a client that sends anything else is not this app. */
export function validateResearch(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const allowed = new Set([
    "v", "rid", "day", "words", "own_taps", "sent_lengths",
    "wpm", "wpm_n", "wpm_q1", "wpm_q3", "path_ms", "jev_ms", "wrong_n",
    "strip_share", "layout", "mode", "age_days", "ver",
  ]);
  for (const k of Object.keys(body)) if (!allowed.has(k)) return null;

  if (body.v !== 1) return null;
  if (typeof body.rid !== "string" || !RE.rid.test(body.rid)) return null;
  if (!int(body.day, 100000)) return null;
  if (!int(body.age_days, 100000)) return null;
  if (typeof body.ver !== "string" || !RE.short.test(body.ver)) return null;

  if (body.words == null || typeof body.words !== "object" || Array.isArray(body.words)) return null;
  const words = {};
  for (const [k, v] of Object.entries(body.words)) {
    if (!RE.sense.test(k) || !int(v, 100000)) return null; // built-in ids only
    words[k] = v;
  }
  if (Object.keys(words).length > 600) return null;
  if (!int(body.own_taps, 100000)) return null;

  if (body.sent_lengths == null || typeof body.sent_lengths !== "object"
      || Array.isArray(body.sent_lengths)) return null;
  const sentLengths = {};
  for (const [k, v] of Object.entries(body.sent_lengths)) {
    if (!/^[0-9]{1,2}$/.test(k) || !int(v, 100000)) return null;
    sentLengths[k] = v;
  }
  if (Object.keys(sentLengths).length > 40) return null;

  if (body.wpm !== null && (typeof body.wpm !== "number" || body.wpm < 0 || body.wpm > 500)) {
    return null;
  }
  if (!int(body.wpm_n, 100000)) return null;
  for (const k of ["wpm_q1", "wpm_q3"]) {
    if (body[k] !== null && (typeof body[k] !== "number" || body[k] < 0 || body[k] > 500)) {
      return null;
    }
  }

  // Per-path pick-to-pick ms (017 step 28): only the four known paths,
  // each {q1, median, q3, n} — no other keys, no times of day.
  if (body.path_ms == null || typeof body.path_ms !== "object"
      || Array.isArray(body.path_ms)) return null;
  const pathMs = {};
  for (const [k, v] of Object.entries(body.path_ms)) {
    if (!PATHS.has(k) || !v || typeof v !== "object" || Array.isArray(v)) return null;
    const fields = Object.keys(v).sort().join(",");
    if (fields !== "median,n,q1,q3") return null;
    for (const f of ["q1", "median", "q3"]) {
      if (typeof v[f] !== "number" || !(v[f] >= 0) || v[f] > 3600000) return null;
    }
    if (!int(v.n, 100000)) return null;
    pathMs[k] = { q1: v.q1, median: v.median, q3: v.q3, n: v.n };
  }
  if (Object.keys(pathMs).length > 4) return null;

  // The Jev-timing experiment's two medians and counts (017 step 28):
  // {shown, late} × {median: ms|null, n}.
  if (body.jev_ms == null || typeof body.jev_ms !== "object"
      || Array.isArray(body.jev_ms)) return null;
  const jevMs = {};
  for (const k of ["shown", "late"]) {
    const v = body.jev_ms[k];
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    if (Object.keys(v).sort().join(",") !== "median,n") return null;
    if (v.median !== null && (typeof v.median !== "number" || !(v.median >= 0) || v.median > 3600000)) {
      return null;
    }
    if (!int(v.n, 100000)) return null;
    jevMs[k] = { median: v.median, n: v.n };
  }
  if (Object.keys(body.jev_ms).length !== 2) return null;
  if (!int(body.wrong_n, 100000)) return null;
  if (typeof body.strip_share !== "number" || body.strip_share < 0 || body.strip_share > 1) {
    return null;
  }
  if (typeof body.layout !== "string" || !RE.short.test(body.layout)) return null;
  if (body.mode !== "symbol" && body.mode !== "label") return null;

  return {
    v: 1, rid: body.rid, day: body.day,
    words, own_taps: body.own_taps, sent_lengths: sentLengths,
    wpm: body.wpm, wpm_n: body.wpm_n, wpm_q1: body.wpm_q1, wpm_q3: body.wpm_q3,
    path_ms: pathMs, jev_ms: jevMs, wrong_n: body.wrong_n,
    strip_share: body.strip_share,
    layout: body.layout, mode: body.mode, age_days: body.age_days, ver: body.ver,
  };
}

/** Validate → write one Analytics Engine data point. The datapoint is
 *  the whitelist as JSON blobs plus the queryable numerics; `rid` is
 *  the index so a user's days can be followed without any other key. */
export async function handleResearch(request, env) {
  if (request.method !== "POST") return json({ error: "method" }, { status: 405 });
  const body = await request.json().catch(() => null);
  const clean = validateResearch(body);
  if (!clean) return json({ error: "bad_request" }, { status: 400 });
  env?.RESEARCH?.writeDataPoint?.({
    blobs: [
      JSON.stringify(clean.words),
      JSON.stringify(clean.sent_lengths),
      JSON.stringify(clean.path_ms),
      JSON.stringify(clean.jev_ms),
      clean.layout, clean.mode, clean.ver,
    ],
    doubles: [
      clean.day, clean.age_days, clean.own_taps,
      clean.wpm ?? -1, clean.wpm_n, clean.strip_share,
      clean.wpm_q1 ?? -1, clean.wpm_q3 ?? -1, clean.wrong_n,
    ],
    indexes: [clean.rid],
  });
  return json({ ok: true });
}

const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...(init.headers || {}) },
  });
