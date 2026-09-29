/**
 * Shared ElevenLabs catalog-voice minting for tile gap-fill (CLI + review server).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  TILE_REVIEW_BATCH,
  TILE_VARIATION_IDS,
  tileTakeFilename,
  tileVariationText,
} from "./elevenlabs_tile_variations.mjs";
import { synthesizeElevenLabs } from "./elevenlabs_tts.mjs";
import { repoRoot } from "./paths.mjs";
import { getCatalogTileVoice } from "./voices.mjs";
import { tileMintTextForVariation } from "../../src/shared/tile_recipe.mjs";

/** Minted automatically when you open a word in the ElevenLabs tiles review UI. */
export const TILE_AUTO_MINT_VARIATIONS = ["plain", "period"];

export function recipesPathForBatch(batch = TILE_REVIEW_BATCH) {
  return join(repoRoot, "data/samples", batch, "recipes.json");
}

export function recipeRowForSlug(slug, batch = TILE_REVIEW_BATCH) {
  const recipesPath = recipesPathForBatch(batch);
  if (!existsSync(recipesPath)) {
    throw new Error(`missing ${recipesPath} — run build_elevenlabs_tile_queue.mjs first`);
  }
  const recipes = JSON.parse(readFileSync(recipesPath, "utf8"));
  const row = (recipes.words ?? []).find((w) => w.slug === slug);
  if (!row) throw new Error(`slug not in queue: ${slug}`);
  return { row, defaults: recipes.defaults ?? {} };
}

function loadRecipeDefaults(batch = TILE_REVIEW_BATCH) {
  const recipesPath = recipesPathForBatch(batch);
  if (!existsSync(recipesPath)) return {};
  const recipes = JSON.parse(readFileSync(recipesPath, "utf8"));
  return recipes.defaults ?? {};
}

function resolveSpokenWord(slug, batch, spokenText) {
  if (spokenText?.trim()) return spokenText.trim();
  return recipeRowForSlug(slug, batch).row.word;
}

/**
 * @param {{ batch?: string, slug: string, variationId: string, samplesRoot?: string, spokenText?: string }} opts
 */
export async function mintTileVariation({ batch = TILE_REVIEW_BATCH, slug, variationId, samplesRoot, spokenText }) {
  const root = samplesRoot ?? join(repoRoot, "data/samples");
  const defaults = loadRecipeDefaults(batch);
  const word = resolveSpokenWord(slug, batch, spokenText);
  const voice = getCatalogTileVoice();
  const text =
    variationId === "emphasis"
      ? tileVariationText(word, variationId)
      : tileMintTextForVariation(word, variationId);
  const relOut = `${batch}/takes/${tileTakeFilename(slug, variationId)}`;
  const outPath = join(root, relOut);
  mkdirSync(join(root, batch, "takes"), { recursive: true });
  const buf = await synthesizeElevenLabs({
    text,
    voiceId: defaults.voice_id ?? voice.voice_id,
    model: defaults.model ?? voice.model,
    voiceSettings: defaults.voice_settings ?? voice.voice_settings,
  });
  writeFileSync(outPath, buf);
  return { relOut, outPath, text, variationId, bytes: buf.length };
}

/**
 * @returns {Promise<string[]>} variation ids that were minted (not already on disk)
 */
export async function ensureDefaultTileTakes(slug, batch = TILE_REVIEW_BATCH, samplesRoot, spokenText) {
  const root = samplesRoot ?? join(repoRoot, "data/samples");
  const minted = [];
  for (const variationId of TILE_AUTO_MINT_VARIATIONS) {
    const rel = join(root, batch, "takes", tileTakeFilename(slug, variationId));
    if (existsSync(rel)) continue;
    await mintTileVariation({ batch, slug, variationId, samplesRoot: root, spokenText });
    minted.push(variationId);
  }
  return minted;
}

/** @param {{ slug: string, spokenText?: string, batch?: string, samplesRoot?: string, includeEmphasis?: boolean }} opts */
export async function remintAllTileVariations({
  slug,
  spokenText,
  batch = TILE_REVIEW_BATCH,
  samplesRoot,
  includeEmphasis = true,
}) {
  const ids = includeEmphasis ? TILE_VARIATION_IDS : TILE_AUTO_MINT_VARIATIONS;
  const paths = [];
  for (const variationId of ids) {
    const r = await mintTileVariation({ batch, slug, variationId, samplesRoot, spokenText });
    paths.push(r.relOut);
  }
  return paths;
}
