/**
 * The word card: where a word is, how it sounds, what can change.
 * Entities rename, take a photo, and retire. Catalog words are
 * read-only here except hide, a picture override, and a recording.
 */
import {
  activeLayout, entityGroups, maskedSenseIds,
  removeItemUndoable, renameEntity, restoreEntity, retireEntity, senseGroups,
  setEntityPhoto, setEntityRole, setMask,
} from "../shared/groups.mjs";
import {
  clearImageOverride, imageOverrideFor, libraryImagesFor, setImageOverride,
} from "../shared/images.mjs";
import { clearOverride, overrideFor, setOverride } from "../shared/voice.mjs";

const $ = (id) => document.getElementById(id);

export function mountWordCard({
  db, locale, all, open, close, toast,
  metaFor, artInto, loadPhotoURL, savePhoto, syncUploadBlob, speakItem, xBadge,
  tile,
  invalidateIndex, setView, rerenderView, renderStrip, renderGrid, flashCell,
  getCell, getGroupKey, setGroup, dropEntityPhoto, dropEntityRole, dropSenseMeta,
  openAddToBoards,
}) {
  let cardItem = null; // { item_kind, item_id, label } currently shown
  let recorder = null;
  let recChunks = [];

  /** 028 § 5.1 — the card shows the shared-voice state for an entity
   *  word: making/held/budget/failed, with Try again where it heals. */
  function updateVoiceUI() {
    const el = $("wc-voice");
    if (!el) return;
    const state = cardItem?.item_kind === "entity"
      ? tile?.status(cardItem.label) : null;
    el.hidden = !state || state === "ready";
    el.textContent = state && state !== "ready"
      ? (tile?.message(state, cardItem.label) ?? "") : "";
    $("wc-voicetry").hidden = !["failed", "offline", "unavailable"].includes(state);
  }
  tile?.onStatus?.(() => updateVoiceUI());
  $("wc-voicetry")?.addEventListener("click", () => {
    if (cardItem?.item_kind === "entity") {
      tile?.ensure(cardItem.label, { source: "user_typed" }).catch(() => {});
      updateVoiceUI();
    }
  });

  function cardGroups() {
    return cardItem.item_kind === "entity"
      ? entityGroups(db, cardItem.item_id, locale)
      : senseGroups(db, cardItem.item_id, locale);
  }

  function renderCardGroups() {
    const box = $("wc-groups");
    box.innerHTML = "";
    for (const g of cardGroups()) {
      const chip = document.createElement("span");
      chip.className = "wchip";
      chip.textContent = g.name;
      // 027 B9: remove from any group — this placement only; the word
      // stays in the Library and the keyboard with zero placements.
      const x = xBadge(() => {
        const undo = removeItemUndoable(db, g.id, cardItem.item_kind, cardItem.item_id);
        renderCardGroups();
        rerenderView();
        toast(`Removed from ${g.name}`, () => {
          const { moved } = undo.undo();
          renderCardGroups();
          rerenderView();
          if (moved) toast(`${cardItem.label} is back in ${g.name} — its cell was taken, so it moved`);
        });
      });
      x.title = `Remove from ${g.name}`;
      chip.appendChild(x);
      box.appendChild(chip);
    }
  }

  function openWordCard(item) {
    cardItem = { item_kind: item.item_kind, item_id: item.item_id, label: item.label };
    const isEnt = item.item_kind === "entity";
    const meta = isEnt
      ? { role: all(db,
          "SELECT fitzgerald_role AS r FROM personal_entity WHERE id = ?",
          [item.item_id])[0]?.r ?? "Yellow" }
      : metaFor(item.item_id);
    const pic = $("wc-pic");
    pic.className = `pic r-${meta.role ?? "None"}`;
    pic.replaceChildren();
    $("wc-name").value = item.label;
    $("wc-name").disabled = !isEnt; // a catalog word is renamed by a new copy, not here
    $("wc-role").textContent = isEnt ? "personal word" : "catalog word";
    // 018 D7: a personal word's kind is the family's pick — changeable
    // here, never a color picker.
    $("wc-kindlabel").hidden = !isEnt;
    if (isEnt) $("wc-kind").value = meta.role;
    $("wc-photolabel").hidden = !isEnt;
    $("wc-photo").value = "";
    $("wc-ownpiclabel").hidden = isEnt;
    $("wc-ownpic").value = "";
    $("wc-remove").hidden = !isEnt;
    // Hide word: catalog words only — entities retire instead.
    if (isEnt) {
      $("wc-hide").hidden = true;
    } else {
      const hidden = maskedSenseIds(db).has(item.item_id);
      $("wc-hide").hidden = false;
      $("wc-hide").textContent = hidden ? "Show word" : "Hide word";
    }
    if (isEnt && item.photo_key) {
      loadPhotoURL(item.photo_key).then((url) => {
        if (!url) return;
        const img = document.createElement("img");
        img.src = url;
        img.alt = "";
        pic.replaceChildren(img);
        pic.classList.add("photo");
      });
    } else if (!isEnt && meta.art) {
      const img = document.createElement("img");
      img.alt = "";
      if (artInto(img, meta.art)) pic.classList.add("photo");
      pic.appendChild(img);
    } else {
      pic.textContent = item.label[0].toUpperCase();
    }
    renderCardGroups();
    updateRecUI();
    updatePicUI();
    updateVoiceUI();
    open("wordcard");
  }

  function updatePicUI() {
    const isEnt = cardItem?.item_kind === "entity";
    const ovr = !isEnt && cardItem ? imageOverrideFor(db, cardItem.item_id) : null;
    $("wc-ourpic").hidden = !ovr;
    const pics = !isEnt && cardItem ? libraryImagesFor(db, cardItem.item_id) : [];
    const box = $("wc-libpics");
    box.replaceChildren();
    // Another library picture is a choice only when one exists.
    box.hidden = pics.length < 2;
    for (const p of pics) {
      const b = document.createElement("button");
      b.type = "button";
      b.classList.toggle("sel", ovr?.image_id === p.id);
      const img = document.createElement("img");
      img.src = `/${p.key}`;
      img.alt = "";
      b.appendChild(img);
      b.addEventListener("click", () => {
        setImageOverride(db, { senseId: cardItem.item_id, imageId: p.id });
        afterPicChange();
      });
      box.appendChild(b);
    }
  }

  function afterPicChange() {
    dropSenseMeta(cardItem.item_id);
    const meta = metaFor(cardItem.item_id);
    const pic = $("wc-pic");
    pic.className = `pic r-${meta.role ?? "None"}`;
    pic.replaceChildren();
    if (meta.art) {
      const img = document.createElement("img");
      img.alt = "";
      if (artInto(img, meta.art)) pic.classList.add("photo");
      pic.appendChild(img);
    } else {
      pic.textContent = cardItem.label[0].toUpperCase();
    }
    updatePicUI();
    renderGrid();
    renderStrip();
    rerenderView();
  }

  /** What the card's recording binds to — an entity's id + spoken_name,
   *  or the locale lemma's utterance + spoken_text for a catalog word. */
  function overrideTarget() {
    if (!cardItem) return null;
    if (cardItem.item_kind === "entity") {
      const e = all(db, "SELECT spoken_name FROM personal_entity WHERE id = ?",
        [cardItem.item_id])[0];
      return e ? { itemKind: "entity", itemId: cardItem.item_id, text: e.spoken_name } : null;
    }
    const l = all(db,
      `SELECT l.utterance_id, u.spoken_text FROM label l
       JOIN utterance u ON u.id = l.utterance_id
       WHERE l.sense_id = ? AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = ?`,
      [cardItem.item_id, locale])[0];
    return l ? { itemKind: "utterance", itemId: l.utterance_id, text: l.spoken_text } : null;
  }

  function updateRecUI() {
    $("wc-record").textContent = recorder?.state === "recording" ? "Stop" : "Record it";
    const t = overrideTarget();
    $("wc-revert").hidden = !t || !overrideFor(db, t.itemKind, t.itemId);
  }

  $("wc-name").addEventListener("change", () => {
    if (!cardItem || cardItem.item_kind !== "entity") return;
    const name = $("wc-name").value.trim();
    if (!name || name === cardItem.label) { $("wc-name").value = cardItem.label; return; }
    renameEntity(db, cardItem.item_id, name);
    // 028 § 5.2: a rename recomputes the clip key — the new name mints,
    // the old clip stays in the ledger untouched.
    tile?.ensure(name, { source: "user_typed" }).catch(() => {});
    cardItem.label = name;
    invalidateIndex(); // completions index the old spelling
    rerenderView();
    renderStrip();
  });

  $("wc-kind").addEventListener("change", () => {
    if (!cardItem || cardItem.item_kind !== "entity") return;
    setEntityRole(db, cardItem.item_id, $("wc-kind").value);
    dropEntityRole(cardItem.item_id);
    $("wc-pic").className = `pic r-${$("wc-kind").value}`;
    rerenderView();
    renderStrip();
  });

  $("wc-photo").addEventListener("change", async () => {
    const file = $("wc-photo").files[0];
    if (!file || !cardItem) return;
    const photo = await savePhoto(file);
    syncUploadBlob(photo.bytes).catch(() => {});
    setEntityPhoto(db, cardItem.item_id, photo.key);
    dropEntityPhoto(cardItem.item_id);
    rerenderView();
  });

  $("wc-ownpic").addEventListener("change", async () => {
    const file = $("wc-ownpic").files[0];
    $("wc-ownpic").value = "";
    if (!file || !cardItem || cardItem.item_kind !== "sense") return;
    const photo = await savePhoto(file);
    syncUploadBlob(photo.bytes).catch(() => {});
    setImageOverride(db, { senseId: cardItem.item_id, photoKey: photo.key });
    afterPicChange();
  });

  $("wc-ourpic").addEventListener("click", () => {
    if (!cardItem || cardItem.item_kind !== "sense") return;
    clearImageOverride(db, cardItem.item_id);
    afterPicChange();
  });

  $("wc-play").addEventListener("click", () => {
    if (!cardItem) return;
    speakItem({ kind: cardItem.item_kind, id: cardItem.item_id });
  });

  $("wc-record").addEventListener("click", async () => {
    if (recorder?.state === "recording") { recorder.stop(); return; }
    const target = overrideTarget();
    if (!target) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorder = new MediaRecorder(stream);
      recChunks = [];
      recorder.ondataavailable = (e) => { if (e.data.size) recChunks.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        updateRecUI();
        const blob = new Blob(recChunks, { type: recorder.mimeType });
        if (!blob.size) return;
        const { key, bytes } = await savePhoto(blob);
        syncUploadBlob(bytes).catch(() => {});
        setOverride(db, {
          itemKind: target.itemKind, itemId: target.itemId,
          key, recordedText: target.text,
        });
        updateRecUI();
        toast(`Recorded — "${target.text}" plays your recording`);
      };
      recorder.start();
      updateRecUI();
    } catch {
      $("wc-rechint").hidden = false;
      $("wc-rechint").textContent = "No microphone — the browser did not allow it.";
    }
  });

  $("wc-revert").addEventListener("click", () => {
    const t = overrideTarget();
    if (!t) return;
    clearOverride(db, t.itemKind, t.itemId);
    updateRecUI();
    toast("Back to the app's voice");
  });

  /** 027 B9: Add to other boards — named destinations, none preselected. */
  $("wc-addgroup").addEventListener("click", () => {
    const item = cardItem;
    close("wordcard"); // the destinations sheet takes the screen
    openAddToBoards(item);
  });

  /** Show on board: jump to where the word lives and mark its cell for a
   *  beat. An entity or custom-group sense flashes in the group the card
   *  was opened from (else its first group); a built-in sense flashes on
   *  the core board. */
  $("wc-show").addEventListener("click", () => {
    const it = cardItem;
    close("wordcard");
    const onBoard = it.item_kind === "sense" &&
      all(db, "SELECT 1 AS x FROM core_cell WHERE sense_id = ?", [it.item_id])[0];
    if (onBoard) {
      setView("board");
      flashCell(getCell(it.item_id));
      return;
    }
    const homes = cardItem.item_kind === "entity"
      ? entityGroups(db, it.item_id, locale)
      : senseGroups(db, it.item_id, locale);
    const target = homes.find((g) => g.id === getGroupKey()) ?? homes[0];
    if (!target) { setView("board"); return; }
    const cell = all(
      db,
      "SELECT page FROM group_cell WHERE group_id = ? AND layout = ? AND item_kind = ? AND item_id = ?",
      [target.id, activeLayout(db), it.item_kind, it.item_id],
    )[0];
    setGroup(target.id, cell?.page ?? 0);
    setView("group");
    // Render is async; flash once the cells exist.
    requestAnimationFrame(() =>
      flashCell($("groupgrid").querySelector(`[data-item="${it.item_kind}:${it.item_id}"]`)),
    );
  });

  /** Hide word: the sense keeps every cell but renders as a ghost —
   *  unspoken, out of the strip and completions — until Show. */
  $("wc-hide").addEventListener("click", () => {
    const it = cardItem;
    if (!it || it.item_kind !== "sense") return;
    const hidden = !maskedSenseIds(db).has(it.item_id);
    setMask(db, it.item_id, hidden);
    close("wordcard");
    invalidateIndex();
    rerenderView();
    renderGrid();
    renderStrip();
    toast(hidden ? `Hid ${it.label}` : `Showing ${it.label}`);
  });

  /** Remove = retire (never delete). The row, photo, and placements stay;
   *  Undo restores it. */
  $("wc-remove").addEventListener("click", () => {
    const it = cardItem;
    retireEntity(db, it.item_id);
    close("wordcard");
    invalidateIndex();
    rerenderView();
    renderStrip();
    toast(`Removed ${it.label}`, () => {
      restoreEntity(db, it.item_id);
      invalidateIndex();
      rerenderView();
      renderStrip();
    });
  });

  return { openWordCard };
}
