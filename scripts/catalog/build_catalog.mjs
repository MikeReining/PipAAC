#!/usr/bin/env node
/**
 * Regenerate data/catalog/catalog.json from:
 *   - data/launch_lexicon.json   (derived from docs/product/Initial_Vocabulary_600.md)
 *   - docs/product/Core_Coordinate_Map.md  (truth owner for slot assignments)
 *   - assets/symbols/            (approved clipart → image rows + public/symbols/)
 *
 *   node scripts/catalog/build_catalog.mjs
 *   node scripts/catalog/build_catalog.mjs --check
 *
 * Ids are deterministic (schema doc §4): sns_/utt_/lbl_ from the catalog slot,
 * cel_ from layout + slot_index. The shipped file contains catalog tables only
 * — never device rows.
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { normalizeV1 } from "../../public/shared/normalize.mjs";
import { buildGroups } from "./build_groups.mjs";
import { checkSymbolEmission, emitSymbols } from "./symbol_emit.mjs";
import { getTileVoiceByKey } from "./tile_voices.mjs";
import {
  DEFAULT_AUDIO_CACHE_ROOT,
  DEFAULT_AUDIO_IMPORT_PATH,
  DEFAULT_GENERATED_AUDIO_PATH,
  DEFAULT_LEXICON_PATH,
  repoRoot,
} from "./paths.mjs";

const MAP_MD = join(repoRoot, "docs/product/Core_Coordinate_Map.md");
const SCHEMA_SQL = join(repoRoot, "src/board/schema.sql");
const TOPIC_SEED = join(repoRoot, "data/group_seed.topics.json");
const OCCASION_SEED = join(repoRoot, "data/group_seed.occasions.json");
const FAMILY_SEED = join(repoRoot, "data/family_seed.json");
const NUMBER_ALIASES = join(repoRoot, "data/number_aliases.json");
const FORMS_DATA = join(repoRoot, "data/forms/en.json");
const COACH_TIPS = join(repoRoot, "data/coach_tips.json");
const FEELING_VOICE = join(repoRoot, "data/catalog/feeling_voice.json");
const GROUP_STARTERS = join(repoRoot, "data/prediction/door_starters.en.json");
const WORD_FREQ = join(repoRoot, "data/prediction/word_frequency.en.json");
const CATALOG_OUT = join(repoRoot, "data/catalog/catalog.json");
const PUBLIC_AUDIO_ROOT = join(repoRoot, "public");
const SYMBOLS_ROOT = join(repoRoot, "assets/symbols");
const SYMBOL_EXT_PREF = [".png", ".svg", ".jpg", ".jpeg"];
const DEFAULT_VOICE_ID = "voi_default_en";
const CATALOG_SCHEMA_VERSION = 1;

/* 028 slice 6 — extra bundled voices ship when their audio plan exists.
 * The plan is written by publish_leo_seed.mjs after the voice's launch
 * takes are minted and uploaded. A voice whose plan misses any launch
 * utterance fails the shipped (strict) build — a half-seeded voice
 * would leave tiles silent, which is exactly the slice-6 gate. */
const EXTRA_VOICES = [
  {
    id: "voi_leo_en",
    audioPlan: join(repoRoot, "data/catalog/generated_audio.leo.json"),
    formsPlan: join(repoRoot, "data/catalog/forms_audio.leo.json"),
    clipNs: "leo",
  },
];

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
        features: null,
        default_for_text: 1,
        status: "approved",
      });
    }
  }
  return out;
}

/**
 * Form labels (021 slice 1, schema doc §5.3): data/forms/en.json is the
 * CHILDES-measured source — which lemmas carry which forms and how each
 * surface is spelled. Each row becomes a kind='form' label on the
 * lemma's sense; the form's utterance reuses an existing row when the
 * normalized surface already exists ("has" shares the has utterance)
 * and mints utt_fNNNN/lbl_fNNNN ids otherwise.
 *
 * Ids are stable BY TEXT (022): the prior catalog's utt_f/lbl_f ids are
 * reused for the same normalized surface, so adding form rows never
 * renumbers existing utterances — a clip keyed to utt_f0045 "wants"
 * must keep meaning "wants". New surfaces mint fresh ids past the
 * prior max. (Sorting by (slot, features) alone did NOT give this —
 * an inserted row shifted every later id.)
 */
