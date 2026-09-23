/**
 * 017 step 16 — the real-board action and time model. Replaces the
 * "every non-core word costs 3 taps" stub with the path the board
 * actually offers, and prices time so WPM — the headline — can move:
 *
 *   activations  Groups anchor + index page flips + group tile +
 *                group page flips + item tap, from the seeded
 *                group_cell/board_group rows — never a hand table.
 *   finding      home-grid words cost less once the user has said them;
 *                group pages cost a scan per page, index included.
 *   recall       deciding is per message from the answer key; recalling
 *                the word is per word and shrinks when the tile is
 *                already on screen (recall_saving, reported 0/50/90%).
 *   typing       a word with no group_cell is spelled through the real
 *                forgiving-completions matcher (spelling.mjs) — letters
 *                until the word is in the completions row, plus the tap.
 *
 * One config object owns every constant — the report sweeps motor and
 * scan low/mid/high so no conclusion rides on one guess.
 */
import { canonPos, indexVisual, visualCell } from "../../../public/shared/groups.mjs";
import { buildIndex, suggest } from "../../../public/shared/spelling.mjs";

/** Starting values — step 28's real timings replace them. Calibration
 *  target: A0 ≈ 10 WPM at the middle setting on fit users (R12). */
export const ACTION_DEFAULTS = {
  motorMs: 1000,          // per activation; reported at 600/1000/2000
  findHomeMinMs: 400,     // a home word said often
  findHomeMaxMs: 1500,    // a home word the user rarely says
  familiarAt: 15,         // own-use count where finding/recall floor out
  groupPageScanMs: 1200,  // per page scanned, group or index
  stripScanMs: 300,       // per tile looked at
  inspectActions: 0.25,   // action-equivalents per non-empty strip look
  slip: 0.02,             // neighbor-tile chance, applied in expectation
  backspaceActions: 1,
  recallBaseMs: 1200,     // recalling a well-worn word
  recallRareMs: 3500,     // a word this user almost never says
  recallSaving: 0.5,      // share of recall cut when the word is shown
  reachMs: 600,           // finger starts moving before the pick (step 2)
};

/** The three reporting settings — every headline is a row per setting. */
export const SETTINGS = {
  low: { motorMs: 600, stripScanMs: 150, groupPageScanMs: 800 },
  mid: {},
  high: { motorMs: 2000, stripScanMs: 600, groupPageScanMs: 2000 },
};

const all = (db, sql, params = []) => db.prepare(sql).all(...params);
const one = (db, sql, params = []) => all(db, sql, params)[0];

/**
 * The seeded board minus the answer key's off-board words (step 11's
 * ~3%): their group cells are deleted, so the only path left is the
 * keyboard. Call after importCatalog seeded the groups.
 */
export function seedUserBoard(db, catalog, user) {
  const lemmaId = new Map(
    catalog.labels.filter((l) => l.kind === "lemma" && l.locale === "en")
      .map((l) => [l.text.toLowerCase(), l.sense_id]));
  const typed = new Set();
  for (const d of user.days) {
    for (const m of d.messages) for (const w of m.typed ?? []) typed.add(w);
  }
  for (const w of typed) {
    const sid = lemmaId.get(w.toLowerCase());
    if (sid) {
      db.prepare(
        "DELETE FROM group_cell WHERE item_kind = 'sense' AND item_id = ?").run(sid);
    }
  }
  return typed;
}

/**
 * Per-user model. `db` is the seeded board for this user; `entities`
 * maps lowercase spoken names to entity ids. Familiarity is the model's
 * own count of the word — the bench feeds picks in order, so counts
 * grow exactly as the child's experience does.
 */
