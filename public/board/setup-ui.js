/**
 * First-run setup, "Tell us about their world" — 009 slice 11
 * (Word_Library § 5.6). After the board first draws, the Parent Corner
 * offers a guided pass: People (a face and a name per person), then
 * Pets, Favorite foods and Places as one-per-line lists answered by
 * library pictures (slice 7). Each step is skippable; each files into
 * the matching built-in group named by SETUP_STEPS. New people still
 * seat at a free mom/dad cell (018 D1). The wizard opens once on a new
 * user (needsSetup) and again from the Parent Corner whenever asked —
 * People then opens on who is already there, so a second pass edits
 * the family instead of re-adding it.
 */
import { applyPasteRows, nameFromFile, resolvePasteRows } from "../shared/bulk.mjs";
import { SENSE_ART_SQL } from "../shared/images.mjs";
import { applySetupPeople, setupPeople, SETUP_STEPS } from "../shared/setup.mjs";
import { GROUP_ICONS } from "./group-glyph.js";

const $ = (id) => document.getElementById(id);

export function mountSetup({
  db, locale, catalog, open, close, toast,
  savePhoto, syncUploadBlob, loadPhotoURL, artInto, me, saveUser, flushDb,
  tile, dropEntityPhoto,
  invalidateIndex, renderGrid, rerenderView, renderStrip,
}) {
  let step = 0;
  let people = []; // { id?, name, photoKey?, file?, url? } — one row each
  let faceRow = null; // the row whose face opened the photo picker
  let wrote = false;

  const meta = [
    {
      key: "people",
      title: () => `Who does ${me.name || "your child"} call for?`,
      hint: "A name for each person. Tap the square to add their photo.",
      next: "Next",
    },
    {
      key: "pets",
      title: () => "Any pets?",
      hint: "A name each, one per line — Buddy, Whiskers.",
      next: "Next",
    },
    {
      key: "foods",
      title: () => "Favorite foods",
      hint: "One per line — pizza, mac and cheese. Words the library knows get their picture.",
      next: "Next",
    },
    {
      key: "places",
      title: () => "Places they go",
      hint: "One per line — school, the park, Grandma's.",
      next: "Done",
    },
  ];

  const categoryOf = (key) =>
    catalog.groups.find((g) => g.id === SETUP_STEPS.find((s) => s.key === key).groupId)
      ?.category ?? null;

  function openWizard() {
    step = 0;
    wrote = false;
    render();
    open("setupform");
  }

  function render() {
    const m = meta[step];
    const dots = $("setup-dots");
    dots.replaceChildren(...meta.map((_, i) => {
      const d = document.createElement("span");
      d.className = i === step ? "on" : i < step ? "done" : "";
      return d;
    }));
    dots.setAttribute("aria-label", `Step ${step + 1} of ${meta.length}`);
    $("setup-icon").src = GROUP_ICONS[stepGroup(m.key)] ?? "";
    $("setup-title").textContent = m.title();
    $("setup-hint").textContent = m.hint;
    $("setup-people").hidden = m.key !== "people";
    $("setup-list").hidden = m.key === "people";
    $("setup-back").hidden = step === 0;
    $("setup-save").textContent = m.next;
    if (m.key === "people") {
      clearPeople();
      people = setupPeople(db);
      // A first pass starts on two blank rows — Mom and Dad's seats.
      while (people.length < 2) people.push({ name: "" });
      renderPeople();
    } else {
      $("setup-paste").value = "";
      renderPreview();
    }
  }

  function clearPeople() {
    for (const p of people) if (p.url) URL.revokeObjectURL(p.url);
    people = [];
  }

  const CAMERA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
  const EXAMPLES = ["Mom", "Dad"];

  function renderPeople() {
    const box = $("setup-rows");
    box.innerHTML = "";
    people.forEach((p, i) => {
      const row = document.createElement("div");
      row.className = "setup-person";
      const face = document.createElement("button");
      face.type = "button";
      face.className = "setup-face";
      const label = p.name || "this person";
      face.setAttribute("aria-label", p.url || p.photoKey
        ? `Change photo of ${label}` : `Add a photo of ${label}`);
      face.innerHTML = CAMERA;
      if (p.url) {
        showFace(face, p.url);
      } else if (p.photoKey) {
        loadPhotoURL(p.photoKey).then((url) => { if (url) showFace(face, url); });
      }
      face.addEventListener("click", () => {
        faceRow = p;
        $("setup-photo-input").click();
      });
      const input = document.createElement("input");
      input.type = "text";
      input.value = p.name;
      input.placeholder = p.id ? "Name" : `Name — like ${EXAMPLES[i] ?? "Grandma"}`;
      input.autocomplete = "off";
      input.setAttribute("aria-label", "Name");
      input.addEventListener("input", () => { p.name = input.value; });
      row.append(face, input);
      box.appendChild(row);
    });
  }

  function showFace(face, url) {
    const img = document.createElement("img");
    img.alt = "";
    img.src = url;
    face.replaceChildren(img);
    face.classList.add("has");
  }

  /* The list steps share the paste-box preview (§ 5.4): each line shows
   * the tile it becomes — library words with their picture, anything
   * else as a new word that gets its picture later. */
  function renderPreview() {
    const m = meta[step];
    const rows = resolvePasteRows(db, $("setup-paste").value, {
      groupId: stepGroup(m.key), locale,
    });
    const box = $("setup-preview");
    box.innerHTML = "";
    for (const r of rows) {
      const row = document.createElement("div");
      row.className = "ed-prow";
      const thumb = document.createElement("span");
      thumb.className = "bthumb" + (r.kind === "new" ? " new" : "");
      const art = r.kind === "sense"
        ? db.prepare(`SELECT ${SENSE_ART_SQL} AS art FROM sense s WHERE s.id = ?`).all(r.id)[0]?.art
        : null;
      if (art) {
        const img = document.createElement("img");
        img.alt = "";
        artInto(img, art);
        thumb.appendChild(img);
      } else {
        thumb.textContent = r.label[0]?.toUpperCase() ?? "";
      }
      const lb = document.createElement("span");
      lb.textContent = r.label;
      if (r.already) lb.className = "gone";
      row.append(thumb, lb);
      if (r.already || r.kind === "new") {
        const tag = document.createElement("span");
        tag.className = "tag" + (r.already ? " already" : " new");
        tag.textContent = r.already ? "already here" : "new — picture later";
        row.appendChild(tag);
      }
      box.appendChild(row);
    }
  }

  function stepGroup(key) {
    return SETUP_STEPS.find((s) => s.key === key).groupId;
  }

  async function apply() {
    const m = meta[step];
    if (m.key === "people") {
      const rows = [];
      for (const p of people) {
        if (!p.name.trim()) continue;
        let photoKey = p.photoKey ?? null;
        if (p.file) {
          const photo = await savePhoto(p.file);
          if (photo) {
            syncUploadBlob(photo.bytes).catch(() => {});
            photoKey = photo.key;
          }
        }
        rows.push({ id: p.id, name: p.name, photoKey });
        if (p.id && p.file) dropEntityPhoto(p.id); // the tile repaints its new face
      }
      const res = applySetupPeople(db, { people: rows, locale, category: categoryOf("people") });
      if (!res.added && !res.updated) return;
      // 028: the family's own words mint in the background — every name
      // the supporter just typed is a new tile clip.
      const minted = rows.filter((r) => !r.id).map((r) => r.name.trim());
      if (minted.length) tile?.prefetch(minted).catch(() => {});
    } else {
      const rows = resolvePasteRows(db, $("setup-paste").value, {
        groupId: stepGroup(m.key), locale,
      });
      if (!rows.some((r) => !r.already)) return;
      const newTexts = rows.filter((r) => r.kind === "new" && !r.already)
        .map((r) => r.text);
      applyPasteRows(db, rows, {
        groupId: stepGroup(m.key), category: categoryOf(m.key),
      });
      if (newTexts.length) tile?.prefetch(newTexts).catch(() => {});
    }
    wrote = true;
  }

  async function advance() {
    await apply();
    step++;
    if (step >= meta.length) return finish();
    render();
  }

  async function finish() {
    clearPeople();
    close("setupform");
    if (wrote) {
      await flushDb();
      invalidateIndex();
      renderGrid();
      rerenderView();
      renderStrip();
    }
    await saveUser({ needsSetup: false });
    if (wrote) toast("Their world is set up");
  }

  $("setup-save").addEventListener("click", advance);
  $("setup-skip").addEventListener("click", () => {
    if (++step >= meta.length) finish();
    else render();
  });
  // Back and ✕ never undo: a step saves when you press Next.
  $("setup-back").addEventListener("click", () => {
    if (step > 0) { step--; render(); }
  });
  $("setup-x").addEventListener("click", finish);
  $("setup-paste").addEventListener("input", renderPreview);
  $("setup-addrow").addEventListener("click", () => {
    people.push({ name: "" });
    renderPeople();
    $("setup-rows").lastElementChild?.querySelector("input")?.focus();
  });
  // One picture fills the face that was tapped; picking several adds a
  // row for each of the rest, named from its file.
  $("setup-photo-input").addEventListener("change", (e) => {
    const files = [...e.target.files].filter((f) => f.type.startsWith("image/"));
    e.target.value = "";
    if (!files.length || !faceRow) return;
    const fill = (p, file) => {
      if (p.url) URL.revokeObjectURL(p.url);
      p.file = file;
      p.url = URL.createObjectURL(file);
      if (!p.name.trim()) p.name = nameFromFile(file.name);
    };
    fill(faceRow, files[0]);
    for (const file of files.slice(1)) {
      const p = { name: "" };
      fill(p, file);
      people.push(p);
    }
    faceRow = null;
    renderPeople();
  });

  return { openWizard };
}
