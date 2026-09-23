/**
 * Add a word: one field, type → match → place. A catalog match places
 * the real sense; "New" makes a personal entity. Bulk paste and the
 * photo drafts file into the same group. The adult never picks a folder.
 */
import {
  applyPasteRows, applyPhotoDrafts, nameFromFile, resolvePasteRows,
} from "../shared/bulk.mjs";
import {
  catalogMatches, createEntity, entityMatches, groupDisplayName, placeItem,
} from "../shared/groups.mjs";

const $ = (id) => document.getElementById(id);

export function mountAddFlow({
  db, locale, all, catalog, open, close, toast,
  savePhoto, syncUploadBlob, loadPhotoURL, artInto,
  invalidateIndex, rerenderView, renderStrip, renderLibrary,
}) {
  let addTarget = null; // board_group id the add form files into
  let addCell = null; // {page, slot_index} when + came from an empty slot
  let bulkTarget = null;
  let bulkRows = [];
  let photoDrafts = []; // { file, url, name }

  function groupName(id, fallback = "") {
    const row = all(db, "SELECT id, name FROM board_group WHERE id = ?", [id])[0];
    return row ? groupDisplayName(db, row, locale) : fallback;
  }

  function openAddForm(groupId, cell = null) {
    addTarget = groupId;
    addCell = cell;
    const name = groupName(groupId);
    $("add-title").textContent = name ? `Add to ${name}` : "Add";
    $("add-name").value = "";
    $("add-photo").value = "";
    $("add-hint").value = "";
    $("add-newfields").hidden = true;
    $("add-matches").innerHTML = "";
    $("add-new").hidden = true;
    open("addform");
  }

  function openBulkForm(groupId) {
    bulkTarget = groupId ?? "grp_my_words";
    const name = groupName(bulkTarget);
    $("bulk-title").textContent = name ? `Add a list to ${name}` : "Add a list";
    $("bulk-paste").value = "";
    renderBulkPreview();
    open("bulkform");
  }

  function renderBulkPreview() {
    bulkRows = resolvePasteRows(db, $("bulk-paste").value, { groupId: bulkTarget, locale });
    const box = $("bulk-preview");
    box.innerHTML = "";
    for (const r of bulkRows) {
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
    const pending = bulkRows.filter((r) => !r.already).length;
    const add = $("bulk-add");
    add.disabled = pending === 0;
    const name = groupName(bulkTarget, "My Words");
    add.textContent = pending ? `Add ${pending} to ${name}` : "Add all";
  }

  function renderPhotoDrafts() {
    const box = $("photo-rows");
    box.innerHTML = "";
    for (const d of photoDrafts) {
      const row = document.createElement("div");
      row.className = "prow" + (d.name ? "" : " blank");
      const img = document.createElement("img");
      img.className = "thumb"; img.alt = ""; img.src = d.url;
      const input = document.createElement("input");
      input.type = "text"; input.value = d.name;
      input.placeholder = "Name this one";
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = d.name ? "" : "needs a name";
      input.addEventListener("input", () => {
        d.name = input.value.trim();
        row.classList.toggle("blank", !d.name);
        tag.textContent = d.name ? "" : "needs a name";
        refreshPhotoSave();
      });
      row.append(img, input, tag);
      box.appendChild(row);
    }
    refreshPhotoSave();
    function refreshPhotoSave() {
      const n = photoDrafts.filter((d) => d.name).length;
      $("photo-save").disabled = n === 0;
      $("photo-save").textContent = n ? `Save ${n}` : "Save";
    }
  }

  /** Re-render the match list and the always-present New row as the adult
   *  types. Every existing meaning is a picture row — the family's own
   *  entities first, then catalog senses. Picking a row places that
   *  record; only New creates one. */
  function renderAddMatches() {
    const text = $("add-name").value.trim();
    const box = $("add-matches");
    box.innerHTML = "";
    const newBtn = $("add-new");
    if (!text) {
      newBtn.hidden = true;
      $("add-newfields").hidden = true;
      return;
    }
    newBtn.hidden = false;
    newBtn.textContent = `New: '${text}'`;
    const seed = catalog.groups.find((g) => g.id === addTarget)?.category ?? null;

    const pic = (cls) => {
      const el = document.createElement("span");
      el.className = `pic ${cls}`;
      return el;
    };
    const place = (kind, id) => () => {
      placeItem(db, addTarget, kind, id, addCell);
      close("addform");
      rerenderView();
      renderStrip();
    };

    for (const m of entityMatches(db, text, addTarget, locale, seed)) {
      const row = document.createElement("button");
      row.className = "addmatch";
      const p = pic("r-Yellow");
      if (m.photo_key) {
        loadPhotoURL(m.photo_key).then((url) => {
          if (!url) return;
          const img = document.createElement("img");
          img.src = url;
          img.alt = "";
          p.replaceChildren(img);
          p.classList.add("photo");
        });
      } else {
        p.textContent = m.name[0].toUpperCase();
      }
      const txt = document.createElement("span");
      txt.className = "txt";
      const lb = document.createElement("span");
      lb.textContent = m.name;
      txt.appendChild(lb);
      if (m.groups.length) {
        const sub = document.createElement("span");
        sub.className = "sub";
        sub.textContent = `in ${m.groups.join(", ")}`;
        txt.appendChild(sub);
      }
      row.append(p, txt);
      row.addEventListener("click", place("entity", m.id));
      box.appendChild(row);
    }

    for (const m of catalogMatches(db, text, addTarget, locale, seed)) {
      const row = document.createElement("button");
      row.className = "addmatch";
      const p = pic(`r-${m.fitzgerald_role}`);
      if (m.art) {
        const img = document.createElement("img");
        img.alt = "";
        if (artInto(img, m.art)) p.classList.add("photo");
        p.appendChild(img);
      }
      const txt = document.createElement("span");
      txt.className = "txt";
      const lb = document.createElement("span");
      lb.textContent = m.label;
      txt.appendChild(lb);
      row.append(p, txt);
      row.addEventListener("click", place("sense", m.id));
      box.appendChild(row);
    }
  }

  $("bulk-paste").addEventListener("input", renderBulkPreview);
  $("bulk-add").addEventListener("click", () => {
    const res = applyPasteRows(db, bulkRows, {
      groupId: bulkTarget,
      category: catalog.groups.find((g) => g.id === bulkTarget)?.category ?? null,
    });
    close("bulkform");
    invalidateIndex();
    rerenderView();
    renderStrip();
    renderLibrary();
    const name = groupName(bulkTarget, "My Words");
    toast(`Added ${res.placed} to ${name}` + (res.skipped ? ` (${res.skipped} already there)` : ""));
  });
  $("add-bulk").addEventListener("click", () => openBulkForm(addTarget));
  $("lib-bulk").addEventListener("click", () => openBulkForm("grp_my_words"));

  $("add-photos").addEventListener("click", () => $("add-photos-input").click());
  $("add-photos-input").addEventListener("change", (e) => {
    const files = [...e.target.files].filter((f) => f.type.startsWith("image/"));
    e.target.value = "";
    if (!files.length) return;
    photoDrafts = files.map((file) => ({
      file, url: URL.createObjectURL(file), name: nameFromFile(file.name),
    }));
    const name = groupName(addTarget, "My Words");
    $("photo-title").textContent = `Add photos to ${name}`;
    renderPhotoDrafts();
    close("addform");
    open("photoform");
  });
  $("photo-save").addEventListener("click", async () => {
    const gid = addTarget ?? "grp_my_words";
    const drafts = [];
    for (const d of photoDrafts) {
      if (!d.name) { drafts.push({ name: "" }); continue; }
      const photo = await savePhoto(d.file);
      if (photo) syncUploadBlob(photo.bytes).catch(() => {});
      drafts.push({ name: d.name, photoKey: photo?.key ?? null });
    }
    const res = applyPhotoDrafts(db, drafts, {
      groupId: gid,
      category: catalog.groups.find((g) => g.id === gid)?.category ?? null,
      cell: addCell,
    });
    for (const d of photoDrafts) URL.revokeObjectURL(d.url);
    photoDrafts = [];
    close("photoform");
    invalidateIndex();
    rerenderView();
    renderStrip();
    renderLibrary();
    toast(`Added ${res.saved} photo${res.saved === 1 ? "" : "s"}`);
  });

  $("add-name").addEventListener("input", renderAddMatches);
  $("add-new").addEventListener("click", () => {
    $("add-newfields").hidden = false;
  });
  $("add-save").addEventListener("click", async () => {
    const name = $("add-name").value.trim();
    if (!name) return;
    const id = `ent_${crypto.randomUUID().replaceAll("-", "")}`;
    const file = $("add-photo").files[0];
    const photo = file ? await savePhoto(file) : null;
    if (photo) syncUploadBlob(photo.bytes).catch(() => {});
    const photoKey = photo?.key ?? null;
    const hint = $("add-hint").value.trim() || null;
    const category = catalog.groups.find((g) => g.id === addTarget)?.category ?? null;
    createEntity(db, { id, name, photoKey, category, hint });
    placeItem(db, addTarget, "entity", id, addCell);
    invalidateIndex();
    close("addform");
    rerenderView();
    renderStrip();
  });

  return { openAddForm };
}
