/**
 * 044 E6 - a pasted list (LW-5), pictures for the pasted words (PP-6) and
 * several photos as new words (PP-5), through the built core. See
 * app_pictures.fakes.mjs for the rig.
 *
 * Run: scripts/test.sh scripts/ios/app_pictures_bulk.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LICENSE, P, USER, appId, blobBytes, blobs, caches, cand, dbh, events, findResult, keystore, lastRow,
  maxSeq, newWord, opsSince, photoOf, pics, png, q, quiet, sha, sleep, until, worker, appSessionLicensed,
} from "./app_pictures.fakes.mjs";

/* ---------------- a pasted list ---------------- */
test("a pasted list: the web's resolve + dedupe + limits, and the words land through the shared owners", async () => {
  worker.reset(); events.length = 0; worker.left = 20;
  const own = P.groups.liveOwnWords(dbh);
  const text = ["want", "Narwhal", "narwhal", "", "  wombat  ", "WOMBAT", "tarsier", "axolotl"].join("\n");
  const m = pics.bulkState(appId, { groupId: "grp_my_words", text });
  assert.equal(m.title, "Add a list to My Words");
  // Dedupe on normalized text, empties dropped: want, Narwhal, wombat, tarsier, axolotl.
  assert.deepEqual(m.rows.map((r) => r.label), ["want", "Narwhal", "wombat", "tarsier", "axolotl"]);
  assert.equal(m.rows[0].tag, "ours", "a catalog word is placed, not duplicated");
  assert.equal(m.rows[1].tag, "new — picture later", "no find has landed yet");
  assert.equal(m.addLabel.startsWith("Add 5 to My Words"), true, m.addLabel);

  // Settle the finder (one find-batch, normalized items, the web's body).
  await until(() => worker.of("/api/v1/pictures/find-batch").length === 1, "find-batch");
  const fb = worker.of("/api/v1/pictures/find-batch")[0].body;
  assert.deepEqual(fb.items, [{ text: "narwhal" }, { text: "wombat" }, { text: "tarsier" }, { text: "axolotl" }]);
  assert.equal(fb.license, LICENSE);
  assert.equal(fb.locale, "en");

  const mark = maxSeq();
  const add = pics.bulkAdd(appId, { groupId: "grp_my_words", text });
  assert.equal(add.toast.text, "Added 5 to My Words");
  const names = q("SELECT spoken_name AS n FROM personal_entity WHERE status='active' ").map((r) => r.n);
  for (const n of ["Narwhal", "wombat", "tarsier", "axolotl"]) assert.ok(names.includes(n), n);
  assert.equal(names.filter((n) => n.toLowerCase() === "narwhal").length, 1, "one Narwhal");
  assert.equal(P.groups.liveOwnWords(dbh), own + 4);
  const inGroup = q("SELECT item_kind, item_id FROM group_membership WHERE group_id='grp_my_words'");
  assert.ok(inGroup.some((r) => r.item_kind === "sense" && r.item_id === "sns_0013"), "want placed as the catalog word");
  assert.ok(opsSince(mark).filter(([k]) => k === "create_entity").length >= 4, "one create op per new word");
  await until(() => events.filter((e) => e.paint).length >= 4, "the pictures fill in");
  await quiet();
});

