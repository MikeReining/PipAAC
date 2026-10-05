import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createDatabase } from "./catalog.mjs";
import { installDom, findAll } from "./fake_dom.mjs";
import { mountGroupIconPicker } from "../../public/board/group-icon-picker.js";
import { groupGlyph, groupIconName, iconUrl } from "../../public/board/group-glyph.js";
import {
  createGroup, createEntity, placeItem, removeItem, moveItem, setEntityPhoto,
  setGroupGlyph, deleteGroupUndoable,
} from "../../public/shared/groups.mjs";
import { applyOp, listOps } from "../../public/shared/ops.mjs";

const root = join(import.meta.dirname, "../..");
const library = JSON.parse(readFileSync(join(root, "public/group-icons/library.json"), "utf8"));
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); };
const row = (db, id = "grp_swim") => db.prepare("SELECT * FROM board_group WHERE id = ?").get(id);
const allNodes = (pred) => findAll(document.body, pred);
const byClass = (cls) => allNodes((n) => n.classList.contains(cls))[0];
const namedButton = (label) => allNodes((n) => n.tagName === "BUTTON" && n.textContent === label)[0];
const choice = (name) => allNodes((n) => n.dataset.icon === name)[0];
const images = (node) => findAll(node, (n) => n.tagName === "IMG");

function dbAt(path = ":memory:") {
  const db = createDatabase(path);
  db.exec(`INSERT OR IGNORE INTO layout_shape (layout, cols, rows, frame)
    VALUES ('grid60', 10, 6, '[9,19,39,49]')`);
  return db;
}

function harness({ fetchLibrary = async () => ({ ok: true, json: async () => library }) } = {}) {
  installDom();
  const create = document.createElement;
  let focused = 0;
  document.createElement = (tag) => {
    const node = create(tag);
    if (tag === "dialog") {
      node.showModal = () => { node.open = true; };
      node.close = () => { node.open = false; };
    }
    return node;
  };
  const db = dbAt();
  createGroup(db, { id: "grp_swim", name: "Swimming" });
  createGroup(db, { id: "grp_other", name: "Other" });
  const toasts = [];
  const requests = [];
  const picker = mountGroupIconPicker({ db, locale: "en", loadPhotoURL: async (key) => `local:${key}`,
    changed() {}, toast: (text, undo) => toasts.push({ text, undo }),
    returnFocus: () => ({ focus: () => { focused++; } }),
    fetchLibrary: (...args) => { requests.push(args); return fetchLibrary(...args); },
  });
  return { db, picker, requests, toasts, focused: () => focused };
}

test("open → search swim → Not used → choose: only that group's face changes, persists and undoes", async () => {
  const h = harness();
  assert.equal(h.requests.length, 0, "the board never downloads the extra library on mount");
  setGroupGlyph(h.db, "grp_swim", "icon:vehicles");
  setGroupGlyph(h.db, "grp_other", "icon:home");
  h.picker.open(row(h.db));
  assert.ok(byClass("group-icon-picker").open);
  assert.equal(choice("vehicles").getAttribute("aria-pressed"), "true");
  await flush();
  assert.deepEqual(h.requests.map(([url]) => url), ["/group-icons/library.json"]);
  const search = byClass("gip-search");
  search.value = "swim";
  await search.fire("input");
  await namedButton("Not used").click();
  const swimming = choice("extra_waves_ladder");
  assert.ok(swimming, "a curated unused Swimming icon is discoverable by swim");
  await swimming.click();
  assert.equal(row(h.db).glyph, "icon:extra_waves_ladder");
  assert.equal(row(h.db, "grp_other").glyph, "icon:home", "the second group is untouched");
  assert.equal(byClass("group-icon-picker"), undefined, "selection closes the sheet");
  assert.equal(h.focused(), 1);
  assert.equal(images(groupGlyph(row(h.db), { db: h.db, locale: "en" }))[0].src,
    "/group-icons/extra_waves_ladder.svg");
  const replica = dbAt();
  for (const op of listOps(h.db)) applyOp(replica, op);
  assert.equal(row(replica).glyph, "icon:extra_waves_ladder", "sync replay preserves the same asset ID");
  h.toasts.at(-1).undo();
  assert.equal(row(h.db).glyph, "icon:vehicles");
  h.picker.open(row(h.db));
  await flush();
  assert.equal(h.requests.length, 1, "a downloaded library is reused for this editing session");
  await namedButton("Use default").click();
  assert.equal(row(h.db).glyph, null);
  h.toasts.at(-1).undo();
  assert.equal(row(h.db).glyph, "icon:vehicles");
  replica.close(); h.db.close();
});

