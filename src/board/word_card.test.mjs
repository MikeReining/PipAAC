/**
 * The word card (029 § 4). Picture tests count the calls the card makes
 * to the Picture Finder seam — what actually leaves the device — and read
 * the database for what was saved.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { installDom, findAll } from "./fake_dom.mjs";
import { mountWordCard } from "../../public/board/word-card.js";
import { mountPictureFill } from "../../public/board/picture-fill.js";
import { createEntity } from "../../public/shared/groups.mjs";
import { imageOverrideFor } from "../../public/shared/images.mjs";
import { overrideFor, setOverride } from "../../public/shared/voice.mjs";
import { sniffType } from "../../public/shared/mediatype.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

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

let catalog = null;
const loadCatalog = () => {
  if (catalog) return catalog;
  const root = join(import.meta.dirname, "../..");
  catalog = buildCatalog(JSON.parse(readFileSync(join(root, "data/launch_lexicon.json"), "utf8")),
    parseCoordinateMapMarkdown(readFileSync(join(root, "docs/product/Core_Coordinate_Map.md"), "utf8")));
  return catalog;
};

function cardHarness({ tile = null, withCatalog = false, found = { candidates: [], auto: null, scope: "common", kind: null, calibrated: false } } = {}) {
  const db = createDatabase(":memory:");
  if (withCatalog) importCatalog(db, loadCatalog());
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
    metaFor(id) { return { role: "Blue", art: db.prepare("SELECT i.key FROM sense s JOIN image i ON i.id = s.default_image_id WHERE s.id = ?").get(id)?.key ?? null }; },
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
  // The row's alternatives: picture choices that are not the one in use.
  const thumbs = () => findAll($("wc-pics"), (n) => n.className === "wc-opt wc-thumb");
  const addTiles = (box) => findAll($(box), (n) => n.className === "wc-opt wc-thumb wc-add");
  const drawTile = (box = "wc-results") => addTiles(box).find((b) => /Draw/.test(b.children[1]?.textContent ?? ""));
  const find = async (q) => {
    $("wc-desc").value = q;
    await $("wc-desc").fire("input");
    await $("wc-find").fire("submit");
    await flush();
  };
  return { db, $, card, toasts, spoken, pictures, photo, thumbs, drawTile, find };
}

test("a personal word opens with its name, editable", () => {
  const h = cardHarness();
  h.card.openWordCard({ item_kind: "entity", item_id: "ent_pip", label: "Pip" });
  assert.equal(h.$("wc-name").value, "Pip");
  assert.equal(h.$("wc-name").disabled, false);
  assert.equal(h.$("wc-picsec").hidden, false);
  assert.equal(h.$("wc-kindlabel").hidden, false, "a personal word's colour can change");
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

test("WT5 — with a picture, drawing needs words; Find's Draw tile carries them in one draw", async () => {
  const h = cardHarness({
    found: { candidates: CANDS, auto: "img_a", scope: "common", kind: null, calibrated: true },
  });
  h.card.openWordCard({ item_kind: "entity", item_id: "ent_pip", label: "Pip" });
  await flush();
  assert.equal(h.drawTile("wc-pics"), undefined, "no wordless redraw once it has a picture");
  assert.equal(h.$("wc-findgo").disabled, true);

  await h.find("a bowl, not a jar");
  assert.equal(h.pictures.calls.find.at(-1).text, "a bowl, not a jar", "Find searches the typed words");
  assert.equal(h.pictures.calls.draw.length, 0, "finding never draws");
  await h.drawTile().click();
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
  assert.equal(h.drawTile("wc-pics"), undefined, "drawing a person needs a description");
});

test("an uncalibrated finder never spends a drawing on its own", async () => {
  const h = cardHarness({
    found: { candidates: CANDS, auto: null, scope: "common", kind: null, calibrated: false },
  });
  h.card.openWordCard({ item_kind: "entity", item_id: "ent_pip", label: "Pip" }, { justAdded: { groupName: "Mine" } });
  await flush();
  assert.equal(h.pictures.calls.draw.length, 0);
  assert.ok(h.drawTile("wc-pics"), "a first drawing needs no words");
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
  assert.equal(h.$("wc-voicename").textContent, "Eve");
  assert.equal(h.spoken.length, 0);
  state = "ready";
  listener();
  listener();
  assert.equal(h.spoken.length, 1, "plays once, not on every status tick");
  assert.equal(h.$("wc-voice").textContent, "", "a ready voice needs no news line");
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
  assert.equal(h2.$("wc-kindlabel").hidden, true, "a built-in word's colour is fixed");
});

/* ---------------- built-in words: find, draw, our pictures ---------------- */

