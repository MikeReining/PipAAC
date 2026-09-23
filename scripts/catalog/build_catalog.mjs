#!/usr/bin/env node
/**
 * Regenerate data/catalog/catalog.json from:
 *   - data/launch_lexicon.json   (derived from docs/product/Initial_Vocabulary_600.md)
 *   - docs/product/Core_Coordinate_Map.md  (truth owner for slot assignments)
 *
 *   node scripts/catalog/build_catalog.mjs
 *   node scripts/catalog/build_catalog.mjs --check
 *
 * Ids are deterministic (schema doc §4): sns_/utt_/lbl_ from the catalog slot,
 * cel_ from layout + slot_index. The shipped file contains catalog tables only
 * — never device rows.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { normalizeV1 } from "../../public/shared/normalize.mjs";
import {
  DEFAULT_AUDIO_CACHE_ROOT,
  DEFAULT_AUDIO_IMPORT_PATH,
  DEFAULT_GENERATED_AUDIO_PATH,
  DEFAULT_LEXICON_PATH,
  repoRoot,
} from "./paths.mjs";

const MAP_MD = join(repoRoot, "docs/product/Core_Coordinate_Map.md");
const SCHEMA_SQL = join(repoRoot, "src/board/schema.sql");
const GROUP_SEED = join(repoRoot, "data/group_seed.json");
const FAMILY_SEED = join(repoRoot, "data/family_seed.json");
const NUMBER_ALIASES = join(repoRoot, "data/number_aliases.json");
const PREDICTION_DEFAULTS = join(repoRoot, "data/prediction/defaults.json");
const CATALOG_OUT = join(repoRoot, "data/catalog/catalog.json");
const PUBLIC_AUDIO_ROOT = join(repoRoot, "public");
const DEFAULT_VOICE_ID = "voi_default_en";
const CATALOG_SCHEMA_VERSION = 1;
const ITEMS_PER_PAGE = 57; // group page slots 2..58

const pad4 = (n) => String(n).padStart(4, "0");

// A layout header may carry its shape — `## 6. `grid15` — Core 15
// starter (5 × 3)`; without it the layout is ten columns (grid60/90).
const MAP_SECTION_RE = /^## \d+\.\s+`?(grid\d+)`?[^\n]*?\((\d+)\s*×\s*(\d+)\)|^## \d+\.\s+`?(grid\d+)`?/;
const MAP_ROW_RE = /^\|\s*\d+\s*\|\s*(.+?)\s*\|$/;
const ANCHOR_KINDS = { reserved: "reserved", Groups: "groups" };

/**
 * Parse the slot tables out of the coordinate map doc.
 * @returns {{ layouts: Record<string, { cols: number, rows: number, anchors: object[], cells: string[] }> }}
 *   `cells` is a row-major array of spoken words; anchors carry { slot, kind }.
 */
export function parseCoordinateMapMarkdown(raw) {
  const layouts = {};
  let current = null;

  for (const line of raw.split("\n")) {
    const section = MAP_SECTION_RE.exec(line);
    if (section) {
      current = section[1] ?? section[4];
      layouts[current] = {
        cells: [], anchors: [],
        cols: section[2] ? Number(section[2]) : 10,
        rows: section[3] ? Number(section[3]) : null,
      };
      continue;
    }
    if (line.startsWith("## ")) {
      current = null;
      continue;
    }
    if (!current) continue;

    const row = MAP_ROW_RE.exec(line);
    if (!row) continue;
    for (const token of row[1].split("·").map((t) => t.trim())) {
      const slot = layouts[current].cells.length + layouts[current].anchors.length;
      if (token in ANCHOR_KINDS) {
        layouts[current].anchors.push({ slot, kind: ANCHOR_KINDS[token] });
      } else if (token === "?" || token.endsWith("▸")) {
        // A family tile (014 § 5): `?` or a named `X ▸` tile opens its
        // Smart bar family. The ref resolves to a family_seed key at
        // build time — the map never carries an id.
        layouts[current].anchors.push({
          slot, kind: "family", ref: token === "?" ? "?" : token.replace(/▸\s*$/, "").trim(),
        });
      } else {
        layouts[current].cells.push({ slot, word: token });
      }
    }
  }
  return layouts;
}

