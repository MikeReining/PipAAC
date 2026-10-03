/**
 * The attention layer (013): one spotlight is a list of words — a Set of
 * "kind:id" keys — shown wherever they appear. The laws (§ 2.1): never a
 * muzzle (a dimmed word still speaks), never moves a cell, never changes
 * the board, never unmasks, gentle.
 *
 * This module owns the layer's semantics; renderers ask `spotlight()`
 * and mark cells. Slice 2 owns the persistence: saved lists and the
 * running session are synced profile data (§ 4 — "sync like any other
 * edit"), so the write owners here record ops like every other edit.
 */

import { maskedSenseIds } from "./groups.mjs";
import { barControls } from "./bar.mjs";
import { recordOp } from "./ops.mjs";

let active = null; // { name, targets: Set<"kind:id"> }

/** Sentence buttons a spotlight may light (032 E), as "control:<name>"
 *  targets: ✨ adds the little words (a grammar pass, never a guess — the
 *  023 wand law), ❓ asks the same words. Name → the button's id, its chip
 *  label (the button's own title), and the coach line a partner sees. */
export const CONTROLS = {
  fix: { button: "tx-fix", label: "✨ fix it",
    tip: "✨ — after two words, tap ✨. It adds only the little words, like is, a, the — never a guess. Say it along with Pip." },
  question: { button: "tx-question", label: "❓ ask it",
    tip: "❓ — after two words, tap ❓ to ask them as a question. Then wait for an answer." },
};

/** Start a spotlight over `targets` (iterable of "kind:id"). Masked
 *  senses are skipped — the law is never unmask; the caller is told
 *  which — and so is a control this build doesn't know, or one the
 *  person's sentence-bar setting hides (038: a hidden button is never
 *  a target — it stays on the saved list and lights again if shown).
 *  Returns { skipped } — an all-skipped call leaves the layer off. */
export function startSpotlight(db, targets, name = "Spotlight") {
  const masked = maskedSenseIds(db);
  const shown = barControls(db);
  const set = new Set();
  const skipped = [];
  for (const key of targets) {
    const [kind, id] = key.split(":");
    if (kind === "sense" && masked.has(id)) skipped.push(key);
    else if (kind === "control" && (!CONTROLS[id] || !shown.has(id))) skipped.push(key);
    else set.add(key);
  }
  active = set.size ? { name, targets: set } : null;
  return { skipped };
}

export function endSpotlight() {
  active = null;
}

/** The running spotlight, or null. Renderers consult this. */
export function spotlight() {
  return active;
}

/** The groups that contain at least one target — the tiles the route
 *  walk glows on the index (§ 3). */
export function spotlightGroups(db, targets) {
  const kinds = [...targets].map((k) => k.split(":")).filter(([k]) => k !== "control");
  if (!kinds.length) return new Set();
  const ids = kinds.map(([, id]) => id);
  const marks = ids.map(() => "?").join(",");
  return new Set(
    db.prepare(
      `SELECT DISTINCT group_id FROM group_membership
       WHERE item_id IN (${marks})`,
    ).all(...ids).map((r) => r.group_id),
  );
}

/** Does any target need the route walk — i.e. sits inside a group but is
 *  not on the current board? `onBoard` is the Set of sense ids the grid
 *  just rendered. When true, the Groups anchor glows (§ 3). */
export function needsRouteWalk(targets, onBoard) {
  for (const key of targets) {
    const [kind, id] = key.split(":");
    if (kind === "control") continue; // the buttons sit in the top bar
    if (kind === "entity") return true; // entities live only inside groups
    if (!onBoard.has(id)) return true;
  }
  return false;
}

/* --- saved lists and the running session (slice 2, §§ 3–4). A session
 *  is one row in spotlight_session; it survives a restart, ends when
 *  someone ends it or local midnight arrives — never silently
 *  permanent. --- */

/** A list row's control names — only ones this build knows. */
const controlsOf = (json) => {
  try { return (JSON.parse(json ?? "[]") ?? []).filter((c) => CONTROLS[c]); } catch { return []; }
};

/** Saved lists; `n` counts words — the buttons ride in `controls`. */
export function spotLists(db) {
  return db.prepare(
    `SELECT l.id, l.name, l.is_goal, l.controls, COUNT(i.item_id) AS n
     FROM spotlight_list l LEFT JOIN spotlight_item i ON i.list_id = l.id
     GROUP BY l.id ORDER BY l.name`,
  ).all().map((l) => ({ ...l, controls: controlsOf(l.controls) }));
}

