/**
 * A pasted list of words, pictures for them, and several photos as new
 * words (044 E6; LW-5, PP-6, PP-5) - the add-flow.js closures, mirrored.
 * Exported with the rest of PIPCORE.pics from app_pictures.mjs; the
 * plumbing is app_pictures_shared.mjs.
 */
import { SENSE_ART_SQL } from "../../public/shared/images.mjs";
import { OWN_WORDS_FREE, liveOwnWords } from "../../public/shared/groups.mjs";
import {
  applyPasteRows, applyPhotoDrafts, resolvePasteRows,
} from "../../public/shared/bulk.mjs";
import { normalizeV1 } from "../../public/shared/normalize.mjs";
import { needsDraw, pictureAction, shouldConfirmDraws } from "../../public/shared/pictures.mjs";
import { appSession } from "./app.mjs";
import { tilePrefetch } from "./app_say.mjs";
import { possessiveVoice } from "../../public/shared/voice_tile.mjs";
import {
  BLOB_KEY, PIP, X, boardPaint, creds, emit, one, wantThumbs,
} from "./app_pictures_shared.mjs";

/* ---------------- a pasted list (LW-5) ---------------- */

const OVER_LIMIT_TOAST = `That's your ${OWN_WORDS_FREE} free words — Pip Lifetime adds unlimited.`;

/** add-flow.js ownLeft 41-42. iOS has the licence flag on the session
 *  (app_purchase.mjs); false is the web's default. */
const ownLeft = (s) => (s.licensed ? Infinity : Math.max(0, OWN_WORDS_FREE - liveOwnWords(s.d)));
const groupNameOf = (s, id, fallback = "") => {
  const row = one(s.d, "SELECT id, name FROM board_group WHERE id = ?", [id]);
  return row ? PIP().groups.groupDisplayName(s.d, row, s.locale) : fallback;
};
const seedCategory = (s, groupId) => s.catalog.groups?.find((g) => g.id === groupId)?.category ?? null;

/** 028 § 5.3: the new words' voices are made one at a time after the rows
 *  land (add-flow.js bulk-add / photo-save). A paste's progress rides after
 *  its "Added N" line (`added`); the photo save shows none, as on the web. */
function prefetchVoices(s, texts, added = null) {
  if (!texts.length) return;
  const voice = possessiveVoice(PIP().voices.voiceName(s.d, s.voiceId));
  tilePrefetch(s, texts, added == null ? () => {} : (p) => emit({
    appId: s.appId, toast: `${added} · Making ${voice}, ${p.done + p.failed} of ${texts.length}`,
  }));
}

/** add-flow.js rowPicture 244-249: the adult's cycled pick, else the
 *  server's auto, else nothing (drawn or chosen later). */
function rowPicture(f) {
  if (!f || f === "pending") return null;
  if (f.pickIx != null) return f.candidates[f.pickIx] ?? null;
  return pictureAction(f).kind === "apply" ? pictureAction(f).picture : null;
}
const rowDraws = (f) => !!f && f !== "pending" && f.pickIx == null && needsDraw(f);

/** add-flow.js openBulkForm 205-212 + paintBulk 255-361: the whole
 *  form for the pasted text. Pure; the finds it shows are in x.finds. */
