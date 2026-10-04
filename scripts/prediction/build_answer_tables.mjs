#!/usr/bin/env node
/**
 * 041 B4 — ship answers, not the corpus.
 *
 *   node scripts/prediction/build_answer_tables.mjs           # write
 *   node scripts/prediction/build_answer_tables.mjs --check   # drift gate
 *
 * Reads the raw evidence tables (data/prediction/*.en.json — build
 * inputs, never shipped) and emits the small answer tables the board
 * reads at runtime:
 *
 *   public/form_answers.en.json    grammar: (ending, word, next, worn)
 *     → the form to show, kept only where it differs from what the
 *     shorter ending already gives. Runtime is "longest matching
 *     ending wins" — pickFromAns in public/shared/forms.mjs.
 *   public/suggest_answers.en.json suggestions: phrase ending → the
 *     ordered sense ids passing the 5% share rule (≤20), no counts.
 *
 * The emission replays pickForm's own level logic (own rows, pooled
 * verb/plural rows with the 2:1 overturn, tie vetoes, anchored twins,
 * nextVerb walk, possNext/aAn/EOS fast paths). Sense ids ship as their
 * numeric slot ("sns_0270" -> 270) and forms as index codes into f[] —
 * the runtime expands both. Parity is proven in
 * src/board/answer_tables.test.mjs — every context the corpus holds
 * must give identical answers old vs new.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { repoRoot } from "../catalog/paths.mjs";

const FORM_SRC = join(repoRoot, "data/prediction/form_table.en.json");
const PHRASE_SRC = join(repoRoot, "data/prediction/phrase_table.en.json");
const FORM_OUT = join(repoRoot, "public/form_answers.en.json");
const SUGG_OUT = join(repoRoot, "public/suggest_answers.en.json");
const MIN_SHARE = 0.05;   // funnel.mjs KIDS_MIN_SHARE
const SUGG_CAP = 20;

const check = process.argv.includes("--check");
const nid = (s) => +s.slice(4);          // "sns_0270" -> 270
const sid = (n) => `sns_${String(n).padStart(4, "0")}`;

/* ---------- the shared row rules (verbatim from forms.mjs) ---------- */
const topForm = (counts) => {
  const s = Object.entries(counts ?? {}).sort((a, b) => b[1] - a[1]);
  return s[0] && !(s[1] && s[1][1] === s[0][1]) ? s[0][0] : null;
};
const tied = (counts) =>
  counts && Object.keys(counts).length > 1 && !topForm(counts);

const ft = JSON.parse(readFileSync(FORM_SRC, "utf8"));

const isVerb = new Set(ft.verbSenses);
const isPl = new Set(ft.plSenses);
const isNoun = new Set(ft.nounSenses);
const quant = new Set(ft.quantSenses);

const poolFor = (s) => isVerb.has(s) ? ft.verbFree : isPl.has(s) ? ft.plFree : null;
const poolRow = (K, s) =>
  !K || (isPl.has(s) && !K.split(" ").some((w) => quant.has(w))) ? null
    : poolFor(s)?.[K] ?? null;

const jointPick = (own, pooled) => {
  const ownPick = topForm(own), pooledPick = topForm(pooled);
  let pick = ownPick ?? pooledPick;
  if (ownPick && pooledPick && ownPick !== pooledPick
      && pooled[pooledPick] >= 2 * (pooled[ownPick] ?? 0)) pick = pooledPick;
  return pick;
};

/* Split "K|rest" — contexts carry one segment ("E|sid"), nextVerb two
 * ("E|sid|next"). Endings never hold pipes. */
const splitKey = (k, segs) => {
  let i = k.length;
  for (let n = 0; n < segs; n++) {
    i = k.lastIndexOf("|", i - 1);
    if (i < 0) return ["\0", ""];   // malformed key — filtered downstream
  }
  return [k.slice(0, i), k.slice(i + 1)];
};

