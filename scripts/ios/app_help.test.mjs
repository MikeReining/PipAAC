/**
 * 044 E5 - the Help facade, run from the BUILT core (what ships). The
 * instrument is src/help/answers.en.json (the authored truth): shown
 * answer text must equal it, not the derived help.en.json's own claim.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

const root = new URL("../../", import.meta.url).pathname;
const ctx = vm.createContext({ crypto: globalThis.crypto, __pipHost: {} });
vm.runInContext(readFileSync(join(root, "apps/PipAAC/PipAAC/Core/pip-core.js"), "utf8"), ctx);
const j = (v) => JSON.parse(JSON.stringify(v));
const help = new Proxy({}, { get: (_, k) => (...a) => j(ctx.PIPCORE.help[k](...a)) });
const authored = JSON.parse(readFileSync(join(root, "src/help/answers.en.json"), "utf8"));
const answers = authored.topics ? authored.answers : Object.values(authored).flat();
const shipped = readFileSync(join(root, "public/help.en.json"), "utf8");
const version = help.load(shipped).version;

test("every shown answer is the authored text", () => {
  const h = help.home({});
  const shown = [...h.start, ...h.topics.flatMap((t) => t.answers)];
  assert.ok(shown.length >= 60);
  for (const a of shown) {
    const src = answers.find((x) => x.id === a.id);
    assert.equal(a.q, src.q);
    assert.equal(a.paras.join("\n\n"), src.a);
  }
});

test("start here follows state like the web", () => {
  assert.deepEqual(help.home({ online: false }).start.map((a) => a.id), ["offline", "word-by-word"]);
  assert.deepEqual(help.home({ partner: true }).start.map((a) => a.id), ["modeling", "touch-board", "school-home"]);
  assert.deepEqual(help.home({ weekOver: true }).start.map((a) => a.id), ["week-ends", "word-by-word", "not-using"]);
  assert.deepEqual(help.home({}).start.map((a) => a.id), ["first-week", "modeling", "not-using"]);
});

test("'voice' on device finds the voice answer; its Show me is the voice row", () => {
  const r = help.search("voice");
  const v = r.hits.find((x) => x.kind === "answer" && x.answer.id === "voice");
  assert.ok(v);
  assert.equal(v.answer.route, "voice");
});

test("meaning hits come first; another help version is ignored", () => {
  const meaning = { version, hits: [{ id: "a:feelings", score: 0.9 }] };
  assert.equal(help.search("emotions", meaning).hits[0].answer.id, "feelings");
  const stale = help.search("emotions", { version: "other", hits: meaning.hits });
  assert.ok(!stale.hits.some((x) => x.answer?.id === "feelings" && x.open));
});

test("settings hits only for rows that exist natively; none -> Ask us text", () => {
  for (const q of ["voice", "speed", "pin", "keyboard"]) {
    for (const h of help.search(q).hits.filter((x) => x.kind === "setting")) assert.ok(h.route);
  }
  const none = help.search("zzzqqq");
  assert.equal(none.none, true);
  assert.equal(none.prefill, "About “zzzqqq”: ");
});

test("write item, status and outbox follow the web", () => {
  assert.equal(help.writeItem({ message: "  ", email: "" }), null);
  assert.deepEqual(help.writeItem({ message: " hi ", email: " a@b.c ", details: null }),
    { message: "hi", email: "a@b.c", details: null });
  assert.equal(help.writeStatus("sent", true), "Sent. Thank you.");
  let box = [];
  for (let i = 0; i < 12; i++) box = help.outboxPush(box, { message: String(i) });
  assert.equal(box.length, 10);
  assert.equal(box[0].message, "2");
  assert.equal(help.meaningPath("a"), null);
  assert.equal(help.meaningPath("big buttons"), "/api/v1/help/search?q=big%20buttons");
});
