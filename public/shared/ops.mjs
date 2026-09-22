/**
 * The local op log (docs/product/Sync_And_Web_Editing.md § 4).
 *
 * Every adult edit is already a function call on a write owner. Those
 * functions record each call as an op row: { op_id, kind, args }. Ops
 * carry intent, not results — replaying them through the same functions
 * rebuilds the synced tables exactly. Slice 1 is record + replay only:
 * no encryption, no relay, no merge.
 *
 * During replay recording is suppressed — applying an op runs the same
 * write owner but does not append a new op to the replica's log.
 */
import {
  createEntity,
  createGroup,
  deleteGroup,
  moveGroup,
  moveItem,
  nextFreeCell,
  placeItem,
  removeItem,
  renameEntity,
  restoreEntity,
  retireEntity,
  setEntityPhoto,
  setSetting,
  swapGroups,
  swapItems,
} from "./groups.mjs";

let replaying = false;

export function recordOp(db, kind, args) {
  if (replaying) return;
  db.prepare(
    "INSERT INTO sync_op (op_id, kind, args, created_at) VALUES (?, ?, ?, ?)",
  ).run(`op_${crypto.randomUUID().replaceAll("-", "")}`, kind, JSON.stringify(args), Date.now());
}

/**
 * Apply one op through the same write owner that recorded it. Placement
 * ops land at their slot if free, else the next free slot — an op never
 * displaces an item already placed (§ 5). Missing kinds throw: a silent
 * no-op would fork the replicas.
 */
export function applyOp(db, op) {
  const a = typeof op.args === "string" ? JSON.parse(op.args) : op.args;
  replaying = true;
  try {
    switch (op.kind) {
      case "create_entity":
        createEntity(db, a);
        break;
      case "rename_entity":
        renameEntity(db, a.id, a.name);
        break;
      case "retire_entity":
        retireEntity(db, a.id);
        break;
      case "restore_entity":
        restoreEntity(db, a.id);
        break;
      case "set_entity_photo":
        setEntityPhoto(db, a.id, a.photoKey);
        break;
      case "create_group":
        createGroup(db, a);
        break;
      case "delete_group":
        deleteGroup(db, a.groupId);
        break;
      case "move_group":
        moveGroup(db, a.groupId, a.slot);
        break;
      case "swap_groups":
        swapGroups(db, a.a, a.b);
        break;
      case "place_item": {
        const taken = db
          .prepare(
            "SELECT 1 AS x FROM group_cell WHERE group_id = ? AND page = ? AND slot_index = ?",
          )
          .all(a.groupId, a.page, a.slot_index)[0];
        if (taken) {
          placeItem(db, a.groupId, a.kind, a.id);
        } else {
          placeItem(db, a.groupId, a.kind, a.id,
            { page: a.page, slot_index: a.slot_index }, a.added_at);
        }
        break;
      }
      case "move_item": {
        const taken = db
          .prepare(
            "SELECT 1 AS x FROM group_cell WHERE group_id = ? AND page = ? AND slot_index = ?",
          )
          .all(a.groupId, a.page, a.slot_index)[0];
        if (taken) {
          const cell = nextFreeCell(db, a.groupId);
          if (cell) moveItem(db, a.groupId, a.kind, a.id, cell.page, cell.slot_index);
        } else {
          moveItem(db, a.groupId, a.kind, a.id, a.page, a.slot_index);
        }
        break;
      }
      case "swap_items":
        swapItems(db, a.groupId, a.a, a.b);
        break;
      case "remove_item":
        removeItem(db, a.groupId, a.kind, a.id, { allowOrphan: a.allowOrphan });
        break;
      case "set_setting":
        setSetting(db, a.key, a.value);
        break;
      default:
        throw new Error(`applyOp: unknown op kind ${op.kind}`);
    }
  } finally {
    replaying = false;
  }
}

/** Replay a local op log into a fresh database, in sequence order. */
export function replayOps(db, ops) {
  for (const op of ops) applyOp(db, op);
}

/** The log, oldest first. */
export function listOps(db) {
  return db.prepare("SELECT seq, op_id, kind, args, created_at FROM sync_op ORDER BY seq").all();
}
