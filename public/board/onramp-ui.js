/**
 * The welcome (founder 2026-09-28): the only thing Pip asks before the
 * board. One screen — a name (optional) and "Who's it for?" — plus, for
 * a teen or adult, one more: "How should the buttons look?" Then the
 * short demo (tour-ui.js). Every prompt and every choice is said aloud
 * on show and on tap — users can't read. No photos, PIN, backup or
 * sign-in up front:
 * those come later, once something is worth protecting (Settings →
 * Overview). The old four-step "their world" form still opens from
 * Settings → Words → People & places, never by itself.
 *
 * Truth: the name and `audience` ('child' | 'adult') live on the
 * registry row; the look is learner_profile.presentation_mode (synced).
 */

const $ = (id) => document.getElementById(id);

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/** Preview tiles for the look question: real board words, real art. */
const PREVIEW = ["sns_0013", "sns_0128"]; // want, apple

export function mountOnramp({ me, saveUser, setLook, tileFor, say = () => {}, fitLabels = () => {}, onDone }) {
  let wrap = null;

  function screen(build) {
    wrap.replaceChildren();
    const card = el("div", "welcome-card");
    const mark = el("img", "welcome-mark");
    mark.src = "/brand/pip-mark-ink.svg";
    mark.alt = "";
    card.append(mark);
    build(card);
    wrap.append(card);
    // Focus a button, never the input — on touch devices focusing a text
    // field pops the software keyboard over the card before anyone has
    // seen it. A focused button keeps keyboard/AT flow without that.
    card.querySelector("button")?.focus();
  }

  function choiceRow(options, onPick) {
    const row = el("div", "welcome-choices");
    for (const [value, label, extra] of options) {
      const b = el("button", "welcome-choice");
      b.dataset.v = value;
      b.setAttribute("aria-pressed", "false");
      if (extra) b.append(extra);
      b.append(el("span", "welcome-choice-label", label));
      b.onclick = () => {
        for (const o of row.children) o.setAttribute("aria-pressed", String(o === b));
        say(label);
        onPick(value);
      };
      row.append(b);
    }
    return row;
  }

  function first() {
    let audience = null;
    screen((card) => {
      card.append(el("h1", null, "Let's set up Pip"));
      const label = el("label", "welcome-field");
      label.append(el("span", null, "Name"));
      const name = el("input");
      name.id = "welcome-name";
      name.placeholder = "Their name, or yours";
      name.autocomplete = "off";
      name.value = me.name ?? "";
      label.append(name);
      card.append(label);
      card.append(el("p", "welcome-q", "Who's it for?"));
      const go = el("button", "btn welcome-go", "Continue");
      go.disabled = true;
      card.append(choiceRow([["child", "A child"], ["adult", "A teen or adult"]], (v) => {
        audience = v;
        go.disabled = false;
      }));
      card.append(go);
      go.onclick = async () => {
        await saveUser({ name: name.value.trim(), audience });
        if (audience === "adult") look();
        else finish();
      };
      say("Let's set up Pip. Who's it for?");
    });
  }

  function look() {
    let choice = null;
    screen((card) => {
      card.append(el("h1", null, "How should the buttons look?"));
      card.append(el("p", "welcome-sub", "You can change this any time in Settings."));
      const tiles = (words) => {
        const box = el("div", `welcome-tiles${words ? " words-only" : ""}`);
        for (const id of PREVIEW) box.append(tileFor(id));
        return box;
      };
      const go = el("button", "btn welcome-go", "Continue");
      go.disabled = true;
      card.append(choiceRow([
        ["symbol", "Pictures and words", tiles(false)],
        ["label", "Words only", tiles(true)],
      ], (v) => { choice = v; go.disabled = false; }));
      card.append(go);
      go.onclick = () => { setLook(choice); finish(); };
      say("How should the buttons look?");
    });
    fitLabels(wrap);
  }

  async function finish() {
    await saveUser({ needsSetup: false });
    wrap.remove();
    wrap = null;
    onDone();
  }

  function start() {
    wrap = el("div", "welcome");
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.setAttribute("aria-label", "Welcome to Pip");
    document.body.append(wrap);
    first();
  }

  return { start };
}
