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
  applyAddToGroups,
  applyPlace,
  applySeedInstall,
  createEntity,
  createGroup,
  deleteGroup,
  firstFreeCell,
  lowestFreeIndexSlot,
  moveGroup,
  moveItem,
  removeItem,
  renameEntity,
  reorderGroups,
  restoreEntity,
  retireEntity,
  setEntityPhoto,
  setEntityRole,
  setEntityHint,
  setGroupHidden,
  renameGroup,
  setGroupGlyph,
  setSetting,
  swapGroups,
  swapItems,
} from "./groups.mjs";
import { clearOverride, setOverride } from "./voice.mjs";
import { clearImageOverride, setImageOverride } from "./images.mjs";
import {
  deleteSpotList, saveSpotList, endSession, spotSession, startSession,
  setItemTip, setListGoal,
} from "./spotlight.mjs";
import { moveCore, placeOnBoard } from "./coremove.mjs";
import { setBoardLayout } from "./movecost.mjs";
import { createFamily, setFamilyItems } from "./families.mjs";
import { writeStatsDay } from "./stats.mjs";
import { setSupporterName } from "./team_names.mjs";

let replaying = false;
// The signing key's fingerprint (sync_crypto.getDeviceIdentity); set at
// boot once the keystore resolves. 'dev_local' marks ops recorded before
// then — tests and pre-key devices.
let deviceId = "dev_local";
export function setDeviceId(id) { deviceId = id; }
export function getDeviceId() { return deviceId; }

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
const positionAt = (db, groupId, layout, kind, id) =>
  db.prepare(
    `SELECT page, slot_index FROM group_cell
     WHERE group_id = ? AND layout = ? AND item_kind = ? AND item_id = ?`,
  ).all(groupId, layout, kind, id)[0] ?? null;
const inGroup = (db, groupId, kind, id) =>
  !!db.prepare(
    "SELECT 1 AS x FROM group_membership WHERE group_id = ? AND item_kind = ? AND item_id = ?",
  ).all(groupId, kind, id)[0];
const slotFree = (db, groupId, layout, page, slot) =>
  !db.prepare(
    "SELECT 1 AS x FROM group_cell WHERE group_id = ? AND layout = ? AND page = ? AND slot_index = ?",
  ).all(groupId, layout, page, slot)[0];
const indexFree = (db, slot) =>
  !db.prepare("SELECT 1 AS x FROM board_group WHERE index_slot = ?").all(slot)[0];

