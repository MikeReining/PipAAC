/**
 * Live modeling and the Spotlight glow on the iPad board (phase 044 D5):
 * the web's attention layer (public/board/spotlight-layer.js, coach-ui.js)
 * over the web's own modules, unchanged - shared/spotlight.mjs owns the
 * session rows and the laws, shared/sync.mjs receives and sends the
 * sealed live messages. This file only holds what the browser holds in
 * closures: the few-second "modeled" lights, the supporter's counts and
 * tip, the 30 s expiry tick - and turns them into ONE render model
 * (`state`) that Swift draws without re-deriving anything.
 *
 * Live modeling is an attention event, not a board edit: nothing here
 * writes a board table. The only writes are the web's own session ops
 * (`endSession`, via the "End" chip) and the child's tap log.
 *
 * Exported as PIPCORE.spot. Events (host emit): "spot.changed" (re-read
 * `state`), "spot.speak" { speech } (the family turned on Speak).
 */
import {
  CONTROLS, endSession, glowsHere, needsRouteWalk, resumeSession, spotlight, tipFor,
} from "../../public/shared/spotlight.mjs";
import { syncSendLive, syncSendModel } from "../../public/shared/sync.mjs";
import { appDb, appGeom, appSession } from "./app.mjs";

const PIP = () => globalThis.PIPCORE;
const parse = (x) => (typeof x === "string" ? JSON.parse(x) : x);
const emit = (name, payload = {}) => globalThis.__pipHost?.emit(name, JSON.stringify(payload));

/** spotlight-layer.js MODEL_FADE_MS / the 700 ms local echo. */
export const MODEL_FADE_MS = 4000;
export const ECHO_MS = 700;
const TICK_MS = 30000; // board.js: the slow expiry tick

const L = {
  appId: null, db: null, role: null, name: null,
  timer: null,
  modelGlow: new Map(),   // "kind:id" -> fade timer
  modelSent: new Set(),   // local echo on a supporter's device
  counts: { s: null, c: {} }, // the child's presses this session (coach-ui)
  tip: null,              // the last modeled word's tip
};

const changed = () => emit("spot.changed");
const supporter = () => L.role === "partner";

/* ---------------- boot, restart, expiry (SP-2) ---------------- */

/** The sync loop's own door (syncStartDb): the live callbacks need the
 *  db and the role even when no screen has bound yet. */
export function attach(db, role) {
  L.db = db;
  if (role !== undefined) L.role = role ?? null;
}

/** An open person (Swift, after appOpen): the synced session row lights
 *  the layer again - unless its timer or midnight passed while away
 *  (board.js boot `resumeSession(db)`) - and the slow expiry tick starts. */
export function bind(appId, role, name) {
  L.appId = appId;
  L.db = appDb(appId);
  L.role = role ?? null;
  L.name = name ?? null;
  for (const t of L.modelGlow.values()) clearTimeout(t);
  L.modelGlow.clear();
  L.modelSent.clear();
  L.tip = null;
  clearInterval(L.timer);
  resumeSession(L.db);
  L.timer = setInterval(tick, TICK_MS);
  changed();
  return { ok: true };
}

/** Person switch / app close: no tick, no lights for the old person. */
export function unbind() {
  clearInterval(L.timer);
  L.timer = null;
  for (const t of L.modelGlow.values()) clearTimeout(t);
  L.modelGlow.clear();
  L.modelSent.clear();
  L.appId = L.db = null;
  return { ok: true };
}

/** board.js setInterval: ends the layer when the row's end has passed. */
export function tick() {
  if (!L.db) return;
  const was = !!spotlight();
  resumeSession(L.db);
  if (was !== !!spotlight()) changed();
}

/** Ops landed from another device (board.js onSyncApplied): a session
 *  started or ended elsewhere reaches this board. */
export function applied(db) {
  const d = db ?? L.db;
  if (!d) return;
  resumeSession(d);
  changed();
}

/** The chip's End (board.js #spot-chip click). */
export function end() {
  if (!L.db) return { ok: false };
  endSession(L.db);
  changed();
  return { ok: true };
}

/* ---------------- live messages (SY-5, SP-3, SP-5) ---------------- */

const profile = () =>
  L.db?.prepare("SELECT spot_dim, spot_pulse, model_speaks FROM learner_profile WHERE id = 'prf_local'")
    .all()[0] ?? {};

function clearModel(key) {
  const t = L.modelGlow.get(key);
  if (t === undefined) return;
  clearTimeout(t);
  L.modelGlow.delete(key);
  changed();
}

/** A live message from another device (sync.mjs onModel): the child's tap
 *  reaches a supporter's counts; a modeled word lights here. */
export function onLive(m) {
  if (m?.k === "tap") return onChildTap(m);
  if (m?.k !== "model" || typeof m.t !== "string") return;
  clearTimeout(L.modelGlow.get(m.t));
  L.modelGlow.set(m.t, setTimeout(() => { L.modelGlow.delete(m.t); changed(); }, MODEL_FADE_MS));
  const [kind, id] = m.t.split(":");
  // A modeled ✨ / ❓ only glows - a button has no word to say.
  if (profile().model_speaks === 1 && m.w && kind !== "control") speakModeled(kind, id, m.w);
  changed();
}

function speakModeled(kind, id, text) {
  try {
    const s = appSession(L.appId);
    const slot = PIP().voice.resolveSlot(s.d, { kind, id, text }, s.locale, s.voiceId);
    const speech = PIP().say.tapSpeech(s, slot);
    if (speech) emit("spot.speak", { speech });
  } catch (e) { console.error(`spot.speak: ${e}`); }
}

