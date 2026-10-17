/**
 * Pictures and pasted lists on the iPad (phase 044 slice E6): find a
 * picture by meaning (PP-1), pick or reject one (PP-2), "Draw it for me"
 * (PP-3), several photos as new words (PP-5), pictures for pasted words
 * (PP-6) and a pasted list of words (LW-5). Exported from core_entry.mjs
 * as PIPCORE.pics.
 *
 * This runs the web's own modules unchanged: public/shared/pictures.mjs
 * (pictureClient - find, find-batch, draw, pick, reject, allowance, image
 * bytes; pictureAction; the allowance rule), public/board/picture-fill.js
 * (autoFill / applyBlob / inferKind), shared/bulk.mjs (resolvePasteRows /
 * applyPasteRows / applyPhotoDrafts) and the words of
 * public/board/word-card-pictures.js (pictureLine). What this file adds is
 * the closures those UI files keep around them, mirrored with their line
 * ranges so a reader can diff them:
 *   word-card-pictures.js  sess 54-62, paint 129-190, pick 224-268,
 *                          chooseForEntity 273-295, replaced 316-325,
 *                          find 343-354, draw 359-391, refreshAllowance
 *                          393-399, fillEntity 402-426, suggest 464-479
 *   add-flow.js            queueFinds 215-240, rowPicture 244-249,
 *                          paintBulk 285-361, bulk-add click 465-497,
 *                          fillPastedPictures 504-523, photo-save 543-576
 *
 * Writes go through the shared owners the web calls (setEntityPhoto,
 * setEntityHint, setImageOverride, createEntity + placeItem inside
 * applyPasteRows / applyPhotoDrafts), so the table change and its sync
 * op land together. Picture bytes never reach Swift as bytes: the core
 * fetches them through the Worker, stores them in the blob store under
 * `blob:<sha256>` (the web's savePhoto format) and Swift shows the key.
 *
 * A JSC caller cannot await a Promise, so anything that talks to the
 * Worker answers at once with the state so far and leaves the outcome as
 * ONE host event, "pic":
 *   { appId, kind, id, row?, paint?, bulk?, toast? }
 * `row` is the card's Picture section, `bulk` the paste form, `paint` the
 * repainted board (so a tile wears its new picture), `toast` an edit
 * toast.
 *
 * Gating is the Worker's: every call carries the person's license
 * (Keychain `user/<id>/license`); the client says "unavailable" with none
 * and the Worker says 403 / 402 / 422 / 429. The words shown for each are
 * the web's pictureLine, verbatim.
 */
import {
  clearImageOverride, imageOverrideFor, libraryImagesFor, setImageOverride,
} from "../../public/shared/images.mjs";
import { setEntityHint, setEntityPhoto } from "../../public/shared/groups.mjs";
import { pictureLine } from "../../public/board/word-card-pictures.js";
import { appSession } from "./app.mjs";
import {
  PIP, X, boardPaint, creds, emit, forget, one, savePhoto, wantThumbs,
} from "./app_pictures_shared.mjs";

export { identify, testSeedLicense } from "./app_pictures_shared.mjs";
export {
  bulkAdd, bulkCycle, bulkState, photoDrafts, photosSave,
} from "./app_pictures_bulk.mjs";

/* ---------------- the card's Picture section ---------------- */

const thumbKey = (c) => c.image_id ?? `photo:${c.photoKey}`;

function labelOf(s, kind, id) {
  if (kind === "entity") {
    return one(s.d, "SELECT spoken_name AS t FROM personal_entity WHERE id = ?", [id])?.t ?? "";
  }
  return one(s.d,
    `SELECT l.text AS t FROM label l WHERE l.sense_id = ? AND l.kind = 'lemma'
     AND l.status = 'approved' AND l.locale = ?`, [id, s.locale])?.t ?? "";
}

const entityRow = (s, id) => one(s.d,
  "SELECT spoken_name, hint, photo_key, fitzgerald_role FROM personal_entity WHERE id = ?", [id]) ?? null;

/** word-card-pictures.js 54-62. */
function sess(x, kind, id) {
  const k = `${kind}:${id}`;
  if (!x.cards.has(k)) {
    x.cards.set(k, { ours: null, sent: false, current: null, others: [], state: {},
      suggestion: null, results: null });
  }
  return x.cards.get(k);
}