test("a repeat paste says 'already' and skips; the free-word cap refuses the rest with the web's words", async () => {
  worker.reset(); events.length = 0;
  const again = pics.bulkState(appId, { groupId: "grp_my_words", text: "wombat\ntarsier" });
  assert.deepEqual(again.rows.map((r) => r.tag), ["already", "already"]);
  assert.equal(again.addLabel, "Add all", "nothing new: the button just closes the list");
  const skipped = pics.bulkAdd(appId, { groupId: "grp_my_words", text: "wombat\ntarsier" });
  assert.equal(skipped.toast.text, "Added 0 to My Words (2 already there)");

  const left = Math.max(0, 10 - P.groups.liveOwnWords(dbh));
  const more = Array.from({ length: left + 2 }, (_, i) => `thing${i}`).join("\n");
  const m = pics.bulkState(appId, { groupId: "grp_my_words", text: more });
  assert.equal(m.rows.filter((r) => r.overCap).length, 2);
  assert.equal(m.rows.at(-1).tag, "over the limit");
  assert.equal(m.note, `Only ${left} free word${left === 1 ? "" : "s"} left — 2 rows need Pip Lifetime.`);
  const done = pics.bulkAdd(appId, { groupId: "grp_my_words", text: more });
  assert.equal(done.toast.text, `Added ${left} to My Words — 2 more need Pip Lifetime`);
  assert.equal(P.groups.liveOwnWords(dbh), 10, "never past the cap");
  // Only the over-limit rows left: Add becomes the door to Lifetime.
  const onlyOver = pics.bulkState(appId, { groupId: "grp_my_words", text: "zzz1\nzzz2" });
  assert.equal(onlyOver.addLabel, "See Pip Lifetime");
  assert.equal(pics.bulkAdd(appId, { groupId: "grp_my_words", text: "zzz1\nzzz2" }).toast.text,
    "That's your 10 free words — Pip Lifetime adds unlimited.");
  await quiet();
});

test("fill pictures for pasted words: close ones free, the rest drawn; a big draw list asks once", async () => {
  worker.reset(); events.length = 0; worker.drawN = 0;
  // A licensed person: no word cap, so a list of 12 is possible.
  appSessionLicensed(true);
  worker.left = 20;
  const words = ["okapi", "pangolin", ...Array.from({ length: 11 }, (_, i) => `gizmo${i}`)];
  worker.finds.set("okapi", findResult({ auto: "img_a", scope: "common" }));
  worker.finds.set("pangolin", findResult({ auto: null, scope: "common", calibrated: true, candidates: [] }));
  for (let i = 0; i < 11; i++) worker.finds.set(`gizmo${i}`, findResult({ auto: null, scope: "common", calibrated: true, candidates: [] }));
  const text = words.join("\n");
  let m = pics.bulkState(appId, { groupId: "grp_my_words", text });
  await until(() => worker.of("/api/v1/pictures/find-batch").length === 1, "find-batch");
  await until(() => events.some((e) => e.bulk?.note), "the form repaints with the draw note");
  m = [...events].reverse().find((e) => e.bulk).bulk;
  assert.equal(m.rows.find((r) => r.label === "okapi").tag, "new");
  assert.equal(m.rows.find((r) => r.label === "pangolin").tag, "will draw");
  assert.ok(m.addLabel.endsWith("· draws 12 new pictures"), m.addLabel);
  assert.equal(m.note, "Drawing 12 pictures uses 12 of your 20 drawings. Tap a thumbnail to use one of ours instead.");

  // > 10 drawings: the first press only arms; the second goes.
  const first = pics.bulkAdd(appId, { groupId: "grp_my_words", text });
  assert.equal(first.armed, true);
  assert.equal(first.bulk.addLabel, "Yes — add 13 and draw 12");
  assert.equal(worker.of("/api/v1/pictures/draw").length, 0, "nothing is drawn before the yes");
  const ids0 = q("SELECT count(*) AS n FROM personal_entity").at(0).n;
  const go = pics.bulkAdd(appId, { groupId: "grp_my_words", text });
  assert.equal(go.toast.text, "Added 13 to My Words");
  assert.equal(q("SELECT count(*) AS n FROM personal_entity").at(0).n, ids0 + 13);

  await until(() => worker.of("/api/v1/pictures/draw").length === 12, "12 drawings, one at a time", 15000);
  await until(() => q(`SELECT count(*) AS n FROM personal_entity WHERE photo_key IS NOT NULL
    AND spoken_name IN (${words.map(() => "?").join(",")})`, ...words)[0].n === 13, "every pasted word has a picture", 15000);
  // The close one cost no drawing; the picture is the finder's own bytes.
  const okapi = q("SELECT photo_key FROM personal_entity WHERE spoken_name='okapi'")[0].photo_key;
  assert.deepEqual(blobBytes(okapi), png("img_a.png"));
  assert.equal(worker.left, 20 - 12);
  // Never concurrently: draws are sequential, one per word.
  assert.equal(new Set(worker.of("/api/v1/pictures/draw").map((r) => r.body.text)).size, 12);
  appSessionLicensed(false);
  await quiet();
});