/**
 * Emit board_group + group_cell + group_label seed rows from
 * data/group_seed.json. File order is the default index order (slots 10..).
 * Members are senses at fixed cells: member i → page floor(i/57),
 * slot 2 + i % 57. Group display names ship in `groupLabels` keyed by
 * locale — board_group.name is the caregiver override, never the seed.
 * Throws on any violation — the build is the gate that keeps every
 * catalog word reachable in at least one built-in group, and every group
 * named in every locale the catalog ships.
 */
export function buildGroups(lexicon, seed, locales = ["en"], mapLayouts = {}) {
  const byNorm = new Map();
  for (const e of lexicon.entries) {
    const n = normalizeV1(e.spokenText);
    if (!byNorm.has(n)) byNorm.set(n, []);
    byNorm.get(n).push(e);
  }
  const resolve = (word, ctx) => {
    const hits = byNorm.get(normalizeV1(word)) ?? [];
    if (hits.length !== 1) {
      throw new Error(
        `group seed ${ctx}: "${word}" resolves to ${hits.length} lexicon senses (want exactly 1)`,
      );
    }
    return `sns_${pad4(hits[0].slot)}`;
  };

  const groups = [];
  const groupCells = [];
  const groupLabels = [];
  const memberOf = new Map(); // sense_id -> Set(group key)
  const excepted = []; // [{ key, word, senseId }]
  const seenKeys = new Set();

  seed.groups.forEach((g, gi) => {
    if (!/^[a-z_]+$/.test(g.key)) {
      throw new Error(`group seed: key "${g.key}" must match ^[a-z_]+$`);
    }
    if (seenKeys.has(g.key)) throw new Error(`group seed: duplicate key "${g.key}"`);
    seenKeys.add(g.key);
    if ([g.category, g.words, g.sector].filter(Boolean).length > 1) {
      throw new Error(`group seed ${g.key}: category, words and sector are mutually exclusive`);
    }
    if (!g.names || typeof g.names !== "object") {
      throw new Error(`group seed ${g.key}: names must be a per-locale map`);
    }
    for (const loc of locales) {
      if (typeof g.names[loc] !== "string" || g.names[loc].length === 0) {
        throw new Error(`group seed ${g.key}: no name for shipped locale "${loc}"`);
      }
    }
    const id = `grp_${g.key}`;
    groups.push({
      id,
      kind: g.key === "my_words" ? "my_words" : "builtin",
      glyph: g.glyph ?? null,
      index_slot: 10 + gi,
      category: g.category ?? null,
    });
    for (const loc of locales) {
      groupLabels.push({ group_id: id, locale: loc, text: g.names[loc] });
    }

    let memberIds = [];
    if (g.category) {
      const excluded = new Set(
        (g.except ?? []).map((w) => {
          const sid = resolve(w, `${g.key}.except`);
          excepted.push({ key: g.key, word: w, senseId: sid });
          return sid;
        }),
      );
      memberIds = lexicon.entries
        .filter((e) => e.category === g.category)
        .sort((a, b) => a.slot - b.slot)
        .map((e) => `sns_${pad4(e.slot)}`)
        .filter((sid) => !excluded.has(sid));
    } else if (g.words) {
      memberIds = g.words.map((w) => resolve(w, `${g.key}.words`));
    } else if (g.sector) {
      // The § 3.1 grammar groups: every `grid60` cell in these column
      // bands that the starter (`excludeLayout`) doesn't already hold —
      // derived from the coordinate map, never a hand-copied list.
      const lay = mapLayouts[g.sector.layout];
      const excl = new Set(
        (mapLayouts[g.sector.excludeLayout]?.cells ?? []).map((c) => normalizeV1(c.word)),
      );
      if (!lay) throw new Error(`group seed ${g.key}: unknown sector layout ${g.sector.layout}`);
      memberIds = lay.cells
        .filter((c) => c.slot % lay.cols >= g.sector.cols[0]
          && c.slot % lay.cols <= g.sector.cols[1]
          && !excl.has(normalizeV1(c.word)))
        .sort((a, b) => a.slot - b.slot)
        .map((c) => resolve(c.word, `${g.key}.sector`));
    }
    if (memberIds.length > ITEMS_PER_PAGE) {
      throw new Error(
        `group seed ${g.key}: ${memberIds.length} members exceeds one page (${ITEMS_PER_PAGE}) — split it`,
      );
    }
    memberIds.forEach((sid, i) => {
      groupCells.push({
        group_id: id,
        item_kind: "sense",
        item_id: sid,
        page: Math.floor(i / ITEMS_PER_PAGE),
        slot_index: 2 + (i % ITEMS_PER_PAGE),
      });
      if (!memberOf.has(sid)) memberOf.set(sid, new Set());
      memberOf.get(sid).add(g.key);
    });
  });

  // Reachability gates: every categorized sense is in a built-in group,
  // and every excepted word landed in some other group.
  for (const e of lexicon.entries) {
    if (e.category && !memberOf.has(`sns_${pad4(e.slot)}`)) {
      throw new Error(
        `group seed: "${e.spokenText}" (${e.category}) lands in no built-in group`,
      );
    }
  }
  for (const x of excepted) {
    if (!memberOf.has(x.senseId)) {
      throw new Error(`group seed: "${x.word}" is excepted from ${x.key} but lands in no other group`);
    }
  }

  return { groups, groupCells, groupLabels };
}

