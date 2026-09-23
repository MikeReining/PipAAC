/**
 * 017 step 11 — the frozen answer key. Generates 100 reproducible
 * synthetic users over 30 days into out/prediction/synth/ (gitignored —
 * derived). Nothing here imports a predictor module: the answer key
 * must stay independent of the ranker (enforced by synth.test.mjs).
 *
 *   node scripts/prediction/synth/gen_users.mjs              write users
 *   node scripts/prediction/synth/gen_users.mjs --check      verify vs manifest
 *   node scripts/prediction/synth/gen_users.mjs --manifest   rewrite manifest
 *
 * The manifest (data/prediction/synth/manifest.json, committed) pins
 * seed, generator version, bank hashes, and a SHA-256 per user file.
 * A changed bank or generator changes the hashes — --check fails until
 * someone deliberately regenerates and commits a new manifest.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  drawPersona, ENTITY_CATEGORIES, GENERATOR_VERSION, mulberry32,
  NAME_POOL, OCCASION_CLOCK, OCCASIONS, SCHOOL_ONLY, SEED, USER_COUNT,
} from "./personas.mjs";

const repoRoot = join(import.meta.dirname, "../../..");
const BANKS_DIR = join(repoRoot, "data/prediction/synth/banks");
const MANIFEST = join(repoRoot, "data/prediction/synth/manifest.json");
const OUT_DIR = join(repoRoot, "out/prediction/synth");
const DAYS = 30;

/* ---------- inputs ---------- */

const lexicon = JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8"));
const NONCORE = lexicon.entries.filter((e) => e.tier !== 1);
const BY_CATEGORY = new Map();
for (const e of NONCORE) {
  const c = e.category ?? "misc";
  if (!BY_CATEGORY.has(c)) BY_CATEGORY.set(c, []);
  BY_CATEGORY.get(c).push(e.spokenText.toLowerCase());
}
const ALL_NONCORE = NONCORE.map((e) => e.spokenText.toLowerCase());

export function loadBanks(dir = BANKS_DIR) {
  return readdirSync(dir).filter((f) => f.endsWith(".json"))
    .map((f) => {
      const raw = readFileSync(join(dir, f), "utf8");
      return { file: f, raw, ...JSON.parse(raw) };
    });
}

/* ---------- helpers ---------- */

const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

/** Lognormal pause: median ≈ mean, sigma from the persona. */
const deciding = (r, mean, sd) =>
  Math.round(Math.exp(Math.log(mean) + sd * gauss(r)));

function gauss(r) {
  let u = 0, v = 0;
  while (u === 0) u = r();
  while (v === 0) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const hhmm = (mins) =>
  `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(Math.round(mins % 60)).padStart(2, "0")}`;

const toMin = (s) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};

/* ---------- user generation ---------- */

/** Zipf-weighted pick index into `items` (rank order = array order). */
function zipfPick(r, items, skew) {
  let total = 0;
  const w = items.map((_, i) => (total += 1 / Math.pow(i + 1, skew)));
  let x = r() * total;
  for (let i = 0; i < w.length; i++) { x -= 1 / Math.pow(i + 1, skew); if (x <= 0) return i; }
  return items.length - 1;
}

/** The persona's active vocabulary: a category-mixed sample of non-core
 *  words in preference order (front = most preferred). `introducedDay`
 *  staggers words in — a small active set on day 1 plus the persona's
 *  weekly novelty. */
function buildVocab(r, p) {
  const vocab = [];
  const perCat = Math.ceil(p.vocabSize / BY_CATEGORY.size);
  for (const [cat, words] of BY_CATEGORY) {
    const shuffled = [...words].sort(() => r() - 0.5);
    vocab.push(...shuffled.slice(0, perCat).map((w) => ({ w, cat })));
  }
  vocab.sort(() => r() - 0.5);
  const active = vocab.slice(0, p.vocabSize);
  const start = Math.max(10, Math.round(active.length * 0.6));
  const introduced = new Map();
  active.forEach((e, i) => {
    if (i < start) introduced.set(e.w, 1);
  });
  // Weekly novelty spreads the rest over weeks 1–4.
  const rest = active.slice(start).map((e) => e.w);
  const perWeek = Math.max(1, p.noveltyPerWeek);
  rest.forEach((w, i) => {
    introduced.set(w, Math.min(DAYS, 1 + Math.floor(i / perWeek) * 7 + Math.floor(r() * 7)));
  });
  return { entries: active, introduced, start };
}

function buildEntities(r, p) {
  const names = [...NAME_POOL].sort(() => r() - 0.5).slice(0, p.entityCount);
  return names.map((name) => ({ name, category: pick(r, ENTITY_CATEGORIES) }));
}

