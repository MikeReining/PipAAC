/**
 * The Nest link (SLPNest docs/product/Sibling_Contract.md). A family link
 * carries ?nest=<student code>; the code stays on the device (kv — same
 * boundary as the local event log). Goal-word taps emit the Nest `aac`
 * shape to its unauthenticated /api/events: the child's own tap is
 * `independent`, a supporter's live model is `modeled`.
 *
 * Injectable storage/fetch/origin so the whole path runs in node against
 * the real Nest handler.
 */

export const NEST_PROD_ORIGIN = "https://app.slpnest.com";
const NEST_DEV_ORIGIN = "http://localhost:8795";
const LOOPBACK = ["localhost", "127.0.0.1", "[::1]"];

/** The Nest's production origin everywhere but this Mac, where its dev server runs. */
export function nestOriginFor(hostname) {
  return LOOPBACK.includes(hostname) ? NEST_DEV_ORIGIN : NEST_PROD_ORIGIN;
}

export const NEST_ORIGIN = nestOriginFor(globalThis.location?.hostname);

const LS_CODE = "pipaac.nestCode";
const LS_TARGETS = "pipaac.nestTargets";
const CODE_RE = /^[2-9A-HJKMNP-Z]{6}$/;

export function captureNest(search, storage) {
  const code = new URLSearchParams(search).get("nest");
  if (!code || !CODE_RE.test(code)) return null;
  storage.setItem(LS_CODE, code);
  return code;
}

export const nestCode = (storage) => storage.getItem(LS_CODE) ?? null;

/** The child's practice targets from the Nest — cached on the device. */
export async function nestTargets(code, { storage, fetchImpl, origin = NEST_ORIGIN } = {}) {
  try {
    const r = await fetchImpl(`${origin}/api/students/${code}/practice`);
    if (!r.ok) return [];
    const { targets } = await r.json();
    storage?.setItem(LS_TARGETS, JSON.stringify(targets));
    return targets;
  } catch {
    try {
      return JSON.parse(storage?.getItem(LS_TARGETS) ?? "[]");
    } catch {
      return [];
    }
  }
}

/** The canonical key for the child's first target of a kind. */
export function nestTargetKey(kind, storage) {
  try {
    const t = JSON.parse(storage.getItem(LS_TARGETS) ?? "[]").find((x) => x.kind === kind);
    if (!t) return null;
    switch (t.kind) {
      case "articulation":
        return `articulation:${t.sound}:${t.position}:${t.level}` + (t.context ? `:${t.context}` : "");
      case "phonology": return `phonology:${t.process}:${t.contrast.replaceAll("/", "-")}`;
      case "language": return `language:${t.area}`;
      case "literacy": return `literacy:${t.step}`;
      case "aac": return `aac:${t.list}`;
      default: return null;
    }
  } catch {
    return null;
  }
}

export async function emitNest(event, { fetchImpl, origin = NEST_ORIGIN } = {}) {
  try {
    const r = await fetchImpl(`${origin}/api/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
      keepalive: true,
    });
    return r.ok;
  } catch {
    return false; // offline: the tap still counts locally
  }
}

/** Is kind:id on a list marked Track progress? (016 § 5 goal lists.) */
export function isGoalWord(db, kind, id) {
  const r = db.prepare(
    `SELECT 1 AS x FROM spotlight_item i
     JOIN spotlight_list l ON l.id = i.list_id
     WHERE l.is_goal = 1 AND i.kind = ? AND i.item_id = ? LIMIT 1`,
  ).all(kind, String(id));
  return r.length > 0;
}

/** The Nest aac event for one goal-word act. outcome: independent|modeled. */
export function goalWordEvent(code, outcome, { at, targetKey }) {
  return {
    code, app: "talk", activity: "board", source: "aac", outcome,
    n: 1, place: "home", at, target: targetKey,
  };
}

/**
 * The emit wiring a tap path calls: fires only when a Nest code is stored,
 * the item is a goal word, and the child has an aac target (the contract
 * requires `target` on aac events). Fire-and-forget by design.
 */
export function maybeEmitGoalWord(db, kind, id, outcome, { storage, fetchImpl, origin }) {
  const code = nestCode(storage);
  if (!code || !isGoalWord(db, kind, id)) return false;
  const targetKey = nestTargetKey("aac", storage);
  if (!targetKey) return false;
  emitNest(goalWordEvent(code, outcome, { at: new Date().toISOString(), targetKey }), { fetchImpl, origin });
  return true;
}
