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
];

const { db } = await bootDb();
const sentence = []; // [{kind, id, text}]
let zoneContext = null; // category the add form files into

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
  $("bar").textContent = sentence.map((s) => s.text).join(" ");
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
    onTap: () => { renderZone("Food & Drink", "Food & Drink"); open("zone"); } });
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
  if (c.entity) {
    const el = document.createElement("button");
    el.className = "pred r-Yellow";
    const sw = document.createElement("span");
    sw.className = "swatch";
    const url = await loadPhotoURL(c.entity.photo_key);
    if (url) {
      const img = document.createElement("img");
      img.src = url;
      sw.appendChild(img);
    } else {
      sw.textContent = c.entity.spoken_name[0].toUpperCase();
    }
    el.appendChild(sw);
    const lb = document.createElement("span");
    lb.className = "label";
    lb.textContent = c.entity.spoken_name;
    el.appendChild(lb);
    el.addEventListener("click", () => tap(c.entity.spoken_name, "entity", c.entity.id));
    return el;
  }
  const el = document.createElement("button");
  el.className = `pred${c.role ? ` r-${c.role}` : ""}`;
  const sw = document.createElement("span");
  sw.className = "swatch";
  sw.textContent = c.glyph ?? c.label[0].toUpperCase();
  el.appendChild(sw);
  const lb = document.createElement("span");
  lb.className = "label";
  lb.textContent = c.label;
  el.appendChild(lb);
  el.addEventListener("click", c.onTap ?? (() => {}));
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
  const anchorKb = $("anchor-kb");
  let cards;
  if (sentence.length === 0) {
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
    strip.insertBefore(el, anchorKb);
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
    document.querySelectorAll(".overlay.open").forEach((o) => o.classList.remove("open"));
  }
});
$("corner").addEventListener("click", () => open("menu"));
$("browse-zones").addEventListener("click", () => {
  close("menu");
  renderZoneList();
  open("zones");
});
$("add-mywords").addEventListener("click", () => {
  close("menu");
  zoneContext = null;
  open("addform");
});

/* --- permanent utility anchors --- */
$("anchor-kb").addEventListener("click", () => open("keyboard"));
$("anchor-groups").addEventListener("click", () => {
  renderZoneList();
  open("zones");
});

/* --- keyboard overlay: letters -> echo -> Say it --- */
let kbText = "";
{
  const keys = $("kb-keys");
  for (const row of ["qwertyuiop", "asdfghjkl", "zxcvbnm"]) {
    const r = document.createElement("div");
    r.className = "kb-row";
    for (const ch of row) {
      const b = document.createElement("button");
      b.className = "kb-key";
      b.textContent = ch;
      b.addEventListener("click", () => {
        kbText += ch;
        $("kb-echo").textContent = kbText;
      });
      r.appendChild(b);
    }
    keys.appendChild(r);
  }
  $("kb-space").addEventListener("click", () => {
    kbText += " ";
    $("kb-echo").textContent = kbText;
  });
  $("kb-back").addEventListener("click", () => {
    kbText = kbText.slice(0, -1);
    $("kb-echo").textContent = kbText;
  });
  $("kb-say").addEventListener("click", () => {
    const t = kbText.trim();
    kbText = "";
    $("kb-echo").textContent = "";
    close("keyboard");
    if (!t) return;
    // A typed word that matches the catalog speaks with the bundled voice;
    // anything else is spoken by device TTS (schema §7.3 lane).
    const hit = senseByLemma(t);
    if (hit) tap(hit.label, "sense", hit.id);
    else tap(t, "typed", null);
  });
}

async function entityTile(e) {
  const el = document.createElement("button");
  el.className = "zone-item";
  const url = await loadPhotoURL(e.photo_key);
  if (url) {
    const img = document.createElement("img");
    img.src = url;
    el.appendChild(img);
  }
  el.appendChild(document.createTextNode(e.spoken_name));
  el.addEventListener("click", () => tap(e.spoken_name, "entity", e.id));
  return el;
}

function renderZoneList() {
  const list = $("zone-list");
  list.innerHTML = "";
  const zones = ["My Words", ...CATEGORIES];
  for (const z of zones) {
    const cat = z === "My Words" ? null : z;
    const nEntities = ALL(
      db,
      cat === null
        ? "SELECT COUNT(*) AS n FROM personal_entity WHERE category IS NULL"
        : "SELECT COUNT(*) AS n FROM personal_entity WHERE category = ?",
      cat === null ? [] : [cat],
    )[0].n;
    const nFringe = cat === null
      ? 0
      : ALL(db, "SELECT COUNT(*) AS n FROM sense WHERE category = ?", [cat])[0].n;
    const n = nEntities + nFringe;
    const el = document.createElement("button");
    el.className = "zone-item";
    el.textContent = `${z} (${n})`;
    el.addEventListener("click", () => {
      close("zones");
      renderZone(z, cat);
      open("zone");
    });
    list.appendChild(el);
  }
}

async function renderZone(title, category) {
  $("zone-title").textContent = title;
  const items = $("zone-items");
  items.innerHTML = "";
  const entities = ALL(
    db,
    category === null
      ? "SELECT * FROM personal_entity WHERE category IS NULL ORDER BY spoken_name"
      : "SELECT * FROM personal_entity WHERE category = ? ORDER BY spoken_name",
    category === null ? [] : [category],
  );
  // fringe senses filed in this zone — labels + Fitzgerald color, no art yet
  const fringe =
    category === null
      ? []
      : ALL(
          db,
          `SELECT s.id AS sense_id, l.text AS label, s.fitzgerald_role
           FROM sense s JOIN label l ON l.sense_id = s.id
             AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = 'en'
           WHERE s.category = ? ORDER BY l.text`,
          [category],
        );
  if (entities.length === 0 && fringe.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "Nothing here yet.";
    items.appendChild(empty);
  }
  for (const e of entities) items.appendChild(await entityTile(e));
  for (const w of fringe) {
    const el = document.createElement("button");
    el.className = `zone-item r-${w.fitzgerald_role}`;
    el.textContent = w.label;
    el.addEventListener("click", () => tap(w.label, "sense", w.sense_id));
    items.appendChild(el);
  }
  $("add-in-zone").onclick = () => {
    zoneContext = category;
    close("zone");
    open("addform");
  };
}

/* --- add flow: name, photo, save --- */
$("add-save").addEventListener("click", async () => {
  const name = $("add-name").value.trim();
  if (!name) return;
  const id = `ent_${crypto.randomUUID().replaceAll("-", "")}`;
  const file = $("add-photo").files[0];
  const photoKey = file ? await savePhoto(id, file) : null;
  const hint = $("add-hint").value.trim() || null;
  RUN(
    db,
    "INSERT INTO personal_entity (id, spoken_name, photo_key, category, hint) VALUES (?, ?, ?, ?, ?)",
    [id, name, photoKey, zoneContext, hint],
  );
  $("add-name").value = "";
  $("add-photo").value = "";
  $("add-hint").value = "";
  close("addform");
  renderZone(zoneContext ?? "My Words", zoneContext);
  open("zone");
  renderStrip();
});

renderGrid();
renderStrip();