function bulkModel(x, s, groupId, text) {
  const rows = resolvePasteRows(s.d, text, { groupId, locale: s.locale });
  let draws = 0;
  let newSeen = 0;
  const slots = ownLeft(s);
  for (const r of rows) r.overCap = r.kind === "new" && !r.already && newSeen++ >= slots;
  const out = [];
  const cands = [];
  for (const r of rows) {
    const f = r.kind === "new" ? x.finds.get(normalizeV1(r.text)) : null;
    let thumb;
    if (r.kind === "sense") {
      thumb = { art: one(s.d, `SELECT ${SENSE_ART_SQL} AS art FROM sense s WHERE s.id = ?`, [r.id])?.art ?? null };
    } else if (r.kind === "entity") {
      thumb = { letter: r.label[0]?.toUpperCase() ?? "" };
    } else {
      const pic = rowPicture(f);
      if (pic?.asset) {
        cands.push(pic);
        thumb = { photoKey: x.thumbs.get(pic.asset) ?? null, letter: r.text[0]?.toUpperCase() ?? "" };
      } else {
        thumb = { letter: r.text[0]?.toUpperCase() ?? "" };
      }
      if (rowDraws(f) && !r.already) draws++;
    }
    out.push({
      key: normalizeV1(r.text), label: r.label, kind: r.kind, already: !!r.already,
      overCap: !!r.overCap, thumb,
      // "Tap for another picture"
      cycles: r.kind === "new" && !!f && f !== "pending" && !!f.candidates?.length,
      tag: r.overCap ? "over the limit"
        : r.already ? "already"
        : r.kind !== "new" ? "ours"
        : f === "pending" ? "finding…"
        : rowDraws(f) ? "will draw"
        : rowPicture(f) ? "new" : "new — picture later",
    });
  }
  wantThumbs(x, cands, () => emitBulk(x));
  const pending = rows.filter((r) => !r.already && !r.overCap).length;
  const over = rows.filter((r) => r.overCap).length;
  const name = groupNameOf(s, groupId, "My Words");
  const left = x.bulkLeft;
  const ask = draws > 0 && shouldConfirmDraws(draws, left);
  const cost = draws ? ` · draws ${draws} new picture${draws === 1 ? "" : "s"}` : "";
  const gname = groupNameOf(s, groupId);
  return {
    rows, pending, over, ask, draws, slots,
    model: {
      groupId,
      title: gname ? `Add a list to ${gname}` : "Add a list",
      placeholder: "One word or short phrase per line",
      rows: out,
      addDisabled: pending === 0 && over === 0,
      addLabel: !pending && over ? "See Pip Lifetime"
        : !pending ? "Add all"
        : x.armed ? `Yes — add ${pending} and draw ${draws}`
        : `Add ${pending} to ${name}${cost}`,
      note: over
        ? `Only ${slots} free word${slots === 1 ? "" : "s"} left — ${over} row${over === 1 ? "" : "s"} need${over === 1 ? "s" : ""} Pip Lifetime.`
        : ask
          ? (typeof left === "number" && draws > left
            ? `That's more drawings than you have left (${left}). Words past that get their picture later — pick one of ours or add a photo.`
            : `Drawing ${draws} pictures uses ${draws} of your ${left ?? "remaining"} drawings. Tap a thumbnail to use one of ours instead.`)
          : "",
    },
  };
}

function emitBulk(x) {
  if (!x.bulk) return;
  const s = appSession(x.appId);
  emit({ appId: x.appId, bulk: bulkModel(x, s, x.bulk.groupId, x.bulk.text).model });
}

/** add-flow.js queueFinds 215-240: the finder for each new row, 50 per
 *  request, after the adult stops typing (350 ms). */
function queueFinds(x, s, rows) {
  clearTimeout(x.findTimer);
  x.findTimer = setTimeout(async () => {
    const todo = rows.filter((r) => r.kind === "new" && !x.finds.has(normalizeV1(r.text)));
    if (!todo.length) return;
    for (const r of todo) x.finds.set(normalizeV1(r.text), "pending");
    emitBulk(x);
    const { userId, license } = await creds(x);
    if (x.bulkLeft == null) {
      void x.client.allowance({ userId, license }).then((a) => {
        if (a) { x.bulkLeft = a.left; emitBulk(x); }
      });
    }
    for (let i = 0; i < todo.length; i += 50) {
      const chunk = todo.slice(i, i + 50);
      const res = await x.client.findBatch({
        userId, license, locale: s.locale,
        items: chunk.map((r) => ({ text: normalizeV1(r.text) })),
      });
      chunk.forEach((r, k) => {
        const f = res.results?.[k];
        x.finds.set(normalizeV1(r.text), f && !f.error ? { ...f, pickIx: null } : null);
      });
      emitBulk(x);
    }
  }, 350);
}

/** The paste form for the text so far (LW-5). `groupId` is where the
 *  words go (the add form's group, or My Words from the Library). */
export function bulkState(appId, { groupId = null, text = "" }) {
  const s = appSession(appId);
  const x = X(s);
  const gid = groupId ?? "grp_my_words";
  if (!x.bulk || x.bulk.groupId !== gid || x.bulk.text !== text) x.armed = false;
  x.bulk = { groupId: gid, text };
  const b = bulkModel(x, s, gid, text);
  queueFinds(x, s, b.rows);
  return b.model;
}

/** The thumbnail of a new row cycles through the finder's four
 *  (add-flow.js 201-208). */
export function bulkCycle(appId, { groupId = null, text = "", key }) {
  const s = appSession(appId);
  const x = X(s);
  const f = x.finds.get(key);
  if (f && f !== "pending" && f.candidates?.length) {
    const n = f.candidates.length;
    const cur = f.pickIx ?? f.candidates.findIndex((c) => c.image_id === f.auto);
    f.pickIx = (cur + 1) % n;
    x.armed = false;
  }
  return bulkState(appId, { groupId, text });
}

/** The Add button (add-flow.js 465-497). -> the repainted edit state
 *  with a toast, or {armed, bulk} when the list needs the one "Yes". */
