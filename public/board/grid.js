/** Grid render + geometry (014, Core_Coordinate_Map): the board's
 *  coordinate-map cells, anchors and empty slots; the tile primitives
 *  (wordTile, artInto, fitLabels) the strip and other mounts borrow;
 *  the "Show me where" path hint; and the likely-next halo pass.
 *  board.js owns taps, the bar, and the attention layer — the halo and
 *  move-mark state the layer reads lives there and crosses through
 *  `live`. Shared scalars arrive as live getters/setters; object refs
 *  (sentence, cellEls) are shared directly. */
import { entityForSense, groupDisplayName, maskedSenseIds } from "../shared/groups.mjs";
import { stripRanked } from "../shared/funnel.mjs";
import { family as familyRow } from "../shared/families.mjs";
import { coreCells, moveCore, placeOnBoard } from "../shared/coremove.mjs";
import { moveMarks } from "../shared/movecost.mjs";
import { loadPhotoURL } from "../db.js";
import { tileStateBadge } from "../shared/voice_tile.mjs";

const $ = (id) => document.getElementById(id);
const ALL = (db, sql, p = []) => db.all(sql, p);

/** Builtin family tiles that draw as word tiles (Design_System § Tiles)
 *  instead of quiet chrome — the same role the family's words carry.
 *  `?` is the question family: its tile is Purple like `what`. */
const FAMILY_TILE = {
  bf_q: { role: "Purple", art: "icons/question-mark.svg" },
};

