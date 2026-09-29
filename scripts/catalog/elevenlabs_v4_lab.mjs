/**
 * ElevenLabs v4 listen lab — default mint is v4_plain only; optional v4_ipa via Groq.
 * Samples: data/samples/elevenlabs-v4-lab/takes/
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { catalogSlug } from "./elevenlabs_tile_variations.mjs";
import { synthesizeElevenLabs, voiceSettingsForModel } from "./elevenlabs_tts.mjs";
import { lookupCatalogWord } from "./tile_catalog_lookup.mjs";
import { repoRoot } from "./paths.mjs";
import { formatElevenV4IpaLine, lookupIpaGroq, normalizeIpaField } from "./ipa_lookup_groq.mjs";
import { getCatalogTileVoice } from "./voices.mjs";
import { normalizeV1 } from "../../public/shared/normalize.mjs";
import { tileMintText } from "../../src/shared/tile_recipe.mjs";

export const V4_LAB_BATCH = "elevenlabs-v4-lab";
export const V4_MODEL = "eleven_v4";

/** @typedef {"v4_plain" | "v4_ipa"} V4LabVariationId */

/** Default lab mint (one ElevenLabs call). */
export const V4_LAB_DEFAULT_MINT_IDS = ["v4_plain"];

/** Optional fallback when plain is not good enough (Groq + Eleven). */
export const V4_LAB_IPA_MINT_IDS = ["v4_ipa"];

export const V4_LAB_VARIATION_IDS = [...V4_LAB_DEFAULT_MINT_IDS, ...V4_LAB_IPA_MINT_IDS];

const LAB_SUFFIX_RE = /_(v4_plain|v4_ipa)$/;

/**
 * @param {string} filename e.g. bathroom_v4_plain.mp3
 */
export function slugFromLabTakeFilename(filename) {
  const base = String(filename ?? "").replace(/\.mp3$/i, "");
  const m = LAB_SUFFIX_RE.exec(base);
  if (!m) return base;
  return base.slice(0, -m[0].length);
}

/**
 * @param {string} slug
 * @param {V4LabVariationId} variationId
 */
export function labTakeFilename(slug, variationId) {
  return `${slug}_${variationId}.mp3`;
}

function ensureIpaWrapped(ipa) {
  const raw = String(ipa ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("/") && raw.endsWith("/")) return raw;
  const inner = raw.replace(/^\/+|\/+$/g, "");
  return `/${inner}/`;
}

/**
 * @param {string} word spoken label
 * @param {V4LabVariationId} variationId
 * @param {{ ipa?: string }} [opts]
 */
export function labVariationText(word, variationId, opts = {}) {
  const w = String(word ?? "").trim();
  if (!w) throw new Error("word is required");
  switch (variationId) {
    case "v4_plain":
      return tileMintText(normalizeV1(w));
    case "v4_ipa": {
      const ipa = ensureIpaWrapped(opts.ipa);
      if (!ipa) throw new Error("ipa is required for v4_ipa");
      return formatElevenV4IpaLine(w, ipa);
    }
    default:
      throw new Error(`unknown lab variation: ${variationId}`);
  }
}

export function modelForLabVariation(variationId) {
  if (!V4_LAB_VARIATION_IDS.includes(variationId)) {
    throw new Error(`unknown lab variation: ${variationId}`);
  }
  return V4_MODEL;
}

/**
 * @param {string} q catalog label, slug, or free text
 */
export function resolveLabWord(q) {
  const trimmed = String(q ?? "").trim();
  if (!trimmed) throw new Error("q is required");
  const slug = catalogSlug(trimmed);
  if (!slug) throw new Error("could not derive slug from text");
  try {
    const hit = lookupCatalogWord(trimmed);
    if (normalizeLabQuery(hit.spokenText) !== normalizeLabQuery(trimmed)) {
      throw new Error("catalog label mismatch");
    }
    return {
      slug: hit.slug,
      spokenText: hit.spokenText,
      slot: hit.slot,
      fromCatalog: true,
    };
  } catch {
    return { slug, spokenText: trimmed, slot: null, fromCatalog: false };
  }
}

