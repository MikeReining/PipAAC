/** 030 § 6.2/6.3 — pick and reject: the anonymous crowd signals that
 *  steer everyone's ranking. Scope comes from Jev, never the client;
 *  a null scope fails closed (a stored "common" would leak a personal
 *  name). Posts land on the Tile-ledger DO via picPost. */
import { checkLicense } from "./license.mjs";
import { usageRefund, usageReserve } from "./voice.js";
import { signalsKey } from "../shared/picture_index.mjs";
import {
  DESC_MAX, TEXT_MAX, classify, cleanText, isUnsafe, json, okUuid, picPost,
} from "./pictures_shared.js";

const PICK_NS = "usage-pick";
const PICK_DAY = 200; // § 6.2 — one account cannot steer everyone's ranking
const PICK_MIN = 30;

/** POST /api/v1/pictures/pick {user_id, license, text, description?,
 *  image_id} → 204. Anonymous crowd signal: the row key is the § 3.3
 *  signals key, so a personal pick stores the description, never a name —
 *  scope comes from Jev (the client can hint but never decides). */
export async function handlePick(request, env, ctx) {
  const body = await request.json().catch(() => null);
  const uid = typeof body?.user_id === "string" ? body.user_id : null;
  if (!okUuid(uid)) return json({ error: "bad_user_id" }, { status: 400 });
  if (!(await checkLicense(env.PIP_LICENSE_SECRET, uid, body?.license))) {
    return json({ error: "bad_license" }, { status: 403 });
  }
  const text = cleanText(body?.text, TEXT_MAX);
  const description = cleanText(body?.description, DESC_MAX);
  const imageId = typeof body?.image_id === "string" ? body.image_id.slice(0, 128) : null;
  if (!text || (body?.description != null && description === null) || !imageId) {
    return json({ error: "bad_request" }, { status: 400 });
  }
  if (!env.VOICE || !env.TILE_LEDGER) {
    return json({ error: "pictures_unavailable" }, { status: 503 });
  }
  const guard = await usageReserve(env, {
    ns: PICK_NS, uid, chars: 1, maxChars: 1, dayBudget: PICK_DAY, minBudget: PICK_MIN,
  });
  if (!guard.allowed) {
    return json({ error: "fair_use", over: guard.over }, { status: 429 });
  }

  let jev;
  try {
    jev = await classify(env, { text, description });
  } catch {
    jev = null;
  }
  // Fail closed: a null scope stored "common" would write a personal
  // name into the anonymous pick table. The client never decides scope.
  if (!jev?.scope) {
    await usageRefund(env, { ns: PICK_NS, uid, chars: 1 });
    return json({ error: "classify_unavailable" }, { status: 503 });
  }
  const scope = jev.scope === "personal" ? "personal" : "common";
  if (scope === "personal" && !description) {
    await usageRefund(env, { ns: PICK_NS, uid, chars: 1 });
    return json({ error: "bad_description" }, { status: 400 });
  }
  const textNorm = signalsKey(scope, text, description);
  if (!textNorm) {
    await usageRefund(env, { ns: PICK_NS, uid, chars: 1 });
    return json({ error: "bad_request" }, { status: 400 });
  }

  const res = await picPost(env, "/pic/pick", { text_norm: textNorm, image_id: imageId })
    .catch(() => null);
  if (!res?.ok) {
    await usageRefund(env, { ns: PICK_NS, uid, chars: 1 });
    return json({ error: "pick_failed" }, { status: 502 });
  }
  return new Response(null, { status: 204 });
}

/* ------------------------------ reject (§ 6.3) ---------------------------- */

const REJECT_NS = "usage-reject";
const REJECT_ACTIONS = new Set(["pick", "photo", "draw"]);

/** POST /api/v1/pictures/reject {user_id, license, text, description?,
 *  ours, action: pick|photo|draw, theirs?} → 204. The adult replaced the
 *  picture we chose: demote ours for everyone and keep one anonymous
 *  disagreement row for the § 5.5 review. A photo is counted, never seen;
 *  a personal rejection keys on the description, never the name. */
export async function handleReject(request, env, ctx) {
  const body = await request.json().catch(() => null);
  const uid = typeof body?.user_id === "string" ? body.user_id : null;
  if (!okUuid(uid)) return json({ error: "bad_user_id" }, { status: 400 });
  if (!(await checkLicense(env.PIP_LICENSE_SECRET, uid, body?.license))) {
    return json({ error: "bad_license" }, { status: 403 });
  }
  const text = cleanText(body?.text, TEXT_MAX);
  const description = cleanText(body?.description, DESC_MAX);
  const ours = typeof body?.ours === "string" ? body.ours.slice(0, 128) : null;
  const action = body?.action;
  const theirs = typeof body?.theirs === "string" ? body.theirs.slice(0, 128) : null;
  if (!text || (body?.description != null && description === null)
      || !ours || !REJECT_ACTIONS.has(action)) {
    return json({ error: "bad_request" }, { status: 400 });
  }
  if (action === "photo" && theirs) {
    return json({ error: "bad_request" }, { status: 400 }); // photos are never seen
  }
  if (action === "draw" && !/^drw_[0-9a-f]{64}$/.test(theirs ?? "")) {
    return json({ error: "bad_request" }, { status: 400 }); // theirs is the new drw_*
  }
  if (!env.VOICE || !env.TILE_LEDGER) {
    return json({ error: "pictures_unavailable" }, { status: 503 });
  }
  // § 5.5 shows reject descriptions on the founder's review page — only
  // descriptions that pass the § 5.3 safety check may be stored there.
  if (isUnsafe(text, description)) {
    return json({ error: "unsafe" }, { status: 422 });
  }
  const guard = await usageReserve(env, {
    ns: REJECT_NS, uid, chars: 1, maxChars: 1, dayBudget: PICK_DAY, minBudget: PICK_MIN,
  });
  if (!guard.allowed) {
    return json({ error: "fair_use", over: guard.over }, { status: 429 });
  }

  let jev;
  try {
    jev = await classify(env, { text, description });
  } catch {
    jev = null;
  }
  // Fail closed: a null scope stored "common" would leak a name into the
  // disagreement rows and onto the founder's review page (§ 5.5, § 8).
  if (!jev?.scope) {
    await usageRefund(env, { ns: REJECT_NS, uid, chars: 1 });
    return json({ error: "classify_unavailable" }, { status: 503 });
  }
  const scope = jev.scope === "personal" ? "personal" : "common";
  if (scope === "personal" && !description) {
    await usageRefund(env, { ns: REJECT_NS, uid, chars: 1 });
    return json({ error: "bad_description" }, { status: 400 });
  }
  const textNorm = signalsKey(scope, text, description);
  if (!textNorm) {
    await usageRefund(env, { ns: REJECT_NS, uid, chars: 1 });
    return json({ error: "bad_request" }, { status: 400 });
  }

  const res = await picPost(env, "/pic/reject", {
    text_norm: textNorm, ours, action,
    theirs: action === "photo" ? null : theirs,
    description, scope,
  }).catch(() => null);
  if (!res?.ok) {
    await usageRefund(env, { ns: REJECT_NS, uid, chars: 1 });
    return json({ error: "reject_failed" }, { status: 502 });
  }
  return new Response(null, { status: 204 });
}
