/**
 * The word card (029 § 4). Picture tests count the calls the card makes
 * to the Picture Finder seam — what actually leaves the device — and read
 * the database for what was saved.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { createDatabase } from "./catalog.mjs";
import { installDom, findAll } from "./fake_dom.mjs";
import { mountWordCard } from "../../public/board/word-card.js";
import { mountPictureFill } from "../../public/board/picture-fill.js";
import { createEntity } from "../../public/shared/groups.mjs";

const settle = () => new Promise((r) => setTimeout(r, 0));
const flush = async (n = 8) => { for (let i = 0; i < n; i++) await settle(); };

const CANDS = [
  { image_id: "img_a", asset: "/symbols/a.png", source: "catalog", score: 0.9 },
  { image_id: "img_b", asset: "/symbols/b.png", source: "catalog", score: 0.8 },
  { image_id: "img_c", asset: "/symbols/c.png", source: "catalog", score: 0.7 },
  { image_id: "img_d", asset: "/symbols/d.png", source: "catalog", score: 0.6 },
];

/** A Picture Finder seam that records every call. */
function fakePictures(found) {
  const calls = { find: [], draw: [], pick: [], reject: [] };
  let n = 0;
  return {
    calls,
    async find(a) { calls.find.push(a); return found; },
    async findBatch() { return { results: [] }; },
    async draw(a) {
      calls.draw.push(a);
      n++;
      return { ok: true, blob: { size: 1 }, imageId: `drw_${String(n).padStart(64, "0")}`, cache: "mint", left: 4 };
    },
    async pick(a) { calls.pick.push(a); return true; },
    async reject(a) { calls.reject.push(a); return true; },
    async allowance() { return { left: 5, total: 5 }; },
    async imageBlob() { return { size: 1 }; },
  };
}

function cardHarness({ tile = null, found = { candidates: [], auto: null, scope: "common", kind: null, calibrated: false } } = {}) {
  const db = createDatabase(":memory:");
  createEntity(db, { id: "ent_pip", name: "Pip" });
  const $ = installDom();
  const toasts = [];
  const spoken = [];
  let photoN = 0;
  const savePhoto = async () => ({ key: `blob:${++photoN}`, bytes: new Uint8Array(1) });
  const pictures = fakePictures(found);
  const all = (database, sql, p = []) => database.prepare(sql).all(...p);
  const creds = async () => ({ userId: "u", license: "l" });
  const pictureFill = mountPictureFill({
    db, all, locale: "en", client: pictures, creds, savePhoto,
    syncUploadBlob: () => Promise.resolve(), storage: null,
  });
  const card = mountWordCard({
    db,
    locale: "en",
    all,
    open() {},
    close() {},
    toast: (m) => toasts.push(m),
    metaFor() { return { role: "Yellow" }; },
    artInto() { return false; },
    async loadPhotoURL(k) { return k ? `blob-url:${k}` : null; },
    savePhoto,
    syncUploadBlob: () => Promise.resolve(),
    speakItem: (it) => spoken.push(it),
    xBadge: () => document.createElement("button"),
    invalidateIndex() {},
    setView() {},
    rerenderView() {},
    renderStrip() {},
    renderGrid() {},
    flashCell() {},
    getCell() { return null; },
    getGroupKey() { return null; },
    setGroup() {},
    dropEntityPhoto() {},
    dropEntityRole() {},
    dropSenseMeta() {},
    openAddToBoards() {},
    tile,
    pictures,
    pictureFill,
    creds,
  });
  const photo = () => db.prepare("SELECT photo_key, hint, fitzgerald_role FROM personal_entity WHERE id = 'ent_pip'").get();
  const thumbs = () => findAll($("wc-others"), (n) => n.className === "wc-thumb");
  return { db, $, card, toasts, spoken, pictures, photo, thumbs };
}

test("a personal word opens with its name, editable", () => {
  const h = cardHarness();
  h.card.openWordCard({ item_kind: "entity", item_id: "ent_pip", label: "Pip" });
  assert.equal(h.$("wc-name").value, "Pip");
  assert.equal(h.$("wc-name").disabled, false);
  assert.equal(h.$("wc-role").textContent, "Your word");
  assert.equal(h.$("wc-picsec").hidden, false);
});

