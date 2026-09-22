/**
 * Board runtime: renders grid60 from the on-device SQLite, sentence bar,
 * zones, and the name+photo add flow. Speech is device TTS
 * (speechSynthesis) — the proof board has no bundled clips.
 */
import { bootDb, savePhoto, loadPhotoURL } from "./db.js";
import { logSelection, stripCandidates } from "./shared/funnel.mjs";

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

function speak(text) {
  speechSynthesis.cancel();
  speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

function renderBar() {
  $("bar").textContent = sentence.map((s) => s.text).join(" ");
}
$("bar").addEventListener("click", () => {
  if (sentence.length) speak(sentence.map((s) => s.text).join(" "));
});
$("clear").addEventListener("click", () => {
  sentence.pop();
  renderBar();
  renderStrip();
});

async function renderStrip() {
  const strip = $("strip");
  strip.innerHTML = "";
  const ids = stripCandidates(
    db,
    sentence.map((s) => ({ kind: s.kind, id: s.id })),
  );
  for (const id of ids) {
    const e = ALL(db, "SELECT * FROM personal_entity WHERE id = ?", [id])[0];
    const el = document.createElement("div");
    el.className = "tile";
    const url = await loadPhotoURL(e.photo_key);
    if (url) {
      const img = document.createElement("img");
      img.src = url;
      el.appendChild(img);
    }
    el.appendChild(document.createTextNode(e.spoken_name));
    el.addEventListener("click", () => tap(e.spoken_name, "entity", e.id));
    strip.appendChild(el);
  }
}

function tap(text, kind = "sense", id = null) {
  sentence.push({ kind, id, text });
  renderBar();
  speak(text);
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
    const n = ALL(
      db,
      cat === null
        ? "SELECT COUNT(*) AS n FROM personal_entity WHERE category IS NULL"
        : "SELECT COUNT(*) AS n FROM personal_entity WHERE category = ?",
      cat === null ? [] : [cat],
    )[0].n;
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
  if (entities.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "Nothing here yet.";
    items.appendChild(empty);
  }
  for (const e of entities) items.appendChild(await entityTile(e));
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
