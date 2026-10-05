/**
 * The word card's Picture row — one row for every word. The current
 * picture and its alternatives are choices (the chosen one wears the
 * ring); 📷 Photo is the dashed tile at the end. Below it, one field
 * finds or describes a picture: Find shows our matches (free), and its
 * last tile is always "Draw" — a drawing steered by those words
 * (030 § 5.2: a different drawing needs a different description).
 *
 * A personal word's picture is saved onto the entity like a photo
 * (picture-fill.js); a built-in word's choice is a picture override
 * (images.mjs) — another library image by id, or bytes by blob key.
 */
import { setEntityHint, setEntityPhoto } from "../shared/groups.mjs";
import {
  clearImageOverride, imageOverrideFor, libraryImagesFor, setImageOverride,
} from "../shared/images.mjs";
import { DRAW_STAGE_LABELS } from "../shared/pictures.mjs";

const $ = (id) => document.getElementById(id);

/** Supporter copy for the picture line (029 § 4.1) — one place. */
export function pictureLine({ phase, act, error, name, drawn, step } = {}) {
  if (phase === "finding") return "Finding a picture…";
  if (phase === "drawing") return DRAW_STAGE_LABELS[step] ?? "Drawing…";
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

export function mountCardPictures({
  db, locale, all, toast, metaFor, artInto, loadPhotoURL, savePhoto, syncUploadBlob,
  pictures, pictureFill, creds, getItem, onRename, onKind,
  dropEntityPhoto, dropSenseMeta, renderGrid, renderStrip, rerenderView,
}) {
  /* Picture memory per word while the app is open: which picture WE
   * chose (so replacing it sends one `reject`, 030 § 6.3), the picture
   * showing now, the alternatives — earlier pictures stay so switching
   * back is free — and the last Find. */
  const sessions = new Map();
  const keyOf = (it) => `${it.item_kind}:${it.item_id}`;
  const sess = (it = getItem()) => {
    const k = keyOf(it);
    if (!sessions.has(k)) {
      sessions.set(k, { ours: null, sent: false, current: null, others: [], state: {}, suggestion: null, results: null });
    }
    return sessions.get(k);
  };
  const isEnt = () => getItem()?.item_kind === "entity";
  const still = (it) => getItem()?.item_id === it.item_id;
  const entityRow = (id = getItem().item_id) => all(db,
    "SELECT spoken_name, hint, photo_key FROM personal_entity WHERE id = ?", [id])[0] ?? null;
  const thumbKey = (c) => c.image_id ?? `photo:${c.photoKey}`;

  /* ------------------------------ the tile ----------------------------- */

  function paintTile(it = getItem()) {
    const pic = $("wc-pic");
    pic.className = "pic";
    pic.replaceChildren();
    const art = it.item_kind === "entity" ? entityRow(it.item_id)?.photo_key : metaFor(it.item_id)?.art;
    if (!art) { pic.textContent = it.label[0]?.toUpperCase() ?? ""; return; }
    const img = document.createElement("img");
    img.alt = "";
    pic.appendChild(img);
    if (art.startsWith("blob:")) pic.classList.add("photo");
    if (it.item_kind === "sense") { artInto(img, art); return; }
    loadPhotoURL(art).then((url) => { if (url && still(it)) img.src = url; });
  }

  /** A candidate's thumbnail: our static art, a gated image, or a photo.
   *  Resolves false when there is nothing to show — the caller drops it
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

  /** One choice tile; a thumbnail that fails to load removes itself. */
  function thumb(c, { sel = false, onPick, onGone } = {}) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `wc-opt wc-thumb${sel ? " sel" : ""}${c.photoKey ? " photo" : ""}`;
    b.setAttribute?.("aria-label", sel ? "Picture in use" : "Use this picture");
    b.setAttribute?.("aria-pressed", String(sel));
    const img = document.createElement("img");
    img.alt = "";
    b.appendChild(img);
    thumbInto(img, c).then((ok) => { if (!ok) { b.remove?.(); onGone?.(); } })
      .catch(() => { b.remove?.(); onGone?.(); });
    b.addEventListener("click", () => { if (!sel) onPick(c); });
    return b;
  }

  function addTile(label, glyph, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "wc-opt wc-thumb wc-add";
    const i = document.createElement("i");
    i.textContent = glyph;
    const t = document.createElement("span");
    t.textContent = label;
    b.append(i, t);
    b.addEventListener("click", onClick);
    return b;
  }

  /* ------------------------------ the row ------------------------------ */

  /** The picture in use, as a choice key. */
  function selectedKey(it, s) {
    if (it.item_kind === "entity") {
      const cur = s.current ?? (entityRow(it.item_id)?.photo_key ? { photoKey: entityRow(it.item_id).photo_key } : null);
      return cur ? thumbKey(cur) : null;
    }
    const ovr = imageOverrideFor(db, it.item_id);
    return ovr ? (ovr.image_id ?? `photo:${ovr.photo_key}`)
      : all(db, "SELECT default_image_id AS d FROM sense WHERE id = ?", [it.item_id])[0]?.d;
  }

  /** Built-in word: our pictures for this sense, then anything chosen
   *  this session; the one rendering now is selected. */
  function senseChoices(it, s) {
    const ovr = imageOverrideFor(db, it.item_id);
    const selId = selectedKey(it, s);
    const list = libraryImagesFor(db, it.item_id).map((p) => ({ image_id: p.id, asset: `/${p.key}`, ours: true }));
    if (ovr?.photo_key) list.push({ photoKey: ovr.photo_key });
    if (ovr?.image_id && !list.some((c) => c.image_id === ovr.image_id)) {
      const k = all(db, "SELECT key FROM image WHERE id = ?", [ovr.image_id])[0]?.key;
      if (k) list.push({ image_id: ovr.image_id, asset: `/${k}` });
    }
    for (const c of s.others) if (!list.some((o) => thumbKey(o) === thumbKey(c))) list.push(c);
    return list.map((c) => ({ c, sel: thumbKey(c) === selId }));
  }

  function paint() {
    const it = getItem();
    if (!it) return;
    const s = sess(it);
    const ent = isEnt();
    const e = ent ? entityRow() : null;
    const box = $("wc-pics");
    const photo = $("wc-photolabel");
    box.replaceChildren();

    let choices;
    if (ent) {
      const cur = s.current ?? (e?.photo_key ? { photoKey: e.photo_key } : null);
      const others = s.others.filter((c) => !cur || thumbKey(c) !== thumbKey(cur)).slice(0, 3);
      choices = [...(cur ? [{ c: cur, sel: true }] : []), ...others.map((c) => ({ c, sel: false }))];
    } else {
      choices = senseChoices(it, s);
    }
    for (const { c, sel } of choices) {
      box.appendChild(thumb(c, {
        sel,
        onPick: (x) => pick(x),
        onGone: () => { s.others = s.others.filter((o) => o !== c); },
      }));
    }
    // A first drawing of a common word needs no words (030 § 5.2).
    const personal = !!s.state.act?.personal;
    if (ent && !e?.photo_key && !personal && s.state.phase !== "drawing" && s.state.phase !== "finding") {
      box.appendChild(addTile("Draw it", "✏️", () => draw("")));
    }
    box.appendChild(photo);
    // Photo leads for people and pets (029 § 4.1).
    photo.classList.toggle("lead", ent && personal && !e?.photo_key);

    // Once the word has a picture, only news is worth a line.
    const settled = (!ent || e?.photo_key) && !s.state.phase && !s.state.error
      && s.state.drawn?.cache !== "mint";
    const line = settled ? "" : pictureLine({ ...s.state, act: ent ? s.state.act : null, name: it.label });
    $("wc-picstate").textContent = line;
    $("wc-pic").classList.toggle("drawing", s.state.phase === "drawing");

    // 030 § 4.2 — "bananna" isn't a word but "banana" is: offer the fix
    // instead of drawing a second banana, until the word has a picture.
    const sug = ent && s.suggestion && !e?.photo_key && !s.state.phase ? s.suggestion : null;
    $("wc-suggest").hidden = !sug;
    if (sug) $("wc-suggest").textContent = `Did you mean “${sug.text}”?`;

    $("wc-desc").placeholder = ent && personal ? "Describe them, e.g. our golden retriever" : "Find or describe a picture";
    $("wc-findgo").disabled = !$("wc-desc").value.trim() || s.state.phase === "drawing";
    paintResults(it, s);
  }

  /** The last Find: our matches, then the Draw tile for those words. */
  function paintResults(it, s) {
    const box = $("wc-results");
    box.replaceChildren();
    const r = s.results;
    box.hidden = !r;
    const left = s.state.left;
    $("wc-drawcost").textContent = s.state.phase === "drawing" && s.state.hint
      ? `Planned: “${s.state.hint}”`
      : r && typeof left === "number"
        ? (left > 0 ? `A drawing uses 1 of your ${left} left.` : "No drawings left.")
        : "";
    if (!r) return;
    // The picture already in use is not a find.
    const inUse = selectedKey(it, s);
    for (const c of r.candidates.filter((x) => thumbKey(x) !== inUse).slice(0, 6)) {
      box.appendChild(thumb(c, {
        onPick: (x) => pick(x),
        onGone: () => { r.candidates = r.candidates.filter((o) => o !== c); },
      }));
    }
    const d = addTile("Draw this", "✏️", () => draw(r.q));
    d.setAttribute?.("aria-label", `Draw “${r.q}”`);
    d.disabled = s.state.phase === "drawing" || left === 0;
    box.appendChild(d);
  }

  /* ------------------------------ choosing ----------------------------- */

  async function pick(c) {
    const it = getItem();
    if (it.item_kind === "entity") return chooseForEntity(it, c);
    const s = sess(it);
    const { userId, license } = await creds();
    let kept = c; // what the row offers from now on: the stored form
    // The photo in use stays a choice after switching away from it.
    const was = imageOverrideFor(db, it.item_id);
    if (was?.photo_key && !s.current) s.current = { photoKey: was.photo_key };
    if (c.ours && c.image_id === all(db, "SELECT default_image_id AS d FROM sense WHERE id = ?", [it.item_id])[0]?.d) {
      clearImageOverride(db, it.item_id);
    } else if (c.image_id && all(db,
      "SELECT 1 AS x FROM image WHERE id = ? AND sense_id = ? AND status = 'approved'", [c.image_id, it.item_id])[0]) {
      // One of this word's own pictures — by id. Another word's picture
      // goes in as bytes (an override image must belong to its sense).
      setImageOverride(db, { senseId: it.item_id, imageId: c.image_id });
    } else if (c.photoKey) {
      setImageOverride(db, { senseId: it.item_id, photoKey: c.photoKey });
    } else {
      const blob = await pictures.imageBlob({ userId, license, asset: c.asset });
      if (!blob) { toast("Couldn't load that picture — try again when you're online"); return; }
      const photo = await savePhoto(blob);
      if (!photo) return;
      syncUploadBlob(photo.bytes).catch(() => {});
      setImageOverride(db, { senseId: it.item_id, photoKey: photo.key });
      kept = { photoKey: photo.key };
    }
    if (c.image_id && !c.ours) pictures.pick({ userId, license, text: it.label, imageId: c.image_id });
    remember(s, kept);
    closeFind(it, s);
    afterSensePic(it);
  }

  /** The adult's own pick among the alternatives: free, counted as a
   *  pick, and — the first time they replace OUR choice — one reject. */
  async function chooseForEntity(it, c) {
    const id = it.item_id;
    const s = sess(it);
    const e = entityRow(id);
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
    closeFind(it, s);
    if (still(it)) afterEntityPic(it);
  }

  /** A choice made closes the Find — the pick now sits in the row. */
  function closeFind(it, s) {
    s.results = null;
    if (still(it)) $("wc-desc").value = "";
  }

  /** Keep what was showing as an alternative; `c` becomes current. */
  function remember(s, c) {
    if (s.current && !s.others.some((o) => thumbKey(o) === thumbKey(s.current))) {
      s.others.unshift(s.current);
    }
    if (!s.others.some((o) => thumbKey(o) === thumbKey(c))) s.others.push(c);
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

  function afterEntityPic(it) {
    dropEntityPhoto(it.item_id);
    paintTile(it);
    paint();
    rerenderView();
    renderStrip();
  }

  function afterSensePic(it) {
    dropSenseMeta(it.item_id);
    if (still(it)) { paintTile(it); paint(); }
    renderGrid();
    renderStrip();
    rerenderView();
  }

  /* ----------------------------- find / draw --------------------------- */

  async function find(q) {
    const it = getItem();
    const s = sess(it);
    s.results = { q, candidates: [] };
    s.state = { ...s.state, phase: "finding", error: null };
    paint();
    const { userId, license } = await creds();
    const r = await pictures.find({ userId, license, text: q, locale });
    s.state = { ...s.state, phase: null, error: r.error ?? null };
    if (!r.error) s.results = { q, candidates: Array.isArray(r.candidates) ? r.candidates : [] };
    if (still(it)) paint();
    if (s.state.left == null) refreshAllowance(it);
  }

  /** One image call, counted (030 § 6.1). On a personal word the words
   *  are saved as its hint — they steer this drawing and enrichment. */
  async function draw(desc) {
    const it = getItem();
    const s = sess(it);
    const ent = it.item_kind === "entity";
    if (ent && desc) setEntityHint(db, it.item_id, desc);
    const e = ent ? entityRow(it.item_id) : null;
    s.state = { ...s.state, phase: "drawing", step: null, hint: null, error: null, drawn: null };
    paint();
    const { userId, license } = await creds();
    const r = await pictures.draw({
      userId, license, text: ent ? e.spoken_name : it.label,
      description: ent ? e.hint : desc, locale,
      onStage: (stage, ev) => {
        const cur = sess(it).state;
        sess(it).state = { ...cur, phase: "drawing", step: stage, hint: ev?.hint ?? cur.hint ?? null };
        if (still(it)) paint();
      },
    });
    s.state = { ...s.state, phase: null, error: r.ok ? null : r.reason,
      drawn: r.ok ? { cache: r.cache, left: r.left } : null,
      left: typeof r.left === "number" ? r.left : s.state.left };
    if (!r.ok) { if (still(it)) paint(); return; }
    const c = { image_id: r.imageId, asset: `/api/v1/pictures/img/${r.imageId}` };
    if (ent) {
      await pictureFill.applyBlob(it.item_id, r.blob, { force: true });
      replaced(s, e, { action: "draw", theirs: r.imageId });
      remember(s, c);
    } else {
      const photo = await savePhoto(r.blob);
      if (!photo) return;
      syncUploadBlob(photo.bytes).catch(() => {});
      setImageOverride(db, { senseId: it.item_id, photoKey: photo.key });
      remember(s, { photoKey: photo.key });
    }
    closeFind(it, s);
    if (ent) { if (still(it)) afterEntityPic(it); } else afterSensePic(it);
  }

  async function refreshAllowance(it) {
    const { userId, license } = await creds();
    const a = await pictures.allowance({ userId, license });
    if (a) {
      sess(it).state.left = a.left;
      if (still(it)) paint();
    }
  }

  /** Run the finder for a newly opened personal word and paint as it goes. */
  async function fillEntity(it) {
    const id = it.item_id;
    const s = sess(it);
    const r = await pictureFill.autoFill(id, {
      onState: (phase, detail) => {
        s.state = {
          ...s.state, phase,
          ...(phase === "finding" ? { step: null, hint: null } : {}),
          ...(detail ?? {}),
        };
        if (still(it)) paint();
      },
    }).catch(() => ({ error: "offline" }));
    const e = still(it) ? entityRow(id) : null;
    s.state = { act: r.act, error: r.error, drawn: r.drawn, left: r.drawn?.left ?? r.left ?? s.state.left };
    s.suggestion = r.act?.suggestion ?? null;
    for (const c of r.found?.candidates ?? []) {
      if (!s.others.some((o) => thumbKey(o) === thumbKey(c))) s.others.push(c);
    }
    if (r.applied) {
      s.ours = r.applied.imageId;
      s.current = r.found.candidates?.find((c) => c.image_id === r.applied.imageId)
        ?? { image_id: r.applied.imageId, asset: `/api/v1/pictures/img/${r.applied.imageId}` };
    } else if (e?.photo_key && !s.current) {
      s.current = { photoKey: e.photo_key };
    }
    if (!still(it)) return;
    if (r.applied || r.found?.kind) onKind?.();
    if (r.applied) afterEntityPic(it); else paint();
    if (s.state.left == null) refreshAllowance(it);
  }

  /* ------------------------------ wiring ------------------------------- */

  $("wc-desc").addEventListener("input", () => {
    $("wc-findgo").disabled = !$("wc-desc").value.trim() || sess().state.phase === "drawing";
  });
  $("wc-find").addEventListener("submit", (ev) => {
    ev.preventDefault?.();
    const q = $("wc-desc").value.replace(/\s+/g, " ").trim();
    if (q && getItem()) find(q);
  });

  /** A photo: the adult's own picture — never sent anywhere; replacing
   *  our choice records only that a photo was used (030 § 6.3). */
  $("wc-photo").addEventListener("change", async () => {
    const file = $("wc-photo").files[0];
    $("wc-photo").value = "";
    const it = getItem();
    if (!file || !it) return;
    const s = sess(it);
    const photo = await savePhoto(file);
    if (!photo) return;
    syncUploadBlob(photo.bytes).catch(() => {});
    if (it.item_kind === "entity") {
      const e = entityRow(it.item_id);
      setEntityPhoto(db, it.item_id, photo.key);
      replaced(s, e, { action: "photo" });
      remember(s, { photoKey: photo.key });
      s.state = { ...s.state, error: null };
      if (still(it)) afterEntityPic(it);
      return;
    }
    setImageOverride(db, { senseId: it.item_id, photoKey: photo.key });
    remember(s, { photoKey: photo.key });
    afterSensePic(it);
  });

  /** 030 § 4.2 — accepting "Did you mean banana?" fixes the word itself,
   *  then applies that word's picture. Ignoring costs nothing. */
  $("wc-suggest").addEventListener("click", async () => {
    const it = getItem();
    if (it?.item_kind !== "entity") return;
    const s = sess(it);
    const sug = s.suggestion;
    if (!sug) return;
    s.suggestion = null;
    if (sug.text && sug.text !== it.label) onRename(sug.text);
    await chooseForEntity(it, sug);
  });

  /** A fresh card: the Find field empties; a personal word runs the finder. */
  function open(it) {
    $("wc-desc").value = "";
    $("wc-photo").value = "";
    sess(it).results = null;
    paintTile(it);
    paint();
    if (it.item_kind === "entity") fillEntity(it);
  }

  return { open, paint, paintTile };
}
