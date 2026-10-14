/**
 * Help facade (phase 044 E5; web: board/help-ui.js, phase 042). Exported
 * as PIPCORE.help. The answers are the web's, from help.en.json (built
 * from src/help/answers.en.json + the web Settings rows); search is the
 * shared two-pass rule (shared/help_search.mjs): words on the device, then
 * the Worker's meaning hits merged in. Swift owns the files, the network
 * and the pixels; every list and sentence here is rendered, not re-derived.
 *
 * A "Show me" link and a Settings hit name a native Settings row by a
 * stable route id (ROUTES). A web target with no native row has no route
 * and no button, the way the web hides a Show me whose row is not shown.
 */
import { localHits, mergeHits } from "../../public/shared/help_search.mjs";

/** web `sec/at` -> native Settings row id (SettingsView `.id(route)`). */
export const ROUTES = {
  "talking/voice-row": "voice",
  "talking/speed-seg": "speed",
  "lang/grammar-help": "grammar",
  "talking/bar-row": "bar",
  "board/kb-mode": "keyboard",
  "board/cells-seg": "cells",
  "backup/pin-change": "pin",
  "backup/share-research": "research",
  "overview/edit-groups": "editBoard",
  "team/usr-add": "people",
  "team/dev-add": "team",
  "team/null": "team",
};
const routeOf = (go) => (go ? ROUTES[`${go.sec}/${go.at ?? null}`] ?? null : null);

let H = null;

export function load(json) {
  H = JSON.parse(json);
  return { version: H.version, answers: H.answers.length };
}

const answerModel = (a) => ({
  id: a.id,
  q: a.q,
  paras: a.a.split("\n\n"),
  route: routeOf(a.go),
});

/** help-ui.js `suggested`: what this adult most likely needs now. */
function suggested({ online, partner, weekOver }) {
  if (!online) return ["offline", "word-by-word"];
  if (partner) return ["modeling", "touch-board", "school-home"];
  if (weekOver) return ["week-ends", "word-by-word", "not-using"];
  return ["first-week", "modeling", "not-using"];
}

/** The Help page: Start here + topics. */
export function home(ctx = {}) {
  const byId = (id) => H.answers.find((a) => a.id === id);
  return {
    start: suggested({ online: true, ...ctx }).map(byId).filter(Boolean).map(answerModel),
    topics: H.topics.map((t) => {
      const answers = H.answers.filter((a) => a.topic === t.id).map(answerModel);
      return { id: t.id, title: t.title, intro: t.intro ?? null, count: answers.length, answers };
    }),
  };
}

/**
 * One search, two passes. `meaning` is the Worker's body
 * ({version, hits}) or null while only the device pass is in. A Worker on
 * another help version names other entries, so its hits are ignored.
 * Settings hits show only when the row exists natively. First answer opens.
 */
export function search(q, meaning = null) {
  const m = meaning && meaning.version === H.version ? meaning.hits ?? [] : [];
  const merged = mergeHits(m, localHits(H, q));
  const hits = [];
  let firstAnswer = true;
  for (const { id } of merged) {
    if (hits.length >= 7) break;
    if (id.startsWith("a:")) {
      const a = H.answers.find((x) => x.id === id.slice(2));
      if (!a) continue;
      hits.push({ kind: "answer", open: firstAnswer, answer: answerModel(a) });
      firstAnswer = false;
    } else {
      const s = H.settings[Number(id.slice(2))];
      const route = s && ROUTES[`${s.sec}/${s.at ?? null}`];
      if (!route) continue;
      hits.push({
        kind: "setting",
        label: s.label,
        where: s.label === s.title ? "Open page" : `Settings › ${s.title}`,
        route,
      });
    }
  }
  const t = q.trim();
  return {
    hits,
    none: hits.length === 0 && t.length > 0,
    noneText: `No answer for “${t}” yet. `,
    prefill: `About “${t}”: `,
  };
}

/** The Worker path for search by meaning; null for a query too short. */
export function meaningPath(q) {
  const t = q.trim();
  return t.length < 2 ? null : `/api/v1/help/search?q=${encodeURIComponent(t)}`;
}

/** Write to us: the web's copy. */
export function writeCopy(childName) {
  const who = childName?.trim() ? `${childName.trim()}'s` : "your child's";
  return {
    title: "Write to us",
    hint: "A question, something that isn't working, or an idea. It goes straight to the Pip team.",
    messagePlaceholder: "What's on your mind?",
    emailPlaceholder: "Your email, so we can write back",
    details: ` Include app details: version, device, and whether Pip Lifetime is on. Never ${who} words.`,
  };
}

/** The POST body, or null for an empty message (help-ui.js send.onclick). */
export function writeItem({ message, email, details }) {
  const text = (message ?? "").trim();
  if (!text) return null;
  return { message: text, email: (email ?? "").trim(), details: details ?? null };
}

/** The status line after a send attempt: sent | rejected | queued. */
export function writeStatus(kind, hasEmail) {
  if (kind === "sent") {
    return hasEmail ? "Sent. Thank you."
      : "Sent. Thank you. Add your email next time if you'd like a reply.";
  }
  if (kind === "rejected") return "That didn't send. Check the message and try again.";
  return "Saved. It will send when this device is back online.";
}

/** The offline outbox keeps the newest ten. */
export function outboxPush(box, item) {
  return [...(box ?? []), item].slice(-10);
}
