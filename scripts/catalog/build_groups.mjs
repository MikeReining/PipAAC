/**
 * Group seed compiler (027 § 3.1). Reads the two authoring inputs —
 * data/group_seed.topics.json (index order, topic membership) and
 * data/group_seed.occasions.json (meal/Fruit/Drinks membership and
 * clusters) — and emits ordinary catalog rows: board_group seeds, one
 * membership row per word, and explicit positions for every named board
 * size. The browser reads only this output; there is one renderer.
 *
 * Positions come from one rule, never hand coordinates:
 *   - occasion groups share a coordinate per word and size, free in every
 *     occasion group that holds the word: the home cells of
 *     `homeCoordinates` where free, then the size's `firstPage` list and
 *     each `lead` word at the first free cell, then clusters in authored
 *     order, each kept together from a column top (`side: "right"`
 *     clusters by the frame);
 *   - topic groups fill in band order (018 D5), a new band starting a fresh
 *     column while the rest of the group still fits on the page. Inside a
 *     band, members sort by CHILDES child-speech frequency — most-said
 *     first (026: the words children actually say reach the top of the
 *     column); the seed's authored order breaks ties and orders words the
 *     corpus never heard.
 * A word the page already shows in a reserved cell (top row, frame) gets
 * no position at that size — it would render twice.
 *
 * `validateGroups` re-checks the output independently; the build throws on
 * any violation.
 */
import { normalizeV1 } from "../../public/shared/normalize.mjs";
import { BAND_ORDER, groupGeometry, shownByReserved } from "../../public/shared/groups.mjs";

const pad4 = (n) => String(n).padStart(4, "0");
const sid = (slot) => `sns_${pad4(slot)}`;
const FIRST_INDEX_SLOT = 10;
// Seeded groups must fit one page on these sizes (027 § 3.2, 026 D3).
const ONE_PAGE_LAYOUTS = new Set(["grid60", "grid90"]);

function resolver(lexicon) {
  const bySlot = new Map(lexicon.entries.map((e) => [e.slot, e]));
  const byNorm = new Map();
  for (const e of lexicon.entries) {
    const n = normalizeV1(e.spokenText);
    byNorm.set(n, [...(byNorm.get(n) ?? []), e]);
  }
  return (word, ctx) => {
    const [w, slot] = word.split("#");
    if (slot) {
      const e = bySlot.get(Number(slot));
      if (!e || normalizeV1(e.spokenText) !== normalizeV1(w)) {
        throw new Error(`group seed ${ctx}: "${word}" — slot ${slot} is not that word`);
      }
      return sid(e.slot);
    }
    const hits = byNorm.get(normalizeV1(w)) ?? [];
    if (hits.length !== 1) {
      throw new Error(
        `group seed ${ctx}: "${word}" resolves to ${hits.length} lexicon senses (want exactly 1; use word#slot)`,
      );
    }
    return sid(hits[0].slot);
  };
}

/** The catalog layout shapes plus each size's frame: the home slots of
 *  the frame words. Every frame word must sit on every home layout. */
export function groupLayouts(layouts, coreCells, frameSenses) {
  const out = {};
  for (const [name, l] of Object.entries(layouts)) {
    const frame = frameSenses.map((s) => {
      const c = coreCells.find((cc) => cc.layout === name && cc.sense_id === s);
      if (!c) throw new Error(`group seed: frame word ${s} has no home cell on ${name}`);
      return c.slot_index;
    });
    out[name] = { cols: l.cols, rows: l.rows, frame: frame.sort((a, b) => a - b) };
  }
  return out;
}

/** Topic fill: band order, fresh column per band while the rest fits.
 *  Within a band: child-speech frequency desc, then authored order. */
function fillTopic(members, geom, bandOf, freqOf) {
  const rank = (s) => Math.max(0, BAND_ORDER.indexOf(bandOf(s)));
  const sorted = members.map((s, i) => [s, i])
    .sort((a, b) => rank(a[0]) - rank(b[0]) || freqOf(b[0]) - freqOf(a[0]) || a[1] - b[1]).map(([s]) => s);
  const columns = [];
  for (const slot of geom.content) {
    const col = slot % geom.cols;
    if (!columns.length || columns[columns.length - 1].col !== col) columns.push({ col, slots: [] });
    columns[columns.length - 1].slots.push(slot);
  }
  const cells = new Map();
  let page = 0, ci = 0, row = 0;
  sorted.forEach((s, k) => {
    if (k > 0 && row > 0 && rank(s) !== rank(sorted[k - 1])) {
      const leftAfterJump = columns.slice(ci + 1).reduce((n, c) => n + c.slots.length, 0);
      if (sorted.length - k <= leftAfterJump) { ci++; row = 0; }
    }
    cells.set(s, { page, slot_index: columns[ci].slots[row] });
    row++;
    if (row === columns[ci].slots.length) { ci++; row = 0; }
    if (ci === columns.length) { page++; ci = 0; }
  });
  return cells;
}

