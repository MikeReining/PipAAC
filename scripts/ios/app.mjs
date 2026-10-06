/**
 * The iOS app facade (phase 044 slice B): the board.js child-mode tap
 * path and the render models SwiftUI draws — board cells, the Smart
 * bar strip, group index/pages, the sentence bar, and speech slots.
 *
 * One implementation of the rules: this module bundles into
 * pip-core.js and runs in the app's JSContext; Swift owns presentation
 * and media only. It mirrors board.js — grid.js renderGrid, strip.js
 * renderStrip, groups-ui.js pages, speech.js resolveSlot — so the
 * product's semantics stay in shared modules; when the web path
 * changes this moves with it (same contract as harness.mjs).
 *
 * Render models are plain JSON — every Swift type below is a value:
 *   board  { cols, rows, cells: [slot] }
 *   strip  { cap, mode, cards: [card] }
 *   bar    [ { kind, id, display, art, photoKey } ]
 *   speech resolveSlot result — Swift plays 'clip' from bundled
 *          SharedAssets, everything else is the 400 ms silent slot.
 */

const PIP = () => globalThis.PIPCORE;

const apps = new Map();
let nextAppId = 1;

const parse = (x) => (typeof x === "string" ? JSON.parse(x) : x);
const one = (d, sql, p = []) => d.prepare(sql).all(...p)[0];
const all = (d, sql, p = []) => d.prepare(sql).all(...p);

/* ---------------- boot ---------------- */

/** Open a replica db the way public/db.js bootDb does: schema +
 *  additive columns + the idempotent catalog import (which installs
 *  the shipped group seed as an op, once). The shipped fresh_db file
 *  carries the catalog rows already; the import doubles as the
 *  reconcile — identical to web. */
export function appOpen(dbId, catalogJson, phrasesJson, formTableJson) {
  const d = PIP().makeDb(dbId);
  const catalog = parse(catalogJson);
  d.exec("PRAGMA foreign_keys = ON");
  PIP().migrate.migrateSchema(d, catalog.schemaSql, PIP().migrate.ADDITIVE_COLUMNS);
  d.exec(catalog.schemaSql);
  PIP().migrate.ensureAdditiveColumns(d);
  d.exec("DROP TABLE IF EXISTS history_count");
  d.exec("DROP TABLE IF EXISTS prediction_weights");
  PIP().importer.importCatalog(d, catalog);

  const profile = one(d, "SELECT * FROM learner_profile WHERE id = 'prf_local'") ?? {};
  const id = `a${nextAppId++}`;
  apps.set(id, {
    d, catalog,
    phrases: phrasesJson == null ? null : parse(phrasesJson),
    formTable: formTableJson == null ? null : parse(formTableJson),
    locale: profile.locale ?? "en",
    voiceId: profile.preferred_voice_id ?? "voi_default_en",
    grammarHelp: profile.grammar_help !== 0,
    freshAfterSpeak: !!profile.fresh_after_speak,
    topRowOn: !!profile.group_top_row,
    sentence: [], sentenceId: null, picks: 0,
    freshNext: false,
    lastImpressionKey: null, openImpressionId: null,
    expand: null,                       // { familyId, page, depth }
    view: "board", groupId: null, page: 0,
    meta: new Map(),                    // senseId -> { role, art }
    pos: new Map(),                     // senseId -> part of speech
    entRole: new Map(), entPhoto: new Map(),
  });
  const s = apps.get(id);
  return { appId: id, locale: s.locale, voiceId: s.voiceId,
    speechRate: Number(profile.speech_rate) || 1 };
}

export function appClose(appId) { apps.delete(appId); }

const S = (appId) => {
  const s = apps.get(appId);
  if (!s) throw new Error(`appClose: no session ${appId}`);
  return s;
};

/* ---------------- shared lookups (board/meta-cache.js) ---------------- */

function metaFor(s, senseId) {
  if (!s.meta.has(senseId)) {
    s.meta.set(senseId, one(s.d,
      `SELECT s.fitzgerald_role AS role, ${PIP().images.SENSE_ART_SQL} AS art
       FROM sense s WHERE s.id = ?`, [senseId]) ?? { role: null, art: null });
  }
  return s.meta.get(senseId);
}

