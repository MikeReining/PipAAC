/** The group's icon sheet: discovery and selection, with writes owned by groups.mjs. */
import { groupDisplayName, groupIndex, groupPictureChoices, setGroupGlyph } from "../shared/groups.mjs";
import { BASE_GROUP_ICONS } from "../shared/group-icon-library.mjs";
import { groupGlyph, groupIconName, iconUrl } from "./group-glyph.js";

const LIBRARY_URL = "/group-icons/library.json";
const fold = (s) => s.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const matches = (icon, query) => {
  const terms = fold(query).trim().split(/\s+/).filter(Boolean);
  const text = fold([icon.label, icon.category, ...icon.tags].join(" "));
  return terms.every((term) => text.includes(term));
};

export function mountGroupIconPicker({ db, locale, loadPhotoURL, changed, toast, returnFocus,
  fetchLibrary = (url, options) => fetch(url, options) }) {
  let active = null;
  let extras = null;

  function close() {
    if (!active) return;
    const state = active;
    active = null;
    state.abort.abort();
    state.dialog.close?.();
    state.dialog.remove();
    returnFocus(state.group.id)?.focus();
  }

  function node(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }

  function button(label, fn, cls = "") {
    const el = node("button", cls, label);
    el.type = "button";
    el.addEventListener("click", fn);
    return el;
  }

  function apply(state, glyph, usedBy = "") {
    if (active !== state) return;
    const row = db.prepare("SELECT * FROM board_group WHERE id = ?").all(state.group.id)[0];
    if (!row) { close(); return; }
    const before = /^(icon:|picture:)/.test(row.glyph ?? "") ? row.glyph : null;
    if (glyph === before) { close(); return; }
    setGroupGlyph(db, row.id, glyph);
    changed();
    close();
    toast(usedBy ? `${state.name} now looks like ${usedBy}` : `New icon for ${state.name}`, () => {
      if (!db.prepare("SELECT id FROM board_group WHERE id = ?").all(row.id).length) return;
      setGroupGlyph(db, row.id, before);
      changed();
    });
  }

  function render(state) {
    if (active !== state || state.mode === "pictures") return;
    const uses = new Map();
    for (const row of groupIndex(db)) {
      const name = groupIconName(row);
      if (!name || row.id === state.group.id) continue;
      if (!uses.has(name)) uses.set(name, []);
      uses.get(name).push(row);
    }
    const icons = [...BASE_GROUP_ICONS, ...(extras ?? [])];
    const categories = [...new Set(icons.map((icon) => icon.category))];
    const selectedCategory = state.category.value;
    state.category.replaceChildren(node("option", "", "All categories"));
    state.category.children[0].value = "";
    for (const category of categories) {
      const option = node("option", "", category);
      option.value = category;
      state.category.appendChild(option);
    }
    state.category.value = selectedCategory;
    const results = icons.filter((icon) => matches(icon, state.search.value)
      && (!selectedCategory || icon.category === selectedCategory));
    state.results.replaceChildren();
    state.count.textContent = `${results.length} icons`;
    if (!results.length) state.results.appendChild(node("p", "gip-empty", "No icons found. Try another search or category."));
    for (const category of categories) {
      const members = results.filter((icon) => icon.category === category);
      if (!members.length) continue;
      const section = node("section", "gip-section");
      section.appendChild(node("h3", "", category));
      const grid = node("div", "gip-grid");
      for (const icon of members) {
        const others = uses.get(icon.name) ?? [];
        const usedBy = others.map((row) => `${groupDisplayName(db, row, locale)}${row.hidden ? " (hidden)" : ""}`).join(", ");
        const current = groupIconName(state.group) === icon.name;
        const choice = button("", () => apply(state, `icon:${icon.name}`, usedBy), "gip-choice");
        choice.dataset.icon = icon.name;
        choice.setAttribute("aria-label", `${icon.label}${current ? ", current icon" : ""}${usedBy ? `, used by ${usedBy}` : ""}`);
        choice.setAttribute("aria-pressed", String(current));
        choice.title = usedBy ? `${icon.label} · used by ${usedBy}` : icon.label;
        const img = node("img");
        img.src = icon.svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(icon.svg)}` : iconUrl(icon.name);
        img.alt = "";
        img.addEventListener("error", () => { choice.disabled = true; choice.title = "Icon unavailable"; });
        choice.appendChild(img);
        if (current) choice.appendChild(node("span", "gip-mark", "✓"));
        if (others.length) {
          choice.classList.add("used");
          choice.appendChild(node("span", "gip-dot"));
        }
        grid.appendChild(choice);
      }
      section.appendChild(grid);
      state.results.appendChild(section);
    }
  }

  async function load(state) {
    state.status.replaceChildren(node("span", "", "Loading more icons…"));
    const retry = button("Try again", () => load(state));
    const timeout = setTimeout(() => state.abort.abort(), 15000);
    try {
      const res = await fetchLibrary(LIBRARY_URL, { signal: state.abort.signal });
      if (!res.ok) throw new Error("library request failed");
      const data = await res.json();
      if (data.version !== 1 || !Array.isArray(data.icons) || !data.icons.length) throw new Error("bad library");
      const seen = new Set(BASE_GROUP_ICONS.map((icon) => icon.name));
      for (const icon of data.icons) {
        if (!/^extra_[a-z0-9_]+$/.test(icon.name) || seen.has(icon.name)
            || typeof icon.label !== "string" || typeof icon.category !== "string"
            || !Array.isArray(icon.tags) || !icon.tags.every((tag) => typeof tag === "string")
            || typeof icon.svg !== "string" || !icon.svg.startsWith("<svg ")) throw new Error("bad icon");
        seen.add(icon.name);
      }
      if (active !== state) return;
      extras = data.icons;
      state.status.replaceChildren();
      render(state);
    } catch {
      if (active !== state) return;
      state.status.replaceChildren(node("span", "", "More icons need an internet connection."), retry);
      state.abort = new AbortController();
    } finally {
      clearTimeout(timeout);
    }
  }

  function showPictures(state) {
    state.mode = "pictures";
    const pictures = groupPictureChoices(db, state.group.id, locale);
    const section = node("section", "gip-pictures");
    section.appendChild(node("h3", "", "Pictures from this group"));
    if (!pictures.length) section.appendChild(node("p", "gip-empty", "No pictures in this group yet."));
    const grid = node("div", "gip-grid");
    for (const picture of pictures) {
      const glyph = `picture:${picture.key}`;
      const choice = button("", () => apply(state, glyph), "gip-choice");
      choice.dataset.picture = picture.key;
      choice.setAttribute("aria-label", picture.label);
      choice.title = picture.label;
      choice.setAttribute("aria-pressed", String(state.group.glyph === glyph));
      choice.append(groupGlyph({ ...state.group, glyph }, { db, locale, loadPhotoURL }));
      grid.appendChild(choice);
    }
    section.appendChild(grid);
    state.results.replaceChildren(section);
    state.count.textContent = `${pictures.length} pictures`;
    state.filters.hidden = true;
    state.status.hidden = true;
    state.legend.hidden = true;
    state.iconsTab.setAttribute("aria-pressed", "false");
    state.picturesTab.setAttribute("aria-pressed", "true");
  }

  function open(group) {
    close();
    const dialog = node("dialog", "group-icon-picker");
    const state = { group, name: groupDisplayName(db, group, locale), dialog,
      abort: new AbortController() };
    active = state;
    dialog.setAttribute("aria-labelledby", "gip-title");
    const header = node("div", "gip-header");
    const title = node("h2", "", `Icon for ${state.name}`);
    title.id = "gip-title";
    const closeButton = button("Close", close, "gip-close");
    header.append(title, closeButton);
    const preview = node("div", "gip-preview");
    preview.append(groupGlyph(group, { db, locale, loadPhotoURL }), node("span", "", state.name));
    const defaultButton = button("Use default", () => apply(state, null), "gip-default");
    defaultButton.disabled = !/^(icon:|picture:)/.test(group.glyph ?? "");
    const summary = node("div", "gip-summary");
    summary.append(preview, defaultButton);
    state.filters = node("div", "gip-filters");
    state.search = node("input", "gip-search");
    state.search.type = "search";
    state.search.placeholder = "Search icons";
    state.search.setAttribute("aria-label", "Search icons");
    state.search.addEventListener("input", () => render(state));
    state.category = node("select", "gip-category");
    state.category.setAttribute("aria-label", "Icon category");
    state.category.addEventListener("change", () => render(state));
    state.legend = node("p", "gip-legend");
    state.legend.append(node("span", "gip-dot"), node("span", "", "Used by another group"));
    state.count = node("span", "gip-count");
    state.count.setAttribute("aria-live", "polite");
    state.filters.append(state.search, state.category);
    state.status = node("div", "gip-status");
    state.status.setAttribute("role", "status");
    state.results = node("div", "gip-results");
    dialog.append(header, summary);
    if (group.kind === "custom") {
      const tabs = node("div", "gip-tabs");
      state.iconsTab = button("Icons", () => {
        state.mode = "icons";
        state.filters.hidden = false;
        state.status.hidden = false;
        state.legend.hidden = false;
        state.iconsTab.setAttribute("aria-pressed", "true");
        state.picturesTab.setAttribute("aria-pressed", "false");
        render(state);
      });
      state.iconsTab.setAttribute("aria-pressed", "true");
      state.picturesTab = button("Group pictures", () => showPictures(state));
      state.picturesTab.setAttribute("aria-pressed", "false");
      tabs.append(state.iconsTab, state.picturesTab);
      dialog.appendChild(tabs);
    }
    dialog.append(state.filters, state.legend, state.status, state.count, state.results);
    dialog.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
    dialog.addEventListener("keydown", (e) => e.stopPropagation());
    dialog.addEventListener("click", (e) => {
      if (e.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close();
    });
    document.body.appendChild(dialog);
    render(state);
    dialog.showModal();
    if (globalThis.matchMedia?.("(max-width: 600px)").matches) closeButton.focus();
    else state.search.focus();
    if (!extras) load(state);
  }

  return { open, close };
}