/**
 * Compile the seeds. `layouts` are the catalog's layout shapes, `coreCells`
 * the shipped home cells. Returns catalog rows plus `groupLayouts` (shape +
 * frame per size, shipped as catalog.layouts[*].frame).
 */
export function buildGroups(lexicon, topicSeed, occasionSeed, { locales = ["en"], layouts, coreCells, wordFreq = {} }) {
  const resolve = resolver(lexicon);
  const band = new Map(lexicon.entries.map((e) => [sid(e.slot), e.fitzgeraldColor]));
  const bandOf = (s) => band.get(s);
  const freq = new Map(lexicon.entries.map((e) => [sid(e.slot), wordFreq[normalizeV1(e.spokenText)] ?? 0]));
  const freqOf = (s) => freq.get(s) ?? 0;
  const frameSenses = occasionSeed.frame.map((w) => resolve(w, "frame"));
  const shapes = groupLayouts(layouts, coreCells, frameSenses);
  const homeOf = (layout) => coreCells.filter((c) => c.layout === layout);

  const occasionByKey = new Map(occasionSeed.groups.map((g) => [g.key, g]));
  const seen = new Set();
  const specs = topicSeed.groups.map((entry) => {
    if (!/^[a-z_]+$/.test(entry.key)) throw new Error(`group seed: key "${entry.key}" must match ^[a-z_]+$`);
    if (seen.has(entry.key)) throw new Error(`group seed: duplicate key "${entry.key}"`);
    seen.add(entry.key);
    if (entry.seed === "occasions") {
      const g = occasionByKey.get(entry.key);
      if (!g) throw new Error(`group seed: ${entry.key} points at the occasions seed, which has no such group`);
      return { ...g, occasionSeed: true };
    }
    if (entry.seed) throw new Error(`group seed ${entry.key}: unknown seed "${entry.seed}"`);
    return entry;
  });
  for (const k of occasionByKey.keys()) {
    if (!seen.has(k)) throw new Error(`group seed: occasion group ${k} has no index position in the topics seed`);
  }

  const groups = [];
  const groupMembers = [];
  const groupLabels = [];
  const membersOf = new Map(); // group id -> [sense ids]
  specs.forEach((g, gi) => {
    if (!g.names || typeof g.names !== "object") throw new Error(`group seed ${g.key}: names must be a per-locale map`);
    for (const loc of locales) {
      if (typeof g.names[loc] !== "string" || !g.names[loc]) {
        throw new Error(`group seed ${g.key}: no name for shipped locale "${loc}"`);
      }
    }
    const id = `grp_${g.key}`;
    let members = [];
    if (g.words) {
      members = g.words.map((w) => resolve(w, `${g.key}.words`));
    } else if (g.sector) {
      const { layout, cols, excludeLayout } = g.sector;
      const lay = layouts[layout];
      if (!lay) throw new Error(`group seed ${g.key}: unknown sector layout ${layout}`);
      const excl = new Set(homeOf(excludeLayout).map((c) => c.sense_id));
      members = homeOf(layout)
        .filter((c) => c.slot_index % lay.cols >= cols[0] && c.slot_index % lay.cols <= cols[1]
          && !excl.has(c.sense_id))
        .sort((a, b) => a.slot_index - b.slot_index)
        .map((c) => c.sense_id);
    }
    const dup = members.find((s, i) => members.indexOf(s) !== i);
    if (dup) throw new Error(`group seed ${g.key}: duplicate meaning ${dup}`);
    for (const l of g.layouts ?? []) {
      if (!layouts[l]) throw new Error(`group seed ${g.key}: unknown layout ${l}`);
    }
    groups.push({
      id,
      kind: g.key === "my_words" ? "my_words" : "builtin",
      glyph: g.glyph ?? null,
      index_slot: FIRST_INDEX_SLOT + gi,
      category: g.category ?? null,
      layouts: g.layouts ?? null,
      occasion: g.occasion ? 1 : 0,
    });
    for (const loc of locales) groupLabels.push({ group_id: id, locale: loc, text: g.names[loc] });
    membersOf.set(id, members);
    for (const s of members) groupMembers.push({ group_id: id, item_kind: "sense", item_id: s });
  });

  const coordinated = specs.filter((g) => g.occasionSeed).map((g) => `grp_${g.key}`);
  const clusterOf = new Map();
  for (const c of occasionSeed.clusters) {
    for (const w of c.words) {
      const s = resolve(w, `cluster ${c.key}`);
      if (clusterOf.has(s)) throw new Error(`group seed: ${w} is in clusters ${clusterOf.get(s)} and ${c.key} — one cluster per word`);
      clusterOf.set(s, c.key);
    }
  }
  const eligible = (g, layout) => !g.layouts || g.layouts.includes(layout);
  const holders = new Map(); // sense -> the occasion groups holding it
  for (const gid of coordinated) {
    for (const s of membersOf.get(gid)) holders.set(s, [...(holders.get(s) ?? []), gid]);
  }

  const groupCells = [];
  for (const layout of Object.keys(layouts)) {
    const geom = groupGeometry(shapes[layout]);
    const home = homeOf(layout);
    const shown = shownByReserved(geom, home);

    // Occasion groups: one coordinate per word, free in all its holders.
    const used = new Map(coordinated.map((g) => [g, new Set()]));
    const at = new Map();
    const free = (s, page, slot) => holders.get(s).every((g) => !used.get(g).has(`${page}:${slot}`));
    const claim = (s, page, slot) => {
      at.set(s, { page, slot_index: slot });
      for (const g of holders.get(s)) used.get(g).add(`${page}:${slot}`);
    };
    const n = geom.content.length;
    const cellAt = (i) => ({ page: Math.floor(i / n), slot: geom.content[i % n] });
    const pending = (s) => !at.has(s) && !shown.has(s) && holders.has(s);
    // Lay `words` down strictly in order from linear cell `start`, each in
    // the first cell after the previous word's that is free in its groups.
    const run = (words, start) => {
      const out = [];
      let i = start;
      for (const s of words) {
        while (!free(s, cellAt(i).page, cellAt(i).slot)) i++;
        out.push([s, cellAt(i).page, cellAt(i).slot]);
        i++;
      }
      return out;
    };
    const firstFit = (s) => {
      if (!pending(s)) return;
      const [[, page, slot]] = run([s], 0);
      claim(s, page, slot);
    };
    const tops = geom.content.map((slot, i) => [slot, i])
      .filter(([slot], i) => i === 0 || slot % geom.cols !== geom.content[i - 1] % geom.cols)
      .map(([, i]) => i);
    // A cluster keeps together: it starts at a column top where the whole
    // run ends on the page it starts on — the rightmost such column for a
    // `side: "right"` cluster (staples by the frame), else the leftmost.
    // Failing that, each word takes the first free cell.
    const assignCluster = (words, side) => {
      const todo = words.filter(pending);
      if (!todo.length) return;
      const starts = side === "right" ? [...tops].reverse() : tops;
      // One-page sizes never push a cluster to a later page to keep it
      // whole; paged sizes (grid15) may, when it fits one page.
      const pagesToTry = ONE_PAGE_LAYOUTS.has(layout) || todo.length > n ? 1 : 3;
      for (let page = 0; page < pagesToTry; page++) {
        for (const t of starts) {
          const placed = run(todo, page * n + t);
          if (placed.every(([, p]) => p === page)) {
            for (const [w, p, slot] of placed) claim(w, p, slot);
            return;
          }
        }
      }
      todo.forEach(firstFit);
    };
    for (const w of occasionSeed.homeCoordinates ?? []) {
      const s = resolve(w, "homeCoordinates");
      const c = home.find((h) => h.sense_id === s);
      if (holders.has(s) && c && !geom.reserved.has(c.slot_index) && free(s, 0, c.slot_index)) {
        claim(s, 0, c.slot_index);
      }
    }
    for (const w of occasionSeed.firstPage?.[layout] ?? []) firstFit(resolve(w, `firstPage.${layout}`));
    for (const w of occasionSeed.lead ?? []) firstFit(resolve(w, "lead"));
    for (const c of occasionSeed.clusters) {
      assignCluster(c.words.map((w) => resolve(w, `cluster ${c.key}`)), c.side);
    }
    for (const gid of coordinated) membersOf.get(gid).forEach(firstFit);

    for (const g of specs) {
      const gid = `grp_${g.key}`;
      if (!eligible(g, layout)) continue;
      const members = membersOf.get(gid).filter((s) => !shown.has(s));
      const cells = coordinated.includes(gid) ? at : fillTopic(members, geom, bandOf, freqOf);
      for (const s of members) {
        const c = cells.get(s);
        groupCells.push({ group_id: gid, layout, item_kind: "sense", item_id: s, page: c.page, slot_index: c.slot_index });
      }
    }
  }

  const out = { groups, groupMembers, groupCells, groupLabels, groupLayouts: shapes };
  validateGroups(out, { lexicon, coreCells, coordinated });
  return out;
}

