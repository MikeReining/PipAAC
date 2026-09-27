// Resolve a group seed (data/group_seed*.json) to sense ids, the way
// buildGroups does, plus 026's two proposal fields: "word#slot" picks one
// sense of a two-meaning word, and `layouts` limits where a door shows.
// Shared by the 026 measure script and review page until slice 1 moves
// both fields into buildGroups itself.
import { normalizeV1 } from '../../public/shared/normalize.mjs';

export const sid = (slot) => `sns_${String(slot).padStart(4, '0')}`;

export function seedResolver(lexEntries, catalog) {
  const bySlot = new Map(lexEntries.map((e) => [e.slot, e]));
  const byNorm = new Map();
  for (const e of lexEntries) {
    const n = normalizeV1(e.spokenText);
    byNorm.set(n, [...(byNorm.get(n) ?? []), e]);
  }
  const home = {};
  for (const L of Object.keys(catalog.layouts)) {
    home[L] = new Set(catalog.coreCells.filter((c) => c.layout === L).map((c) => c.sense_id));
  }

  function resolve(word, ctx) {
    const [w, slot] = word.split('#');
    if (slot) {
      const e = bySlot.get(Number(slot));
      if (!e || normalizeV1(e.spokenText) !== normalizeV1(w)) throw new Error(`${ctx}: "${word}" — slot is not that word`);
      return sid(e.slot);
    }
    const hits = byNorm.get(normalizeV1(w)) ?? [];
    if (hits.length !== 1) throw new Error(`${ctx}: "${word}" resolves to ${hits.length} senses (want 1; use word#slot)`);
    return sid(hits[0].slot);
  }

  function members(g) {
    if (g.words) return g.words.map((w) => resolve(w, g.key));
    if (g.category) {
      const ex = new Set((g.except ?? []).map((w) => resolve(w, `${g.key}.except`)));
      return lexEntries.filter((e) => e.category === g.category).map((e) => sid(e.slot)).filter((s) => !ex.has(s));
    }
    if (g.sector) {
      const { layout, cols, excludeLayout } = g.sector;
      const w = catalog.layouts[layout].cols;
      return catalog.coreCells
        .filter((c) => c.layout === layout && c.slot_index % w >= cols[0] && c.slot_index % w <= cols[1]
          && !home[excludeLayout].has(c.sense_id))
        .sort((a, b) => a.slot_index - b.slot_index).map((c) => c.sense_id);
    }
    return [];
  }

  /** sense id -> Set(group key), counting only doors shown on `layout`. */
  function doorsOn(seed, layout) {
    const m = new Map();
    for (const g of seed.groups) {
      if (g.layouts && !g.layouts.includes(layout)) continue;
      for (const s of members(g)) m.set(s, new Set([...(m.get(s) ?? []), g.key]));
    }
    return m;
  }

  return { resolve, members, doorsOn, home };
}