const senseOf = (db, text) => db.prepare(
  "SELECT sense_id FROM label WHERE text = ? AND locale = 'en' AND kind = 'lemma' AND status = 'approved'",
).get(text)?.sense_id;

test("a built-in word finds pictures; picking one becomes this family's picture", async () => {
  const h = cardHarness({
    withCatalog: true,
    found: { candidates: [{ image_id: "ext_x", asset: "/pictures/ext_x.webp", source: "extended" }], auto: null },
  });
  const cup = senseOf(h.db, "cup");
  h.card.openWordCard({ item_kind: "sense", item_id: cup, label: "cup" });
  await h.find("sippy cup");
  assert.equal(h.pictures.calls.find.length, 1);
  assert.equal(h.pictures.calls.find[0].text, "sippy cup");
  const result = findAll(h.$("wc-results"), (n) => n.className === "wc-opt wc-thumb")[0];
  await result.click();
  await flush();
  const ovr = imageOverrideFor(h.db, cup);
  assert.ok(ovr?.photo_key, "a finder picture is saved as bytes — it works offline and syncs");
  assert.equal(h.pictures.calls.pick.length, 1);
  assert.equal(h.pictures.calls.pick[0].text, "cup", "the pick counts for the word, not the search");
  assert.equal(h.pictures.calls.draw.length, 0);
});

test("another word's catalog picture goes in as bytes; this word's own goes in by id", async () => {
  const h = cardHarness({ withCatalog: true });
  const cup = senseOf(h.db, "cup");
  const ballImg = h.db.prepare("SELECT default_image_id AS d FROM sense WHERE id = ?").get(senseOf(h.db, "ball")).d;
  h.pictures.find = async () => ({ candidates: [{ image_id: ballImg, asset: "/symbols/ball.webp", source: "catalog" }] });
  h.card.openWordCard({ item_kind: "sense", item_id: cup, label: "cup" });
  await h.find("round");
  await findAll(h.$("wc-results"), (n) => n.className === "wc-opt wc-thumb")[0].click();
  await flush();
  const ovr = imageOverrideFor(h.db, cup);
  assert.ok(ovr?.photo_key && !ovr.image_id, "a picture of ball can't be cup's override by id");
});

test("a built-in word draws only with words, steering a drawing of the word itself", async () => {
  const h = cardHarness({ withCatalog: true, found: { candidates: [], auto: null } });
  const cup = senseOf(h.db, "cup");
  h.card.openWordCard({ item_kind: "sense", item_id: cup, label: "cup" });
  await flush();
  assert.equal(h.drawTile("wc-pics"), undefined, "no wordless redraw of a built-in word");
  await h.find("a green sippy cup");
  await h.drawTile().click();
  await flush();
  assert.equal(h.pictures.calls.draw.length, 1);
  assert.equal(h.pictures.calls.draw[0].text, "cup");
  assert.equal(h.pictures.calls.draw[0].description, "a green sippy cup");
  assert.ok(imageOverrideFor(h.db, cup)?.photo_key, "the drawing is this family's picture");
  assert.equal(h.$("wc-results").hidden, true, "the Find closes once its drawing lands");
});

test("our own picture stays a choice: tapping it goes back", async () => {
  const h = cardHarness({ withCatalog: true });
  const cup = senseOf(h.db, "cup");
  h.card.openWordCard({ item_kind: "sense", item_id: cup, label: "cup" });
  h.$("wc-photo").files = [{ name: "ours.jpg" }];
  await h.$("wc-photo").fire("change");
  await flush();
  assert.ok(imageOverrideFor(h.db, cup)?.photo_key, "the photo is in use");
  const ours = h.thumbs()[0];
  assert.ok(ours, "our picture is still offered");
  await ours.click();
  await flush();
  assert.equal(imageOverrideFor(h.db, cup), null, "back to our picture");

  // A fresh card (the app reopened) still offers the photo after switching away.
  const h2 = cardHarness({ withCatalog: true });
  h2.db.prepare("INSERT INTO image_override (id, sense_id, photo_key, status) VALUES ('imo_t', ?, 'blob:old', 'ready')").run(cup);
  h2.card.openWordCard({ item_kind: "sense", item_id: cup, label: "cup" });
  await h2.thumbs()[0].click();
  await flush();
  assert.equal(imageOverrideFor(h2.db, cup), null);
  assert.ok(findAll(h2.$("wc-pics"), (n) => n.className === "wc-opt wc-thumb photo").length === 1,
    "the photo is still a choice");
});

