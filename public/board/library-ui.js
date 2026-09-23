/**
 * Word Library. Parent Corner → Words. Three tabs, one search field.
 * A row tap opens the word card. This surface only reads.
 */
import {
  libraryAdded, libraryAll, libraryHomes, librarySearch, librarySuggested,
} from "../shared/library.mjs";
import { normalizeV1 } from "../shared/normalize.mjs";

const $ = (id) => document.getElementById(id);

export function mountLibrary({
  db, locale, open, loadPhotoURL, artInto, openWordCard,
}) {
  let libTab = "added";

  function libRowPic(r) {
    const p = document.createElement("span");
    p.className = `pic r-${r.role ?? "None"}`;
    if (r.photo_key) {
      loadPhotoURL(r.photo_key).then((url) => {
        if (!url) return;
        const img = document.createElement("img");
        img.src = url;
        img.alt = "";
        p.replaceChildren(img);
        p.classList.add("photo");
      });
    } else if (r.art) {
      const img = document.createElement("img");
      img.alt = "";
      if (artInto(img, r.art)) p.classList.add("photo");
      p.appendChild(img);
    } else {
      p.textContent = r.label[0].toUpperCase();
    }
    return p;
  }

  function renderLibrary() {
    const q = $("lib-q").value.trim();
    const list = $("lib-list");
    list.innerHTML = "";
    const rows = q
      ? librarySearch(db, q, locale, normalizeV1)
      : libTab === "added" ? libraryAdded(db, locale)
      : libTab === "all" ? libraryAll(db, locale)
      : librarySuggested(db, locale);
    if (!rows.length) {
      const empty = document.createElement("p");
      empty.id = "lib-empty";
      empty.textContent = q ? "No matches."
        : libTab === "suggested" ? "Nothing here yet — words the device hears appear once the child does not have them yet."
        : "Nothing here yet.";
      list.appendChild(empty);
      return;
    }
    for (const r of rows) {
      const row = document.createElement("button");
      row.className = "addmatch";
      const txt = document.createElement("span");
      txt.className = "txt";
      const lb = document.createElement("span");
      lb.textContent = r.label;
      txt.appendChild(lb);
      const homes = libraryHomes(db, r.kind, r.id, locale);
      if (homes.length) {
        const sub = document.createElement("span");
        sub.className = "sub";
        sub.textContent = `in ${homes.join(", ")}`;
        txt.appendChild(sub);
      }
      row.append(libRowPic(r), txt);
      row.addEventListener("click", () =>
        openWordCard({ item_kind: r.kind, item_id: r.id, label: r.label, photo_key: r.photo_key }),
      );
      list.appendChild(row);
    }
  }

  $("lib-tabs").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-t]");
    if (!b) return;
    libTab = b.dataset.t;
    for (const t of $("lib-tabs").querySelectorAll("button")) {
      t.classList.toggle("on", t === b);
    }
    renderLibrary();
  });
  $("lib-q").addEventListener("input", renderLibrary);
  $("open-library").addEventListener("click", () => {
    $("lib-q").value = "";
    renderLibrary();
    open("library");
  });

  return { renderLibrary };
}
