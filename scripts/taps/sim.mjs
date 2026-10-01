#!/usr/bin/env node
/**
 * Tap-count simulator (tap-lab v0): replay a sentence corpus through the
 * REAL board model — the shipped catalog imported into a real sqlite db,
 * the real stripRanked / groupRanked / formFor code — under different
 * interface rules, and count taps.
 *
 * The instrument: an ideal-user policy. Per target word it enumerates
 * every legal production path in the current view and takes the cheapest
 * (ties prefer not moving). Costs are honest taps, not reported numbers:
 * a word tile = 1, folder = 1, group door = 1, page flip = 1, home = 1,
 * strip card = 1, keyboard = 1 + letters. Grammar help (formFor) decides
 * the surface form for free, exactly like the app.
 *
 * Scenario flags (the board under test):
 *   cols          strip row width in columns (8 on grid60)
 *   wordWide      columns per word prediction tile (2 today, 1 = wide bar)
 *   doors         one-column door cards for the ranker's likeliest groups
 *   members       one-column cards showing top members of the top door
 *   bigram        a two-word continuation card (2 columns, "to play")
 *   autoDoors     a word that name-matches a group opens it on tap (TC-style)
 *   autoReturn    a group-page word tap returns home (stays put if off)
 *   promoteAfter  a word fetched N times via groups becomes surface-pinned
 *   search        wrong-door tax: +2 when the needed group wasn't predicted
 *
 * Run: node scripts/taps/sim.mjs [--scenario=name] [--warm-only]
 *      [--sentence="i want to play puzzle"] [--json]
 * Works test: scripts/taps/sim.test.mjs.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createDatabase, importCatalog } from "../../src/board/catalog.mjs";
import { normalizeV1 } from "../../public/shared/normalize.mjs";
import {
  openSentence, closeSentence, logSelection,
  senseMerge, stripRanked, groupRanked, groupStarters,
} from "../../public/shared/funnel.mjs";
import {
  geometryOf, groupIndex, groupDisplayName, indexVisual, shownOn,
} from "../../public/shared/groups.mjs";
import { formFor } from "../../public/shared/forms.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const LAYOUT = "grid60";
const LOCALE = "en";
const NOW = Date.parse("2026-09-30T15:00:00");
const STRIP_COLS = 8; // grid60 row 2 minus Folder + Keyboard (023 §1f)

const catalog = JSON.parse(readFileSync(join(root, "public/catalog.json"), "utf8"));
const kids = JSON.parse(readFileSync(join(root, "data/prediction/phrase_table.en.json"), "utf8"));
const formTable = JSON.parse(readFileSync(join(root, "data/prediction/form_table.en.json"), "utf8"));

export { boardModel, runCorpus, catalog, kids, formTable, LAYOUT, LOCALE };

/* ---------------- board model (read once per db) ---------------- */

