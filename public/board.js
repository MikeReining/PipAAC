/**
 * Board runtime: renders grid60 from the on-device SQLite, sentence bar,
 * zones, and the name+photo add flow. Catalog senses speak via bundled
 * clips (schema §7); personal entities use device TTS.
 */
import { bootDb, savePhoto, loadPhotoURL } from "./db.js";
import { logSelection, stripCandidates } from "./shared/funnel.mjs";
import { normalizeV1 } from "./shared/normalize.mjs";

const $ = (id) => document.getElementById(id);
const ALL = (db, sql, p = []) => db.all(sql, p);
const RUN = (db, sql, p = []) => db.prepare(sql).run(...p);

const CATEGORIES = [
  "Food & Drink", "Body, Health & Hygiene", "Feelings, Emotions & Sensory States",
  "Daily Actions & Activity Verbs", "People, Family & Roles", "Places, Rooms & Community",
  "Toys, Play, Media & Leisure", "Home, Household Objects & Daily Tools",
  "Clothing & Accessories", "Animals & Nature", "Vehicles & Transportation",
  "Descriptors, Adjectives & Opposites", "Time, Calendar & Sequencing",
  "Social Etiquette, Pragmatic Interjections & Urgent/Safety",
  "Function Words & Grammar", "Numbers & Counting",
];

const { db } = await bootDb();
const sentence = []; // [{kind, id, text}]
let zoneContext = null; // {category} | {group} | null(My Words) — where the add form files
let view = "board";    // 'board' | 'zoneIndex' | 'zone' — zones are a board mode, not a modal
let zoneKey = null;    // zone_key of the open zone page
let arranging = false; // caregiver arrange mode on the zone index
let lifted = null;     // zone_key picked up in arrange mode