test("WT4 — a close match applies with zero draws; an alternative is one pick + one reject", async () => {
  const h = cardHarness({
    found: { candidates: CANDS, auto: "img_a", scope: "common", kind: "Green", calibrated: true },
  });
  h.card.openWordCard({ item_kind: "entity", item_id: "ent_pip", label: "Pip" }, { justAdded: { groupName: "Mine" } });
  await flush();
  assert.ok(h.photo().photo_key, "the close picture is saved onto the word");
  assert.equal(h.photo().fitzgerald_role, "Green", "kind inferred while the adult never chose one");
  assert.equal(h.pictures.calls.draw.length, 0);

  await flush();
  const alt = h.thumbs()[0];
  await alt.click();
  await flush();
  assert.equal(h.pictures.calls.pick.length, 1);
  assert.equal(h.pictures.calls.draw.length, 0);
  assert.equal(h.pictures.calls.reject.length, 1);
  assert.equal(h.pictures.calls.reject[0].ours, "img_a");
  assert.equal(h.pictures.calls.reject[0].action, "pick");

  // WT9 — swapping among the adult's own choices sends no further reject.
  await h.thumbs()[0].click();
  await flush();
  assert.equal(h.pictures.calls.reject.length, 1);
});

test("WT9 — a photo over our choice sends one reject with no image data", async () => {
  const h = cardHarness({
    found: { candidates: CANDS, auto: "img_a", scope: "common", kind: null, calibrated: true },
  });
  h.card.openWordCard({ item_kind: "entity", item_id: "ent_pip", label: "Pip" });
  await flush();
  h.$("wc-photo").files = [{ name: "me.jpg" }];
  await h.$("wc-photo").fire("change");
  await flush();
  assert.equal(h.pictures.calls.reject.length, 1);
  const r = h.pictures.calls.reject[0];
  assert.equal(r.action, "photo");
  assert.equal(r.theirs ?? null, null, "a photo is never described or sent");
});

test("WT5 — with a picture, Draw it again needs words; with words, one draw carrying them", async () => {
  const h = cardHarness({
    found: { candidates: CANDS, auto: "img_a", scope: "common", kind: null, calibrated: true },
  });
  h.card.openWordCard({ item_kind: "entity", item_id: "ent_pip", label: "Pip" });
  await flush();
  assert.equal(h.$("wc-redraw").textContent, "Draw it again");
  assert.equal(h.$("wc-redraw").disabled, true);

  h.$("wc-desc").value = "a bowl, not a jar";
  await h.$("wc-desc").fire("input");
  assert.equal(h.$("wc-redraw").disabled, false);
  await h.$("wc-redraw").click();
  await flush();
  assert.equal(h.pictures.calls.draw.length, 1);
  assert.equal(h.pictures.calls.draw[0].description, "a bowl, not a jar");
  assert.equal(h.photo().hint, "a bowl, not a jar", "the description is saved on the word");
  assert.equal(h.pictures.calls.reject.length, 1);
  assert.equal(h.pictures.calls.reject[0].action, "draw");
});

test("WT6 — people and pets are never drawn automatically; Photo leads", async () => {
  const h = cardHarness({
    found: { candidates: CANDS.slice(0, 2), auto: null, scope: "personal", kind: "Yellow", calibrated: true },
  });
  h.card.openWordCard({ item_kind: "entity", item_id: "ent_pip", label: "Pip" }, { justAdded: { groupName: "Mine" } });
  await flush();
  assert.equal(h.pictures.calls.draw.length, 0);
  assert.equal(h.photo().photo_key, null);
  assert.ok(h.$("wc-photolabel").classList.contains("lead"));
  assert.match(h.$("wc-picstate").textContent, /Add a photo of Pip/);
  assert.equal(h.$("wc-redraw").disabled, true, "drawing a person needs a description");
});

test("an uncalibrated finder never spends a drawing on its own", async () => {
  const h = cardHarness({
    found: { candidates: CANDS, auto: null, scope: "common", kind: null, calibrated: false },
  });
  h.card.openWordCard({ item_kind: "entity", item_id: "ent_pip", label: "Pip" }, { justAdded: { groupName: "Mine" } });
  await flush();
  assert.equal(h.pictures.calls.draw.length, 0);
  assert.equal(h.$("wc-redraw").textContent, "Draw it");
  assert.equal(h.$("wc-redraw").disabled, false, "a first drawing needs no words");
});