export function actionModel(db, catalog, entities, cfg = {}) {
  const C = { ...ACTION_DEFAULTS, ...cfg };
  const cells = 60;

  const lemmaId = new Map(
    catalog.labels.filter((l) => l.kind === "lemma" && l.locale === "en")
      .map((l) => [l.text.toLowerCase(), l.sense_id]));
  const entId = new Map(entities.map((e) =>
    [(e.spokenName ?? e.name).toLowerCase(), e.id]));
  const coreSet = new Set(
    all(db, "SELECT sense_id FROM core_cell WHERE layout = 'grid60'")
      .map((r) => r.sense_id));

  // The real keyboard matcher over every speakable word — completions
  // decide how many letters a typed word costs.
  const spellingIndex = buildIndex([
    ...catalog.labels.filter((l) => l.kind === "lemma" && l.locale === "en")
      .map((l) => ({ kind: "sense", id: l.sense_id, text: l.text, freq: 0 })),
    ...entities.map((e) => ({
      kind: "entity", id: e.id,
      text: (e.spokenName ?? e.name).toLowerCase(), freq: 0 })),
  ], "en");

  const pathCache = new Map(); // kind:id -> path
  const seen = new Map();      // word -> own-use count

  const resolve = (w) => {
    const lw = w.toLowerCase();
    if (entId.has(lw)) return { kind: "entity", id: entId.get(lw) };
    const id = lemmaId.get(lw);
    if (!id) throw new Error(`answer-key word has no catalog lemma: ${w}`);
    return { kind: "sense", id };
  };

  /** Activations + page flips to reach an item from the home grid, from
   *  the real group_cell rows. Min over every placement. */
  function wordPath(kind, id) {
    const key = `${kind}:${id}`;
    if (pathCache.has(key)) return pathCache.get(key);
    let path;
    if (kind === "sense" && coreSet.has(id)) {
      path = { kind: "core", actions: 1, pages: 0 };
    } else {
      const rows = all(db,
        `SELECT gc.page, gc.slot_index, g.index_slot
         FROM group_cell gc JOIN board_group g ON g.id = gc.group_id
         WHERE gc.item_kind = ? AND gc.item_id = ?`, [kind, id]);
      if (rows.length) {
        // Groups anchor + index flips + group tile + group flips + item.
        const best = rows.map((r) => {
          const indexPage = indexVisual(r.index_slot, cells).page;
          const itemPage = visualCell(canonPos(r.page, r.slot_index), cells).page;
          return {
            kind: "group",
            actions: 1 + indexPage + 1 + itemPage + 1,
            pages: indexPage + itemPage + 1, // scanned incl. landing page
          };
        }).sort((a, b) => a.actions - b.actions)[0];
        path = best;
      } else {
        path = { kind: "type" };
      }
    }
    if (path.kind === "type") {
      // Letters until the real completions row shows the word, + the tap.
      const text = kind === "entity"
        ? (entities.find((e) => e.id === id)?.spokenName
          ?? entities.find((e) => e.id === id)?.name)?.toLowerCase()
        : [...lemmaId.entries()].find(([, v]) => v === id)?.[0];
      let letters = text.length;
      for (let n = 1; n <= text.length; n++) {
        if (suggest(spellingIndex, text.slice(0, n))
          .some((e) => e.kind === kind && e.id === id)) {
          letters = n;
          break;
        }
      }
      path = { kind: "type", actions: letters + 1, pages: 0, letters };
    }
    pathCache.set(key, path);
    return path;
  }

  const lerp = (min, max, count) =>
    min + (max - min) * Math.max(0, 1 - count / C.familiarAt);

  /**
   * Price one intended word. `ctx` = {shown: ["kind:id",...], typed,
   * repair:{position,wrong}|null}. Returns actions, ms, and the parts
   * for the report (find/recall/motor/scan/type), plus the strip
   * verdict: "hit" | "harmful" | "unhelpful" | null (no strip shown).
   */
  function cost(word, ctx = {}) {
    const { kind, id } = resolve(word);
    const key = `${kind}:${id}`;
    const count = seen.get(word) ?? 0;
    seen.set(word, count + 1);

    const shown = ctx.shown ?? [];
    const hitIdx = shown.indexOf(key);
    const hit = hitIdx >= 0;
    const path = wordPath(kind, id);

    const recall = lerp(C.recallBaseMs, C.recallRareMs, count);
    const parts = { recall, find: 0, scan: 0, motor: 0, type: 0 };
    let actions = 0;
    let verdict = null;

    if (shown.length) {
      // The user looks at the strip whether or not it helps.
      const looked = hit ? hitIdx + 1 : shown.length;
      parts.scan = looked * C.stripScanMs;
      actions += C.inspectActions;
    }
    if (hit) {
      actions += 1;
      parts.recall = recall * (1 - C.recallSaving);
    } else {
      actions += path.actions;
      if (path.kind === "core") {
        parts.find = lerp(C.findHomeMinMs, C.findHomeMaxMs, count);
      } else if (path.kind === "group") {
        parts.find = path.pages * C.groupPageScanMs;
      } else {
        parts.type = path.actions * C.motorMs; // letters priced as taps
      }
    }
    if (shown.length) {
      if (!hit) {
        verdict = "harmful"; // looked, gained nothing
      } else {
        // Unhelpful: shown, but the strip cost more than it saved vs
        // taking the word's normal path with full recall.
        const hitMs = (hitIdx + 1) * C.stripScanMs + C.motorMs
          + recall * (1 - C.recallSaving);
        const altMs = shown.length * C.stripScanMs
          + path.actions * C.motorMs
          + (path.kind === "core"
            ? lerp(C.findHomeMinMs, C.findHomeMaxMs, count)
            : path.kind === "group" ? path.pages * C.groupPageScanMs : 0)
          + recall;
        verdict = hitMs < altMs ? "hit" : "unhelpful";
      }
    }
    parts.motor = actions * C.motorMs;
    // A mistaken neighbor tile, in expectation: backspace + correct path.
    if (hit && C.slip > 0) {
      const slipCost = C.slip *
        (C.backspaceActions * C.motorMs + path.actions * C.motorMs);
      parts.motor += slipCost;
      actions += C.slip * (C.backspaceActions + path.actions);
    }
    // An answer-key repair: the wrong pick's real path, backspace, redo.
    if (ctx.repair && ctx.repair.position === ctx.position) {
      const w = resolve(ctx.repair.wrong);
      const wrong = wordPath(w.kind, w.id);
      actions += wrong.actions + C.backspaceActions;
      parts.motor += (wrong.actions + C.backspaceActions) * C.motorMs;
    }
    const ms = parts.recall + parts.find + parts.scan + parts.motor + parts.type;
    return { word, actions, ms, parts, verdict, hit };
  }

  /**
   * Price one answer-key message: deciding pause once, then each word.
   * `shownFor(position)` gives the strip tiles at that moment (the arm's
   * replay provides them; the no-prediction arm returns []).
   */
  function costMessage(msg, shownFor = () => []) {
    let actions = 0, ms = msg.decidingMs ?? 0;
    const verdicts = { hit: 0, harmful: 0, unhelpful: 0 };
    for (let i = 0; i < msg.words.length; i++) {
      const c = cost(msg.words[i], {
        shown: shownFor(i),
        position: i,
        repair: msg.repair ?? null,
      });
      actions += c.actions;
      ms += c.ms;
      if (c.verdict) verdicts[c.verdict] = (verdicts[c.verdict] ?? 0) + 1;
    }
    return { actions, ms, verdicts };
  }

  return { cost, costMessage, wordPath, resolve, cfg: C };
}

/** WPM headline: intended words per total modeled minute. */
export const wpm = (words, ms) => words / (ms / 60000);