function buildFormLabels(lexicon, formsData, ownerSlotByNorm, utterances, prior = null) {
  const priorUtt = new Map();  // normalized text -> utt_fNNNN
  const priorLbl = new Map();  // "norm|features" -> lbl_fNNNN
  let seq = 0;
  for (const u of prior?.utterances ?? []) {
    if (u.id.startsWith("utt_f")) {
      priorUtt.set(u.normalized_spoken_text, u.id);
      seq = Math.max(seq, Number(u.id.slice(5)));
    }
  }
  for (const l of prior?.labels ?? []) {
    if (l.id.startsWith("lbl_f")) {
      priorLbl.set(`${l.normalized_text}|${l.features}`, l.id);
      seq = Math.max(seq, Number(l.id.slice(5)));
    }
  }
  const mint = () => `f${String(++seq).padStart(4, "0")}`;
  const entryByNorm = new Map();
  for (const e of lexicon.entries) {
    const n = normalizeV1(e.spokenText);
    if (!entryByNorm.has(n)) entryByNorm.set(n, []);
    entryByNorm.get(n).push(e);
  }
  const resolve = (lemma) => {
    const hits = entryByNorm.get(normalizeV1(lemma)) ?? [];
    if (hits.length !== 1) {
      throw new Error(`forms: lemma "${lemma}" resolves to ${hits.length} senses (want exactly 1)`);
    }
    return hits[0];
  };
  const rows = formsData.forms
    .map((f) => ({ ...f, entry: resolve(f.lemma) }))
    .sort((a, b) => a.entry.slot - b.entry.slot || a.features.localeCompare(b.features));

  const uttByNorm = new Map(utterances.map((u) => [u.normalized_spoken_text, u.id]));
  const labels = [];
  for (const f of rows) {
    const norm = normalizeV1(f.text);
    let uttId = uttByNorm.get(norm);
    if (!uttId) {
      uttId = priorUtt.get(norm) ?? `utt_${mint()}`;
      if (!uttByNorm.has(norm)) {
        utterances.push({
          id: uttId, locale: "en", spoken_text: f.text,
          normalized_spoken_text: norm, normalizer_version: "v1",
        });
      }
      uttByNorm.set(norm, uttId);
    }
    labels.push({
      id: priorLbl.get(`${norm}|${f.features}`) ?? `lbl_${mint()}`,
      sense_id: `sns_${pad4(f.entry.slot)}`,
      utterance_id: uttId,
      locale: "en",
      text: f.text,
      normalized_text: norm,
      normalizer_version: "v1",
      kind: "form",
      part_of_speech: f.entry.partOfSpeech,
      features: f.features,
      default_for_text: 0,
      status: "approved",
    });
  }
  return labels;
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
  groupSeed = {
    topics: JSON.parse(readFileSync(TOPIC_SEED, "utf8")),
    occasions: JSON.parse(readFileSync(OCCASION_SEED, "utf8")),
  },
  numberAliases = JSON.parse(readFileSync(NUMBER_ALIASES, "utf8")),
  familySeed = JSON.parse(readFileSync(FAMILY_SEED, "utf8")),
  { allowMissingFormClips = true, images: givenImages = null } = {},
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

  const images = givenImages ?? buildImages(lexicon).images;
  const imageBySense = new Map(images.map((i) => [i.sense_id, i.id]));

  const senses = lexicon.entries.map((e) => ({
    id: `sns_${pad4(e.slot)}`,
    fitzgerald_role: e.fitzgeraldColor,
    art_archetype: e.visualStyle,
    tier: e.tier === 1 ? "root_core" : "primary_fringe",
    category: e.category,
    default_image_id: imageBySense.get(`sns_${pad4(e.slot)}`) ?? null,
    // R21 / Motor_Grid §2.2 rule 3: "no" words are a catalog attribute —
    // the Predict "no" slot reads this flag, never a hand-kept list.
    negation: e.negation ? 1 : 0,
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
    features: null,
    default_for_text: ownerSlotByNorm.get(normalizeV1(e.spokenText)) === e.slot ? 1 : 0,
    status: "approved",
  }));
  labels.push(...buildDigitAliases(lexicon, numberAliases));
  const formsData = existsSync(FORMS_DATA) ? JSON.parse(readFileSync(FORMS_DATA, "utf8")) : null;
  const priorCatalog = existsSync(CATALOG_OUT) ? JSON.parse(readFileSync(CATALOG_OUT, "utf8")) : null;
  if (formsData) {
    labels.push(...buildFormLabels(lexicon, formsData, ownerSlotByNorm, utterances, priorCatalog));
  }

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
  // 026: topic members fill their band columns most-said first —
  // CHILDES child-line counts, built by
  // scripts/prediction/childes/word_frequency.mjs. A checkout without
  // the table falls back to the seed's authored order.
  const wordFreq = existsSync(WORD_FREQ)
    ? JSON.parse(readFileSync(WORD_FREQ, "utf8")).counts
    : {};
  const { groups, groupMembers, groupCells, groupLabels, groupLayouts } = buildGroups(
    lexicon, groupSeed.topics, groupSeed.occasions,
    { locales: catalogLocales, layouts, coreCells, wordFreq },
  );
  for (const [name, g] of Object.entries(groupLayouts)) layouts[name].frame = g.frame;
  const { families, familyItems } = buildFamilies(lexicon, familySeed, mapLayouts);

  return {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    source: {
      lexicon: "data/launch_lexicon.json",
      coordinateMap: "docs/product/Core_Coordinate_Map.md",
      schema: "src/board/schema.sql",
      groupSeed: ["data/group_seed.topics.json", "data/group_seed.occasions.json"],
      wordFrequency: "data/prediction/word_frequency.en.json",
      numberAliases: "data/number_aliases.json",
      forms: "data/forms/en.json",
      phraseTable: "data/prediction/phrase_table.en.json",
      feelingVoice: "data/catalog/feeling_voice.json",
    },
    // 013 § 5a coach view: shipped one-line modeling tips by sense id;
    // a list item's SLP-edited tip overrides them.
    coachTips: existsSync(COACH_TIPS)
      ? Object.fromEntries(
          Object.entries(JSON.parse(readFileSync(COACH_TIPS, "utf8")))
            .filter(([k]) => !k.startsWith("_")),
        )
      : {},
    // 027 § 5: first-word counts per group from real children, when the
    // corrected CHILDES builder has run (door_starters.mjs, local cache);
    // absent, the bar starts from the child's own first picks.
    ...(existsSync(GROUP_STARTERS) ? { groupStarters: JSON.parse(readFileSync(GROUP_STARTERS, "utf8")) } : {}),
    // 025 § 3: the lit-face suggestion map (sense id -> feeling).
    feelingVoice: JSON.parse(readFileSync(FEELING_VOICE, "utf8")),
    // The bundle is the full device bootstrap: DDL plus rows, one fetch.
    schemaSql: readFileSync(SCHEMA_SQL, "utf8"),
    layouts,
    senses,
    utterances,
    labels,
    images,
    voices: [
      {
        id: DEFAULT_VOICE_ID,
        locale: "en",
        // Names live in tile_voices.json with the ElevenLabs voice ids.
        display_name: getTileVoiceByKey(DEFAULT_VOICE_ID).display_name,
        source: "bundled",
        engine_id: null,
        is_default: 1,
        status: "active",
      },
      ...EXTRA_VOICES.filter((v) => existsSync(v.audioPlan)).map((v) => ({
        id: v.id,
        locale: "en",
        display_name: getTileVoiceByKey(v.id).display_name,
        source: "bundled",
        engine_id: null,
        is_default: 0,
        status: "active",
      })),
    ],
    clips: buildClips(lexicon, entryBySlot, ownerSlotByNorm, slotsByNorm,
      utterances.filter((u) => u.id.startsWith("utt_f")), allowMissingFormClips),
    coreCells,
    // Stamped on each install marker (027 § 3.3) — which seed a device
    // installed; a newer seed never re-installs a marked group.
    groupSeedVersion: `${groupSeed.topics.version}.${groupSeed.occasions.version}`,
    groups,
    groupMembers,
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
function buildClips(lexicon, entryBySlot, ownerSlotByNorm, slotsByNorm, formUtterances = [], allowMissingFormClips = false) {
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

  // 021 slice 2: the form utterances (utt_f####) clip by utterance id —
  // forms_audio.json is produced by scripts/catalog/forms_audio.mjs
  // (WorkbookBench catalog first, ElevenLabs for the rest).
  const formsAudio = join(repoRoot, "data/catalog/forms_audio.json");
  if (existsSync(formsAudio) && formUtterances.length) {
    const plan = JSON.parse(readFileSync(formsAudio, "utf8"));
    const byUtt = new Map((plan.entries ?? []).map((e) => [e.utterance_id, e]));
    for (const u of formUtterances) {
      const e = byUtt.get(u.id);
      // The clip binds (id, surface): a forms-data change can remint an
      // utt_f#### id onto a different word — a plan entry whose recorded
      // text no longer matches is stale and must not be applied.
      if (!e?.clip?.key || e.spoken_text !== u.spoken_text) {
        if (!allowMissingFormClips) {
          throw new Error(`form utterance ${u.id} ("${u.spoken_text}") has no clip — run forms_audio.mjs`);
        }
        continue; // fixture/resolve builds only — the shipped CLI stays strict
      }
      const srcFile = join(DEFAULT_AUDIO_CACHE_ROOT, e.clip.key);
      if (!existsSync(srcFile)) {
        throw new Error(`forms audio references missing file: ${e.clip.key} — rerun forms_audio.mjs`);
      }
      const dest = join(PUBLIC_AUDIO_ROOT, e.clip.key);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(srcFile, dest);
      clips.push({
        id: `clp_${u.id.slice(4)}`,
        voice_id: DEFAULT_VOICE_ID,
        utterance_id: u.id,
        recorded_text: u.spoken_text,
        key: e.clip.key,
        status: "ready",
        sha256: e.clip.sha256,
        source: e.clip.source ?? null,
      });
    }
  }

  /* 028 slice 6 — an extra voice's clips mirror the default layout:
   * lemma clips by owner slot, form clips by utt_f#### id, clip ids
   * namespaced `clp_<ns>_…` so Pip's ids never move. A shipped voice is
   * all-or-nothing: the strict build throws on any uncovered launch
   * utterance or form surface. */
  for (const v of EXTRA_VOICES) {
    if (!existsSync(v.audioPlan)) continue;
    const vClipBySlot = new Map();
    for (const e of JSON.parse(readFileSync(v.audioPlan, "utf8")).entries ?? []) {
      if (e.clip?.key) vClipBySlot.set(e.slot, e.clip);
    }
    for (const [norm, slots] of slotsByNorm) {
      const clipSlot = slots.find((s) => vClipBySlot.has(s));
      if (clipSlot === undefined) {
        if (!allowMissingFormClips) {
          const word = entryBySlot.get(ownerSlotByNorm.get(norm))?.spokenText ?? norm;
          throw new Error(`${v.id} coverage gap: no clip for "${word}" — run publish_leo_seed.mjs`);
        }
        continue;
      }
      const clip = vClipBySlot.get(clipSlot);
      const srcFile = join(DEFAULT_AUDIO_CACHE_ROOT, clip.key);
      if (!existsSync(srcFile)) {
        throw new Error(`${v.id} audio plan references missing file: ${clip.key} — run publish_leo_seed.mjs`);
      }
      const dest = join(PUBLIC_AUDIO_ROOT, clip.key);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(srcFile, dest);
      const ownerSlot = ownerSlotByNorm.get(norm);
      clips.push({
        id: `clp_${v.clipNs}_${String(clipSlot).padStart(4, "0")}`,
        voice_id: v.id,
        utterance_id: `utt_${String(ownerSlot).padStart(4, "0")}`,
        recorded_text: entryBySlot.get(ownerSlot).spokenText,
        key: clip.key,
        status: "ready",
        sha256: clip.sha256,
        source: clip.source,
      });
    }
    if (existsSync(v.formsPlan)) {
      const plan = JSON.parse(readFileSync(v.formsPlan, "utf8"));
      const byUtt = new Map((plan.entries ?? []).map((e) => [e.utterance_id, e]));
      for (const u of formUtterances) {
        const e = byUtt.get(u.id);
        if (!e?.clip?.key || e.spoken_text !== u.spoken_text) {
          if (!allowMissingFormClips) {
            throw new Error(`${v.id}: form utterance ${u.id} ("${u.spoken_text}") has no clip — run publish_leo_seed.mjs`);
          }
          continue;
        }
        const srcFile = join(DEFAULT_AUDIO_CACHE_ROOT, e.clip.key);
        if (!existsSync(srcFile)) {
          throw new Error(`${v.id} forms audio references missing file: ${e.clip.key} — run publish_leo_seed.mjs`);
        }
        const dest = join(PUBLIC_AUDIO_ROOT, e.clip.key);
        mkdirSync(dirname(dest), { recursive: true });
        copyFileSync(srcFile, dest);
        clips.push({
          id: `clp_${v.clipNs}_${u.id.slice(4)}`,
          voice_id: v.id,
          utterance_id: u.id,
          recorded_text: u.spoken_text,
          key: e.clip.key,
          status: "ready",
          sha256: e.clip.sha256,
          source: e.clip.source ?? null,
        });
      }
    } else if (formUtterances.length && !allowMissingFormClips) {
      throw new Error(`${v.id}: no forms plan at ${v.formsPlan} — run mint_leo_forms.mjs, then publish_leo_seed.mjs`);
    }
  }
  return clips;
}

/**
 * Image rows + emit jobs: approved clipart lives in
 * assets/symbols/<word>.<ext> — the art-generator contract (SKILL §7)
 * lands a file there only when it is approved, so every canonical file
 * ships as status 'approved'. `_rollN` files are review alternates and
 * never ship. Matching is on spoken text with underscores read as spaces
 * (wet_wipe → "wet wipe"); when several extensions exist for one word,
 * the first in SYMBOL_EXT_PREF wins.
 *
 * 037: the shipped file is a transcode of the master — raster masters
 * emit as <word>.webp, SVGs copy byte-for-byte. `image.sha256` keeps
 * hashing the master (the approval identity); `image.key` names the
 * shipped file. Pure: no writes — emitSymbols owns public/symbols/ so
 * `--check` stays read-only.
 */
function buildImages(lexicon) {
  const images = [];
  const jobs = [];
  if (!existsSync(SYMBOLS_ROOT)) return { images, jobs };
  const fileByWord = new Map(); // spokenText -> filename (preferred ext wins)
  for (const file of readdirSync(SYMBOLS_ROOT)) {
    if (/_roll\d*\./.test(file)) continue;
    const ext = file.slice(file.lastIndexOf("."));
    if (!SYMBOL_EXT_PREF.includes(ext)) continue;
    const word = file.slice(0, -ext.length).replace(/_/g, " ");
    const prev = fileByWord.get(word);
    const prevPref = prev
      ? SYMBOL_EXT_PREF.indexOf(prev.slice(prev.lastIndexOf(".")))
      : -1;
    if (!prev || SYMBOL_EXT_PREF.indexOf(ext) < prevPref) {
      fileByWord.set(word, file);
    }
  }
  for (const e of lexicon.entries) {
    const file = fileByWord.get(e.spokenText) ?? fileByWord.get(e.spokenText.toLowerCase());
    if (!file) continue;
    const bytes = readFileSync(join(SYMBOLS_ROOT, file));
    const masterSha256 = createHash("sha256").update(bytes).digest("hex");
    const ext = file.slice(file.lastIndexOf("."));
    const stem = file.slice(0, -ext.length);
    const shipped = ext === ".svg" ? file : `${stem}.webp`;
    images.push({
      id: `img_${pad4(e.slot)}`,
      sense_id: `sns_${pad4(e.slot)}`,
      key: `symbols/${shipped}`,
      status: "approved",
      sha256: masterSha256,
    });
    jobs.push({ key: `symbols/${shipped}`, masterFile: file, masterSha256, stem });
  }
  return { images, jobs };
}

async function main() {
  const check = process.argv.includes("--check");
  const lexicon = JSON.parse(readFileSync(DEFAULT_LEXICON_PATH, "utf8"));
  const map = parseCoordinateMapMarkdown(readFileSync(MAP_MD, "utf8"));
  // One symbol scan serves both the rows and the emit jobs — hashing
  // ~700 masters twice per build is the waste this avoids.
  const { images, jobs } = buildImages(lexicon);
  // The shipped artifact stays strict — every form utterance needs a
  // clip (021 slice 2). Library callers (tests, resolvers) get the
  // permissive default and clip-less utterances speak device voice.
  const catalog = buildCatalog(lexicon, map,
    undefined, undefined, undefined, { allowMissingFormClips: false, images });

  if (check) {
    const failures = checkSymbolEmission(jobs);
    const existing = JSON.parse(readFileSync(CATALOG_OUT, "utf8"));
    if (JSON.stringify(existing) !== JSON.stringify(catalog)) {
      failures.unshift("catalog.json is stale — run build_catalog.mjs");
    }
    const served = join(repoRoot, "public/catalog.json");
    if (!existsSync(served)
        || readFileSync(served, "utf8") !== `${JSON.stringify(catalog, null, 2)}\n`) {
      failures.unshift("public/catalog.json is stale — run build_catalog.mjs");
    }
    if (failures.length) {
      for (const f of failures) console.error(`check: ${f}`);
      process.exit(1);
    }
    console.log(`catalog.json OK (${catalog.senses.length} senses, ${catalog.coreCells.length} cells, ${jobs.length} symbols)`);
    return;
  }

  writeFileSync(CATALOG_OUT, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  // The Worker serves /catalog.json from public/ (static asset — the file
  // is too big to import into the worker bundle; DOs OOM'd, 2026-09-30).
  writeFileSync(join(repoRoot, "public/catalog.json"),
    `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  await emitSymbols(jobs);
  console.log(
    `Wrote ${CATALOG_OUT} (${catalog.senses.length} senses, ${catalog.coreCells.length} core cells)`,
  );
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