test("used means resolved defaults plus hidden groups; reusing stays explicit and changes one group", async () => {
  const h = harness();
  h.db.exec(`INSERT INTO board_group (id, kind, name, index_slot, hidden)
    VALUES ('grp_treats', 'builtin', 'Treats', 20, 1)`);
  h.picker.open(row(h.db));
  const candy = choice("treats");
  assert.match(candy.getAttribute("aria-label"), /used by Treats \(hidden\)/);
  await namedButton("Not used").click();
  assert.equal(choice("treats"), undefined);
  await namedButton("All icons").click();
  await choice("treats").click();
  assert.equal(row(h.db).glyph, "icon:treats");
  assert.equal(row(h.db, "grp_treats").glyph, null, "default owner is never swapped");
  assert.equal(groupIconName(row(h.db, "grp_treats")), "treats");
  h.db.close();
});

test("category and empty search states do not lose the current icon or prevent close", async () => {
  const h = harness();
  h.picker.open(row(h.db));
  await flush();
  byClass("gip-category").value = "Travel";
  await byClass("gip-category").fire("change");
  assert.ok(choice("extra_bus"));
  assert.equal(choice("extra_cake"), undefined);
  byClass("gip-search").value = "nothing-matches-this";
  await byClass("gip-search").fire("input");
  assert.match(byClass("gip-empty").textContent, /No icons found/);
  await namedButton("Close").click();
  assert.equal(row(h.db).glyph, null);
  assert.equal(h.focused(), 1);
  h.db.close();
});

test("failed library request leaves existing icons usable and offers a successful retry", async () => {
  let attempt = 0;
  const h = harness({ fetchLibrary: async () => {
    if (++attempt === 1) throw new Error("offline");
    return { ok: true, json: async () => library };
  } });
  h.picker.open(row(h.db));
  await flush();
  assert.match(byClass("gip-status").children[0].textContent, /internet connection/);
  assert.ok(choice("home"));
  await namedButton("Try again").click();
  assert.ok(choice("extra_waves_ladder"));
  h.picker.close(); h.db.close();
});

test("cancel ignores a late download and restores focus without writing", async () => {
  let finish;
  const h = harness({ fetchLibrary: () => new Promise((r) => { finish = r; }) });
  h.picker.open(row(h.db));
  const count = listOps(h.db).length;
  await byClass("group-icon-picker").fire("cancel");
  assert.equal(h.requests[0][1].signal.aborted, true);
  finish({ ok: true, json: async () => library });
  await flush();
  assert.equal(byClass("group-icon-picker"), undefined);
  assert.equal(listOps(h.db).length, count);
  assert.equal(h.focused(), 1);
  h.db.close();
});

test("a late icon download never replaces the group-picture view", async () => {
  let finish;
  const h = harness({ fetchLibrary: () => new Promise((r) => { finish = r; }) });
  h.picker.open(row(h.db));
  await namedButton("Group pictures").click();
  finish({ ok: true, json: async () => library });
  await flush();
  assert.ok(byClass("gip-pictures"));
  assert.equal(byClass("gip-filters").hidden, true);
  await namedButton("Icons").click();
  assert.ok(choice("extra_waves_ladder"));
  h.picker.close(); h.db.close();
});