function boardModel(db) {
  const geom = geometryOf(db, LAYOUT);
  const profile = db.prepare(
    "SELECT group_top_row AS gtr, grammar_help AS gh FROM learner_profile WHERE id = 'prf_local'").all()[0];
  const topRowOn = (profile?.gtr ?? 1) === 1;
  const home = new Map(); // sense_id -> slot
  const labelOf = new Map();
  for (const c of db.prepare(
    `SELECT cc.slot_index AS slot, cc.sense_id AS id, l.text AS label
     FROM core_cell cc JOIN label l ON l.sense_id = cc.sense_id
       AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = ?
     WHERE cc.layout = ?`).all(LOCALE, LAYOUT)) {
    home.set(c.id, c.slot);
    labelOf.set(c.id, c.label);
  }
  const merge = senseMerge(db);
  const fold = (id) => merge.get(id) ?? id;
  const homeFolded = new Set([...home.keys()].map(fold));
  const reservedSlots = new Set([...geom.frame, ...(topRowOn ? geom.topRow : [])]);
  const reservedSenses = new Set(
    [...home.entries()].filter(([, s]) => reservedSlots.has(s)).map(([id]) => fold(id)));

  // groupId -> folded sense id -> min page
  const cellsOf = new Map();
  for (const r of db.prepare(
    "SELECT group_id AS g, item_kind AS k, item_id AS i, page AS p FROM group_cell WHERE layout = ?")
    .all(LAYOUT)) {
    if (r.k !== "sense") continue;
    if (!cellsOf.has(r.g)) cellsOf.set(r.g, new Map());
    const m = cellsOf.get(r.g);
    for (const id of new Set([r.i, fold(r.i)])) {
      if (!m.has(id) || m.get(id) > r.p) m.set(id, r.p);
    }
  }
  const groups = groupIndex(db).filter((g) => shownOn(db, g.id, LAYOUT));
  const groupsById = new Map(groups.map((g) => [g.id, g]));
  const pageCountOf = new Map();
  for (const g of groups) {
    const m = cellsOf.get(g.id) ?? new Map();
    pageCountOf.set(g.id, Math.max(1, ...[...m.values()].map((p) => p + 1)));
  }
  const indexPageOf = new Map(
    groups.map((g) => [g.id, indexVisual(g.index_slot, geom.cells).page]));

  // name-match doors: normalized display name -> group ("play" -> grp_play)
  const nameDoors = new Map();
  for (const g of groups) {
    const n = normalizeV1(groupDisplayName(db, g, LOCALE));
    if (n && !nameDoors.has(n)) nameDoors.set(n, g.id);
  }
  const lemmaByNorm = new Map();
  const posOf = new Map();
  for (const l of db.prepare(
    `SELECT sense_id AS id, normalized_text AS n, part_of_speech AS pos, text
     FROM label WHERE kind = 'lemma' AND status = 'approved' AND locale = ?`).all(LOCALE)) {
    if (!lemmaByNorm.has(l.n)) lemmaByNorm.set(l.n, l.id);
    labelOf.set(l.id, l.text);
    posOf.set(l.id, l.pos);
  }
  return { geom, topRowOn, home, homeFolded, reservedSenses, cellsOf,
    groups, groupsById, pageCountOf, indexPageOf, nameDoors,
    lemmaByNorm, posOf, labelOf, fold };
}

/* ---------------- strip contents ---------------- */

/** Word predictions for the current view (the real ranker, cap lifted
 *  by the scenario's slot budget). `homeInGroup`: inside a group the bar
 *  also offers the general predictions (home words like "and", "want")
 *  after the group's own ranked members — she stays where she is. */
function wordRankedFor(db, M, view, items, now, scen) {
  if (view.kind === "group") {
    const grp = !items.length
      ? groupStarters(db, view.id, {
          starters: catalog.groupStarters ?? null,
          visible: new Set([...(M.cellsOf.get(view.id)?.keys() ?? [])]
            .map((k) => `sense:${k}`)),
          cap: 16 }).ranked
      : groupRanked(db, items, view.id, now).ranked;
    if (!scen.homeInGroup) return grp;
    const gen = stripRanked(db, items, now, LOCALE, kids).ranked
      .filter((c) => !c.mask && !c.cut);
    const seen = new Set(grp.map((c) => `${c.kind}:${M.fold(c.id)}`));
    return [...grp, ...gen.filter((c) => !seen.has(`${c.kind}:${M.fold(c.id)}`))];
  }
  return stripRanked(db, items, now, LOCALE, kids).ranked
    .filter((c) => !c.mask && !c.cut);
}

/** Door cards: groups of the ranked candidates, candidate order, deduped. */
function likelyDoors(db, wordRanked) {
  const out = [];
  const seen = new Set();
  for (const c of wordRanked) {
    for (const r of db.prepare(
      "SELECT group_id AS g FROM group_membership WHERE item_kind = ? AND item_id = ?")
      .all(c.kind, c.id)) {
      if (!seen.has(r.g)) { seen.add(r.g); out.push(r.g); }
    }
  }
  return out;
}

/** Member cards for the top predicted group: her ranked use first, then
 *  the group's own cell order (cold-start bound — flagged in output). */
function memberCardsFor(db, M, view, items, doorId, now) {
  if (!doorId) return [];
  const ranked = groupRanked(db, items, doorId, now).ranked
    .filter((c) => M.cellsOf.get(doorId)?.has(M.fold(c.id)));
  const have = new Set(ranked.map((c) => M.fold(c.id)));
  const cells = M.cellsOf.get(doorId) ?? new Map();
  const rest = [...cells.entries()]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .map(([id]) => ({ kind: "sense", id }))
    .filter((c) => !have.has(M.fold(c.id)));
  return [...ranked, ...rest];
}