/** word-card-pictures.js 112-123 selectedKey. */
function selectedKey(s, kind, id, ss) {
  if (kind === "entity") {
    const e = entityRow(s, id);
    const cur = ss.current ?? (e?.photo_key ? { photoKey: e.photo_key } : null);
    return cur ? thumbKey(cur) : null;
  }
  const ovr = imageOverrideFor(s.d, id);
  return ovr ? (ovr.image_id ?? `photo:${ovr.photo_key}`)
    : one(s.d, "SELECT default_image_id AS d FROM sense WHERE id = ?", [id])?.d;
}

/** word-card-pictures.js 125-137 senseChoices. */
function senseChoices(s, id, ss) {
  const ovr = imageOverrideFor(s.d, id);
  const selId = selectedKey(s, "sense", id, ss);
  const list = libraryImagesFor(s.d, id).map((p) => ({ image_id: p.id, asset: `/${p.key}`, ours: true }));
  if (ovr?.photo_key) list.push({ photoKey: ovr.photo_key });
  if (ovr?.image_id && !list.some((c) => c.image_id === ovr.image_id)) {
    const k = one(s.d, "SELECT key FROM image WHERE id = ?", [ovr.image_id])?.key;
    if (k) list.push({ image_id: ovr.image_id, asset: `/${k}` });
  }
  for (const c of ss.others) if (!list.some((o) => thumbKey(o) === thumbKey(c))) list.push(c);
  return list.map((c) => ({ c, sel: thumbKey(c) === selId }));
}

/** A candidate as Swift draws it: the family's blob, our bundled art, or
 *  the bytes the core already fetched (null while they are coming). A
 *  thumbnail that fails to load drops out (word-card-pictures.js 91-103). */
