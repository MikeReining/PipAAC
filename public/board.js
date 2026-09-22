/**
 * Board runtime: renders grid60 from the on-device SQLite, sentence bar,
 * groups, and the name+photo add flow. Catalog senses speak via bundled
 * clips (schema §7); personal entities use device TTS.
 */
import { bootDb, savePhoto, loadPhotoURL } from "./db.js";
import { logSelection, stripCandidates } from "./shared/funnel.mjs";
import { normalizeV1 } from "./shared/normalize.mjs";
import {
  catalogMatches,
  createGroup,
  deleteGroup,
  groupIndex,
  groupPage,
  moveGroup,
  moveItem,
  pageCount,
  placeItem,
  removeItem,
  swapGroups,
  swapItems,
} from "./shared/groups.mjs";

const $ = (id) => document.getElementById(id);
const ALL = (db, sql, p = []) => db.all(sql, p);
const RUN = (db, sql, p = []) => db.prepare(sql).run(...p);

const { db, catalog } = await bootDb();
const sentence = []; // [{kind, id, text}]
let addTarget = null;  // board_group id the add form files into
let view = "board";    // 'board' | 'groupIndex' | 'group' — groups are a board mode, not a modal
let groupKey = null;   // board_group id of the open group page
let groupPageNo = 0;   // current page of the open group
let editing = false; // caregiver Edit mode — same gesture on index and pages
let lifted = null;   // index: board_group id; page: {item_kind, item_id}

const SILENT_SLOT_MS = 400;
const audio = new Audio();

/** Resolve the ready clip for a sense under the bundled default voice (§7.2). */
function clipKeyFor(senseId) {
  const row = ALL(
    db,
    `SELECT c.key FROM clip c
     JOIN label l ON l.utterance_id = c.utterance_id
     WHERE l.sense_id = ? AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = 'en'
       AND c.voice_id = 'voi_default_en' AND c.status = 'ready'`,
    [senseId],
  )[0];
  return row?.key ?? null;
}