function posOfSense(s, senseId) {
  if (!s.pos.has(senseId)) {
    s.pos.set(senseId, one(s.d,
      `SELECT part_of_speech AS p FROM label
       WHERE sense_id = ? AND kind = 'lemma' AND status = 'approved' AND locale = ?`,
      [senseId, s.locale])?.p ?? null);
  }
  return s.pos.get(senseId);
}

function roleForEntity(s, id) {
  if (!s.entRole.has(id)) {
    s.entRole.set(id,
      one(s.d, "SELECT fitzgerald_role AS r FROM personal_entity WHERE id = ?", [id])?.r ?? "None");
  }
  return s.entRole.get(id);
}

function photoFor(s, id) {
  if (!s.entPhoto.has(id)) {
    s.entPhoto.set(id,
      one(s.d, "SELECT photo_key AS p FROM personal_entity WHERE id = ?", [id])?.p ?? null);
  }
  return s.entPhoto.get(id);
}

const masked = (s) => PIP().groups.maskedSenseIds(s.d);

/* Grammar help paints the called-for form (board.js shownLabel —
 *  always lemma in the caregiver's editor, which iOS has no Edit mode
 *  for yet). */
const shownLabel = (s, senseId, fallback) =>
  s.grammarHelp ? PIP().forms.formFor(s.d, s.formTable, s.sentence, senseId).text ?? fallback : fallback;

/* boardGeom (grid.js): the profile's Cells setting names a catalog
 *  layout; unknown falls back to grid60. */
function boardGeom(s) {
  const name = one(s.d,
    "SELECT board_layout AS l FROM learner_profile WHERE id = 'prf_local'")?.l ?? "grid60";
  const layout = s.catalog.layouts?.[name] ?? s.catalog.layouts?.grid60
    ?? { cols: 10, rows: 6, anchors: [] };
  return {
    name: s.catalog.layouts?.[name] ? name : "grid60",
    cols: layout.cols, rows: layout.rows, cells: layout.cols * layout.rows,
    anchors: new Map((layout.anchors ?? []).map((a) => [a.slot, a])),
  };
}

/* ---------------- render models ---------------- */

const wordModel = (s, { kind, id, label, role, art = null, photoKey = null }) =>
  ({ type: "word", kind, id, label, role: role ?? "None", art, photoKey });

/** grid.js homeTile → a JSON slot. A masked sense is an empty cell to
 *  the child (Masking § 2); entities draw photo + the family's kind
 *  color. */
function homeSlot(s, c, mask) {
  if (c.kind === "entity") {
    return wordModel(s, {
      kind: "entity", id: c.entity_id, label: c.label,
      role: c.fitzgerald_role ?? "None", photoKey: photoFor(s, c.entity_id),
    });
  }
  if (mask.has(c.sense_id)) return { type: "empty" };
  const label = shownLabel(s, c.sense_id, c.label);
  return wordModel(s, {
    kind: "sense", id: c.sense_id, label,
    role: c.fitzgerald_role, art: metaFor(s, c.sense_id).art,
  });
}

/** renderGrid: every slot renders — anchors, word tiles, empty. */
function boardModel(s) {
  const geom = boardGeom(s);
  const cells = PIP().coremove.coreCells(s.d, geom.name, s.locale);
  const bySlot = new Map(cells.map((c) => [c.slot_index, c]));
  const mask = masked(s);
  const slots = [];
  for (let slot = 0; slot < geom.cells; slot++) {
    const anchor = geom.anchors.get(slot);
    if (anchor?.kind === "groups") {
      slots.push({ type: "groups", slot });
      continue;
    }
    if (anchor?.kind === "family") {
      const f = PIP().families.family(s.d, anchor.family);
      slots.push({
        type: "family", slot, familyId: anchor.family,
        label: f?.name ?? "?", glyph: f?.glyph ?? "▸", speaks: f?.speaks ?? null,
      });
      continue;
    }
    if (anchor?.kind === "reserved") { slots.push({ type: "empty", slot }); continue; }
    const c = bySlot.get(slot);
    if (!c) { slots.push({ type: "empty", slot }); continue; }
    slots.push({ ...homeSlot(s, c, mask), slot });
  }
  return { cols: geom.cols, rows: geom.rows, cells: slots };
}
export const appBoard = (appId) => boardModel(S(appId));