test("cycling a row's thumbnail uses the adult's pick: applied from the candidate, with a pick signal", async () => {
  worker.reset(); events.length = 0;
  appSessionLicensed(true);
  worker.finds.set("durian", findResult({ auto: "img_a", candidates: [cand("img_a"), cand("img_b", 1), cand("img_c", 2)] }));
  const text = "durian";
  pics.bulkState(appId, { groupId: "grp_my_words", text });
  await until(() => worker.of("/api/v1/pictures/find-batch").length === 1, "found");
  await until(() => [...events].reverse().find((e) => e.bulk)?.bulk.rows[0].cycles, "cycles");
  const m = pics.bulkCycle(appId, { groupId: "grp_my_words", text, key: "durian" });
  assert.equal(m.rows[0].tag, "new");
  pics.bulkAdd(appId, { groupId: "grp_my_words", text });
  await until(() => q("SELECT photo_key FROM personal_entity WHERE spoken_name='durian'")[0]?.photo_key, "picked picture");
  const key = q("SELECT photo_key FROM personal_entity WHERE spoken_name='durian'")[0].photo_key;
  assert.deepEqual(blobBytes(key), png("img_b.png"), "the second candidate, not the auto");
  await until(() => worker.of("/api/v1/pictures/pick").length === 1, "pick signal");
  assert.equal(worker.of("/api/v1/pictures/pick")[0].body.image_id, "img_b");
  assert.equal(worker.of("/api/v1/pictures/draw").length, 0);
  appSessionLicensed(false);
  await quiet();
});

/* ---------------- several photos as new words ---------------- */

test("several photos become several words, named ones only, through the shared owner", () => {
  appSessionLicensed(true);
  const keys = ["one", "two", "three"].map((n) => {
    const b = Buffer.from(`photo ${n}`);
    blobs.set(sha(b), b.toString("base64url"));
    return `blob:${sha(b)}`;
  });
  const drafts = [
    { key: keys[0], name: "Grandpa" }, { key: keys[1], name: "" }, { key: keys[2], name: "the dog park" },
  ];
  const sheet = pics.photoDrafts(appId, { groupId: "grp_my_words", drafts });
  assert.equal(sheet.title, "Add photos to My Words");
  assert.deepEqual(sheet.rows.map((r) => r.tag), ["", "needs a name", ""]);
  assert.equal(sheet.saveLabel, "Save 2");
  assert.equal(pics.photoDrafts(appId, { drafts: [{ key: keys[0], name: "" }] }).saveDisabled, true);

  const mark = maxSeq();
  const res = pics.photosSave(appId, { groupId: "grp_my_words", drafts });
  assert.equal(res.toast.text, "Added 2 photos");
  const rows = q("SELECT spoken_name AS n, photo_key AS k FROM personal_entity WHERE spoken_name IN ('Grandpa','the dog park') ORDER BY spoken_name");
  assert.deepEqual(rows.map((r) => [r.n, r.k]), [["Grandpa", keys[0]], ["the dog park", keys[2]]]);
  assert.equal(q("SELECT count(*) AS n FROM group_membership WHERE group_id='grp_my_words' AND item_kind='entity' AND item_id IN (SELECT id FROM personal_entity WHERE spoken_name IN ('Grandpa','the dog park'))")[0].n, 2);
  const created = opsSince(mark).filter(([k]) => k === "create_entity");
  assert.equal(created.length, 2);
  assert.deepEqual(created.map(([, a]) => a.photoKey).sort(), [keys[0], keys[2]].sort());
  assert.throws(() => pics.photosSave(appId, { drafts: [{ key: "blob:xyz", name: "bad" }] }));
  appSessionLicensed(false);
});