function speak(text) {
  // device_tts lane — used for personal entities (§7.3)
  speechSynthesis.cancel();
  speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

function playClip(key) {
  return new Promise((resolve) => {
    audio.src = `/${key}`;
    audio.onended = resolve;
    audio.onerror = resolve;
    audio.play().catch(resolve);
  });
}

/** Speak one tapped item: bundled clip for senses, device TTS for entities. */
async function speakItem(item) {
  if (item.kind === "sense") {
    const key = clipKeyFor(item.id);
    if (key) return playClip(key);
    return new Promise((r) => setTimeout(r, SILENT_SLOT_MS)); // §7 silent slot
  }
  speak(item.text);
}

/** Sentence bar: one slot per item in order; misses hold 400 ms (§7.4). */
async function speakSentence() {
  for (const item of sentence) await speakItem(item);
}

function renderBar() {
  const bar = $("bar");
  bar.innerHTML = "";
  bar.appendChild(document.createTextNode(sentence.map((s) => s.text).join(" ")));
  if (kbText) {
    const p = document.createElement("span");
    p.className = "partial";
    p.textContent = (sentence.length ? " " : "") + kbText + "▌";
    bar.appendChild(p);
  }
}
$("bar").addEventListener("click", () => {
  if (sentence.length) speakSentence();
});
$("clear").addEventListener("click", () => {
  sentence.pop();
  renderBar();
  renderStrip();
});

const senseByLemma = (text) =>
  ALL(
    db,
    `SELECT s.id, l.text AS label, s.fitzgerald_role FROM sense s
     JOIN label l ON l.sense_id = s.id
       AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = 'en'
     WHERE l.normalized_text = ?
     ORDER BY l.default_for_text DESC`,
    [normalizeV1(text)],
  )[0];

/** The four resting cards shown when the sentence bar is empty. */
async function idleStarters() {
  const cards = [];
  const hello = senseByLemma("hello");
  if (hello) {
    cards.push({ label: "hello", glyph: "👋", role: hello.fitzgerald_role,
      onTap: () => tap(hello.label, "sense", hello.id) });
  }
  cards.push({ label: "Food", glyph: "🥞", role: "Pink",
    onTap: () => openGroup("grp_food") });
  const top = ALL(
    db,
    `SELECT e.id, e.spoken_name, e.photo_key FROM personal_entity e
     LEFT JOIN learner_event_log l ON l.item_kind = 'entity' AND l.item_id = e.id
     GROUP BY e.id ORDER BY COUNT(l.id) DESC, MAX(l.selected_at) DESC, e.rowid LIMIT 1`,
  )[0];
  if (top) cards.push({ entity: top });
  const help = senseByLemma("help");
  if (help) {
    cards.push({ label: "help", glyph: "🆘", role: help.fitzgerald_role,
      onTap: () => tap(help.label, "sense", help.id) });
  }
  return cards.slice(0, 4);
}

async function predCard(c) {
  const el = document.createElement("button");
  el.className = `pred${c.entity ? " r-Yellow" : c.role ? ` r-${c.role}` : ""}`;
  const sw = document.createElement("span");
  sw.className = "swatch";
  const lb = document.createElement("span");
  lb.className = "label";
  if (c.entity) {
    const url = await loadPhotoURL(c.entity.photo_key);
    if (url) {
      const img = document.createElement("img");
      img.src = url;
      sw.appendChild(img);
    } else {
      sw.textContent = c.entity.spoken_name[0].toUpperCase();
    }
    lb.textContent = c.entity.spoken_name;
  } else {
    sw.textContent = c.glyph ?? c.label[0].toUpperCase();
    lb.textContent = c.label;
  }
  el.appendChild(sw);
  el.appendChild(lb);
  const onTap =
    c.onTap ??
    (c.entity ? () => tap(c.entity.spoken_name, "entity", c.entity.id) : () => {});
  el.addEventListener("click", onTap);
  return el;
}

function ghostCard() {
  const el = document.createElement("div");
  el.className = "pred ghost";
  const sw = document.createElement("span");
  sw.className = "swatch";
  el.appendChild(sw);
  const lb = document.createElement("span");
  lb.className = "label";
  lb.textContent = "···";
  el.appendChild(lb);
  return el;
}

async function renderStrip() {
  const strip = $("strip");
  strip.querySelectorAll(".pred").forEach((n) => n.remove());
  const firstAnchor = $("anchor-groups");
  let cards;
  if (kbText) {
    // mid-word: the strip switches from continuations to completions
    cards = kbCompletions();
  } else if (sentence.length === 0) {
    cards = await idleStarters();
  } else {
    const items = stripCandidates(
      db,
      sentence.map((s) => ({ kind: s.kind, id: s.id })),
    );
    cards = [];
    for (const c of items) {
      if (c.kind === "entity") {
        cards.push({
          entity: ALL(db, "SELECT * FROM personal_entity WHERE id = ?", [c.id])[0],
        });
      } else {
        const w = ALL(
          db,
          `SELECT s.id, l.text AS label, s.fitzgerald_role FROM sense s
           JOIN label l ON l.sense_id = s.id
             AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = 'en'
           WHERE s.id = ?`,
          [c.id],
        )[0];
        cards.push({ label: w.label, role: w.fitzgerald_role,
          onTap: () => tap(w.label, "sense", w.id) });
      }
    }
  }
  for (let i = 0; i < 4; i++) {
    const el = cards[i] ? await predCard(cards[i]) : ghostCard();
    strip.insertBefore(el, firstAnchor);
  }
}

function tap(text, kind = "sense", id = null) {
  const item = { kind, id, text };
  sentence.push(item);
  renderBar();
  speakItem(item);
  if (id) logSelection(db, kind, id);
  renderStrip();
}

function renderGrid() {
  const cells = ALL(
    db,
    `SELECT cc.slot_index, cc.sense_id, l.text AS label, s.fitzgerald_role
     FROM core_cell cc
     JOIN sense s ON s.id = cc.sense_id
     JOIN label l ON l.sense_id = cc.sense_id
       AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = 'en'
     WHERE cc.layout = 'grid60'
     ORDER BY cc.slot_index`,
  );
  const grid = $("grid");
  grid.style.gridTemplateColumns = "repeat(10, 1fr)";
  grid.style.gridTemplateRows = "repeat(6, 1fr)";
  for (const c of cells) {
    const el = document.createElement("div");
    el.className = `cell r-${c.fitzgerald_role}`;
    el.textContent = c.label;
    el.addEventListener("click", () => tap(c.label, "sense", c.sense_id));
    grid.appendChild(el);
  }
}

/* --- overlays --- */
const open = (id) => $(id).classList.add("open");
const close = (id) => $(id).classList.remove("open");
document.querySelectorAll("[data-close]").forEach((b) =>
  b.addEventListener("click", () => b.closest(".overlay").classList.remove("open")),
);
// Backdrop tap and Escape dismiss any open overlay — a modal that can't be
// dismissed strands the learner.
document.querySelectorAll(".overlay").forEach((o) =>
  o.addEventListener("click", (e) => {
    if (e.target === o) o.classList.remove("open");
  }),
);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const anyOverlay = document.querySelector(".overlay.open");
    if (anyOverlay) {
      document.querySelectorAll(".overlay.open").forEach((o) => o.classList.remove("open"));
      return;
    }
    if (editing) {
      setEditing(false);
      rerenderView();
      return;
    }
    if (view === "group") return openGroupIndex();
    if (view === "groupIndex") return setView("board");
    if (kbOpen) closeKb();
    return;
  }
  if (!kbOpen) return;
  if (/^[a-z.'?]$/i.test(e.key)) kbType(e.key.toLowerCase());
  else if (e.key === "Backspace") {
    kbText = kbText.slice(0, -1);
    renderBar();
    renderStrip();
  } else if (e.key === " ") {
    e.preventDefault();
    commitKb();
  } else if (e.key === "Enter") {
    commitKb();
    closeKb();
  }
});
$("corner").addEventListener("click", () => {
  if (editing) {
    setEditing(false);
    rerenderView();
    return;
  }
  open("menu");
});
$("edit-groups").addEventListener("click", () => {
  close("menu");
  setEditing(true);
  openGroupIndex();
});
$("add-mywords").addEventListener("click", () => {
  close("menu");
  openAddForm("grp_my_words");
});