/* Only sense-id endings are runtime-reachable — strip/context ids are
 * always sns_ tokens, so "a |", "<s> |" and double-space corpus keys
 * can never be looked up and are dropped here. */
const okEnd = (E) => /^sns_\d{4}( sns_\d{4})*$/.test(E);

/* Collect own rows per level: E -> { plain: Map(rest->row), anch: Map }.
 * Positions: "<s>" (empty ctx), "<s> "+E (anchored twin), plain E. */
function indexLevels(table, segs) {
  const levels = new Map();
  for (const k of Object.keys(table)) {
    const [K, rest] = splitKey(k, segs);
    let E, pos;
    if (K === "<s>") { E = ""; pos = "plain"; }
    else if (K.startsWith("<s> ")) { E = K.slice(4); pos = "anch"; }
    else { E = K; pos = "plain"; }
    if (E === "" ? pos !== "plain" : !okEnd(E)) continue;
    let lvl = levels.get(E);
    if (!lvl) levels.set(E, lvl = { plain: new Map(), anch: new Map() });
    lvl[pos].set(rest, table[k]);
  }
  return levels;
}
const endLen = (E) => (E === "" ? 0 : E.split(" ").length);

/* ---------- emission state ---------- */
const emittedC = new Map();     // "nidK|nid" -> featIndex | null (veto)
const emittedNv = new Map();    // "nidK|nid|nid" -> featIndex | null
const emittedPoolV = {}, emittedPoolP = {};   // "nidK" -> featIndex
const NO_POOL = {};
const poolEmitted = (s) => isVerb.has(s) ? emittedPoolV : isPl.has(s) ? emittedPoolP : NO_POOL;

/* The runtime answer one position below, for THIS sid — emitted own
 * rows first, emitted pool picks where no row landed, proper suffixes
 * longest-first. Emission runs shortest-to-longest so every read hits
 * finalized positions. */
function effBelow(E, s) {
  if (!E) return "BASE";
  const words = E.split(" ");
  for (let i = 1; i < words.length; i++) {
    const S = words.slice(i).join(" ");
    const v = emittedC.get(`${S}|${s}`);
    if (v === null) continue;
    if (v !== undefined) return v;
    const p = poolEmitted(s)[S];
    if (p !== undefined) return p;
  }
  return "BASE";
}
/* Same-position pool picks still come from the raw row — the emitted
 *  map is what the runtime sees; a row's own emission uses the raw pick
 *  to decide whether it must exist at all. */

/* ---------- contexts -> c ---------- */
const cLevels = indexLevels(ft.contexts, 1);
const endings = [...cLevels.keys()].sort((a, b) => endLen(a) - endLen(b));

