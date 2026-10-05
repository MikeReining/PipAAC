/**
 * 030 — Picture Finder: POST /api/v1/pictures/find (+ /find-batch),
 * GET /api/v1/pictures/img/<image_id>, and the founder-only
 * /admin/v1/pictures/* index routes.
 *
 * Reuse first, draw last: every find embeds "text — description" with
 * the multilingual bge-m3 model and asks the Vectorize index for the
 * pictures we already own. `auto` is computed here only — the client
 * never applies its own threshold, so AUTO_CUTOFF stays a one-number
 * config edit (data/catalog/picture_finder.json).
 *
 * One Jev call per find classifies scope (personal|common), kind
 * (Fitzgerald role) and language — classifier only, it cannot write or
 * translate. No user, device, or license id leaves this Worker (§ 8).
 *
 * This file is the route barrel + the allowance/image/admin handlers.
 * Shared plumbing: pictures_shared.js. Find: pictures_find.js.
 * Signals: pictures_signals.js. Draw pipeline: pictures_draw.js.
 */
import { checkLicense } from "./license.mjs";
import { adminOk } from "./tile.js";
import {
  ALLOWANCE, entitlementFor,
} from "./pictures_draw.js";
import {
  BATCH_MAX, CFG, DESC_MAX, TEXT_MAX,
  cleanText, embed, findOne, json, okUuid, picPost, pictureStub,
} from "./pictures_shared.js";
import { vectorId } from "../shared/picture_index.mjs";

export { handleFind, handleFindBatch } from "./pictures_find.js";
export { handlePick, handleReject } from "./pictures_signals.js";
export { handleDraw } from "./pictures_draw.js";

/** GET /api/v1/pictures/allowance — headers x-pip-user / x-pip-license. */
export async function handleAllowance(request, env) {
  const uid = request.headers.get("x-pip-user");
  if (!okUuid(uid)) return json({ error: "bad_user_id" }, { status: 400 });
  if (!(await checkLicense(
    env.PIP_LICENSE_SECRET, uid, request.headers.get("x-pip-license")))) {
    return json({ error: "bad_license" }, { status: 403 });
  }
  if (!env.TILE_LEDGER) {
    return json({ error: "pictures_unavailable" }, { status: 503 });
  }
  const tier = await entitlementFor(env, uid);
  const cap = ALLOWANCE[tier] ?? ALLOWANCE.free;
  const res = await pictureStub(env).fetch(
    new Request(`https://tile/pic/allowance?uid=${uid}&cap=${cap}`));
  const { left } = await res.json().catch(() => ({}));
  if (typeof left !== "number") {
    return json({ error: "pictures_unavailable" }, { status: 503 });
  }
  return json({ left, total: cap });
}

/** GET /api/v1/pictures/img/<image_id> — license-gated streams for
 *  extended-library art (EXT_ART bucket) and drawn pictures (VOICE
 *  bucket `drawing/`). Catalog images are public/ statics and never
 *  reach this route. */
export async function handlePictureImage(request, env, imageId) {
  const uid = request.headers.get("x-pip-user");
  if (!okUuid(uid)) return json({ error: "bad_user_id" }, { status: 400 });
  if (!(await checkLicense(
    env.PIP_LICENSE_SECRET, uid, request.headers.get("x-pip-license")))) {
    return json({ error: "bad_license" }, { status: 403 });
  }
  let obj = null;
  if (imageId.startsWith("ext_")) {
    const slug = imageId.slice(4);
    if (!/^[a-z0-9_]+$/.test(slug)) return json({ error: "not_found" }, { status: 404 });
    obj = await env.EXT_ART?.get(`symbols/extended/${slug}.png`).catch(() => null);
  } else if (imageId.startsWith("drw_")) {
    const key = imageId.slice(4);
    if (!/^[0-9a-f]{64}$/.test(key)) return json({ error: "not_found" }, { status: 404 });
    obj = await env.VOICE?.get(`drawing/${key}.png`).catch(() => null);
  }
  if (!obj) return json({ error: "not_found" }, { status: 404 });
  return new Response(obj.body, {
    headers: { "content-type": "image/png", "cache-control": "private, max-age=86400" },
  });
}

/* ----------------------------- admin routes ---------------------------- */

const INDEX_BINDINGS = {
  main: "PICTURES",
  calibration: "PICTURES_CALIB",
};

/** Founder-only index plumbing: embeds captions through Workers AI and
 *  upserts into the Vectorize binding. Bearer PIP_ADMIN_TOKEN. */