function choiceModel(x, { c, sel }) {
  if (c.asset && x.goneAssets.has(c.asset)) return null;
  const photoKey = c.photoKey ?? (c.ours ? null : x.thumbs.get(c.asset) ?? null);
  const art = c.ours ? String(c.asset).replace(/^\//, "") : null;
  return {
    id: thumbKey(c), selected: sel,
    label: sel ? "Picture in use" : "Use this picture",
    art, photoKey, loading: !photoKey && !art,
  };
}

/** word-card-pictures.js paint() 129-190 + paintResults 193-218, as one
 *  render model. */
function rowFor(x, kind, id) {
  const s = appSession(x.appId);
  const ss = sess(x, kind, id);
  const ent = kind === "entity";
  const e = ent ? entityRow(s, id) : null;
  const label = labelOf(s, kind, id);
  const cands = [];
  let choices;
  if (ent) {
    const cur = ss.current ?? (e?.photo_key ? { photoKey: e.photo_key } : null);
    const others = ss.others.filter((c) => !cur || thumbKey(c) !== thumbKey(cur)).slice(0, 3);
    choices = [...(cur ? [{ c: cur, sel: true }] : []), ...others.map((c) => ({ c, sel: false }))];
  } else {
    choices = senseChoices(s, id, ss);
  }
  for (const ch of choices) cands.push(ch.c);
  const personal = !!ss.state.act?.personal;
  const busy = ss.state.phase === "drawing" || ss.state.phase === "finding";
  const settled = (!ent || e?.photo_key) && !ss.state.phase && !ss.state.error
    && ss.state.drawn?.cache !== "mint";
  const line = settled ? "" : pictureLine({ ...ss.state, act: ent ? ss.state.act : null, name: label });
  const sug = ent && ss.suggestion && !e?.photo_key && !ss.state.phase ? ss.suggestion : null;
  const left = ss.state.left;
  let results = null;
  if (ss.results) {
    const inUse = selectedKey(s, kind, id, ss);
    const shown = ss.results.candidates.filter((c) => thumbKey(c) !== inUse).slice(0, 6);
    for (const c of shown) cands.push(c);
    results = {
      q: ss.results.q,
      choices: shown.map((c) => choiceModel(x, { c, sel: false })).filter(Boolean),
      drawLabel: `Draw “${ss.results.q}”`,
      drawDisabled: ss.state.phase === "drawing" || left === 0,
    };
  }
  wantThumbs(x, cands, () => emit({ appId: x.appId, kind, id, row: rowFor(x, kind, id) }));
  return {
    kind, id, name: label,
    choices: choices.map(choiceModel.bind(null, x)).filter(Boolean),
    // A first drawing of a common word needs no words (030 § 5.2).
    drawIt: ent && !e?.photo_key && !personal && !busy,
    line,
    drawing: ss.state.phase === "drawing",
    finding: ss.state.phase === "finding",
    suggestion: sug ? `Did you mean “${sug.text}”?` : null,
    placeholder: ent && personal ? "Describe them, e.g. our golden retriever"
      : "Find or describe a picture",
    photoLead: ent && personal && !e?.photo_key,
    drawcost: ss.state.phase === "drawing" && ss.state.hint ? `Planned: “${ss.state.hint}”`
      : results && typeof left === "number"
        ? (left > 0 ? `A drawing uses 1 of your ${left} left.` : "No drawings left.")
        : "",
    results,
  };
}

const repaintRow = (x, kind, id) => emit({ appId: x.appId, kind, id, row: rowFor(x, kind, id) });
/** A picture or the kind changed: the row, the tile and the card. */
function repaintAll(x, kind, id) {
  const s = appSession(x.appId);
  forget(s, kind, id);
  emit({ appId: x.appId, kind, id, row: rowFor(x, kind, id), paint: boardPaint(x, kind, id) });
}

/** word-card-pictures.js open() 482-488: a fresh card. A personal word
 *  runs the finder. -> the row so far. */
export function cardOpen(appId, { kind, id }) {
  const s = appSession(appId);
  const x = X(s);
  sess(x, kind, id).results = null;
  if (kind === "entity") void fillEntity(x, kind, id);
  return rowFor(x, kind, id);
}

/** The row now (a plain read). */
export function cardRow(appId, { kind, id }) {
  return rowFor(X(appSession(appId)), kind, id);
}

/* ---------------- choosing ---------------- */

/** The candidate a thumbnail id names: the row's own, the last Find's. */
function candidateOf(x, s, kind, id, choice) {
  const ss = sess(x, kind, id);
  const pool = [
    ...(ss.current ? [ss.current] : []), ...ss.others, ...(ss.results?.candidates ?? []),
    ...(kind === "sense" ? senseChoices(s, id, ss).map((r) => r.c) : []),
  ];
  return pool.find((c) => thumbKey(c) === choice) ?? null;
}

/** word-card-pictures.js remember 298-304. */
function remember(ss, c) {
  if (ss.current && !ss.others.some((o) => thumbKey(o) === thumbKey(ss.current))) {
    ss.others.unshift(ss.current);
  }
  if (!ss.others.some((o) => thumbKey(o) === thumbKey(c))) ss.others.push(c);
  ss.current = c;
}

const closeFind = (ss) => { ss.results = null; };

/** 030 § 6.3 - replacing the picture WE chose sends one reject
 *  (word-card-pictures.js 316-325). */
async function replaced(x, ss, e, how) {
  if (!how || !ss.ours || ss.sent || ss.current?.image_id !== ss.ours) return;
  ss.sent = true;
  const { userId, license } = await creds(x);
  await x.client.reject({
    userId, license, text: e.spoken_name, description: e.hint,
    ours: ss.ours, action: how.action, theirs: how.theirs ?? null,
  });
}

const CANT_LOAD = "Couldn't load that picture — try again when you're online";

/** The adult taps a picture (PP-2): `choice` is a thumbnail id from the
 *  row. Answers at once; the result leaves as "pic" events. */
export function pick(appId, { kind, id, choice }) {
  const s = appSession(appId);
  const x = X(s);
  const c = candidateOf(x, s, kind, id, choice);
  if (!c) return rowFor(x, kind, id);
  void (kind === "entity" ? chooseForEntity(x, s, id, c) : pickSense(x, s, id, c))
    .catch((e) => console.error(`pics.pick: ${e}`));
  return rowFor(x, kind, id);
}

/** word-card-pictures.js pick() 224-268 (built-in word). */
async function pickSense(x, s, id, c) {
  const ss = sess(x, "sense", id);
  const { userId, license } = await creds(x);
  let kept = c; // what the row offers from now on: the stored form
  const was = imageOverrideFor(s.d, id);
  if (was?.photo_key && !ss.current) ss.current = { photoKey: was.photo_key };
  if (c.ours && c.image_id === one(s.d, "SELECT default_image_id AS d FROM sense WHERE id = ?", [id])?.d) {
    clearImageOverride(s.d, id);
  } else if (c.image_id && one(s.d,
    "SELECT 1 AS x FROM image WHERE id = ? AND sense_id = ? AND status = 'approved'", [c.image_id, id])) {
    // One of this word's own pictures - by id. Another word's picture
    // goes in as bytes (an override image must belong to its sense).
    setImageOverride(s.d, { senseId: id, imageId: c.image_id });
  } else if (c.photoKey) {
    setImageOverride(s.d, { senseId: id, photoKey: c.photoKey });
  } else {
    const blob = await x.client.imageBlob({ userId, license, asset: c.asset });
    if (!blob) { emit({ appId: x.appId, toast: CANT_LOAD }); return; }
    const photo = await savePhoto(blob);
    setImageOverride(s.d, { senseId: id, photoKey: photo.key });
    kept = { photoKey: photo.key };
  }
  if (c.image_id && !c.ours) {
    void x.client.pick({ userId, license, text: labelOf(s, "sense", id), imageId: c.image_id });
  }
  remember(ss, kept);
  closeFind(ss);
  repaintAll(x, "sense", id);
}

/** word-card-pictures.js chooseForEntity() 273-295. */
async function chooseForEntity(x, s, id, c) {
  const ss = sess(x, "entity", id);
  const e = entityRow(s, id);
  const { userId, license } = await creds(x);
  if (c.photoKey) {
    setEntityPhoto(s.d, id, c.photoKey);
  } else {
    const blob = await x.client.imageBlob({ userId, license, asset: c.asset });
    if (!blob) { emit({ appId: x.appId, toast: CANT_LOAD }); return; }
    await x.fill.applyBlob(id, blob, { force: true });
  }
  if (c.image_id) {
    void x.client.pick({ userId, license, text: e.spoken_name, description: e.hint, imageId: c.image_id });
  }
  void replaced(x, ss, e, c.image_id ? { action: "pick", theirs: c.image_id } : null);
  remember(ss, c);
  closeFind(ss);
  repaintAll(x, "entity", id);
}

/** A photo the adult chose for the word (E3's cardSetPhoto calls this):
 *  replacing our choice records only that a photo was used (030 § 6.3;
 *  word-card-pictures.js 447-475). */
export function afterPhoto(appId, { kind, id, key }) {
  const s = appSession(appId);
  const x = X(s);
  const ss = sess(x, kind, id);
  if (kind === "entity") {
    const e = entityRow(s, id);
    void replaced(x, ss, e, { action: "photo" });
    ss.state = { ...ss.state, error: null };
  }
  remember(ss, { photoKey: key });
  repaintRow(x, kind, id);
  return rowFor(x, kind, id);
}

/** 030 § 4.2 - accepting "Did you mean banana?" fixes the word itself,
 *  then applies that word's picture (word-card-pictures.js 481-494).
 *  Swift renames through edit.cardRename and passes the word here. */
export function suggestion(appId, { id }) {
  const s = appSession(appId);
  const x = X(s);
  const ss = sess(x, "entity", id);
  const sug = ss.suggestion;
  if (!sug) return { text: null };
  ss.suggestion = null;
  void chooseForEntity(x, s, id, sug).catch((e) => console.error(`pics.suggestion: ${e}`));
  return { text: sug.text ?? null, current: labelOf(s, "entity", id) };
}

/* ---------------- find / draw ---------------- */

/** PP-1: the Find field (word-card-pictures.js find() 343-354). */
export function find(appId, { kind, id, q }) {
  const s = appSession(appId);
  const x = X(s);
  const text = String(q ?? "").replace(/\s+/g, " ").trim();
  if (!text) return rowFor(x, kind, id);
  const ss = sess(x, kind, id);
  ss.results = { q: text, candidates: [] };
  ss.state = { ...ss.state, phase: "finding", error: null };
  void (async () => {
    const { userId, license } = await creds(x);
    const r = await x.client.find({ userId, license, text, locale: s.locale });
    ss.state = { ...ss.state, phase: null, error: r.error ?? null };
    if (!r.error) ss.results = { q: text, candidates: Array.isArray(r.candidates) ? r.candidates : [] };
    repaintRow(x, kind, id);
    if (ss.state.left == null) void refreshAllowance(x, kind, id);
  })().catch((e) => console.error(`pics.find: ${e}`));
  return rowFor(x, kind, id);
}

/** PP-3: Draw it for me (word-card-pictures.js draw() 359-391). One
 *  image call, counted (030 § 6.1). On a personal word the words are
 *  saved as its hint. The stream is read live (jsc_shims streamFetch), so
 *  the line follows the pipeline's stages as the Worker reports them. */
export function draw(appId, { kind, id, desc = "" }) {
  const s = appSession(appId);
  const x = X(s);
  const ss = sess(x, kind, id);
  const ent = kind === "entity";
  if (ent && desc) setEntityHint(s.d, id, desc);
  const e = ent ? entityRow(s, id) : null;
  ss.state = { ...ss.state, phase: "drawing", step: null, hint: null, error: null, drawn: null };
  void (async () => {
    const { userId, license } = await creds(x);
    const r = await x.client.draw({
      userId, license, text: ent ? e.spoken_name : labelOf(s, kind, id),
      description: ent ? e.hint : desc, locale: s.locale,
      onStage: (stage, ev) => {
        ss.state = { ...ss.state, phase: "drawing", step: stage, hint: ev?.hint ?? ss.state.hint ?? null };
        repaintRow(x, kind, id); // each stage shows as it arrives (word-card-pictures.js draw())
      },
    });
    ss.state = { ...ss.state, phase: null, error: r.ok ? null : r.reason,
      drawn: r.ok ? { cache: r.cache, left: r.left } : null,
      left: typeof r.left === "number" ? r.left : ss.state.left };
    if (!r.ok) { repaintRow(x, kind, id); return; }
    const c = { image_id: r.imageId, asset: `/api/v1/pictures/img/${r.imageId}` };
    if (ent) {
      await x.fill.applyBlob(id, r.blob, { force: true });
      void replaced(x, ss, e, { action: "draw", theirs: r.imageId });
      remember(ss, c);
    } else {
      const photo = await savePhoto(r.blob);
      setImageOverride(s.d, { senseId: id, photoKey: photo.key });
      remember(ss, { photoKey: photo.key });
    }
    closeFind(ss);
    repaintAll(x, kind, id);
  })().catch((e2) => {
    ss.state = { ...ss.state, phase: null, error: "unavailable" };
    repaintRow(x, kind, id);
    console.error(`pics.draw: ${e2}`);
  });
  return rowFor(x, kind, id);
}

/** word-card-pictures.js refreshAllowance() 393-399. */
async function refreshAllowance(x, kind, id) {
  const { userId, license } = await creds(x);
  const a = await x.client.allowance({ userId, license });
  if (a) { sess(x, kind, id).state.left = a.left; repaintRow(x, kind, id); }
}

/** word-card-pictures.js fillEntity() 402-426: the finder for a newly
 *  opened personal word, painting as it goes. */
async function fillEntity(x, kind, id) {
  const s = appSession(x.appId);
  const ss = sess(x, kind, id);
  const r = await x.fill.autoFill(id, {
    onState: (phase, detail) => {
      ss.state = {
        ...ss.state, phase,
        ...(phase === "finding" ? { step: null, hint: null } : {}),
        ...(detail ?? {}),
      };
      repaintRow(x, kind, id);
    },
  }).catch(() => ({ error: "offline" }));
  const e = entityRow(s, id);
  ss.state = { act: r.act, error: r.error, drawn: r.drawn, left: r.drawn?.left ?? r.left ?? ss.state.left };
  ss.suggestion = r.act?.suggestion ?? null;
  for (const c of r.found?.candidates ?? []) {
    if (!ss.others.some((o) => thumbKey(o) === thumbKey(c))) ss.others.push(c);
  }
  if (r.applied) {
    ss.ours = r.applied.imageId;
    ss.current = r.found.candidates?.find((c) => c.image_id === r.applied.imageId)
      ?? { image_id: r.applied.imageId, asset: `/api/v1/pictures/img/${r.applied.imageId}` };
  } else if (e?.photo_key && !ss.current) {
    ss.current = { photoKey: e.photo_key };
  }
  if (r.applied || r.found?.kind) repaintAll(x, kind, id); else repaintRow(x, kind, id);
  if (ss.state.left == null) void refreshAllowance(x, kind, id);
}
