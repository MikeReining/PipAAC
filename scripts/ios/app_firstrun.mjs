/**
 * The iOS first-run facade (phase 044 slice E7; PF-2, PF-3, PF-4, SN-11):
 * the welcome, the "their world" pass and the scripted demo tour, as
 * render models SwiftUI draws. Exported from core_entry.mjs as
 * PIPCORE.firstrun. Replay-the-tour (ST-9, Settings) calls the same
 * `tourStart` - nothing here is first-run-only except the decision to
 * show it, which is the registry row's `needsSetup` (Swift).
 *
 * Mirrors, by closure (line ranges are public/ at 2026-10-15):
 *   welcome        board/onramp-ui.js mountOnramp first() 62-106, look()
 *                  108-126, finish() 128-136 (copy verbatim; the page
 *                  reload there is Swift dismissing the overlay)
 *   look           board/settings-sync.js setLook 161-167
 *   name           board.js saveUser 137-141 -> shared/person_name.mjs
 *                  nameToProfile (the registry half is Swift's, like
 *                  the web's userStore.put)
 *   world          board/setup-ui.js mountSetup 21-300: meta 56-79,
 *                  render 90-122, apply 220-262, finish 266-276
 *                  over shared/setup.mjs + shared/bulk.mjs, unchanged
 *   tour           board/tour-ui.js mountTour 40-206 (+ board.js 1441-
 *                  1470 board hooks): steps 62-78, hooks 131-155
 *
 * The demo is scripted and offline. It touches NO network and writes
 * NOTHING durable: a tour tap puts the word on the bar WITHOUT
 * logSelection / openSentence / impressions (board.js routes taps to the
 * tour's hook before the tap log), and ✨/❓ set the bar from SCRIPT with
 * the web's own txbar.applyTransform - no Worker call, no snapshot, no
 * learner_event_log row. The tour's Smart bar is the one scripted card,
 * built here, so the live strip (which opens a sentence and logs
 * impressions) is never asked while the tour runs.
 *
 * The web's tour-ui.js header says "⏪ -> I wanted an apple" but its code
 * (SCRIPT, buildSteps) walks you -> want -> apple -> ✨ -> ❓; the code
 * and docs/product/Sentence_Bar.md agree and win.
 */
import {
  appBar, appClear, appMeta, appRepaint, appSession, appSettings, appSetSetting,
} from "./app.mjs";
import { artForWord } from "./app_say.mjs";

const PIP = () => globalThis.PIPCORE;
const one = (d, sql, p = []) => d.prepare(sql).all(...p)[0];

/* ---------------- copy (verbatim from the web) ---------------- */

const clip = (key) => ({ key, path: PIP().onrampAudio.onrampClipPath(key) });

/** Preview tiles for the look question (onramp-ui.js PREVIEW). */
const PREVIEW = ["sns_0013", "sns_0128"]; // want, apple

/** The web's first run goes welcome -> demo; the "their world" form
 *  "still opens from Settings -> Words -> People & places, never by
 *  itself" (onramp-ui.js header). Web semantics win (044 § 2). */
export const OFFER_WORLD_IN_FIRST_RUN = false;

export function welcome(appId, { name = "" } = {}) {
  const s = appSession(appId);
  const tile = (id) => {
    const l = one(s.d,
      `SELECT l.text AS label, s.fitzgerald_role AS role FROM sense s
       JOIN label l ON l.sense_id = s.id AND l.kind = 'lemma'
         AND l.status = 'approved' AND l.locale = ? WHERE s.id = ?`, [s.locale, id]);
    return { id, label: l?.label ?? id, role: l?.role ?? "None", art: appMeta(s, id).art };
  };
  return {
    welcome: {
      title: "Let's set up Pip",
      nameLabel: "Name",
      namePlaceholder: "Their name, or yours",
      name,
      whoQ: "Who's it for?",
      choices: [
        { value: "child", label: "A child", clip: clip("a-child") },
        { value: "adult", label: "A teen or adult", clip: clip("a-teen-or-adult") },
      ],
      go: "Continue",
      joinLead: "Already use Pip on another device? ",
      join: "Enter a code",
      clip: clip("welcome-setup"),
    },
    look: {
      title: "How should the buttons look?",
      sub: "You can change this any time in Settings.",
      choices: [
        { value: "symbol", label: "Pictures and words", clip: clip("pictures-and-words") },
        { value: "label", label: "Words only", clip: clip("words-only") },
      ],
      go: "Continue",
      preview: PREVIEW.map(tile),
      clip: clip("welcome-look"),
    },
    offersWorld: OFFER_WORLD_IN_FIRST_RUN,
  };
}