export async function handlePicturesAdmin(request, env, url) {
  if (!(await adminOk(request, env))) {
    return json({ error: "unauthorized" }, { status: 401 });
  }
  const path = url.pathname;

  if (path === "/admin/v1/pictures/index" && request.method === "POST") {
    const body = await request.json().catch(() => null);
    const binding = INDEX_BINDINGS[body?.index ?? "main"];
    const rows = Array.isArray(body?.rows) ? body.rows : null;
    if (!binding || !rows || rows.length === 0 || rows.length > 256) {
      return json({ error: "bad_request" }, { status: 400 });
    }
    const index = env[binding];
    if (!env.AI || !index) return json({ error: "pictures_unavailable" }, { status: 503 });
    const captions = rows.map((r) => String(r?.caption ?? ""));
    if (captions.some((c) => !c)) return json({ error: "bad_caption" }, { status: 400 });
    const vectors = await embed(env, captions);
    await index.upsert(rows.map((r, i) => ({
      id: vectorId(String(r.image_id)),
      values: vectors[i],
      metadata: {
        image_id: String(r.image_id),
        asset: String(r.asset ?? ""),
        source: String(r.source ?? ""),
        status: String(r.status ?? "approved"),
        caption: captions[i],
        fitzgerald_role: String(r.fitzgerald_role ?? ""),
        lens: String(r.lens ?? ""),
        caption_version: Number(r.caption_version ?? CFG.caption_version),
      },
    })));
    return json({ upserted: rows.length });
  }

  if (path === "/admin/v1/pictures/index/info" && request.method === "GET") {
    const info = {};
    for (const [name, binding] of Object.entries(INDEX_BINDINGS)) {
      info[name] = env[binding] ? await env[binding].describe().catch(() => null) : null;
    }
    return json(info);
  }

  // § 9 — founder view of recent drawings (newest first, paginated).
  if (path === "/admin/v1/pictures/recent" && request.method === "GET") {
    if (!env.TILE_LEDGER) return json({ error: "pictures_unavailable" }, { status: 503 });
    const res = await pictureStub(env).fetch(new Request(
      `https://tile/pic/draw/recent?before=${url.searchParams.get("before") ?? ""}&limit=${url.searchParams.get("limit") ?? ""}`));
    return json(await res.json());
  }

  // § 5.5 — "where families disagreed with us": common-scope rows only,
  // grouped (text, ours), with what families chose instead.
  if (path === "/admin/v1/pictures/disagreements" && request.method === "GET") {
    if (!env.TILE_LEDGER) return json({ error: "pictures_unavailable" }, { status: 503 });
    const res = await pictureStub(env).fetch(new Request(
      `https://tile/pic/disagreements?limit=${url.searchParams.get("limit") ?? ""}`));
    return json(await res.json());
  }
  // Founder rulings — each is logged with a timestamp (§ 5.5). Pin makes
  // their picture the auto default for everyone; block keeps ours listed
  // but never auto; dismiss hides the group until new rejections arrive.
  // Promote and redraw only queue (admin_log) — redraws run founder-gated
  // in batches of at most ten, never silently.
  if (path.startsWith("/admin/v1/pictures/disagreements/")
      && request.method === "POST") {
    if (!env.TILE_LEDGER) return json({ error: "pictures_unavailable" }, { status: 503 });
    const action = path.split("/").pop();
    const body = await request.json().catch(() => null);
    const textNorm = typeof body?.text_norm === "string" ? body.text_norm : null;
    const theirs = typeof body?.theirs === "string" ? body.theirs : null;
    const ours = typeof body?.ours === "string" ? body.ours : null;
    const description = cleanText(body?.description, DESC_MAX);
    if (!textNorm) return json({ error: "bad_request" }, { status: 400 });

    const doPost = (p, b) => picPost(env, p, b).then((r) => r.ok);
    let ok = false;
    if (action === "pin") {
      ok = theirs && await doPost("/pic/pin", { text_norm: textNorm, image_id: theirs });
    } else if (action === "unpin") {
      ok = await doPost("/pic/unpin", { text_norm: textNorm });
    } else if (action === "block") {
      ok = theirs && await doPost("/pic/block", { text_norm: textNorm, image_id: theirs });
    } else if (action === "unblock") {
      ok = theirs && await doPost("/pic/unblock", { text_norm: textNorm, image_id: theirs });
    } else if (action === "dismiss") {
      ok = ours && await doPost("/pic/dismiss", { textNorm, ours });
    } else if (action === "promote" || action === "redraw") {
      // The log entry IS the queue — one row, no second write. A redraw
      // queue row without a hint is useless (§ 5.5: their description is
      // the hint).
      if (action === "redraw" && !description) {
        return json({ error: "bad_request" }, { status: 400 });
      }
      ok = await doPost("/pic/admin-log", {
        action, textNorm, ours, theirs, detail: description ?? undefined,
      });
      return ok ? new Response(null, { status: 204 })
        : json({ error: "bad_request" }, { status: 400 });
    } else {
      return json({ error: "not_found" }, { status: 404 });
    }
    if (!ok) return json({ error: "bad_request" }, { status: 400 });
    await doPost("/pic/admin-log", {
      action, textNorm, ours, theirs, detail: description ?? undefined,
    });
    return new Response(null, { status: 204 });
  }

  // Calibration page (§ 7): same pipeline as find, on the chosen index,
  // including pending rows — founder-only, never the app's find path.
  if (path === "/admin/v1/pictures/find" && request.method === "POST") {
    const body = await request.json().catch(() => null);
    const binding = INDEX_BINDINGS[body?.index ?? "calibration"];
    const items = Array.isArray(body?.items) ? body.items : null;
    if (!binding || !items || items.length === 0 || items.length > BATCH_MAX) {
      return json({ error: "bad_request" }, { status: 400 });
    }
    if (!env.AI || !env[binding]) {
      return json({ error: "pictures_unavailable" }, { status: 503 });
    }
    const results = await Promise.all(items.map((it) => {
      const text = cleanText(it?.text, TEXT_MAX);
      const description = cleanText(it?.description, DESC_MAX);
      return text && description !== null
        ? findOne(env, {
          text, description, locale: it?.locale ?? body?.locale,
          binding, includePending: true,
        })
        : { error: "bad_text" };
    }));
    return json({ results });
  }

  return json({ error: "not_found" }, { status: 404 });
}