function normalizeLabQuery(text) {
  return String(text ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** The recipes live in src/shared/tile_recipe.mjs (028 § 4.4) — the Worker
 *  mints with exactly the text the lab proved. Re-exported so lab callers
 *  and tests keep their import paths. */
export {
  ipaOverrideForSoundEffectLabel,
  lexicalV4GuardText,
  needsLexicalV4Guard,
  needsSoundEffectIpaOverride,
} from "../../src/shared/tile_recipe.mjs";

/**
 * @param {{ slug: string, variationId: V4LabVariationId, spokenText: string, ipa?: string, samplesRoot?: string }} opts
 */
export async function mintLabVariation({ slug, variationId, spokenText, ipa, samplesRoot }) {
  const root = samplesRoot ?? join(repoRoot, "data/samples");
  const voice = getCatalogTileVoice();
  const model = modelForLabVariation(variationId);
  const text = labVariationText(spokenText, variationId, { ipa });
  const relOut = `${V4_LAB_BATCH}/takes/${labTakeFilename(slug, variationId)}`;
  const outPath = join(root, relOut);
  mkdirSync(join(root, V4_LAB_BATCH, "takes"), { recursive: true });
  const baseSettings = voice.voice_settings ?? {};
  const buf = await synthesizeElevenLabs({
    text,
    voiceId: voice.voice_id,
    model,
    voiceSettings: voiceSettingsForModel(model, baseSettings),
  });
  writeFileSync(outPath, buf);
  return { relOut, outPath, text, variationId, model, bytes: buf.length };
}

/**
 * @param {{ q: string, spokenText?: string, ipa?: string, ipaContext?: import("./ipa_lookup_groq.mjs").IpaSpeechContext, samplesRoot?: string, mode?: "plain" | "ipa" }} opts
 */
export async function remintV4LabMatrix({
  q,
  spokenText,
  ipa,
  ipaContext = "isolated_tile",
  samplesRoot,
  mode = "plain",
}) {
  const resolved = resolveLabWord(q);
  const word = spokenText?.trim() || resolved.spokenText;
  const slug = resolved.slug;
  const variationIds = mode === "ipa" ? V4_LAB_IPA_MINT_IDS : V4_LAB_DEFAULT_MINT_IDS;

  let ipaTrim = "";
  let ipaGloss = "";
  if (mode === "ipa") {
    ipaTrim = String(ipa ?? "").trim();
    if (ipaTrim) {
      try {
        ipaTrim = normalizeIpaField(ipaTrim);
      } catch {
        ipaTrim = "";
      }
    }
    if (!ipaTrim) {
      const override = ipaOverrideForSoundEffectLabel(word);
      if (override) {
        ipaTrim = override;
      } else {
        const looked = await lookupIpaGroq({ text: word, context: ipaContext });
        ipaTrim = looked.ipa;
        ipaGloss = looked.gloss ?? "";
      }
    }
  }

  const paths = [];
  const root = samplesRoot ?? join(repoRoot, "data/samples");

  async function writePlainAndIpaFromBuffer(buf) {
    const relPlain = `${V4_LAB_BATCH}/takes/${labTakeFilename(slug, "v4_plain")}`;
    const relIpa = `${V4_LAB_BATCH}/takes/${labTakeFilename(slug, "v4_ipa")}`;
    mkdirSync(join(root, V4_LAB_BATCH, "takes"), { recursive: true });
    writeFileSync(join(root, relPlain), buf);
    writeFileSync(join(root, relIpa), buf);
    paths.push(relPlain, relIpa);
  }

  if (mode === "ipa" && needsLexicalV4Guard(word)) {
    const voice = getCatalogTileVoice();
    const model = V4_MODEL;
    const buf = await synthesizeElevenLabs({
      text: lexicalV4GuardText(word),
      voiceId: voice.voice_id,
      model,
      voiceSettings: voiceSettingsForModel(model, voice.voice_settings ?? {}),
    });
    await writePlainAndIpaFromBuffer(buf);
  } else if (mode === "ipa" && needsSoundEffectIpaOverride(word)) {
    const r = await mintLabVariation({
      slug,
      variationId: "v4_ipa",
      spokenText: word,
      ipa: ipaTrim,
      samplesRoot: root,
    });
    paths.push(r.relOut);
    const ipaBytes = readFileSync(join(root, r.relOut));
    await writePlainAndIpaFromBuffer(ipaBytes);
  } else {
    for (const variationId of variationIds) {
      const r = await mintLabVariation({
        slug,
        variationId,
        spokenText: word,
        ipa: ipaTrim,
        samplesRoot: root,
      });
      paths.push(r.relOut);
    }
  }
  return {
    slug,
    spokenText: word,
    slot: resolved.slot,
    fromCatalog: resolved.fromCatalog,
    paths,
    skipped: [],
    mode,
    ipa: ipaTrim || undefined,
    ipaGloss: ipaGloss || undefined,
  };
}

export function isV4LabBatch(batch) {
  return batch === V4_LAB_BATCH;
}