/* --- permanent utility anchors --- */
$("anchor-kb").addEventListener("click", () => {
  setView("board");
  openKb();
});
$("anchor-groups").addEventListener("click", openGroupIndex);

/* --- keyboard: a board mode, not a modal. Letters replace the grid in
   place (same 10×6 geometry). Typing feeds prefix completions into the
   strip; space commits the word (and speaks it); Done commits + exits. */
let kbOpen = false;
let kbText = "";
let kbBuilt = false;

/** Grid-area view swap: board | groupIndex | group render into
 *  #groupgrid, keyboard into #kb — same physical space, strip and bar
 *  never move. */
function setView(v) {
  view = v;
  if (v !== "board" && kbOpen) closeKb();
  document.body.classList.toggle("groups", v !== "board");
  if (v === "groupIndex") renderGroupIndex();
  else if (v === "group") renderGroupPage();
}

function openKb() {
  if (!kbBuilt) buildKb();
  kbOpen = true;
  document.body.classList.add("kb");
  renderBar();
  renderStrip();
}
function closeKb() {
  kbOpen = false;
  document.body.classList.remove("kb");
}

function kbKey(label, cls, onTap) {
  const b = document.createElement("button");
  b.className = `kb-key${cls ? ` ${cls}` : ""}`;
  b.textContent = label;
  b.addEventListener("click", onTap);
  return b;
}