/** The welcome's Continue: the name goes to the synced profile
 *  (person_name.mjs nameToProfile, exactly what saveUser triggers); the
 *  registry row (`name`, `audience`) is Swift's half. */
export function welcomeSave(appId, { name = "", audience }) {
  if (audience !== "child" && audience !== "adult") throw new Error("welcomeSave: audience");
  const s = appSession(appId);
  const clean = String(name).trim();
  PIP().personName.nameToProfile(s.d, { name: clean });
  return { name: clean, audience };
}

/* ---------------- the button look (PF-2, BS-22) ---------------- */

const LOOKS = ["symbol", "label"];

/** settings-sync.js setLook: learner_profile.presentation_mode, synced. */
export function setLook(appId, { look }) {
  if (!LOOKS.includes(look)) throw new Error(`setLook: ${look}`);
  appSetSetting(appId, "presentation_mode", look);
  return lookOf(appId);
}

export function lookOf(appId) {
  const m = one(appSession(appId).d,
    "SELECT presentation_mode AS m FROM learner_profile WHERE id = 'prf_local'")?.m ?? "symbol";
  return { look: m, wordsOnly: m === "label" };
}

/* ---------------- "Tell us about their world" (PF-3) ---------------- */

const WORLD = [
  { key: "people", hint: "A name for each person. Tap the square to add their photo.", next: "Next" },
  { key: "pets", title: "Any pets?", hint: "A name each, one per line — Buddy, Whiskers.", next: "Next" },
  { key: "foods", title: "Favorite foods",
    hint: "One per line — pizza, mac and cheese. Words the library knows get their picture.", next: "Next" },
  { key: "places", title: "Places they go",
    hint: "One per line — school, the park, Grandma's.", next: "Done" },
];

const stepOf = (key) => WORLD.find((m) => m.key === key) ?? (() => { throw new Error(`world step ${key}`); })();
const groupOf = (key) => PIP().setup.stepGroup(key);

/** 015 slice 6: the free-word cap applies inside the wizard too. iOS has
 *  no license seam yet (`s.licensed`, like app_library.mjs). */
const ownLeft = (s) => (s.licensed ? Infinity
  : Math.max(0, PIP().groups.OWN_WORDS_FREE - PIP().groups.liveOwnWords(s.d)));
const capToast = () =>
  `That's your ${PIP().groups.OWN_WORDS_FREE} free words — Pip Lifetime adds unlimited.`;

const categoryOf = (s, key) =>
  s.catalog.groups.find((g) => g.id === groupOf(key))?.category ?? null;

const personName = (s, name) =>
  (name ?? "").trim() || PIP().personName.profileName(s.d) || "";

/** setup-ui.js openWizard/render: the four steps and the People rows -
 *  who is already there first (a second pass edits the family), padded
 *  to two blank rows (Mom and Dad's seats). */
export function worldOpen(appId, { name } = {}) {
  const s = appSession(appId);
  const who = personName(s, name);
  const people = PIP().setup.setupPeople(s.d).map((p) => ({ id: p.id, name: p.name, photoKey: p.photoKey }));
  while (people.length < 2) people.push({ id: null, name: "", photoKey: null });
  return {
    steps: WORLD.map((m) => ({
      key: m.key,
      title: m.key === "people" ? `Who does ${who || "your child"} call for?` : m.title,
      hint: m.hint,
      next: m.next,
    })),
    examples: ["Mom", "Dad"],
    otherExample: "Grandma",
    namePlaceholder: "Name",
    people,
    addRow: "Add someone",
    skip: "Skip this step",
    back: "Back",
  };
}