/** coach-ui.js onChildTap: the child pressed a word (ws, transient). */
function onChildTap(m) {
  const s = spotlight();
  if (!supporter() || !s?.session || typeof m.t !== "string") return;
  if (m.s !== s.startedAt) return; // a tap from another session
  if (L.counts.s !== s.startedAt) L.counts = { s: s.startedAt, c: {} };
  L.counts.c[m.t] = (L.counts.c[m.t] ?? 0) + 1;
  changed();
}

const sessionCounts = () => {
  const s = spotlight();
  return s?.session && L.counts.s === s.startedAt ? L.counts.c : {};
};
const countOf = (key) => (supporter() ? sessionCounts()[key] ?? 0 : 0);

/** The child pressed `key` ("kind:id", or "control:fix"/"control:question")
 *  on their own board (spotlight-layer.js childTap). Returns whether it was
 *  lit when pressed - the "with the glow" half of Progress - then ends its
 *  modeled light and, during a session, tells the supporter's devices.
 *  Never on a supporter's device: there a tap is a model. */
export function childTap(key) {
  const s = spotlight();
  const lit = (glowsHere(s, supporter()) && s.targets.has(key)) || L.modelGlow.has(key);
  if (s?.session && !supporter()) {
    syncSendLive({ k: "tap", t: key, s: s.startedAt }).catch(() => {});
  }
  clearModel(key);
  return lit;
}

/** Modeling is on exactly when a real session runs on a supporter's
 *  device - no separate switch (spotlight-layer.js modelingNow). */
const modelingNow = () => supporter() && !!spotlight()?.session;

function coachLabel(kind, id) {
  if (kind === "control") return CONTROLS[id]?.label ?? id;
  const s = appSession(L.appId);
  if (kind === "entity") {
    return s.d.prepare("SELECT spoken_name AS t FROM personal_entity WHERE id = ?").all(id)[0]?.t ?? id;
  }
  return s.d.prepare(
    `SELECT text AS t FROM label
     WHERE sense_id = ? AND kind = 'lemma' AND status = 'approved' AND locale = ?`,
  ).all(id, s.locale)[0]?.t ?? id;
}

/** coach-ui.js onModeled: the tip replaces the bar line. */
function onModeled(kind, id) {
  const s = appSession(L.appId);
  L.tip = tipFor(L.db, s.catalog, kind, id) ?? `Say “${coachLabel(kind, id)}” as you tap it, then wait.`;
}

/** board.js tap() modeling branch: the supporter's tap lights the word on
 *  the child's board - never speaks or appends here. */
export function modelTap(kind, id, text) {
  if (!id || !modelingNow()) return false;
  const key = `${kind}:${id}`;
  syncSendModel(key, text).catch(() => {});
  onModeled(kind, id);
  echo(key);
  return true;
}

/** spotlight-layer.js controlPress for ✨ / ❓ while modeling. */
export function controlPress(name) {
  if (!CONTROLS[name] || !modelingNow()) return false;
  const key = `control:${name}`;
  syncSendLive({ k: "model", t: key, w: CONTROLS[name].label }).catch(() => {});
  onModeled("control", name);
  echo(key);
  return true;
}

function echo(key) {
  L.modelSent.add(key);
  changed();
  setTimeout(() => { L.modelSent.delete(key); changed(); }, ECHO_MS);
}

/* ---------------- the render model ---------------- */

/** Everything the board draws for the layer, for the cells now on screen.
 *  `keys`: the "kind:id" of every word cell visible (board or group page).
 *  marks[key] = { glow, pulse, modeled, dimmed, count } - the web's
 *  layerMark, class for class (a modeled word is never dimmed: .modeled
 *  forces opacity 1). */
export function state(appId, keysJSON = "[]") {
  const keys = parse(keysJSON);
  const s = spotlight();
  const steady = glowsHere(s, supporter());
  const p = profile();
  const pulse = (p.spot_pulse ?? 0) === 1;
  const marks = {};
  for (const key of keys) {
    const modeled = L.modelGlow.has(key);
    const target = steady && s.targets.has(key);
    marks[key] = {
      glow: target || modeled || L.modelSent.has(key),
      pulse: target && pulse,
      modeled,
      dimmed: steady && !target && !modeled,
      count: countOf(key),
    };
  }
  let walk = false;
  if (steady || L.modelGlow.size) {
    const ss = appSession(appId);
    const geom = appGeom(ss);
    const onBoard = new Set(PIP().coremove.coreCells(ss.d, geom.name, ss.locale).map((c) => c.sense_id));
    walk = (steady && needsRouteWalk(s.targets, onBoard))
      || (L.modelGlow.size > 0 && needsRouteWalk(new Set(L.modelGlow.keys()), onBoard));
  }
  const controls = {};
  for (const name of Object.keys(CONTROLS)) {
    const key = `control:${name}`;
    const modeled = L.modelGlow.has(key);
    controls[name] = { glow: (steady && s.targets.has(key)) || modeled, modeled, count: countOf(key) };
  }
  const modeling = modelingNow();
  const who = L.name?.trim() || null;
  const total = Object.values(sessionCounts()).reduce((a, b) => a + b, 0);
  return {
    on: !!s, steady, name: s?.name ?? null,
    chip: steady && s ? `🔦 ${s.name} · End` : null,
    dim: (p.spot_dim ?? 45) / 100,
    marks, groups: walk, controls, modeling,
    line: modeling
      ? (L.tip ?? `Your taps light up on ${who ? `${who}'s` : "their"} board. Say each word as you tap it.`)
      : null,
    count: modeling && total ? `${who ?? "They"} pressed ${total} time${total === 1 ? "" : "s"}` : "",
  };
}
