/**
 * Coach bar. A partner sees the spotlight's words. The child's device
 * does not.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { createDatabase } from "./catalog.mjs";
import { endSpotlight, startSpotlight } from "../../public/shared/spotlight.mjs";
import { mountCoach } from "../../public/board/coach-ui.js";

function el() {
  const node = {
    hidden: false,
    textContent: "",
    className: "",
    children: [],
    classList: { add(name) { node.className += ` ${name}`; }, remove() {} },
    addEventListener(type, fn) { node["on" + type] = fn; },
    appendChild(kid) { node.children.push(kid); return kid; },
    set innerHTML(value) { if (value === "") node.children.length = 0; },
  };
  return node;
}

test("a partner sees the spotlight word and a child does not", () => {
  const db = createDatabase(":memory:");
  const bar = el();
  const targets = el();
  const tally = el();
  const ids = ["coach-tip", "coach-basic", "coach-basic-text", "coach-basic-x"];
  const nodes = { coachbar: bar, "coach-targets": targets, "coach-tally": tally };
  for (const id of ids) nodes[id] = el();
  globalThis.document = {
    getElementById: (id) => nodes[id],
    createElement: () => el(),
  };
  globalThis.localStorage = {
    getItem() { return null; },
    setItem() {},
  };
  const me = { role: "child" };
  startSpotlight(db, ["entity:ent_pip"], "Snack");

  const coach = mountCoach({
    db,
    locale: "en",
    all: (database, sql, p = []) => database.prepare(sql).all(...p),
    catalog: {},
    me,
    syncSendModel() {},
  });

  coach.renderCoach();
  assert.equal(bar.hidden, true);

  me.role = "partner";
  coach.renderCoach();
  assert.equal(bar.hidden, false);
  assert.equal(targets.children.length, 1);
  assert.equal(targets.children[0].textContent, "ent_pip");
  assert.equal(tally.textContent, "Tap a word — it glows on their board.");
  endSpotlight();
});