for (const E of endings) {
  const lvl = cLevels.get(E);
  const sids = new Set([...lvl.plain.keys(), ...lvl.anch.keys()]);
  const plainKey = E === "" ? "<s>" : E;
  const anchKey = E === "" ? null : `<s> ${E}`;
  // Own rows first — they decide the joint pick per (position, sid).
  for (const s of sids) {
    const plainRow = lvl.plain.get(s);
    const anchRow = lvl.anch.get(s);
    const pk = `${plainKey}|${s}`;
    if (tied(plainRow)) {
      // The whole level is vetoed — the marker is only needed when
      // something would otherwise answer (a pool row or anchored own).
      if (poolRow(plainKey, s) || (anchKey && (poolRow(anchKey, s) || anchRow))) {
        emittedC.set(pk, null);
      }
      continue;
    }
    const pickP = jointPick(plainRow, poolRow(plainKey, s));
    const fbP = topForm(poolRow(plainKey, s)) ?? effBelow(E, s);
    if (pickP !== null && pickP !== fbP) emittedC.set(pk, pickP);
    if (anchRow) {
      const pickA = jointPick(anchRow, poolRow(anchKey, s));
      /* Absent anchored own → runtime consults the anchored POOL row
       * first (its pick is topForm of the raw pool row whether that row
       * ships or is pruned), then the plain position's answer. */
      const ownP = emittedC.get(pk);
      const plainPos = ownP !== undefined && ownP !== null ? ownP
        : ownP === null ? effBelow(E, s)
        : (topForm(poolRow(plainKey, s)) ?? effBelow(E, s));
      const fbA = topForm(poolRow(anchKey, s)) ?? plainPos;
      if (pickA !== null && pickA !== fbA) emittedC.set(`${anchKey}|${s}`, pickA);
    }
  }
  /* Pool rows: needed only when some class member without an own row
   * at this position would get a different answer below — emit once
   * per position per class. Consumers include sids whose raw own row
   * was pruned — a pruned row means they now reach the pool. */
  const poolAt = (K) => {
    for (const [tbl, members, out] of [
      [ft.verbFree, ft.verbSenses, emittedPoolV],
      [ft.plFree, ft.plSenses, emittedPoolP],
    ]) {
      /* Plural pools only answer where the phrase asks "how many" —
       * the runtime never consults a non-quant ctx, so none ship. */
      if (tbl === ft.plFree && !K.split(" ").some((w) => quant.has(w))) continue;
      const row = tbl?.[K];
      const pick = topForm(row);
      if (pick === null) continue;
      const need = members.some((s) => {
        if (emittedC.has(`${K}|${s}`)) return false;  // own row decides
        const ownP = K === plainKey ? undefined : emittedC.get(`${plainKey}|${s}`);
        const below = K === plainKey ? effBelow(E, s)
          : ownP !== undefined && ownP !== null ? ownP
          : ownP === null ? effBelow(E, s)
          : (topForm(poolRow(plainKey, s)) ?? effBelow(E, s));
        return below === null || below !== pick;
      });
      if (need) out[K] = pick;
    }
  };
  if (plainKey !== "<s>") poolAt(plainKey);
  if (anchKey) poolAt(anchKey);
  if (E === "") poolAt("<s>");
}

/* ---------- nextVerb -> n ---------- */
/* The nv walk answers before the c-walk at every length. A plain row
 * is kept when its pick differs from the nv chain below it; when the
 * chain ends, the true fallback is the c-walk at whatever ctxIds the
 * caller holds — a superset of E that can answer anything — so a
 * chain-ending row always ships. (An anchored row is only ever queried
 * as the full ctx, so its below is decidable: the plain position.) */
const nvLevels = indexLevels(ft.nextVerb, 2);
function effNvSuffix(E, pair) {
  const words = E.split(" ");
  for (let i = 1; i < words.length; i++) {
    const S = words.slice(i).join(" ");
    const v = emittedNv.get(`${S}|${pair}`);
    if (v === null) continue;
    if (v !== undefined) return v;
  }
  return undefined;
}
/* The emitted c-walk answer for ctxIds == E (anchored twin first) —
 * used only for the anchored row's below, which is decidable. */
const cWalk = (E, s) => {
  const keys = E === "" ? ["<s>"] : [`<s> ${E}`, E];
  for (const K of keys) {
    const v = emittedC.get(`${K}|${s}`);
    if (v === null) return effBelow(E, s);   // veto: level skipped
    if (v !== undefined) return v;
    const p = poolEmitted(s)[K];
    if (p !== undefined) return p;
  }
  return effBelow(E, s);
};
for (const E of [...nvLevels.keys()].sort((a, b) => endLen(a) - endLen(b))) {
  const lvl = nvLevels.get(E);
  const pairs = new Set([...lvl.plain.keys(), ...lvl.anch.keys()]);
  const plainKey = E === "" ? "<s>" : E;
  const anchKey = E === "" ? null : `<s> ${E}`;
  for (const pair of pairs) {
    const plainRow = lvl.plain.get(pair);
    const anchRow = lvl.anch.get(pair);
    const pk = `${plainKey}|${pair}`, ak = anchKey && `${anchKey}|${pair}`;
    if (tied(plainRow)) {
      if (anchRow) emittedNv.set(pk, null);
      continue;
    }
    const pickP = topForm(plainRow);
    const fb = effNvSuffix(E, pair);
    if (pickP !== null && pickP !== fb) emittedNv.set(pk, pickP);
    if (anchRow) {
      const pickA = topForm(anchRow);
      const s = pair.split("|")[0];
      const fbA = emittedNv.has(pk) ? emittedNv.get(pk) : (fb ?? cWalk(E, s));
      if (pickA !== null && pickA !== fbA) emittedNv.set(ak, pickA);
    }
  }
}