/**
 * Apply one op through the same write owner that recorded it — intent,
 * not results (§ 5). A placement lands at its recorded cell if free, else
 * the first free cell; an op never displaces an item already placed.
 * Under merge an op's target may be gone (its group was deleted, the
 * entity was never created here): writes into a missing group are
 * skipped, never redirected (027 § 3.4). A group op recorded before 027
 * carries no `layout` (or `cells`) and is skipped on every replica — the
 * clean break converts nothing. Missing kinds still throw: silence forks
 * replicas.
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
      case "set_entity_role":
        if (exists(db, "personal_entity", a.id)) setEntityRole(db, a.id, a.role);
        break;
      case "set_entity_hint":
        if (exists(db, "personal_entity", a.id)) setEntityHint(db, a.id, a.hint);
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
      case "reorder_groups": {
        const ids = (a.order ?? []).filter((id) => exists(db, "board_group", id));
        if (ids.length > 1) reorderGroups(db, ids);
        break;
      }
      case "seed_install":
        applySeedInstall(db, a);
        break;
      case "place_item":
        if (!a.cells) break; // pre-027
        if (!exists(db, "board_group", a.groupId)) break;
        if (a.kind === "entity" && !exists(db, "personal_entity", a.id)) break;
        applyPlace(db, a);
        break;
      case "add_to_groups":
        if (a.kind === "entity" && !exists(db, "personal_entity", a.id)) break;
        applyAddToGroups(db, a);
        break;
      case "move_item": {
        if (!a.layout) break; // pre-027
        if (!positionAt(db, a.groupId, a.layout, a.kind, a.id)) break;
        const to = slotFree(db, a.groupId, a.layout, a.page, a.slot_index)
          ? { page: a.page, slot_index: a.slot_index }
          : firstFreeCell(db, a.groupId, a.layout);
        moveItem(db, a.groupId, a.kind, a.id, to.page, to.slot_index, a.layout);
        break;
      }
      case "swap_items":
        if (!a.layout) break; // pre-027
        if (positionAt(db, a.groupId, a.layout, a.a.item_kind, a.a.item_id)
            && positionAt(db, a.groupId, a.layout, a.b.item_kind, a.b.item_id)) {
          swapItems(db, a.groupId, a.a, a.b, a.layout);
        }
        break;
      case "remove_item":
        if (!a.layout) break; // pre-027
        if (inGroup(db, a.groupId, a.kind, a.id)) removeItem(db, a.groupId, a.kind, a.id);
        break;
      case "set_group_hidden":
        if (exists(db, "board_group", a.groupId)) setGroupHidden(db, a.groupId, a.hidden);
        break;
      case "rename_group":
        if (exists(db, "board_group", a.groupId)) renameGroup(db, a.groupId, a.name);
        break;
      case "set_group_glyph":
        if (exists(db, "board_group", a.groupId)) setGroupGlyph(db, a.groupId, a.glyph);
        break;
      case "set_setting":
        // A layout change always goes through the write owner so the
        // transition marks stamp on every replica (014 § 4).
        if (a.key === "board_layout") setBoardLayout(db, a.value, { groupCells: [] });
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
      case "spot_list_goal":
        if (exists(db, "spotlight_list", a.id)) setListGoal(db, a.id, a.goal);
        break;
      case "spot_item_tip":
        setItemTip(db, a.list_id, a.kind, a.item_id, a.tip);
        break;
      case "spot_start":
        startSession(db, a);
        break;
      case "spot_end":
        if (spotSession(db)) endSession(db);
        break;
      // Old move_core ops carry {senseId}; both ops are placements now —
      // place_cell also handles toSlot null (a cell cleared).
      case "move_core":
      case "place_cell": {
        const kind = a.kind ?? "sense";
        const id = a.id ?? a.senseId;
        const ok = kind === "sense"
          ? db.prepare("SELECT 1 AS x FROM sense WHERE id = ?").all(id)[0]
          : db.prepare(
            "SELECT 1 AS x FROM personal_entity WHERE id = ? AND status = 'active'",
          ).all(id)[0];
        if (ok) placeOnBoard(db, a.layout, kind, id, a.toSlot);
        break;
      }
      case "set_layout":
        // The positions the switch wrote were chosen at edit time and
        // ride the op — replay never recomputes them (027 § 3.3).
        setBoardLayout(db, a.layout, { groupCells: a.groupCells ?? [] });
        break;
      case "create_family":
        if (!exists(db, "bar_family", a.id)) createFamily(db, a);
        break;
      case "set_family_items":
        if (exists(db, "bar_family", a.familyId)) {
          setFamilyItems(db, a.familyId, a.items);
        }
        break;
      case "put_stats_day":
        // Last write wins per (day, device) — the row lands under the
        // ORIGINATING device so several devices' totals add up.
        writeStatsDay(db, a.day, op.device_id ?? "dev_remote", a.computed_at, a.payload);
        break;
      case "set_supporter_name":
        setSupporterName(db, a.acctId, a.name);
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

/** The outbox only — unconfirmed ops, oldest first, optionally capped
 * so a flush never scans or submits the whole log at once. */
export function pendingOps(db, limit = null) {
  return db.prepare(
    `SELECT seq, op_id, device_id, kind, args, created_at, relay_seq
     FROM sync_op WHERE relay_seq IS NULL ORDER BY seq LIMIT ?`,
  ).all(limit ?? -1);
}

/**
 * § 5 — one order, same functions. The synced tables, parents first for
 * baseline restore. child history, prediction weights, the catalog and
 * sync_op itself are device-local and never enter a baseline.
 */
const SYNCED_TABLES = [
  "learner_profile", "personal_entity", "board_group", "group_label",
  "clip_override", "image_override", "entity_enrichment", "group_membership",
  "group_cell", "group_seed_install",
  "sense_mask", "spotlight_list", "spotlight_item", "spotlight_session",
  "core_override", "move_mark", "bar_family", "bar_family_item",
  "supporter_name",
  // Progress totals sync (put_stats_day ops) so a recovering device gets
  // the family's counts back — the raw tap log stays device-local.
  "stats_day",
];