function stripFor(db, M, view, items, scen, now) {
  let ranked = wordRankedFor(db, M, view, items, now, scen);
  const doorsAll = view.kind === "group" ? [] : likelyDoors(db, ranked);
  const members = scen.members ? memberCardsFor(db, M, view, items, doorsAll[0], now) : [];
  const wordCols = scen.cols - scen.doors - scen.members - (scen.bigram ? 2 : 0)
    - (scen.recents ? 1 : 0);
  const wordSlots = Math.max(0, Math.floor(wordCols / scen.wordWide));
  let words = ranked.slice(0, wordSlots);
  // freqFill: "she has said this" outranks the population prior — used
  // words keep ranked order first, then used-but-unpredicted words by
  // frequency, then the unused ranked tail. Real slot competition: a
  // used word wins the slot an unused kids-table guess would have held.
  if (scen.freqFill && view.kind !== "group") {
    const freq = new Map();
    for (const r of db.prepare(
      `SELECT item_kind AS kind, item_id AS id, COUNT(*) AS n
       FROM learner_event_log GROUP BY 1, 2`).all())
      freq.set(`${r.kind}:${M.fold(r.id)}`, r.n);
    if (freq.size) {
      const masked = new Set(db.prepare(
        "SELECT sense_id AS s FROM sense_mask WHERE status = 'hidden'").all().map((r) => r.s));
      const key = (c) => `${c.kind}:${M.fold(c.id)}`;
      const usedRanked = ranked.filter((c) => freq.has(key(c)));
      const rest = ranked.filter((c) => !freq.has(key(c)));
      const inRanked = new Set(ranked.map(key));
      const unrankedUsed = [...freq.entries()]
        .filter(([k]) => !inRanked.has(k)
          && !(k.startsWith("sense:") && masked.has(k.slice(6))))
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([k]) => { const [kind, id] = k.split(":"); return { kind, id }; });
      words = [...usedRanked, ...unrankedUsed, ...rest].slice(0, wordSlots);
    }
  }
  // bigram card: the top prediction, then the top prediction after it
  let bigram = null;
  if (scen.bigram && view.kind !== "group" && words.length) {
    const next = stripRanked(db, [...items, words[0]], now, LOCALE, kids).ranked
      .filter((c) => !c.mask && !c.cut)[0];
    if (next) bigram = [words[0], next];
  }
  return { words, doors: doorsAll.slice(0, scen.doors), doorsAll,
    members: members.slice(0, scen.members), bigram };
}

/* ---------------- one corpus pass ---------------- */

