/**
 * 044 E7 - first run (welcome, "their world", the scripted demo tour)
 * from the BUILT core in a bare vm realm. Assertions read the DATABASE
 * through a second connection, and the network/host boundary through a
 * recorder the facade cannot influence - never the facade's own report.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";

const root = new URL("../../", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "pip-firstrun-"));
const file = join(dir, "user.sqlite");
copyFileSync(join(root, "public/fresh_db.sqlite"), file);

const writer = new DatabaseSync(file);
const reader = new DatabaseSync(file);
const bindable = (v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v);

/** Every way out of the process: async host ops (fetch, sockets, cache,
 *  crypto...) and the JS-level fetch/WebSocket globals. */
const outbound = [];
const host = {
  log: () => {},
  randomUUID: () => crypto.randomUUID(),
  randomBytes: (n) => [...crypto.getRandomValues(new Uint8Array(n))],
  call: (op) => { outbound.push(`host:${op}`); },
  dbExec: (_id, sql) => { writer.exec(sql); return null; },
  dbRun: (_id, sql, p = []) => ({ changes: Number(writer.prepare(sql).run(...p.map(bindable)).changes) }),
  dbAll: (_id, sql, p = []) => {
    const rows = writer.prepare(sql).all(...p.map(bindable));
    const columns = rows.length ? Object.keys(rows[0]) : [];
    return { columns, rows: rows.map((r) => columns.map((c) =>
      r[c] instanceof Uint8Array ? { __pipBytes: [...r[c]] } : r[c])) };
  },
};
const ctx = vm.createContext({
  __pipHost: host,
  fetch: () => { outbound.push("fetch"); throw new Error("fetch must not be called"); },
  WebSocket: class { constructor() { outbound.push("WebSocket"); throw new Error("no sockets"); } },
});
vm.runInContext(readFileSync(join(root, "apps/PipAAC/PipAAC/Core/pip-core.js"), "utf8"), ctx);
const facade = (ns) => new Proxy({}, {
  get: (_, fn) => (...args) => {
    ctx.__a = JSON.stringify(args);
    const out = vm.runInContext(`JSON.stringify(PIPCORE.${ns}.${String(fn)}(...JSON.parse(__a)))`, ctx);
    return out === undefined ? undefined : JSON.parse(out);
  },
});
const app = facade("app");
const fr = facade("firstrun");

const catalog = readFileSync(join(root, "public/catalog.json"), "utf8");
const { appId } = app.appOpen(1, catalog, null, null);

const q = (sql, ...p) => reader.prepare(sql).all(...p);
const maxSeq = () => q("SELECT COALESCE(MAX(seq),0) AS m FROM sync_op")[0].m;
const opsSince = (since) => q(
  "SELECT kind, args FROM sync_op WHERE seq > ? ORDER BY seq", since,
).map((r) => [r.kind, JSON.parse(r.args)]);
const count = (t) => q(`SELECT count(*) AS n FROM ${t}`)[0].n;

/** Every table's rows, in a stable order: the whole database, so "wrote
 *  nothing" means nothing anywhere, not just the table we thought of. */
function dump() {
  const out = {};
  for (const { name } of q("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")) {
    out[name] = JSON.stringify(q(`SELECT * FROM "${name}" ORDER BY rowid`));
  }
  return out;
}
const changedTables = (a, b) => Object.keys(a).filter((t) => a[t] !== b[t]);

const web = (p) => readFileSync(join(root, p), "utf8");

/* ---------------- copy ---------------- */

