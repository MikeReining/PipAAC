/**
 * The remaining Settings rows (phase 044 slice E9; inventory ST-8, SB-7,
 * SB-9, KB-7): what the web's Language help, Spotlight and keyboard
 * settings own, as render models SwiftUI draws. Exported from
 * core_entry.mjs as PIPCORE.lang.
 *
 * Every write still goes through a shared owner the web calls too:
 * appSetSetting -> groups.setSetting (spot_pulse / spot_dim /
 * model_speaks / highlight_next / keyboard_mode), and
 * families.setFamilyItems for the Smart bar families. Nothing here
 * decides a rule the web decides.
 */
import { appBoard, appSession, resolveTyped } from "./app.mjs";

const PIP = () => globalThis.PIPCORE;
const one = (d, sql, p = []) => d.prepare(sql).all(...p)[0];

/* ---------------- SB-9: outline likely next words ---------------- */

/** board/grid.js applyLikely: up to three board cells the ranker invites
 *  next. Only on the board view (never in a group or with the keyboard
 *  open, never while editing), only once the bar has a word, only
 *  catalog senses; a stand-in person on the board (Mama for `mom`) takes
 *  the word's outline. `cellEls` in the web is exactly the word cells
 *  the board draws, so the cell set here is the board model's `word`
 *  cells' ids. Returns the cell ids to outline. */
export function likelyIds(s, board) {
  const on = one(s.d,
    "SELECT highlight_next AS h FROM learner_profile WHERE id = 'prf_local'")?.h === 1;
  if (!on || s.editing || s.view !== "board" || s.kbOpen || !s.sentence.length) return [];
  const drawn = new Set(board.cells.filter((c) => c.type === "word" && c.id).map((c) => c.id));
  const sents = s.sentence.map((x) => ({ kind: x.kind, id: x.id }));
  const next = [];
  for (const c of PIP().funnel.stripRanked(s.d, sents, Date.now(), s.locale, s.phrases).shown) {
    if (c.kind !== "sense") continue;
    const id = drawn.has(c.id) ? c.id : (PIP().groups.entityForSense(s.d, c.id)?.id ?? null);
    if (id === null || !drawn.has(id) || next.includes(id)) continue;
    next.push(id);
    if (next.length === 3) break;
  }
  return next;
}

/** The same cells, read on their own (a return to the board from a group
 *  or the keyboard; the web recomputes in setView). */
export function likely(appId) {
  return likelyIds(appSession(appId), appBoard(appId));
}

/* ---------------- SB-7: Smart bar word families ---------------- */

/** family-editor.js renderFamList: one chip per family, in id order. A
 *  family named only by its glyph shows its words instead, in bar order. */
export function families(appId) {
  const s = appSession(appId);
  const F = PIP().families;
  return F.families(s.d).map((f) => {
    const symbolOnly = !f.name?.trim() || f.name === f.glyph;
    const label = symbolOnly
      ? `${f.glyph ?? ""} ${F.familyItems(s.d, f.id, s.locale).map((i) => i.label).join(", ")}`.trim()
      : `${f.glyph ?? ""} ${f.name}`.trim();
    return { id: f.id, label };
  });
}

/** family-editor.js openFamForm: the family's tiles in their fixed
 *  order (the editor works on a copy until Save). */
export function familyOpen(appId, id) {
  const s = appSession(appId);
  const f = PIP().families.family(s.d, id);
  if (!f) throw new Error(`familyOpen: no family ${id}`);
  return {
    id,
    title: `${f.name} — fixed order`,
    items: PIP().families.familyItems(s.d, id, s.locale)
      .map((i) => ({ kind: i.kind, id: i.id, label: i.label })),
  };
}

/** family-editor.js #fam-add-btn: the typed word resolves exactly as the
 *  keyboard resolves it; an unknown word is "No such word". */
export function familyResolve(appId, text) {
  const hit = resolveTyped(appSession(appId), String(text ?? ""));
  if (!hit || hit.kind === "typed") return { ok: false, toast: "No such word" };
  return { ok: true, item: { kind: hit.kind, id: hit.id, label: hit.display } };
}

/** family-editor.js #fam-save: one setFamilyItems call carries the whole
 *  new order (it records the synced op). */
export function familySave(appId, id, items) {
  const s = appSession(appId);
  PIP().families.setFamilyItems(s.d, id,
    items.map((i) => ({ kind: i.kind, id: i.id })));
  return { toast: "Family saved", families: families(appId) };
}

/* ---------------- ST-8: the Spotlight page's settings ---------------- */

const DIM_WORDS = { 60: "a little", 45: "medium", 30: "a lot" };

/** The Look preview's four tiles: the board's own words, each glowing
 *  (First words) or dimmed (spotlight-sheet.js renderLook / showcaseLit). */
function lookPreview(s) {
  const { SHOWCASE, showcaseLit } = PIP().spotlightStarters;
  return SHOWCASE.tiles.slice(1, 5).map((id) => {
    const r = one(s.d,
      `SELECT l.text AS label, s.fitzgerald_role AS role, ${PIP().images.SENSE_ART_SQL} AS art
       FROM sense s JOIN label l ON l.sense_id = s.id AND l.kind = 'lemma'
         AND l.status = 'approved' AND l.locale = ? WHERE s.id = ?`,
      [s.locale, id]);
    return { id, label: r?.label ?? id, role: r?.role ?? "None", art: r?.art ?? null, lit: showcaseLit(id) };
  });
}

/** spotlight-sheet.js renderModel + renderLook, as text and selections.
 *  `role` is the open person's role ("partner" = a supporter's device),
 *  `name` the person the board belongs to. */
export function spotlightPage(appId, { role = null, name = "" } = {}) {
  const s = appSession(appId);
  const p = one(s.d, "SELECT * FROM learner_profile WHERE id = 'prf_local'") ?? {};
  const supporter = role === "partner";
  const who = String(name ?? "").trim() || "this person";
  const pulse = (p.spot_pulse ?? 0) === 1;
  const dim = p.spot_dim ?? 45;
  const dimWord = DIM_WORDS[dim] ?? "";
  return {
    intro: "Light up the words you're teaching. Everything else dims, but still speaks.",
    supporter,
    roleNow: supporter ? "This is a supporter's device." : `This is ${who}'s board.`,
    modelHint: supporter
      ? `Start a spotlight here. Its words light up on this screen, with a number for each time ${who} presses it. Tap a word here and it lights up on ${who}'s board for a few seconds. Say it as you tap.`
      : "A spotlight started here glows on this board. Started from a supporter's device, nothing glows here until the supporter taps a word. Then that word lights up for a few seconds.",
    pulse, dim, modelSpeaks: (p.model_speaks ?? 0) === 1,
    lookSummary: `${pulse ? "Pulsing" : "Steady"} glow · dim ${dimWord}`,
    // spotlight-sheet.js renderLook: HERO.slice(1, 5), lit by First words.
    look: lookPreview(s),
  };
}