function runCorpus(db, M, corpus, scen, { warm = false } = {}) {
  let view = { kind: "home" };
  const promoted = new Set();       // folded ids pinned to the surface
  const buriedUse = new Map();      // folded id -> buried fetch count
  const recentsWindow = new Set();  // last-used non-home senses (★ family)
  const RECENTS_CAP = 12;
  const per = [];
  const agg = { taps: 0, words: 0, strip: 0, member: 0, doorCard: 0, folder: 0,
    door: 0, flip: 0, home: 0, board: 0, kb: 0, bigram: 0, wrongDoor: 0,
    doorFires: 0, doorHits: 0, promoteUsed: 0, autoBack: 0, surfaceDiff: 0 };

  let clock = NOW;
  for (const sent of corpus) {
    // Greedy longest-match: multi-word lemmas ("all done", "my turn")
    // are one tile — the ideal user takes the cheaper path.
    const ws = sent.split(/\s+/);
    const targets = [];
    for (let k = 0; k < ws.length;) {
      let hit = null;
      for (let len = Math.min(3, ws.length - k); len > 0; len--) {
        const id = M.lemmaByNorm.get(normalizeV1(ws.slice(k, k + len).join(" ")));
        if (id) { hit = { w: ws.slice(k, k + len).join(" "), id: M.fold(id), len }; break; }
      }
      targets.push(hit ?? { w: ws[k], id: null, len: 1 });
      k += hit ? hit.len : 1;
    }
    const sid = openSentence(db, clock);
    const items = [];
    const path = [];
    const produced = [];
    let taps = 0, i = 0;
    let pendingDoor = null; // group an autoDoor just opened — judged by the next word

    const say = (t, src, groupId = null) => {
      if (pendingDoor && view.kind === "group" && view.id === pendingDoor) agg.doorHits++;
      pendingDoor = null;
      const form = formFor(db, formTable, items, t.id);
      produced.push(form.text ?? t.w);
      items.push({ kind: "sense", id: form.senseId });
      logSelection(db, "sense", form.senseId, clock, {
        sentenceId: sid, position: items.length - 1,
        source: { board: "grid", strip: "strip", member: "strip",
          bigram: "strip", promoted: "strip", group: "group" }[src] ?? src,
        labelId: form.labelId, groupId });
      path.push(t.w + (src === "strip" ? "~" : src === "member" ? "#"
        : src === "bigram" ? "§" : src === "promoted" ? "★" : ""));
      agg[src] = (agg[src] ?? 0) + 1;
      // Recents window: every produced non-home word joins/leads the list.
      if (!M.homeFolded.has(M.fold(form.senseId))) {
        recentsWindow.delete(form.senseId);
        recentsWindow.add(form.senseId);
        if (recentsWindow.size > RECENTS_CAP)
          recentsWindow.delete(recentsWindow.values().next().value);
      }
      // TouchChat-style door: a word that names a group opens it.
      if (scen.autoDoors && view.kind !== "group") {
        const g = scen.doorMap?.get(M.fold(t.id))
          ?? M.nameDoors.get(normalizeV1(M.labelOf.get(t.id) ?? t.w));
        if (g && (!scen.doorPOS || scen.doorPOS.has(M.posOf.get(t.id)))) {
          view = { kind: "group", id: g, page: 0 };
          agg.doorFires++;
          pendingDoor = g;
        }
      }
      if (scen.autoReturn && view.kind === "group") view = { kind: "home" };
    };

    while (i < targets.length) {
      const t = targets[i];
      if (!t.id) { // not a catalog word: keyboard
        taps += 1 + t.w.length;
        agg.kb++; agg.taps += 1 + t.w.length;
        path.push(`⌨${t.w}`);
        i++; continue;
      }
      const strip = stripFor(db, M, view, items, scen, clock);
      const inStrip = (l) => l.some((c) => c.kind === "sense" && M.fold(c.id) === t.id);

      // bigram card: this word + the next, one tap
      if (strip.bigram && i + 1 < targets.length && targets[i + 1].id
          && M.fold(strip.bigram[0].id) === t.id
          && M.fold(strip.bigram[1].id) === targets[i + 1].id) {
        taps += 1; agg.taps += 1;
        for (const c of strip.bigram) say({ w: M.labelOf.get(M.fold(c.id)) ?? "?", id: c.id }, "bigram");
        agg.bigram++; i += 2; continue;
      }
      if (scen.promoteAfter && promoted.has(t.id)) {
        taps += 1; agg.taps += 1; agg.promoteUsed++;
        say(t, "promoted", view.kind === "group" ? view.id : null); i++; continue;
      }
      if (inStrip(strip.words)) {
        taps += 1; agg.taps += 1; say(t, "strip", view.kind === "group" ? view.id : null);
        i++; continue;
      }
      if (inStrip(strip.members)) {
        taps += 1; agg.taps += 1; say(t, "member", null); i++; continue;
      }

      // visible right now?
      if (view.kind === "home" && M.homeFolded.has(t.id)) {
        taps += 1; agg.taps += 1; say(t, "board"); i++; continue;
      }
      if (view.kind === "group") {
        if (M.reservedSenses.has(t.id)) { taps += 1; agg.taps += 1; say(t, "board", view.id); i++; continue; }
        const pg = M.cellsOf.get(view.id)?.get(t.id);
        if (pg != null) {
          const pages = M.pageCountOf.get(view.id) ?? 1;
          const flips = Math.min((pg - view.page + pages) % pages,
            (view.page - pg + pages) % pages);
          taps += flips + 1; agg.taps += flips + 1; agg.flip += flips;
          if (flips) path.push(`›x${flips}`);
          view.page = pg;
          say(t, "board", view.id); i++; continue;
        }
      }
      if (view.kind === "index" && M.homeFolded.has(t.id)) {
        taps += 2; agg.taps += 2; agg.home++;
        path.push("⌂"); view = { kind: "home" };
        say(t, "board"); i++; continue;
      }

      // a home word while inside a group/index: pay the trip home
      if (M.homeFolded.has(t.id)) {
        taps += 2; agg.taps += 2; agg.home++;
        if (pendingDoor && pendingDoor === view.id) agg.autoBack++;
        path.push("⌂"); view = { kind: "home" };
        say(t, "board"); i++; continue;
      }

      // recents family: a strip door listing her recent buried words —
      // open + pick = 2 taps, deterministic, no guessing (the honest
      // "promotion" shape). A strip card, not a page: the grid view does
      // not move. From inside a group she pays the trip home first.
      if (scen.recents && !M.homeFolded.has(t.id)
          && recentsWindow.has(t.id)) {
        const leave = view.kind === "group" || view.kind === "index" ? 1 : 0;
        taps += leave + 2; agg.taps += leave + 2;
        if (leave) { agg.home += leave; path.push("⌂"); view = { kind: "home" }; }
        agg.promoteUsed++;
        path.push(`★:${t.w}`);
        say(t, "promoted"); i++; continue;
      }

      // index members: the group index shows the predicted group's top
      // members — folder + word = 2 taps when the prediction covers it.
      if (scen.indexMembers && view.kind !== "group" && strip.doorsAll.length) {
        const mem = new Set(memberCardsFor(db, M, view, items, strip.doorsAll[0], clock)
          .slice(0, 6).map((c) => M.fold(c.id)));
        if (mem.has(t.id)) {
          taps += (view.kind === "index" ? 0 : 1) + 1;
          agg.taps += (view.kind === "index" ? 0 : 1) + 1;
          if (view.kind !== "index") { agg.folder++; path.push("F"); }
          path.push(`◇${t.w}`);
          // she never opened the group — the word was on the index; view stays index
          view = { kind: "index" };
          say(t, "member"); i++; continue;
        }
      }

      // buried: find the cheapest group that holds it
      const holders = [...M.cellsOf.entries()]
        .filter(([, m]) => m.has(t.id)).map(([g, m]) => ({ g, page: m.get(t.id) }));
      if (!holders.length) {
        taps += 1 + t.w.length; agg.taps += 1 + t.w.length; agg.kb++;
        path.push(`⌨${t.w}`); i++; continue;
      }
      let best = null;
      for (const h of holders) {
        const pages = M.pageCountOf.get(h.g) ?? 1;
        const sameGroup = view.kind === "group" && view.id === h.g;
        const flips = sameGroup
          ? Math.min((h.page - view.page + pages) % pages,
              (view.page - h.page + pages) % pages)
          : h.page; // doors land on page 0
        const doorCard = strip.doors.includes(h.g);
        const cost = sameGroup ? flips + 1
          : doorCard ? 1 + flips + 1
          : (view.kind === "index" ? 0 : 1) + 1 + flips + 1;
        // wrong-door tax: the group wasn't among the top-2 predicted doors
        const real = scen.search && !sameGroup && !strip.doorsAll.slice(0, 2).includes(h.g)
          ? cost + 2 : cost;
        if (!best || cost < best.cost) best = { ...h, cost, real, doorCard, flips, sameGroup };
      }
      const spent = scen.search ? best.real : best.cost;
      taps += spent; agg.taps += spent;
      agg.wrongDoor += spent - best.cost;
      if (!best.sameGroup) {
        if (best.doorCard) { agg.doorCard++; path.push(`▸${groupDisplayName(db, M.groupsById.get(best.g), LOCALE)}`); }
        else {
          if (view.kind !== "index") { agg.folder++; path.push("F"); }
          agg.door++;
          path.push(`G:${groupDisplayName(db, M.groupsById.get(best.g), LOCALE)}`);
        }
        view = { kind: "group", id: best.g, page: best.page };
      } else {
        view.page = best.page;
      }
      if (best.flips) { path.push(`›x${best.flips}`); agg.flip += best.flips; }
      t.buried = true;
      say(t, "board", best.g);
      if (scen.promoteAfter) {
        const n = (buriedUse.get(t.id) ?? 0) + 1;
        buriedUse.set(t.id, n);
        if (n >= scen.promoteAfter) promoted.add(t.id);
      }
      i++;
    }
    closeSentence(db, sid, clock + 1, "spoken");
    clock += 120000;
    per.push({ sent, taps, words: targets.length, path: path.join(" "),
      produced: produced.join(" ") });
    for (const t of targets) if (t.buried) {
      agg.buriedCount = agg.buriedCount ?? {};
      agg.buriedCount[t.w] = (agg.buriedCount[t.w] ?? 0) + 1;
    }
    const targetToks = sent.toLowerCase().split(/\s+/);
    if (produced.map((p) => p.toLowerCase()).join(" ") !== targetToks.join(" ")) agg.surfaceDiff++;
  }
  return { per, agg, words: per.reduce((n, p) => n + p.words, 0) };
}

