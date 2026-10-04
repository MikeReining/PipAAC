/**
 * Spotlight across two devices (founder, 2026-10-04). A device is the
 * person's board or a supporter's. A spotlight started on a supporter's
 * device lights its words there; the child's board stays plain until the
 * supporter taps a word, and the child's presses count on the supporter's
 * device.
 *
 * Measured on stored rows, a second database fed the op log, and the
 * classes the layer puts on cells. The live leg (two real browsers on the
 * relay) is scripts/probes/spot_remote_probe.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { createDatabase } from "./catalog.mjs";
import { applyOp, listOps } from "../../public/shared/ops.mjs";
import {
  endSpotlight, glowsHere, resumeSession, spotlight, startSession,
} from "../../public/shared/spotlight.mjs";
import { mountSpotlightLayer } from "../../public/board/spotlight-layer.js";
import { mountCoach } from "../../public/board/coach-ui.js";

const WANT = "sense:sns_want", GO = "sense:sns_go";

function cell() {
  const cls = new Set();
  return {
    dataset: {},
    classList: { add: (...c) => c.forEach((x) => cls.add(x)), has: (c) => cls.has(c),
      toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)), remove: (c) => cls.delete(c) },
    cls,
  };
}

// The page chrome the layer and the supporter's bar paint (top-bar
// buttons, the bar line); one fake element per id.
const els = new Map();
globalThis.document = {
  getElementById: (id) => els.get(id) ?? els.set(id, { ...cell(), hidden: true, textContent: "" }).get(id),
  body: { classList: cell().classList },
};

function device(role) {
  const db = createDatabase(":memory:");
  const me = { name: "Sam", role };
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  const live = { spotDemo: null, boardSenseIds: new Set(), movedSet: new Set(), likelySet: new Set() };
  const sent = [];
  const layer = mountSpotlightLayer({
    db, live, isSupporter: () => me.role === "partner",
    sendLive: async (m) => { sent.push(m); return true; },
    speakItem() {}, syncTxButtons() {}, renderGrid() {}, rerenderView() {},
  });
  live.coachUi = mountCoach({ db, locale: "en", all: () => [], catalog: {}, me, repaint() {} });
  const mark = (key) => { const c = cell(); layer.layerMark(c, key, { board: true }); return c; };
  return { db, me, layer, coach: live.coachUi, mark, sent };
}

test("where the steady glow shows", () => {
  const solo = { bySupporter: false }, remote = { bySupporter: true };
  assert.equal(glowsHere(null, false), false);
  assert.equal(glowsHere(solo, false), true, "started on the child's board: it glows there");
  assert.equal(glowsHere(solo, true), true);
  assert.equal(glowsHere(remote, true), true, "the supporter sees the words they're working on");
  assert.equal(glowsHere(remote, false), false, "the child's board stays plain");
});

test("a supporter's session replays onto the child's board as a supporter's", () => {
  const sup = device("partner"), kid = device("board");
  startSession(sup.db, { name: "First words", targets: [WANT], by_supporter: true });
  const row = sup.db.prepare("SELECT by_supporter, started_at FROM spotlight_session").all()[0];
  assert.equal(row.by_supporter, 1);
  for (const op of listOps(sup.db)) applyOp(kid.db, op);
  endSpotlight();
  resumeSession(kid.db);
  assert.equal(spotlight().bySupporter, true);
  assert.equal(spotlight().session, true);
  assert.equal(spotlight().startedAt, row.started_at, "both devices name the session the same");
  endSpotlight();
});

test("the child's board is plain until the supporter taps; a press ends the light", () => {
  const kid = device("board");
  startSession(kid.db, { name: "First words", targets: [WANT], by_supporter: true });
  const before = kid.mark(WANT);
  assert.ok(!before.cls.has("glow") && !before.cls.has("dimmed"), "no steady glow, nothing dimmed");
  assert.ok(!kid.mark(GO).cls.has("dimmed"));
  assert.equal(kid.layer.modeling, false, "the child's taps are never models");

  kid.layer.onModel({ k: "model", t: WANT, w: "want" });
  const lit = kid.mark(WANT);
  assert.ok(lit.cls.has("glow") && lit.cls.has("modeled"), "the tapped word lights");
  assert.ok(!kid.mark(GO).cls.has("glow"), "only that word");

  assert.equal(kid.layer.childTap(WANT), true, "pressed while lit counts as with the glow");
  assert.deepEqual(kid.sent, [{ k: "tap", t: WANT, s: spotlight().startedAt }],
    "the press goes to the supporter's devices");
  assert.ok(!kid.mark(WANT).cls.has("glow"), "the press ends the light");
  assert.equal(kid.layer.childTap(WANT), false, "pressed again, unlit: on their own");
  endSpotlight();
});

test("started on the child's own board, it glows there as before", () => {
  const kid = device("board");
  startSession(kid.db, { name: "Snack", targets: [WANT] });
  assert.ok(kid.mark(WANT).cls.has("glow"));
  assert.ok(kid.mark(GO).cls.has("dimmed"));
  assert.equal(kid.layer.childTap(WANT), true);
  endSpotlight();
});

test("on the supporter's device: words glow, taps model, the child's presses count", () => {
  const sup = device("partner");
  assert.equal(sup.layer.modeling, false, "no spotlight, a normal board");
  startSession(sup.db, { name: "First words", targets: [WANT], by_supporter: true });
  assert.equal(sup.layer.modeling, true);
  assert.ok(sup.mark(WANT).cls.has("glow"));
  const s = spotlight().startedAt;
  assert.equal(sup.layer.controlPress("fix"), true, "✨ pressed here is a model, not a transform");
  assert.deepEqual(sup.sent, [{ k: "model", t: "control:fix", w: "✨ fix it" }]);
  assert.equal(document.getElementById("modelbar").hidden, false, "the supporter's bar shows");
  assert.match(document.getElementById("model-line").textContent, /✨/, "with the button's tip");
  assert.equal(sup.layer.childTap(WANT), true);
  assert.equal(sup.sent.length, 1, "a supporter's own press never reports as the child's");

  sup.layer.onModel({ k: "tap", t: WANT, s });
  sup.layer.onModel({ k: "tap", t: WANT, s });
  sup.layer.onModel({ k: "tap", t: GO, s });
  sup.layer.onModel({ k: "tap", t: WANT, s: s - 1 }); // an older session's tap
  assert.equal(sup.mark(WANT).dataset.spotCount, "2");
  assert.equal(sup.mark(GO).dataset.spotCount, "1", "any word the child presses counts");

  // A new session starts from zero.
  startSession(sup.db, { name: "Again", targets: [WANT], by_supporter: true,
    started_at: s + 1000 });
  assert.equal(sup.mark(WANT).dataset.spotCount, undefined);
  endSpotlight();
});

test("the child's board never shows counts", () => {
  const kid = device("board");
  startSession(kid.db, { name: "First words", targets: [WANT] });
  kid.layer.onModel({ k: "tap", t: WANT, s: spotlight().startedAt });
  assert.equal(kid.mark(WANT).dataset.spotCount, undefined);
  endSpotlight();
});