test("welcome and look copy is the web's own words", () => {
  const m = fr.welcome(appId, { name: "" });
  const onramp = web("public/board/onramp-ui.js");
  for (const s of [
    m.welcome.title, m.welcome.nameLabel, m.welcome.namePlaceholder, m.welcome.whoQ,
    m.welcome.go, m.welcome.joinLead, m.welcome.join,
    m.look.title, m.look.sub, ...m.welcome.choices.map((c) => c.label),
    ...m.look.choices.map((c) => c.label),
  ]) assert.ok(onramp.includes(`"${s}"`), `not in onramp-ui.js: ${s}`);
  // Every spoken prompt is a shipped recording in the product voice.
  const clips = JSON.parse(JSON.stringify(
    vm.runInContext("Object.keys(PIPCORE.onrampAudio.ONRAMP_CLIPS)", ctx)));
  for (const c of [m.welcome.clip, m.look.clip,
    ...m.welcome.choices.map((x) => x.clip), ...m.look.choices.map((x) => x.clip)]) {
    assert.ok(clips.includes(c.key));
    assert.equal(c.path, `audio/onramp/${c.key}.mp3`);
  }
  assert.deepEqual(m.look.preview.map((t) => t.label), ["want", "apple"]);
  assert.ok(m.look.preview.every((t) => t.art), "the look question draws the real tiles");
});

test("world copy is setup-ui.js's own words", () => {
  const w = fr.worldOpen(appId, { name: "Maya" });
  const ui = web("public/board/setup-ui.js");
  assert.equal(w.steps[0].title, "Who does Maya call for?");
  assert.equal(fr.worldOpen(appId, {}).steps[0].title, "Who does your child call for?");
  for (const s of w.steps) {
    assert.ok(ui.includes(`"${s.hint}"`), `hint: ${s.hint}`);
    if (s.key !== "people") assert.ok(ui.includes(`"${s.title}"`), `title: ${s.title}`);
    assert.ok(ui.includes(`next: "${s.next}"`));
  }
  assert.deepEqual(w.steps.map((s) => s.key), ["people", "pets", "foods", "places"]);
  assert.equal(w.people.length, 2, "a first pass starts on two blank rows");
});

/* ---------------- writes land in the right tables ---------------- */

test("welcome: the name is the synced profile name (one set_setting op)", () => {
  const mark = maxSeq();
  const r = fr.welcomeSave(appId, { name: "  Maya  ", audience: "child" });
  assert.deepEqual(r, { name: "Maya", audience: "child" });
  assert.equal(q("SELECT person_name AS n FROM learner_profile WHERE id='prf_local'")[0].n, "Maya");
  assert.deepEqual(opsSince(mark).map(([k]) => k), ["set_setting"]);
  assert.throws(() => fr.welcomeSave(appId, { name: "x", audience: "robot" }));
  // An empty name writes nothing (the name is optional).
  const again = maxSeq();
  fr.welcomeSave(appId, { name: "", audience: "adult" });
  assert.equal(maxSeq(), again);
});

test("the look: learner_profile.presentation_mode, synced; only symbol|label", () => {
  assert.deepEqual(fr.lookOf(appId), { look: "symbol", wordsOnly: false });
  const mark = maxSeq();
  assert.deepEqual(fr.setLook(appId, { look: "label" }), { look: "label", wordsOnly: true });
  assert.equal(q("SELECT presentation_mode AS m FROM learner_profile WHERE id='prf_local'")[0].m, "label");
  const ops = opsSince(mark);
  assert.equal(ops.length, 1);
  assert.equal(ops[0][0], "set_setting");
  assert.throws(() => fr.setLook(appId, { look: "huge" }));
  fr.setLook(appId, { look: "symbol" });
  assert.equal(q("SELECT presentation_mode AS m FROM learner_profile WHERE id='prf_local'")[0].m, "symbol");
});

