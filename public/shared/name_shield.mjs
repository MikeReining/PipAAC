/**
 * 023 §5.2 — her people's names never leave the device.
 *
 * `maskNames` swaps the family's entity names (people, pets from
 * personal_entity.spoken_name) for PERSON1, PERSON2… before the
 * sentence goes to the transform route; `unmask` puts the real
 * spelling back into whatever the model returned, so *"PERSON1 fell
 * down."* comes home as *"Leo fell down."*
 *
 * Matching is whole-phrase, longest-first ("Grandma Sue" beats
 * "Grandma"), case-insensitive on the way out and on the way back
 * (the model may lowercase the token or add a possessive — the 's
 * stays attached to the restored name).
 */
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function maskNames(text, names) {
  const seen = new Set();
  const hits = [];
  for (const n of [...names].filter(Boolean).sort((a, b) => b.length - a.length)) {
    const key = n.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    if (new RegExp(`\\b${escape(key)}\\b`).test(text.toLowerCase())) {
      seen.add(key);
      hits.push(n.trim());
    }
  }
  if (!hits.length) return { masked: text, unmask: (out) => out };

  const map = new Map(hits.map((n, i) => [`PERSON${i + 1}`, n]));
  const masked = text.replace(
    new RegExp(`\\b(?:${hits.map(escape).join("|")})\\b`, "gi"),
    (m) => `PERSON${hits.findIndex((n) => n.toLowerCase() === m.toLowerCase()) + 1}`);

  const unmask = (out) =>
    out.replace(/\bperson(\d+)\b/gi, (m, n) => map.get(`PERSON${n}`) ?? m);
  return { masked, unmask };
}

/** Sentence-level helper: all entity names the family entered. */
export function entityNames(db) {
  return db.prepare(
    "SELECT spoken_name FROM personal_entity WHERE spoken_name IS NOT NULL",
  ).all().map((r) => r.spoken_name);
}
