/**
 * Tour dim law: the body.touring quiet rule in onramp-ui.css must never
 * cover a control the tour can target. When the second transform step
 * moved from ⏪ to ❓ (039, ef19c12), the dim list kept `#tx-question` —
 * so the card said "Now tap ❓ to ask it." while the button had
 * pointer-events:none and opacity:.35, an untappable ring target.
 * The step list in tour-ui.js is the truth owner for which controls the
 * tour walks; the CSS is the lie-prone copy.
 * DEBUGLOG 2026-10-03 tour-question-dimmed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tour = readFileSync(new URL("../../public/board/tour-ui.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../../public/board/onramp-ui.css", import.meta.url), "utf8");

/** The selectors the touring quiet rule covers. */
function dimmedIds() {
  const m = css.match(/body\.touring[^{]+\{[^}]*pointer-events:\s*none/);
  assert.ok(m, "the tour must quiet the controls it doesn't walk");
  return [...m[0].matchAll(/#(tx-[a-z]+)/g)].map((x) => x[1]);
}

/** Every sentence-bar control a tour step can ring. */
function tourTargets() {
  return [...tour.matchAll(/target:\s*\(\)\s*=>\s*\$\("?(tx-[a-z]+)"?\)/g)].map((x) => x[1]);
}

test("no dimmed control is a tour target", () => {
  const dim = new Set(dimmedIds());
  const targets = tourTargets();
  assert.ok(targets.length > 0, "tour-ui must name its transform targets");
  for (const id of targets) {
    assert.ok(!dim.has(id), `body.touring must not quiet #${id} — the tour rings it`);
  }
});

test("the transform buttons the tour never walks stay quiet", () => {
  const dim = new Set(dimmedIds());
  const targets = new Set(tourTargets());
  for (const id of ["tx-fix", "tx-question", "tx-past", "tx-future"]) {
    if (!targets.has(id)) assert.ok(dim.has(id), `body.touring should still quiet #${id}`);
  }
});