/**
 * Digit alias labels (schema doc § 13.3 — the one allowed alias kind).
 * Each digit string resolves through its locale's lemma to exactly one
 * Number sense and points at the lemma's utterance, so typing `3` plays
 * the bundled clip for *three*. Fails the build on zero or ambiguous hits.
 */
export function buildDigitAliases(lexicon, numberAliases) {
  const ownerSlotByNorm = new Map();
  for (const e of lexicon.entries) {
    const n = normalizeV1(e.spokenText);
    ownerSlotByNorm.set(n, Math.min(ownerSlotByNorm.get(n) ?? Infinity, e.slot));
  }
  const out = [];
  for (const [loc, digits] of Object.entries(numberAliases.locales ?? {})) {
    for (const [digit, word] of Object.entries(digits)) {
      const hits = lexicon.entries.filter(
        (e) => e.partOfSpeech === "Number" && normalizeV1(e.spokenText) === normalizeV1(word),
      );
      if (hits.length !== 1) {
        throw new Error(
          `number alias "${digit}"→"${word}" (${loc}) resolves to ${hits.length} Number senses (want exactly 1)`,
        );
      }
      out.push({
        id: `lbl_alias_${loc}_${digit}`,
        sense_id: `sns_${pad4(hits[0].slot)}`,
        utterance_id: `utt_${pad4(ownerSlotByNorm.get(normalizeV1(word)))}`,
        locale: loc,
        text: digit,
        normalized_text: normalizeV1(digit),
        normalizer_version: "v1",
        kind: "alias",
        part_of_speech: "Number",
        default_for_text: 1,
        status: "approved",
      });
    }
  }
  return out;
}

/** Smart bar families (014 § 5): seed → catalog rows, and the map's
 *  family anchors (`?`, `X ▸`) resolve to family ids here. An anchor
 *  naming no seeded family fails the build — a dead tile is a lie on
 *  the coordinate map. */
function buildFamilies(lexicon, seed, mapLayouts) {
  const senseIdByWord = new Map();
  for (const e of lexicon.entries) {
    if (e.tier === 1) senseIdByWord.set(normalizeV1(e.spokenText), `sns_${pad4(e.slot)}`);
  }
  const families = [];
  const familyItems = [];
  const byToken = new Map();
  const byKey = new Map();
  for (const f of seed.families ?? []) {
    if (byKey.has(f.key)) throw new Error(`family seed: duplicate key "${f.key}"`);
    byKey.set(f.key, f);
    if (f.token) byToken.set(f.token, `bf_${f.key}`);
  }
  for (const f of seed.families ?? []) {
    const id = `bf_${f.key}`;
    families.push({
      id, name: f.names?.en ?? f.glyph ?? f.key,
      glyph: f.glyph ?? null, speaks: f.speaks ?? null,
    });
    (f.items ?? []).forEach((it, i) => {
      if (it.kind === "family") {
        if (!byKey.has(it.key)) throw new Error(`family ${f.key}: unknown chained family ${it.key}`);
        familyItems.push({ family_id: id, position: i, item_kind: "family", item_id: `bf_${it.key}` });
        return;
      }
      const sid = it.kind === "entity" ? it.id : senseIdByWord.get(normalizeV1(it.word));
      if (!sid) throw new Error(`family ${f.key} item ${i}: "${it.word ?? it.id}" resolves to nothing`);
      familyItems.push({ family_id: id, position: i, item_kind: it.kind, item_id: sid });
    });
  }
  // Map tokens → family ids on the anchors the parser emitted.
  for (const parsed of Object.values(mapLayouts)) {
    for (const a of parsed.anchors) {
      if (a.kind !== "family") continue;
      const fid = byToken.get(a.ref);
      if (!fid) throw new Error(`map family tile "${a.ref}": no seeded family has that token`);
      a.family = fid;
      delete a.ref;
    }
  }
  return { families, familyItems };
}