/* ---------------- scenarios ---------------- */

const SCENARIOS = {
  baseline:    {},
  baseline_s:  { search: true },
  wide8:       { wordWide: 1 },
  doors2:      { doors: 2 },
  doors2_wide: { wordWide: 1, doors: 2 },
  members3:    { members: 3 },
  members_wide:{ wordWide: 1, members: 3 },
  bigram:      { bigram: true },
  autodoor:    { autoDoors: true },
  autoreturn:  { autoReturn: true },
  autodoor_ret:{ autoDoors: true, autoReturn: true },
  promote1:    { promoteAfter: 1 },   // unlimited surface — a ceiling, not a design
  doors2_s:    { doors: 2, search: true },
  ingroup:     { homeInGroup: true },  // group strip also offers home predictions
  ingroup_s:   { homeInGroup: true, search: true },
  freqfill:    { freqFill: true },     // her used words outrank the population prior
  freqfill_s:  { freqFill: true, search: true },
  indexmem:    { indexMembers: true }, // group index shows top group's members (2-tap fetch)
  indexmem_s:  { indexMembers: true, search: true },
  recents:     { recents: true },      // a "★ Recents" strip door: open + pick = 2 taps
  combo:       { wordWide: 1, homeInGroup: true, freqFill: true, bigram: true },
  combo_s:     { wordWide: 1, homeInGroup: true, freqFill: true, bigram: true, search: true },
  combo2:      { wordWide: 1, homeInGroup: true, indexMembers: true, recents: true, bigram: true },
  combo2_s:    { wordWide: 1, homeInGroup: true, indexMembers: true, recents: true, bigram: true, search: true },
  promote1_s:  { promoteAfter: 1, search: true },
  kitchen:     { wordWide: 1, doors: 1, members: 2, bigram: true, promoteAfter: 1 },
  kitchen_s:   { wordWide: 1, doors: 1, members: 2, bigram: true, promoteAfter: 1, search: true },
};
const base = { cols: STRIP_COLS, wordWide: 2, doors: 0, members: 0,
  bigram: false, autoDoors: false, autoReturn: false, promoteAfter: 0,
  search: false, doorMap: null, doorPOS: null, homeInGroup: false,
  freqFill: false, indexMembers: false, recents: false };
