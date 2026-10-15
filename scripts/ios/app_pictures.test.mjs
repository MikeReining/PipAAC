/**
 * 044 E6 - pictures on the word card: find by meaning (PP-1), pick or reject
 * (PP-2), Draw it for me (PP-3), the gate copy. Instruments: the fake
 * Worker's request log (what the iPad SENT), the database through a second
 * connection (what was WRITTEN, sync_op), the blob table, and the "pic" host
 * events (what Swift would draw). See app_pictures.fakes.mjs.
 *
 * Run: scripts/test.sh scripts/ios/app_pictures.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LICENSE, P, USER, appId, blobBytes, blobs, cand, dbh, events, findResult, keystore, lastRow,
  maxSeq, newWord, opsSince, photoOf, pics, png, q, quiet, sha, sleep, until, worker, appSessionLicensed,
} from "./app_pictures.fakes.mjs";

test("find by meaning: the web's request, candidates fetched to disk and shown", async () => {
  worker.reset(); events.length = 0;
  const id = newWord("zebra");
  worker.finds.set("zebra", findResult({ auto: null, scope: "personal", candidates: [cand("img_a"), cand("img_b")] }));
  pics.cardOpen(appId, { kind: "entity", id });
  await until(() => lastRow("entity", id)?.choices.length >= 2, "the finder's alternatives show");
  const f = worker.of("/api/v1/pictures/find")[0];
  assert.deepEqual(f.body, { user_id: USER, license: LICENSE, text: "zebra", description: null, locale: "en" });
  // No auto picture: a personal word (scope personal) offers choices, draws nothing.
  assert.equal(worker.of("/api/v1/pictures/draw").length, 0);
  const row = lastRow("entity", id);
  assert.equal(row.line, "Add a photo of zebra, or use one of ours.");
  assert.equal(row.photoLead, true);
  // The thumbnails are real bytes on disk, named by their hash.
  await until(() => lastRow("entity", id).choices.every((c) => c.photoKey), "thumbnails landed");
  for (const c of lastRow("entity", id).choices) {
    const bytes = blobBytes(c.photoKey);
    assert.equal(`blob:${sha(bytes)}`, c.photoKey);
    assert.ok(bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])));
  }
});

test("find in the field, then pick: bytes saved, the override written through the shared owner, one pick signal", async () => {
  worker.reset(); events.length = 0;
  const senseId = "sns_0013"; // want
  worker.finds.set("wanting", findResult({ candidates: [cand("ext_wanting1"), cand("ext_wanting2", 1)] }));
  pics.find(appId, { kind: "sense", id: senseId, q: "  wanting  " });
  await until(() => lastRow("sense", senseId)?.results?.choices.length === 2, "results show");
  const f = worker.of("/api/v1/pictures/find")[0];
  assert.equal(f.body.text, "wanting", "whitespace collapsed like the web");
  assert.equal(f.body.license, LICENSE);
  const r = lastRow("sense", senseId).results;
  assert.equal(r.drawLabel, "Draw “wanting”");

  const mark = maxSeq();
  const choice = r.choices[0].id;
  pics.pick(appId, { kind: "sense", id: senseId, choice });
  await until(() => q("SELECT photo_key FROM image_override WHERE sense_id=? AND status='ready'", senseId).length === 1,
    "the override is written");
  const key = q("SELECT photo_key FROM image_override WHERE sense_id=? AND status='ready'", senseId)[0].photo_key;
  assert.equal(`blob:${sha(blobBytes(key))}`, key, "the stored bytes hash to the key");
  assert.deepEqual(blobBytes(key), png("ext_wanting1.png"), "the candidate's bytes, fetched through the Worker");
  assert.deepEqual(opsSince(mark).map((o) => o[0]), ["set_image_override"]);
  // The signal: one pick with the image id, anonymous text.
  await until(() => worker.of("/api/v1/pictures/pick").length === 1, "pick signal");
  const pk = worker.of("/api/v1/pictures/pick")[0].body;
  assert.equal(pk.image_id, "ext_wanting1");
  assert.equal(pk.text, "want");
  // The board's tile wears it.
  await until(() => events.some((e) => e.paint), "a repaint");
  const cell = [...events].reverse().find((e) => e.paint).paint.board.cells.find((c) => c.id === senseId);
  assert.equal(cell.art, key);
  // The card closes the Find and offers the pick as the one in use.
  const row = lastRow("sense", senseId);
  assert.equal(row.results, null);
  assert.ok(row.choices.some((c) => c.selected && c.photoKey === key));
  // Back to ours retires the override (the web's pick of the default picture).
  const ours = row.choices.find((c) => c.art && !c.selected) ?? null;
  if (ours) {
    pics.pick(appId, { kind: "sense", id: senseId, choice: ours.id });
    await until(() => q("SELECT count(*) AS n FROM image_override WHERE sense_id=? AND status='ready'", senseId)[0].n < 2,
      "settled");
  }
});

test("a personal word: the close picture is applied free; replacing OUR choice sends exactly one reject", async () => {
  worker.reset(); events.length = 0;
  const id = newWord("apple");
  worker.finds.set("apple", findResult({ auto: "img_a", scope: "common",
    candidates: [cand("img_a"), cand("img_b", 1), cand("img_c", 2)] }));
  const mark = maxSeq();
  pics.cardOpen(appId, { kind: "entity", id });
  await until(() => photoOf(id), "the close picture is applied");
  assert.equal(worker.of("/api/v1/pictures/draw").length, 0, "applying a close picture is free");
  assert.deepEqual(blobBytes(photoOf(id)), png("img_a.png"));
  assert.ok(opsSince(mark).some(([k, a]) => k === "set_entity_photo" && a.photoKey === photoOf(id)));
  await until(() => lastRow("entity", id)?.choices.length === 3, "alternatives offered");
  assert.equal(worker.of("/api/v1/pictures/reject").length, 0);

  const alt = lastRow("entity", id).choices.find((c) => !c.selected);
  pics.pick(appId, { kind: "entity", id, choice: alt.id });
  await until(() => worker.of("/api/v1/pictures/reject").length === 1, "the reject signal");
  const rj = worker.of("/api/v1/pictures/reject")[0].body;
  assert.equal(rj.ours, "img_a");
  assert.equal(rj.action, "pick");
  assert.equal(rj.theirs, alt.id);
  assert.equal(rj.text, "apple");
  assert.equal(worker.of("/api/v1/pictures/pick")[0].body.image_id, alt.id);
  assert.deepEqual(blobBytes(photoOf(id)), png(`${alt.id}.png`));

  // Choosing again does not reject again: only the picture WE chose counts, once.
  const back = lastRow("entity", id).choices.find((c) => !c.selected);
  pics.pick(appId, { kind: "entity", id, choice: back.id });
  await until(() => worker.of("/api/v1/pictures/pick").length === 2, "second pick");
  await sleep(50);
  assert.equal(worker.of("/api/v1/pictures/reject").length, 1);
});

test("a photo replacing our choice records a reject with no 'theirs'; a drawing records its own", async () => {
  worker.reset(); events.length = 0;
  const id = newWord("banana");
  worker.finds.set("banana", findResult({ auto: "img_a" }));
  pics.cardOpen(appId, { kind: "entity", id });
  await until(() => photoOf(id), "applied");
  await until(() => lastRow("entity", id)?.choices.length >= 1, "row");
  const key = `blob:${sha(Buffer.from("the family photo"))}`;
  blobs.set(sha(Buffer.from("the family photo")), Buffer.from("the family photo").toString("base64url"));
  P.media.cardSetPhoto(appId, { kind: "entity", id, key }); // E3's door
  await until(() => worker.of("/api/v1/pictures/reject").length === 1, "reject for the photo");
  const rj = worker.of("/api/v1/pictures/reject")[0].body;
  assert.equal(rj.action, "photo");
  assert.equal("theirs" in rj, false, "a photo is never sent");
  assert.equal(photoOf(id), key);
});

test("Draw it for me: the allowance falls, the line says so, and 'out of drawings' is the web's copy", async () => {
  worker.reset(); events.length = 0; worker.drawN = 0;
  worker.left = 2;
  const id = q("SELECT sense_id AS s FROM label WHERE text='more' AND kind='lemma' AND status='approved' AND locale='en'")[0].s;
  pics.find(appId, { kind: "sense", id, q: "wanting" });
  await until(() => lastRow("sense", id)?.results, "results");
  await until(() => lastRow("sense", id)?.drawcost === "A drawing uses 1 of your 2 left.", "allowance read");
  assert.equal(worker.of("/api/v1/pictures/allowance")[0].headers["x-pip-license"], LICENSE);

  const mark = maxSeq();
  const during = pics.draw(appId, { kind: "sense", id, desc: "wanting" });
  assert.equal(during.drawing, true);
  assert.equal(during.line, "Drawing…");
  await until(() => lastRow("sense", id)?.line === "Drawn for you · 1 drawing left", "first drawing lands");
  const body = worker.of("/api/v1/pictures/draw")[0].body;
  assert.deepEqual(body, { user_id: USER, license: LICENSE, text: "more", description: "wanting", locale: "en" });
  assert.equal(worker.of("/api/v1/pictures/draw")[0].headers.accept, "text/event-stream");
  assert.deepEqual(opsSince(mark).map((o) => o[0]), ["set_image_override"]);
  const key = q("SELECT photo_key FROM image_override WHERE sense_id=? AND status='ready'", id)[0].photo_key;
  assert.ok(blobBytes(key).includes(Buffer.from("drawn-")), "the drawn bytes are what was stored");

  pics.find(appId, { kind: "sense", id, q: "wanting" });
  await until(() => lastRow("sense", id)?.results?.drawLabel, "results again");
  pics.draw(appId, { kind: "sense", id, desc: "wanting" });
  await until(() => lastRow("sense", id)?.line === "Drawn for you · 0 drawings left", "second drawing");

  // The Worker now says no more drawings.
  worker.drawStatus = 402;
  pics.find(appId, { kind: "sense", id, q: "wanting" });
  await until(() => lastRow("sense", id)?.results?.drawLabel, "results 3");
  assert.equal(lastRow("sense", id).drawcost, "No drawings left.");
  assert.equal(lastRow("sense", id).results.drawDisabled, true, "left is 0: the Draw tile is off");
  pics.draw(appId, { kind: "sense", id, desc: "wanting" });
  await until(() => lastRow("sense", id)?.line === "No drawings left. Add a photo, or pick one of ours.", "out of drawings");
});

test("Draw it on a personal word saves the words as its hint and sets the photo", async () => {
  worker.reset(); events.length = 0;
  const id = newWord("quokka");
  worker.finds.set("quokka", findResult({ scope: "common", calibrated: false, candidates: [] }));
  pics.cardOpen(appId, { kind: "entity", id });
  await until(() => lastRow("entity", id)?.drawIt === true, "the Draw it tile");
  pics.draw(appId, { kind: "entity", id, desc: "a ripe quokka" });
  await until(() => photoOf(id), "drawn photo applied");
  assert.equal(q("SELECT hint FROM personal_entity WHERE id=?", id)[0].hint, "a ripe quokka");
  assert.equal(worker.of("/api/v1/pictures/draw")[0].body.description, "a ripe quokka");
  assert.ok(q("SELECT 1 FROM sync_op WHERE kind='set_entity_photo' AND args LIKE ?", `%${photoOf(id)}%`).length);
});

test("not entitled: the Worker's 403 shows the web's gate copy, and with no license nothing is sent", async () => {
  worker.reset(); events.length = 0;
  worker.entitled = false;
  const id = newWord("grape");
  pics.cardOpen(appId, { kind: "entity", id });
  await until(() => lastRow("entity", id)?.line === "Couldn't make a picture. Try again, or add a photo.",
    "denied copy");
  assert.equal(photoOf(id), null);
  assert.equal(worker.of("/api/v1/pictures/draw").length, 0);

  // No license stored (a free board that started its trial): the request still
  // goes, with no license, and the free five apply - results, not a gate.
  worker.entitled = true;
  const had = keystore.get(`user/${USER}/license`);
  keystore.delete(`user/${USER}/license`);
  events.length = 0;
  const id2 = newWord("lemon");
  pics.cardOpen(appId, { kind: "entity", id: id2 });
  await until(() => photoOf(id2), "a free board gets its close picture");
  const f = worker.of("/api/v1/pictures/find").at(-1);
  assert.equal(f.body.license ?? null, null, "no license is sent, none is invented");
  assert.equal(f.body.user_id, USER);

  // No trial started: still refused, with the web's gate copy.
  worker.trial = false;
  const id3 = newWord("plumcake");
  pics.cardOpen(appId, { kind: "entity", id: id3 });
  await until(() => lastRow("entity", id3)?.line === "Couldn't make a picture. Try again, or add a photo.", "denied copy");
  worker.trial = true;
  keystore.set(`user/${USER}/license`, had);
});