export function bulkAdd(appId, { groupId = null, text = "" }) {
  const s = appSession(appId);
  const x = X(s);
  const gid = groupId ?? "grp_my_words";
  const b = bulkModel(x, s, gid, text);
  if (!b.pending && b.over) {
    return { ...PIP().edit.editState(appId), toast: { text: OVER_LIMIT_TOAST } };
  }
  if (b.ask && !x.armed) {
    x.armed = true;
    return { armed: true, bulk: bulkModel(x, s, gid, text).model };
  }
  x.armed = false;
  const newTexts = b.rows.filter((r) => r.kind === "new" && !r.already && !r.overCap).map((r) => r.text);
  const res = applyPasteRows(s.d, b.rows, {
    groupId: gid, category: seedCategory(s, gid), maxNew: ownLeft(s),
  });
  s.addRecent = [gid, ...(s.addRecent ?? []).filter((v) => v !== gid)].slice(0, 3);
  s.kbIndex = null;
  const name = groupNameOf(s, gid, "My Words");
  const msg = `Added ${res.placed} to ${name}` + (res.skipped ? ` (${res.skipped} already there)` : "");
  const toast = res.refused
    ? `${msg} — ${res.refused} more need${res.refused === 1 ? "s" : ""} Pip Lifetime`
    : msg;
  prefetchVoices(s, newTexts, toast);
  void fillPastedPictures(x, s, res.newIds ?? []).catch((e) => console.error(`pics.fill: ${e}`));
  x.bulk = null;
  return { ...PIP().edit.editState(appId), toast: { text: toast } };
}

/** PP-6: pictures for the pasted words, one at a time in the background -
 *  the adult's cycled pick, else the finder's own rule (apply | draw).
 *  The words are usable at once; pictures fill in (add-flow.js 504-523). */
async function fillPastedPictures(x, s, newIds) {
  for (const { row, id } of newIds) {
    const f = x.finds.get(normalizeV1(row.text));
    const chosen = f && f !== "pending" && f.pickIx != null ? f.candidates[f.pickIx] : null;
    if (chosen) {
      const { userId, license } = await creds(x);
      const blob = await x.client.imageBlob({ userId, license, asset: chosen.asset });
      if (blob) await x.fill.applyBlob(id, blob);
      x.fill.inferKind(id, f.kind);
      void x.client.pick({ userId, license, text: row.text, imageId: chosen.image_id });
    } else {
      await x.fill.autoFill(id, { found: f && f !== "pending" ? f : null }).catch(() => {});
    }
    x.dirty = false;
    emit({ appId: x.appId, paint: boardPaint(x) });
  }
}

/* ---------------- several photos as new words (PP-5) ---------------- */

/** add-flow.js renderPhotoDrafts 363-390: the sheet's words for the
 *  names so far. `drafts` = [{ key, name }]. */
export function photoDrafts(appId, { groupId = null, drafts = [] }) {
  const s = appSession(appId);
  const n = drafts.filter((d) => String(d.name ?? "").trim()).length;
  return {
    title: `Add photos to ${groupNameOf(s, groupId ?? "grp_my_words", "My Words")}`,
    rows: drafts.map((d) => ({
      key: d.key, name: d.name ?? "", placeholder: "Name this one",
      tag: String(d.name ?? "").trim() ? "" : "needs a name",
    })),
    saveLabel: n ? `Save ${n}` : "Save",
    saveDisabled: n === 0,
  };
}

/** add-flow.js photo-save 543-576. The photos are already in the blob
 *  store (Swift saved them); each named one becomes a word wearing it. */
export function photosSave(appId, { groupId = null, cell = null, drafts = [] }) {
  const s = appSession(appId);
  const gid = groupId ?? "grp_my_words";
  const rows = [];
  for (const d of drafts) {
    const name = String(d.name ?? "").trim();
    if (!name) { rows.push({ name: "" }); continue; }
    if (!BLOB_KEY.test(d.key ?? "")) throw new Error("photosSave: not a blob key");
    PIP().mediasync.queueUpload(d.key);
    rows.push({ name, photoKey: d.key });
  }
  const res = applyPhotoDrafts(s.d, rows, {
    groupId: gid, category: seedCategory(s, gid), cell, maxNew: ownLeft(s),
  });
  s.kbIndex = null;
  prefetchVoices(s, rows.filter((r) => r.name).map((r) => r.name));
  const plural = `photo${res.saved === 1 ? "" : "s"}`;
  const toast = res.refused
    ? `Added ${res.saved} ${plural} — ${res.refused} more need${res.refused === 1 ? "s" : ""} Pip Lifetime`
    : `Added ${res.saved} ${plural}`;
  return { ...PIP().edit.editState(appId), toast: { text: toast } };
}
