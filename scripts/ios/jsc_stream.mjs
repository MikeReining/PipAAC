/**
 * Streamed fetch for the JavaScriptCore core (044 E6b). The plain "fetch" host
 * op hands over a finished body; the draw client (pictures.mjs readDrawStream)
 * reads server-sent events through `res.body.getReader()` and the web shows
 * each stage as it arrives. This is the JS half of the "fetchStream" host op
 * (PipHostNet.swift startFetchStream): the op settles once with the head
 * (status + headers); the body follows as __pipFetchEvent(sid, type, data)
 * with type "chunk" (base64), "end" or "error". A failure before the head
 * rejects the fetch like any other.
 *
 * jsc_shims.mjs supplies its own Response/Blob/hostCall (this file must not
 * import it back).
 */
export function makeStreamFetch({ hostCall, newId, Response, Blob, b64ToBytes }) {
  const streams = new Map(); // sid -> { chunks, waiter, ended, error }
  const pump = (st) => { const w = st.waiter; st.waiter = null; w?.(); };

  async function read(st) {
    for (;;) {
      if (st.chunks.length) return { done: false, value: st.chunks.shift() };
      if (st.error) throw st.error;
      if (st.ended) return { done: true, value: undefined };
      await new Promise((r) => { st.waiter = r; });
    }
  }
  async function readAll(st) {
    const parts = [];
    for (let c; !(c = await read(st)).done;) parts.push(c.value);
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
  }

  class StreamResponse extends Response {
    constructor(st, init) {
      super(null, init);
      this.body = { getReader: () => ({ read: () => read(st) }) };
      this._all = () => readAll(st);
    }
    async arrayBuffer() { return (await this._all()).slice().buffer; }
    async text() { return new TextDecoder().decode(await this._all()); }
    async json() { return JSON.parse(await this.text()); }
    async blob() {
      return new Blob([await this._all()], { type: this.headers.get("content-type") ?? "" });
    }
  }

  async function streamFetch(req, signal) {
    const sid = newId();
    const st = { chunks: [], waiter: null, ended: false, error: null };
    streams.set(sid, st);
    let head;
    try { head = await hostCall("fetchStream", { ...req, sid }, signal); }
    catch (err) { streams.delete(sid); throw err; }
    return new StreamResponse(st, {
      status: head.status, statusText: head.statusText, headers: head.headers });
  }

  function onEvent(sid, type, data) {
    const st = streams.get(sid);
    if (!st) return;
    if (type === "chunk") st.chunks.push(b64ToBytes(data));
    else {
      if (type === "error") st.error = new Error(String(data));
      st.ended = true;
      streams.delete(sid);
    }
    pump(st);
  }

  return { streamFetch, onEvent };
}