/** Fill one bank script's {slot} placeholders. Slot words come from the
 *  persona's introduced vocabulary when it covers the pool, else the
 *  pool itself (a word can be said before it's "preferred"). Returns
 *  the words plus the slot fills for echo bookkeeping. */
function fillScript(r, p, vocab, script, day, slotState) {
  const words = [];
  const fills = [];
  for (const tok of script) {
    const m = /^\{(.+)\}$/.exec(tok);
    if (!m) { words.push(tok); continue; }
    const pool = slotState[m[1]] ?? [];
    const known = pool.filter((w) => vocab.introduced.get(w) <= day);
    const src = known.length ? known : pool;
    const w = src[zipfPick(r, src, p.zipf)] ?? tok;
    words.push(w);
    fills.push(w);
  }
  return { words, fills };
}

/** One user's 30-day answer key. */
export function generateUser(id, banks) {
  const p = drawPersona(id);
  const r = mulberry32((SEED ^ (id * 40503)) >>> 0);
  const vocab = buildVocab(r, p);
  const entities = buildEntities(r, p);
  const entNames = new Set(entities.map((e) => e.name.toLowerCase()));
  // Entities are available from day 1 — the novelty ramp is for words,
  // not for the people and toys a user already knows.
  for (const e of entities) vocab.introduced.set(e.name.toLowerCase(), 1);

  // Slot pools resolve once: category pools plus the bank's own lists.
  const slotState = {};
  for (const b of banks) {
    for (const [name, def] of Object.entries(b.slots ?? {})) {
      if (slotState[name]) continue;
      slotState[name] = def.words ?? BY_CATEGORY.get(def.category) ?? [];
    }
  }
  // Entities join the person pool — a user asks for people by name.
  slotState.person = [...new Set([...(slotState.person ?? []), ...entities.map((e) => e.name.toLowerCase())])];

  const saidBefore = []; // for verbatim repetition
  const days = [];
  for (let day = 1; day <= DAYS; day++) {
    const weekday = (day - 1) % 7; // day 1 = Monday (matches the sim anchor)
    let kind = weekday >= 5 ? "weekend" : "school";
    const onVacation = p.vacationDays && day >= p.vacationDays[0] && day <= p.vacationDays[1];
    if (onVacation) kind = "weekend";
    const sick = !onVacation && r() < 0.06;
    const afterChange = day >= p.changeDay;
    const messages = [];

    for (const oc of OCCASIONS) {
      if (SCHOOL_ONLY.has(oc) && kind !== "school") continue;
      if (oc === "sick" && !sick) continue;
      const [base, maxMsgs] = OCCASION_CLOCK[oc];
      // Schedule change: a one-time shift — a new school time, holiday,
      // or the household moving the block.
      let shift = kind === "weekend" ? p.weekendShiftMin : 0;
      if (p.nightShiftH) shift += p.nightShiftH * 60;
      if (afterChange && (oc === "leaving" || oc === "school")) shift += 40;
      const jitter = () => Math.round((r() - 0.5) * 2 * p.jitterMin);
      let at = toMin(base) + shift + jitter();

      const count = Math.max(1, Math.round(maxMsgs * p.categoryBias[oc] * p.routine));
      for (let n = 0; n < count; n++) {
        const bank = r() < p.llmShare ? "llm" : "template";
        const bankDefs = banks.filter((b) => b.kind === bank);
        const b = bankDefs.length ? pick(r, bankDefs) : banks[0];
        const scripts = b.occasions[oc] ?? b.occasions.free;
        let script = pick(r, scripts);

        // Repetition: this user says a favorite again, verbatim.
        if (saidBefore.length && r() < p.repetition) {
          const prev = pick(r, saidBefore);
          messages.push({ ...prev, at: hhmm(at), repeated: true });
          at += 2 + Math.floor(r() * 6);
          continue;
        }

        const isAnswer = r() < p.answerRate;
        let partner = null;
        if (isAnswer) {
          const pscript = pick(r, b.partner ?? []);
          partner = fillScript(r, p, vocab, pscript, day, slotState).words;
        }
        const { words, fills } = fillScript(r, p, vocab, script, day, slotState);

        // Partner echo: the answer reuses a partner content word.
        if (partner && r() < p.echoRate) {
          const echoWord = fills[0] ?? partner.find((w) => w.length > 2);
          if (echoWord && !words.includes(echoWord)) {
            words[Math.max(0, words.length - 1)] = echoWord;
          }
        }

        // Typed words (~3% of intended words — the trigger is per
        // message, so the rate rides the ~3-word average length).
        const typed = [];
        if (r() < 0.09) {
          const off = ALL_NONCORE.filter(
            (w) => !vocab.introduced.has(w) && !entNames.has(w));
          const tw = pick(r, off);
          words.push(tw);
          typed.push(tw);
        }

        // Repair: a wrong pick, then backspace, then the right one.
        let repair = null;
        if (words.length > 1 && r() < p.repairRate) {
          const pos = Math.floor(r() * words.length);
          const wrong = pick(r, ALL_NONCORE);
          repair = { position: pos, wrong };
        }

        const msg = {
          at: hhmm(at), words, bank,
          decidingMs: Math.max(300, deciding(r, p.decidingMsMean, p.decidingMsSd)),
        };
        if (partner) msg.partner = partner;
        if (typed.length) msg.typed = typed;
        if (repair) msg.repair = repair;
        messages.push(msg);
        saidBefore.push({ ...msg, at: undefined });
        at += 2 + Math.floor(r() * 6);
      }
    }
    messages.sort((a, b) => a.at.localeCompare(b.at));
    days.push({ day, kind, messages });
  }

  // A new sibling joins mid-month for that eval pattern — the entity is
  // announced in the file, and the person pool gains it from that day.
  const events = [];
  if (p.siblingDay) {
    const baby = { name: pick(r, ["Baby Rose", "Baby Sam", "Baby June"]), category: "People, Family & Roles" };
    entities.push(baby);
    events.push({ day: p.siblingDay, kind: "new_entity", entity: baby });
  }

  return {
    id: `u${String(id).padStart(3, "0")}`,
    generator: GENERATOR_VERSION, seed: SEED,
    persona: p, entities, events, days,
  };
}

