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
