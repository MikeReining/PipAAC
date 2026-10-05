/** One liveness rule for every sync seam: an await that never settles
 *  must surface as an error and free the queue behind it — never freeze
 *  a serialized chain silently. A stalled fetch, an IndexedDB
 *  transaction that never completes, or a Web Lock that is never
 *  granted would otherwise wedge the outbox for the session: ops kept
 *  logging locally while nothing ever reached the relay. */

export const STALL_MS = 30_000;

/** Race `promise` against a deadline. The loser keeps running in the
 *  background; the caller gets a settle either way, so a serialized
 *  chain can clear and retry instead of queueing forever. */
export function withDeadline(promise, ms, what) {
  /** @type {any} */ const t = { id: 0 };
  const deadline = new Promise((_, rej) => {
    t.id = setTimeout(() => rej(new Error(`${what} stalled`)), ms);
    t.id.unref?.(); // a retry timer must not hold a node process open
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(t.id));
}

/** fetch with a wall-clock bound — a stalled connection must not hold
 *  a serialized caller forever. */
export const timedFetch = (url, init = {}, ms = STALL_MS) =>
  fetch(url, AbortSignal.timeout
    ? { ...init, signal: AbortSignal.timeout(ms) }
    : init);