const cfg = (name) => ({ ...base, ...(SCENARIOS[name] ?? JSON.parse(name)) });

export { SCENARIOS, cfg };

/* ---------------- main ---------------- */

const isMain = process.argv[1]
  && fileURLToPath(import.meta.url) === process.argv[1];
if (!isMain) {
  // imported by the works test — stop here
} else {
const argv = process.argv.slice(2);
const opt = Object.fromEntries(argv.filter((a) => a.startsWith("--")).map((a) => {
  const [k, v] = a.slice(2).split("="); return [k, v ?? true];
}));

const corpusFile = JSON.parse(
  readFileSync(join(root, "scripts/taps/corpus.en.json"), "utf8"));
const fixture = opt.fixture === "false" ? { sentences: [] }
  : JSON.parse(readFileSync(join(root, "src/board/fixtures/typing_sentences.en.json"), "utf8"));
const corpus = [...corpusFile.sentences, ...fixture.sentences]
  .map((s) => s.trim().toLowerCase());

const db0 = createDatabase(":memory:");
importCatalog(db0, catalog);
const M = boardModel(db0);

// Corpus validation: every word must resolve to a lemma (multi-word
// lemmas like "all done" count once).
const missing = new Set();
for (const s of corpus) {
  const ws = s.split(/\s+/);
  for (let k = 0; k < ws.length;) {
    let len = 0;
    for (let l = Math.min(3, ws.length - k); l > 0; l--)
      if (M.lemmaByNorm.has(normalizeV1(ws.slice(k, k + l).join(" ")))) { len = l; break; }
    if (!len) { missing.add(ws[k]); len = 1; }
    k += len;
  }
}
if (missing.size) {
  console.error(`corpus words with no en lemma: ${[...missing].join(", ")}`);
  process.exit(2);
}

const which = opt.scenario ? [opt.scenario] : Object.keys(SCENARIOS);
const runs = [];
for (const name of which) {
  const scen = cfg(name);
  // Fresh DB per scenario: phrase history must not leak between runs.
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  const cold = runCorpus(db, M, corpus, scen);       // cold start (also builds history)
  const warm = runCorpus(db, M, corpus, scen, { warm: true });
  runs.push({ name, scen, cold, warm });
}

const f = (n, d = 2) => Number(n.toFixed(d));
if (opt.sentence) {
  const r = runs[0];
  for (const p of [r.cold, r.warm]) {
    const row = p.per.find((x) => x.sent === opt.sentence.toLowerCase());
    if (row) console.log(`${r.name} ${p === r.cold ? "cold" : "warm"}  ${row.taps} taps\n  ${row.path}\n  → ${row.produced}`);
  }
} else {
  console.log(`${"scenario".padEnd(14)} ${"pass".padEnd(5)} ${"taps".padStart(5)} ${"t/w".padStart(5)} ${"nav".padStart(4)} ${"strip".padStart(6)} ${"doorC".padStart(5)} ${"memb".padStart(5)} ${"2gr".padStart(4)} ${"home".padStart(5)} ${"kb".padStart(3)} ${"wDoor".padStart(6)}`);
  for (const r of runs) {
    for (const [tag, p] of [["cold", r.cold], ["warm", r.warm]]) {
      const a = p.agg;
      const nav = a.folder + a.door + a.doorCard + a.flip + a.home;
      if (tag === "warm" && r.cold.agg.taps === a.taps) continue;
      console.log(`${r.name.padEnd(14)} ${tag.padEnd(5)} ${String(a.taps).padStart(5)} ${String(f(a.taps / p.words)).padStart(5)} ${String(nav).padStart(4)} ${String(a.strip ?? 0).padStart(6)} ${String(a.doorCard).padStart(5)} ${String(a.member ?? 0).padStart(5)} ${String(a.bigram).padStart(4)} ${String(a.home).padStart(5)} ${String(a.kb).padStart(3)} ${String(a.wrongDoor).padStart(6)}`);
    }
    const a = r.cold.agg;
    if (r.scen.autoDoors)
      console.log(`${"".padEnd(14)} doors fired ${a.doorFires}, next word inside ${a.doorHits}, paid back-tap ${a.autoBack}`);
    if (r.scen.promoteAfter)
      console.log(`${"".padEnd(14)} promoted ${a.promoteUsed} words surfaced (1 tap)`);
  }
  const b = runs[0];
  const worst = [...b.cold.per].sort((x, y) => y.taps / y.words - x.taps / x.words).slice(0, 8);
  console.log("\nWorst baseline sentences (taps/word):");
  for (const w of worst) console.log(`  ${f(w.taps / w.words, 1)}  (${w.taps})  ${w.sent}\n      ${w.path}`);
  const buried = Object.entries(b.cold.agg.buriedCount ?? {})
    .sort((a, c) => c[1] - a[1]).slice(0, 15);
  console.log("\nMost-fetched buried words, baseline (each cost ≥3 taps cold):");
  console.log("  " + buried.map(([w, n]) => `${w}×${n}`).join("  "));
  console.log(`\nsurface mismatches vs target (grammar help already applied): baseline ${b.cold.agg.surfaceDiff}/${corpus.length} sentences`);
}

const outDir = join(root, "out/tap_sim");
mkdirSync(outDir, { recursive: true });
const file = join(outDir, `run_${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(file, JSON.stringify({ corpus: corpus.length, runs }, null, 2));
if (!opt.sentence) console.log(`\nwrote ${file}`);
} // isMain