/* ---------------- voices for the new words (028 § 5.3) ---------------- */

// Earlier tests' pastes mint in the background too: look only at this test's words.
let mine = [];
const tileCalls = () => worker.of("/api/v1/voice/tile").filter((r) => mine.includes(r.body.text));
const progressToasts = () => events.filter((e) => e.toast).map((e) => e.toast);
const fresh = async (words) => {
  await sleep(300);   // let a previous test's mints finish
  worker.reset(); events.length = 0; worker.log.length = 0; caches.clear();
  mine = words;
};

test("a paste voices its new words one at a time: the web's mint body, its progress toast, hits are free", async () => {
  await fresh(["Quokka", "numbat"]);
  appSessionLicensed(true);
  const text = ["want", "Quokka", "numbat", "quokka"].join("\n");
  pics.bulkState(appId, { groupId: "grp_my_words", text });
  await until(() => worker.of("/api/v1/pictures/find-batch").length === 1, "found");
  pics.bulkAdd(appId, { groupId: "grp_my_words", text });
  await until(() => tileCalls().length === 2, "two mints (the catalog word and the repeat cost none)");
  assert.deepEqual(tileCalls().map((r) => r.body.text), ["Quokka", "numbat"]);
  const b = tileCalls()[0].body;
  assert.deepEqual(Object.keys(b).sort(), ["license", "locale", "source", "text", "user_id", "voice"]);
  assert.equal(b.user_id, USER);
  assert.equal(b.license, LICENSE);
  assert.equal(b.locale, "en");
  assert.equal(b.source, "user_typed");
  await until(() => progressToasts().length === 2, "a toast per word");
  assert.deepEqual(progressToasts().filter((t) => t.endsWith(" of 2")),
    ["Making Pip's voice, 1 of 2", "Making Pip's voice, 2 of 2"]);
  // The clips are in the voice cache now: pasting them again (renamed away
  // and back) would not ask the Worker again - a prefetch of a cached word is free.
  assert.equal([...caches.get("pip-tile-voice").keys()].length, 2, "both clips are cached");
  await quiet();
  appSessionLicensed(false);
});

test("a spent mint budget pauses the run (the web stops at the first budget answer)", async () => {
  await fresh(["marmot", "lemur", "gecko"]);
  worker.tileStatus = 503;
  appSessionLicensed(true);
  const text = ["marmot", "lemur", "gecko"].join("\n");
  pics.bulkState(appId, { groupId: "grp_my_words", text });
  await until(() => worker.of("/api/v1/pictures/find-batch").length === 1, "found");
  pics.bulkAdd(appId, { groupId: "grp_my_words", text });
  await until(() => tileCalls().length >= 1, "the first mint is tried");
  await quiet();
  assert.equal(tileCalls().length, 1, "no second request after a budget answer");
  assert.deepEqual(progressToasts(), ["Making Pip's voice, 1 of 3"]);
  worker.tileStatus = 200;
  appSessionLicensed(false);
});

test("photos voice only the named ones", async () => {
  await fresh(["Auntie Bea"]);
  appSessionLicensed(true);
  const keys = ["a", "b"].map((n) => {
    const bytes = Buffer.from(`voiced photo ${n}`);
    blobs.set(sha(bytes), bytes.toString("base64url"));
    return `blob:${sha(bytes)}`;
  });
  pics.photosSave(appId, { groupId: "grp_my_words", drafts: [
    { key: keys[0], name: "Auntie Bea" }, { key: keys[1], name: "" }] });
  await until(() => tileCalls().length === 1, "one mint");
  assert.equal(tileCalls()[0].body.text, "Auntie Bea");
  await until(() => progressToasts().length === 1, "its toast");
  assert.deepEqual(progressToasts(), ["Making Pip's voice, 1 of 1"]);
  appSessionLicensed(false);
});
