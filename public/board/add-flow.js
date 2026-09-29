/**
 * Add a word (029 § 3): one field, type → one highlighted row → Return.
 * A match places the real word; Make saves a personal word at once and
 * opens its card, where the picture and voice are made. Bulk paste and
 * the photo drafts file into the same group.
 */
import {
  applyPasteRows, applyPhotoDrafts, nameFromFile, resolvePasteRows,
} from "../shared/bulk.mjs";
import {
  catalogMatches, createEntity, createGroup, entityMatches, groupDisplayName, groupIndex,
  placeItem,
} from "../shared/groups.mjs";
import { groupGlyph } from "./group-glyph.js";
import { normalizeV1 } from "../shared/normalize.mjs";
import { SENSE_ART_SQL } from "../shared/images.mjs";
import { needsDraw, pictureAction, shouldConfirmDraws } from "../shared/pictures.mjs";

const $ = (id) => document.getElementById(id);

export function mountAddFlow({
  db, locale, all, catalog, open, close, toast,
  savePhoto, syncUploadBlob, loadPhotoURL, artInto,
  invalidateIndex, rerenderView, renderStrip, renderLibrary, openAddToBoards,
  tile, speakItem, openWordCard, pictures, pictureFill, creds,
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

  /** § 3 — the sheet names where the word goes (the destination chip)
   *  and starts empty; the field gets focus so typing starts at once. */
  function openAddForm(groupId, cell = null) {
    addTarget = groupId ?? "grp_my_words";
    addCell = cell;
    $("add-title").textContent = "Add a word";
    $("add-destname").textContent = groupName(addTarget, "My Words");
    setPickerOpen(false);
    $("add-name").value = "";
    renderAddMatches();
    open("addform");
    setTimeout(() => $("add-name").focus?.(), 0);
  }

  /* --- the group picker (029 § 3.1) ---
     The destination is the group the adult came from (Settings → My
     Words; the editor → the group being edited) — never a guess. The chip
     opens a searchable list in place of the results: Recent (groups the
     adult actually added to), then every group A–Z, then New group. */
  const RECENT_KEY = "pip-add-recent";
  const readRecent = () => {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); } catch { return []; }
  };
  function noteRecent(id) {
    try {
      const next = [id, ...readRecent().filter((x) => x !== id)].slice(0, 3);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch { /* private mode: no recents */ }
  }

  function setPickerOpen(on) {
    $("add-destlist").hidden = !on;
    $("add-name").hidden = on;
    $("add-matches").hidden = on;
    for (const el of [$("add-bulk"), $("add-photos")]) {
      if (el?.parentElement) el.parentElement.hidden = on;
    }
    $("add-dest").setAttribute?.("aria-expanded", String(on));
    if (on) {
      $("add-groupq").value = "";
      $("add-groupq").placeholder = "Find a group";
      renderGroups();
      setTimeout(() => $("add-groupq").focus?.(), 0);
    } else {
      setTimeout(() => $("add-name").focus?.(), 0);
    }
  }

  function chooseGroup(id) {
    if (id !== addTarget) addCell = null; // that cell belonged to the other group
    addTarget = id;
    $("add-destname").textContent = groupName(addTarget, "My Words");
    setPickerOpen(false);
    renderAddMatches();
  }

  /** "Make a group called …": a custom group, selected at once; the
   *  word that follows lands in it. Its door is in Groups. */
  function makeGroup(name) {
    const clean = name.trim().replace(/\s+/g, " ");
    if (!clean) return;
    const { id } = createGroup(db, { name: clean });
    toast(`New group “${clean}” — its door is in Groups`);
    rerenderView();
    chooseGroup(id);
  }

  function groupRow(g, { selected }) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "add-group";
    b.setAttribute?.("role", "option");
    b.setAttribute?.("aria-selected", String(selected));
    const name = document.createElement("span");
    name.className = "pname";
    name.textContent = groupDisplayName(db, g, locale);
    b.append(groupGlyph(g, { db, locale, loadPhotoURL }), name);
    if (selected) {
      const tick = document.createElement("span");
      tick.className = "ptick";
      tick.textContent = "✓";
      b.appendChild(tick);
    }
    b.addEventListener("click", () => chooseGroup(g.id));
    return b;
  }

  function renderGroups() {
    const box = $("add-grouplist");
    box.innerHTML = "";
    const q = normalizeV1($("add-groupq").value);
    const groups = groupIndex(db).filter((g) => !g.hidden)
      .map((g) => ({ g, name: groupDisplayName(db, g, locale) }));
    const byName = (a, b) => a.name.localeCompare(b.name, locale, { sensitivity: "base" });
    const head = (text) => {
      const h = document.createElement("p");
      h.className = "add-grouphead";
      h.textContent = text;
      box.appendChild(h);
    };
    const firstMatch = [];
    if (!q) {
      const recent = readRecent()
        .map((id) => groups.find((p) => p.g.id === id)).filter(Boolean);
      if (recent.length) {
        head("Recent");
        for (const p of recent) box.appendChild(groupRow(p.g, { selected: p.g.id === addTarget }));
      }
      head("All groups");
    }
    const shown = groups.filter((p) => !q || normalizeV1(p.name).includes(q)).sort(byName);
    for (const p of shown) {
      box.appendChild(groupRow(p.g, { selected: p.g.id === addTarget }));
      firstMatch.push(p.g.id);
    }
    // Last row: a new group — named from the search when nothing is called that.
    // Offer to make a group only when nothing is called anything like it.
    const anyMatch = shown.length > 0;
    const typed = $("add-groupq").value.trim();
    const make = document.createElement("button");
    make.type = "button";
    make.className = "add-group add-newgroup";
    make.id = "add-newgroup";
    const plus = document.createElement("span");
    plus.className = "glyph";
    plus.textContent = "+";
    const lb = document.createElement("span");
    lb.className = "pname";
    lb.textContent = q && !anyMatch ? `Make a group called “${typed}”` : "New group";
    make.append(plus, lb);
    make.addEventListener("click", () => {
      if (q && !anyMatch) { makeGroup(typed); return; }
      $("add-groupq").value = "";
      $("add-groupq").placeholder = "Name the new group";
      $("add-groupq").focus?.();
      renderGroups();
    });
    box.appendChild(make);
    groupsFirst = firstMatch[0] ?? null;
    groupsCanMake = !!q && !anyMatch;
  }
  let groupsFirst = null;
  let groupsCanMake = false;

  $("add-dest").addEventListener("click", () => setPickerOpen($("add-destlist").hidden));
  $("add-groupq").addEventListener("input", renderGroups);
  $("add-groupq").addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault?.(); e.stopPropagation?.(); setPickerOpen(false); return; }
    if (e.key !== "Enter") return;
    e.preventDefault?.();
    if (groupsFirst) chooseGroup(groupsFirst);
    else if (groupsCanMake) makeGroup($("add-groupq").value);
  });

  function openBulkForm(groupId) {
    bulkTarget = groupId ?? "grp_my_words";
    const name = groupName(bulkTarget);
    $("bulk-title").textContent = name ? `Add a list to ${name}` : "Add a list";
    $("bulk-paste").value = "";
    renderBulkPreview();
    open("bulkform");
  }

  /* § 5 — each new row shows the picture it will get (tap to cycle
   * through the finder's four), or "will draw". The Add button counts
   * the new drawings and asks once when they're > 10 or > what's left. */
  const finds = new Map(); // normalized text → find result | "pending"
  let bulkLeft = null;
  let confirmArmed = false;
  let findTimer = null;

  function queueFinds() {
    clearTimeout(findTimer);
    findTimer = setTimeout(async () => {
      const todo = bulkRows.filter((r) => r.kind === "new" && !finds.has(normalizeV1(r.text)));
      if (!todo.length || !pictures) return;
      for (const r of todo) finds.set(normalizeV1(r.text), "pending");
      const { userId, license } = await creds();
      if (bulkLeft == null) {
        pictures.allowance({ userId, license }).then((a) => {
          if (a) { bulkLeft = a.left; paintBulk(); }
        });
      }
      for (let i = 0; i < todo.length; i += 50) {
        const chunk = todo.slice(i, i + 50);
        const res = await pictures.findBatch({
          userId, license, locale,
          items: chunk.map((r) => ({ text: normalizeV1(r.text) })),
        });
        chunk.forEach((r, k) => {
          const f = res.results?.[k];
          finds.set(normalizeV1(r.text), f && !f.error ? { ...f, pickIx: null } : null);
        });
        paintBulk();
      }
    }, 350);
  }

  /** The picture a new row will get: the adult's cycled pick, else the
   *  server's auto, else nothing (drawn or chosen later). */
  function rowPicture(f) {
    if (!f || f === "pending") return null;
    if (f.pickIx != null) return f.candidates[f.pickIx] ?? null;
    return pictureAction(f).kind === "apply" ? pictureAction(f).picture : null;
  }
  const rowDraws = (f) => !!f && f !== "pending" && f.pickIx == null && needsDraw(f);

  function renderBulkPreview() {
    bulkRows = resolvePasteRows(db, $("bulk-paste").value, { groupId: bulkTarget, locale });
    confirmArmed = false;
    queueFinds();
    paintBulk();
  }

  function paintBulk() {
    const box = $("bulk-preview");
    box.innerHTML = "";
    let draws = 0;
    for (const r of bulkRows) {
      const row = document.createElement("div");
      row.className = "ed-prow" + (r.already ? " over" : "");
      const f = r.kind === "new" ? finds.get(normalizeV1(r.text)) : null;
      if (r.kind === "sense") {
        // Ours: show our picture, so every row reads the same way.
        const thumb = document.createElement("span");
        thumb.className = "bthumb";
        const art = all(db, `SELECT ${SENSE_ART_SQL} AS art FROM sense s WHERE s.id = ?`, [r.id])[0]?.art;
        const img = document.createElement("img");
        img.alt = "";
        if (art && artInto(img, art)) thumb.appendChild(img);
        row.appendChild(thumb);
      } else if (r.kind === "entity") {
        const thumb = document.createElement("span");
        thumb.className = "bthumb";
        thumb.textContent = r.label[0]?.toUpperCase() ?? "";
        row.appendChild(thumb);
      }
      if (r.kind === "new") {
        const thumb = document.createElement("button");
        thumb.type = "button";
        thumb.className = "bthumb";
        const pic = rowPicture(f);
        if (pic?.asset) {
          const img = document.createElement("img");
          img.alt = "";
          loadAsset(img, pic.asset);
          thumb.appendChild(img);
        } else {
          thumb.textContent = r.text[0]?.toUpperCase() ?? "";
        }
        if (f && f !== "pending" && f.candidates?.length) {
          thumb.title = "Tap for another picture";
          thumb.addEventListener("click", () => {
            const n = f.candidates.length;
            const cur = f.pickIx ?? f.candidates.findIndex((c) => c.image_id === f.auto);
            f.pickIx = (cur + 1) % n;
            confirmArmed = false;
            paintBulk();
          });
        }
        row.appendChild(thumb);
        if (rowDraws(f) && !r.already) draws++;
      }
      const tag = document.createElement("span");
      tag.className = "tag" + (r.kind === "new" ? " new" : r.already ? " already" : "");
      tag.textContent = r.already ? "already"
        : r.kind !== "new" ? "ours"
        : f === "pending" ? "finding…"
        : rowDraws(f) ? "will draw"
        : rowPicture(f) ? "new" : "new — picture later";
      const lb = document.createElement("span");
      lb.textContent = r.label;
      row.append(tag, lb);
      box.appendChild(row);
    }
    const pending = bulkRows.filter((r) => !r.already).length;
    const add = $("bulk-add");
    add.disabled = pending === 0;
    const name = groupName(bulkTarget, "My Words");
    const ask = draws > 0 && shouldConfirmDraws(draws, bulkLeft);
    const cost = draws ? ` · draws ${draws} new picture${draws === 1 ? "" : "s"}` : "";
    add.textContent = !pending ? "Add all"
      : confirmArmed ? `Yes — add ${pending} and draw ${draws}`
      : `Add ${pending} to ${name}${cost}`;
    const note = $("bulk-note");
    note.hidden = !ask;
    note.textContent = ask
      ? (typeof bulkLeft === "number" && draws > bulkLeft
        ? `That's more drawings than you have left (${bulkLeft}). Words past that get their picture later — pick one of ours or add a photo.`
        : `Drawing ${draws} pictures uses ${draws} of your ${bulkLeft ?? "remaining"} drawings. Tap a thumbnail to use one of ours instead.`)
      : "";
    bulkNeedsConfirm = ask;
  }
  let bulkNeedsConfirm = false;

  async function loadAsset(img, asset) {
    if (!asset.startsWith("/api/")) { img.src = asset; return; }
    const { userId, license } = await creds();
    const blob = await pictures.imageBlob({ userId, license, asset });
    if (blob) img.src = URL.createObjectURL(blob);
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

  /* --- the match list (§ 3) ---
     Rows: the family's own words, then ours, then Make — always last.
     One row is highlighted; Return (or the phone's Done key) takes it.
     A match is highlighted only when it IS the typed word (spacing and
     hyphens aside: "apple sauce" is applesauce); otherwise Make is, so a
     new word is never swapped for a longer one that merely starts the
     same. Words already in this group say so and open their card. */
  let rows = []; // [{ el, go }]
  let hi = -1;

  const fold = (s) => normalizeV1(s).replace(/[\s\-\u2010-\u2015]+/g, "");

  function setHi(i) {
    hi = rows.length ? Math.max(0, Math.min(i, rows.length - 1)) : -1;
    rows.forEach((r, k) => {
      r.el.classList.toggle("hi", k === hi);
      r.el.setAttribute?.("aria-selected", String(k === hi));
    });
  }

  function picEl(role, fill) {
    const p = document.createElement("span");
    p.className = `pic r-${role ?? "Yellow"}`;
    fill?.(p);
    return p;
  }

  /** One row: a big tap target (the whole row) plus ▶ that only plays. */
  function addRow({ pic, label, sub, action, play, run, cls = "" }) {
    const row = document.createElement("div");
    row.className = `addmatch ${cls}`.trim();
    row.setAttribute?.("role", "option");
    const main = document.createElement("button");
    main.type = "button";
    main.className = "am-main";
    const txt = document.createElement("span");
    txt.className = "txt";
    const lb = document.createElement("span");
    lb.className = "lb";
    lb.textContent = label;
    txt.appendChild(lb);
    if (sub) {
      const sb = document.createElement("span");
      sb.className = "sub";
      sb.textContent = sub;
      txt.appendChild(sb);
    }
    main.append(pic, txt);
    row.appendChild(main);
    if (play) {
      const pb = document.createElement("button");
      pb.type = "button";
      pb.className = "am-play";
      pb.setAttribute?.("aria-label", `Play ${label}`);
      pb.textContent = "▶";
      pb.addEventListener("click", (e) => { e.stopPropagation?.(); play(); });
      row.appendChild(pb);
    }
    const act = document.createElement("span");
    act.className = "am-act";
    act.textContent = action;
    main.appendChild(act);
    main.addEventListener("click", run);
    $("add-matches").appendChild(row);
    rows.push({ el: row, go: run });
    return main;
  }

  function renderAddMatches() {
    const text = $("add-name").value.trim();
    const box = $("add-matches");
    box.innerHTML = "";
    rows = [];
    $("add-name").setAttribute?.("aria-expanded", String(!!text));
    if (!text) { setHi(-1); return; }
    const seed = catalog.groups.find((g) => g.id === addTarget)?.category ?? null;
    const want = fold(text);
    let exact = -1;
    const here = new Set(
      all(db, "SELECT item_kind || ':' || item_id AS k FROM group_membership WHERE group_id = ?",
        [addTarget]).map((r) => r.k));
    const destName = groupName(addTarget, "My Words");

    // The family's own words — everywhere, so "already here" can show.
    for (const m of entityMatches(db, text, "__any__", locale, seed)) {
      const isHere = here.has(`entity:${m.id}`);
      const pic = picEl(m.fitzgerald_role, (p) => {
        if (m.photo_key) {
          loadPhotoURL(m.photo_key).then((url) => {
            if (!url) return;
            const img = document.createElement("img");
            img.src = url; img.alt = "";
            p.replaceChildren(img);
            p.classList.add("photo");
          });
        } else {
          p.textContent = m.name[0].toUpperCase();
        }
      });
      addRow({
        pic, label: m.name,
        sub: isHere ? `Already in ${destName}` : m.groups.length ? `In ${m.groups.join(", ")}` : "Your word",
        action: isHere ? "Open" : "Add",
        play: () => speakItem?.({ kind: "entity", id: m.id }),
        run: isHere ? openExisting("entity", m.id, m.name) : place("entity", m.id, m.name),
        cls: isHere ? "here" : "",
      });
      if (exact < 0 && fold(m.name) === want) exact = rows.length - 1;
    }

    // Ours — the typed text, plus its spacing-folded form ("apple sauce").
    const seen = new Set();
    const cat = [...catalogMatches(db, text, "__any__", locale, seed)];
    if (want !== normalizeV1(text)) cat.push(...catalogMatches(db, want, "__any__", locale, seed));
    for (const m of cat) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      const isHere = here.has(`sense:${m.id}`);
      const pic = picEl(m.fitzgerald_role, (p) => {
        if (!m.art) return;
        const img = document.createElement("img");
        img.alt = "";
        if (artInto(img, m.art)) p.classList.add("photo");
        p.appendChild(img);
      });
      addRow({
        pic, label: m.label,
        sub: isHere ? `Already in ${destName}` : "Our picture and voice",
        action: isHere ? "Open" : "Add",
        play: () => speakItem?.({ kind: "sense", id: m.id }),
        run: isHere ? openExisting("sense", m.id, m.label) : place("sense", m.id, m.label),
        cls: isHere ? "here" : "",
      });
      if (exact < 0 && fold(m.label) === want) exact = rows.length - 1;
    }

    // Make — always last; the default unless the typed word already exists.
    const plus = picEl("None", (p) => { p.textContent = "+"; p.classList.add("plus"); });
    const make = addRow({
      pic: plus, label: `“${text}”`,
      sub: "New word — picture and voice made for you",
      action: "Make", cls: "make",
      run: () => makeWord(text),
    });
    make.id = "add-new"; // probes and tests click Make by id
    setHi(exact >= 0 ? exact : rows.length - 1);
  }

  const place = (kind, id, label) => () => {
    placeItem(db, addTarget, kind, id, addCell);
    noteRecent(addTarget);
    close("addform");
    rerenderView();
    renderStrip();
    speakItem?.({ kind, id }); // hear what was added
    offerOtherBoards({ item_kind: kind, item_id: id, label });
  };

  const openExisting = (kind, id, label) => () => {
    close("addform");
    openWordCard?.({ item_kind: kind, item_id: id, label });
  };

  /** § 4 — Make saves at once: name only, offline-first. The card that
   *  opens makes the picture and voice; nothing here waits on them. */
  function makeWord(text) {
    const name = text.trim();
    if (!name) return;
    const id = `ent_${crypto.randomUUID().replaceAll("-", "")}`;
    const category = catalog.groups.find((g) => g.id === addTarget)?.category ?? null;
    createEntity(db, { id, name, category });
    placeItem(db, addTarget, "entity", id, addCell);
    noteRecent(addTarget);
    // 028 § 5.2: the save kicks off the voice mint in the background.
    tile?.ensure(name, { source: "user_typed" }).catch(() => {});
    invalidateIndex();
    close("addform");
    rerenderView();
    renderStrip();
    renderLibrary?.();
    openWordCard?.(
      { item_kind: "entity", item_id: id, label: name },
      { justAdded: { groupName: groupName(addTarget, "My Words") } },
    );
  }

  $("add-name").addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault?.(); setHi(hi + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault?.(); setHi(hi - 1); }
    else if (e.key === "Enter") {
      e.preventDefault?.();
      if (hi >= 0) rows[hi].go();
    }
  });

  $("bulk-paste").addEventListener("input", renderBulkPreview);
  $("bulk-add").addEventListener("click", () => {
    if (bulkNeedsConfirm && !confirmArmed) { confirmArmed = true; paintBulk(); return; }
    // 028 § 5.3: brand-new entity words mint one at a time after the
    // rows land — hits for words the ledger already knows are free.
    const newTexts = bulkRows.filter((r) => r.kind === "new" && !r.already)
      .map((r) => r.text);
    const res = applyPasteRows(db, bulkRows, {
      groupId: bulkTarget,
      category: catalog.groups.find((g) => g.id === bulkTarget)?.category ?? null,
    });
    if (newTexts.length) {
      tile?.prefetch(newTexts, {
        onProgress: (p) =>
          toast(`Making ${tile.name()}'s voice, ${p.done + p.failed} of ${newTexts.length}`),
      }).catch(() => {});
    }
    fillPastedPictures(res.newIds ?? []);
    noteRecent(bulkTarget);
    close("bulkform");
    invalidateIndex();
    rerenderView();
    renderStrip();
    renderLibrary();
    const name = groupName(bulkTarget, "My Words");
    toast(`Added ${res.placed} to ${name}` + (res.skipped ? ` (${res.skipped} already there)` : ""));
  });

  /** Pictures for the pasted words, one at a time in the background: the
   *  adult's cycled pick, else the finder's own rule (apply | draw). The
   *  words are usable at once; pictures fill in. */
  async function fillPastedPictures(newIds) {
    if (!pictureFill) return;
    for (const { row, id } of newIds) {
      const f = finds.get(normalizeV1(row.text));
      const chosen = f && f !== "pending" && f.pickIx != null ? f.candidates[f.pickIx] : null;
      if (chosen) {
        const { userId, license } = await creds();
        const blob = await pictures.imageBlob({ userId, license, asset: chosen.asset });
        if (blob) await pictureFill.applyBlob(id, blob);
        pictureFill.inferKind(id, f.kind);
        pictures.pick({ userId, license, text: row.text, imageId: chosen.image_id });
        continue;
      }
      await pictureFill.autoFill(id, { found: f && f !== "pending" ? f : null })
        .catch(() => {});
    }
  }
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
    const named = drafts.filter((d) => d.name).map((d) => d.name);
    if (named.length) tile?.prefetch(named).catch(() => {});
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

  /** 027 B9: after an add, an optional Add to other boards — never a
   *  silent multi-board write. */
  function offerOtherBoards(item) {
    toast(`Added ${item.label}`, null, {
      actionLabel: "Add to other groups",
      onAction: () => openAddToBoards(item),
    });
  }

  return { openAddForm };
}
