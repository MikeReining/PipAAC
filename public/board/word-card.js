/**
 * The word card (029 § 4, 031 § 6): one card for every word. The tile as
 * the child sees it — tap it to hear it — with Swap beside it, then one
 * row per thing you can change: Picture (word-card-pictures.js), Voice
 * (word-card-voice.js), Colour (personal words) and Also in. A choice
 * is a tile with the ink ring; making a new one is the dashed tile at
 * the end of its row. Rare actions — Hide, Sounds wrong, Remove — sit
 * quiet at the foot: no "…" menu, nothing red on the card's face.
 */
import {
  activeLayout, entityGroups, maskedSenseIds,
  removeItemUndoable, renameEntity, restoreEntity, retireEntity, senseGroups,
  setEntityRole, setMask, shownOn,
} from "../shared/groups.mjs";
import { groupGlyph } from "./group-glyph.js";
import { mountCardPictures } from "./word-card-pictures.js";
import { mountCardVoice } from "./word-card-voice.js";

export { pictureLine } from "./word-card-pictures.js";

const $ = (id) => document.getElementById(id);

/** Plain words for the kinds (018 D7) — neutral first, as on the
 *  built-in groups, where most things are neutral. */
export const KINDS = [
  ["None", "Thing"],
  ["Yellow", "Person"],
  ["Green", "Action"],
  ["Blue", "Describing word"],
  ["Pink", "Little word"],
  ["Purple", "Question word"],
  ["Red", "Safety word"],
];
const kindName = (role) => KINDS.find(([r]) => r === role)?.[1] ?? "Thing";

