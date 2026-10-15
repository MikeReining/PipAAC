/**
 * The iOS Settings-structure facade (phase 044 slice E4; inventory ST-4,
 * ST-5): what board/settings-ui.js owns — the section list, the one-line
 * state under each section, the Overview checklist and "How it's set up"
 * glance — as render models SwiftUI draws. Exported from core_entry.mjs
 * as PIPCORE.settingsUi. (Search over Settings and Help is E5's
 * app_help.mjs; one box, one result list.)
 *
 * Reads only, except `nameSet`. Every setting still writes through
 * appSetSetting → groups.setSetting (the synced path).
 *
 * Section names, order and intros are index.html's `.set-sec` blocks,
 * verbatim, for the sections the iPad has pages for. The web's Spotlight,
 * Progress and Pip Lifetime pages have no native counterpart yet.
 */
import { appGeom, appSession } from "./app.mjs";
import { resolveProfile } from "../../public/shared/profile.mjs";

const PIP = () => globalThis.PIPCORE;
const one = (d, sql, p = []) => d.prepare(sql).all(...p)[0];

/** Who the chrome speaks of (settings-ui.js personWords). */
const personOf = (name) => {
  const n = (name ?? "").trim();
  return n ? { inline: n, unnamed: false } : { inline: "this person", unnamed: true };
};

/** index.html `.set-sec`: id, title, and intro (`{p}` = the person). */
const SECTIONS = [
  { id: "overview", title: "Overview", intro: null },
  { id: "words", title: "Words", intro: "What {p} can say, and where it lives." },
  { id: "spotlight", title: "Spotlight", intro: "Light up the words you're teaching. Everything else dims, but still speaks." },
  { id: "board", title: "Board", intro: "How the board is laid out. These are usually set once." },
  { id: "talking", title: "Talking", intro: "How sentences sound and behave." },
  { id: "lang", title: "Language help", intro: "How much Pip helps while {p} builds a sentence." },
  { id: "team", title: "Team & devices", intro: "Everyone who helps {p}, and every device the board is on." },
  { id: "backup", title: "Backup & privacy", intro: "Keep {p}'s words safe, and choose what leaves this device." },
  // data-group="you": about the adult, not the person.
  { id: "account", title: "Your account", intro: "About you, the adult. {P} never needs an account.", group: "you" },
  { id: "help", title: "Help", intro: "Ask in your own words, or browse the common questions.", group: "you" },
];


/** settings-ui.js syncLifetimeSpot: the Pip Lifetime page is the list's
 *  first item ("Get Pip Lifetime") while unlicensed; once bought it is a
 *  quiet "Pip Lifetime ✓" at the end of the person's group, before Your
 *  account. */
function orderSections(licensed) {
  const life = { id: "lifetime", title: licensed ? "Pip Lifetime ✓" : "Get Pip Lifetime", intro: null };
  if (!licensed) return [life, ...SECTIONS];
  const at = SECTIONS.findIndex((x) => x.group === "you");
  return [...SECTIONS.slice(0, at), life, ...SECTIONS.slice(at)];
}

/** settings-ui.js SUMMARIES.spotlight: the running session, else the
 *  saved-list count. */
function spotlightSummary(d) {
  const session = PIP().spotlight.spotSession(d);
  if (session) return `On · ${session.name} · ${PIP().spotlight.untilText(session)}`;
  const lists = one(d, "SELECT count(*) AS n FROM spotlight_list")?.n ?? 0;
  return lists ? `Off · ${lists} list${lists === 1 ? "" : "s"}` : "Off";
}

/** board.js facts().invested, verbatim: something of theirs is on the
 *  board (a word they made, or any of these customizing ops). */
const INVESTED_OPS = ["create_entity", "set_entity_photo", "create_group", "add_to_groups", "place_item",
  "move_item", "swap_items", "set_image_override", "set_override", "set_mask", "rename_entity",
  "set_family_items", "spot_list_save", "set_group_hidden", "move_group", "swap_groups", "reorder_groups",
  "delete_group"];