/* The bar chips (board.js renderBar): display text is computed here —
 * capitalization and ¿¡/?! are display-only (slice 2 rule 7). */
function barModel(s) {
  const texts = PIP().keyboard.displaySentence(s.sentence, s.locale);
  return s.sentence.map((item, i) => ({
    kind: item.kind, id: item.id, display: texts[i] ?? item.text,
    art: item.kind === "sense" && item.id ? metaFor(s, item.id).art : item.art ?? null,
    photoKey: item.kind === "entity" && item.id ? photoFor(s, item.id) : null,
  }));
}
export const appBar = (appId) => barModel(S(appId));

/* Strip cards (strip.js stripCards + the entity stand-in, 014 slice 11). */
function stripCardFor(s, c) {
  if (c.kind === "entity") {
    const e = one(s.d, "SELECT * FROM personal_entity WHERE id = ?", [c.id]);
    if (!e) return null;
    return { kind: "entity", id: e.id, label: e.spoken_name,
      role: e.fitzgerald_role ?? "None", photoKey: e.photo_key };
  }
  const standIn = PIP().groups.entityForSense(s.d, c.id);
  if (standIn) {
    return { kind: "entity", id: standIn.id, label: standIn.spoken_name,
      role: standIn.fitzgerald_role ?? "None", photoKey: standIn.photo_key };
  }
  const w = one(s.d,
    `SELECT s.id, l.text AS label, s.fitzgerald_role FROM sense s
     JOIN label l ON l.sense_id = s.id
       AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = ?
     WHERE s.id = ?`, [s.locale, c.id]);
  if (!w) return null;
  const label = shownLabel(s, w.id, w.label);
  return { kind: "sense", id: w.id, label, role: w.fitzgerald_role,
    art: metaFor(s, w.id).art };
}

/* strip.js: three-to-four prediction slots at every size. */
const stripSlots = (cols) => Math.min(4, Math.max(3, cols - 2));

const ensureSentence = (s) => (s.sentenceId ??= PIP().funnel.openSentence(s.d));

/* board.js maybeImpression — one impression row per distinct offer,
 * deduped by (sentence, position, shown). */
function maybeImpression(s, candidates, shown, { mode = "picture", cap = null, gate = null } = {}) {
  if (s.sentenceId === null) return false;
  const shownKeys = shown.map((c) => `${c.kind}:${c.id}`);
  const key = `${s.sentenceId}:${s.picks}:${shownKeys.join()}`;
  if (key === s.lastImpressionKey) return false;
  s.lastImpressionKey = key;
  s.openImpressionId = PIP().funnel.logImpression(s.d, {
    sentenceId: s.sentenceId, position: s.picks,
    candidates, shown: shownKeys, mode, gate, shortlistCap: cap,
  });
  return true;
}

/** renderStrip (predict mode + family expand). Returns the card model
 *  and stamps shown_final on the open impression like paintStrip does. */