/** Every target of a list: its words, then its buttons — buttons the
 *  person's bar setting hides stay on the list but are not targets
 *  (038). */
export function listTargets(db, id) {
  const keys = db.prepare("SELECT kind, item_id FROM spotlight_item WHERE list_id = ?")
    .all(id).map((r) => `${r.kind}:${r.item_id}`);
  const row = db.prepare("SELECT controls FROM spotlight_list WHERE id = ?").all(id)[0];
  const shown = barControls(db);
  for (const c of controlsOf(row?.controls)) if (shown.has(c)) keys.push(`control:${c}`);
  return new Set(keys);
}

/** A list's items with their coach tips (013 § 5a), in stable order. */
export function listItems(db, id) {
  return db.prepare(
    "SELECT kind, item_id, tip FROM spotlight_item WHERE list_id = ? ORDER BY kind, item_id",
  ).all(id);
}

/** Save (or overwrite) a named list of "kind:id" targets. Re-saving a
 *  list keeps each item's coach tip — adding a word must not wipe the
 *  tips an SLP wrote for the others. */
export function saveSpotList(db, id, name, targets, createdAt = Date.now()) {
  targets = [...targets];
  const controls = targets.filter((k) => k.startsWith("control:"))
    .map((k) => k.slice(8)).filter((c) => CONTROLS[c]);
  db.prepare(
    `INSERT INTO spotlight_list (id, name, created_at, controls) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, controls = excluded.controls`,
  ).run(id, name, createdAt, controls.length ? JSON.stringify(controls) : null);
  const tips = new Map(
    db.prepare(
      "SELECT kind, item_id, tip FROM spotlight_item WHERE list_id = ? AND tip IS NOT NULL",
    ).all(id).map((r) => [`${r.kind}:${r.item_id}`, r.tip]),
  );
  db.prepare("DELETE FROM spotlight_item WHERE list_id = ?").run(id);
  for (const key of targets) {
    const [kind, item_id] = key.split(":");
    if (kind === "control") continue;
    db.prepare(
      "INSERT OR IGNORE INTO spotlight_item (list_id, kind, item_id, tip) VALUES (?, ?, ?, ?)",
    ).run(id, kind, item_id, tips.get(key) ?? null);
  }
  recordOp(db, "spot_list_save", { id, name, targets: [...targets], created_at: createdAt });
}

/** An SLP's one-line tip for one item of one list (013 § 5a) — synced
 *  like every other caregiver edit. */
export function setItemTip(db, listId, kind, itemId, tip) {
  db.prepare(
    "UPDATE spotlight_item SET tip = ? WHERE list_id = ? AND kind = ? AND item_id = ?",
  ).run(tip?.trim() || null, listId, kind, itemId);
  recordOp(db, "spot_item_tip", { list_id: listId, kind, item_id: itemId, tip: tip?.trim() || null });
}

export function deleteSpotList(db, id) {
  db.prepare("DELETE FROM spotlight_item WHERE list_id = ?").run(id);
  db.prepare("DELETE FROM spotlight_list WHERE id = ?").run(id);
  recordOp(db, "spot_list_del", { id });
}

/** Mark a list as a goal (016 § 5) — its targets then appear in the
 *  dashboard's goal-words rows, own taps vs glowed taps, by week. */
export function setListGoal(db, id, goal) {
  db.prepare("UPDATE spotlight_list SET is_goal = ? WHERE id = ?")
    .run(goal ? 1 : 0, id);
  recordOp(db, "spot_list_goal", { id, goal: goal ? 1 : 0 });
}

/** Goal progress (016 § 5): for every goal list, each target's taps
 *  split on-their-own vs with-the-glow, bucketed by week. Reads
 *  stats_day only — a goal never re-opens the tap log. A word in two
 *  goal lists counts toward both. Returns
 *  [{ list_id, name, weeks: { weekIdx: { "kind:id": {own, glow} } } }]. */
