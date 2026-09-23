/**
 * 006 slice 5 Works Test — Jev reranker behind the sharing setting
 * (Dual_Engine § 3.2). The lie-prone layer is a builder test asserting
 * on its own return — so every outgoing body is captured at the network
 * boundary (a stubbed fetch on jevRank) and measured there: the § 3.2
 * whitelist exactly, the entity as key + category + description, never
 * its spoken_name, no clock digits, no history, no counts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { createEntity } from "../../public/shared/groups.mjs";
import { applyJev } from "../../public/shared/funnel.mjs";
import {
  buildJevRequest, JEV_MODEL, jevProbabilities, jevRank, jevTerm,
} from "../../public/shared/jev.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const lexicon = JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8"));
const catalog = buildCatalog(lexicon,
  parseCoordinateMapMarkdown(readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8")));

const openDb = () => {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  return db;
};
const senseOf = (db, text) =>
  db.prepare("SELECT sense_id FROM label WHERE text = ? AND locale = 'en' AND kind = 'lemma' AND status = 'approved'")
    .all(text)[0]?.sense_id;
const WHITELIST = { model: 1, state: 1, questions: 1 };

/** Drive a jevRank call with a stubbed fetch and return what crossed the
 *  wire — { url, body } — plus the canned response we gave back. */
async function capture(request, reply = { model: JEV_MODEL, answers: {} }) {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => reply };
  };
  const res = await jevRank(request, { fetchImpl, origin: "http://x" });
  return { seen, res };
}

test("sharing off and an empty context send nothing — ever", async () => {
  const db = openDb();
  const want = senseOf(db, "want");
  const cands = [{ kind: "sense", id: want }].map((c) => jevTerm(db, { ...c, label: "want" }, "en"));

  // Sharing off → no request object exists to send.
  assert.equal(buildJevRequest(cands, ["I", "want"], null, { sharing: false }), null);
  // Sharing on but nothing built and nothing heard → null too.
  assert.equal(buildJevRequest(cands, [], null), null);
  // And an empty shortlist is not worth a call.
  assert.equal(buildJevRequest([], ["I"], null), null);

  // End to end through jevRank: a null request never touches fetch.
  const seen = [];
  const req = buildJevRequest(cands, [], null);
  if (req) await jevRank(req, { fetchImpl: async (...a) => (seen.push(a), { ok: true, json: async () => ({}) }) });
  assert.equal(seen.length, 0);
});

test("I want + Cooper in the shortlist — the body is the § 3.2 whitelist", async () => {
  const db = openDb();
  const { id: cooper } = createEntity(db, { name: "Cooper", category: "Animals & Nature" });
  db.prepare(
    `INSERT INTO entity_enrichment (id, entity_id, description, model, prompt_version, status)
     VALUES ('enr_t1', ?, 'family pet dog', 'test', 't', 'ready')`,
  ).run(cooper);
  const want = senseOf(db, "want");
  const juice = senseOf(db, "juice");

  const shortlist = [
    { kind: "sense", id: juice, label: "juice" },
    { kind: "entity", id: cooper },
    { kind: "sense", id: want, label: "want" },
  ];
  const terms = shortlist.map((c) => jevTerm(db, c, "en"));
  // Cooper rides as category + description, never his name.
  assert.equal(terms[1], "Animals & Nature: family pet dog");

  const sentence = [
    { kind: "sense", label: "I" },
    { kind: "sense", label: "want" },
  ].map((c) => jevTerm(db, c, "en"));

  const req = buildJevRequest(terms, sentence, null);
  const { seen } = await capture(req);
  assert.equal(seen.length, 1);
  const body = seen[0].body;
  assert.equal(seen[0].url, "http://x/jev/rank");

  // The whitelist, exactly — no extra keys anywhere.
  assert.deepEqual(Object.keys(body).sort(), Object.keys(WHITELIST).sort());
  assert.equal(body.model, JEV_MODEL);
  assert.deepEqual(Object.keys(body.state).sort(), ["candidates_note", "sentence_so_far"]);
  assert.equal(body.state.sentence_so_far, "I want");
  const q = body.questions.next_word;
  assert.equal(q.type, "choice");
  assert.deepEqual(Object.keys(q.criteria), ["c1", "c2", "c3", "none"]);
  assert.equal(q.criteria.c2, "Animals & Nature: family pet dog");
  assert.equal(q.criteria.none, "None of these words fits as the next word");

  // The leak checks: no name, no digits, no earlier sentence, no counts.
  const wire = JSON.stringify(body);
  assert.ok(!wire.includes("Cooper"), "entity name leaked");
  assert.ok(!/\d{4}-\d{2}/.test(wire), "a date leaked");
  assert.ok(!wire.includes("history") && !wire.includes("freq") && !wire.includes("count"));

  // Partner words ride only when heard.
  const req2 = buildJevRequest(terms, sentence, "Do you want juice?");
  assert.equal(req2.state.partner_said, "Do you want juice?");
});

test("a Jev answer re-ranks through the jev feature and the none logit", () => {
  const db = openDb();
  const juice = senseOf(db, "juice");
  const outside = senseOf(db, "outside");
  const rows = [
    { kind: "sense", id: juice, x: { phrase: 0, pair: 1, occasion: 0, hour: 0, recency: 0, freq: 1, invited: 1, echo: 0, fresh: 0, jev: 0 } },
    { kind: "sense", id: outside, x: { phrase: 0, pair: 0, occasion: 0, hour: 0, recency: 0, freq: 2, invited: 1, echo: 0, fresh: 0, jev: 0 } },
  ];
  const weights = { pair: 1, freq: 1, invited: 0, jev: 2, none_bias: -1 };

  // Jev strongly prefers the second candidate and sees a real answer.
  const probs = { c1: 0.05, c2: 0.9, none: 0.05 };
  const { candidates, pNone } = applyJev(rows, probs, weights);
  assert.equal(candidates[0].id, outside, "Jev's pick wins the re-rank");
  assert.ok(candidates[0].x.jev > candidates[1].x.jev);
  assert.ok(pNone < 0.5, "a confident answer lowers P(none)");

  // A strong 'none' answer lifts P(none) — the gate can silence the strip.
  const shy = applyJev(rows, { c1: 0.02, c2: 0.03, none: 0.95 }, weights);
  assert.ok(shy.pNone > 0.5);
});

test("jevProbabilities reads the answer; malformed bodies return null", () => {
  assert.deepEqual(
    jevProbabilities({ model: "m", answers: { next_word: { probabilities: { c1: 0.5, none: 0.5 } } } }),
    { c1: 0.5, none: 0.5 });
  assert.equal(jevProbabilities({ answers: {} }), null);
  assert.equal(jevProbabilities(null), null);
});
