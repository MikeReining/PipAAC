/** Settings PIN gate (023 §1e) + the overlay helpers every board module
 *  shares (`open`/`close`, the [data-close] wiring, backdrop dismissal).
 *  The Escape/hotkey router stays in board.js — it drives views, not
 *  overlays. `live.settingsUi` is read lazily: Settings mounts after
 *  this module. */
import {
  PIN_RE, RESET_PHRASE, checkPin, clearPin, hasPin, isResetPhrase, setPin,
} from "../shared/pin.mjs";
import { openKeyStore } from "../shared/sync_crypto.mjs";

const $ = (id) => document.getElementById(id);

export function mountPin({ live, toast }) {
  /* --- overlays --- */
  const open = (id) => $(id).classList.add("open");
  const close = (id) => $(id).classList.remove("open");
  document.querySelectorAll("[data-close]").forEach((b) =>
    b.addEventListener("click", () => b.closest(".overlay").classList.remove("open")),
  );
  // Backdrop tap dismisses any open overlay — a modal that can't be
  // dismissed strands the learner. (Escape joins it in board.js's
  // keydown router, which also owns views and hotkeys.)
  document.querySelectorAll(".overlay").forEach((o) =>
    o.addEventListener("click", (e) => {
      if (e.target === o) o.classList.remove("open");
    }),
  );

  /** 023 §1e — the Settings PIN gates Settings. Every open asks once a
   *  PIN is set. Forgot: type the reset phrase, then choose a new PIN
   *  twice — the words are never touched. `change` (from Settings →
   *  Backup & privacy) asks for the new PIN twice and never for the old
   *  one: the gate was just passed. */
  const PIN_SHARE_HINT = "Pick one you're happy to share with the team. Don't reuse your phone or bank PIN.";
  async function gatePin(onOk, { change = false } = {}) {
    const overlay = $("pinform"), input = $("pin-input"),
          err = $("pin-error"), hint = $("pin-hint"),
          title = $("pin-title"), go = $("pin-go"), forgot = $("pin-forgot");
    const store = await openKeyStore();
    const locked = await hasPin(store);
    // No PIN yet: Settings opens with one tap (founder 2026-09-28).
    if (!change && !locked) return onOk();
    let mode = change ? "new" : "check";
    let reset = false;
    let first = "";
    const render = () => {
      const phrase = mode === "forgot";
      err.textContent = "";
      input.value = "";
      input.type = phrase ? "text" : "password";
      input.inputMode = phrase ? "text" : "numeric";
      input.maxLength = phrase ? 20 : 4;
      go.hidden = !phrase;
      input.classList.toggle("phrase", phrase);
      input.placeholder = phrase ? "" : mode === "check" ? "" : "4 digits";
      forgot.hidden = mode !== "check";
      if (mode === "new") {
        title.textContent = reset ? "Choose a new PIN" : locked ? "New Settings PIN" : "Choose a PIN";
        hint.textContent = "4 digits, for everyone on this device. " + PIN_SHARE_HINT;
      } else if (mode === "confirm") {
        title.textContent = "Type it again";
        hint.textContent = "The same 4 digits, to be sure.";
      } else if (mode === "check") {
        title.textContent = "Settings PIN";
        hint.textContent = "";
      } else {
        title.textContent = "Forgot the PIN?";
        const word = document.createElement("strong");
        word.textContent = RESET_PHRASE;
        hint.replaceChildren("Your words stay just as they are. To choose a new PIN, type ",
          word, " below.");
        go.textContent = "Continue";
      }
      input.focus();
    };
    const finish = () => { overlay.classList.remove("open"); onOk(); };
    go.onclick = async () => {
      const v = input.value.trim();
      if (mode === "check") {
        if (await checkPin(store, v)) return finish();
        input.value = "";
        err.textContent = "Not that PIN.";
        return;
      }
      if (mode === "forgot") {
        if (isResetPhrase(v)) { reset = true; mode = "new"; render(); }
        else err.textContent = `Type the two words: ${RESET_PHRASE}`;
        return;
      }
      if (!PIN_RE.test(v)) { err.textContent = "4 digits."; return; }
      if (mode === "new") { first = v; mode = "confirm"; render(); return; }
      if (mode === "confirm" && v !== first) {
        mode = "new"; render();
        err.textContent = "Those didn't match. Start again.";
        return;
      }
      await setPin(store, v);
      if (reset) toast("New PIN saved.");
      else if (change) toast(locked ? "Settings PIN changed." : "Settings is locked with a PIN.");
      finish();
    };
    input.onkeydown = (e) => { if (e.key === "Enter") go.click(); };
    // Four digits is the whole PIN: act on the fourth, no button.
    input.oninput = () => {
      if (mode !== "forgot" && /^\d{4}$/.test(input.value)) go.click();
    };
    forgot.onclick = () => { mode = "forgot"; render(); };
    render();
    overlay.classList.add("open");
    input.focus();
  }

  /** Settings → Backup & privacy → Settings PIN: lock, change, or off. */
  let pinOn = false; // Settings' Protect card reads it; renderPinRow keeps it
  async function renderPinRow() {
    const on = await hasPin(await openKeyStore());
    pinOn = on;
    live.settingsUi.renderNav();
    $("pin-state").textContent = on
      ? "Settings is locked with a PIN."
      : "No PIN yet: Settings opens with one tap.";
    $("pin-change").textContent = on ? "Change PIN" : "Lock Settings with a PIN";
    $("pin-off").hidden = !on;
  }
  $("pin-change").addEventListener("click", () => gatePin(renderPinRow, { change: true }));
  $("pin-off").addEventListener("click", async () => {
    await clearPin(await openKeyStore());
    toast("PIN turned off. Settings opens with one tap.");
    renderPinRow();
  });

  return {
    open, close, gatePin, renderPinRow,
    get pinOn() { return pinOn; },
  };
}
