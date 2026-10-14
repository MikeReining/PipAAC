/**
 * 044 E3 — the family-media facade (scripts/ios/app_media.mjs) leaves
 * exactly the expected rows in sync_op and the expected state in the tables.
 * Assertions read the DATABASE through a second connection, never the
 * facade's own return values (the code grading its own homework).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";

const root = new URL("../../", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "pip-media-"));
const file = join(dir, "user.sqlite");
copyFileSync(join(root, "public/fresh_db.sqlite"), file);

const writer = new DatabaseSync(file);
const reader = new DatabaseSync(file); // the instrument the facade cannot influence
const bindable = (v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v);
const host = {
  log: () => {},
  randomUUID: () => crypto.randomUUID(),
  randomBytes: (n) => [...crypto.getRandomValues(new Uint8Array(n))],
  dbExec: (_id, sql) => { writer.exec(sql); return null; },
  dbRun: (_id, sql, p = []) => ({ changes: Number(writer.prepare(sql).run(...p.map(bindable)).changes) }),
  dbAll: (_id, sql, p = []) => {
    const rows = writer.prepare(sql).all(...p.map(bindable));
    const columns = rows.length ? Object.keys(rows[0]) : [];
    return { columns, rows: rows.map((r) => columns.map((c) =>
      r[c] instanceof Uint8Array ? { __pipBytes: [...r[c]] } : r[c])) };
  },
};
// The BUILT bundle (what ships) in a bare vm realm, like sync_host.test.mjs.
const ctx = vm.createContext({ __pipHost: host });
vm.runInContext(readFileSync(join(root, "apps/PipAAC/PipAAC/Core/pip-core.js"), "utf8"), ctx);
const facade = (ns) => new Proxy({}, {
  get: (_, fn) => (...args) => {
    ctx.__a = JSON.stringify(args);
    const out = vm.runInContext(`JSON.stringify(PIPCORE.${ns}.${String(fn)}(...JSON.parse(__a)))`, ctx);
    return out === undefined ? undefined : JSON.parse(out);
  },
});
const app = facade("app");
const edit = facade("edit");

const catalog = readFileSync(join(root, "public/catalog.json"), "utf8");
const { appId } = app.appOpen(1, catalog, null, null);

const q = (sql, ...p) => reader.prepare(sql).all(...p);
const maxSeq = () => q("SELECT COALESCE(MAX(seq),0) AS m FROM sync_op")[0].m;
/** The pending ops recorded since `since`, as [kind, args]. */
const opsSince = (since) => q(
  "SELECT kind, args FROM sync_op WHERE seq > ? AND relay_seq IS NULL ORDER BY seq", since,
).map((r) => [r.kind, JSON.parse(r.args)]);

const media = facade("media");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const keyOf = (bytes) => `blob:${sha(bytes)}`;

test("a photo for a personal word: set_entity_photo, the card and tile show the key", () => {
  const id = edit.testSeedPerson(appId, { name: "Nana" }).id;
  const key = keyOf(Buffer.from("jpeg bytes of nana"));
  const mark = maxSeq();
  const p = media.cardSetPhoto(appId, { kind: "entity", id, key });
  assert.deepEqual(opsSince(mark), [["set_entity_photo", { id, photoKey: key }]]);
  assert.equal(q("SELECT photo_key FROM personal_entity WHERE id=?", id)[0].photo_key, key);
  assert.equal(p.card.photoKey, key);
  const tile = app.appBoard(appId).cells.find((c) => c.id === id);
  assert.equal(tile.photoKey, key, "the board tile is repainted with the new photo");
});

test("a photo for a catalog word: set_image_override, art follows; Use our picture retires it", () => {
  const senseId = "sns_0013";
  const before = app.appBoard(appId).cells.find((c) => c.id === senseId).art;
  const key = keyOf(Buffer.from("jpeg bytes of want"));
  const mark = maxSeq();
  const p = media.cardSetPhoto(appId, { kind: "sense", id: senseId, key });
  const ops = opsSince(mark);
  assert.deepEqual(ops.map((o) => o[0]), ["set_image_override"]);
  assert.equal(ops[0][1].photoKey, key);
  assert.equal(ops[0][1].senseId, senseId);
  assert.equal(q("SELECT photo_key FROM image_override WHERE sense_id=? AND status='ready'", senseId)[0].photo_key, key);
  assert.equal(p.card.art, key);
  assert.equal(p.card.media.canUseOurs, true);
  assert.equal(app.appBoard(appId).cells.find((c) => c.id === senseId).art, key);
  const back = media.cardUseOurPicture(appId, { id: senseId });
  assert.deepEqual(opsSince(mark).map((o) => o[0]), ["set_image_override", "clear_image_override"]);
  assert.equal(back.card.art, before);
  assert.equal(back.card.media.canUseOurs, false);
});

