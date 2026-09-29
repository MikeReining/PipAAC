/**
 * The word card (029 § 4): one card for every word — the tile as the
 * child sees it, how it sounds, its picture, its kind, and where it is.
 * After Make it opens in a "just added" state: the picture is found or
 * drawn here (picture-fill.js), the voice mints (028) and plays once.
 * Catalog words keep their own picture choices and a recording; the
 * rare and destructive actions live behind "…".
 */
import {
  activeLayout, entityGroups, maskedSenseIds,
  removeItemUndoable, renameEntity, restoreEntity, retireEntity, senseGroups,
  setEntityHint, setEntityPhoto, setEntityRole, setMask,
} from "../shared/groups.mjs";
import {
  clearImageOverride, imageOverrideFor, libraryImagesFor, setImageOverride,
} from "../shared/images.mjs";
import { clearOverride, overrideFor, setOverride } from "../shared/voice.mjs";
import { groupGlyph } from "./group-glyph.js";

const $ = (id) => document.getElementById(id);

/** Plain words for the six kinds (018 D7) — the chip and its menu. */
export const KINDS = [
  ["Yellow", "Person or thing"],
  ["Green", "Action"],
  ["Blue", "Describing word"],
  ["Pink", "Little word"],
  ["Purple", "Question word"],
  ["Red", "Safety word"],
];
const kindName = (role) => KINDS.find(([r]) => r === role)?.[1] ?? "Person or thing";

/** Supporter copy for the picture line (029 § 4.1) — one place. */
export function pictureLine({ phase, act, error, name, drawn } = {}) {
  if (phase === "finding") return "Finding a picture…";
  if (phase === "drawing") return "Drawing…";
  if (error === "offline" || error === "unavailable" || error === "fair_use") {
    return "We'll find a picture when you're back online.";
  }
  if (error === "allowance") return "No drawings left. Add a photo, or pick one of ours.";
  if (error === "unsafe") return "We can't draw that. Try other words, or add a photo.";
  if (error === "needs_description") return "Tell us what it should show first.";
  if (error) return "Couldn't make a picture. Try again, or add a photo.";
  if (drawn?.cache === "mint" && typeof drawn.left === "number") {
    return `Drawn for you · ${drawn.left} drawing${drawn.left === 1 ? "" : "s"} left`;
  }
  if (!act || act.kind === "apply" || act.kind === "draw") return "";
  if (act.personal) return `Add a photo of ${name}, or use one of ours.`;
  return act.others?.length ? "Pick one of ours, or draw one." : "Draw one, or add a photo.";
}

