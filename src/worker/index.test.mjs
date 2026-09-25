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

/* Smart bar v2: no rerank path may leave the device — /jev/rank is
 * gone, so nothing outbound exists for the strip. */
test("jev rank is gone: every method 404s", async () => {
  for (const method of ["GET", "POST"]) {
    const res = await worker.fetch(
      new Request("http://localhost/jev/rank", { method, body: method === "POST" ? "{}" : undefined }),
      {});
    assert.equal(res.status, 404);
  }
});