test("world: a person with a photo, pets, foods, places land in their groups", () => {
  const photo = `blob:${"ab".repeat(32)}`;
  const mark = maxSeq();
  const p = fr.worldApply(appId, {
    step: "people",
    people: [{ id: null, name: "Grandma", photoKey: photo }, { id: null, name: "", photoKey: null }],
  });
  assert.equal(p.wrote, true);
  const g = q("SELECT id, photo_key, status FROM personal_entity WHERE spoken_name='Grandma'");
  assert.equal(g.length, 1);
  assert.equal(g[0].photo_key, photo);
  assert.equal(g[0].status, "active");
  assert.equal(q("SELECT count(*) AS n FROM group_membership WHERE group_id='grp_people' AND item_id=?", g[0].id)[0].n, 1);
  const board = app.appBoard(appId).cells.find((c) => c.id === g[0].id);
  assert.ok(board, "the person has a seat on the board");
  assert.equal(board.photoKey, photo);
  assert.equal(p.state.board.cells.find((c) => c.id === g[0].id)?.photoKey, photo);
  assert.ok(opsSince(mark).length >= 2, "entity + placement are recorded as ops");

  const rows = (step, text) => fr.worldApply(appId, { step, text });
  assert.equal(rows("pets", "Buddy\nWhiskers").wrote, true);
  assert.equal(rows("foods", "pizza\nmac and cheese").wrote, true);
  assert.equal(rows("places", "the park").wrote, true);
  const inGroup = (grp) => q(
    `SELECT COALESCE(e.spoken_name, l.text) AS n FROM group_membership gm
     LEFT JOIN personal_entity e ON gm.item_kind='entity' AND e.id=gm.item_id
     LEFT JOIN label l ON gm.item_kind='sense' AND l.sense_id=gm.item_id AND l.kind='lemma'
       AND l.status='approved' AND l.locale='en'
     WHERE gm.group_id=?`, grp).map((r) => r.n);
  assert.ok(inGroup("grp_animals").includes("Buddy") && inGroup("grp_animals").includes("Whiskers"));
  assert.ok(inGroup("grp_snack").some((n) => /pizza/i.test(n)));
  assert.ok(inGroup("grp_snack").includes("mac and cheese"));
  assert.ok(inGroup("grp_going_out").includes("the park"));
  // A repeat of the same list is "already here": nothing is written.
  const before = maxSeq();
  assert.equal(rows("pets", "Buddy").wrote, false);
  assert.equal(maxSeq(), before);
  // A second pass opens on who is there (edits the family, never re-adds).
  assert.ok(fr.worldOpen(appId, {}).people.some((x) => x.name === "Grandma" && x.photoKey === photo));
  const preview = fr.worldPreview(appId, { step: "foods", text: "pizza\nmac and cheese\nzzqx" });
  assert.deepEqual(preview.rows.map((r) => r.tag), ["already here", "already here", "new — picture later"]);
});

test("world: the free-word cap refuses past ten and says the web's words", () => {
  const own = () => q("SELECT count(*) AS n FROM personal_entity WHERE status='active'")[0].n;
  const names = Array.from({ length: 14 }, (_, i) => `Thing${i}`).join("\n");
  const r = fr.worldApply(appId, { step: "places", text: names });
  assert.equal(r.toast, "That's your 10 free words — Pip Lifetime adds unlimited.");
  assert.ok(own() <= 10 + 3, "no more than the cap's own words (+ the ones the test already made as seeds)");
});

/* ---------------- the demo: no network, no writes ---------------- */

