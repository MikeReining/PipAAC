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
const CATALOG_OUT = join(repoRoot, "data/catalog/catalog.json");
const PUBLIC_AUDIO_ROOT = join(repoRoot, "public");
const DEFAULT_VOICE_ID = "voi_default_en";
const CATALOG_SCHEMA_VERSION = 1;
const ITEMS_PER_PAGE = 57; // group page slots 2..58

const pad4 = (n) => String(n).padStart(4, "0");

const MAP_SECTION_RE = /^## \d+\.\s+`?(grid\d+)`?/;
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
      current = section[1];
      layouts[current] = { cells: [], anchors: [] };
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
      } else {
        layouts[current].cells.push({ slot, word: token });
      }
    }
  }
  return layouts;
}

/**
 * Emit board_group + group_cell seed rows from data/group_seed.json.
 * File order is the default index order (slots 10..). Members are senses
 * at fixed cells: member i → page floor(i/57), slot 2 + i % 57. Throws on
 * any violation — the build is the gate that keeps every catalog word
 * reachable in at least one built-in group.
 */
export function buildGroups(lexicon, seed) {
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
  const memberOf = new Map(); // sense_id -> Set(group key)
  const excepted = []; // [{ key, word, senseId }]
  const seenKeys = new Set();

  seed.groups.forEach((g, gi) => {
    if (!/^[a-z_]+$/.test(g.key)) {
      throw new Error(`group seed: key "${g.key}" must match ^[a-z_]+$`);
    }
    if (seenKeys.has(g.key)) throw new Error(`group seed: duplicate key "${g.key}"`);
    seenKeys.add(g.key);
    if (g.category && g.words) {
      throw new Error(`group seed ${g.key}: category and words are mutually exclusive`);
    }
    const id = `grp_${g.key}`;
    groups.push({
      id,
      kind: g.key === "my_words" ? "my_words" : "builtin",
      name: g.name,
      glyph: g.glyph ?? null,
      index_slot: 10 + gi,
      category: g.category ?? null,
    });

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

  return { groups, groupCells };
}

/** Build the catalog JSON object from lexicon entries + parsed map layouts. */
export function buildCatalog(
  lexicon,
  mapLayouts,
  groupSeed = JSON.parse(readFileSync(GROUP_SEED, "utf8")),
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

  const coreCells = [];
  const layouts = {};
  for (const [layout, parsed] of Object.entries(mapLayouts)) {
    const cols = 10;
    const slots = parsed.cells.length + parsed.anchors.length;
    layouts[layout] = { cols, rows: slots / cols, anchors: parsed.anchors };
    if (!Number.isInteger(slots / cols)) {
      throw new Error(`${layout}: ${slots} slots is not a multiple of ${cols} columns`);
    }
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

  const { groups, groupCells } = buildGroups(lexicon, groupSeed);

  return {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    source: {
      lexicon: "data/launch_lexicon.json",
      coordinateMap: "docs/product/Core_Coordinate_Map.md",
      schema: "src/board/schema.sql",
      groupSeed: "data/group_seed.json",
    },
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
