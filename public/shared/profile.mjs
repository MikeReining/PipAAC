/**
 * Profile resolution (schema §7.1) — read once at boot, bound into every
 * label query and speech call. The learner_profile row plus the write
 * triggers already forbid a cross-locale or inactive preferred voice, but
 * the fallback chain is implemented anyway so a stale row resolves to the
 * locale's default, never to another language's voice.
 *
 * Minimal db interface shared with groups.mjs: prepare(sql).all(...params).
 */

const one = (db, sql, params = []) => db.prepare(sql).all(...params)[0];

/**
 * @returns {{ locale: string, voiceId: string | null }}
 *   voiceId is null when the profile locale has no usable voice — every
 *   slot is then silence (§7.1 step 3). Another locale is never used.
 */
export function resolveProfile(db) {
  const p = one(
    db,
    "SELECT locale, preferred_voice_id FROM learner_profile ORDER BY rowid LIMIT 1",
  );
  if (!p) throw new Error("resolveProfile: no learner_profile row");
  const preferred = one(
    db,
    "SELECT id FROM voice WHERE id = ? AND status = 'active' AND locale = ?",
    [p.preferred_voice_id, p.locale],
  );
  if (preferred) return { locale: p.locale, voiceId: preferred.id };
  const fallback = one(
    db,
    "SELECT id FROM voice WHERE locale = ? AND is_default = 1 AND status = 'active'",
    [p.locale],
  );
  return { locale: p.locale, voiceId: fallback?.id ?? null };
}