export function mountGrid({
  db, locale, catalog, sentence, live, cellEls,
  speak, tileApi,
  tap, shownLabel, metaFor, photoFor, senseById, getCounts,
  editPointer, toast, layerMark, spotChrome, sizeStrip, openExpand,
}) {
  /** The profile's one Cells setting (014 § 3): which coordinate-map
   *  layout the board, group pages, and strip all draw at. Anything the
   *  catalog doesn't define falls back to grid60. */
  function boardGeom() {
    const name = ALL(
      db, "SELECT board_layout AS l FROM learner_profile WHERE id = 'prf_local'",
    )[0]?.l ?? "grid60";
    const layout = catalog.layouts?.[name] ?? catalog.layouts?.grid60
      ?? { cols: 10, rows: 6, anchors: [] };
    return {
      name: catalog.layouts?.[name] ? name : "grid60",
      cols: layout.cols,
      rows: layout.rows,
      cells: layout.cols * layout.rows,
      anchors: new Map((layout.anchors ?? []).map((a) => [a.slot, a])),
    };
  }

  /** Set an <img> to a sense's art key: catalog keys are shipped asset
   *  paths; `blob:` keys are family photos in OPFS, resolved through the
   *  blob loader (which lazy-fetches a sealed copy). Returns true when the
   *  art is a photo — the caller adds the cover-fit `.photo` class. */
  function artInto(img, art) {
    if (art.startsWith("blob:")) {
      loadPhotoURL(art).then((url) => { if (url) img.src = url; });
      return true;
    }
    img.src = `/${art}`;
    return false;
  }

  /** One word tile (Design_System § Tiles): role-tinted label strip on
   *  top, art on white below. Photos fill the art area edge to edge. */
  function wordTile({ label, role, art = null, photoURL = null }) {
    const el = document.createElement("button");
    el.className = `cell r-${role ?? "None"}`;
    const lb = document.createElement("span");
    lb.className = "tlabel";
    lb.textContent = label;
    const ar = document.createElement("span");
    ar.className = "tart";
    if (art || photoURL) {
      const img = document.createElement("img");
      img.alt = "";
      img.decoding = "async"; // 041 B7 — tile decodes off the paint path
      ar.appendChild(img);
      if (photoURL) {
        img.src = photoURL;
        el.classList.add("photo");
      } else if (artInto(img, art)) {
        el.classList.add("photo");
      }
    }
    el.append(lb, ar);
    return el;
  }

  /** Uniform-size labels: every label on a board renders at the same size —
   *  two lines fit the strip at nominal, so a long label wraps (long words
   *  hyphenate) instead of shrinking. The shrink loop is the last resort
   *  for a label that can't fit even wrapped. Text is measured with a
   *  Range — scrollHeight reports the flex item's quirks, not the glyphs. */
  function fitLabels(root) {
    document.fonts.ready.then(() => {
      const range = document.createRange();
      for (const lb of root.querySelectorAll(".tlabel, .plabel")) {
        const maxW = lb.clientWidth;
        const maxH = lb.clientHeight;
        if (!maxW || !maxH) continue;
        // Tile labels: nominal fits two lines in the strip. Bar labels are
        // single-line horizontal cards — keep the old one-line target.
        let px = Math.floor(maxH * (lb.classList.contains("tlabel") ? 0.38 : 0.8));
        lb.style.fontSize = `${px}px`;
        for (let guard = 18; guard > 0 && px > 8; guard--) {
          range.selectNodeContents(lb);
          const r = range.getBoundingClientRect();
          if (r.width <= maxW && r.height <= maxH) break;
          px = Math.max(8, Math.floor(px * 0.86));
          lb.style.fontSize = `${px}px`;
        }
      }
      // Words only: one text size across the tiles, so "I" isn't huge
      // beside "make" — the smallest one-word fit sets it; two-word labels
      // keep their own fit, never larger than that.
      if (document.body.classList.contains("words-only")) {
        const tiles = [...root.querySelectorAll(".cell .tlabel")];
        const one = tiles.filter((lb) => !lb.textContent.trim().includes(" "));
        const px = Math.min(...one.map((lb) => parseFloat(lb.style.fontSize) || Infinity));
        if (Number.isFinite(px)) {
          for (const lb of tiles) {
            lb.style.fontSize = `${Math.min(px, parseFloat(lb.style.fontSize) || px)}px`;
          }
        }
      }
    });
  }

  /** Tiles change size without re-rendering (the editor's word card opens
   *  beside the board); refit labels whenever a grid's box changes. */
  {
    const seen = new Map();
    const dirty = new Set();
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const w = Math.round(e.contentRect.width), h = Math.round(e.contentRect.height);
        const prev = seen.get(e.target);
        seen.set(e.target, `${w}x${h}`);
        if (prev === `${w}x${h}`) continue;
        if (!dirty.size) {
          requestAnimationFrame(() => { for (const t of dirty) fitLabels(t); dirty.clear(); });
        }
        dirty.add(e.target);
      }
    });
    for (const id of ["grid", "ed-grid"]) {
      const el = document.getElementById(id);
      if (el) ro.observe(el);
    }
  }

  /* --- "Show me where": when a non-core word arrives from the strip or
     the keyboard, halo the Groups anchor and caption the path (Groups ›
     Food) for 1.5 s. Out-of-flow and pointer-events:none — no sound, no
     blocking, no layout shift. A new tap cancels it. --- */
  let hintTimer = null;

  function clearGroupHint() {
    clearTimeout(hintTimer);
    hintTimer = null;
    $("anchor-groups").classList.remove("halo");
    $("pathhint").hidden = true;
  }

  function showGroupHint(kind, id) {
    let name = null;
    if (kind === "sense") {
      // core words need no backup route — they are always on screen
      if (ALL(db, "SELECT 1 AS x FROM core_cell WHERE layout = ? AND sense_id = ?", [boardGeom().name, id]).length) return;
      const row = ALL(
        db,
        `SELECT g.id, g.name FROM group_membership gm JOIN board_group g ON g.id = gm.group_id
         WHERE gm.item_kind = 'sense' AND gm.item_id = ? AND g.kind = 'builtin'
         ORDER BY g.index_slot`,
        [id],
      )[0];
      if (row) name = groupDisplayName(db, row, locale);
    } else if (kind === "entity") {
      const row = ALL(
        db,
        `SELECT g.id, g.name FROM group_membership gm JOIN board_group g ON g.id = gm.group_id
         WHERE gm.item_kind = 'entity' AND gm.item_id = ?
         ORDER BY g.index_slot`,
        [id],
      )[0];
      if (row) name = groupDisplayName(db, row, locale);
    }
    if (!name) return;
    const anchor = $("anchor-groups");
    const r = anchor.getBoundingClientRect();
    const hint = $("pathhint");
    hint.textContent = `Groups › ${name}`;
    hint.style.left = `${r.left + r.width / 2}px`;
    hint.style.top = `${r.bottom + 4}px`;
    hint.hidden = false;
    anchor.classList.add("halo");
    clearTimeout(hintTimer);
    hintTimer = setTimeout(clearGroupHint, 1500);
  }
  document.addEventListener("pointerdown", clearGroupHint, { capture: true });

  /**
   * One effective home cell's tile, without gestures — the core grid and
   * every group page's reserved cells (027 B3) draw the same tile. A person
   * shows the family's kind color (018 D7 — neutral until classified) and
   * photo; a hidden word keeps its slot as a ghost (Design_System mask
   * tokens — faded, never tappable or spoken; Masking § 2). `say` is what a
   * tap speaks, null for a ghost.
   */
  function homeTile(c, masked = maskedSenseIds(db)) {
    if (c.kind === "entity") {
      const el = wordTile({ label: c.label, role: c.fitzgerald_role ?? "None" });
      // 028 § 5.2: the supporter sees the voice state on the tile while a
      // mint is in flight or queued. The child hears silence until ready.
      const vst = tileApi.status(c.label);
      if (vst && vst !== "ready") {
        const b = document.createElement("span");
        b.className = "vbadge";
        b.textContent = tileStateBadge(vst);
        el.appendChild(b);
      }
      loadPhotoURL(photoFor(c.entity_id)).then((url) => {
        if (!url) return;
        const img = document.createElement("img");
        img.src = url;
        img.alt = "";
        img.decoding = "async";
        el.querySelector(".tart").appendChild(img);
        el.classList.add("photo");
      });
      return { el, say: c.label };
    }
    if (masked.has(c.sense_id)) {
      const ghost = wordTile({ label: c.label, role: c.fitzgerald_role, art: metaFor(c.sense_id).art });
      ghost.classList.add("masked");
      ghost.disabled = true;
      return { el: ghost, say: null };
    }
    const say = shownLabel(c.sense_id, c.label);
    return { el: wordTile({ label: say, role: c.fitzgerald_role, art: metaFor(c.sense_id).art }), say };
  }

  function renderGrid() {
    const geom = boardGeom();
    live.movedSet = moveMarks(db);
    const cells = coreCells(db, geom.name, locale);
    const bySlot = new Map(cells.map((c) => [c.slot_index, c]));
    const masked = maskedSenseIds(db);
    // 018 D10 📊: one query per repaint, a badge on every tile.
    const edit = live.editing || live.view === "editor"; // 031: the editor is Edit mode, always
    const counts = edit && live.countsOn ? getCounts() : null;
    const withCount = (el, kind, id) => {
      if (!counts) return el;
      const n = document.createElement("span");
      n.className = "ucount";
      n.textContent = String(counts.get(`${kind}:${id}`) ?? 0);
      el.appendChild(n);
      return el;
    };
    const grid = $("grid");
    grid.style.gridTemplateColumns = `repeat(${geom.cols}, minmax(0, 1fr))`;
    grid.style.gridTemplateRows = `repeat(${geom.rows}, minmax(0, 1fr))`;
    sizeStrip(geom.cols);
    grid.innerHTML = "";
    cellEls.clear();
    // Every slot renders: a missing cell is a dashed placeholder, never a
    // collapsed gap — the coordinate map is the motor plan.
    for (let slot = 0; slot < geom.cells; slot++) {
      const anchor = geom.anchors.get(slot);
      if (anchor?.kind === "groups") {
        const el = document.createElement("button");
        el.className = "cell anchor-cell";
        el.innerHTML = `<span class="glyph"><img class="gicon" src="/icons/folder.svg" alt=""></span>`;
        el.addEventListener("click", live.groupsUi.openGroupIndex);
        grid.appendChild(el);
        continue;
      }
      if (anchor?.kind === "family") {
        // A Smart bar family tile (014 § 5): speaks its label if it has
        // one ("Pain" → "I'm in pain"; `?` opens silently), then opens the
        // family in the bar. Never a sentence pick, never a drop target.
        const f = familyRow(db, anchor.family);
        const look = FAMILY_TILE[anchor.family];
        const el = look
          ? wordTile({ label: f?.name ?? "?", role: look.role, art: look.art })
          : document.createElement("button");
        if (!look) {
          el.className = "cell anchor-cell family-cell";
          el.innerHTML = `<span class="glyph">${f?.glyph ?? "▸"}</span><span class="lbl">${f?.name ?? "?"}</span>`;
        }
        el.addEventListener("click", () => {
          if (live.picking) return;
          if (f?.speaks) speak(f.speaks);
          openExpand(anchor.family);
        });
        grid.appendChild(el);
        continue;
      }
      const c = bySlot.get(slot);
      if (!c) {
        const empty = document.createElement("div");
        empty.className = "cell empty";
        empty.dataset.slot = slot; // a legal drop target in Edit mode
        if (edit) {
          // 014 § 9: an empty cell takes whatever the adult picks — a word
          // or a person — via the place picker.
          empty.setAttribute("role", "button");
          empty.setAttribute("aria-label", "Place a word or person here");
          empty.addEventListener("click", () => live.placeUi.openPicker(slot));
        } else {
          empty.setAttribute("aria-hidden", "true");
        }
        grid.appendChild(empty);
        continue;
      }
      if (c.kind === "entity") {
        const { el } = homeTile(c, masked);
        el.dataset.slot = slot;
        el.dataset.item = `entity:${c.entity_id}`;
        if (edit) {
          // The editor (031): a tap selects the word and opens its card —
          // the card's Replace opens the placement sheet (D10). Drag moves.
          editPointer(el, {
            onTap: () => live.editorUi.select({ item_kind: "entity", item_id: c.entity_id, label: c.label }),
            onDrop: (to) => {
              const mv = placeOnBoard(db, geom.name, "entity", c.entity_id, to, {
                anchors: new Set(geom.anchors.keys()),
              });
              if (!mv) return;
              renderGrid();
              toast(`Moved ${c.label}`, () => {
                placeOnBoard(db, geom.name, "entity", c.entity_id, mv.from);
                renderGrid();
              });
            },
          });
        } else {
          el.addEventListener("click", () => tap(c.label, "entity", c.entity_id));
        }
        layerMark(el, `entity:${c.entity_id}`, { board: true });
        cellEls.set(c.entity_id, el);
        grid.appendChild(withCount(el, "entity", c.entity_id));
        continue;
      }
      const { el, say: cellLabel } = homeTile(c, masked);
      if (cellLabel === null) {
        if (!edit) {
          // Masking § 2: the child sees an empty cell — the spot is
          // reserved, nothing shows, nothing taps. Only the adult's view
          // reveals the hidden word.
          const blank = document.createElement("div");
          blank.className = "cell empty";
          blank.setAttribute("aria-hidden", "true");
          grid.appendChild(withCount(blank, "sense", c.sense_id));
          continue;
        }
        // In the editor the ghost shows the word lives here: the slot is
        // taken — a tap opens its card (Show word), a drop swaps its cell
        // like any placed word.
        el.disabled = false;
        el.style.pointerEvents = "auto";
        el.dataset.slot = slot;
        el.dataset.item = `sense:${c.sense_id}`;
        editPointer(el, {
          onTap: () => live.editorUi.select({ item_kind: "sense", item_id: c.sense_id, label: c.label }),
          onDrop: (to) => {
            const mv = moveCore(db, geom.name, c.sense_id, to, { anchors: new Set(geom.anchors.keys()) });
            if (!mv) return;
            renderGrid();
            toast(`Moved ${c.label}`, () => {
              moveCore(db, geom.name, c.sense_id, mv.from);
              renderGrid();
            });
          },
        });
        layerMark(el, `sense:${c.sense_id}`, { board: true });
        cellEls.set(c.sense_id, el);
        grid.appendChild(withCount(el, "sense", c.sense_id));
        continue;
      }
      el.dataset.slot = slot;
      el.dataset.item = `sense:${c.sense_id}`;
      if (edit) {
        // Adult move (014 § 2 ruling 1): drag onto a word swaps, onto an
        // empty slot moves; anchors and reserved slots refuse. In the
        // editor (031) a tap selects the word and opens its card — the
        // card's Replace opens the placement sheet (D10).
        editPointer(el, {
          onTap: () => live.editorUi.select({ item_kind: "sense", item_id: c.sense_id, label: c.label }),
          onDrop: (to) => {
            const mv = moveCore(db, geom.name, c.sense_id, to, { anchors: new Set(geom.anchors.keys()) });
            if (!mv) return;
            renderGrid();
            toast(`Moved ${c.label}`, () => {
              moveCore(db, geom.name, c.sense_id, mv.from);
              renderGrid();
            });
          },
        });
      } else {
        el.addEventListener("click", () => tap(cellLabel, "sense", c.sense_id));
      }
      layerMark(el, `sense:${c.sense_id}`, { board: true });
      cellEls.set(c.sense_id, el);
      grid.appendChild(withCount(el, "sense", c.sense_id));
    }
    live.boardSenseIds = new Set(cells.map((c) => c.sense_id));
    spotChrome();
    fitLabels(grid);
  }

  /** "Highlight likely next words" (Parent Corner, default OFF): up to
   *  three core cells the ranker invites next get a thicker inner border
   *  in their own role color. Grid only — never while editing, in a
   *  group, or with the keyboard open (the grid isn't visible). The halo
   *  state itself (`likelySet`) lives in board.js — `layerMark` rides it
   *  on every render so halos survive a repaint. */
  function applyLikely() {
    const next = new Set();
    if (live.highlightNext && !live.editing && live.view === "board" && !live.kbUi.isOpen() && sentence.length) {
      const sents = sentence.map((s) => ({ kind: s.kind, id: s.id }));
      for (const c of stripRanked(db, sents, Date.now(), locale, live.phrases).shown) {
        if (c.kind !== "sense") continue;
        // A stand-in person on the board takes the word's halo too —
        // Mama's cell glows when `mom` is likely (014 slice 11).
        const id = cellEls.has(c.id) ? c.id : (entityForSense(db, c.id)?.id ?? null);
        if (id === null || !cellEls.has(id)) continue;
        next.add(id);
        if (next.size === 3) break;
      }
    }
    for (const id of new Set([...live.likelySet, ...next])) {
      const el = cellEls.get(id);
      if (el) el.classList.toggle("likely", next.has(id));
    }
    live.likelySet = next;
  }

  /** One word's board tile, outside the grid — the first-open preview and
   *  the Spotlight page's pictures draw the tile the board draws. */
  function tileForSense(senseId) {
    const w = senseById(senseId);
    return wordTile({ label: w?.label ?? "", role: w?.fitzgerald_role, art: metaFor(senseId).art });
  }

  /** A still copy of the main board for Settings › Overview: the same
   *  coreCells and tiles as renderGrid, drawn small and inert. The
   *  caller owns the tap (it opens the editor). */
  function miniGrid(box) {
    const geom = boardGeom();
    const bySlot = new Map(coreCells(db, geom.name, locale).map((c) => [c.slot_index, c]));
    const masked = maskedSenseIds(db);
    box.style.gridTemplateColumns = `repeat(${geom.cols}, minmax(0, 1fr))`;
    box.style.setProperty("--mini-ratio", String((geom.cols * 1.15) / geom.rows));
    box.replaceChildren();
    for (let slot = 0; slot < geom.cells; slot++) {
      const anchor = geom.anchors.get(slot);
      const look = anchor?.kind === "family" && FAMILY_TILE[anchor.family];
      let el;
      if (look) el = wordTile({ label: familyRow(db, anchor.family)?.name ?? "?", role: look.role, art: look.art });
      else if (anchor) {
        el = document.createElement("span");
        el.className = "cell anchor-cell";
      } else if (bySlot.has(slot)) el = homeTile(bySlot.get(slot), masked).el;
      else {
        el = document.createElement("span");
        el.className = "cell empty";
      }
      box.append(el);
    }
  }

  return {
    renderGrid, boardGeom, wordTile, artInto, fitLabels, miniGrid,
    homeTile, tileForSense, applyLikely, showGroupHint,
  };
}