export function goalWords(db, fromDay, toDay) {
  const lists = db.prepare(
    `SELECT l.id AS list_id, l.name, i.kind, i.item_id
     FROM spotlight_list l JOIN spotlight_item i ON i.list_id = l.id
     WHERE l.is_goal = 1 ORDER BY l.name`,
  ).all();
  const goals = new Map();
  const keyToLists = new Map();
  for (const r of lists) {
    const g = goals.get(r.list_id) ?? { list_id: r.list_id, name: r.name, targets: [], weeks: {} };
    goals.set(r.list_id, g);
    const key = `${r.kind}:${r.item_id}`;
    g.targets.push(key);
    (keyToLists.get(key) ?? keyToLists.set(key, []).get(key)).push(r.list_id);
  }
  if (!goals.size) return [];
  for (const r of db.prepare(
    "SELECT day, payload FROM stats_day WHERE day BETWEEN ? AND ?",
  ).all(fromDay, toDay)) {
    const week = Math.floor(r.day / 7);
    const perWord = JSON.parse(r.payload).per_word ?? {};
    for (const [key, e] of Object.entries(perWord)) {
      for (const listId of keyToLists.get(key) ?? []) {
        const g = goals.get(listId);
        const t = ((g.weeks[week] ??= {})[key] ??= { own: 0, glow: 0 });
        t.own += e.taps - (e.spotlit ?? 0);
        t.glow += e.spotlit ?? 0;
      }
    }
  }
  return [...goals.values()];
}

/** The running session row, or null. */
export function spotSession(db) {
  return db.prepare("SELECT * FROM spotlight_session WHERE id = 1").all()[0] ?? null;
}

/* --- Coach view (013 § 5a): the partner's tips and tally. --- */

/** One live-model tap by the adult — device-local, never synced. */
export function coachTap(db, kind, id, at = Date.now()) {
  db.prepare(
    "INSERT INTO coach_event (item_kind, item_id, modeled_at) VALUES (?, ?, ?)",
  ).run(kind, id, at);
}

/** How many distinct words the adult modeled today on this device. */
export function coachTally(db, now = Date.now()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return db.prepare(
    "SELECT COUNT(DISTINCT item_kind || ':' || item_id) AS n FROM coach_event WHERE modeled_at >= ?",
  ).all(d.getTime())[0].n;
}

/** The tip a target shows in the coach bar: a list item's SLP edit wins,
 *  then the shipped catalog default, else null (caller falls back). */
export function tipFor(db, catalog, kind, id) {
  if (kind === "control") return CONTROLS[id]?.tip ?? null;
  const edited = db.prepare(
    "SELECT tip FROM spotlight_item WHERE kind = ? AND item_id = ? AND tip IS NOT NULL LIMIT 1",
  ).all(kind, id)[0]?.tip;
  if (edited) return edited;
  return catalog?.coachTips?.[id] ?? null;
}

/** Local midnight after `now` — a session's latest possible end (§ 4). */
export function nextMidnight(now) {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

/** How long a running session lasts, in the words Settings shows:
 *  "until tonight" for the midnight end, else the clock time (a row
 *  synced from an older device may still carry a timer's end). */
export function untilText(row) {
  if (row.ends_at === nextMidnight(row.started_at)) return "until tonight";
  const t = new Date(row.ends_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `until ${t}`;
}

/** Start a session: `{ name, targets }`, or `{ …, started_at, ends_at }`
 *  when replaying another device's op. There is no timer (032): a session
 *  runs until someone ends it and always ends at local midnight. A row
 *  synced from an older device keeps the ends_at it was given. Writes the
 *  synced row, lights the layer, and records the op. */
export function startSession(db, s) {
  const started_at = s.started_at ?? Date.now();
  const ends_at = s.ends_at ?? nextMidnight(started_at);
  const targets = [...s.targets];
  db.prepare(
    `INSERT INTO spotlight_session (id, name, targets, started_at, ends_at)
     VALUES (1, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name,
       targets = excluded.targets, started_at = excluded.started_at,
       ends_at = excluded.ends_at`,
  ).run(s.name, JSON.stringify(targets), started_at, ends_at);
  recordOp(db, "spot_start", { name: s.name, targets, started_at, ends_at });
  return startSpotlight(db, targets, s.name);
}

/** End the session: delete the synced row, dim the board, record it. */
export function endSession(db) {
  db.exec("DELETE FROM spotlight_session WHERE id = 1");
  recordOp(db, "spot_end", {});
  endSpotlight();
}

/** Reconcile the layer with the synced row — boot and after each sync
 *  drain: a live row lights the glow (restart survival), an expired row
 *  ends it (timer or midnight passed while away), no row means off. */
export function resumeSession(db) {
  const row = spotSession(db);
  if (!row) {
    endSpotlight();
    return null;
  }
  if (row.ends_at <= Date.now()) {
    endSession(db);
    return null;
  }
  const r = startSpotlight(db, JSON.parse(row.targets), row.name);
  return { name: row.name, ends_at: row.ends_at, skipped: r.skipped };
}