function buildKb() {
  kbBuilt = true;
  const kb = $("kb");
  for (const ch of "abcdefghij") kb.appendChild(kbKey(ch, "", () => kbType(ch)));
  for (const ch of "klmnopqrst") kb.appendChild(kbKey(ch, "", () => kbType(ch)));
  for (const ch of "uvwxyz.'?") kb.appendChild(kbKey(ch, "", () => kbType(ch)));
  kb.appendChild(kbKey("⌫", "kb-util", () => {
    kbText = kbText.slice(0, -1);
    renderBar();
    renderStrip();
  }));
  kb.appendChild(kbKey("space", "kb-util kb-space", commitKb));
  kb.appendChild(kbKey("Done ✓", "kb-util kb-done", () => {
    commitKb();
    closeKb();
  }));
}

function kbType(ch) {
  kbText += ch;
  renderBar();
  renderStrip();
}

/** Commit the typed word: catalog hit speaks with the bundled voice, a
 *  non-word speaks via device TTS (schema §7.3). Typing never speaks. */
function commitKb() {
  const t = kbText.trim();
  kbText = "";
  renderBar();
  if (!t) {
    renderStrip();
    return;
  }
  const hit = senseByLemma(t);
  if (hit) tap(hit.label, "sense", hit.id);
  else tap(t, "typed", null);
}