/** Build the catalog JSON object from lexicon entries + parsed map layouts. */
export function buildCatalog(
  lexicon,
  mapLayouts,
  groupSeed = JSON.parse(readFileSync(GROUP_SEED, "utf8")),
  numberAliases = JSON.parse(readFileSync(NUMBER_ALIASES, "utf8")),
  familySeed = JSON.parse(readFileSync(FAMILY_SEED, "utf8")),
) {
  const tier1ByWord = new Map();
  for (const e of lexicon.entries) {
    if (e.tier !== 1) continue;
    const key = normalizeV1(e.spokenText);
    if (tier1ByWord.has(key)) {
      throw new Error(`duplicate root-core spoken text: ${e.spokenText}`);
    }
    tier1ByWord.set(key, e);
  }

  const senses = lexicon.entries.map((e) => ({
    id: `sns_${pad4(e.slot)}`,
    fitzgerald_role: e.fitzgeraldColor,
    art_archetype: e.visualStyle,
    tier: e.tier === 1 ? "root_core" : "primary_fringe",
    category: e.category,
  }));

  // Senses that share a spoken text (e.g. orange the fruit / orange the color)
  // share one utterance row — utterance is UNIQUE on (locale, normalized text).
  // The lowest-slot claimant owns the row id and the default_for_text label.
  const entryBySlot = new Map(lexicon.entries.map((e) => [e.slot, e]));
  const ownerSlotByNorm = new Map();
  const slotsByNorm = new Map();
  for (const e of lexicon.entries) {
    const norm = normalizeV1(e.spokenText);
    if (!ownerSlotByNorm.has(norm)) {
      ownerSlotByNorm.set(norm, e.slot);
      slotsByNorm.set(norm, []);
    }
    slotsByNorm.get(norm).push(e.slot);
  }
  const utteranceIdFor = (e) => `utt_${pad4(ownerSlotByNorm.get(normalizeV1(e.spokenText)))}`;

  const utterances = [...ownerSlotByNorm.entries()].map(([norm, slot]) => ({
    id: `utt_${pad4(slot)}`,
    locale: "en",
    spoken_text: entryBySlot.get(slot).spokenText,
    normalized_spoken_text: norm,
    normalizer_version: "v1",
  }));
  const labels = lexicon.entries.map((e) => ({
    id: `lbl_${pad4(e.slot)}`,
    sense_id: `sns_${pad4(e.slot)}`,
    utterance_id: utteranceIdFor(e),
    locale: "en",
    text: e.spokenText,
    normalized_text: normalizeV1(e.spokenText),
    normalizer_version: "v1",
    kind: "lemma",
    part_of_speech: e.partOfSpeech,
    default_for_text: ownerSlotByNorm.get(normalizeV1(e.spokenText)) === e.slot ? 1 : 0,
    status: "approved",
  }));
  labels.push(...buildDigitAliases(lexicon, numberAliases));

  const coreCells = [];
  const layouts = {};
  for (const [layout, parsed] of Object.entries(mapLayouts)) {
    const cols = parsed.cols;
    const slots = parsed.cells.length + parsed.anchors.length;
    if (!Number.isInteger(slots / cols)) {
      throw new Error(`${layout}: ${slots} slots is not a multiple of ${cols} columns`);
    }
    if (parsed.rows !== null && slots !== cols * parsed.rows) {
      throw new Error(`${layout}: header says ${cols}×${parsed.rows} but the table has ${slots} slots`);
    }
    layouts[layout] = { cols, rows: slots / cols, anchors: parsed.anchors };
    for (const cell of parsed.cells) {
      const sense = tier1ByWord.get(normalizeV1(cell.word));
      if (!sense) {
        throw new Error(`${layout} slot ${cell.slot}: "${cell.word}" is not a root-core lexicon word`);
      }
      coreCells.push({
        id: `cel_${layout}_${String(cell.slot).padStart(3, "0")}`,
        layout,
        sense_id: `sns_${pad4(sense.slot)}`,
        slot_index: cell.slot,
      });
    }
  }

  const catalogLocales = [...new Set(labels.map((l) => l.locale))];
  const { groups, groupCells, groupLabels } = buildGroups(lexicon, groupSeed, catalogLocales, mapLayouts);
  const { families, familyItems } = buildFamilies(lexicon, familySeed, mapLayouts);

  return {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    source: {
      lexicon: "data/launch_lexicon.json",
      coordinateMap: "docs/product/Core_Coordinate_Map.md",
      schema: "src/board/schema.sql",
      groupSeed: "data/group_seed.json",
      numberAliases: "data/number_aliases.json",
      predictionDefaults: "data/prediction/defaults.json",
    },
    // Slice-3 starting weights + show-gate τ (Dual_Engine §5.3–5.4),
    // fitted on the simulation fixture by scripts/prediction/fit_defaults.mjs.
    prediction: existsSync(PREDICTION_DEFAULTS)
      ? JSON.parse(readFileSync(PREDICTION_DEFAULTS, "utf8"))
      : null,
    // The bundle is the full device bootstrap: DDL plus rows, one fetch.
    schemaSql: readFileSync(SCHEMA_SQL, "utf8"),
    layouts,
    senses,
    utterances,
    labels,
    images: [],
    voices: [
      {
        id: DEFAULT_VOICE_ID,
        locale: "en",
        display_name: "Default",
        source: "bundled",
        engine_id: null,
        is_default: 1,
        status: "active",
      },
    ],
    clips: buildClips(lexicon, entryBySlot, ownerSlotByNorm, slotsByNorm),
    coreCells,
    groups,
    groupCells,
    groupLabels,
    families,
    familyItems,
  };
}