/* ---------- flat fast paths ---------- */
const emittedP = {};
const xRows = {}, clsRows = {}, eosRows = {};
for (const [k, row] of Object.entries(ft.possNext)) {
  const parts = k.split("|");
  if (parts.length === 3 && parts[1] === "x") xRows[`${parts[0]}|${parts[2]}`] = row;
  else if (parts.length === 2 && parts[1] === "EOS") eosRows[parts[0]] = row;
  else if (parts.length === 2) clsRows[k] = row;
}
for (const [pair, xRow] of Object.entries(xRows)) {
  const [s, next] = pair.split("|");
  const cls = isNoun.has(next) ? "N" : "X";
  const pick = topForm(xRow) ?? topForm(clsRows[`${s}|${cls}`]);
  if (pick !== null) emittedP[pair] = pick;
}
for (const [pair, row] of Object.entries(clsRows)) {
  const pick = topForm(row);
  if (pick !== null) emittedP[pair] = pick;
}

const feats = new Set(["BASE"]);
for (const t of [ft.contexts, ft.nextVerb, ft.verbFree, ft.plFree, ft.aAn, ft.possNext]) {
  for (const row of Object.values(t ?? {})) for (const f of Object.keys(row)) feats.add(f);
}
const featList = [...feats];
const featCode = new Map(featList.map((f, i) => [f, i]));

const emittedE = {};
for (const [s, row] of Object.entries(eosRows)) {
  for (const feat of feats) {
    const cands = { [feat]: 1, "PRO;POSS": 1, "PRO;POSS;ABS": 1, "N;POSS": 1 };
    let best = null;
    for (const [f, n] of Object.entries(row)) {
      if (cands[f] && (!best || n > row[best])) best = f;
    }
    const out = best && best !== feat ? best : feat !== "BASE" ? feat : null;
    if (out !== null) emittedE[`${s}|${feat}`] = out;
  }
  // Presence marker: the EOS row existed. A worn feature outside the
  // corpus domain still stands on it ("that is her" stays her).
  emittedE[`${s}|_`] = 1;
}

const emittedA = {};
for (const [next, row] of Object.entries(ft.aAn ?? {})) {
  const p = topForm(row);
  if (p !== null) emittedA[next] = p;
}

/* ---------- numeric encoding ---------- */
/* Key segments ship base-36 ("sns_0270" -> "7i") — ~1-2 bytes saved
 * per segment across ~200k keys. "S"/"X"/"N" literals stay uppercase;
 * base-36 digits are lowercase+digits so they can never collide. */
const k36 = (w) => w === "<s>" ? "S" : String(nid(w).toString(36));
const numKey = (k) =>
  k.split("|").map((part) => part.split(" ").map(k36).join(".")).join("|");

const encodeRows = (m) => Object.fromEntries([...m].map(([k, v]) => [numKey(k), v === null ? null : featCode.get(v)]));
const encodeFlat = (o, keyFn, valFn) => Object.fromEntries(Object.entries(o).map(([k, v]) => [keyFn(k), valFn(v)]));