test("a chosen picture survives source-word edits, removal, group delete/Undo, and sync replay", async () => {
  const h = harness();
  const key = `blob:${"a".repeat(64)}`;
  const word = createEntity(h.db, { name: "Pool", photoKey: key }).id;
  placeItem(h.db, "grp_swim", "entity", word, { page: 1, slot_index: 22 });
  h.picker.open(row(h.db));
  await namedButton("Group pictures").click();
  const picture = allNodes((n) => n.dataset.picture === key)[0];
  assert.ok(picture, "pictures are available from later pages too");
  await picture.click();
  moveItem(h.db, "grp_swim", "entity", word, 1, 23);
  setEntityPhoto(h.db, word, `blob:${"b".repeat(64)}`);
  removeItem(h.db, "grp_swim", "entity", word);
  assert.equal(row(h.db).glyph, `picture:${key}`);
  assert.equal(groupIconName(row(h.db)), null);
  const deletion = deleteGroupUndoable(h.db, "grp_swim");
  deletion.undo();
  assert.equal(row(h.db).glyph, `picture:${key}`, "delete/Undo retains a pinned picture");
  const replica = dbAt();
  for (const op of listOps(h.db)) applyOp(replica, op);
  assert.equal(row(replica).glyph, `picture:${key}`);
  const face = groupGlyph(row(replica), { db: replica, locale: "en", loadPhotoURL: async (k) => `pulled:${k}` });
  await flush();
  assert.equal(images(face)[0].src, `pulled:${key}`, "the face resolves the saved bytes, not its former word");
  replica.close(); h.db.close();
});

test("pictures are restricted at the write boundary and unsafe paths are refused", () => {
  const h = harness();
  h.db.exec(`INSERT INTO board_group (id, kind, name, index_slot) VALUES ('grp_treats', 'builtin', 'Treats', 20)`);
  for (const bad of ["picture:../secret.png", "picture:https://example.com/photo.png", "picture:blob:bad",
    "picture:symbols/../../secret.png", "picture:/api/v1/pictures/img/x?token=secret"]) {
    assert.throws(() => setGroupGlyph(h.db, "grp_swim", bad), /bad glyph/);
  }
  assert.throws(() => setGroupGlyph(h.db, "grp_treats", "picture:symbols/apple.webp"), /custom groups/);
  setGroupGlyph(h.db, "grp_swim", "picture:symbols/apple.webp");
  assert.equal(images(groupGlyph(row(h.db), { db: h.db, locale: "en" }))[0].src, "/symbols/apple.webp");
  h.picker.open(row(h.db, "grp_treats"));
  assert.equal(namedButton("Group pictures"), undefined);
  h.picker.close(); h.db.close();
});

test("saved extended icon survives a database restart; unavailable assets have a legible fallback", async () => {
  installDom();
  const temp = mkdtempSync(join(tmpdir(), "pip-group-face-"));
  try {
    const file = join(temp, "profile.sqlite");
    const first = dbAt(file);
    createGroup(first, { id: "grp_swim", name: "Swimming" });
    setGroupGlyph(first, "grp_swim", "icon:extra_waves_ladder");
    first.close();
    const reopened = dbAt(file);
    const face = groupGlyph(row(reopened), { db: reopened, locale: "en" });
    assert.equal(images(face)[0].src, "/group-icons/extra_waves_ladder.svg");
    await images(face)[0].fire("error");
    assert.equal(face.textContent, "S");
    assert.equal(images(face).length, 0, "no broken image box");
    reopened.close();
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test("the 201-icon generated library matches its curated source and stays outside offline precache", () => {
  const built = spawnSync(process.execPath, ["scripts/group-icons/build.mjs", "--check"], { cwd: root, encoding: "utf8" });
  assert.equal(built.status, 0, built.stderr);
  const source = JSON.parse(readFileSync(join(root, "data/group-icons/curation.json"), "utf8"));
  assert.equal(source.base.length + library.icons.length, 201);
  const manifest = JSON.parse(readFileSync(join(root, "public/sw-manifest.json"), "utf8"));
  assert.equal(manifest.files.some((f) => f.path.startsWith("/group-icons/")), false);
  for (const icon of library.icons) {
    const svg = readFileSync(join(root, "public", iconUrl(icon.name)), "utf8").trim();
    assert.equal(svg, icon.svg, "the picker thumbnail and saved face are identical assets");
    assert.match(svg, /stroke="#2a241d"/);
  }
  for (const icon of source.base) assert.ok(manifest.files.some((f) => f.path === iconUrl(icon.name)));
});