/** setup-ui.js renderPreview: each line shows the tile it becomes. */
export function worldPreview(appId, { step, text = "" }) {
  const s = appSession(appId);
  const rows = PIP().bulk.resolvePasteRows(s.d, text, { groupId: groupOf(step), locale: s.locale });
  return {
    rows: rows.map((r) => {
      const art = r.kind === "sense"
        ? one(s.d, `SELECT ${PIP().images.SENSE_ART_SQL} AS art FROM sense s WHERE s.id = ?`, [r.id])?.art
        : null;
      return {
        label: r.label, kind: r.kind, art: art ?? null,
        initial: (r.label[0] ?? "").toUpperCase(),
        already: r.already,
        tag: r.already ? "already here" : r.kind === "new" ? "new — picture later" : null,
      };
    }),
  };
}

/** setup-ui.js apply(): one step's Next. People rows arrive with their
 *  photo already in the blob store (`photoKey`, E3's path); lists go
 *  through bulk.applyPasteRows. Returns what the web's toast/finish
 *  need plus the repainted state. */
export function worldApply(appId, { step, people = [], text = "" }) {
  const s = appSession(appId);
  stepOf(step);
  let wrote = false, toast = null;
  if (step === "people") {
    const rows = people
      .filter((p) => (p.name ?? "").trim())
      .map((p) => ({ id: p.id ?? undefined, name: p.name, photoKey: p.photoKey ?? null }));
    const res = PIP().setup.applySetupPeople(s.d, {
      people: rows, locale: s.locale, category: categoryOf(s, "people"), maxNew: ownLeft(s),
    });
    for (const r of rows) if (r.photoKey) PIP().mediasync.queueUpload(r.photoKey);
    if (res.refused) toast = capToast();
    wrote = !!(res.added || res.updated);
  } else {
    const rows = PIP().bulk.resolvePasteRows(s.d, text, { groupId: groupOf(step), locale: s.locale });
    if (rows.some((r) => !r.already)) {
      const res = PIP().bulk.applyPasteRows(s.d, rows, {
        groupId: groupOf(step), category: categoryOf(s, step), maxNew: ownLeft(s),
      });
      if (res.refused) toast = capToast();
      wrote = true;
    }
  }
  return { wrote, toast, state: wrote ? appRepaint(appId) : null };
}

/** setup-ui.js finish(): the toast when anything was written. */
export const worldDone = ({ wrote }) => ({ toast: wrote ? "Their world is set up" : null });

/* ---------------- the demo tour (PF-4, SN-11) ---------------- */

/* tour-ui.js SCRIPT: verified live 2026-10-03 (Sentence_Bar.md table). */
export const SCRIPT = {
  you: "sns_0002",
  want: "sns_0013",
  apple: "sns_0128",
  fix: "You want an apple.",
  question: "Do you want an apple?",
};

const tours = new Map(); // appId -> { steps, step }

function buildSteps(s) {
  const shown = PIP().bar.barControls(s.d);
  const steps = [
    { id: "you", say: "Tap you.", clip: "tour-you", target: { kind: "cell", id: SCRIPT.you } },
    { id: "want", say: "Tap want.", clip: "tour-want", target: { kind: "cell", id: SCRIPT.want } },
    { id: "apple", say: "Now tap apple in the Smart bar.", clip: "tour-apple",
      target: { kind: "strip", id: SCRIPT.apple } },
  ];
  if (shown.has("fix")) {
    steps.push({ id: "fix", say: "Tap ✨ to make it a sentence.", clip: "tour-fix",
      target: { kind: "button", id: "fix" } });
  }
  if (shown.has("question")) {
    steps.push({ id: "question", say: "Now tap ❓ to ask it.", clip: "tour-question",
      target: { kind: "button", id: "question" } });
  }
  steps.push({ id: "done", say: "That's Pip. Now try your own.", clip: "tour-done", target: null, done: true });
  return steps;
}

/** The step's card (tour-ui.js show()). `online` is Swift's reachability. */
function cardOf(t, online) {
  const st = t.steps[t.step];
  const hasModel = t.steps.some((x) => x.id === "fix" || x.id === "question");
  const card = {
    id: st.id, say: st.say, clip: clip(st.clip), target: st.target, done: !!st.done,
    skip: st.done ? null : "Skip",
  };
  if (st.done) {
    card.note = !hasModel
      ? "Build a sentence and ▶ speaks it."
      : online === false
        ? "✨ and ❓ need the internet to work on your own sentences. Connect when you can."
        : "✨ and ❓ work on any sentence you build.";
    card.voices = "Try other voices";
    card.go = "Start talking";
  }
  return card;
}

