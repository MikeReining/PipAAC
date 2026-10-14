/**
 * 044 D3 — the voice picker facade. Assertions read the DATABASE through a
 * second connection and compare clip keys against the web's own
 * sw-audio.json manifest (an instrument the facade cannot influence).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import vm from "node:vm";

const root = new URL("../../", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "pip-voice-"));
const file = join(dir, "user.sqlite");
copyFileSync(join(root, "public/fresh_db.sqlite"), file);
const writer = new DatabaseSync(file);
const reader = new DatabaseSync(file);
const bindable = (v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v);
const host = {
  dbExec: (_id, sql) => { writer.exec(sql); return null; },
  dbRun: (_id, sql, p = []) => ({ changes: Number(writer.prepare(sql).run(...p.map(bindable)).changes) }),
  dbAll: (_id, sql, p = []) => {
    const rows = writer.prepare(sql).all(...p.map(bindable));
    const columns = rows.length ? Object.keys(rows[0]) : [];
    return { columns, rows: rows.map((r) => columns.map((c) =>
      r[c] instanceof Uint8Array ? { __pipBytes: [...r[c]] } : r[c])) };
  },
};
// The BUILT core (what ships in the app), in a bare vm realm.
const ctx = vm.createContext({ __pipHost: host, crypto: globalThis.crypto });
vm.runInContext(readFileSync(join(root, "apps/PipAAC/PipAAC/Core/pip-core.js"), "utf8"), ctx);
const j = (v) => JSON.parse(JSON.stringify(v));
const P = ctx.PIPCORE;
const app = new Proxy({}, { get: (_, k) => (...a) => j(P.app[k](...a)) });
const voicepick = new Proxy({}, { get: (_, k) => (...a) => j(P.voicepick[k](...a)) });
const { appId } = app.appOpen(1, readFileSync(join(root, "public/catalog.json"), "utf8"), null, null);
const manifest = JSON.parse(readFileSync(join(root, "public/sw-audio.json"), "utf8")).voices;
const inPack = (voice, key) => manifest[voice].files.includes(`/${key}`);

test("the picker lists the web's voices with the web's words", () => {
  const m = voicepick.voiceModel(appId);
  assert.equal(m.current, "voi_default_en");
  assert.deepEqual(m.choices.find((c) => c.isDefault), {
    id: "voi_default_en", name: "Pip", note: "Pip's own voice", isDefault: true });
  for (const [id, note] of [["voi_eve_en", "Younger, female"], ["voi_leo_en", "Grown-up, male"],
    ["voi_sam_en", "Younger, male"]]) {
    assert.equal(m.choices.find((c) => c.id === id)?.note, note);
  }
});

test("the sample resolves to clips that live in that voice's pack", () => {
  for (const voice of ["voi_default_en", "voi_eve_en", "voi_leo_en", "voi_sam_en"]) {
    const slots = voicepick.voiceSample(appId, voice);
    assert.equal(slots.length, 3);
    for (const s of slots) {
      assert.equal(s.type, "clip");
      assert.ok(inPack(voice, s.key), `${voice} ${s.key} is in its manifest`);
    }
  }
});

test("choosing a voice is the synced setting; the next tap speaks from that pack", () => {
  const before = reader.prepare("SELECT COALESCE(MAX(seq),0) m FROM sync_op").get().m;
  app.appSetSetting(appId, "preferred_voice_id", "voi_eve_en");
  assert.equal(reader.prepare("SELECT preferred_voice_id v FROM learner_profile").get().v, "voi_eve_en");
  const ops = reader.prepare("SELECT kind, args FROM sync_op WHERE seq > ?").all(before);
  assert.ok(ops.some((o) => o.args.includes("voi_eve_en")), "an op recorded the change");
  const tap = app.appTap(appId, { kind: "sense", id: "sns_0013", text: "want" });
  assert.equal(tap.speech.type, "clip");
  assert.ok(inPack("voi_eve_en", tap.speech.key));
  assert.equal(voicepick.voiceModel(appId).current, "voi_eve_en");
});