/** Prefix completions for the strip while a word is in progress. */
function kbCompletions() {
  const prefix = normalizeV1(kbText);
  if (!prefix) return [];
  const senses = ALL(
    db,
    `SELECT s.id, l.text AS label, s.fitzgerald_role,
       (SELECT COUNT(*) FROM learner_event_log le
         WHERE le.item_kind = 'sense' AND le.item_id = s.id) AS freq
     FROM label l JOIN sense s ON s.id = l.sense_id
     WHERE l.normalized_text LIKE ? ESCAPE '\\'
       AND l.default_for_text = 1
       AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = 'en'`,
    [prefix.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_") + "%"],
  ).map((w) => ({
    label: w.label,
    role: w.fitzgerald_role,
    freq: w.freq,
    onTap: () => {
      kbText = "";
      renderBar();
      tap(w.label, "sense", w.id);
    },
  }));
  const ents = ALL(
    db,
    `SELECT e.*,
       (SELECT COUNT(*) FROM learner_event_log le
         WHERE le.item_kind = 'entity' AND le.item_id = e.id) AS freq
     FROM personal_entity e WHERE lower(e.spoken_name) LIKE ?`,
    [`${prefix.toLowerCase().replaceAll("%", "")}%`],
  ).map((e) => ({
    entity: e,
    freq: e.freq,
    onTap: () => {
      kbText = "";
      renderBar();
      tap(e.spoken_name, "entity", e.id);
    },
  }));
  return [...ents, ...senses]
    .sort((a, b) => b.freq - a.freq || (a.label ?? a.entity.spoken_name).length - (b.label ?? b.entity.spoken_name).length)
    .slice(0, 4);
}

/* --- groups: an in-place board mode, not a modal. The group index and
   each group page render into #groupgrid — the same physical space and
   cell size as the core grid. Slot 0 is always "back"; slot 1 is the
   Edit-mode action, rendered only while editing so the child never sees
   adult controls. Group positions persist in board_group.index_slot and
   items in group_cell — the same motor-memory law as core_cell: slots
   only move in Edit mode (tap to lift, tap a slot to place; occupied
   slot swaps). All writes go through shared/groups.mjs. --- */

/** One mode everywhere: entering Edit marks the body (dashed borders)
 *  and turns the corner button into ✓ Done; leaving clears the lift. */
function setEditing(on) {
  editing = on;
  lifted = null;
  document.body.classList.toggle("editing", on);
  $("corner").textContent = on ? "✓ Done" : "✚";
  $("corner").title = on ? "Done editing" : "Parent corner";
}

/** Re-render whatever view is on screen after a mode change or write. */
function rerenderView() {
  if (view === "groupIndex") renderGroupIndex();
  else if (view === "group") renderGroupPage();
}

function navCell(label, onTap) {
  const el = document.createElement("button");
  el.className = "gcell nav";
  el.textContent = label;
  el.addEventListener("click", onTap);
  return el;
}

/** One group on the index. `row` is a board_group row; the label and
 *  glyph come from the row — custom groups show their photo, else 🗂️. */
function groupIndexCell(row) {
  const el = document.createElement("button");
  el.className = "gcell";
  el.dataset.slot = row.index_slot;
  el.dataset.group = row.id;
  const g = document.createElement("span");
  g.className = "glyph";
  g.textContent = row.glyph ?? "🗂️";
  if (row.photo_key) {
    loadPhotoURL(row.photo_key).then((url) => {
      if (!url) return;
      const img = document.createElement("img");
      img.src = url;
      g.replaceChildren(img);
    });
  }
  const lb = document.createElement("span");
  lb.className = "glabel";
  lb.textContent = row.name;
  el.appendChild(g);
  el.appendChild(lb);
  el.addEventListener("click", () => {
    if (!editing) return openGroup(row.id);
    if (!lifted) {
      lifted = row.id;
      renderGroupIndex();
      return;
    }
    if (lifted === row.id) {
      // Dropping a group on itself sets it back down and opens it — the
      // only way into a group page while editing. Escape drops instead.
      openGroup(row.id);
      return;
    }
    // occupied slot: swap coordinates
    swapGroups(db, lifted, row.id);
    lifted = null;
    renderGroupIndex();
  });
  return el;
}

/** Slot 1 is reserved in both modes: the Edit-mode action while
 *  editing, a disabled blank otherwise — items never shift. */
function editSlotCell(label, onTap) {
  if (label && onTap) return navCell(label, onTap);
  const blank = document.createElement("button");
  blank.className = "gcell empty";
  blank.disabled = true;
  return blank;
}

/** Delete confirmation is an in-sheet two-button ask, never
 *  window.confirm — the learner can't be left inside a dialog. */
function askDeleteGroup(row) {
  $("del-title").textContent = `Delete ${row.name}?`;
  $("del-yes").onclick = () => {
    deleteGroup(db, row.id);
    lifted = null;
    close("delform");
    renderGroupIndex();
  };
  open("delform");
}

function renderGroupIndex() {
  const zg = $("groupgrid");
  zg.innerHTML = "";
  const rows = groupIndex(db);
  const placed = new Map(rows.map((g) => [g.index_slot, g]));
  const liftedRow = lifted ? rows.find((g) => g.id === lifted) : null;
  for (let slot = 0; slot < 60; slot++) {
    if (slot === 0) {
      zg.appendChild(navCell("← Board", () => setView("board")));
      continue;
    }
    if (slot === 1) {
      if (editing && liftedRow?.kind === "custom") {
        zg.appendChild(editSlotCell("Delete group", () => askDeleteGroup(liftedRow)));
      } else {
        zg.appendChild(editSlotCell(editing && !lifted && "+ Group", () => open("groupform")));
      }
      continue;
    }
    const row = placed.get(slot);
    if (row) {
      const el = groupIndexCell(row);
      if (editing && row.id === lifted) el.classList.add("lifted");
      zg.appendChild(el);
      continue;
    }
    const empty = document.createElement("button");
    empty.className = "gcell empty";
    if (editing && slot >= 10) {
      empty.classList.add("drop");
      empty.addEventListener("click", () => {
        if (!lifted) return;
        moveGroup(db, lifted, slot);
        lifted = null;
        renderGroupIndex();
      });
    } else {
      empty.disabled = true;
    }
    zg.appendChild(empty);
  }
}

function openGroupIndex() {
  lifted = null;
  setView("groupIndex");
}

async function openGroup(groupId) {
  lifted = null;
  groupKey = groupId;
  groupPageNo = 0;
  setView("group");
}

function senseCell(w, onTap) {
  const el = document.createElement("button");
  el.className = `cell r-${w.fitzgerald_role}`;
  el.textContent = w.label;
  el.addEventListener("click", onTap);
  return el;
}

async function entityCell(e, onTap) {
  const el = document.createElement("button");
  el.className = "cell r-Yellow entity";
  const url = await loadPhotoURL(e.photo_key);
  if (url) {
    const img = document.createElement("img");
    img.src = url;
    el.appendChild(img);
  }
  const lb = document.createElement("span");
  lb.textContent = e.spoken_name;
  el.appendChild(lb);
  el.addEventListener("click", onTap);
  return el;
}

/** The gesture, same as the index: tap lifts, the same cell drops,
 *  another item swaps. Moves to an empty slot happen on this page only —
 *  cross-page moves are out of scope. */
function itemGesture(item) {
  if (!lifted) {
    lifted = { item_kind: item.item_kind, item_id: item.item_id };
  } else if (lifted.item_kind === item.item_kind && lifted.item_id === item.item_id) {
    lifted = null;
  } else {
    swapItems(db, groupKey, lifted, { item_kind: item.item_kind, item_id: item.item_id });
    lifted = null;
  }
  renderGroupPage();
}

/** One item on a group page — a catalog sense or a personal entity at its
 *  stored slot. In Edit mode the tap lifts instead of speaking. */
async function itemCell(item) {
  const speak = () =>
    item.item_kind === "sense"
      ? tap(item.label, "sense", item.item_id)
      : tap(item.label, "entity", item.item_id);
  const onTap = editing ? () => itemGesture(item) : speak;
  if (item.item_kind === "sense") {
    return senseCell({ fitzgerald_role: item.fitzgerald_role, label: item.label }, onTap);
  }
  return entityCell({ spoken_name: item.label, photo_key: item.photo_key }, onTap);
}

/** Group page: slot 0 = back to index, slot 1 = the Edit-mode action
 *  (`+ Add`, or `Remove` while a removable item is lifted), items at
 *  their stored (page, slot_index) in 2–58, slot 59 = Next › when the
 *  group has a second page. Word taps speak and stay in the group —
 *  leaving is one learned gesture. */
async function renderGroupPage() {
  const zg = $("groupgrid");
  zg.innerHTML = "";
  const items = new Map(
    groupPage(db, groupKey, groupPageNo).map((r) => [r.slot_index, r]),
  );
  const pages = pageCount(db, groupKey);
  const gKind = ALL(db, "SELECT kind FROM board_group WHERE id = ?", [groupKey])[0]?.kind;
  // Removal is only offered where it can succeed: a sense never leaves a
  // built-in group (that is the findability guarantee), so slot 1 stays
  // blank for a lifted sense there.
  const removable = lifted && !(lifted.item_kind === "sense" && gKind === "builtin");

  for (let slot = 0; slot < 60; slot++) {
    if (slot === 0) {
      zg.appendChild(navCell("← Groups", openGroupIndex));
      continue;
    }
    if (slot === 1) {
      if (editing && removable) {
        zg.appendChild(editSlotCell("Remove", () => {
          removeItem(db, groupKey, lifted.item_kind, lifted.item_id);
          lifted = null;
          renderGroupPage();
        }));
      } else {
        zg.appendChild(editSlotCell(editing && !lifted && "+ Add", () => {
          openAddForm(groupKey);
        }));
      }
      continue;
    }
    if (slot === 59) {
      if (pages > 1) {
        const el = navCell("Next ›", () => {
          lifted = null;
          groupPageNo = (groupPageNo + 1) % pages;
          renderGroupPage();
        });
        const badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = `${groupPageNo + 1}/${pages}`;
        el.appendChild(badge);
        zg.appendChild(el);
      } else {
        const blank = document.createElement("div");
        blank.className = "gcell empty";
        zg.appendChild(blank);
      }
      continue;
    }
    const item = items.get(slot);
    if (!item) {
      const empty = document.createElement("div");
      empty.className = "gcell empty";
      if (editing) {
        empty.classList.add("drop");
        empty.addEventListener("click", () => {
          if (!lifted) return;
          moveItem(db, groupKey, lifted.item_kind, lifted.item_id, groupPageNo, slot);
          lifted = null;
          renderGroupPage();
        });
      }
      zg.appendChild(empty);
      continue;
    }
    const el = await itemCell(item);
    if (editing && lifted?.item_kind === item.item_kind && lifted?.item_id === item.item_id) {
      el.classList.add("lifted");
    }
    zg.appendChild(el);
  }
}

/* --- custom groups: + Group on the group index --- */
$("group-save").addEventListener("click", async () => {
  const name = $("group-name").value.trim();
  if (!name) return;
  const file = $("group-photo").files[0];
  const photoKey = file ? await savePhoto(crypto.randomUUID(), file) : null;
  createGroup(db, { name, photoKey });
  $("group-name").value = "";
  $("group-photo").value = "";
  close("groupform");
  renderGroupIndex();
});

/* --- add flow: one field, type → match → place. A catalog match places
   the real sense (its color, its voice); "New" makes a personal entity.
   The adult never picks a folder — the group they are standing in is the
   target. No type, pronoun, or category picker. --- */
function openAddForm(groupId) {
  addTarget = groupId;
  const name = ALL(db, "SELECT name FROM board_group WHERE id = ?", [groupId])[0]?.name;
  $("add-title").textContent = `Add to ${name ?? "My Words"}`;
  $("add-name").value = "";
  $("add-photo").value = "";
  $("add-hint").value = "";
  $("add-newfields").hidden = true;
  $("add-matches").innerHTML = "";
  $("add-new").hidden = true;
  open("addform");
}

/** Re-render the match list and the always-present New row as the adult
 *  types. Local query only — a save never touches the network. */
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
  for (const m of catalogMatches(db, text, addTarget)) {
    const row = document.createElement("button");
    row.className = "addmatch";
    const sw = document.createElement("span");
    sw.className = `swatch r-${m.fitzgerald_role}`;
    const lb = document.createElement("span");
    lb.textContent = m.label;
    row.appendChild(sw);
    row.appendChild(lb);
    row.addEventListener("click", () => {
      placeItem(db, addTarget, "sense", m.id);
      close("addform");
      rerenderView();
      renderStrip();
    });
    box.appendChild(row);
  }
}
$("add-name").addEventListener("input", renderAddMatches);
$("add-new").addEventListener("click", () => {
  $("add-newfields").hidden = false;
});

$("add-save").addEventListener("click", async () => {
  const name = $("add-name").value.trim();
  if (!name) return;
  const id = `ent_${crypto.randomUUID().replaceAll("-", "")}`;
  const file = $("add-photo").files[0];
  const photoKey = file ? await savePhoto(id, file) : null;
  const hint = $("add-hint").value.trim() || null;
  // The record's home category — a classifier input, never displayed —
  // is the seed category of a built-in target group, else null.
  const category = catalog.groups.find((g) => g.id === addTarget)?.category ?? null;
  RUN(
    db,
    "INSERT INTO personal_entity (id, spoken_name, photo_key, category, hint) VALUES (?, ?, ?, ?, ?)",
    [id, name, photoKey, category, hint],
  );
  placeItem(db, addTarget, "entity", id);
  close("addform");
  rerenderView();
  renderStrip();
});

renderGrid();
renderStrip();
