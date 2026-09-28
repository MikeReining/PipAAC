import test from "node:test";
import assert from "node:assert/strict";
import worker from "./index.js";
import { checkLicense } from "./license.mjs";

test("GET /health returns service identity", async () => {
  const res = await worker.fetch(new Request("http://localhost/health"));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.service, "pipaac");
});

test("unknown paths return 404 JSON", async () => {
  const res = await worker.fetch(new Request("http://localhost/v1/quotes"));
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error, "not_found");
});

/* Dev self-activation: localhost mints its own license so preview needs
 * no paste ritual. Double-gated — a non-loopback host or a non-dev
 * environment gets the same 404 as any unknown path. */
const UID = "11111111-2222-3333-4444-555555555555";
const devLicense = (env, host = "localhost") =>
  worker.fetch(new Request(`http://${host}/api/v1/voice/dev-license`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user_id: UID }),
  }), env);

test("dev-license mints a token that passes the speak gate", async () => {
  const env = { ENVIRONMENT: "development", PIP_LICENSE_SECRET: "s" };
  const res = await devLicense(env);
  assert.equal(res.status, 200);
  const { license } = await res.json();
  assert.equal(await checkLicense("s", UID, license), true);
});

test("dev-license refuses non-loopback hosts and non-dev envs", async () => {
  const dev = { ENVIRONMENT: "development", PIP_LICENSE_SECRET: "s" };
  assert.equal((await devLicense(dev, "pipaac.org")).status, 404);
  const prod = { ENVIRONMENT: "production", PIP_LICENSE_SECRET: "s" };
  assert.equal((await devLicense(prod)).status, 404);
  assert.equal((await devLicense({})).status, 404); // no secret, no env
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
