/** 030 § find — POST /api/v1/pictures/find (+ /find-batch): embed the
 *  "text — description" pair, rank the Vectorize index, charge the
 *  fair-use counter. Shared plumbing lives in pictures_shared.js. */
import {
  BATCH_MAX, DESC_MAX, TEXT_MAX, cleanText, findGuard, findOne, json,
} from "./pictures_shared.js";
import { usageRefund } from "./voice.js";

export async function handleFind(request, env, ctx) {
  const body = await request.json().catch(() => null);
  const { uid, err } = await findGuard(body, env);
  if (err) return err;
  const text = cleanText(body?.text, TEXT_MAX);
  const description = cleanText(body?.description, DESC_MAX);
  if (!text || description === null) {
    await usageRefund(env, { ns: "usage-pic", uid, chars: 1 });
    return json({ error: "bad_text" }, { status: 400 });
  }
  // The guard's reservation already billed this request (043 I).
  const result = await findOne(env, { text, description, locale: body?.locale })
    .catch(async (e) => {
      await usageRefund(env, { ns: "usage-pic", uid, chars: 1 });
      throw e;
    });
  return json(result);
}

/** POST /api/v1/pictures/find-batch {…, items:[{text, description?}]×≤50} */
export async function handleFindBatch(request, env, ctx) {
  const body = await request.json().catch(() => null);
  const items = Array.isArray(body?.items) ? body.items : null;
  if (!items || items.length === 0 || items.length > BATCH_MAX) {
    return json({ error: "bad_items" }, { status: 400 });
  }
  const { uid, err } = await findGuard(body, env, items.length);
  if (err) return err;
  const cleaned = items.map((it) => ({
    text: cleanText(it?.text, TEXT_MAX),
    description: cleanText(it?.description, DESC_MAX),
  }));
  const results = await Promise.all(cleaned.map(async (it) =>
    it.text && it.description !== null
      ? findOne(env, { ...it, locale: body?.locale })
      : { error: "bad_text" })).catch(async (e) => {
    await usageRefund(env, { ns: "usage-pic", uid, chars: items.length });
    throw e;
  });
  return json({ results });
}

/* ------------------------------ pick (§ 6.2) ------------------------------ */