function stripModel(s) {
  const geom = boardGeom(s);
  const cap = stripSlots(geom.cols);

  if (s.expand) {
    const fam = PIP().families.family(s.d, s.expand.familyId);
    if (!fam) s.expand = null;
    else {
      const items = PIP().families.familyItems(s.d, s.expand.familyId, s.locale, masked(s));
      const pageSize = cap - 1;
      const pages = items.length > cap ? Math.ceil(items.length / pageSize) : 1;
      const realSize = pages > 1 ? pageSize : cap;
      s.expand.page = Math.min(s.expand.page, pages - 1);
      const shown = items.slice(s.expand.page * realSize, s.expand.page * realSize + realSize);
      const cards = shown.map((it) => it.kind === "family"
        ? { kind: "family", id: it.id, label: it.label, glyph: it.glyph,
            speaks: it.speaks, nextFamily: it.nextFamily }
        : stripCardFor(s, it) ?? { kind: it.kind, id: it.id, label: it.label,
            role: it.role ?? "None", art: it.kind === "sense" ? metaFor(s, it.id).art : null });
      if (pages > 1) cards.push({ kind: "more", label: "more ›" });
      return { cap, mode: "family", familyId: s.expand.familyId,
        page: s.expand.page, pages, cards };
    }
  }

  const sents = s.sentence.map((x) => ({ kind: x.kind, id: x.id }));
  const groupId = s.view === "group" ? s.groupId : null;
  const starting = !sents.length || s.freshNext;
  const ranked = !groupId
    ? PIP().funnel.stripRanked(s.d, sents, Date.now(), s.locale, s.phrases)
    : starting
      ? PIP().funnel.groupStarters(s.d, groupId,
          { starters: s.catalog.groupStarters, visible: visibleKeys(s) })
      : PIP().funnel.groupRanked(s.d, sents, groupId, Date.now());
  const items = ranked.shown;
  ensureSentence(s);
  maybeImpression(s, ranked.ranked, items, {
    cap, gate: groupId ? { group: groupId } : { ending: ranked.ending } });
  const cards = items.map((c) => stripCardFor(s, c)).filter(Boolean);
  if (s.openImpressionId !== null) {
    PIP().funnel.stampShownFinal(s.d, s.openImpressionId,
      cards.slice(0, cap).map((c) => `${c.kind}:${c.id}`));
  }
  return { cap, mode: "predict", cards };
}
export const appStrip = (appId) => stripModel(S(appId));

/** strip.js's "every word the open group page shows" — its own cells
 *  plus the home tiles in the reserved cells; used by groupStarters. */
function visibleKeys(s) {
  const keys = new Set();
  const layout = PIP().groups_shared.activeLayout(s.d);
  const geom = PIP().groups_shared.geometryOf(s.d, layout);
  const home = PIP().coremove.coreCells(s.d, boardGeom(s).name, s.locale);
  for (const c of home) {
    if (geom.frame.includes(c.slot_index) || (s.topRowOn && geom.topRow.includes(c.slot_index))) {
      keys.add(`${c.kind}:${c.sense_id ?? c.entity_id}`);
    }
  }
  if (s.groupId) {
    for (const c of PIP().groups.groupPage(s.d, s.groupId, s.page, s.locale, layout)) {
      keys.add(`${c.item_kind}:${c.item_id}`);
    }
  }
  return keys;
}

export function appOpenFamily(appId, familyId, depth = 0) {
  const s = S(appId);
  s.expand = { familyId, page: 0, depth };
  return stripModel(s);
}

export function appFamilyPage(appId) {
  const s = S(appId);
  if (s.expand) s.expand.page++;
  return stripModel(s);
}

/* ---------------- groups ---------------- */

/** The group index: a paged slot surface like a group page — row 0 and
 *  the frame draw the home board's own tiles; group doors sit at their
 *  canonical index_visual slot. Hidden groups are skipped (child view). */
export function appGroups(appId) {
  const s = S(appId);
  const layout = PIP().groups_shared.activeLayout(s.d);
  const geom = PIP().groups_shared.geometryOf(s.d, layout);
  const home = new Map(PIP().coremove.coreCells(s.d, boardGeom(s).name, s.locale)
    .map((c) => [c.slot_index, c]));
  const mask = masked(s);
  const doors = PIP().groups_shared.groupIndex(s.d)
    .filter((g) => !g.hidden && PIP().groups_shared.shownOn(s.d, g.id, layout));
  const byVisual = new Map();
  for (const g of doors) {
    const v = PIP().groups_shared.indexVisual(g.index_slot, geom.cells);
    byVisual.set(`${v.page}:${v.slot}`, {
      type: "group", slot: v.slot, groupId: g.id,
      name: PIP().groups.groupDisplayName(s.d, g, s.locale),
      glyph: g.glyph ?? null, photoKey: g.photo_key ?? null, kind: g.kind,
    });
  }
  const pages = Math.max(1, ...doors.map((g) =>
    PIP().groups_shared.indexVisual(g.index_slot, geom.cells).page + 1));
  const out = [];
  for (let p = 0; p < pages; p++) {
    const slots = [];
    for (let slot = 0; slot < geom.cells; slot++) {
      if (geom.frame.includes(slot) || geom.topRow.includes(slot)) {
        const showHome = geom.frame.includes(slot) || s.topRowOn;
        const c = showHome ? home.get(slot) : null;
        slots.push(c ? { ...homeSlot(s, c, mask), slot, reserved: true }
                     : { type: "empty", slot });
        continue;
      }
      slots.push(byVisual.get(`${p}:${slot}`) ?? { type: "empty", slot });
    }
    out.push({ page: p, cells: slots });
  }
  return { cols: geom.cols, rows: geom.rows, pages: out };
}

