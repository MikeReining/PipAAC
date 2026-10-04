/**
 * Team names (2026-10-03): each supporter sets their own display name in
 * Settings → Your account, and it is written into every person they
 * support as a synced row keyed by their account id. The op log seals it
 * like every edit, so the Team list can read "Mom" instead of an email
 * while the relay never sees a name in the clear.
 */
import { recordOp } from "./ops.mjs";

const MAX = 80;

/** Set (or, with an empty name, clear) one account's name. */
export function setSupporterName(db, acctId, name) {
  if (!acctId) return;
  const n = (name ?? "").trim().slice(0, MAX);
  if (n) {
    db.prepare(
      `INSERT INTO supporter_name (acct_id, name) VALUES (?, ?)
       ON CONFLICT(acct_id) DO UPDATE SET name = excluded.name`,
    ).run(acctId, n);
  } else {
    db.prepare("DELETE FROM supporter_name WHERE acct_id = ?").run(acctId);
  }
  recordOp(db, "set_supporter_name", { acctId, name: n });
}

/** acct_id → name, for everyone on this person's team who set one. */
export function supporterNames(db) {
  try {
    return new Map(db.prepare("SELECT acct_id, name FROM supporter_name").all()
      .map((r) => [r.acct_id, r.name]));
  } catch {
    return new Map(); // a device that hasn't gained the table yet
  }
}