test("a calibrated miss on a common word draws once, by itself", async () => {
  const h = cardHarness({
    found: { candidates: CANDS, auto: null, scope: "common", kind: null, calibrated: true },
  });
  h.card.openWordCard({ item_kind: "entity", item_id: "ent_pip", label: "Pip" }, { justAdded: { groupName: "Mine" } });
  await flush();
  assert.equal(h.pictures.calls.draw.length, 1);
  assert.ok(h.photo().photo_key);
  assert.match(h.$("wc-picstate").textContent, /Drawn for you · 4 drawings left/);
});

test("an automatic fill never replaces a picture the adult already has", async () => {
  const h = cardHarness({
    found: { candidates: CANDS, auto: "img_a", scope: "common", kind: "Green", calibrated: true },
  });
  h.db.prepare("UPDATE personal_entity SET photo_key = 'blob:mine', fitzgerald_role = 'Blue' WHERE id = 'ent_pip'").run();
  h.card.openWordCard({ item_kind: "entity", item_id: "ent_pip", label: "Pip" });
  await flush();
  assert.equal(h.photo().photo_key, "blob:mine");
  assert.equal(h.photo().fitzgerald_role, "Blue", "the adult's kind stands");
  assert.equal(h.pictures.calls.draw.length, 0);
});

test("a new word plays once when its voice is ready", async () => {
  let listener = null;
  let state = "minting";
  const tile = {
    status: () => state,
    message: (s) => (s === "minting" ? "Making Eve's voice…" : ""),
    name: () => "Eve",
    onStatus: (cb) => { listener = cb; return () => {}; },
    ensure: async () => ({ ok: true }),
    flag: async () => true,
    shared: () => true,
  };
  const h = cardHarness({ tile });
  h.card.openWordCard({ item_kind: "entity", item_id: "ent_pip", label: "Pip" }, { justAdded: { groupName: "Mine" } });
  assert.equal(h.$("wc-voice").textContent, "Making Eve's voice…");
  assert.equal(h.spoken.length, 0);
  state = "ready";
  listener();
  listener();
  assert.equal(h.spoken.length, 1, "plays once, not on every status tick");
  assert.equal(h.$("wc-voice").textContent, "Eve's voice");
});

test("028 WT14 — 'Sounds wrong' flags the shared clip and keeps playing", async () => {
  const flagged = [];
  const tile = {
    status: () => null,
    message: () => "",
    name: () => "Eve",
    onStatus: () => () => {},
    ensure: async () => ({ ok: true }),
    flag: async (text) => { flagged.push(text); return true; },
    shared: () => true,
  };
  const h = cardHarness({ tile });
  h.card.openWordCard({ item_kind: "entity", item_id: "ent_pip", label: "Pip" });
  assert.equal(h.$("wc-flag").hidden, false); // shared voice → flag offered
  assert.equal(h.$("wc-more").hidden, false);
  await h.$("wc-flag").click();
  assert.deepEqual(flagged, ["Pip"]); // the clip's text, not an id
  assert.equal(h.toasts.at(-1), "Flagged for review — it keeps playing meanwhile");
});

test("028 — flag stays hidden for catalog words and device voices", () => {
  const tile = {
    status: () => null,
    message: () => "",
    name: () => "Eve",
    onStatus: () => () => {},
    ensure: async () => ({ ok: true }),
    flag: async () => false,
    shared: () => false, // device TTS — nothing shared to flag
  };
  const h = cardHarness({ tile });
  h.card.openWordCard({ item_kind: "entity", item_id: "ent_pip", label: "Pip" });
  assert.equal(h.$("wc-flag").hidden, true);

  // A shared voice still hides it for a catalog word — senses play the
  // catalog clip pipeline, which has its own review path.
  const h2 = cardHarness({ tile: { ...tile, shared: () => true } });
  h2.card.openWordCard({ item_kind: "sense", item_id: "s_1", label: "zebra" });
  assert.equal(h2.$("wc-flag").hidden, true);
  assert.equal(h2.$("wc-picsec").hidden, true, "catalog words keep their own picture choices");
});