// Short display names + glyphs for zone cells — presentational only; the
// durable zone key stays the full catalog category name.
const ZONE_SHORT = {
  "my_words": "My Words",
  "Food & Drink": "Food",
  "Body, Health & Hygiene": "Body",
  "Feelings, Emotions & Sensory States": "Feelings",
  "Daily Actions & Activity Verbs": "Actions",
  "People, Family & Roles": "People",
  "Places, Rooms & Community": "Places",
  "Toys, Play, Media & Leisure": "Play",
  "Home, Household Objects & Daily Tools": "Home",
  "Clothing & Accessories": "Clothes",
  "Animals & Nature": "Animals",
  "Vehicles & Transportation": "Vehicles",
  "Descriptors, Adjectives & Opposites": "Describing",
  "Time, Calendar & Sequencing": "Time",
  "Social Etiquette, Pragmatic Interjections & Urgent/Safety": "Social",
  "Function Words & Grammar": "Grammar",
  "Numbers & Counting": "Numbers",
};
const ZONE_GLYPH = {
  "my_words": "⭐",
  "Food & Drink": "🍎",
  "Body, Health & Hygiene": "🧍",
  "Feelings, Emotions & Sensory States": "😊",
  "Daily Actions & Activity Verbs": "🏃",
  "People, Family & Roles": "👪",
  "Places, Rooms & Community": "🏠",
  "Toys, Play, Media & Leisure": "⚽",
  "Home, Household Objects & Daily Tools": "🛋️",
  "Clothing & Accessories": "👕",
  "Animals & Nature": "🐶",
  "Vehicles & Transportation": "🚗",
  "Descriptors, Adjectives & Opposites": "🎨",
  "Time, Calendar & Sequencing": "🕐",
  "Social Etiquette, Pragmatic Interjections & Urgent/Safety": "💬",
  "Function Words & Grammar": "➕",
  "Numbers & Counting": "🔢",
};

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
     WHERE l.normalized_text = ?`,
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
    onTap: () => openZone("Food & Drink") });
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
    if (arranging) {
      arranging = false;
      lifted = null;
      renderZoneIndex();
      return;
    }
    if (view === "zone") return openZoneIndex();
    if (view === "zoneIndex") return setView("board");
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
$("corner").addEventListener("click", () => open("menu"));
$("browse-zones").addEventListener("click", () => {
  close("menu");
  openZoneIndex();
});
$("arrange-zones").addEventListener("click", () => {
  close("menu");
  openZoneIndex();
  arranging = true;
  lifted = null;
  renderZoneIndex();
});
$("add-mywords").addEventListener("click", () => {
  close("menu");
  zoneContext = null;
  open("addform");
});

/* --- permanent utility anchors --- */
$("anchor-kb").addEventListener("click", () => {
  setView("board");
  openKb();
});
$("anchor-groups").addEventListener("click", openZoneIndex);

/* --- keyboard: a board mode, not a modal. Letters replace the grid in
   place (same 10×6 geometry). Typing feeds prefix completions into the
   strip; space commits the word (and speaks it); Done commits + exits. */
let kbOpen = false;
let kbText = "";
let kbBuilt = false;

/** Grid-area view swap: board | zoneIndex | zone render into #zonegrid,
 *  keyboard into #kb — same physical space, strip and bar never move. */
function setView(v) {
  view = v;
  if (v !== "board" && kbOpen) closeKb();
  document.body.classList.toggle("zones", v !== "board");
  if (v === "zoneIndex") renderZoneIndex();
  else if (v === "zone") renderZonePage();
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

/* --- zones: an in-place board mode, not a modal. The zone index and each
   zone page render into #zonegrid — the same physical space and cell size
   as the core grid. Slot 0 is always "back"; slot 1 is the authoring
   action. Zone positions persist in zone_slot — navigation gets the same
   motor-memory law as core_cell: slots only move in caregiver arrange
   mode (tap to lift, tap a slot to place; occupied slot swaps). --- */

function navCell(label, onTap) {
  const el = document.createElement("button");
  el.className = "zcell nav";
  el.textContent = label;
  el.addEventListener("click", onTap);
  return el;
}

function zoneCell(key, slot) {
  const group = key.startsWith("grp_")
    ? ALL(db, "SELECT * FROM custom_group WHERE id = ?", [key])[0]
    : null;
  const label = group ? group.name : ZONE_SHORT[key] ?? key;
  const glyph = group ? "🗂️" : ZONE_GLYPH[key] ?? "📁";
  const el = document.createElement("button");
  el.className = "zcell";
  el.dataset.slot = slot;
  el.dataset.zone = key;
  const g = document.createElement("span");
  g.className = "glyph";
  g.textContent = glyph;
  const lb = document.createElement("span");
  lb.className = "zlabel";
  lb.textContent = label;
  el.appendChild(g);
  el.appendChild(lb);
  el.addEventListener("click", () => {
    if (!arranging) return openZone(key);
    if (!lifted) {
      lifted = key;
      renderZoneIndex();
      return;
    }
    if (lifted === key) {
      lifted = null;
      renderZoneIndex();
      return;
    }
    // occupied slot: swap coordinates
    const other = ALL(db, "SELECT slot_index FROM zone_slot WHERE zone_key = ?", [lifted])[0];
    RUN(db, "UPDATE zone_slot SET slot_index = ? WHERE zone_key = ?", [slot, lifted]);
    RUN(db, "UPDATE zone_slot SET slot_index = ? WHERE zone_key = ?", [other.slot_index, key]);
    lifted = null;
    renderZoneIndex();
  });
  return el;
}

function renderZoneIndex() {
  const zg = $("zonegrid");
  zg.innerHTML = "";
  const placed = new Map(
    ALL(db, "SELECT zone_key, slot_index FROM zone_slot").map((r) => [r.slot_index, r.zone_key]),
  );
  for (let slot = 0; slot < 60; slot++) {
    if (slot === 0) {
      zg.appendChild(
        arranging
          ? navCell("Done ✓", () => { arranging = false; lifted = null; renderZoneIndex(); })
          : navCell("← Board", () => setView("board")),
      );
      continue;
    }
    if (slot === 1) {
      zg.appendChild(navCell("+ Group", () => open("groupform")));
      continue;
    }
    const key = placed.get(slot);
    if (key) {
      const el = zoneCell(key, slot);
      if (arranging) el.classList.add(key === lifted ? "lifted" : "arrange");
      zg.appendChild(el);
      continue;
    }
    const empty = document.createElement("button");
    empty.className = "zcell empty";
    if (arranging && slot >= 10) {
      empty.classList.add("arrange");
      empty.addEventListener("click", () => {
        if (!lifted) return;
        RUN(db, "UPDATE zone_slot SET slot_index = ? WHERE zone_key = ?", [slot, lifted]);
        lifted = null;
        renderZoneIndex();
      });
    } else {
      empty.disabled = true;
    }
    zg.appendChild(empty);
  }
}

function openZoneIndex() {
  arranging = false;
  lifted = null;
  setView("zoneIndex");
}

async function openZone(key) {
  zoneKey = key;
  setView("zone");
}

function senseCell(w) {
  const el = document.createElement("button");
  el.className = `cell r-${w.fitzgerald_role}`;
  el.textContent = w.label;
  el.addEventListener("click", () => tap(w.label, "sense", w.sense_id));
  return el;
}

async function entityCell(e) {
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
  el.addEventListener("click", () => tap(e.spoken_name, "entity", e.id));
  return el;
}

/** Zone page: slot 0 = back to index, slot 1 = add here, items from slot 2.
 *  Word taps speak and stay in the zone — leaving is one learned gesture. */
async function renderZonePage() {
  const zg = $("zonegrid");
  zg.innerHTML = "";
  const key = zoneKey;
  const group = key?.startsWith("grp_") ? key : null;
  const category = group || key === "my_words" ? null : key;

  const items = [];
  if (group) {
    for (const r of ALL(
      db,
      `SELECT e.* FROM group_item gi JOIN personal_entity e ON e.id = gi.entity_id
       WHERE gi.group_id = ? ORDER BY gi.slot_index`,
      [group],
    )) items.push({ kind: "entity", row: r });
  } else {
    for (const r of ALL(
      db,
      category === null
        ? "SELECT * FROM personal_entity WHERE category IS NULL ORDER BY spoken_name"
        : "SELECT * FROM personal_entity WHERE category = ? ORDER BY spoken_name",
      category === null ? [] : [category],
    )) items.push({ kind: "entity", row: r });
    if (category) {
      for (const r of ALL(
        db,
        `SELECT s.id AS sense_id, l.text AS label, s.fitzgerald_role
         FROM sense s JOIN label l ON l.sense_id = s.id
           AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = 'en'
         WHERE s.category = ? ORDER BY l.text`,
        [category],
      )) items.push({ kind: "sense", row: r });
    }
  }
  if (items.length > 58) console.warn(`zone ${key} has ${items.length} items; 58 fit — paging is unbuilt`);

  for (let slot = 0; slot < 60; slot++) {
    if (slot === 0) {
      zg.appendChild(navCell("← Zones", openZoneIndex));
      continue;
    }
    if (slot === 1) {
      zg.appendChild(navCell("+ Add", () => {
        zoneContext = group ? { group } : { category };
        open("addform");
      }));
      continue;
    }
    const item = items[slot - 2];
    if (!item) {
      const empty = document.createElement("div");
      empty.className = "zcell empty";
      zg.appendChild(empty);
      continue;
    }
    zg.appendChild(item.kind === "sense" ? senseCell(item.row) : await entityCell(item.row));
  }
}

/* --- custom groups: + Group on the zone index --- */
$("group-save").addEventListener("click", async () => {
  const name = $("group-name").value.trim();
  if (!name) return;
  const id = `grp_${crypto.randomUUID().replaceAll("-", "")}`;
  const file = $("group-photo").files[0];
  const photoKey = file ? await savePhoto(id, file) : null;
  RUN(db, "INSERT INTO custom_group (id, name, photo_key) VALUES (?, ?, ?)", [id, name, photoKey]);
  const used = new Set(ALL(db, "SELECT slot_index FROM zone_slot").map((r) => r.slot_index));
  let slot = 10;
  while (used.has(slot)) slot++;
  RUN(db, "INSERT INTO zone_slot (zone_key, slot_index) VALUES (?, ?)", [id, slot]);
  $("group-name").value = "";
  $("group-photo").value = "";
  close("groupform");
  renderZoneIndex();
});

/* --- add flow: name, photo, save. Files into the open zone: a catalog
   category, a custom group, or My Words (null). --- */
$("add-save").addEventListener("click", async () => {
  const name = $("add-name").value.trim();
  if (!name) return;
  const id = `ent_${crypto.randomUUID().replaceAll("-", "")}`;
  const file = $("add-photo").files[0];
  const photoKey = file ? await savePhoto(id, file) : null;
  const hint = $("add-hint").value.trim() || null;
  const category = zoneContext?.category ?? null;
  RUN(
    db,
    "INSERT INTO personal_entity (id, spoken_name, photo_key, category, hint) VALUES (?, ?, ?, ?, ?)",
    [id, name, photoKey, category, hint],
  );
  if (zoneContext?.group) {
    const n = ALL(db, "SELECT COUNT(*) AS n FROM group_item WHERE group_id = ?", [zoneContext.group])[0].n;
    RUN(db, "INSERT INTO group_item (group_id, entity_id, slot_index) VALUES (?, ?, ?)",
      [zoneContext.group, id, n]);
  }
  $("add-name").value = "";
  $("add-photo").value = "";
  $("add-hint").value = "";
  close("addform");
  if (view === "zone") await renderZonePage();
  else if (view === "zoneIndex") renderZoneIndex();
  renderStrip();
});

renderGrid();
renderStrip();