/* ---------- manifest ---------- */

export function manifestFor(banks, userJsons) {
  return {
    seed: SEED, generatorVersion: GENERATOR_VERSION,
    banks: Object.fromEntries(banks.map((b) => [b.file, sha256(b.raw)])),
    users: Object.fromEntries(
      Object.entries(userJsons).map(([k, v]) => [k, sha256(v)])),
  };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const args = process.argv.slice(2);
  const banks = loadBanks();
  const userJsons = {};
  for (let id = 1; id <= USER_COUNT; id++) {
    userJsons[`u${String(id).padStart(3, "0")}`] =
      JSON.stringify(generateUser(id, banks), null, 1);
  }

  if (args.includes("--check")) {
    const want = JSON.parse(readFileSync(MANIFEST, "utf8"));
    const got = manifestFor(banks, userJsons);
    const bad = [];
    if (want.seed !== got.seed || want.generatorVersion !== got.generatorVersion) bad.push("seed/version");
    for (const [k, h] of Object.entries(got.banks)) {
      if (want.banks[k] !== h) bad.push(`bank ${k}`);
    }
    for (const [k, h] of Object.entries(got.users)) {
      if (want.users[k] !== h) bad.push(`user ${k}`);
    }
    if (bad.length) {
      console.error(`answer key drifted: ${bad.slice(0, 5).join(", ")}${bad.length > 5 ? "…" : ""}`);
      process.exit(1);
    }
    console.log(`manifest OK — ${Object.keys(got.users).length} users, ${banks.length} banks`);
    process.exit(0);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  for (const [uid, json] of Object.entries(userJsons)) {
    writeFileSync(join(OUT_DIR, `${uid}.json`), json + "\n");
  }
  if (args.includes("--manifest") || !existsSync(MANIFEST)) {
    mkdirSync(join(repoRoot, "data/prediction/synth"), { recursive: true });
    writeFileSync(MANIFEST, JSON.stringify(manifestFor(banks, userJsons), null, 1) + "\n");
    console.log(`wrote manifest (${Object.keys(userJsons).length} users)`);
  }

  // Persona spread summary — a founder sees the users really differ.
  const ps = [...Array(USER_COUNT)].map((_, i) => drawPersona(i + 1));
  const stat = (k) => {
    const v = ps.map((p) => p[k]).sort((a, b) => a - b);
    return `${k}: min ${v[0].toFixed?.(2) ?? v[0]} med ${v[50].toFixed?.(2) ?? v[50]} max ${v[99].toFixed?.(2) ?? v[99]}`;
  };
  console.log(`wrote ${USER_COUNT} users → ${OUT_DIR}`);
  for (const k of ["routine", "vocabSize", "zipf", "repetition", "noveltyPerWeek", "jitterMin", "weekendShiftMin", "entityCount", "echoRate", "decidingMsMean", "llmShare"]) {
    console.log("  " + stat(k));
  }
  const pats = {};
  for (const p of ps) pats[p.pattern] = (pats[p.pattern] ?? 0) + 1;
  console.log("  patterns:", JSON.stringify(pats));
}