/**
 * Clip rows: WBB catalog hits + ElevenLabs-generated misses, keyed by
 * lexicon slot. Materialized bytes are copied into public/audio/ so the
 * board can play them straight from the app shell.
 */
function buildClips(lexicon, entryBySlot, ownerSlotByNorm, slotsByNorm) {
  const clipBySlot = new Map();
  for (const path of [DEFAULT_AUDIO_IMPORT_PATH, DEFAULT_GENERATED_AUDIO_PATH]) {
    if (!existsSync(path)) continue;
    const plan = JSON.parse(readFileSync(path, "utf8"));
    for (const e of plan.entries) {
      if (e.clip?.key) clipBySlot.set(e.slot, e.clip);
    }
  }

  const clips = [];
  for (const [norm, slots] of slotsByNorm) {
    // One ready clip per shared utterance: first claimant slot with a plan hit.
    const clipSlot = slots.find((s) => clipBySlot.has(s));
    if (clipSlot === undefined) continue;
    const clip = clipBySlot.get(clipSlot);
    const srcFile = join(DEFAULT_AUDIO_CACHE_ROOT, clip.key);
    if (!existsSync(srcFile)) {
      throw new Error(`audio plan references missing file: ${clip.key} — run materialize_audio.mjs`);
    }
    const dest = join(PUBLIC_AUDIO_ROOT, clip.key);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(srcFile, dest);
    const ownerSlot = ownerSlotByNorm.get(norm);
    clips.push({
      id: `clp_${String(clipSlot).padStart(4, "0")}`,
      voice_id: DEFAULT_VOICE_ID,
      utterance_id: `utt_${String(ownerSlot).padStart(4, "0")}`,
      recorded_text: entryBySlot.get(ownerSlot).spokenText,
      key: clip.key,
      status: "ready",
      sha256: clip.sha256,
      source: clip.source,
    });
  }
  return clips;
}

function main() {
  const check = process.argv.includes("--check");
  const lexicon = JSON.parse(readFileSync(DEFAULT_LEXICON_PATH, "utf8"));
  const map = parseCoordinateMapMarkdown(readFileSync(MAP_MD, "utf8"));
  const catalog = buildCatalog(lexicon, map);

  if (check) {
    const existing = JSON.parse(readFileSync(CATALOG_OUT, "utf8"));
    if (JSON.stringify(existing) !== JSON.stringify(catalog)) {
      console.error("catalog.json is stale — run build_catalog.mjs");
      process.exit(1);
    }
    console.log(`catalog.json OK (${catalog.senses.length} senses, ${catalog.coreCells.length} cells)`);
    return;
  }

  writeFileSync(CATALOG_OUT, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  console.log(
    `Wrote ${CATALOG_OUT} (${catalog.senses.length} senses, ${catalog.coreCells.length} core cells)`,
  );
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