/** One group page: content cells get tiles; reserved cells draw the
 *  home board's own tiles (frame always, top row when the setting is
 *  on); the last cell is Next. */
export function appGroupPage(appId, groupId, page = 0) {
  const s = S(appId);
  const layout = PIP().groups_shared.activeLayout(s.d);
  const geom = PIP().groups_shared.geometryOf(s.d, layout);
  const pages = PIP().groups.pageCount(s.d, groupId, layout);
  const row = one(s.d, "SELECT * FROM board_group WHERE id = ?", [groupId]);
  const name = row ? PIP().groups.groupDisplayName(s.d, row, s.locale) : "";
  const mask = masked(s);
  const home = new Map(PIP().coremove.coreCells(s.d, boardGeom(s).name, s.locale)
    .map((c) => [c.slot_index, c]));
  const cells = new Map(
    PIP().groups.groupPage(s.d, groupId, page, s.locale, layout)
      .map((c) => [c.slot_index, c]));
  const slots = [];
  for (let slot = 0; slot < geom.cells; slot++) {
    if (slot === geom.next) { slots.push({ type: "next", slot }); continue; }
    if (geom.frame.includes(slot) || geom.topRow.includes(slot)) {
      const showHome = geom.frame.includes(slot) || s.topRowOn;
      const c = showHome ? home.get(slot) : null;
      slots.push(c ? { ...homeSlot(s, c, mask), slot, reserved: true }
                   : { type: "empty", slot });
      continue;
    }
    const c = cells.get(slot);
    if (!c) { slots.push({ type: "empty", slot }); continue; }
    if (c.item_kind === "sense" && mask.has(c.item_id)) {
      slots.push({ type: "empty", slot });
      continue;
    }
    if (c.item_kind === "entity") {
      slots.push(wordModel(s, {
        kind: "entity", id: c.item_id, label: c.label,
        role: c.fitzgerald_role, photoKey: c.photo_key,
      }));
    } else {
      const label = shownLabel(s, c.item_id, c.label);
      slots.push(wordModel(s, {
        kind: "sense", id: c.item_id, label,
        role: c.fitzgerald_role, art: c.art,
      }));
    }
    slots[slots.length - 1].slot = slot;
  }
  s.view = "group"; s.groupId = groupId; s.page = page;
  return { cols: geom.cols, rows: geom.rows, groupId, name, page, pages, cells: slots };
}

export function appShowBoard(appId) {
  const s = S(appId);
  s.view = "board"; s.groupId = null;
  return appBoard(appId);
}

/* ---------------- taps ---------------- */

/* board.js revisitPrev (decision 4): the new word settles the one
 *  before it — the 's whose rule and the form re-pick. */
function revisitPrev(s, atIndex) {
  if (!s.grammarHelp || atIndex < 1) return null;
  const prev = s.sentence[atIndex - 1];
  const cur = s.sentence[atIndex];
  if (prev.kind === "entity" && cur?.kind === "sense" && cur.id
      && posOfSense(s, cur.id) === "Noun" && !prev.text.endsWith("'s")) {
    prev.text = `${prev.text}'s`;
    return { pos: atIndex - 1, text: prev.text };
  }
  if (prev.kind !== "sense" || !prev.id || prev.fixed) return null;
  const f = PIP().forms.formFor(s.d, s.formTable, s.sentence.slice(0, atIndex - 1), prev.id, cur);
  if (f.text === prev.text) return null;
  prev.text = f.text; prev.labelId = f.labelId; prev.features = f.features;
  if (s.sentenceId !== null) {
    const pos = s.sentence.slice(0, atIndex - 1).filter((it) => it.id).length;
    s.d.prepare(
      "UPDATE learner_event_log SET label_id = ? WHERE sentence_id = ? AND position = ?",
    ).run(f.labelId, s.sentenceId, pos);
  }
  return { pos: atIndex - 1, text: f.text };
}

