/**
 * 029 — the client side of the Picture Finder (030). One module owns
 * the calls (find, find-batch, draw, pick, reject, allowance, image
 * bytes) and one pure rule, `pictureAction`, owns what the add card does
 * with a find result. The server computes `auto`; the client never
 * applies a threshold of its own (030 § 4.2).
 *
 * Nothing here decides scope or kind — those are Jev's answers, passed
 * through. Credentials are supplied per call (they may rotate).
 */

/** What the card does with a find result (029 § 4.1):
 *  - apply   — a close picture exists (server `auto`): use it, free
 *  - draw    — nothing close, a common word, the finder is calibrated
 *  - choose  — show the candidates and let the adult pick (people and
 *              pets, an uncalibrated finder, or no scope answer)
 *  - none    — nothing to offer at all
 *  A null scope never auto-draws (030 § 4.3 fail-closed). */
export function pictureAction(found) {
  if (!found) return { kind: "none" };
  const candidates = Array.isArray(found.candidates) ? found.candidates : [];
  if (found.auto) {
    const pick = candidates.find((c) => c.image_id === found.auto);
    if (pick) {
      return {
        kind: "apply", picture: pick,
        others: candidates.filter((c) => c.image_id !== found.auto).slice(0, 3),
      };
    }
  }
  if (found.scope === "common" && found.calibrated) {
    return { kind: "draw", others: candidates.slice(0, 3) };
  }
  if (candidates.length) {
    return { kind: "choose", others: candidates.slice(0, 4), personal: found.scope === "personal" };
  }
  return { kind: "none", personal: found.scope === "personal" };
}

/** Jev's Fitzgerald answer → the entity's role. "None" (a fringe noun)
 *  renders as a thing, which is Yellow on this board. */
export const roleForKind = (kind) =>
  ["Yellow", "Green", "Blue", "Pink", "Purple", "Red"].includes(kind) ? kind
    : kind === "None" ? "Yellow" : null;

/** A paste row needs a new drawing when nothing close exists for a
 *  common word and the finder is calibrated (§ 5 — the count the list
 *  asks about). */
export const needsDraw = (found) => pictureAction(found).kind === "draw";

/** § 5: ask once before a list spends drawings — more than 10, or more
 *  than are left. `left` null (unknown) never blocks. */
export const shouldConfirmDraws = (count, left) =>
  count > 10 || (typeof left === "number" && count > left);

const failReason = (status, body) => {
  if (status === 402) return "allowance";
  if (status === 422) return "unsafe";
  if (status === 429) return "fair_use";
  if (status === 400) return body?.error === "bad_description" ? "needs_description" : "bad_text";
  if (status === 403) return "denied";
  return "unavailable";
};

export function pictureClient({ base = "", fetchFn = (...a) => fetch(...a) } = {}) {
  const post = async (path, body) => {
    const res = await fetchFn(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return res;
  };

  /** 030 find — {candidates, auto, scope, kind, language, calibrated}, or
   *  {error} (offline, 503, 429…). Never throws. */
  async function find({ userId, license, text, description = null, locale }) {
    if (!userId || !license) return { error: "unavailable" };
    try {
      const res = await post("/api/v1/pictures/find",
        { user_id: userId, license, text, description, locale });
      if (!res.ok) return { error: failReason(res.status, await res.json().catch(() => null)) };
      return await res.json();
    } catch {
      return { error: "offline" };
    }
  }

  async function findBatch({ userId, license, items, locale }) {
    if (!userId || !license || !items.length) return { error: "unavailable" };
    try {
      const res = await post("/api/v1/pictures/find-batch",
        { user_id: userId, license, items, locale });
      if (!res.ok) return { error: failReason(res.status, await res.json().catch(() => null)) };
      return await res.json();
    } catch {
      return { error: "offline" };
    }
  }

  /** 030 draw — {ok, blob, imageId, cache: hit|mint|stub, left} or
   *  {ok:false, reason, left?}. A hit is free; a mint spent one drawing. */
  async function draw({ userId, license, text, description = null, locale }) {
    if (!userId || !license) return { ok: false, reason: "unavailable" };
    try {
      const res = await post("/api/v1/pictures/draw",
        { user_id: userId, license, text, description, locale });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        return { ok: false, reason: failReason(res.status, body), left: body?.left ?? null };
      }
      const key = res.headers.get("x-draw-key");
      const left = res.headers.get("x-drawings-left");
      return {
        ok: true,
        blob: await res.blob(),
        imageId: key ? `drw_${key}` : null,
        cache: res.headers.get("x-draw-cache") ?? "mint",
        left: left == null ? null : Number(left),
      };
    } catch {
      return { ok: false, reason: "offline" };
    }
  }

  /** Anonymous crowd signals (030 § 6.2–6.3). Fire-and-forget: a lost
   *  signal costs nothing, so failures are swallowed. */
  async function pick({ userId, license, text, description = null, imageId }) {
    if (!userId || !license || !imageId) return false;
    const res = await post("/api/v1/pictures/pick",
      { user_id: userId, license, text, description, image_id: imageId }).catch(() => null);
    return res?.status === 204;
  }

  async function reject({ userId, license, text, description = null, ours, action, theirs = null }) {
    if (!userId || !license || !ours) return false;
    const body = { user_id: userId, license, text, description, ours, action };
    if (action !== "photo" && theirs) body.theirs = theirs; // a photo is never sent
    const res = await post("/api/v1/pictures/reject", body).catch(() => null);
    return res?.status === 204;
  }

  async function allowance({ userId, license }) {
    if (!userId || !license) return null;
    try {
      const res = await fetchFn(`${base}/api/v1/pictures/allowance`, {
        headers: { "x-pip-user": userId, "x-pip-license": license },
      });
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  }

  /** Candidate bytes: catalog art is a public static; extended and drawn
   *  pictures stream from the license-gated image route. */
  async function imageBlob({ userId, license, asset }) {
    if (!asset) return null;
    try {
      const gated = asset.startsWith("/api/v1/pictures/img/");
      const res = await fetchFn(`${base}${asset}`, gated
        ? { headers: { "x-pip-user": userId, "x-pip-license": license } }
        : undefined);
      return res.ok ? await res.blob() : null;
    } catch {
      return null;
    }
  }

  return { find, findBatch, draw, pick, reject, allowance, imageBlob };
}
