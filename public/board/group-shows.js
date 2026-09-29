/**
 * Settings → Words → Show groups: one switch per group, in index order.
 * The write is the same setGroupHidden the Edit-mode door uses (027 B8:
 * a hidden group keeps its members, positions and index slot). Meal
 * groups are left to their own switch above (occasions_visible), so one
 * fact never has two controls.
 */
import { groupDisplayName, groupIndex, setGroupHidden } from "../shared/groups.mjs";

const $ = (id) => document.getElementById(id);

export function mountGroupShows({ db, locale, all, onChange = () => {} }) {
  const isOccasion = (id) =>
    (all(db, "SELECT occasion FROM group_meta WHERE group_id = ?", [id])[0]?.occasion ?? 0) === 1;

  function render() {
    const box = $("group-shows");
    box.replaceChildren();
    for (const g of groupIndex(db)) {
      if (isOccasion(g.id)) continue;
      const name = groupDisplayName(db, g, locale) || g.glyph || "Group";
      const row = document.createElement("div");
      row.className = "set-head set-listrow";
      const label = document.createElement("span");
      label.className = "seg-label";
      label.textContent = name;
      const sw = document.createElement("button");
      sw.className = "set-switch";
      sw.setAttribute("role", "switch");
      sw.setAttribute("aria-label", `Show ${name}`);
      sw.setAttribute("aria-checked", String(!g.hidden));
      sw.onclick = () => {
        const show = sw.getAttribute("aria-checked") !== "true";
        setGroupHidden(db, g.id, !show);
        sw.setAttribute("aria-checked", String(show));
        onChange();
      };
      row.append(label, sw);
      box.append(row);
    }
    $("group-shows-row").hidden = !box.children.length;
  }

  return { render };
}
