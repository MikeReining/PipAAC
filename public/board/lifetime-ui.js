/**
 * 040 — the Pip Lifetime page: the Settings sidebar's first item while
 * unlicensed, and the one destination every paid-feature door lands on
 * (the transform ask, a locked face or voice, Progress's preview, the
 * word/supporter/device walls).
 *
 * The page sells on truth only: every row in "What Lifetime adds" is a
 * shipped feature, and "Hear the difference" plays real recordings
 * (shipped onramp clips — never device TTS). The module owns page
 * behaviour (owned vs for sale, the countdown line, the demo buttons,
 * the no-account code checkout, the unlock link) plus the trial clock
 * that drives the whole phase. The code field's handler lives with the
 * relay calls in devices-ui.js.
 */
import { buyCodes } from "../shared/account.mjs";

const $ = (id) => document.getElementById(id);
const ALL = (db, sql, p = []) => db.all(sql, p);

export function mountLifetime({ me, sayClip, hearFree, toast, trial }) {
  /* The App Store app is Apple IAP only (Pricing § 4.5): no web checkout
   * is linked inside it. That app does not exist yet; its shell will
   * announce itself in the user agent. Safari on an iPad is the web —
   * it buys like any browser. */
  const inAppStoreApp = /\bPipApp\//.test(navigator.userAgent);
  $("life-ios") && ($("life-ios").hidden = !inAppStoreApp);
  $("life-buy-row") && ($("life-buy-row").hidden = inAppStoreApp);
  $("life-link-row") && ($("life-link-row").classList.toggle("life-off", inAppStoreApp));

  /** Two states, one answer (trial().licensed — the relay's, reconciled
   *  by devices-ui): owned shows a confirmation and what's on; for sale
   *  shows the offer. Never both. */
  function renderTrial() {
    const t = trial();
    const owned = !!t.licensed;
    $("life-owned").hidden = !owned;
    for (const el of document.querySelectorAll('[data-sec="lifetime"] .life-sale')) {
      el.hidden = owned || el.classList.contains("life-off");
    }
    $("life-feats-label").textContent = owned ? "What's on" : "What Lifetime adds";
    const line = $("life-trial-line");
    if (owned) { line.hidden = true; return; }
    line.hidden = false;
    const days = t.endsAt ? Math.ceil((t.endsAt - Date.now()) / 86_400_000) : 0;
    line.textContent = days > 0
      ? `Free trial · ${days} day${days === 1 ? "" : "s"} left. Everything below is on.`
      : "Free trial ended. Buy to turn it all back on.";
  }

  /* Hear the difference — the real thing both ways: the free side plays
   * the actual word clips for "I want an apple" (exactly what a free
   * Play does), the Lifetime side the shipped natural-sentence clip. */
  /* Until the demo clip is shipped (founder listen), a silent player is
   * worse than none — hide the card on a 404. Offline or any other
   * failure leaves it alone. */
  fetch("/audio/onramp/demo-sentence.mp3", { method: "HEAD" })
    .then((r) => {
      if (r.status !== 404) return;
      const card = $("life-hear-life").closest(".life-card");
      card.classList.add("life-off");
      card.hidden = true;
    })
    .catch(() => {});
  $("life-hear-free").onclick = () => hearFree();
  $("life-hear-life").onclick = () => sayClip("demo-sentence");

  /* One Buy button, one route for everyone (040 § 8): a $49 license
   * code, no account. redeem:"self" returns the buyer to the app, which
   * claims the minted code for this board — no pasting. iOS never
   * reaches this handler — the row is hidden. */
  $("life-buy").onclick = async () => {
    const buy = $("life-buy");
    buy.disabled = true;
    try {
      const { url } = await buyCodes(1, "self");
      location.assign(url);
    } catch {
      buy.disabled = false;
      toast("Couldn't open checkout — try again online.");
    }
  };

  /* "Send an unlock link" (040 § 8): the same no-account checkout,
   * shareable. The URL carries nothing personal — the buyer pays, gets
   * the code on the confirmation page and by email, and the family
   * redeems it for this person. */
  $("life-link").onclick = async () => {
    const link = `${location.origin}/?buy`;
    try {
      await navigator.clipboard.writeText(link);
      toast("Unlock link copied — whoever opens it buys a code for this board.");
    } catch {
      toast(`Unlock link: ${link}`);
    }
  };

  return { renderTrial };
}

/* 040 — the trial clock and the voice revert. The clock starts at
 * install (first online boot): boot() posts /trial/start once per
 * profile through refreshTrial and mirrors {licensed, endsAt}; an
 * offline first run retries on the next online event or boot. Expiry
 * reverts a non-default voice to Pip's own (the choice is remembered in
 * localStorage and restored when a license lands); the toasts are
 * day-5/day-6/expiry only. */
export function mountTrialClock({ me, db, locale, refreshTrial, trialNudge,
  isEntitled, getVoiceId, setVoiceId, repaint }) {
  const VOICE_WANTED_KEY = `pip-voice-wanted:${me.id}`;
  function syncTrialVoice() {
    const defId = ALL(db,
      "SELECT id FROM voice WHERE locale = ? AND is_default = 1", [locale])[0]?.id;
    if (!defId) return;
    const wanted = localStorage.getItem(VOICE_WANTED_KEY);
    if (isEntitled()) {
      if (wanted && wanted !== getVoiceId()
          && ALL(db, "SELECT 1 AS x FROM voice WHERE id = ? AND status = 'active'", [wanted])[0]) {
        setVoiceId(wanted);
        localStorage.removeItem(VOICE_WANTED_KEY);
        repaint();
      }
      return;
    }
    const voiceId = getVoiceId();
    if (voiceId !== defId
        && !ALL(db, "SELECT is_default AS d FROM voice WHERE id = ?", [voiceId])[0]?.d) {
      localStorage.setItem(VOICE_WANTED_KEY, voiceId);
      setVoiceId(defId);
      repaint();
    }
  }
  const boot = () => refreshTrial()
    .then((ok) => { if (ok) { syncTrialVoice(); trialNudge(); repaint(); } });
  return { boot, syncTrialVoice };
}
