/**
 * First-run setup, "Tell us about their world" — 009 slice 11
 * (Word_Library § 5.6). After the board first draws, the Parent Corner
 * offers a guided pass: People (names + many photos, slice 8), then
 * Pets, Favorite foods and Places as one-per-line lists answered by
 * library pictures (slice 7). Each step is skippable; each files into
 * the matching built-in group named by SETUP_STEPS. Named people still
 * seat at mom/dad (018 D1). The wizard opens once on a new user
 * (needsSetup) and again from the Parent Corner whenever asked.
 */
import { applyPasteRows, nameFromFile, resolvePasteRows } from "../shared/bulk.mjs";
import { applySetupPeople, SETUP_STEPS } from "../shared/setup.mjs";

const $ = (id) => document.getElementById(id);

export function mountSetup({
  db, locale, catalog, open, close, toast,
  savePhoto, syncUploadBlob, me, saveUser, flushDb,
  tile,
  invalidateIndex, renderGrid, rerenderView, renderStrip,
}) {
  let step = 0;
  let photoDrafts = []; // { file, url, name }
  let wrote = false;

  const meta = [
    {
      key: "people",
      title: () => `Who does ${me.name || "your child"} call for?`,
      hint: "Up to three people — a name each. Add photos for the rest of their world.",
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
    photoDrafts.forEach((d) => URL.revokeObjectURL(d.url));
    photoDrafts = [];
    render();
    open("setupform");
  }

  function render() {
    const m = meta[step];
    $("setup-step").textContent = `Step ${step + 1} of ${meta.length}`;
    $("setup-title").textContent = m.title();
    $("setup-hint").textContent = m.hint;
    $("setup-people").hidden = m.key !== "people";
    $("setup-list").hidden = m.key === "people";
    $("setup-save").textContent = m.next;
    if (m.key === "people") {
      [...document.querySelectorAll(".setup-name")].forEach((i) => { i.value = ""; });
      renderDrafts();
    } else {
      $("setup-paste").value = "";
      renderPreview();
    }
  }

  /* The list steps share the paste-box preview (§ 5.4): exact library
   * matches get their word, everything else is a new word that needs a
   * picture. */
  function renderPreview() {
    const m = meta[step];
    const rows = resolvePasteRows(db, $("setup-paste").value, {
      groupId: stepGroup(m.key), locale,
    });
    const box = $("setup-preview");
    box.innerHTML = "";
    for (const r of rows) {
      const row = document.createElement("div");
      row.className = "ed-prow" + (r.already ? " over" : "");
      const tag = document.createElement("span");
      tag.className = "tag" + (r.kind === "new" ? " new" : r.already ? " already" : "");
      tag.textContent = r.already ? "already" : r.kind === "new" ? "new — needs a picture" : r.kind;
      const lb = document.createElement("span");
      lb.textContent = r.label;
      row.append(tag, lb);
      box.appendChild(row);
    }
  }

  function stepGroup(key) {
    return SETUP_STEPS.find((s) => s.key === key).groupId;
  }

  function renderDrafts() {
    const box = $("setup-photo-rows");
    box.innerHTML = "";
    for (const d of photoDrafts) {
      const row = document.createElement("div");
      row.className = "prow" + (d.name ? "" : " blank");
      const img = document.createElement("img");
      img.className = "thumb"; img.alt = ""; img.src = d.url;
      const input = document.createElement("input");
      input.type = "text"; input.value = d.name;
      input.placeholder = "Name this one";
      input.addEventListener("input", () => {
        d.name = input.value.trim();
        row.classList.toggle("blank", !d.name);
      });
      row.append(img, input);
      box.appendChild(row);
    }
  }

  async function apply() {
    const m = meta[step];
    if (m.key === "people") {
      const names = [...document.querySelectorAll(".setup-name")]
        .map((i) => i.value).filter((v) => v.trim());
      const drafts = [];
      for (const d of photoDrafts) {
        if (!d.name) continue;
        const photo = await savePhoto(d.file);
        if (photo) syncUploadBlob(photo.bytes).catch(() => {});
        drafts.push({ name: d.name, photoKey: photo?.key ?? null });
      }
      if (!names.length && !drafts.length) return;
      applySetupPeople(db, { names, drafts, locale, category: categoryOf("people") });
      // 028: the family's own words mint in the background — every name
      // the supporter just typed is a new tile clip.
      const minted = [...names, ...drafts.map((d) => d.name)].filter(Boolean);
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
    for (const d of photoDrafts) URL.revokeObjectURL(d.url);
    photoDrafts = [];
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
  $("setup-paste").addEventListener("input", renderPreview);
  $("setup-photo-btn").addEventListener("click", () => $("setup-photo-input").click());
  $("setup-photo-input").addEventListener("change", (e) => {
    const files = [...e.target.files].filter((f) => f.type.startsWith("image/"));
    e.target.value = "";
    if (!files.length) return;
    photoDrafts.push(...files.map((file) => ({
      file, url: URL.createObjectURL(file), name: nameFromFile(file.name),
    })));
    renderDrafts();
  });

  return { openWizard };
}
