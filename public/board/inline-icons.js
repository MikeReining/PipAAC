/**
 * Sentence-button icons inside text (032, founder 2026-09-30): the ✨ emoji
 * is drawn by the device's emoji font — yellow on white, nearly invisible,
 * and not what the button looks like. Text that names a sentence button
 * shows the button's own icon instead, copied from the live top-bar
 * button: it takes the text colour and matches what the adult presses.
 *
 * `withIcons(el, text)` fills `el` with `text`, each ✨ ❓ ⏪ ⏩ replaced by
 * that button's icon. Without the live button (tests), the emoji stays.
 */
const BUTTONS = { "✨": "tx-fix", "❓": "tx-question", "⏪": "tx-past", "⏩": "tx-future" };
const GLYPHS = new RegExp(`(${Object.keys(BUTTONS).join("|")})`, "u");

export function withIcons(el, text) {
  const parts = String(text).split(GLYPHS);
  const iconFor = (part) => BUTTONS[part] && document.getElementById?.(BUTTONS[part])?.querySelector?.("svg");
  if (!parts.some(iconFor)) {
    el.textContent = String(text); // nothing to draw — plain text
    return el;
  }
  el.replaceChildren();
  for (const part of parts) {
    if (!part) continue;
    const svg = iconFor(part);
    if (!svg) {
      el.append(part);
      continue;
    }
    const icon = document.createElement("span");
    icon.className = "text-icon";
    icon.setAttribute("role", "img");
    icon.setAttribute("aria-label", document.getElementById(BUTTONS[part]).getAttribute("aria-label") ?? part);
    icon.append(svg.cloneNode(true));
    el.append(icon);
  }
  return el;
}
