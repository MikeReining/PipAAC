/**
 * The invitee's side of a supporter invite (phase 044 slice IL) -
 * PIPCORE.invite. The emailed link `https://app.pipaac.org/?invite=<token>`
 * opens the app; this is devices-ui.js inviteLanding (~L644), minus the
 * DOM, word for word:
 *
 *   open the invite  -> a sign-in link token for the invited email
 *   sign in          -> the SAME landing the sign-in link runs
 *                       (app_account.mjs runLanding: claim, passkey,
 *                       import, keep the signed-in state, share back)
 *   claim the invite -> then wait for the family to Allow
 *   granted          -> import the user exactly like an account user
 *
 * Nothing here re-implements a rule: account.mjs (openInvite, claimInvite,
 * inviteStatus, importAccountUsers) and sync_client.mjs (pollPair,
 * invitePollFailure) run unchanged in the core.
 *
 * Result leaves as a host event (a JSC caller cannot await):
 *   "invite.landing" { stage: "say" | "done" | "failed", text, imported? }
 * The user it brings lands in the registry (Swift's people.json) through
 * the same seam the sign-in uses, so a relaunch finds them there.
 */
import { importAccountUsers, claimInvite, inviteStatus, openInvite } from "../../public/shared/account.mjs";
import { inviteEndLine, invitePollFailure, pollPair } from "../../public/shared/sync_client.mjs";
import { openKeyStore, putUserKey } from "./host/sync_crypto_host.mjs";
import { cancelled, runLanding, userStore, addUser, joinWithToken } from "./app_account.mjs";

const emit = (payload) => globalThis.__pipHost.emit("invite.landing", JSON.stringify(payload));

/** The emailed link is `<origin>/?invite=<token>`. -> the token or null. */
export function inviteToken(text) {
  const t = String(text ?? "").trim();
  const m = /[?&]invite=([^&#\s]+)/.exec(t);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
}

/** devices-ui.js startPoll: a newer landing or a closed sheet cancels the
 *  wait of the older one. */
let generation = 0;
export function cancel() { generation++; return { cancelled: true }; }

/** devices-ui.js inviteLanding. `intervalMs` is the web's 2500; a test
 *  may hurry it. */
export function accept(baseUrl, linkOrToken, intervalMs = 2500) {
  const token = inviteToken(linkOrToken);
  if (!token) return { accepted: false };
  const mine = ++generation;
  const stale = () => generation !== mine;
  const say = (text) => { if (!stale()) emit({ stage: "say", text }); };
  (async () => {
    try {
      say("Opening the invite…");
      const { link_token } = await openInvite(token);
      let r;
      try {
        // accountLanding: its own failure words, then the landing ends.
        r = await runLanding(baseUrl, link_token, say);
      } catch (e) {
        if (!stale()) {
          emit({ stage: "failed", text: cancelled(e) ? "Sign-in was cancelled."
            : `Sign-in failed — ${e.message}. Ask for a fresh link and try again.` });
        }
        return;
      }
      say("Signed in — waiting for the family to Allow this share…");
      await claimInvite(token, r.session);
      const w = await pollPair(async () => {
        const st = await inviteStatus(token, r.session);
        if (st.status === "granted" && st.grant) return st;
        if (st.status === "declined" || st.status === "revoked") return st;
        return undefined;
      }, { intervalMs, classify: invitePollFailure, cancelled: stale });
      if (w.cancelled || stale()) return;
      if (w.error) { emit({ stage: "failed", text: w.error }); return; }
      if (w.value.status !== "granted") {
        emit({ stage: "failed", text: inviteEndLine.refused(w.value.status) });
        return;
      }
      say("Allowed — bringing the user over…");
      const imported = await importAccountUsers({
        bundle: { users: [w.value.grant] }, priv: r.priv,
        keyStore: openKeyStore(), userStore, putUserKey, addUser,
        joinDevice: (userId, t) => joinWithToken(baseUrl, userId, t) });
      if (!stale()) {
        emit({ stage: "done", text: inviteEndLine.imported(imported),
          email: r.claim.email, imported: imported.map((u) => u.id) });
      }
    } catch (e) {
      if (!stale()) emit({ stage: "failed", text: inviteEndLine.error(e) });
    }
  })();
  return { accepted: true };
}