const formAns = {
  version: "form-answers.2",
  aSense: nid(ft.aSense),
  verbs: ft.verbSenses.map(nid), pl: ft.plSenses.map(nid),
  nouns: ft.nounSenses.map(nid), quants: ft.quantSenses.map(nid),
  f: featList,
  a: encodeFlat(emittedA, (k) => nid(k).toString(36), (v) => featCode.get(v)),
  e: encodeFlat(emittedE,
    (k) => k.split("|").map((p, i) => i === 0 ? nid(p).toString(36) : p === "_" ? "_" : String(featCode.get(p))).join("|"),
    (v) => v === 1 ? 1 : featCode.get(v)),
  p: encodeFlat(emittedP,
    (k) => k.split("|").map((p) => p === "X" || p === "N" ? p : nid(p).toString(36)).join("|"),
    (v) => featCode.get(v)),
  n: encodeRows(emittedNv),
  c: encodeRows(emittedC),
  poolV: encodeFlat(emittedPoolV, numKey, (v) => featCode.get(v)),
  poolP: encodeFlat(emittedPoolP, numKey, (v) => featCode.get(v)),
};

/* ---------- suggestions: ending -> ordered passing ids ---------- */
const pt = JSON.parse(readFileSync(PHRASE_SRC, "utf8"));
/* Endings share first words heavily — a prefix trie dedupes them.
 * Node = {nid: child}; leaf row lives under "$" (a key nids can't
 * take). The empty ending's row sits at the root's "$". */
const sugg = {};
for (const [ending, row] of Object.entries(pt.contexts)) {
  const seen = pt.seen?.[ending] ?? 0;
  const passing = Object.entries(row)
    .sort((a, b) => b[1] - a[1])
    .filter(([, n]) => !seen || n / seen >= MIN_SHARE)
    .slice(0, SUGG_CAP)
    .map(([id]) => nid(id));
  // Row presence carries the raw row's existence — an all-cut ending
  // still wins the longest-first race and paints nothing, same as the
  // raw table made it do.
  let node = sugg;
  for (const w of ending.split(" ").filter(Boolean)) node = node[nid(w).toString(36)] ??= {};
  node.$ = passing.length === 1 ? passing[0] : passing;
}
/* The place picker's day-one prior: how often each word followed any
 * ending at all (raw counts — the map is ~600 entries). */
const uni = {};
for (const row of Object.values(pt.contexts)) {
  for (const [id, n] of Object.entries(row)) {
    uni[nid(id).toString(36)] = (uni[nid(id).toString(36)] ?? 0) + n;
  }
}
const suggAns = { version: "suggest-answers.2", ctxMax: pt.ctxMax ?? 6, uni, contexts: sugg };

/* ---------- write or check ---------- */
const formJson = `${JSON.stringify(formAns)}\n`;
const suggJson = `${JSON.stringify(suggAns)}\n`;
if (check) {
  let stale = 0;
  if (!existsSync(FORM_OUT) || readFileSync(FORM_OUT, "utf8") !== formJson) {
    console.error("stale: public/form_answers.en.json"); stale++;
  }
  if (!existsSync(SUGG_OUT) || readFileSync(SUGG_OUT, "utf8") !== suggJson) {
    console.error("stale: public/suggest_answers.en.json"); stale++;
  }
  if (stale) process.exit(1);
  console.log("answer tables OK");
} else {
  writeFileSync(FORM_OUT, formJson);
  writeFileSync(SUGG_OUT, suggJson);
  console.log(`form_answers: c=${emittedC.size} n=${emittedNv.size} p=${Object.keys(emittedP).length} e=${Object.keys(emittedE).length} a=${Object.keys(emittedA).length} poolV=${Object.keys(emittedPoolV).length} poolP=${Object.keys(emittedPoolP).length} -> ${formJson.length} bytes`);
  console.log(`suggest_answers: ${Object.keys(sugg).length} endings -> ${suggJson.length} bytes`);
}
