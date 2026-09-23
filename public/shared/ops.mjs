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
  lowestFreeIndexSlot,
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
import { clearOverride, setOverride } from "./voice.mjs";
import { clearImageOverride, setImageOverride } from "./images.mjs";
import {
  deleteSpotList, saveSpotList, endSession, spotSession, startSession,
} from "./spotlight.mjs";
import { moveCore } from "./coremove.mjs";
import { setBoardLayout } from "./movecost.mjs";

let replaying = false;
// The signing key's fingerprint (sync_crypto.getDeviceIdentity); set at
// boot once the keystore resolves. 'dev_local' marks ops recorded before
// then — tests and pre-key devices.
let deviceId = "dev_local";
export function setDeviceId(id) { deviceId = id; }

// The sync loop registers here; every recorded op schedules a flush.
// Never awaited — sync is best-effort off the write path.
let opSink = null;
export function setOpSink(fn) { opSink = fn; }

export function recordOp(db, kind, args) {
  if (replaying) return;
  db.prepare(
    "INSERT INTO sync_op (op_id, device_id, kind, args, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(`op_${crypto.randomUUID().replaceAll("-", "")}`, deviceId,
    kind, JSON.stringify(args), Date.now());
  try { opSink?.(); } catch { /* the sink must never break an edit */ }
}

const exists = (db, table, id) =>
  !!db.prepare(`SELECT 1 AS x FROM ${table} WHERE id = ?`).all(id)[0];
const inGroup = (db, groupId, kind, id) =>
  !!db.prepare(
    "SELECT 1 AS x FROM group_cell WHERE group_id = ? AND item_kind = ? AND item_id = ?",
  ).all(groupId, kind, id)[0];
const slotFree = (db, groupId, page, slot) =>
  !db.prepare(
    "SELECT 1 AS x FROM group_cell WHERE group_id = ? AND page = ? AND slot_index = ?",
  ).all(groupId, page, slot)[0];
const indexFree = (db, slot) =>
  !db.prepare("SELECT 1 AS x FROM board_group WHERE index_slot = ?").all(slot)[0];

/**
 * Apply one op through the same write owner that recorded it — intent,
 * not results (§ 5). A placement lands at its slot if free, else the
 * next free slot; an op never displaces an item already placed. Under
 * merge an op's target may be gone (its group was deleted, the entity
 * was never created here): the op degrades to the nearest honest
 * intent — an entity keeps a home in My Words; sense writes into a
 * dead group skip. Missing kinds still throw: silence forks replicas.
 */