/** tour stripItems: the one scripted Smart-bar card during "apple". */
function tourStrip(s, t) {
  if (t.steps[t.step].id !== "apple") return { cap: 4, mode: "predict", cards: [] };
  const w = one(s.d,
    `SELECT s.id, l.text AS label, s.fitzgerald_role AS role FROM sense s
     JOIN label l ON l.sense_id = s.id AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = ?
     WHERE s.id = ?`, [s.locale, SCRIPT.apple]);
  return {
    cap: 4, mode: "predict",
    cards: [{ kind: "sense", id: w.id, label: w.label, role: w.role, art: appMeta(s, w.id).art }],
  };
}

function paint(appId, t, { online, ...extra } = {}) {
  const s = appSession(appId);
  if (online !== undefined) t.online = online; // Swift's reachability, last told
  return {
    active: true, card: cardOf(t, t.online),
    bar: appBar(appId), strip: tourStrip(s, t),
    tense: s.barState.tense, question: s.barState.question,
    ...extra,
  };
}

const slotOf = (s, item) => PIP().voice.resolveSlot(s.d, item, s.locale, s.voiceId);
const clipSlot = (key) => ({ type: "file", key: clip(key).path, text: null });

/** tour-ui.js start(): the board shows, the bar is the tour's. */
export function tourStart(appId, { online } = {}) {
  const s = appSession(appId);
  const t = { steps: buildSteps(s), step: 0 };
  tours.set(appId, t);
  return paint(appId, t, { online, play: [clipSlot(t.steps[0].clip)] });
}

/** hooks.onTap: a tap on the step's own word advances; anything else is
 *  ignored (board.js returns early). Nothing is logged. */
export function tourTap(appId, { kind, id, online } = {}) {
  const s = appSession(appId);
  const t = tours.get(appId);
  if (!t) throw new Error("tourTap: no tour");
  const cur = t.steps[t.step];
  if (!["you", "want", "apple"].includes(cur.id) || kind !== "sense" || id !== SCRIPT[cur.id]) {
    return paint(appId, t, { online, play: [] });
  }
  const label = one(s.d,
    `SELECT l.text AS t FROM label l WHERE l.sense_id = ? AND l.kind = 'lemma'
     AND l.status = 'approved' AND l.locale = ?`, [id, s.locale])?.t ?? "";
  const item = { kind: "sense", id, text: label };
  s.sentence.push(item);
  PIP().txbar.noteBarEdit(s.barState);
  t.step++;
  // The word's own audio first, then the next instruction.
  return paint(appId, t, { online, play: [slotOf(s, item), clipSlot(t.steps[t.step].clip)] });
}

/** hooks.onTransform: only the step's own button; the bar becomes the
 *  scripted sentence (txbar.applyTransform), spoken from the shipped
 *  recording, then the next instruction. No Worker, no snapshot. */
export function tourTransform(appId, { mode, online } = {}) {
  const s = appSession(appId);
  const t = tours.get(appId);
  if (!t) throw new Error("tourTransform: no tour");
  const cur = t.steps[t.step];
  if (cur.id !== mode || (mode !== "fix" && mode !== "question")) {
    return paint(appId, t, { online, play: [] });
  }
  PIP().txbar.applyTransform(s.sentence, SCRIPT[mode], mode, s.barState);
  for (const it of s.sentence) {
    if (it.kind === "typed") it.art = artForWord(s, it.text);
  }
  t.step++;
  const said = mode === "fix" ? "you-want-an-apple" : "do-you-want-an-apple";
  return paint(appId, t, { online, play: [clipSlot(said), clipSlot(t.steps[t.step].clip)] });
}

/** tour-ui.js end(): the bar clears (`board.clearBar`), the live board
 *  paints again. The registry's `tourDone` is Swift's half. */
export function tourEnd(appId) {
  tours.delete(appId);
  // The web's real Clear button (#clear.click()): closes the logged
  // sentence 'cleared' if one is open, empties the bar.
  return { ...appClear(appId), active: false, settings: appSettings(appId) };
}

export const tourActive = (appId) => ({ active: tours.has(appId) });