test("tour: you -> want -> apple -> fix -> question -> done writes nothing and calls nothing", () => {
  const sentenceCountBefore = count("sentence");
  const seq = maxSeq();
  const events = count("learner_event_log");
  const impressions = count("strip_impression");
  const before = dump();
  outbound.length = 0;

  const t0 = fr.tourStart(appId, { online: false });
  assert.equal(t0.card.say, "Tap you.");
  assert.deepEqual(t0.card.target, { kind: "cell", id: "sns_0002" });
  assert.equal(t0.card.skip, "Skip");
  assert.equal(t0.play[0].key, "audio/onramp/tour-you.mp3");
  assert.equal(t0.bar.length, 0);

  // Out-of-turn taps and buttons change nothing.
  assert.equal(fr.tourTap(appId, { kind: "sense", id: "sns_0013" }).bar.length, 0);
  assert.equal(fr.tourTransform(appId, { mode: "fix" }).bar.length, 0);
  assert.equal(fr.tourTransform(appId, { mode: "past" }).bar.length, 0);

  const t1 = fr.tourTap(appId, { kind: "sense", id: "sns_0002" });
  assert.deepEqual(t1.bar.map((c) => c.display.toLowerCase()), ["you"]);
  assert.equal(t1.card.say, "Tap want.");
  assert.equal(t1.play.length, 2, "the word's audio, then the next instruction");
  assert.equal(t1.play[1].key, "audio/onramp/tour-want.mp3");

  const t2 = fr.tourTap(appId, { kind: "sense", id: "sns_0013" });
  assert.equal(t2.card.say, "Now tap apple in the Smart bar.");
  assert.deepEqual(t2.card.target, { kind: "strip", id: "sns_0128" });
  assert.deepEqual(t2.strip.cards.map((c) => c.id), ["sns_0128"], "the Smart bar offers the one scripted word");
  assert.ok(t2.strip.cards[0].art, "the real apple tile");

  const t3 = fr.tourTap(appId, { kind: "sense", id: "sns_0128" });
  assert.deepEqual(t3.bar.map((c) => c.display.toLowerCase()), ["you", "want", "apple"]);
  assert.equal(t3.card.say, "Tap ✨ to make it a sentence.");
  assert.deepEqual(t3.card.target, { kind: "button", id: "fix" });
  assert.deepEqual(t3.strip.cards, []);

  assert.equal(fr.tourTransform(appId, { mode: "question" }).card.id, "fix", "not yet");
  const t4 = fr.tourTransform(appId, { mode: "fix" });
  assert.equal(t4.bar.map((c) => c.display).join(" "), "You want an apple.");
  assert.equal(t4.play[0].key, "audio/onramp/you-want-an-apple.mp3");
  assert.equal(t4.card.say, "Now tap ❓ to ask it.");

  const t5 = fr.tourTransform(appId, { mode: "question" });
  assert.equal(t5.bar.map((c) => c.display).join(" "), "Do you want an apple?");
  assert.equal(t5.question, true);
  assert.equal(t5.play[0].key, "audio/onramp/do-you-want-an-apple.mp3");
  assert.equal(t5.card.id, "done");
  assert.equal(t5.card.say, "That's Pip. Now try your own.");
  assert.equal(t5.card.note, "✨ and ❓ need the internet to work on your own sentences. Connect when you can.");
  assert.deepEqual([t5.card.voices, t5.card.go], ["Try other voices", "Start talking"]);

  // The instruments: the whole database, the op log, the event log and
  // the outbound boundary are exactly as they were.
  const after = dump();
  assert.deepEqual(changedTables(before, after), [], "no table changed during the demo");
  assert.equal(maxSeq(), seq, "no sync op");
  assert.equal(count("learner_event_log"), events, "nothing in learner_event_log");
  assert.equal(count("strip_impression"), impressions);
  assert.equal(count("sentence"), sentenceCountBefore);
  assert.deepEqual(outbound, [], "no fetch, socket, or host call");

  const end = fr.tourEnd(appId);
  assert.equal(end.active, false);
  assert.deepEqual(end.bar, []);
  assert.equal(count("learner_event_log"), events, "still nothing after the bar clears");
  assert.equal(maxSeq(), seq);
  assert.deepEqual(outbound, []);
  assert.equal(fr.tourActive(appId).active, false);
});

