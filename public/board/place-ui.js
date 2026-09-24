/**
 * The place picker (014 § 9): in Edit mode an empty cell or a drag onto
 * a word is a swap — but an adult may also pick ANY word or person for
 * a home cell. This sheet is that picker: the family's people first,
 * then the whole word library behind one search field (the same
 * librarySearch Parent Corner → Words uses). Choosing calls back into
 * board.js, which writes the placement — this module only draws the
 * list.
 */
import { librarySearch } from "../shared/library.mjs";
import { normalizeV1 } from "../shared/normalize.mjs";

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

export function mountPlacePicker({ db, locale, onPick }) {
  let slot = null;

  function paint() {
    const list = $("place-list");
    list.replaceChildren();
    const q = $("place-q").value.trim();
    const rows = q
      ? librarySearch(db, q, locale, normalizeV1)
      : db.prepare(
        "SELECT id, spoken_name AS label FROM personal_entity WHERE status = 'active' ORDER BY spoken_name",
      ).all().map((e) => ({ kind: "entity", id: e.id, label: e.label }));
    if (!rows.length) {
      list.appendChild(el("p", "hint", q ? "Nothing matches." : "No people yet — search for a word, or add people in Parent Corner → Words."));
      return;
    }
    for (const r of rows.slice(0, 30)) {
      const b = el("button", "btn secondary place-row", r.label);
      b.type = "button";
      b.appendChild(el("span", "hint", r.kind === "entity" ? "person" : (r.role ?? "word")));
      b.addEventListener("click", () => onPick(slot, r.kind, r.id, r.label));
      list.appendChild(b);
    }
  }

  $("place-q").addEventListener("input", paint);
  return {
    openPicker(s) {
      slot = s;
      $("place-q").value = "";
      paint();
      document.getElementById("placeform").classList.add("open");
      $("place-q").focus();
    },
  };
}
