/** Group seed install (docs/phases/027_Occasion_Boards.md § 4) — catalog
 *  groups installed once as one recorded seed_install op.
 */
import {
  all, one, txn, insertMember, insertCell, lowestFreeIndexSlot,
} from "./groups_shared.mjs";
import { recordOp } from "./ops.mjs";
/* --- seed install (027 § 4) --- */

/**
 * Install every catalog group that has no install marker — once, as one
 * `seed_install` op carrying the memberships and positions, so replay and
 * restore never re-derive them from a newer catalog. Called after the
 * rebase baseline is taken (importCatalog owns that order).
 */
export function installSeedGroups(db, catalog) {
  const installed = new Set(all(db, "SELECT group_id FROM group_seed_install").map((r) => r.group_id));
  const groups = (catalog.groups ?? []).filter((g) => !installed.has(g.id)).map((g) => ({
    id: g.id,
    kind: g.kind,
    glyph: g.glyph ?? null,
    index_slot: g.index_slot,
    members: (catalog.groupMembers ?? []).filter((m) => m.group_id === g.id)
      .map((m) => [m.item_kind, m.item_id]),
    cells: (catalog.groupCells ?? []).filter((c) => c.group_id === g.id)
      .map((c) => [c.layout, c.item_kind, c.item_id, c.page, c.slot_index]),
  }));
  if (groups.length) {
    const args = { version: catalog.groupSeedVersion ?? "0", groups };
    applySeedInstall(db, args);
    recordOp(db, "seed_install", args);
  }
  recordMissingSeedOp(db, catalog);
}

/**
 * An installed marker must always be backed by a replayable install:
 * the rebase baseline is deliberately pre-seed, so the seed_install op
 * is the only way a drain rebuilds the boards before dependent edits
 * replay. Starter artifacts built by 095302a3 shipped the applied
 * state with that op deleted — every installed group is uncovered on
 * those devices. Record one from the surviving rows when no logged
 * seed op covers a marker; each device mints its own op id, so op
 * identities stay independent and first-confirmed-wins still applies.
 */
function recordMissingSeedOp(db, catalog) {
  const installed = all(db, "SELECT group_id FROM group_seed_install").map((r) => r.group_id);
  if (!installed.length) return;
  const covered = new Set();
  for (const op of all(db, "SELECT args FROM sync_op WHERE kind = 'seed_install'")) {
    for (const g of JSON.parse(op.args).groups ?? []) covered.add(g.id);
  }
  const missing = installed.filter((id) => !covered.has(id));
  if (!missing.length) return;
  const groups = missing.map((id) => {
    const g = one(db, "SELECT kind, glyph, index_slot FROM board_group WHERE id = ?", [id]);
    const cat = (catalog.groups ?? []).find((x) => x.id === id);
    return {
      id,
      kind: g?.kind ?? cat?.kind ?? "builtin",
      glyph: g?.glyph ?? cat?.glyph ?? null,
      index_slot: g?.index_slot ?? cat?.index_slot ?? lowestFreeIndexSlot(db),
      members: all(db,
        "SELECT item_kind, item_id FROM group_membership WHERE group_id = ? ORDER BY rowid",
        [id]).map((m) => [m.item_kind, m.item_id]),
      cells: all(db,
        `SELECT layout, item_kind, item_id, page, slot_index FROM group_cell
         WHERE group_id = ? ORDER BY rowid`, [id])
        .map((c) => [c.layout, c.item_kind, c.item_id, c.page, c.slot_index]),
    };
  });
  recordOp(db, "seed_install", { version: catalog.groupSeedVersion ?? "0", groups });
}

/** Apply a seed install. A group that already has a marker is skipped —
 *  the first install the relay confirmed wins (027 § 4). */
export function applySeedInstall(db, { version, groups }) {
  txn(db, () => {
    for (const g of groups) {
      if (one(db, "SELECT 1 AS x FROM group_seed_install WHERE group_id = ?", [g.id])) continue;
      if (!one(db, "SELECT 1 AS x FROM board_group WHERE id = ?", [g.id])) {
        const taken = one(db, "SELECT 1 AS x FROM board_group WHERE index_slot = ?", [g.index_slot]);
        db.prepare(
          "INSERT INTO board_group (id, kind, name, glyph, photo_key, index_slot) VALUES (?, ?, NULL, ?, NULL, ?)",
        ).run(g.id, g.kind, g.glyph, taken ? lowestFreeIndexSlot(db) : g.index_slot);
      }
      for (const [kind, id] of g.members) insertMember(db, g.id, kind, id, null);
      for (const [layout, kind, id, page, slot] of g.cells) {
        insertCell(db, g.id, layout, kind, id, { page, slot_index: slot });
      }
      db.prepare("INSERT INTO group_seed_install (group_id, seed_version) VALUES (?, ?)").run(g.id, version);
    }
  });
}

/**
 * Forget every installed built-in seed group — markers, board rows,
 * memberships, cells — so the next installSeedGroups rebuilds them from
 * the shipped catalog. Local seed-iteration affordance (the `?reseed`
 * boot flag): a founder reviewing a seed change must see it, while real
 * devices keep § 4's first-install-wins. Custom groups, entities, and
 * My Words (kind != 'builtin') are untouched; a caregiver's edits inside
 * built-in groups go with them. Local only — records no op, so a reseed
 * never propagates to replicas.
 */
export function reseedBuiltinGroups(db) {
  const seeded = all(db,
    `SELECT g.id FROM group_seed_install s JOIN board_group g ON g.id = s.group_id
     WHERE g.kind = 'builtin'`).map((r) => r.id);
  txn(db, () => {
    for (const g of seeded) {
      db.prepare("DELETE FROM group_cell WHERE group_id = ?").run(g);
      db.prepare("DELETE FROM group_membership WHERE group_id = ?").run(g);
      db.prepare("DELETE FROM board_group WHERE id = ?").run(g);
      db.prepare("DELETE FROM group_seed_install WHERE group_id = ?").run(g);
    }
  });
  return seeded.length;
}