test("tour: the web's own SCRIPT and the sentence-bar truth table agree", () => {
  const script = web("public/board/tour-ui.js");
  assert.ok(script.includes('fix: "You want an apple."'));
  assert.ok(script.includes('question: "Do you want an apple?"'));
  const doc = web("docs/product/Sentence_Bar.md");
  assert.ok(doc.includes("| you want apple | You want an apple. | Do you want an apple? |"));
  // Every card line is in the web's source verbatim.
  fr.tourStart(appId, {});
  const said = [];
  for (const id of ["sns_0002", "sns_0013", "sns_0128"]) said.push(fr.tourTap(appId, { kind: "sense", id }).card.say);
  said.push(fr.tourTransform(appId, { mode: "fix" }).card.say);
  for (const s of said) assert.ok(script.includes(`"${s}"`), s);
  fr.tourEnd(appId);
});

test("tour: skip at any step ends it with nothing written", () => {
  const events = count("learner_event_log");
  const seq = maxSeq();
  outbound.length = 0;
  fr.tourStart(appId, { online: true });
  fr.tourTap(appId, { kind: "sense", id: "sns_0002" });
  const end = fr.tourEnd(appId); // Skip
  assert.deepEqual(end.bar, []);
  assert.equal(fr.tourActive(appId).active, false);
  assert.equal(count("learner_event_log"), events);
  assert.equal(maxSeq(), seq);
  assert.deepEqual(outbound, []);
  // A replay starts over from the first card.
  assert.equal(fr.tourStart(appId, {}).card.say, "Tap you.");
  fr.tourEnd(appId);
});

test("tour: only the buttons the person has (038)", () => {
  const walk = () => {
    const ids = [];
    let m = fr.tourStart(appId, { online: true });
    for (;;) {
      ids.push(m.card.id);
      if (m.card.done) return { ids, note: m.card.note };
      const next = m.card.id;
      m = ["you", "want", "apple"].includes(next)
        ? fr.tourTap(appId, { kind: "sense", id: { you: "sns_0002", want: "sns_0013", apple: "sns_0128" }[next] })
        : fr.tourTransform(appId, { mode: next });
    }
  };
  app.appSetSetting(appId, "bar_controls", ["question", "backspace", "clear"]);
  let w = walk();
  assert.deepEqual(w.ids, ["you", "want", "apple", "question", "done"]);
  fr.tourEnd(appId);
  app.appSetSetting(appId, "bar_controls", ["backspace", "clear"]);
  w = walk();
  assert.deepEqual(w.ids, ["you", "want", "apple", "done"]);
  assert.equal(w.note, "Build a sentence and ▶ speaks it.");
  fr.tourEnd(appId);
  app.appSetSetting(appId, "bar_controls", ["fix", "question", "past", "future", "backspace", "clear"]);
  w = walk();
  assert.equal(w.note, "✨ and ❓ work on any sentence you build.");
  fr.tourEnd(appId);
});

/* ---------------- when first run shows (the registry) ---------------- */

test("first run shows on a fresh install only: the web's registry rows", async () => {
  const { addUser, listUsers } = await import(join(root, "public/shared/users.mjs"));
  const mem = new Map();
  const store = {
    get: async (k) => mem.get(k), put: async (k, v) => { mem.set(k, v); },
    del: async (k) => { mem.delete(k); }, keys: async () => [...mem.keys()],
    list: async (prefix) => [...mem].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v),
  };
  // board.js 129-131: the first boot's home person needs setup.
  const first = await addUser(store, { home: true, needsSetup: true });
  assert.equal(first.needsSetup, true);
  // devices-ui.js 799-808: a join / restore / sign-in adds the LINKED
  // person (never needsSetup) and removes the untouched placeholder.
  const linked = await addUser(store, { id: "u-linked", sync: { userId: "u-linked", epoch: 1, cursor: 0 }, home: true });
  assert.equal(linked.needsSetup, false);
  assert.equal(linked.home, true);
  assert.equal(first.needsSetup && first.id !== linked.id, true, "the placeholder is replaced");
  // Parent Corner add: no welcome.
  const added = await addUser(store, { name: "Sam" });
  assert.equal(added.needsSetup, false);
  assert.ok((await listUsers(store)).length >= 2);
});