const invested = (d) =>
  (one(d, "SELECT count(*) AS n FROM personal_entity")?.n ?? 0) > 0
  || !!one(d, `SELECT 1 AS x FROM sync_op WHERE kind IN (${INVESTED_OPS.map(() => "?").join(",")}) LIMIT 1`, INVESTED_OPS);

/** settings-ui.js renderProtect (SY-11): after the first customization,
 *  one line naming what is still missing - a PIN, the recovery card.
 *  Owners only; it leads to Backup & privacy. Copy verbatim. */
export function protectLine(d, who, { pinOn, cardMade, team }) {
  const pinOff = !pinOn, noCard = !cardMade;
  if (team || !invested(d) || !(pinOff || noCard)) return { visible: false, title: "", summary: "" };
  return {
    visible: true,
    title: `Protect ${who.unnamed ? "this person's" : `${who.inline}'s`} words`,
    summary: pinOff && noCard ? "Add a Settings PIN and make the recovery card"
      : pinOff ? "Add a Settings PIN" : "Make the recovery card",
  };
}

/** settings-ui.js SUMMARIES / checklist / renderOverview, as data.
 *  `name` is the open person's name (the people list owns it), `pinOn`
 *  the device PIN (Swift owns it). */
export function hub(appId, { name = "", pinOn = false, licensed = false, cardMade = false, team = false } = {}) {
  const s = appSession(appId);
  const d = s.d;
  const p = one(d, "SELECT * FROM learner_profile WHERE id = 'prf_local'") ?? {};
  const who = personOf(name);
  const onOff = (v) => (v ? "on" : "off");

  const cells = appGeom(s).cells;
  const { voiceId } = resolveProfile(d);
  const summary = {
    board: [`${cells} buttons`,
      p.presentation_mode === "label" ? "words only" : "",
      (p.keyboard_mode ?? "pip") === "device" ? "Device keyboard" : "Pip keyboard",
    ].filter(Boolean).join(" · "),
    talking: `${PIP().voices.voiceName(d, voiceId)} · ${PIP().bar.barLabel(d)} · feeling faces ${onOff(p.expressive_voice !== 0)}`,
    lang: `Grammar help ${onOff(p.grammar_help !== 0)} · outlines ${onOff(!!p.highlight_next)}`,
    // settings-ui.js SUMMARIES.spotlight.
    spotlight: spotlightSummary(d),
    // The recovery card is not on the iPad yet; the PIN is the one line
    // of this page that is.
    backup: pinOn ? "Settings PIN on" : "No Settings PIN yet",
  };

  const entities = one(d,
    "SELECT count(*) AS n FROM personal_entity WHERE status = 'active'")?.n ?? 0;
  const items = [
    { id: "name", done: !!name.trim(), label: "Name who uses Pip",
      hint: "Name and photo, top of this page" },
    { id: "people", done: entities > 0, label: "Add their people and places",
      hint: "Names and photos Pip can suggest" },
  ];
  const left = items.filter((i) => !i.done).length;

  return {
    protect: protectLine(d, who, { pinOn, cardMade, team }),
    person: who.inline,
    unnamed: who.unnamed,
    sections: orderSections(licensed).map((x) => ({
      id: x.id, title: x.title,
      group: x.group ?? "person",
      intro: x.intro
        ? x.intro.replaceAll("{p}", who.inline).replaceAll("{P}", who.unnamed ? "This person" : who.inline)
        : null,
      summary: summary[x.id] ?? "",
    })),
    checklist: {
      visible: left > 0,
      title: `Finish setting up · ${items.length - left} of ${items.length} done`,
      items,
    },
    glance: SECTIONS.filter((x) => summary[x.id]).map((x) => ({
      sec: x.id, title: x.title, summary: summary[x.id],
    })),
  };
}

/** person-card.js #person-name change: the name is the synced
 *  person_name (saveUser → nameToProfile); the people list (Swift) keeps
 *  its copy. A blank name is refused, as on the web. */
export function nameSet(appId, { name }) {
  const s = appSession(appId);
  const clean = String(name ?? "").trim();
  if (clean) PIP().personName.nameToProfile(s.d, { name: clean });
  return { name: PIP().personName.profileName(s.d) };
}
