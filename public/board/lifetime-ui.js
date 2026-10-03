/**
 * 040 — the Pip Lifetime page: the Settings sidebar's first item while
 * unlicensed, and the one destination every paid-feature door lands on
 * (the transform ask, a locked face or voice, Progress's preview, the
 * word/supporter/device walls).
 *
 * The page sells on truth only: every row in "What Lifetime adds" is a
 * shipped feature, and "Hear the difference" plays real recordings
 * (shipped onramp clips — never device TTS). The module owns page
 * behaviour (the countdown line, the demo buttons, the no-account code
 * checkout, the unlock link, and the demoted code field's door to the
 * real one) plus the trial clock that drives the whole phase.
 */
import { buyCodes } from "../shared/account.mjs";

const $ = (id) => document.getElementById(id);
const ALL = (db, sql, p = []) => db.all(sql, p);

export function mountLifetime({ me, sayClip, hearFree, show, toast, trial }) {
  /* iOS stays Apple IAP only (Pricing § 4.5): the web checkout is never
   * linked there — Buy and the unlock link hide behind a pointer. */
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  $("life-ios") && ($("life-ios").hidden = !isIOS);
  $("life-buy-row") && ($("life-buy-row").hidden = isIOS);
  $("life-link-row") && ($("life-link-row").hidden = isIOS);

  /** The countdown line under the hero — reads the server's mirror. */
  function renderTrial() {
    const t = trial();
    const line = $("life-trial-line");
    if (t.licensed) { line.hidden = true; return; }
    line.hidden = false;
    const days = t.endsAt ? Math.ceil((t.endsAt - Date.now()) / 86_400_000) : 0;
    line.textContent = days > 0
      ? `Free trial · ${days} day${days === 1 ? "" : "s"} left — everything on this page is already on.`
      : "The free trial has ended — everything on this page is waiting.";
  }

  /* Hear the difference — the real thing both ways: the free side plays
   * the actual word clips for "I want an apple" (exactly what a free
   * Play does), the Lifetime side the shipped natural-sentence clip. */
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

  // "Have a code or key?" — the real field lives in Your account; this
  // is a door to it, demoted (040 § 7.4).
  $("life-code").onclick = () => {
    show("you", { focus: true });
    $("dev-lifetime-row")?.scrollIntoView({ block: "center" });
    $("dev-license")?.focus({ preventScroll: true });
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
