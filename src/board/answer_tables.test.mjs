/**
 * 041 B4 parity — the shipped answer tables must produce IDENTICAL
 * answers to the old code running on the raw corpus. "Ship answers,
 * not the corpus" is only honest if every lookup lands the same.
 *
 * Grammar: every (ending, word) row the corpus holds, with and without
 * its next word, across every worn feature — old pickForm on the raw
 * 45 MB table vs new pickForm on the 0.6 MB answer table. Any
 * difference fails the build.
 *
 * Suggestions: every ending's passing list — old stripRanked on the
 * raw 12 MB table vs new stripRanked on the 1.5 MB answer table —
 * shown ids and ranked ids must match exactly, including with a
 * hidden-word set applied (masking happens after ending selection).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { pickForm, EOS } from "../../public/shared/forms.mjs";
import { stripRanked } from "../../public/shared/funnel.mjs";

const root = join(import.meta.dirname, "../..");
const raw = JSON.parse(readFileSync(join(root, "data/prediction/form_table.en.json"), "utf8"));
const ans = JSON.parse(readFileSync(join(root, "public/form_answers.en.json"), "utf8"));
const rawS = JSON.parse(readFileSync(join(root, "data/prediction/phrase_table.en.json"), "utf8"));
const ansS = JSON.parse(readFileSync(join(root, "public/suggest_answers.en.json"), "utf8"));

const lastPipe = (k, segs) => {
  let i = k.length;
  for (let n = 0; n < segs; n++) i = k.lastIndexOf("|", i - 1);
  return [k.slice(0, i), k.slice(i + 1)];
};
const okEnd = (E) => /^sns_\d{4}( sns_\d{4})*$/.test(E);
const ctxIds = (K) =>
  K === "<s>" ? [] : K.startsWith("<s> ") ? K.slice(4).split(" ") : K.split(" ");
const reach = (ctx) => ctx.length <= 4 && ctx.every((id) => /^sns_\d{4}$/.test(id));

test("grammar: every corpus (ending, word) answers identically", () => {
  let checked = 0;
  for (const key of Object.keys(raw.contexts)) {
    const [K, sid] = lastPipe(key, 1);
    const ctx = ctxIds(K);
    if (!reach(ctx)) continue;              // corpus junk, unreachable
    assert.equal(
      pickForm(ans, ctx, sid), pickForm(raw, ctx, sid),
      `context ${JSON.stringify(key)}`);
    checked++;
  }
  assert.ok(checked > 400000, `expected full coverage, checked ${checked}`);
});

test("grammar: every (ending, word, next) answers identically", () => {
  let checked = 0;
  for (const key of Object.keys(raw.nextVerb)) {
    const [K, rest] = lastPipe(key, 2);
    const [sid, next] = rest.split("|");
    const ctx = ctxIds(K);
    if (!reach(ctx)) continue;
    assert.equal(
      pickForm(ans, ctx, sid, next), pickForm(raw, ctx, sid, next),
      `nextVerb ${JSON.stringify(key)}`);
    checked++;
  }
  assert.ok(checked > 250000, `expected full coverage, checked ${checked}`);
});

test("grammar: possNext + EOS + aAn paths answer identically", () => {
  const feats = ["BASE", "PRO;POSS", "PRO;POSS;ABS", "N;POSS", "V;PRS;3;SG", "N;PL"];
  for (const key of Object.keys(raw.possNext)) {
    const parts = key.split("|");
    const sid = parts[0];
    if (parts.length === 3 && parts[1] === "x") {
      const next = parts[2];
      for (const f of feats) {
        assert.equal(
          pickForm(ans, [], sid, next, f), pickForm(raw, [], sid, next, f),
          `possNext ${key} worn ${f}`);
      }
    } else if (parts.length === 2 && parts[1] === "EOS") {
      for (const f of feats) {
        assert.equal(
          pickForm(ans, [], sid, EOS, f), pickForm(raw, [], sid, EOS, f),
          `EOS ${sid} worn ${f}`);
        // A worn form also meets real contexts — "like him" still reads.
        for (const ctx of [["sns_0001"], ["sns_0076", "sns_0080"]]) {
          assert.equal(
            pickForm(ans, ctx, sid, EOS, f), pickForm(raw, ctx, sid, EOS, f),
            `EOS ${sid} worn ${f} ctx ${ctx}`);
        }
      }
    }
  }
  for (const next of Object.keys(raw.aAn ?? {})) {
    assert.equal(
      pickForm(ans, [], raw.aSense, next), pickForm(raw, [], raw.aSense, next),
      `aAn ${next}`);
  }
});

/* A mock db — her history empty, senseMerge identity, mask per call. */
const mockDb = (masked = new Set()) => ({
  exec() {},
  prepare(sql) {
    return {
      all: (...a) => /sense_mask/.test(sql)
        ? [...masked].map((id) => ({ sense_id: id })) : [],
      run() {},
    };
  },
});
const items = (ending) =>
  (ending === "" ? [] : ending.split(" ")).map((id) => ({ kind: "sense", id }));
const nonCut = (r) => r.ranked.filter((c) => !c.cut).map((c) => `${c.kind}:${c.id}:${c.mask}`);

test("suggestions: every ending shows the same words", () => {
  const db = mockDb();
  let checked = 0;
  for (const ending of Object.keys(rawS.contexts)) {
    const sent = items(ending);
    const a = stripRanked(db, sent, 1700000000000, "en", ansS);
    const b = stripRanked(db, sent, 1700000000000, "en", rawS);
    assert.deepEqual(a.shown, b.shown, `shown ${ending}`);
    assert.equal(a.ending, b.ending, `ending ${ending}`);
    assert.deepEqual(nonCut(a), nonCut(b), `ranked ${ending}`);
    checked++;
  }
  assert.ok(checked > 80000, `expected full coverage, checked ${checked}`);
});

test("suggestions: hidden words drop identically after ending selection", () => {
  const endings = Object.keys(rawS.contexts).filter((e, i) => i % 17 === 0);
  for (const ending of endings) {
    const sent = items(ending);
    const base = stripRanked(mockDb(), sent, 1700000000000, "en", rawS);
    const candIds = base.ranked.filter((c) => !c.cut && c.kind === "sense")
      .map((c) => c.id);
    const masked = new Set(candIds.filter((_, i) => i % 3 === 0));
    const db = mockDb(masked);
    const a = stripRanked(db, sent, 1700000000000, "en", ansS);
    const b = stripRanked(db, sent, 1700000000000, "en", rawS);
    assert.deepEqual(a.shown, b.shown, `masked shown ${ending}`);
    assert.deepEqual(nonCut(a), nonCut(b), `masked ranked ${ending}`);
  }
});
