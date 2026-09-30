/**
 * 030 — the picture index's shared truths: query/caption recipes, the
 * score + auto rule, the draw key recipe, and the Jev language tiebreak.
 * Pure module: no Node APIs, no fetch — safe in the Worker, in scripts,
 * and in tests.
 *
 * A picture is chosen by meaning (captions embed semantics); the record
 * that proves a picture exists is the Vectorize row itself. Names never
 * enter any caption or pick/reject key (030 § 3.3, § 6.2).
 */
import { normalizeV1 } from "../../public/shared/normalize.mjs";

/** Query text: normalized typed text plus the optional description the
 *  adult wrote, joined by the same " — " separator drawn captions use. */
export function queryText(text, description) {
  const t = normalizeV1(String(text ?? ""));
  const d = normalizeV1(String(description ?? ""));
  return d ? `${t} — ${d}` : t;
}

/** The key pick/reject/pin/block rows are stored under. Personal-scope
 *  queries count against the description — never the name (§ 3.3, § 6.2). */
export function signalsKey(scope, text, description) {
  if (scope === "personal") return normalizeV1(String(description ?? ""));
  return normalizeV1(String(text ?? ""));
}

/* ------------------------------ captions ------------------------------ */

/** Catalog: every English label of the sense + its category
 *  ("apple · Food & Drink"). */
export function captionForCatalog(labels, category) {
  const parts = [...new Set(labels.map((l) => String(l).trim()).filter(Boolean))];
  if (category) parts.push(String(category).trim());
  return parts.join(" · ");
}

/** Extended library: label + section + Jev spec framing
 *  ("applesauce · Food & Drink · object"). */
export function captionForExtended(label, section, spec) {
  const parts = [String(label ?? "").trim()];
  if (section) parts.push(String(section).trim());
  const framing = spec?.framing ?? spec?.entity_mode ?? null;
  if (framing) parts.push(String(framing));
  return parts.filter(Boolean).join(" · ");
}

/** Drawn: the text + description that produced it — except `personal`,
 *  where the caption is the description alone ("our golden retriever",
 *  never "Cooper"). */
export function captionForDrawing({ scope, text, description }) {
  if (scope === "personal") return normalizeV1(String(description ?? ""));
  return queryText(text, description);
}

/** The caption segments that are word labels — the " · "-separated
 *  parts once caption metadata is stripped. Recipes are positional:
 *  catalog = "label · label · category" (every category contains "&"
 *  or ",", labels don't); extended = "label · section · framing" (only
 *  the first segment is the word); drawn = bare text/description. */
export function captionLabels(caption, source) {
  const segs = String(caption ?? "")
    .split(" · ").map(normalizeV1).filter(Boolean);
  if (source === "extended") return segs.slice(0, 1);
  if (segs.length > 1 && /[&,]/.test(segs[segs.length - 1])) segs.pop();
  return segs;
}

/* ------------------------------ draw keys ------------------------------ */

/** § 5.1 subject: personal keys by description alone so "Cooper — our
 *  golden retriever" and "Max — our golden retriever" share a drawing. */
export function drawSubject({ scope, text, description }) {
  if (scope === "personal") return normalizeV1(String(description ?? ""));
  return `${normalizeV1(String(text ?? ""))}|${normalizeV1(String(description ?? ""))}`;
}

const te = new TextEncoder();
export async function drawKey(styleVersion, subject) {
  const buf = await crypto.subtle.digest(
    "SHA-256", te.encode(`${styleVersion}|${subject}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ------------------------------ scoring ------------------------------- */

/** § 4.2 — Vectorize cosine plus the anonymous crowd signal. */
export function scoreOf(cosine, { picks = 0, rejects = 0 } = {}, cfg) {
  return cosine
    + (cfg.pick_weight ?? 0) * Math.log1p(picks)
    - (cfg.reject_weight ?? 0) * Math.log1p(rejects);
}

export function cutoffFor(cfg, language) {
  return (language && cfg.auto_cutoff_by_lang?.[language]) ?? cfg.auto_cutoff;
}

/** § 4.2 — the server-side auto rule, two tiers. A founder pin beats
 *  everything. Tier 1 is identity: when the typed English common word
 *  IS a candidate's label ("stop" inside "stop · stops · stopping"),
 *  that picture applies regardless of cosine rank — go/stop/want sit
 *  in a dense control-word neighbourhood where similarity can't
 *  express identity (the real "stop" symbol once ranked 4th behind
 *  off/out/stoplight). English-only: captions are English, so a
 *  false friend like French "pain" never steals the English "pain"
 *  symbol. Personal scope and described queries skip tier 1 — the
 *  name/description is the meaning, not the bare word. Homographs
 *  (bat-animal vs bat-sport) arbitrate by score among exact matches.
 *  A blocked exact match means null — the founder rejected this
 *  word's obvious picture, so no neighbour may substitute.
 *  Tier 1 also checks the lexical label map (`direct` entries from
 *  data/catalog/picture_labels.json): an identical word can rank below
 *  fetch_k in the embedding ("eat", "no"), so the dictionary — not the
 *  vector — decides identity. One label naming two senses ("orange"
 *  the colour and the fruit, "bat" the animal and the baseball bat)
 *  is a real homograph: identity can't arbitrate, so NOTHING
 *  auto-applies — the homographs are listed as candidates and the
 *  adult picks. A founder pin still wins: the pin IS the arbitration.
 *  Tier 2 is similarity: the top score must clear its language's
 *  cutoff and not be blocked. A blocked top means null. */
export function decideAuto(
  { candidates = [], pool = null, pinned = null, blocked = [],
    text = null, description = null, scope = null, direct = null } = {},
  cfg, language,
) {
  if (pinned) return pinned;
  if (scope === "common" && language === "en" && text && !normalizeV1(String(description ?? ""))) {
    const q = normalizeV1(text);
    const homograph = new Set((direct ?? []).map((e) => e.sense ?? e.image_id)).size > 1;
    if (homograph) return null;
    const exact = new Map();
    for (const e of direct ?? []) exact.set(e.image_id, e);
    for (const c of pool ?? candidates) {
      if (captionLabels(c.caption, c.source).includes(q)) exact.set(c.image_id, c);
    }
    if (exact.size) {
      const pick = [...exact.values()]
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .find((c) => !blocked.includes(c.image_id));
      return pick ? pick.image_id : null;
    }
  }
  const top = candidates[0];
  if (!top) return null;
  if (blocked.includes(top.image_id)) return null;
  return top.score >= cutoffFor(cfg, language) ? top.image_id : null;
}

/* ------------------------------ language ------------------------------ */

export function localeIso(locale) {
  return String(locale ?? "").trim().toLowerCase().replace(/_/g, "-").split("-")[0] || null;
}

/** § 4.3 — Jev's language label picks the cutoff. When its top two
 *  languages are within `margin` and the app locale is one of them, the
 *  locale breaks the tie ("Gift", "chat", "pain"). */
export function resolveLanguage({ choice = null, probabilities = {}, locale = null, margin = 0.15 } = {}) {
  const loc = localeIso(locale);
  if (!loc) return choice;
  const entries = Object.entries(probabilities).sort((a, b) => b[1] - a[1]);
  const top = entries[0], second = entries[1];
  if (!top) return choice ?? loc;
  const inTopTwo = top[0] === loc || second?.[0] === loc;
  const close = second && (top[1] - second[1]) <= margin;
  if (loc && loc !== choice && inTopTwo && close) return loc;
  return choice ?? loc;
}
