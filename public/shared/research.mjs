/**
 * "Help improve Pip" — anonymous daily totals to Pip
 * (Stats_And_Progress § 6.3, decided 2026-09-23).
 *
 * On by default, one synced switch (`learner_profile.share_research`),
 * a strict whitelist, and a random research id that is neither the
 * user id nor a device id. What leaves the device is built from
 * `stats_day` — the same counts-only rows supporters see — never the
 * tap log, a sentence, a name, or a photo.
 *
 * Sent once per `stats_day` row per device (`reported` flag), only for
 * rows this device computed — a supporter's replica never re-reports
 * the child's days.
 */
import { getDeviceId } from "./ops.mjs";
import { setSetting } from "./groups.mjs";

/** There is no build stamp in this codebase yet; this constant is the
 *  app version the whitelist asks for. Bump it with releases. */
export const APP_VERSION = "2026-09-25";

/** The fields `POST /research` accepts. The Worker enforces the same
 *  list — keep them in lockstep (src/worker/research.js). */
export const RESEARCH_FIELDS = [
  "v", "rid", "day", "words", "own_taps", "sent_lengths",
  "wpm", "wpm_n", "wpm_q1", "wpm_q3", "path_ms", "wrong_n",
  "strip_share", "layout", "mode", "age_days", "ver",
];

const profile = (db) =>
  db.prepare(
    `SELECT share_research, research_id, board_layout, presentation_mode
     FROM learner_profile WHERE id = 'prf_local'`,
  ).all()[0] ?? {};

/** The user's research id, minting and syncing it on first use. */
export function ensureResearchId(db) {
  const rid = profile(db).research_id;
  if (rid) return rid;
  const fresh = `res_${crypto.randomUUID()}`;
  setSetting(db, "research_id", fresh);
  return fresh;
}

/** One whitelisted payload for one stats_day row. Only `sense:` ids
 *  are built-in words — they go in `words` as bare `sns_*` ids.
 *  `entity:` taps collapse to the single `own_taps` number. */
export function dayPayload(db, dayRow, { rid, firstDay }) {
  const p = JSON.parse(dayRow.payload);
  const words = {};
  let ownTaps = 0;
  for (const [key, e] of Object.entries(p.per_word ?? {})) {
    if (key.startsWith("sense:")) words[key.slice(6)] = e.taps;
    else ownTaps += e.taps;
  }
  const prf = profile(db);
  return {
    v: 1,
    rid,
    day: dayRow.day,
    words,
    own_taps: ownTaps,
    sent_lengths: p.lengths ?? {},
    wpm: p.wpm_median,
    wpm_n: p.wpm_samples,
    wpm_q1: p.wpm_q1 ?? null,
    wpm_q3: p.wpm_q3 ?? null,
    // Per-path pick-to-pick ms (017 step 28): median/quartiles + n per
    // source. Numbers only — no times of day, no sequences.
    path_ms: p.path_times ?? {},
    // The wrong-pick count (017 step 28 item 4).
    wrong_n: p.wrong_picks ?? 0,
    strip_share: p.words ? (p.sources?.strip ?? 0) / p.words : 0,
    layout: prf.board_layout ?? "grid60",
    mode: prf.presentation_mode ?? "symbol",
    age_days: firstDay == null ? 0 : dayRow.day - firstDay,
    ver: APP_VERSION,
  };
}

/** Post every unreported own-device row; mark each on success. Returns
 *  the number of rows sent. `fetchImpl`/`baseUrl` are injectable so the
 *  Works Test captures exactly what leaves the device. */
export async function flushResearch(
  db,
  { baseUrl = globalThis.location?.origin ?? "", fetchImpl = fetch, cap = 14 } = {},
) {
  const prf = profile(db);
  if (!(prf.share_research ?? 1)) return 0;
  const rid = ensureResearchId(db);
  const deviceId = getDeviceId();
  const firstDay = db.prepare("SELECT MIN(day) AS d FROM stats_day").all()[0]?.d ?? null;
  const rows = db
    .prepare(
      `SELECT day, payload FROM stats_day
       WHERE device_id = ? AND reported = 0
       ORDER BY day LIMIT ?`,
    )
    .all(deviceId, cap);
  const mark = db.prepare(
    "UPDATE stats_day SET reported = 1 WHERE day = ? AND device_id = ?",
  );
  let sent = 0;
  for (const row of rows) {
    const body = JSON.stringify(dayPayload(db, row, { rid, firstDay }));
    const res = await fetchImpl(`${baseUrl}/research`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }).catch(() => null);
    if (!res?.ok) break; // relay down or rejecting — retry next flush
    mark.run(row.day, deviceId);
    sent++;
  }
  return sent;
}
