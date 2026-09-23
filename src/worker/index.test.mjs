import test from "node:test";
import assert from "node:assert/strict";
import worker from "./index.js";

test("GET /health returns service identity", async () => {
  const res = await worker.fetch(new Request("http://localhost/health"));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.service, "pippaac");
});

test("unknown paths return 404 JSON", async () => {
  const res = await worker.fetch(new Request("http://localhost/v1/quotes"));
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error, "not_found");
});

/* /jev/rank (Dual_Engine § 3.2): the body crosses verbatim, the TypeSafe
 * key is added here — never on the wire back, never logged. */
test("jev rank forwards the body with the server-side key", async () => {
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), auth: init.headers.authorization, body: init.body });
    return new Response('{"model":"jev-1.13.0","answers":{"next_word":{"choice":"c1","probabilities":{"c1":0.9,"none":0.1}}}}',
      { status: 200 });
  };
  try {
    const reqBody = JSON.stringify({ model: "jev-1.13.0", state: { sentence_so_far: "I want" }, questions: {} });
    const res = await worker.fetch(
      new Request("http://localhost/jev/rank", { method: "POST", body: reqBody }),
      { TYPESAFE_API_KEY: "ts_test_secret" });
    assert.equal(res.status, 200);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].url, "https://api.typesafe.ai/v1/systemone");
    assert.equal(seen[0].auth, "Bearer ts_test_secret");
    assert.equal(seen[0].body, reqBody); // verbatim
    const text = await res.text();
    assert.ok(!text.includes("ts_test_secret"), "key leaked into the response");
    const body = JSON.parse(text);
    assert.equal(body.answers.next_word.probabilities.c1, 0.9);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("jev rank 503s without the key and rejects non-POST", async () => {
  const res = await worker.fetch(
    new Request("http://localhost/jev/rank", { method: "POST", body: "{}" }),
    {});
  assert.equal(res.status, 503);
  const get = await worker.fetch(new Request("http://localhost/jev/rank"));
  assert.equal(get.status, 404);
});
