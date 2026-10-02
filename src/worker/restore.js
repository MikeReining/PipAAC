// Restore by card (Sync_And_Web_Editing § 9): the 12 recovery words give
// the proof, and the proof finds the user. The R2 index maps
// SHA-256(proof) → user id — keyed by the hash because the proof itself
// is the restore credential, so the index must not hold it.

const te = new TextEncoder();
const hex = (buf) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export const proofIndexKey = async (proof) =>
  `ri/${hex(await crypto.subtle.digest("SHA-256", te.encode(proof)))}`;

/** Keep the card's proof findable; the old card's entry dies with its
 *  proof (bootstrap passes no old proof; Replace card passes the old). */
export async function indexProof(env, userId, oldProof, newProof) {
  if (!env.BLOBS) return;
  if (oldProof) await env.BLOBS.delete(await proofIndexKey(oldProof));
  await env.BLOBS.put(await proofIndexKey(newProof), userId);
}

/** POST /restore — unsigned like /users/:id/restore: the proof is the
 *  credential. Finds the user, then hands the same body to its relay. */
export async function restoreByProof(request, env) {
  const json = (data, status = 200) => new Response(JSON.stringify(data),
    { status, headers: { "content-type": "application/json; charset=utf-8" } });
  const body = await request.json().catch(() => null);
  if (typeof body?.proof !== "string") return json({ error: "forbidden" }, 403);
  const hit = await env.BLOBS.get(await proofIndexKey(body.proof));
  const userId = hit ? (await hit.text()).trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return json({ error: "forbidden" }, 403);
  const res = await env.RELAY.get(env.RELAY.idFromName(userId)).fetch(new Request(
    `https://relay/users/${userId}/restore`, { method: "POST", body: JSON.stringify(body) }));
  if (!res.ok) return res;
  return json({ ...(await res.json()), user_id: userId });
}