export function applyOp(db, op) {
  const a = typeof op.args === "string" ? JSON.parse(op.args) : op.args;
  replaying = true;
  try {
    switch (op.kind) {
      case "create_entity":
        if (!exists(db, "personal_entity", a.id)) createEntity(db, a);
        break;
      case "rename_entity":
        if (exists(db, "personal_entity", a.id)) renameEntity(db, a.id, a.name);
        break;
      case "retire_entity":
        if (exists(db, "personal_entity", a.id)) retireEntity(db, a.id);
        break;
      case "restore_entity":
        if (exists(db, "personal_entity", a.id)) restoreEntity(db, a.id);
        break;
      case "set_entity_photo":
        if (exists(db, "personal_entity", a.id)) setEntityPhoto(db, a.id, a.photoKey);
        break;
      case "create_group":
        if (!exists(db, "board_group", a.id)) {
          createGroup(db, {
            ...a,
            indexSlot: indexFree(db, a.indexSlot) ? a.indexSlot : null,
          });
        }
        break;
      case "delete_group":
        if (exists(db, "board_group", a.groupId)) deleteGroup(db, a.groupId);
        break;
      case "move_group":
        if (exists(db, "board_group", a.groupId)) {
          const slot = indexFree(db, a.slot) ? a.slot : lowestFreeIndexSlot(db);
          if (slot !== null) moveGroup(db, a.groupId, slot);
        }
        break;
      case "swap_groups":
        if (exists(db, "board_group", a.a) && exists(db, "board_group", a.b)) {
          swapGroups(db, a.a, a.b);
        }
        break;
      case "place_item": {
        let gid = a.groupId;
        if (!exists(db, "board_group", gid)) {
          // Its group was deleted by an earlier op — an entity keeps a
          // home in My Words; a sense write has nothing to land in.
          if (a.kind === "sense") break;
          gid = "grp_my_words";
        }
        if (a.kind === "entity" && !exists(db, "personal_entity", a.id)) break;
        if (slotFree(db, gid, a.page, a.slot_index)) {
          placeItem(db, gid, a.kind, a.id, { page: a.page, slot_index: a.slot_index }, a.added_at);
        } else {
          // Slot taken by an earlier op — next free, but the op's own
          // added_at still applies (the add happened once, on the origin).
          placeItem(db, gid, a.kind, a.id, null, a.added_at);
        }
        break;
      }
      case "move_item": {
        if (!inGroup(db, a.groupId, a.kind, a.id)) break;
        if (slotFree(db, a.groupId, a.page, a.slot_index)) {
          moveItem(db, a.groupId, a.kind, a.id, a.page, a.slot_index);
        } else {
          const cell = nextFreeCell(db, a.groupId);
          if (cell) moveItem(db, a.groupId, a.kind, a.id, cell.page, cell.slot_index);
        }
        break;
      }
      case "swap_items":
        if (inGroup(db, a.groupId, a.a.item_kind, a.a.item_id)
            && inGroup(db, a.groupId, a.b.item_kind, a.b.item_id)) {
          swapItems(db, a.groupId, a.a, a.b);
        }
        break;
      case "remove_item":
        if (inGroup(db, a.groupId, a.kind, a.id)) {
          removeItem(db, a.groupId, a.kind, a.id, { allowOrphan: a.allowOrphan });
        }
        break;
      case "set_setting":
        // A layout change always goes through the write owner so the
        // transition marks stamp on every replica (014 § 4).
        if (a.key === "board_layout") setBoardLayout(db, a.value);
        else setSetting(db, a.key, a.value);
        break;
      case "set_override": {
        // The recorded text must still equal the target's spoken
        // text/name here — a rename that landed first already retired
        // the recording's reason to exist.
        const target = a.itemKind === "entity"
          ? db.prepare("SELECT spoken_name AS t FROM personal_entity WHERE id = ?").all(a.itemId)[0]?.t
          : db.prepare("SELECT spoken_text AS t FROM utterance WHERE id = ?").all(a.itemId)[0]?.t;
        if (target && target === a.recordedText) setOverride(db, a);
        break;
      }
      case "clear_override":
        clearOverride(db, a.itemKind, a.itemId);
        break;
      case "set_image_override":
        // A library-image override only means something if that image is
        // still an approved image of this sense here (catalogs drift);
        // a photo_key is device content and always applies.
        if (a.imageId === null
            || !!db.prepare(
                 "SELECT 1 AS x FROM image WHERE id = ? AND sense_id = ? AND status = 'approved'",
               ).all(a.imageId, a.senseId)[0]) {
          setImageOverride(db, a);
        }
        break;
      case "clear_image_override":
        clearImageOverride(db, a.senseId);
        break;
      case "set_mask": {
        // The row only means something while the sense exists here.
        if (db.prepare("SELECT 1 AS x FROM sense WHERE id = ?").all(a.senseId)[0]) {
          db.prepare(
            `INSERT INTO sense_mask (sense_id, status) VALUES (?, ?)
             ON CONFLICT(sense_id) DO UPDATE SET status = excluded.status`,
          ).run(a.senseId, a.hidden ? "hidden" : "shown");
        }
        break;
      }
      case "spot_list_save":
        saveSpotList(db, a.id, a.name, a.targets, a.created_at);
        break;
      case "spot_list_del":
        if (exists(db, "spotlight_list", a.id)) deleteSpotList(db, a.id);
        break;
      case "spot_start":
        startSession(db, a);
        break;
      case "spot_end":
        if (spotSession(db)) endSession(db);
        break;
      case "move_core":
        if (db.prepare("SELECT 1 AS x FROM core_cell WHERE layout = ? AND sense_id = ?")
          .all(a.layout, a.senseId)[0]) {
          moveCore(db, a.layout, a.senseId, a.toSlot);
        }
        break;
      case "set_layout":
        setBoardLayout(db, a.layout);
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
  return db.prepare("SELECT seq, op_id, device_id, kind, args, created_at, relay_seq FROM sync_op ORDER BY seq").all();
}

/**
 * § 5 — one order, same functions. The synced tables, parents first for
 * baseline restore. child history, prediction weights, the catalog and
 * sync_op itself are device-local and never enter a baseline.
 */
const SYNCED_TABLES = [
  "learner_profile", "personal_entity", "board_group", "group_label",
  "clip_override", "image_override", "entity_enrichment", "group_cell",
  "sense_mask", "spotlight_list", "spotlight_item", "spotlight_session",
  "core_override", "move_mark",
];

/** Every synced table's rows, with rowids, oldest first. */
function snapshotSynced(db) {
  const snap = {};
  for (const t of SYNCED_TABLES) {
    snap[t] = db.prepare(`SELECT rowid AS _r, * FROM ${t} ORDER BY rowid`).all();
  }
  return snap;
}

/** Wipe the synced tables and restore a snapshot exactly, rowids included. */
function restoreSynced(db, snap) {
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN");
  try {
    for (const t of [...SYNCED_TABLES].reverse()) db.exec(`DELETE FROM ${t}`);
    for (const t of SYNCED_TABLES) {
      for (const row of snap[t]) {
        const { _r, ...cols } = row;
        const names = Object.keys(cols);
        db.prepare(
          `INSERT INTO ${t} (rowid, ${names.join(",")}) VALUES (${["?", ...names.map(() => "?")].join(",")})`,
        ).run(_r, ...names.map((n) => cols[n]));
      }
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}

/** Persist the snapshot as the last-confirmed baseline. */
function saveBaseline(db) {
  db.prepare("INSERT OR REPLACE INTO sync_baseline (id, tables) VALUES (1, ?)")
    .run(JSON.stringify(snapshotSynced(db)));
}

/**
 * The rebase point is the state before the device's first local edit —
 * right after catalog import. Call once at boot; a stored baseline is
 * kept, never reset.
 */
export function ensureBaseline(db) {
  if (!db.prepare("SELECT 1 AS x FROM sync_baseline WHERE id = 1").all()[0]) {
    saveBaseline(db);
  }
}

/**
 * Confirmed ops arrive with relay_seq, ordered by it. The device undoes
 * its pending ops by restoring the baseline, applies the confirmed
 * stream in relay order (the new baseline), then re-applies its still-
 * pending ops on top — a rebase (§ 5). Foreign ops join the local log
 * so the stream is recorded; echoes of our own ops just take their seq.
 */
export function drainOps(db, confirmedOps = []) {
  const ordered = [...confirmedOps].sort((x, y) => x.relay_seq - y.relay_seq);
  const mark = db.prepare("UPDATE sync_op SET relay_seq = ? WHERE op_id = ?");
  const logForeign = db.prepare(
    "INSERT OR IGNORE INTO sync_op (op_id, device_id, kind, args, created_at, relay_seq) VALUES (?, ?, ?, ?, ?, ?)",
  );
  for (const op of ordered) {
    mark.run(op.relay_seq, op.op_id);
    logForeign.run(op.op_id, op.device_id ?? "dev_remote", op.kind,
      typeof op.args === "string" ? op.args : JSON.stringify(op.args),
      op.created_at ?? Date.now(), op.relay_seq);
  }
  const pending = db.prepare(
    "SELECT op_id, kind, args, created_at FROM sync_op WHERE relay_seq IS NULL ORDER BY seq",
  ).all();
  // Apply the whole confirmed stream — newly arrived ops are only the
  // tail; the log holds the rest.
  const confirmed = db.prepare(
    "SELECT op_id, kind, args, created_at FROM sync_op WHERE relay_seq IS NOT NULL ORDER BY relay_seq",
  ).all();
  const base = db.prepare("SELECT tables FROM sync_baseline WHERE id = 1").all()[0];
  if (!base) throw new Error("drainOps: no baseline — ensureBaseline must run at boot");
  restoreSynced(db, JSON.parse(base.tables));
  for (const op of confirmed) applyOp(db, op);
  saveBaseline(db);
  for (const op of pending) applyOp(db, op);
}

/**
 * Mark our own ops confirmed by their assigned seqs — no rebase needed,
 * they are already applied; foreign ops arrive via drainOps.
 */
export function confirmOps(db, assigned) {
  const mark = db.prepare("UPDATE sync_op SET relay_seq = ? WHERE op_id = ?");
  for (const { op_id, relay_seq } of assigned) mark.run(relay_seq, op_id);
}
