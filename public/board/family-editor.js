/**
 * Smart bar family editor (014 § 5). Fixed order is the whole truth;
 * edits write through setFamilyItems so they sync.
 */
import {
  families, family as familyRow, familyItems, setFamilyItems,
} from "../shared/families.mjs";

const $ = (id) => document.getElementById(id);

export function mountFamilyEditor({ db, locale, open, close, toast, resolveTyped }) {
  let famEdit = null; // { id, items: [{kind, id, label}] }

  function renderFamList() {
    const box = $("fam-list");
    box.innerHTML = "";
    for (const f of families(db)) {
      const chip = document.createElement("button");
      chip.className = "fam-chip";
      // A family named only by its glyph read "? ?" here; it shows
      // its words instead, in bar order.
      const symbolOnly = !f.name?.trim() || f.name === f.glyph;
      chip.textContent = symbolOnly
        ? `${f.glyph ?? ""} ${familyItems(db, f.id, locale).map((i) => i.label).join(", ")}`.trim()
        : `${f.glyph ?? ""} ${f.name}`.trim();
      chip.addEventListener("click", () => openFamForm(f.id));
      box.appendChild(chip);
    }
  }

  function openFamForm(id) {
    const f = familyRow(db, id);
    famEdit = {
      id,
      items: familyItems(db, id, locale)
        .map((i) => ({ kind: i.kind, id: i.id, label: i.label })),
    };
    $("fam-title").textContent = `${f.name} — fixed order`;
    $("fam-add").value = "";
    renderFamItems();
    open("familyform");
  }

  function renderFamItems() {
    const box = $("fam-items");
    box.innerHTML = "";
    famEdit.items.forEach((it, i) => {
      const row = document.createElement("div");
      row.className = "fi-row";
      const label = document.createElement("span");
      label.className = "fi-label";
      label.textContent = it.kind === "family" ? `${it.label} ▸` : it.label;
      const mk = (txt, fn, dis) => {
        const b = document.createElement("button");
        b.textContent = txt; b.disabled = dis;
        b.addEventListener("click", fn);
        return b;
      };
      row.append(label,
        mk("‹", () => {
          [famEdit.items[i - 1], famEdit.items[i]] = [famEdit.items[i], famEdit.items[i - 1]];
          renderFamItems();
        }, i === 0),
        mk("›", () => {
          [famEdit.items[i + 1], famEdit.items[i]] = [famEdit.items[i], famEdit.items[i + 1]];
          renderFamItems();
        }, i === famEdit.items.length - 1),
        mk("✕", () => { famEdit.items.splice(i, 1); renderFamItems(); }, false));
      box.appendChild(row);
    });
  }

  $("fam-add-btn").addEventListener("click", () => {
    const hit = resolveTyped($("fam-add").value);
    if (!hit || hit.kind === "typed") { toast("No such word"); return; }
    famEdit.items.push({ kind: hit.kind, id: hit.id, label: hit.display });
    $("fam-add").value = "";
    renderFamItems();
  });
  $("fam-save").addEventListener("click", () => {
    if (!famEdit) return;
    setFamilyItems(db, famEdit.id,
      famEdit.items.map((i) => ({ kind: i.kind, id: i.id })));
    close("familyform");
    toast("Family saved");
  });
  $("corner").addEventListener("click", renderFamList);
  renderFamList();
}
