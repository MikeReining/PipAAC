/** Prediction strip: the tray of next-word cards, the feeling faces,
 *  expand mode (a family's fixed-order tiles), and the strip's geometry.
 *  board.js owns the bar, taps, and the grid; this module owns what the
 *  tray paints. Shared scalars arrive through `live` getters. */
import { entityForSense, maskedSenseIds } from "../shared/groups.mjs";
import {
  groupRanked, groupStarters, stampShownFinal, stripRanked,
} from "../shared/funnel.mjs";
import { FEELINGS, suggestedFeeling } from "../shared/feeling.mjs";
import { family as familyRow, familyItems } from "../shared/families.mjs";
import { loadPhotoURL } from "../db.js";

const $ = (id) => document.getElementById(id);
const ALL = (db, sql, p = []) => db.all(sql, p);

export function mountStrip({
  db, locale, catalog, phrases, feelingData, sentence, live,
  speak, speakFeeling,
  tap, shownLabel, metaFor, roleForEntity, posOfSense,
  artInto, fitLabels, applyLikely, boardGeom,
  ensureSentence, maybeImpression,
}) {
  /** Prediction slots in the strip at this width (014 slice 1): four on
   *  a ten-column board, two on five — the Groups and Keyboard anchors
   *  keep one column each so the whole vocabulary stays reachable. */
  function stripSlots(cols) {
    return Math.min(4, Math.max(2, Math.floor((cols - 2) / 2)));
  }

  /* --- Expand mode (014 § 5, Motor_Grid § 2.1): a family tile opens its
   *  family in the bar — fixed order, one-column tiles, never ranked,
   *  never trimmed. A pick returns the bar to Predict; a family item may
   *  chain one level deeper (Pain → how much → where), no more. --- */
  let expand = null; // { familyId, page, depth } — null means Predict mode
  const expandCap = (cols) => Math.max(4, cols - 2); // one-wide tiles
  function openExpand(familyId, depth = 0) {
    expand = { familyId, page: 0, depth };
    renderStrip();
  }
  // tap()'s pick path clears expand without repainting — the tap's own
  // render calls follow.
  function clearExpand() { expand = null; }

  /** The strip spans the board's columns; the tray holds the prediction
   *  slots and the two anchors keep a column each. */
  function sizeStrip(cols) {
    $("strip").style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    const tray = $("tray");
    // Groups and Keyboard always; Add joins them in Edit mode on a group (027 B5).
    tray.style.gridColumn = `span ${cols - ($("anchor-add").hidden ? 2 : 3)}`;
    tray.style.gridTemplateColumns = `repeat(${stripSlots(cols)}, 1fr)`;
  }

  // Idle-strip starters referenced by sense id — never by English text.
  /** A strip card is an ordinary word tile turned sideways: art on a
   *  white square at left, the label on the role fill at right
   *  (Design_System § Strip). Senses show their approved symbol when one
   *  ships, else a glyph or the label's initial. */
  async function predCard(c) {
    const el = document.createElement("button");
    el.className = `pred${c.entity ? ` r-${roleForEntity(c.entity.id)}` : c.role ? ` r-${c.role}` : ""}`;
    const part = document.createElement("span");
    part.className = "part";
    const lb = document.createElement("span");
    lb.className = "plabel";
    if (c.entity) {
      const url = await loadPhotoURL(c.entity.photo_key);
      if (url) {
        const img = document.createElement("img");
        img.src = url;
        img.alt = "";
        part.appendChild(img);
        el.classList.add("photo");
      } else {
        part.textContent = c.entity.spoken_name[0].toUpperCase();
      }
      lb.textContent = c.entity.spoken_name;
    } else {
      const art = c.id ? metaFor(c.id).art : null;
      if (art) {
        const img = document.createElement("img");
        img.alt = "";
        if (artInto(img, art)) el.classList.add("photo");
        part.appendChild(img);
      } else {
        part.textContent = c.glyph ?? c.label[0].toUpperCase();
      }
      lb.textContent = c.label;
    }
    el.append(part, lb);
    const onTap =
      c.onTap ??
      (c.entity ? () => tap(c.entity.spoken_name, "entity", c.entity.id, { hint: true, source: "strip" }) : () => {});
    el.addEventListener("click", onTap);
    return el;
  }

  /** Ghost card: a dashed placeholder — the tray never collapses. */
  function ghostCard() {
    const el = document.createElement("div");
    el.className = "pred ghost";
    el.setAttribute("aria-hidden", "true");
    return el;
  }

  /* 025 § 1: the three faces own the strip's last slot — from the first
   *  word, when the setting is on, online, and not mid-typed-word.
   *  Edit/pick/model modes keep every tap a selection, never speech. */
  function facesOn() {
    return !!(!live.tour && feelingData && sentence.length && live.expressiveVoice
      && navigator.onLine !== false && !live.kbUi.text
      && !live.picking && !live.modeling && !live.editing);
  }

  /** Cache: entity id → category — a people/pets entity (or an
   *  unclassified family add) counts as a people word for § 3. */
  const entityCat = new Map();
  function entityCategory(entityId) {
    if (!entityCat.has(entityId)) {
      entityCat.set(entityId, ALL(db,
        "SELECT category AS c FROM personal_entity WHERE id = ?",
        [entityId])[0]?.c ?? null);
    }
    return entityCat.get(entityId);
  }

  function faceCard() {
    const el = document.createElement("div");
    el.className = "pred faces";
    // § 3: the lit face is the suggestion — recomputed every paint.
    const lit = suggestedFeeling(sentence, feelingData,
      (id) => posOfSense(id) === "Pronoun", entityCategory);
    for (const f of FEELINGS) {
      const b = document.createElement("button");
      b.className = `face${lit === f ? " lit" : ""}`;
      b.setAttribute("aria-label", `Say it ${f}`);
      const img = document.createElement("img");
      img.src = `/icons/${lit === f ? "selected/" : ""}voice-${f}.svg`;
      img.alt = "";
      b.appendChild(img);
      b.addEventListener("click", () => speakFeeling(f, b));
      el.appendChild(b);
    }
    return el;
  }

  /** Strip items → card descriptors (entity tile or sense tile). */
  function stripCards(items) {
    return items.map((c) => {
      if (c.kind === "entity") {
        return { entity: ALL(db, "SELECT * FROM personal_entity WHERE id = ?", [c.id])[0] };
      }
      // 014 slice 11: a family person stands in for the catalog word it
      // represents — the bar shows Mama's photo and her name in `mom`'s
      // place, at `mom`'s rank. The word's score is untouched; only the
      // tile and the voice change.
      const standIn = entityForSense(db, c.id);
      if (standIn) return { entity: standIn };
      const w = ALL(
        db,
        `SELECT s.id, l.text AS label, s.fitzgerald_role FROM sense s
         JOIN label l ON l.sense_id = s.id
           AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = ?
         WHERE s.id = ?`,
        [locale, c.id],
      )[0];
      const label = shownLabel(w.id, w.label);
      return { id: w.id, label, role: w.fitzgerald_role,
        onTap: () => tap(label, "sense", w.id, { hint: true, source: "strip" }) };
    });
  }

  /** Paint the strip's slots — the only path that touches the tray.
   *  Stamps shown_final on the open strip moment: what was painted is
   *  the truth the stored row must replay (017-5). Card building awaits
   *  art; two renders can overlap, so the tray swap is single-flight —
   *  a superseded paint never touches the DOM. */
  let stripPaint = 0;
  async function paintStrip(cards, slots = stripSlots(boardGeom().cols)) {
    const mine = ++stripPaint;
    // 025 § 1: the last slot is the three faces whenever they show —
    // word suggestions fill the slots before it, same in every mode.
    const wordSlots = slots - (facesOn() ? 1 : 0);
    const els = [];
    for (let i = 0; i < wordSlots; i++) {
      els.push(cards[i] ? await predCard(cards[i]) : ghostCard());
    }
    if (wordSlots < slots) els.push(faceCard());
    if (mine !== stripPaint) return;
    const tray = $("tray");
    tray.style.gridTemplateColumns = `repeat(${slots}, 1fr)`;
    tray.replaceChildren(...els);
    if (live.openImpressionId !== null) {
      // shown_final replays what was painted — the face slot is not a word.
      stampShownFinal(db, live.openImpressionId, cards.slice(0, wordSlots).map((c) =>
        c.entity ? `entity:${c.entity.id}` : `sense:${c.id}`));
    }
    fitLabels(tray);
    applyLikely();
  }

  /** Expand mode (014 § 5): the family's fixed-order tiles, one column
   *  wide; a family longer than the bar ends in a fixed `more ›` tile
   *  that pages it. A pick returns the bar to Predict. */
  async function renderExpand() {
    const fam = familyRow(db, expand.familyId);
    if (!fam) { expand = null; return renderStrip(); }
    const items = familyItems(db, expand.familyId, locale, maskedSenseIds(db));
    const cap = expandCap(boardGeom().cols);
    // `more ›` only costs a slot when the family is longer than the bar.
    const pages = items.length > cap ? Math.ceil(items.length / (cap - 1)) : 1;
    const pageSize = pages > 1 ? cap - 1 : cap;
    expand.page = Math.min(expand.page, pages - 1);
    const shown = items.slice(expand.page * pageSize, expand.page * pageSize + pageSize);
    const cards = shown.map((it) => {
      if (it.kind === "family") {
        return {
          label: it.label, glyph: it.glyph,
          onTap: () => {
            // One level of chaining (Pain → how much → where), no deeper.
            if (it.speaks) speak(it.speaks);
            if (expand.depth < 1) openExpand(it.nextFamily, expand.depth + 1);
          },
        };
      }
      return {
        label: it.label, role: it.role,
        onTap: () => {
          expand = null;
          tap(it.label, it.kind, it.id, { hint: true, source: "strip" });
        },
      };
    });
    if (pages > 1) {
      cards.push({
        label: "more ›",
        onTap: () => { expand.page = (expand.page + 1) % pages; renderStrip(); },
      });
    }
    await paintStrip(cards, cap);
  }

  async function renderStrip() {
    if (live.tour) return paintStrip(stripCards(live.tour.stripItems()));
    if (expand) return renderExpand();
    const cap = stripSlots(boardGeom().cols);
    let cards;
    if (live.kbUi.text) {
      // mid-word: the strip switches from continuations to completions
      cards = live.kbUi.completions();
    } else {
      // One question, one answer: "what does she say next after this
      // phrase" — the same rule paints the bar whether the keyboard is
      // open or not. (Mid-word letters still get spelling completions
      // above; that's not next-word prediction.)
      const sents = sentence.map((s) => ({ kind: s.kind, id: s.id }));
      // Open group: an empty sentence (or one that starts fresh after
      // Speak) offers first words — her own starts here, then children's
      // (027 § 5); after the first pick the bar narrows to that group's
      // used words, her history only (group mode, 2026-09-24).
      const groupId = live.view === "group" ? live.groupsUi.getGroupKey() : null;
      const starting = !sents.length || live.freshNext;
      const ranked = !groupId
        ? stripRanked(db, sents, Date.now(), locale, phrases)
        : starting
          ? groupStarters(db, groupId, { starters: catalog.groupStarters, visible: live.groupsUi.visibleKeys() })
          : groupRanked(db, sents, groupId, Date.now());
      const items = ranked.shown;
      // Position-0 offers are real moments too (017-21): open the
      // sentence so the impression row can exist. A row with no picks
      // stays invisible to stats (end_kind IS NULL). An empty bar —
      // start or mid-sentence — stays empty: no resting-card guesses
      // (founder call, 2026-09-25). Try it (032) shows the bar but logs
      // nothing: an adult's demo is never her sentence or her moment.
      if (!live.spotDemo) {
        ensureSentence();
        maybeImpression(
          ranked.ranked,
          items, { mode: live.kbUi.isOpen() ? "keyboard" : "picture", cap,
            gate: groupId ? { group: groupId } : { ending: ranked.ending } },
        );
      }
      cards = stripCards(items);
    }
    await paintStrip(cards);
  }

  return { renderStrip, paintStrip, sizeStrip, stripSlots, openExpand, clearExpand };
}
