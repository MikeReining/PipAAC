/**
 * 042 Help — the Worker routes and the shared search pieces.
 *
 * What the real model ranks is measured by scripts/help/search_probe.mjs
 * against a running Worker (042 § Proof); these tests pin the plumbing:
 * the two-stage pipeline keeps the reranker's order, the site may read
 * search, the email can't be steered by a header in the form.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker from "./index.js";
import { composeHelpEmail } from "./help.js";
import { helpDocs, localHits, mergeHits, rankByMeaning } from "../../public/shared/help_search.mjs";

const help = JSON.parse(readFileSync(new URL("../../public/help.en.json", import.meta.url), "utf8"));
const html = readFileSync(new URL("../../public/index.html", import.meta.url), "utf8");

const get = (q, headers = {}, env = {}) =>
  worker.fetch(new Request(`https://app.test/api/v1/help/search?q=${encodeURIComponent(q)}`, { headers }),
    { ENVIRONMENT: "development", ...env });
const write = (body, env = {}) =>
  worker.fetch(new Request("https://app.test/api/v1/help/write", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }), { ENVIRONMENT: "development", ...env });

/** A fake model: each text's vector is its id's position, so the
 *  embedding stage is deterministic; the reranker reverses the pool. */
function fakeAI() {
  const calls = [];
  return {
    calls,
    async run(model, input) {
      calls.push(model);
      if (input.text) return { data: input.text.map((t) => [t.length % 7 + 1, t.length % 5 + 1, 1]) };
      return { response: input.contexts.map((_, id) => ({ id, score: (id + 1) / input.contexts.length })) };
    },
  };
}

test("every answer's Show me target exists in the shipped Settings", () => {
  for (const a of help.answers) {
    if (!a.go) continue;
    assert.ok(html.includes(`data-sec="${a.go.sec}"`), `${a.id}: page ${a.go.sec}`);
    if (a.go.at) assert.ok(html.includes(`id="${a.go.at}"`), `${a.id}: #${a.go.at}`);
  }
});

test("the index carries every labelled Settings row, and near-empty rows aren't embedded", () => {
  const labels = [...html.matchAll(/class="seg-label[^"]*"[^>]*>([^<]+)</g)].map((m) => m[1].trim());
  for (const l of ["Feeling faces", "Buttons per screen", "Settings PIN", "Recovery card"]) {
    assert.ok(labels.includes(l) && help.settings.some((s) => s.label === l), l);
  }
  const embedded = new Set(helpDocs(help).map((d) => d.id));
  help.settings.forEach((s, i) => assert.equal(embedded.has(`s:${i}`), s.text.length >= 20, s.label));
});

test("search returns the reranker's order, readable from the marketing site", async () => {
  const AI = fakeAI();
  const res = await get("emotions", { origin: "https://pipaac.org" }, { AI });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("access-control-allow-origin"), "https://pipaac.org");
  const { hits, version } = await res.json();
  assert.equal(version, help.version);
  assert.ok(AI.calls.includes("@cf/baai/bge-reranker-base"));
  assert.ok(hits.length > 0 && hits.length <= 6);
  for (let i = 1; i < hits.length; i++) assert.ok(hits[i - 1].score >= hits[i].score);
  // Scores under a tenth of the best one are dropped.
  assert.ok(hits.every((h) => h.score >= hits[0].score * 0.1));
});

test("search: other origins get no CORS grant; short queries cost nothing", async () => {
  const AI = fakeAI();
  const res = await get("emotions", { origin: "https://evil.example" }, { AI });
  assert.equal(res.headers.get("access-control-allow-origin"), null);
  const short = await (await get("a", {}, { AI: fakeAI() })).json();
  assert.deepEqual(short.hits, []);
  assert.equal((await get("emotions")).status, 503); // no model bound
});

test("write: empty and oversized messages are refused", async () => {
  assert.equal((await write({ message: "  " })).status, 400);
  assert.equal((await write({ message: "x".repeat(5001) })).status, 400);
  const ok = await (await write({ message: "hello" })).json();
  assert.deepEqual(ok, { ok: true, sent: false }); // no EMAIL binding in tests
});

test("the email goes to the Pip team, replies go to the sender, and form text can't add headers", () => {
  const raw = composeHelpEmail({
    message: "Hi\nBcc: someone@else.com",
    email: "mom@example.com\r\nBcc: x@y.z",
    details: { "Online\r\nBcc": "yes\r\nBcc: q@r.s" },
  });
  const [head] = raw.split("\r\n\r\n");
  assert.match(head, /^To: hello@pipaac\.org$/m);
  assert.match(head, /^Message-ID: <[^>]+@pipaac\.org>$/m);
  assert.doesNotMatch(head, /^Bcc:/m);
  assert.doesNotMatch(head, /^Reply-To:/m); // the CR/LF made it not an email
  const good = composeHelpEmail({ message: "Hi", email: "mom@example.com" });
  assert.match(good, /^Reply-To: mom@example\.com$/m);
  assert.match(composeHelpEmail({ message: "Hi" }), /No email given/);
});

test("local search: words at the start of words; filler alone finds nothing", () => {
  const ids = localHits(help, "teacher").map((h) => h.id);
  assert.ok(ids.includes("a:helpers"));
  assert.deepEqual(localHits(help, "how do I"), []);
});

test("merge: meaning first; after it, only local hits holding every word", () => {
  const meaning = [{ id: "a:modeling", score: 0.6 }];
  const local = [{ id: "a:feelings", score: 3, all: false }, { id: "a:spotlight", score: 4, all: true }];
  assert.deepEqual(mergeHits(meaning, local).map((h) => h.id), ["a:modeling", "a:spotlight"]);
  assert.deepEqual(mergeHits([], local).map((h) => h.id), ["a:feelings", "a:spotlight"]);
});

test("rankByMeaning keeps each entry's best text", () => {
  const hits = rankByMeaning([1, 0], [
    { id: "a:x", vec: [0, 1] }, { id: "a:x", vec: [1, 0] }, { id: "a:y", vec: [1, 1] },
  ]);
  assert.deepEqual(hits.map((h) => h.id), ["a:x", "a:y"]);
  assert.equal(hits[0].score, 1);
});
