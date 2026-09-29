/**
 * Web editor. On a wide screen this is the landing view: library on the
 * left, the group's real grid in the middle, the word card on the right.
 * Writes go through the same owners as the board, so each edit syncs.
 */
import { applyPasteRows, nameFromFile, resolvePasteRows } from "../shared/bulk.mjs";
import {
  createEntity, groupDisplayName, groupIndex, pageCount, placeItem,
} from "../shared/groups.mjs";

const $ = (id) => document.getElementById(id);

export function mountEditor({
  db, locale, all, catalog,
  openAddForm, paintGroupPage,
  renderLibrary, invalidateIndex, setView, toast, close,
  savePhoto, syncUploadBlob,
  tile,
}) {
  /* --- the web editor (Sync_And_Web_Editing § 7): on a wide screen the
     app opens here — Library left, the real 10×6 group grid in the middle
     (the same cells and slots the child sees), the word card docked right.
     Gestures are always on in the editor: it is the adult's surface.
     Every write goes through the shared owners, so each edit is an op and
     reaches a linked iPad on the next sync tick. --- */
  let edGroup = null; // board_group id shown in the editor grid
  let edPage = 0;

  function edTarget() {
    return edGroup ?? "grp_my_words";
  }
  function edGroupName(id) {
    const row = all(db, "SELECT * FROM board_group WHERE id = ?", [id])[0];
    return row ? groupDisplayName(db, row, locale) : "";
  }

  function renderEditorGroups() {
    const box = $("ed-groups");
    box.innerHTML = "";
    for (const g of groupIndex(db)) {
      const chip = document.createElement("button");
      chip.className = "wchip" + (g.id === edTarget() ? " on" : "");
      chip.textContent = groupDisplayName(db, g, locale);
      chip.addEventListener("click", () => {
        edGroup = g.id; edPage = 0;
        renderEditorGroups();
        renderEditorGrid();
        renderPastePreview();
      });
      box.appendChild(chip);
    }
  }

  /** The real page at the profile's board size, painted by the board's
   *  own group painter (groups-ui.js) — reserved cells, Next and all — with
   *  gestures always on: the editor is the adult's surface. */
  async function renderEditorGrid() {
    const gid = edTarget();
    await paintGroupPage($("ed-grid"), {
      group: gid,
      page: edPage,
      gestures: true,
      onChange: renderEditorGrid,
      onNext: () => {
        edPage = (edPage + 1) % pageCount(db, gid);
        renderEditorGrid();
      },
    });
  }
  $("ed-add").addEventListener("click", () => openAddForm(edTarget()));

  /** Bulk paste (Word_Library § 5.4): preview each row's resolution, then
   *  Add all files them into the group open in the editor grid. */
  let edPasteRows = [];
  function renderPastePreview() {
    const text = $("ed-paste").value;
    edPasteRows = resolvePasteRows(db, text, { groupId: edTarget(), locale });
    const box = $("ed-paste-preview");
    box.innerHTML = "";
    for (const r of edPasteRows) {
      const row = document.createElement("div");
      row.className = "ed-prow" + (r.already ? " over" : "");
      const tag = document.createElement("span");
      tag.className = "tag" + (r.kind === "new" ? " new" : r.already ? " already" : "");
      tag.textContent = r.already ? "already" : r.kind === "new" ? "new — needs a picture" : r.kind;
      const lb = document.createElement("span");
      lb.textContent = r.label;
      row.append(tag, lb);
      box.appendChild(row);
    }
    const add = $("ed-paste-add");
    const pending = edPasteRows.filter((r) => !r.already).length;
    add.disabled = pending === 0;
    add.textContent = pending ? `Add ${pending} to ${edGroupName(edTarget())}` : "Add all";
  }
  $("ed-paste").addEventListener("input", renderPastePreview);
  $("ed-paste-add").addEventListener("click", () => {
    const gid = edTarget();
    const newTexts = edPasteRows.filter((r) => r.kind === "new" && !r.already)
      .map((r) => r.text);
    const res = applyPasteRows(db, edPasteRows, {
      groupId: gid,
      category: catalog.groups.find((g) => g.id === gid)?.category ?? null,
    });
    // 028 § 5.3: the new words mint in the background, one at a time.
    if (newTexts.length) tile?.prefetch(newTexts).catch(() => {});
    $("ed-paste").value = "";
    renderPastePreview();
    renderEditorGrid();
    renderLibrary();
    invalidateIndex(); // new entities join the completion index
    toast(
      `Added ${res.placed} to ${edGroupName(gid)}` +
        (res.skipped ? ` (${res.skipped} already there)` : ""),
    );
  });

  /** Drop photos: one draft word per file, named from the file, into the
   *  open group. The bytes go through savePhoto → blob:<sha> and upload
   *  behind their op like any other photo. */
  async function dropPhotos(files) {
    const gid = edTarget();
    const category = catalog.groups.find((g) => g.id === gid)?.category ?? null;
    let n = 0;
    for (const f of files) {
      if (!f.type.startsWith("image/")) continue;
      const name = nameFromFile(f.name);
      if (!name) continue;
      const photo = await savePhoto(f);
      if (photo) syncUploadBlob(photo.bytes).catch(() => {});
      const { id } = createEntity(db, { name, photoKey: photo?.key ?? null, category });
      placeItem(db, gid, "entity", id);
      tile?.ensure(name, { source: "user_typed" }).catch(() => {}); // 028 — mint the name's clip
      n++;
    }
    if (n) {
      renderEditorGrid();
      renderLibrary();
      toast(`Added ${n} photo${n === 1 ? "" : "s"} to ${edGroupName(gid)}`);
    }
  }
  $("editor").addEventListener("dragover", (e) => {
    if (![...e.dataTransfer.types].includes("Files")) return;
    e.preventDefault();
    document.body.classList.add("dragover");
  });
  $("editor").addEventListener("dragleave", (e) => {
    if (e.target === $("editor")) document.body.classList.remove("dragover");
  });
  $("editor").addEventListener("drop", (e) => {
    e.preventDefault();
    document.body.classList.remove("dragover");
    dropPhotos([...e.dataTransfer.files]).catch((err) =>
      console.warn("photo drop failed", err));
  });

  function renderEditor() {
    renderEditorGroups();
    renderEditorGrid();
    renderLibrary();
    renderPastePreview();
  }
  $("ed-board").addEventListener("click", () => setView("board"));
  $("menu-editor").addEventListener("click", () => {
    close("menu");
    setView("editor");
  });

  return { renderEditor };
}