export function mountWordCard({
  db, locale, all, open, close, toast,
  metaFor, artInto, loadPhotoURL, savePhoto, syncUploadBlob, speakItem, xBadge,
  tile, pictures, pictureFill, creds,
  invalidateIndex, setView, rerenderView, renderStrip, renderGrid, flashCell,
  getCell, getGroupKey, setGroup, dropEntityPhoto, dropEntityRole, dropSenseMeta,
  openAddToBoards, isOnMainBoard,
}) {
  let cardItem = null; // { item_kind, item_id, label } currently shown
  let justAdded = null; // { groupName } while the card is the add's step 2
  let onReplace = null; // set by the editor where the word holds a cell (018 D10)
  let playedOnce = false;

  const isEnt = () => cardItem?.item_kind === "entity";
  const entityRole = () => all(db,
    "SELECT fitzgerald_role FROM personal_entity WHERE id = ?", [cardItem.item_id])[0]?.fitzgerald_role ?? "None";

  /* ------------------------------- rows ------------------------------- */

  /** Rename a personal word: the new name mints its own clip (028 § 5.2);
   *  the old clip stays in the ledger untouched. */
  function rename(name) {
    renameEntity(db, cardItem.item_id, name);
    tile?.ensure(name, { source: "user_typed" }).catch(() => {});
    cardItem.label = name;
    $("wc-name").value = name;
    invalidateIndex(); // completions index the old spelling
    rerenderView();
    renderStrip();
    paintVoice();
  }

  const pics = mountCardPictures({
    db, locale, all, toast, metaFor, artInto, loadPhotoURL, savePhoto, syncUploadBlob,
    pictures, pictureFill, creds, getItem: () => cardItem,
    onRename: rename,
    onKind: () => { dropEntityRole(cardItem.item_id); paintKind(entityRole()); },
    dropEntityPhoto, dropSenseMeta, renderGrid, renderStrip, rerenderView,
  });

  const voice = mountCardVoice({
    db, locale, all, toast, savePhoto, syncUploadBlob, speakItem, tile,
    getItem: () => cardItem, isEnt,
  });

  /** The Voice row plus 028 § 5.5 — "Sounds wrong" flags the shared clip;
   *  entity names only, and only for a shared board voice. A new word
   *  plays once, by itself, the moment its voice is ready. */
  function paintVoice() {
    if (!cardItem) return;
    voice.paint();
    $("wc-flag").hidden = !(isEnt() && tile?.shared?.());
    const state = isEnt() ? tile?.status(cardItem.label) : null;
    if (justAdded && !playedOnce && isEnt() && state === "ready") {
      playedOnce = true;
      speakItem({ kind: "entity", id: cardItem.item_id });
    }
  }
  tile?.onStatus?.(() => paintVoice());

  $("wc-flag").addEventListener("click", async () => {
    if (!isEnt()) return;
    const ok = await tile?.flag(cardItem.label);
    toast(ok ? "Flagged for review — it keeps playing meanwhile"
      : "Couldn't flag — try again when you're online");
  });

  /** Colour: neutral plus the six roles, as swatches (personal words). */
  function paintKind(role) {
    $("wc-tile").className = `wc-tile r-${role}`;
    $("wc-kind").textContent = kindName(role);
    const box = $("wc-kindmenu");
    box.replaceChildren();
    for (const [r, label] of KINDS) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `wc-swatch r-${r}${r === role ? " sel" : ""}`;
      b.setAttribute?.("role", "radio");
      b.setAttribute?.("aria-checked", String(r === role));
      b.setAttribute?.("aria-label", label);
      b.title = label;
      b.addEventListener("click", () => {
        if (!isEnt() || r === role) return;
        setEntityRole(db, cardItem.item_id, r);
        dropEntityRole(cardItem.item_id);
        paintKind(r);
        rerenderView();
        renderStrip();
      });
      box.appendChild(b);
    }
  }

  /** Also in: the groups on this board size (the More groups exist once
   *  per size — only Mia's size is hers to see), each with ✕. */
  function renderCardGroups() {
    const box = $("wc-groups");
    box.replaceChildren();
    // A main-board word says so — it is moved there, never removed here.
    if (isOnMainBoard?.(cardItem.item_kind, cardItem.item_id)) {
      const chip = document.createElement("span");
      chip.className = "wchip";
      chip.textContent = "Main board";
      box.appendChild(chip);
    }
    const layout = activeLayout(db);
    const groups = (isEnt()
      ? entityGroups(db, cardItem.item_id, locale)
      : senseGroups(db, cardItem.item_id, locale)).filter((g) => shownOn(db, g.id, layout));
    for (const g of groups) {
      const chip = document.createElement("span");
      chip.className = "wchip";
      const row = all(db, "SELECT id, kind, name, glyph, photo_key FROM board_group WHERE id = ?", [g.id])[0];
      if (row) chip.appendChild(groupGlyph(row, { db, locale, loadPhotoURL }));
      const nm = document.createElement("span");
      nm.textContent = g.name;
      chip.appendChild(nm);
      // 027 B9: remove from any group — this placement only; the word
      // stays in the Library and the keyboard with zero placements.
      const x = xBadge(() => {
        const undo = removeItemUndoable(db, g.id, cardItem.item_kind, cardItem.item_id);
        renderCardGroups();
        rerenderView();
        toast(`Removed from ${g.name}`, () => {
          const { moved } = undo.undo();
          renderCardGroups();
          rerenderView();
          if (moved) toast(`${cardItem.label} is back in ${g.name} — its cell was taken, so it moved`);
        });
      });
      x.title = `Remove from ${g.name}`;
      chip.appendChild(x);
      box.appendChild(chip);
    }
  }

  /* ------------------------------- open ------------------------------- */

  /** On a wide screen the card lives docked in the editor's right pane;
   *  opened from the board (Make, a tile in Edit mode) that pane is not
   *  on screen, so the card rides the page as a normal sheet instead. */
  function dock() {
    const card = $("wordcard");
    const pane = $("ed-right");
    if (!card || !pane || typeof document.body?.classList?.contains !== "function") return;
    const host = document.body.classList.contains("editor") ? pane : document.body;
    if (card.parentElement !== host) host.prepend(card);
  }

  /** `opts.justAdded` = { groupName } when this is the add's step 2;
   *  `opts.onReplace` shows Swap — the caller owns what it opens. */
  function openWordCard(item, opts = {}) {
    voice.stop();
    cardItem = { item_kind: item.item_kind, item_id: item.item_id, label: item.label };
    justAdded = opts.justAdded ?? null;
    onReplace = opts.onReplace ?? null;
    playedOnce = false;
    const ent = isEnt();

    $("wc-added").hidden = !justAdded;
    $("wc-addedto").textContent = justAdded?.groupName ?? "";
    $("wc-replace").hidden = !onReplace;
    // In the editor the word is already on screen; Preview shows the
    // child's view — "Show on board" would leave the editor.
    $("wc-show").hidden = !!document.body?.classList?.contains?.("editor");
    $("wc-herohint").textContent = ent ? "Tap the name to change it" : "Tap the word to hear it";

    $("wc-name").value = item.label;
    $("wc-name").disabled = !ent; // a catalog word is renamed by a new copy, not here
    paintKind(ent ? entityRole() : metaFor(item.item_id)?.role ?? "None");
    $("wc-kindlabel").hidden = !ent;

    // Hide: catalog words only — entities retire instead.
    $("wc-hide").hidden = ent;
    if (!ent) $("wc-hide").textContent = maskedSenseIds(db).has(item.item_id) ? "Show this word" : "Hide this word";
    $("wc-remove").hidden = !ent;
    $("wc-rechint").hidden = true;

    renderCardGroups();
    paintVoice();
    dock();
    open("wordcard");
    pics.open(cardItem);
  }

  /* ------------------------------ writes ------------------------------ */

  // The tile speaks when tapped, as it does for the child; the name field
  // of a personal word edits instead.
  $("wc-tile").addEventListener("click", (e) => {
    if (e.target === $("wc-name") && !$("wc-name").disabled) return;
    if (cardItem) speakItem({ kind: cardItem.item_kind, id: cardItem.item_id });
  });

  // The label wraps like a real tile; Return finishes the rename.
  $("wc-name").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault?.(); $("wc-name").blur?.(); }
  });
  $("wc-name").addEventListener("change", () => {
    if (!isEnt()) return;
    const name = $("wc-name").value.replace(/\s+/g, " ").trim();
    if (!name || name === cardItem.label) { $("wc-name").value = cardItem.label; return; }
    rename(name);
  });

  /** 027 B9: add to other groups — named destinations, none preselected. */
  $("wc-addgroup").addEventListener("click", () => {
    const item = cardItem;
    close("wordcard"); // the destinations sheet takes the screen
    openAddToBoards(item);
  });

  $("wc-replace").addEventListener("click", () => onReplace?.());

  /** Show on board: jump to where the word lives and mark its cell for a
   *  beat. An entity or custom-group sense flashes in the group the card
   *  was opened from (else its first group); a built-in sense flashes on
   *  the core board. */
  $("wc-show").addEventListener("click", () => {
    const it = cardItem;
    close("wordcard");
    const onBoard = it.item_kind === "sense" &&
      all(db, "SELECT 1 AS x FROM core_cell WHERE sense_id = ?", [it.item_id])[0];
    if (onBoard) {
      setView("board");
      flashCell(getCell(it.item_id));
      return;
    }
    const homes = it.item_kind === "entity"
      ? entityGroups(db, it.item_id, locale)
      : senseGroups(db, it.item_id, locale);
    const target = homes.find((g) => g.id === getGroupKey()) ?? homes[0];
    if (!target) { setView("board"); return; }
    const cell = all(
      db,
      "SELECT page FROM group_cell WHERE group_id = ? AND layout = ? AND item_kind = ? AND item_id = ?",
      [target.id, activeLayout(db), it.item_kind, it.item_id],
    )[0];
    setGroup(target.id, cell?.page ?? 0);
    setView("group");
    // Render is async; flash once the cells exist.
    requestAnimationFrame(() =>
      flashCell($("groupgrid").querySelector(`[data-item="${it.item_kind}:${it.item_id}"]`)),
    );
  });

  /** Hide: the sense keeps every cell but renders as a ghost —
   *  unspoken, out of the strip and completions — until Show. */
  $("wc-hide").addEventListener("click", () => {
    const it = cardItem;
    if (!it || it.item_kind !== "sense") return;
    const hidden = !maskedSenseIds(db).has(it.item_id);
    setMask(db, it.item_id, hidden);
    close("wordcard");
    invalidateIndex();
    rerenderView();
    renderGrid();
    renderStrip();
    toast(hidden ? `Hid ${it.label}` : `Showing ${it.label}`);
  });

  /** Remove = retire (never delete). The row, photo, and placements
   *  stay; Undo restores it. */
  $("wc-remove").addEventListener("click", () => {
    const it = cardItem;
    retireEntity(db, it.item_id);
    close("wordcard");
    invalidateIndex();
    rerenderView();
    renderStrip();
    toast(`Removed ${it.label}`, () => {
      restoreEntity(db, it.item_id);
      invalidateIndex();
      rerenderView();
      renderStrip();
    });
  });

  return { openWordCard };
}