export function mountWordCard({
  db, locale, all, open, close, toast,
  metaFor, artInto, loadPhotoURL, savePhoto, syncUploadBlob, speakItem, xBadge,
  tile, pictures, pictureFill, creds,
  invalidateIndex, setView, rerenderView, renderStrip, renderGrid, flashCell,
  getCell, getGroupKey, setGroup, dropEntityPhoto, dropEntityRole, dropSenseMeta,
  openAddToBoards,
}) {
  let cardItem = null; // { item_kind, item_id, label } currently shown
  let justAdded = null; // { groupName } while the card is the add's step 2
  let playedOnce = false;
  let recorder = null;
  let recChunks = [];

  /* Picture memory per entity for this page's life: which picture WE
   * chose (so replacing it sends one `reject`, 030 § 6.3), the picture
   * showing now, and the alternatives — earlier pictures stay here so
   * switching back is free. */
  const sessions = new Map();
  const sess = (id) => {
    if (!sessions.has(id)) sessions.set(id, { ours: null, sent: false, current: null, others: [], state: {} });
    return sessions.get(id);
  };

  const isEnt = () => cardItem?.item_kind === "entity";
  const entityRow = () => all(db,
    "SELECT spoken_name, hint, photo_key, fitzgerald_role FROM personal_entity WHERE id = ?",
    [cardItem.item_id])[0] ?? null;

  /* ------------------------------ voice ------------------------------ */

  const possessive = (n) => (/voice/i.test(n ?? "") ? n : `${n ?? "Pip"}'s voice`);

  /** 028 — the voice line: making / ready / held …, with Try again where
   *  it heals. A new word plays once, by itself, the moment it's ready. */
  function updateVoiceUI() {
    const el = $("wc-voice");
    if (!el || !cardItem) return;
    const t = overrideTarget();
    const recorded = t && overrideFor(db, t.itemKind, t.itemId);
    const state = isEnt() ? tile?.status(cardItem.label) : null;
    if (recorded) el.textContent = "Your recording";
    else if (state && state !== "ready") el.textContent = tile?.message(state, cardItem.label) ?? "";
    else el.textContent = possessive(tile?.name?.());
    el.classList?.toggle("busy", state === "minting");
    $("wc-voicetry").hidden = !["failed", "offline", "unavailable"].includes(state);
    // 028 § 5.5 — "Sounds wrong" flags the shared clip; entity names only,
    // and only for a shared board voice.
    $("wc-flag").hidden = !(isEnt() && tile?.shared?.());
    syncMoreButton();
    if (justAdded && !playedOnce && isEnt() && (state === "ready" || recorded)) {
      playedOnce = true;
      speakItem({ kind: "entity", id: cardItem.item_id });
    }
  }
  tile?.onStatus?.(() => updateVoiceUI());
  $("wc-voicetry")?.addEventListener("click", () => {
    if (!isEnt()) return;
    tile?.ensure(cardItem.label, { source: "user_typed" }).catch(() => {});
    updateVoiceUI();
  });
  $("wc-flag")?.addEventListener("click", async () => {
    if (!isEnt()) return;
    closeMenu();
    const ok = await tile?.flag(cardItem.label);
    toast(ok ? "Flagged for review — it keeps playing meanwhile"
      : "Couldn't flag — try again when you're online");
  });

  /* ------------------------------- menu ------------------------------- */

  function syncMoreButton() {
    const any = ["wc-flag", "wc-hide", "wc-remove"].some((id) => !$(id).hidden);
    if ($("wc-more")) $("wc-more").hidden = !any;
  }
  const closeMenu = () => { if ($("wc-menu")) $("wc-menu").hidden = true; };
  $("wc-more")?.addEventListener("click", () => { $("wc-menu").hidden = !$("wc-menu").hidden; });

  /* ------------------------------ places ------------------------------ */

  function cardGroups() {
    return isEnt()
      ? entityGroups(db, cardItem.item_id, locale)
      : senseGroups(db, cardItem.item_id, locale);
  }

  function renderCardGroups() {
    const box = $("wc-groups");
    box.innerHTML = "";
    for (const g of cardGroups()) {
      const chip = document.createElement("span");
      chip.className = "wchip";
      const row = all(db, "SELECT id, kind, name, glyph, photo_key FROM board_group WHERE id = ?", [g.id])[0];
      if (row) chip.appendChild(groupGlyph(row, { db, locale, loadPhotoURL }));
      const nm = document.createElement("span");
      nm.textContent = g.name;
      chip.appendChild(nm);
      // 027 B9: remove from any page — this placement only; the word
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

  /* ------------------------------- kind ------------------------------- */

  function paintKind(role) {
    const chip = $("wc-kind");
    chip.className = `wc-kindchip r-${role}`;
    chip.textContent = kindName(role);
    $("wc-tile").className = `wc-tile r-${role}`;
  }
  $("wc-kind")?.addEventListener("click", () => {
    const menu = $("wc-kindmenu");
    if (!menu.hidden) { menu.hidden = true; return; }
    menu.innerHTML = "";
    for (const [role, label] of KINDS) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `wc-kindopt r-${role}`;
      b.setAttribute?.("role", "option");
      b.textContent = label;
      b.addEventListener("click", () => {
        menu.hidden = true;
        if (!isEnt()) return;
        setEntityRole(db, cardItem.item_id, role);
        dropEntityRole(cardItem.item_id);
        paintKind(role);
        rerenderView();
        renderStrip();
      });
      menu.appendChild(b);
    }
    menu.hidden = false;
  });

  /* ------------------------------ picture ----------------------------- */

  function paintTilePic(item, meta) {
    const pic = $("wc-pic");
    pic.className = "pic";
    pic.replaceChildren();
    const key = isEnt() ? entityRow()?.photo_key : null;
    if (isEnt() && key) {
      loadPhotoURL(key).then((url) => {
        if (!url || cardItem?.item_id !== item.item_id) return;
        const img = document.createElement("img");
        img.src = url;
        img.alt = "";
        pic.replaceChildren(img);
        pic.classList.add("photo");
      });
    } else if (!isEnt() && meta?.art) {
      const img = document.createElement("img");
      img.alt = "";
      if (artInto(img, meta.art)) pic.classList.add("photo");
      pic.appendChild(img);
    } else {
      pic.textContent = item.label[0]?.toUpperCase() ?? "";
    }
  }

  const thumbKey = (c) => c.image_id ?? `photo:${c.photoKey}`;

  /** A candidate's thumbnail: our static art, a gated image, or a photo.
   *  Returns false when there is nothing to show — the caller drops it
   *  (an empty square is not a choice). */
  async function thumbInto(img, c) {
    if (c.photoKey) {
      const url = await loadPhotoURL(c.photoKey);
      if (url) img.src = url;
      return !!url;
    }
    if (!c.asset) return false;
    if (!c.asset.startsWith("/api/")) {
      img.src = c.asset;
      return new Promise((r) => { img.onload = () => r(true); img.onerror = () => r(false); });
    }
    const { userId, license } = await creds();
    const blob = await pictures.imageBlob({ userId, license, asset: c.asset });
    if (blob) img.src = URL.createObjectURL(blob);
    return !!blob;
  }

  function paintPicSection() {
    if (!isEnt()) return;
    const s = sess(cardItem.item_id);
    const e = entityRow();
    // Once the word has a picture, only news is worth a line: drawing,
    // an error, or what a fresh drawing cost.
    const settled = e?.photo_key && !s.state.phase && !s.state.error
      && s.state.drawn?.cache !== "mint";
    const line = settled ? "" : pictureLine({ ...s.state, name: cardItem.label });
    $("wc-picstate").textContent = line;
    $("wc-picstate").hidden = !line;
    $("wc-pic").classList.toggle("drawing", s.state.phase === "drawing");

    const box = $("wc-others");
    box.replaceChildren();
    const shown = s.others.filter((c) => thumbKey(c) !== (s.current && thumbKey(s.current)));
    for (const c of shown.slice(0, 4)) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "wc-thumb";
      b.hidden = true; // shown once its picture loads
      b.setAttribute?.("aria-label", "Use this picture");
      const img = document.createElement("img");
      img.alt = "";
      thumbInto(img, c).then((ok) => {
        if (ok) { b.hidden = false; $("wc-otherslab").hidden = false; return; }
        s.others = s.others.filter((o) => o !== c); // unavailable — stop offering it
        b.remove?.();
      }).catch(() => b.remove?.());
      b.appendChild(img);
      b.addEventListener("click", () => choose(c));
      box.appendChild(b);
    }
    $("wc-otherslab").textContent = s.state.act?.personal && !e?.photo_key
      ? "Or use one of ours" : "Other pictures";
    $("wc-otherslab").hidden = true; // a thumb that loads reveals it
    // Photo leads for people and pets (029 § 4.1).
    $("wc-photolabel").classList.toggle("lead", !!s.state.act?.personal && !e?.photo_key);

    // Draw: a first drawing needs no words (common words); a redraw — or
    // any drawing of a person or pet — needs a description (030 § 5.2).
    const hasPic = !!e?.photo_key;
    const personal = !!s.state.act?.personal;
    const desc = $("wc-desc").value.trim();
    const needsWords = hasPic || personal;
    $("wc-redraw").textContent = hasPic ? "Draw it again" : "Draw it";
    $("wc-redraw").disabled = s.state.phase === "drawing" || (needsWords && !desc);
    $("wc-desclab").textContent = hasPic
      ? "Not right? Say what it should show"
      : personal ? "Or describe them and we'll draw it" : "Or describe it and we'll draw it";
    $("wc-desc").placeholder = personal ? "e.g. our golden retriever" : "e.g. a bowl, not a jar";
    const left = s.state.left;
    $("wc-drawcost").textContent = typeof left === "number"
      ? (left > 0 ? `A drawing uses 1 of your ${left} left.` : "No drawings left.")
      : "";
  }

  function afterEntityPic() {
    dropEntityPhoto(cardItem.item_id);
    paintTilePic(cardItem, null);
    paintPicSection();
    rerenderView();
    renderStrip();
  }

  /** The adult's own pick among the alternatives: free, counted as a
   *  pick, and — the first time they replace OUR choice — one reject. */
  async function choose(c) {
    const id = cardItem.item_id;
    const s = sess(id);
    const e = entityRow();
    const { userId, license } = await creds();
    if (c.photoKey) {
      setEntityPhoto(db, id, c.photoKey);
    } else {
      const blob = await pictures.imageBlob({ userId, license, asset: c.asset });
      if (!blob) { toast("Couldn't load that picture — try again when you're online"); return; }
      await pictureFill.applyBlob(id, blob, { force: true });
    }
    if (c.image_id) {
      pictures.pick({ userId, license, text: e.spoken_name, description: e.hint, imageId: c.image_id });
    }
    replaced(s, e, c.image_id ? { action: "pick", theirs: c.image_id } : null);
    remember(s, c);
    if (cardItem?.item_id === id) afterEntityPic();
  }

  /** Keep what was showing as an alternative; `c` becomes current. */
  function remember(s, c) {
    if (s.current && !s.others.some((o) => thumbKey(o) === thumbKey(s.current))) {
      s.others.unshift(s.current);
    }
    s.current = c;
  }

  /** 030 § 6.3 — replacing the picture WE chose sends one reject. */
  async function replaced(s, e, how) {
    if (!how || !s.ours || s.sent || s.current?.image_id !== s.ours) return;
    s.sent = true;
    const { userId, license } = await creds();
    pictures.reject({
      userId, license, text: e.spoken_name, description: e.hint,
      ours: s.ours, action: how.action, theirs: how.theirs ?? null,
    });
  }

  /** Run the finder for the open entity and paint as it goes. */
  async function fillPicture() {
    const id = cardItem.item_id;
    const s = sess(id);
    const paintIf = () => { if (cardItem?.item_id === id) paintPicSection(); };
    const r = await pictureFill.autoFill(id, {
      onState: (phase) => { s.state = { ...s.state, phase }; paintIf(); },
    }).catch(() => ({ error: "offline" }));
    const e = cardItem?.item_id === id ? entityRow() : null;
    s.state = { act: r.act, error: r.error, drawn: r.drawn, left: r.drawn?.left ?? r.left ?? s.state.left };
    if (r.found?.candidates) {
      for (const c of r.found.candidates) {
        if (!s.others.some((o) => thumbKey(o) === thumbKey(c))) s.others.push(c);
      }
    }
    if (r.applied) {
      s.ours = r.applied.imageId;
      s.current = r.found.candidates?.find((c) => c.image_id === r.applied.imageId)
        ?? { image_id: r.applied.imageId, asset: `/api/v1/pictures/img/${r.applied.imageId}` };
    } else if (e?.photo_key && !s.current) {
      s.current = { photoKey: e.photo_key };
    }
    if (cardItem?.item_id !== id) return;
    if (r.applied || r.found?.kind) {
      dropEntityRole(id);
      paintKind(entityRow()?.fitzgerald_role ?? "Yellow");
    }
    if (r.applied) afterEntityPic(); else paintPicSection();
    if (s.state.left == null) refreshAllowance(id);
  }

  async function refreshAllowance(id) {
    const { userId, license } = await creds();
    const a = await pictures.allowance({ userId, license });
    if (a && cardItem?.item_id === id) {
      sess(id).state.left = a.left;
      paintPicSection();
    }
  }

  $("wc-desc")?.addEventListener("input", () => paintPicSection());
  $("wc-desc")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !$("wc-redraw").disabled) $("wc-redraw").click();
  });

  /** Draw it / Draw it again — one image call, counted (030 § 6.1). The
   *  description is saved on the word: it steers this drawing and is
   *  the hint enrichment reads later. */
  $("wc-redraw")?.addEventListener("click", async () => {
    if (!isEnt()) return;
    const id = cardItem.item_id;
    const s = sess(id);
    const desc = $("wc-desc").value.trim();
    if (desc) setEntityHint(db, id, desc);
    const e = entityRow();
    s.state = { ...s.state, phase: "drawing", error: null, drawn: null };
    paintPicSection();
    const { userId, license } = await creds();
    const r = await pictures.draw({ userId, license, text: e.spoken_name, description: e.hint, locale });
    s.state = { ...s.state, phase: null, error: r.ok ? null : r.reason,
      drawn: r.ok ? { cache: r.cache, left: r.left } : null,
      left: typeof r.left === "number" ? r.left : s.state.left };
    if (r.ok) {
      await pictureFill.applyBlob(id, r.blob, { force: true });
      const c = { image_id: r.imageId, asset: `/api/v1/pictures/img/${r.imageId}` };
      replaced(s, e, { action: "draw", theirs: r.imageId });
      remember(s, c);
      $("wc-desc").value = "";
    }
    if (cardItem?.item_id === id) afterEntityPic();
  });

  /* ------------------------------- open ------------------------------- */

  /** On a wide screen the card lives docked in the editor's right pane;
   *  opened from the board (Make, a tile in Edit mode) that pane is not
   *  on screen, so the card rides the page as a normal sheet instead. */
  function dock() {
    const card = $("wordcard");
    const pane = $("ed-right");
    if (!card || !pane || typeof document.body?.classList?.contains !== "function") return;
    const host = document.body.classList.contains("editor") ? pane : document.body;
    if (card.parentElement !== host) host.prepend(card);
  }

  /** `opts.justAdded` = { groupName } when this is the add's step 2. */
  function openWordCard(item, opts = {}) {
    cardItem = { item_kind: item.item_kind, item_id: item.item_id, label: item.label };
    justAdded = opts.justAdded ?? null;
    playedOnce = false;
    const ent = isEnt();
    const meta = ent
      ? { role: entityRow()?.fitzgerald_role ?? "Yellow" }
      : metaFor(item.item_id);

    $("wc-added").hidden = !justAdded;
    $("wc-addedto").textContent = justAdded?.groupName ?? "";
    $("wc-role").textContent = justAdded ? "" : ent ? "Your word" : "Our word";
    closeMenu();
    $("wc-kindmenu").hidden = true;

    $("wc-name").value = item.label;
    $("wc-name").disabled = !ent; // a catalog word is renamed by a new copy, not here
    paintKind(meta.role ?? "Yellow");
    $("wc-kindlabel").hidden = !ent;

    $("wc-picsec").hidden = !ent;
    $("wc-catpics").hidden = ent;
    $("wc-photo").value = "";
    $("wc-desc").value = "";
    $("wc-ownpiclabel").hidden = ent;
    $("wc-ownpic").value = "";
    $("wc-remove").hidden = !ent;
    // Hide word: catalog words only — entities retire instead.
    if (ent) {
      $("wc-hide").hidden = true;
    } else {
      $("wc-hide").hidden = false;
      $("wc-hide").textContent = maskedSenseIds(db).has(item.item_id) ? "Show word" : "Hide word";
    }
    paintTilePic(item, meta);
    renderCardGroups();
    updateRecUI();
    updatePicUI();
    updateVoiceUI();
    dock();
    open("wordcard");
    if (ent) {
      paintPicSection();
      fillPicture();
    }
  }

  /* -------------------------- catalog pictures ------------------------- */

  function updatePicUI() {
    const ovr = !isEnt() && cardItem ? imageOverrideFor(db, cardItem.item_id) : null;
    $("wc-ourpic").hidden = !ovr;
    const pics = !isEnt() && cardItem ? libraryImagesFor(db, cardItem.item_id) : [];
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
    paintTilePic(cardItem, metaFor(cardItem.item_id));
    updatePicUI();
    renderGrid();
    renderStrip();
    rerenderView();
  }

  /* ---------------------------- recording ----------------------------- */

  /** What the card's recording binds to — an entity's id + spoken_name,
   *  or the locale lemma's utterance + spoken_text for a catalog word. */
  function overrideTarget() {
    if (!cardItem) return null;
    if (isEnt()) {
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
    $("wc-record").textContent = recorder?.state === "recording" ? "Stop recording" : "Record your own";
    const t = overrideTarget();
    $("wc-revert").hidden = !t || !overrideFor(db, t.itemKind, t.itemId);
  }

  /* ------------------------------ writes ------------------------------ */

  // The label wraps like a real tile; Return finishes the rename.
  $("wc-name").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault?.(); $("wc-name").blur?.(); }
  });
  $("wc-name").addEventListener("change", () => {
    if (!isEnt()) return;
    const name = $("wc-name").value.replace(/\s+/g, " ").trim();
    if (!name || name === cardItem.label) { $("wc-name").value = cardItem.label; return; }
    renameEntity(db, cardItem.item_id, name);
    // 028 § 5.2: a rename recomputes the clip key — the new name mints,
    // the old clip stays in the ledger untouched.
    tile?.ensure(name, { source: "user_typed" }).catch(() => {});
    cardItem.label = name;
    invalidateIndex(); // completions index the old spelling
    rerenderView();
    renderStrip();
    updateVoiceUI();
  });

  /** A photo: the adult's own picture — never sent anywhere; replacing
   *  our choice records only that a photo was used (030 § 6.3). */
  $("wc-photo").addEventListener("change", async () => {
    const file = $("wc-photo").files[0];
    $("wc-photo").value = "";
    if (!file || !isEnt()) return;
    const id = cardItem.item_id;
    const s = sess(id);
    const e = entityRow();
    const photo = await savePhoto(file);
    if (!photo) return;
    syncUploadBlob(photo.bytes).catch(() => {});
    setEntityPhoto(db, id, photo.key);
    replaced(s, e, { action: "photo" });
    remember(s, { photoKey: photo.key });
    s.state = { ...s.state, error: null };
    if (cardItem?.item_id === id) afterEntityPic();
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
        updateVoiceUI();
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
    updateVoiceUI();
    toast("Back to the app's voice");
  });

  /** 027 B9: add to other pages — named destinations, none preselected. */
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
    const homes = it.item_kind === "entity"
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

  /** Remove everywhere = retire (never delete). The row, photo, and
   *  placements stay; Undo restores it. */
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
