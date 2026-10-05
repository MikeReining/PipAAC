/**
 * Your name (Settings → Your account, 2026-10-03). The adult's own
 * display name, kept on this device and written into each person they
 * support as a synced supporter_name row under their account id — so the
 * rest of the team sees "Ms. Rivera" instead of an email, sealed like
 * every edit. Before sign-in there is no account id: the name waits here
 * and lands on the first open after sign-in.
 */
import { accountState } from "../shared/account.mjs";
import { setSupporterName, supporterNames } from "../shared/team_names.mjs";
import { kv } from "../shared/platform.mjs";

const $ = (id) => document.getElementById(id);
const LS_KEY = "pip_my_name";

const local = () => {
  try { return kv.getItem(LS_KEY) ?? ""; } catch { return ""; }
};

export function mountMyName({ db, onChange = () => {} }) {
  /** Reconcile this device's name with the open person's synced row:
   *  a name set here wins; an empty device adopts the row (a new device
   *  after sign-in). Run at boot and after each sync. */
  function follow() {
    const acct = accountState()?.acct_id;
    if (!acct) return;
    const mine = local();
    const synced = supporterNames(db).get(acct) ?? "";
    if (mine && mine !== synced) setSupporterName(db, acct, mine);
    else if (!mine && synced) {
      try { kv.setItem(LS_KEY, synced); } catch { /* storage off */ }
    }
    render();
  }

  function render() {
    if (document.activeElement !== $("my-name")) $("my-name").value = local();
  }

  $("my-name").addEventListener("change", () => {
    const name = $("my-name").value.trim().slice(0, 80);
    try { kv.setItem(LS_KEY, name); } catch { /* storage off */ }
    const acct = accountState()?.acct_id;
    if (acct) setSupporterName(db, acct, name);
    onChange();
  });

  follow();
  return { follow, render };
}
