/** One liveness rule for every sync seam: an await that never settles
 *  must surface as an error and free the queue behind it — never freeze
 *  a serialized chain silently. A stalled fetch, an IndexedDB
 *  transaction that never completes, or a Web Lock that is never
 *  granted would otherwise wedge the outbox for the session: ops kept
 *  logging locally while nothing ever reached the relay.
 *
 *  A deadline is also only a fence for the CALLER — it cannot stop a
 *  physical operation that is already running. Seams that own durable
 *  state therefore carry a `ticket`: expiry marks it, the seam checks
 *  it before every commit/status write, and queue ownership follows
 *  the work itself to completion so a retry can never interleave with
 *  the attempt it replaced. */

export let STALL_MS = 30_000;
/** Test seam: shorten every module's bound at once. Not for prod use —
 *  callers that need a different bound pass `ms` explicitly. */
export const _setStallMs = (ms) => { STALL_MS = ms; };

/** Race `promise` against a deadline. The loser keeps running in the
 *  background; the caller gets a settle either way, so a serialized
 *  chain can clear and retry instead of queueing forever. When a
 *  `ticket` is given, expiry marks `ticket.dead` — the underlying work
 *  must check it before any write a retry would own. */
export function withDeadline(promise, ms, what, ticket) {
  /** @type {any} */ const t = { id: 0 };
  const deadline = new Promise((_, rej) => {
    t.id = setTimeout(() => {
      if (ticket) ticket.dead = true;
      rej(new Error(`${what} stalled`));
    }, ms);
    t.id.unref?.(); // a retry timer must not hold a node process open
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(t.id));
}

/* Serialized work whose queue ownership follows the WORK, not the
 * caller's promise: a timed-out call keeps its slot until it physically
 * settles, so the next caller's fn can never overlap the attempt it
 * replaces. Two fences for the expired caller:
 *   - if it is still queued when its deadline fires, its fn never runs
 *     and a still-pending Web Lock request is aborted;
 *   - if it is already running, it finishes (the queue waits for it) —
 *     `fn` receives the ticket and should check `ticket.dead` before
 *     writes that only the retry should perform. */
export function serialized(map, lockFor, name, fn) {
  const ticket = { dead: false };
  const ctl = new AbortController();
  const work = (map.get(name) ?? Promise.resolve()).then(() => {
    if (ticket.dead) throw new Error(`${name} expired while queued`);
    return globalThis.navigator?.locks?.request
      ? navigator.locks.request(lockFor(name), { signal: ctl.signal },
        () => fn(ticket))
      : fn(ticket);
  });
  const run = withDeadline(work, STALL_MS, name, ticket);
  run.catch(() => ctl.abort()); // drop a still-queued Web Lock request
  const tail = work.catch(() => {});
  map.set(name, tail);
  tail.then(() => { if (map.get(name) === tail) map.delete(name); });
  return run;
}

/** fetch with a wall-clock bound — a stalled connection must not hold
 *  a serialized caller forever. Works without AbortSignal.timeout
 *  (the request and the body read are both raced against an
 *  AbortController deadline), and a caller-supplied signal still
 *  cancels instead of being replaced. */
export const timedFetch = async (url, init = {}, ms = STALL_MS) => {
  const ctl = new AbortController();
  const caller = init.signal ?? null;
  const onAbort = () => ctl.abort(caller.reason);
  if (caller?.aborted) ctl.abort(caller.reason);
  else caller?.addEventListener("abort", onAbort, { once: true });
  /** @type {any} */
  const timer = setTimeout(() => ctl.abort(new Error("timedFetch: stalled")), ms);
  timer.unref?.();
  const aborted = new Promise((_, rej) => {
    if (ctl.signal.aborted) rej(ctl.signal.reason);
    else ctl.signal.addEventListener("abort",
      () => rej(ctl.signal.reason), { once: true });
  });
  let res = null;
  try {
    res = await Promise.race([fetch(url, { ...init, signal: ctl.signal }), aborted]);
    // Received headers are not completion: a body that stalls mid-read
    // would hold the caller just the same, so the deadline covers it.
    const body = await Promise.race([res.arrayBuffer(), aborted]);
    // 204/304 responses reject a non-null body — pass one only when
    // there are bytes.
    return new Response(body.byteLength ? body : null, {
      status: res.status, statusText: res.statusText, headers: res.headers });
  } catch (err) {
    res?.body?.cancel?.().catch(() => {});
    throw err;
  } finally {
    clearTimeout(timer);
    caller?.removeEventListener("abort", onAbort);
  }
};