/**
 * Independent checks over compiled output. Throws the first violation:
 * out-of-bounds, reserved cell, overlap, more than one page on 60/90,
 * a member without a position (or a position without a member), an
 * occasion word whose cell differs between groups, or a launch word no
 * home board or group reaches on some size.
 */
export function validateGroups(out, { lexicon, coreCells, coordinated }) {
  const { groups, groupMembers, groupCells, groupLayouts: shapes } = out;
  const byId = new Map(groups.map((g) => [g.id, g]));
  const member = new Set(groupMembers.map((m) => `${m.group_id}|${m.item_id}`));
  const occupied = new Set();
  const coordAt = new Map();
  const reach = new Map(Object.keys(shapes).map((l) => [l, new Set(
    coreCells.filter((c) => c.layout === l).map((c) => c.sense_id),
  )]));
  const positioned = new Set();
  for (const c of groupCells) {
    const geom = groupGeometry(shapes[c.layout]);
    const where = `${c.group_id} ${c.layout} ${c.item_id} at ${c.page}:${c.slot_index}`;
    if (!Number.isInteger(c.page) || c.page < 0 || c.slot_index < 0 || c.slot_index >= geom.cells) {
      throw new Error(`group seed: out of bounds — ${where}`);
    }
    if (geom.reserved.has(c.slot_index)) throw new Error(`group seed: reserved cell — ${where}`);
    const key = `${c.group_id}|${c.layout}|${c.page}|${c.slot_index}`;
    if (occupied.has(key)) throw new Error(`group seed: overlap — ${where}`);
    occupied.add(key);
    if (!member.has(`${c.group_id}|${c.item_id}`)) throw new Error(`group seed: position without membership — ${where}`);
    const g = byId.get(c.group_id);
    if (g.kind === "builtin" && ONE_PAGE_LAYOUTS.has(c.layout) && c.page > 0) {
      throw new Error(`group seed: more than one page on ${c.layout} — ${where}`);
    }
    if (coordinated.includes(c.group_id)) {
      const k = `${c.layout}|${c.item_id}`;
      const prev = coordAt.get(k);
      if (prev && (prev.page !== c.page || prev.slot_index !== c.slot_index)) {
        throw new Error(`group seed: repeated word mismatch — ${where} vs ${prev.group_id} at ${prev.page}:${prev.slot_index}`);
      }
      coordAt.set(k, c);
    }
    positioned.add(`${c.group_id}|${c.layout}|${c.item_id}`);
    reach.get(c.layout).add(c.item_id);
  }
  for (const layout of Object.keys(shapes)) {
    const geom = groupGeometry(shapes[layout]);
    const shown = shownByReserved(geom, coreCells.filter((c) => c.layout === layout));
    for (const m of groupMembers) {
      const g = byId.get(m.group_id);
      if (g.layouts && !g.layouts.includes(layout)) continue;
      if (shown.has(m.item_id)) continue;
      if (!positioned.has(`${m.group_id}|${layout}|${m.item_id}`)) {
        throw new Error(`group seed: member without a position — ${m.group_id} ${m.item_id} on ${layout}`);
      }
    }
    for (const e of lexicon.entries) {
      if (!reach.get(layout).has(sid(e.slot))) {
        throw new Error(`group seed: missing route — "${e.spokenText}" is on no home board or group on ${layout}`);
      }
    }
  }
}