const startFresh = (s, editing = false) => {
  if (s.freshNext && !editing) s.sentence.length = 0;
  s.freshNext = false;
};

/** The whole painted state after a change — one call, so a tap is one
 *  bridge round trip, not three. */
const state = (s) => ({ bar: barModel(s), strip: stripModel(s), board: boardModel(s) });

/** board.js tap() — the child path (no tour/demo/edit/pick/model).
 *  tap: { kind: 'sense'|'entity', id, text, source, groupId? } */
export function appTap(appId, tap) {
  const s = S(appId);
  const { kind, id, text } = tap;
  const source = tap.source ?? "grid";
  s.expand = null;
  startFresh(s);
  let item = { kind, id, text };
  if (kind === "sense" && id && s.grammarHelp) {
    const f = PIP().forms.formFor(s.d, s.formTable, s.sentence, id);
    item = { kind: "sense", id: f.senseId, text: f.text ?? text,
      labelId: f.labelId, fixed: f.merged, features: f.features };
  }
  s.sentence.push(item);
  revisitPrev(s, s.sentence.length - 1);
  let speech = null;
  if (id) {
    ensureSentence(s);
    PIP().funnel.fillChosen?.(s.d, s.sentenceId, { kind, id: item.id ?? id, source });
    PIP().funnel.logSelection(s.d, kind, item.id ?? id, Date.now(), {
      sentenceId: s.sentenceId, position: s.picks++, source,
      labelId: item.labelId ?? null,
      groupId: s.view === "group" ? s.groupId : null,
    });
    speech = PIP().voice.resolveSlot(s.d, item, s.locale, s.voiceId);
  }
  return { speech, ...state(s) };
}

/** ⌫ — the last whole word; a logged pick detaches (its event stays as
 *  usage evidence). */
export function appBackspace(appId) {
  const s = S(appId);
  startFresh(s, true);
  const last = s.sentence.pop();
  if (last?.id && s.sentenceId !== null && s.picks > 0) {
    PIP().funnel.detachEvent(s.d, s.sentenceId, s.picks - 1);
    s.picks--;
  }
  return { speech: null, ...state(s) };
}

/** Clear — closes 'cleared', empties the bar. */
export function appClear(appId) {
  const s = S(appId);
  startFresh(s, true);
  if (s.sentenceId !== null) {
    PIP().funnel.closeSentence(s.d, s.sentenceId, Date.now(), "cleared");
    s.sentenceId = null; s.picks = 0;
    s.lastImpressionKey = null; s.openImpressionId = null;
  }
  s.sentence.length = 0;
  return { speech: null, ...state(s) };
}

/** ▶ Speak — the EOS re-pick, then the clip list for every bar item
 *  (offline = the word-by-word path; the minted sentence voice lands
 *  with networking). Closes the sentence 'spoken'. */
export function appSpeak(appId) {
  const s = S(appId);
  if (s.grammarHelp && s.sentence.length) {
    const last = s.sentence[s.sentence.length - 1];
    if (last.kind === "sense" && last.id) {
      const f = PIP().forms.formFor(s.d, s.formTable,
        s.sentence.slice(0, -1), last.id, PIP().forms.EOS, last.features);
      if (f.text !== last.text) {
        last.text = f.text; last.labelId = f.labelId; last.features = f.features;
        if (s.sentenceId !== null) {
          const pos = s.sentence.slice(0, -1).filter((it) => it.id).length;
          s.d.prepare(
            "UPDATE learner_event_log SET label_id = ? WHERE sentence_id = ? AND position = ?",
          ).run(f.labelId, s.sentenceId, pos);
        }
      }
    }
  }
  const clips = s.sentence.map((item) =>
    PIP().voice.resolveSlot(s.d, item, s.locale, s.voiceId));
  if (s.sentenceId !== null) {
    PIP().funnel.closeSentence(s.d, s.sentenceId, Date.now(), "spoken");
    s.sentenceId = null; s.picks = 0;
    s.lastImpressionKey = null; s.openImpressionId = null;
  }
  s.freshNext = s.freshAfterSpeak;
  return { clips, ...state(s) };
}