/* ------------------------------- voice ------------------------------- */

test("switching to the app's voice keeps the recording one tap away", async () => {
  const h = cardHarness({ withCatalog: true });
  const more = senseOf(h.db, "more");
  const utt = h.db.prepare(
    `SELECT l.utterance_id AS id, u.spoken_text AS text FROM label l JOIN utterance u ON u.id = l.utterance_id
     WHERE l.sense_id = ? AND l.kind = 'lemma' AND l.locale = 'en'`).get(more);
  setOverride(h.db, { itemKind: "utterance", itemId: utt.id, key: "blob:mine", recordedText: utt.text });
  h.card.openWordCard({ item_kind: "sense", item_id: more, label: "more" });
  assert.equal(h.$("wc-voicemine").hidden, false);
  assert.ok(h.$("wc-voicemine").classList.contains("sel"));

  await h.$("wc-voicebase").click();
  assert.equal(overrideFor(h.db, "utterance", utt.id), null, "the app's voice plays now");
  assert.equal(h.$("wc-voicemine").hidden, false, "the recording is still offered");
  assert.ok(h.$("wc-voicebase").classList.contains("sel"));

  await h.$("wc-voicemine").click();
  assert.equal(overrideFor(h.db, "utterance", utt.id)?.key, "blob:mine", "the same recording, back");
  assert.equal(h.spoken.length, 2, "each tap plays what she'll hear");
});

test("a renamed word doesn't offer the old name's recording", () => {
  const h = cardHarness();
  setOverride(h.db, { itemKind: "entity", itemId: "ent_pip", key: "blob:old", recordedText: "Pip" });
  h.db.prepare("UPDATE clip_override SET status = 'superseded'").run();
  h.db.prepare("UPDATE personal_entity SET spoken_name = 'Pippa' WHERE id = 'ent_pip'").run();
  h.card.openWordCard({ item_kind: "entity", item_id: "ent_pip", label: "Pippa" });
  assert.equal(h.$("wc-voicemine").hidden, true);
});

/* ------------------------------- colour ------------------------------ */

test("colour offers neutral first; an unclassified word is neutral", async () => {
  const h = cardHarness();
  h.card.openWordCard({ item_kind: "entity", item_id: "ent_pip", label: "Pip" });
  const sw = findAll(h.$("wc-kindmenu"), (n) => n.className.startsWith("wc-swatch"));
  assert.equal(sw.length, 7);
  assert.ok(sw[0].className.includes("r-None") && sw[0].className.includes("sel"));
  assert.equal(h.$("wc-kind").textContent, "Thing");
  await sw[1].click();
  assert.equal(h.photo().fitzgerald_role, "Yellow");
  assert.equal(h.$("wc-kind").textContent, "Person");
  const again = findAll(h.$("wc-kindmenu"), (n) => n.className.startsWith("wc-swatch"));
  await again[0].click();
  assert.equal(h.photo().fitzgerald_role, "None", "the database takes the neutral role");
});

/* ---------------------------- media types ---------------------------- */

test("stored media declares its type from its bytes", () => {
  const bytes = (...a) => new Uint8Array([...a, ...new Array(16).fill(0)].slice(0, 16));
  const ascii = (str) => [...str].map((c) => c.charCodeAt(0));
  assert.equal(sniffType(bytes(0, 0, 0, 0x1c, ...ascii("ftypM4A "))), "audio/mp4", "an iPad recording");
  assert.equal(sniffType(bytes(0, 0, 0, 0x18, ...ascii("ftypheic"))), "image/heic", "an iPad photo");
  assert.equal(sniffType(bytes(0x1a, 0x45, 0xdf, 0xa3)), "audio/webm", "a Chrome recording");
  assert.equal(sniffType(bytes(...ascii("OggS"))), "audio/ogg");
  assert.equal(sniffType(bytes(0xff, 0xd8, 0xff, 0xe0)), "image/jpeg");
  assert.equal(sniffType(bytes(0x89, ...ascii("PNG"))), "image/png");
  assert.equal(sniffType(bytes(...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP"))), "image/webp");
  assert.equal(sniffType(bytes(1, 2, 3, 4)), "");
});