test("a malformed key is refused before any write", () => {
  const mark = maxSeq();
  assert.throws(() => media.cardSetPhoto(appId, { kind: "sense", id: "sns_0013", key: "blob:xyz" }));
  assert.throws(() => media.voiceSave(appId, { kind: "sense", id: "sns_0013", key: "audio/x.mp3" }));
  assert.equal(maxSeq(), mark);
});

test("a recording: set_override, tile speech resolves to the blob, base/mine/undo", () => {
  const id = "sns_0013";
  const text = q(`SELECT u.spoken_text AS t FROM label l JOIN utterance u ON u.id = l.utterance_id
    WHERE l.sense_id=? AND l.kind='lemma' AND l.status='approved' AND l.locale='en'`, id)[0].t;
  const key = keyOf(Buffer.from("m4a bytes of want"));
  const mark = maxSeq();
  const p = media.voiceSave(appId, { kind: "sense", id, key });
  const ops = opsSince(mark);
  assert.deepEqual(ops.map((o) => o[0]), ["set_override"]);
  assert.equal(ops[0][1].key, key);
  assert.equal(ops[0][1].recordedText, text);
  assert.equal(ops[0][1].itemKind, "utterance");
  assert.equal(q("SELECT key FROM clip_override WHERE status='ready' AND recorded_text=?", text)[0].key, key);
  assert.deepEqual(p.card.media.voice, { name: "Pip", text, hasRecording: true, mineOn: true });
  assert.equal(p.toast.text, `Your voice plays for “${text}”`);
  // the instrument the facade doesn't own: the tile's resolved clip
  const speech = edit.cardSpeech(appId, { kind: "sense", id, text }).speech;
  assert.equal(speech.type, "clip");
  assert.equal(speech.key, key);
  // back to the board voice keeps the recording offered
  const base = media.voiceChoose(appId, { kind: "sense", id, mine: false });
  assert.equal(base.card.media.voice.mineOn, false);
  assert.equal(base.card.media.voice.hasRecording, true);
  assert.notEqual(edit.cardSpeech(appId, { kind: "sense", id, text }).speech.key, key);
  const mine = media.voiceChoose(appId, { kind: "sense", id, mine: true });
  assert.equal(mine.card.media.voice.mineOn, true);
  assert.deepEqual(opsSince(mark).map((o) => o[0]), ["set_override", "clear_override", "set_override"]);
  // Undo on the first take's toast: no voice before it, so back to the board voice
  const undone = edit.editUndo(appId, { token: p.toast.undo });
  assert.equal(undone.card.media.voice.mineOn, false);
});

test("a recording for a personal word binds to the entity", () => {
  const id = q("SELECT id FROM personal_entity WHERE spoken_name='Nana'")[0].id;
  const key = keyOf(Buffer.from("m4a bytes of nana"));
  const mark = maxSeq();
  media.voiceSave(appId, { kind: "entity", id, key });
  assert.deepEqual(opsSince(mark).map((o) => [o[0], o[1].itemKind, o[1].key]),
    [["set_override", "entity", key]]);
  assert.equal(edit.cardSpeech(appId, { kind: "entity", id, text: "Nana" }).speech.key, key);
});

test("person photo: the synced setting, null removes", () => {
  const key = keyOf(Buffer.from("jpeg bytes of the child"));
  const mark = maxSeq();
  assert.equal(media.personPhotoSet(appId, { key }).photo, key);
  assert.equal(q("SELECT person_photo AS p FROM learner_profile WHERE id='prf_local'")[0].p, key);
  assert.equal(media.personPhotoSet(appId, { key: null }).photo, null);
  assert.equal(opsSince(mark).length, 2);
});