/** The snapshot payload format version. v1 = { seq, snap: {table: rows} }
 *  with every table optional on restore. A reader must refuse a higher
 *  version loudly — a partial restore of a format it does not know is
 *  worse than no restore (audit: versioned restore contract). */
export const SNAPSHOT_V = 1;

/** Every synced table's rows, with rowids, oldest first. */
export function snapshotSynced(db) {
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
      // Baselines/snapshots written before a table joined the synced set
      // carry no key for it — treat as empty, never crash the restore.
      for (const row of snap[t] ?? []) {
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

/** The stored baseline's tables — exactly the applied confirmed state,
 *  no pending-edit contamination. The payload a snapshot may ship. */
export function baselineSnapshot(db) {
  const row = db.prepare("SELECT tables FROM sync_baseline WHERE id = 1").all()[0];
  return row ? JSON.parse(row.tables) : null;
}

/** Persist the snapshot as the last-confirmed baseline at its watermark. */
function saveBaseline(db, appliedSeq) {
  db.prepare(
    "INSERT OR REPLACE INTO sync_baseline (id, tables, applied_seq) VALUES (1, ?, ?)",
  ).run(JSON.stringify(snapshotSynced(db)), appliedSeq);
}

/**
 * The durable checkpoint: the relay_seq the stored baseline provably
 * contains. This is the number a cursor may claim — it lives inside the
 * database bytes, so saved state and claimed coverage travel together.
 * A pre-watermark baseline (applied_seq NULL, written by older code) is
 * derived from its contents: one holding installed boards is a completed
 * post-drain/post-adopt snapshot — old saveBaseline only ever wrote
 * post-state — so it covers every confirmed op in the log. One without
 * boards covers nothing actionable: the shipped artifact's baseline
 * holds catalog rows (labels, the bar family) but no group or install
 * state, and that is exactly the 095302a3 damage signature — replaying
 * the whole log rebuilds the boards and re-lands the skipped writes,
 * while a family's legit deletions replay with them.
 */
export function appliedSeqOf(db) {
  const row = db.prepare(
    "SELECT tables, applied_seq FROM sync_baseline WHERE id = 1").all()[0];
  if (!row) return 0;
  if (row.applied_seq != null) return row.applied_seq;
  const tables = JSON.parse(row.tables);
  return ((tables.board_group?.length ?? 0) > 0
      || (tables.group_seed_install?.length ?? 0) > 0)
    ? (db.prepare(
        "SELECT MAX(relay_seq) AS m FROM sync_op WHERE relay_seq IS NOT NULL",
      ).all()[0].m ?? 0)
    : 0;
}

/**
 * A relay snapshot lands as the rebase baseline at its own watermark:
 * the op tail after `seq` replays on top (§ 5). Pending local ops are
 * re-applied immediately — adoption wipes their effects from the synced
 * tables, and they must not sit missing until the next drain.
 *
 * Adoption also replaces the replay anchor (sync_baseline id = 2). The
 * anchor's applied_seq is a coverage FLOOR: ops at or below it are
 * claimed inside the snapshot whether or not this device ever logged
 * them, so late-arriving history below it is flagged and never replayed
 * (a covered create must not resurrect a group the snapshot saw deleted).
 */
export function adoptSnapshot(db, tables, seq = 0) {
  restoreSynced(db, tables);
  // Everything at or below the snapshot's seq is claimed inside it —
  // flag it so a later drain doesn't re-run ops over adopted state
  // (a swap logged before adoption would otherwise undo itself). The
  // flags, the baseline, the anchor, and the pending-edit reapplication
  // commit together (audit: non-atomic rebase): an unsupported pending
  // op rolls the whole claim back instead of leaving adopted state
  // marked under edits that never landed.
  db.exec("BEGIN");
  try {
    db.prepare(
      "UPDATE sync_op SET applied = 1 WHERE relay_seq IS NOT NULL AND relay_seq <= ?",
    ).run(seq);
    // Ops already applied ABOVE the snapshot's coverage — a push folded
    // them before adoption wiped their effect — replay over the adopted
    // state on the next drain.
    db.prepare(
      "UPDATE sync_op SET applied = 0 WHERE relay_seq IS NOT NULL AND relay_seq > ?",
    ).run(seq);
    saveBaseline(db, seq);
    db.prepare(
      "INSERT OR REPLACE INTO sync_baseline (id, tables, applied_seq) VALUES (2, ?, ?)",
    ).run(JSON.stringify(tables), seq);
    const pending = db.prepare(
      "SELECT op_id, device_id, kind, args, created_at FROM sync_op WHERE relay_seq IS NULL ORDER BY seq",
    ).all();
    for (const op of pending) applyOp(db, op);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    // Adopted tables already committed; pending edits re-apply
    // best-effort so the board still shows them, then fail loudly —
    // the uncommitted flag/baseline claim leaves the cursor honest.
    const pending = db.prepare(
      "SELECT op_id, device_id, kind, args, created_at FROM sync_op WHERE relay_seq IS NULL ORDER BY seq",
    ).all();
    for (const op of pending) {
      try { applyOp(db, op); } catch { /* the next adoption retries */ }
    }
    throw err;
  }
}

/**
 * The rebase point is the state before the device's first local edit —
 * right after catalog import. Call once at boot; a stored baseline is
 * kept, never reset.
 *
 * Row 2 is the replay anchor (SYNC_REPLAY_ANCHOR): the trusted pre-tail
 * state a rebuild restores before replaying the retained log, kept
 * separate from row 1's derived post-fold state. A fresh database
 * anchors at the post-catalog origin; adopted snapshots replace it.
 * Databases written before the anchor existed have none — no provable
 * pre-tail checkpoint survives on them, and fabricating one would let a
 * wound rebuild over empty state and drop catalog-owned synced rows.
 */
export function ensureBaseline(db) {
  if (!db.prepare("SELECT 1 AS x FROM sync_baseline WHERE id = 1").all()[0]) {
    saveBaseline(db, 0);
  }
  /* The e5cf9708 build wrote "{}" placeholder anchors into databases
   * too old to have a real one — a fabricated "trusted" pre-tail state
   * that a wound rebuild would restore, wiping catalog-owned synced
   * rows (the profile) no op re-creates. Drop it wherever it landed so
   * the missing-anchor refusal and adoption healing still apply. */
  db.prepare("DELETE FROM sync_baseline WHERE id = 2 AND tables = '{}'").run();
  /* A baseline stamped 0 is the post-catalog origin — folds always
   * stamp seqs ≥ 1 — so it is the one baseline whose pre-tail state is
   * provable; it anchors rebuilds directly. Anything else predates
   * anchors: there is no trustworthy checkpoint to recover, so the
   * database simply has none — a wound then refuses until an adoption
   * stores a real anchor rather than rebuilding over a fabricated base. */
  const row = db.prepare(
    "SELECT tables, applied_seq FROM sync_baseline WHERE id = 1").all()[0];
  if (row.applied_seq === 0) {
    db.prepare(
      "INSERT OR IGNORE INTO sync_baseline (id, tables, applied_seq) VALUES (2, ?, 0)",
    ).run(row.tables);
  }
}

/**
 * Confirmed ops arrive with relay_seq, ordered by it. The device undoes
 * its pending ops by restoring the baseline, applies the confirmed
 * suffix after the baseline's watermark in relay order (the new
 * baseline), then re-applies its still-pending ops on top — a rebase
 * (§ 5). Foreign ops join the local log so the stream is recorded;
 * echoes of our own ops just take their seq.
 *
 * The watermark is what makes repeated delivery safe: an op applies to
 * confirmed state exactly once. A hole in the log stops the suffix at
 * the first missing seq — applying past it would claim coverage the
 * device doesn't have; catch-up or a snapshot fills it later.
 */
export function drainOps(db, confirmedOps = [], { fetched = true } = {}) {
  const base = db.prepare(
    "SELECT tables, applied_seq FROM sync_baseline WHERE id = 1").all()[0];
  if (!base) throw new Error("drainOps: no baseline — ensureBaseline must run at boot");
  const baseTables = JSON.parse(base.tables);
  // Row 2 is the stable replay anchor (SYNC_REPLAY_ANCHOR): its seq is a
  // coverage floor — ops at or below it are claimed inside the anchor —
  // and its tables are the trusted pre-tail state a rebuild restores.
  // A "{}" row is the e5cf9708 placeholder — fabrication, never a base.
  const anchorRow = db.prepare(
    "SELECT tables, applied_seq FROM sync_baseline WHERE id = 2").all()[0];
  const anchor = anchorRow?.tables === "{}" ? null : anchorRow;
  const floor = anchor?.applied_seq ?? 0;
  /* The legacy upgrade is decided BEFORE marking anything new: a
   * NULL-stamped baseline holding boards is old post-drain state —
   * every op confirmed before this call is already inside it, so their
   * flags are set rather than replayed (a swap re-run would undo
   * itself). One without boards is the 095302a3 damage — its ops stay
   * unapplied and replay below, which is what rebuilds them. */
  const legacyNullBoards = base.applied_seq == null
    && ((baseTables.board_group?.length ?? 0) > 0
        || (baseTables.group_seed_install?.length ?? 0) > 0);
  if (legacyNullBoards) {
    db.prepare("UPDATE sync_op SET applied = 1 WHERE relay_seq IS NOT NULL").run();
  }
  const ordered = [...confirmedOps].sort((x, y) => x.relay_seq - y.relay_seq);

  /* Ingest: stamp our own confirmed rows and log foreign ones. A pushed
   * (not fetch-verified) op only overlays onto live state — it is never
   * folded into the baseline and never moves coverage, so a late push
   * can never wedge coverage past an undelivered middle. Ops at or
   * below the anchor floor are already claimed inside it: flag them
   * without replaying (a covered create must not resurrect a group the
   * snapshot saw deleted). Logging, covered flags, and the overlay all
   * commit together — a poisoned push rolls the batch back instead of
   * leaving a half-logged prefix. */
  const freshIds = new Set();
  const overlay = [];
  db.exec("BEGIN");
  try {
    const mark = db.prepare(
      "UPDATE sync_op SET relay_seq = ? WHERE op_id = ? AND relay_seq IS NULL",
    );
    // Dedupe on identity only: bare OR IGNORE swallows EVERY constraint
    // failure — the op_* CHECK once ate whole ops while their effects
    // applied, forking replicas silently. Anything else goes loud.
    const logForeign = db.prepare(
      "INSERT INTO sync_op (op_id, device_id, kind, args, created_at, relay_seq) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(op_id) DO NOTHING",
    );
    const flagCovered = db.prepare(
      "UPDATE sync_op SET applied = 1 WHERE op_id = ?",
    );
    // Newness is a SELECT, never run()'s return — the WASM facade and
    // node:sqlite disagree on what run() gives back (the facade's used
    // to be undefined), and misreading it throws or loses the overlay.
    const seen = db.prepare("SELECT 1 AS x FROM sync_op WHERE op_id = ?");
    for (const op of ordered) {
      mark.run(op.relay_seq, op.op_id);
      const fresh = !seen.all(op.op_id)[0];
      logForeign.run(op.op_id, op.device_id ?? "dev_remote", op.kind,
        typeof op.args === "string" ? op.args : JSON.stringify(op.args),
        op.created_at ?? Date.now(), op.relay_seq);
      if (fresh) freshIds.add(op.op_id);
      if (op.relay_seq <= floor) flagCovered.run(op.op_id);
      else if (!fetched && fresh) overlay.push(op);
    }
    for (const op of overlay) applyOp(db, op);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  if (!fetched) return;

  const pending = db.prepare(
    "SELECT op_id, device_id, kind, args, created_at FROM sync_op WHERE relay_seq IS NULL ORDER BY seq",
  ).all();

  /* A confirmed op sitting unapplied at or below coverage the baseline
   * already claims — or below an already-folded op — is a delivery-order
   * wound this build cannot produce but the 6a2c5f17 repair could leave
   * persisted. Folding it in place would apply it after ops it precedes;
   * the sound repair is rebuilding the retained tail over the anchor:
   * unflag everything past the floor and replay in relay order. */
  const wound = db.prepare(
    `SELECT (SELECT MIN(relay_seq) FROM sync_op
             WHERE relay_seq IS NOT NULL AND applied = 0) AS lo,
            (SELECT MAX(relay_seq) FROM sync_op WHERE applied = 1) AS hi`,
  ).all()[0];
  const disordered = wound.lo != null
    && ((wound.hi != null && wound.lo < wound.hi)
        || wound.lo <= (base.applied_seq ?? -1));
  /* A wound with no stored anchor cannot be rebuilt honestly: the only
   * baseline is the polluted one, and the canonical empty base would
   * drop catalog-owned synced rows that no op re-creates (the profile
   * row a set_setting writes into). Refuse loudly — the recovery loop
   * rewinds the cursor to the floor, where a snapshot adoption installs
   * a real anchor and the next drain heals. */
  if (disordered && !anchor) {
    throw new Error(
      "sync: op log out of order and no replay anchor — refusing to rebuild");
  }

  // A fetched page claims coverage only through itself — ops above its
  // max (live-push residue) stay unapplied overlay: replayed onto live
  // after the fold but never claimed by the baseline. An empty batch is
  // the repair/replay path — fold everything retained.
  const cap = ordered.length ? Math.max(...ordered.map((o) => o.relay_seq)) : null;

  const tailOf = () => db.prepare(
    `SELECT op_id, device_id, kind, args, created_at, relay_seq FROM sync_op
     WHERE relay_seq IS NOT NULL AND applied = 0 AND relay_seq > ?
     ${cap == null ? "" : "AND relay_seq <= ?"} ORDER BY relay_seq`,
  ).all(...(cap == null ? [floor] : [floor, cap]));

  // A pending install can still be needed as foundation — the restore
  // may wipe the live install state, so that check happens post-restore.
  if (!disordered && !pending.some((o) => o.kind === "seed_install")
      && tailOf().length === 0) return;

  restoreSynced(db, disordered ? JSON.parse(anchor?.tables ?? "{}") : baseTables);
  // The replay, the per-op flags, the baseline watermark, and the
  // pending-edit reapplication commit together (audit: non-atomic
  // rebase): a failing op rolls all of it back and fails loudly,
  // instead of a half-applied state saved under a cursor that says it
  // worked. Order inside the transaction: the device's pending install
  // is the foundation first, then confirmed ops, then the baseline
  // snapshot (it must not contain pending or overlay ops), then the
  // overlay reapply (confirmed ops above the page's coverage), then the
  // pending reapply that puts the live board back on top.
  db.exec("BEGIN");
  try {
    if (disordered) {
      db.prepare(
        "UPDATE sync_op SET applied = 0 WHERE relay_seq IS NOT NULL AND relay_seq > ?",
      ).run(floor);
    }
    // History at or below the anchor floor is claimed — flag stragglers
    // that predate the anchor's arrival without replaying them.
    db.prepare(
      "UPDATE sync_op SET applied = 1 WHERE relay_seq IS NOT NULL AND relay_seq <= ?",
    ).run(floor);
    const tail = tailOf();
    // A device whose log carries no confirmed install — the 095302a3
    // starter artifact shipped applied groups with the op deleted —
    // still rebuilds its boards: its own recorded install runs as the
    // device's foundation, ahead of the confirmed replay. The install
    // state check must read the just-restored tables: a baseline without
    // seed state wiped what live had.
    if (pending.some((o) => o.kind === "seed_install")
        && !db.prepare("SELECT 1 AS x FROM group_seed_install LIMIT 1").all()[0]
        && !tail.some((o) => o.kind === "seed_install")) {
      for (const op of pending) {
        if (op.kind === "seed_install") applyOp(db, op);
      }
    }
    const flag = db.prepare("UPDATE sync_op SET applied = 1 WHERE op_id = ?");
    for (const op of tail.filter((o) => o.kind === "seed_install")) {
      applyOp(db, op);
      flag.run(op.op_id);
    }
    for (const op of tail) {
      if (op.kind === "seed_install") continue;
      applyOp(db, op);
      flag.run(op.op_id);
    }
    // The watermark floor never moves down: an empty tail over an
    // adopted anchor keeps the anchor's coverage claim.
    saveBaseline(db, Math.max(
      disordered ? floor : (base.applied_seq ?? 0), watermarkOf(db)));
    // Overlay: confirmed ops above this page's coverage (push residue)
    // re-apply onto live without a flag — their claim waits for a page
    // that reaches them.
    const residue = db.prepare(
      `SELECT op_id, device_id, kind, args, created_at, relay_seq FROM sync_op
       WHERE relay_seq IS NOT NULL AND applied = 0 ORDER BY relay_seq`,
    ).all();
    for (const op of residue) {
      if (op.kind !== "seed_install") applyOp(db, op);
    }
    for (const op of pending) {
      if (op.kind !== "seed_install") applyOp(db, op);
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    // Live state is whatever restoreSynced last loaded — on a rebuild
    // that is the anchor, which regresses the board to the origin.
    // Restore the derived baseline so live keeps the pre-drain state,
    // then put back what was live before this batch (every previously
    // known unapplied op plus pending edits) and fail loudly. Ops first
    // seen in this batch were never live, so they stay out until retry.
    try { restoreSynced(db, baseTables); } catch { /* live degrades */ }
    const residue = db.prepare(
      `SELECT op_id, device_id, kind, args, created_at, relay_seq FROM sync_op
       WHERE relay_seq IS NOT NULL AND applied = 0 ORDER BY relay_seq`,
    ).all().filter((o) => !freshIds.has(o.op_id));
    for (const op of residue) {
      try { applyOp(db, op); } catch { /* the next drain retries */ }
    }
    for (const op of pending) {
      try { applyOp(db, op); } catch { /* the next drain retries */ }
    }
    throw err;
  }
}

/**
 * The seq the baseline may honestly claim: the highest applied seq with
 * no unapplied confirmed op below it — the max applied seq when the log
 * is clean. Sparse seqs make this a coverage statement about ops, not a
 * promise that every number below it existed. Live-push residue sits
 * unapplied above the folded prefix, so the claim stops below it instead
 * of borrowing the push's higher number.
 */
function watermarkOf(db) {
  return db.prepare(
    `SELECT COALESCE(MAX(relay_seq), 0) AS w FROM sync_op
     WHERE applied = 1 AND relay_seq IS NOT NULL AND relay_seq < COALESCE(
       (SELECT MIN(relay_seq) FROM sync_op
        WHERE relay_seq IS NOT NULL AND applied = 0),
       9007199254740991)`,
  ).all()[0].w;
}

/**
 * Repair for devices that drained while their log carried no seed
 * install (the 095302a3 artifact): the rebase wiped every board and the
 * confirmed writes into the missing groups were skipped while relay_seq
 * consumed them. The signature is a baseline with no seed state plus a
 * confirmed op — proof the last rebase could not rebuild any board.
 * One ordinary drain now that installSeedGroups has recorded the
 * missing install rebuilds the boards and replays the skipped ops.
 * Idempotent and self-limiting: the healed baseline carries seed state,
 * so the signature never fires again.
 */
export function repairDrainedWithoutSeeds(db) {
  const row = db.prepare(
    "SELECT tables, applied_seq FROM sync_baseline WHERE id = 1").all()[0];
  if (!row || row.applied_seq != null) return false; // only legacy baselines carry the damage
  if (!db.prepare("SELECT 1 AS x FROM sync_op WHERE relay_seq IS NOT NULL LIMIT 1").all()[0]) {
    return false;
  }
  const tables = JSON.parse(row.tables);
  if ((tables.board_group?.length ?? 0) > 0
      || (tables.group_seed_install?.length ?? 0) > 0) {
    return false;
  }
  drainOps(db, []);
  return true;
}

/**
 * Mark our own ops confirmed by their assigned seqs — no rebase needed,
 * they are already applied; foreign ops arrive via drainOps.
 */
export function confirmOps(db, assigned) {
  const mark = db.prepare("UPDATE sync_op SET relay_seq = ? WHERE op_id = ?");
  for (const { op_id, relay_seq } of assigned) mark.run(relay_seq, op_id);
}
