#!/usr/bin/env node
/**
 * Local catalog audio review (trim tail, approve → shortlist). Dev only — binds localhost.
 *
 *   npm run catalog:audio:review
 *   Grok explore:  http://127.0.0.1:3747/audio-review?batch=batch-20-core
 *   ElevenLabs tiles: http://127.0.0.1:3747/audio-review/elevenlabs-tiles
 */

import { createServer } from "node:http";
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { trimAudioTail } from "./audio_trim.mjs";
import {
  ELEVENLABS_TILES_LEO_BATCH,
  FORMS_REVIEW_BATCH,
  isElevenlabsReviewBatch,
  tileTakeFilename,
  tileVariationText,
} from "./elevenlabs_tile_variations.mjs";
import {
  ensureDefaultTileTakes,
  mintTileVariation,
  remintAllTileVariations,
} from "./elevenlabs_tile_mint_core.mjs";
import {
  catalogAudioLocalExists,
  ensureCatalogAudioLocal,
  enrichFileListForTiles,
  filterFilesByShip,
  isSlugShippedViaReview,
  lookupCatalogWord,
  probeR2ObjectExists,
  resolveTileReviewWord,
} from "./tile_catalog_lookup.mjs";
import { findMintRunBatch, listMintRuns, mintRunFileList } from "./elevenlabs_mint_run.mjs";
import {
  canPublishCatalogBatch,
  listTileReviewVoices,
  resolveTileReviewLane,
  tileReviewUrlForRun,
} from "./tile_review_voices.mjs";
import { buildGrokTtsBody, synthesizeGrokVoice } from "./grok_tts.mjs";
import { mintBackupVoice } from "./mint_backup_voice.mjs";
import { publishCatalogForm } from "./publish_catalog_form.mjs";
import { publishCatalogTile } from "./publish_catalog_tile.mjs";
import {
  isV4LabBatch,
  labTakeFilename,
  remintV4LabMatrix,
  slugFromLabTakeFilename,
  V4_LAB_BATCH,
  V4_LAB_VARIATION_IDS,
} from "./elevenlabs_v4_lab.mjs";
import {
  isVoiceSelectorBatch,
  loadDecisions,
  loadRoundConfig,
  parseProbeTakeFilename,
  saveDecision,
  VOICE_SELECTOR_BATCH,
} from "./elevenlabs_voice_selector.mjs";
import { loadProbeManifest } from "./elevenlabs_expressive_probe.mjs";
import {
  loadReviewDoc,
  reviewStatusForSlug,
  reviewSummary,
  setReviewStatus,
} from "./elevenlabs_v4_lab_review.mjs";
import { auditGeneratedWordAudio } from "./audio_review.mjs";
import { lookupIpaGroq } from "./ipa_lookup_groq.mjs";
import { repoRoot } from "./paths.mjs";

const PORT = Number(process.env.PIP_AUDIO_REVIEW_PORT) || 3747;
const SAMPLES = join(repoRoot, "data/samples");
const PUBLIC_HTML_GROK = join(repoRoot, "public/audio-review.html");
const PUBLIC_HTML_ELEVENLABS_TILES = join(repoRoot, "public/audio-review-elevenlabs-tiles.html");
const PUBLIC_HTML_ELEVENLABS_V4_LAB = join(repoRoot, "public/audio-review-elevenlabs-v4-lab.html");
const PUBLIC_HTML_VOICE_SELECTOR = join(repoRoot, "public/audio-review-elevenlabs-voice-selector.html");
const PUBLIC_HTML_TILE_VOICE = join(repoRoot, "public/audio-review-tile-voice.html");
const PUBLIC_HTML_EXPRESSIVE_PROBE = join(repoRoot, "public/audio-review-elevenlabs-expressive.html");

const GROK_PIPELINE = "grok";
const ELEVENLABS_TILES_PIPELINE = "elevenlabs-tiles";
const ELEVENLABS_V4_LAB_PIPELINE = "elevenlabs-v4-lab";
const VOICE_SELECTOR_PIPELINE = "elevenlabs-voice-selector";

function loadEnv() {
  try {
    for (const line of readFileSync(join(repoRoot, ".env"), "utf8").split("\n")) {
      const m = /^([A-Z_]+)=(.+)$/.exec(line.trim());
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // optional
  }
}

/** @returns {string} posix-ish path under data/samples */
export function resolveSamplePath(relative) {
  const clean = String(relative ?? "")
    .replace(/^\/+/, "")
    .split(/[/\\]/)
    .filter((p) => p && p !== "." && p !== "..")
    .join("/");
  const abs = resolve(SAMPLES, clean);
  if (!abs.startsWith(SAMPLES) || !existsSync(abs)) {
    throw new Error("path not found");
  }
  return { abs, rel: clean };
}

export function slugFromMp3(filename) {
  const base = basename(filename, extname(filename));
  return base
    .replace(/_recommended$/, "")
    .replace(/_backup_raw$/, "")
    .replace(/_backup$/, "")
    .replace(/_emphasis_bang$/, "")
    .replace(/_emphasis_period$/, "")
    .replace(/_emphasis$/, "")
    .replace(/_plain$/, "")
    .replace(/_period$/, "")
    .replace(/_raw$/, "");
}

/**
 * Remove other shortlist MP3s for the same catalog slug (exact match on slugFromMp3).
 * Keeps `keepFilename` (e.g. bath_recommended.mp3). Does not touch bathroom when slug is bath.
 *
 * @returns {string[]} basenames removed
 */
/** Always write Aga backups under batch `takes/`, even when minting from shortlist. */
export function backupPathsForSampleRel(rel) {
  const parts = String(rel).split("/");
  const batch = parts[0];
  const slug = slugFromMp3(parts[parts.length - 1]);
  const relOut = `${batch}/takes/${slug}_backup.mp3`;
  return { abs: join(SAMPLES, relOut), rel: relOut, slug, batch };
}

export function emphasisTakePathForSampleRel(rel) {
  const { batch, slug } = backupPathsForSampleRel(rel);
  const relOut = `${batch}/takes/${slug}_emphasis.mp3`;
  return { abs: join(SAMPLES, relOut), rel: relOut, slug, batch };
}

export function emphasisGrokText(word) {
  return `<emphasis>${word}</emphasis>`;
}

export function recipeWordForSlug(batch, slug) {
  const recipesPath = join(SAMPLES, batch, "recipes.json");
  if (!existsSync(recipesPath)) return { word: slug.replace(/-/g, " "), defaults: {}, slot: null, utterance_id: null };
  const recipes = JSON.parse(readFileSync(recipesPath, "utf8"));
  const row = (recipes.words ?? []).find((w) => w.slug === slug);
  return {
    word: row?.word ?? slug.replace(/-/g, " "),
    defaults: recipes.defaults ?? {},
    slot: row?.slot ?? null,
    utterance_id: row?.utterance_id ?? null,
  };
}

export function pruneShortlistForSlug(shortlistDir, slug, keepFilename) {
  if (!existsSync(shortlistDir)) return [];
  const removed = [];
  for (const name of readdirSync(shortlistDir)) {
    if (!name.toLowerCase().endsWith(".mp3")) continue;
    if (name === keepFilename) continue;
    if (slugFromMp3(name) !== slug) continue;
    unlinkSync(join(shortlistDir, name));
    removed.push(name);
  }
  return removed;
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(new Error("invalid json"));
      }
    });
    req.on("error", reject);
  });
}

/** 028 § 7 — the tile-voice review page calls the Worker's founder-only
 *  admin routes through this proxy; PIP_ADMIN_TOKEN never reaches the
 *  browser. Base URL is PIP_TILE_ADMIN_URL in .env (e.g. the local
 *  dev Worker http://127.0.0.1:21088, or the deployed Worker). */
function tilevoiceBase() {
  return (process.env.PIP_TILE_ADMIN_URL ?? "").replace(/\/+$/, "");
}

/** Authenticated fetch to the tile admin API; returns the raw Response. */
async function tilevoiceFetch(upstreamPath, init = {}) {
  const base = tilevoiceBase();
  if (!base) return null;
  const headers = {
    ...(init.headers ?? {}),
    authorization: `Bearer ${process.env.PIP_ADMIN_TOKEN ?? ""}`,
  };
  return fetch(`${base}${upstreamPath}`, { ...init, headers }).catch(() => null);
}

async function tilevoiceUpstream(res, method, upstreamPath, body) {
  const base = tilevoiceBase();
  if (!base) {
    json(res, 503, {
      error: "PIP_TILE_ADMIN_URL unset — point it at a Worker "
        + "(e.g. http://127.0.0.1:21088 for the agent dev copy) in .env",
    });
    return;
  }
  const init = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "content-type": "application/json" };
  }
  const up = await tilevoiceFetch(upstreamPath, init);
  if (!up) {
    json(res, 502, { error: `tile admin unreachable at ${base}` });
    return;
  }
  res.writeHead(up.status, {
    "content-type": up.headers.get("content-type") ?? "application/json",
    "cache-control": "no-store",
  });
  res.end(Buffer.from(await up.arrayBuffer()));
}

/** @param {string | null | undefined} pipeline */
export function listBatches(pipeline) {
  const dirs = readdirSync(SAMPLES, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const grok = dirs.filter((n) => /^batch-\d+-core$/.test(n));
  const elevenlabs = dirs.filter((n) => /^elevenlabs-(tiles-leo|tiles-core|forms-core)$/.test(n));
  if (pipeline === GROK_PIPELINE) return grok.sort();
  if (pipeline === ELEVENLABS_V4_LAB_PIPELINE) return [V4_LAB_BATCH];
  if (pipeline === VOICE_SELECTOR_PIPELINE) return [VOICE_SELECTOR_BATCH];
  if (pipeline === ELEVENLABS_TILES_PIPELINE || pipeline === "elevenlabs-catalog") {
    return elevenlabs.sort();
  }
  return [...grok, ...elevenlabs].sort();
}

function listMp3(batch, folder) {
  const dir = join(SAMPLES, batch, folder);
  if (!dir.startsWith(SAMPLES) || !existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".mp3"))
    .sort()
    .map((name) => {
      const st = statSync(join(dir, name));
      return { name, bytes: st.size, mtime: st.mtime.toISOString() };
    });
}

function durationMs(abs) {
  const probe = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", abs],
    { encoding: "utf8" },
  );
  const sec = parseFloat(String(probe.stdout ?? "").trim());
  return Number.isFinite(sec) ? Math.round(sec * 1000) : null;
}

async function handle(req, res) {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname.replace(/\/$/, "") || "/";

  if (req.method === "GET" && (path === "/" || path === "/audio-review")) {
    if (!existsSync(PUBLIC_HTML_GROK)) {
      res.writeHead(404);
      res.end("missing public/audio-review.html");
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(readFileSync(PUBLIC_HTML_GROK, "utf8"));
    return;
  }

  if (req.method === "GET" && path === "/audio-review/elevenlabs-tiles") {
    if (!existsSync(PUBLIC_HTML_ELEVENLABS_TILES)) {
      res.writeHead(404);
      res.end("missing public/audio-review-elevenlabs-tiles.html");
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(readFileSync(PUBLIC_HTML_ELEVENLABS_TILES, "utf8"));
    return;
  }

  if (req.method === "GET" && path === "/audio-review/elevenlabs-v4-lab") {
    if (!existsSync(PUBLIC_HTML_ELEVENLABS_V4_LAB)) {
      res.writeHead(404);
      res.end("missing public/audio-review-elevenlabs-v4-lab.html");
      return;
    }
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(readFileSync(PUBLIC_HTML_ELEVENLABS_V4_LAB, "utf8"));
    return;
  }

  if (req.method === "GET" && path === "/audio-review/tile-voice") {
    if (!existsSync(PUBLIC_HTML_TILE_VOICE)) {
      res.writeHead(404);
      res.end("missing public/audio-review-tile-voice.html");
      return;
    }
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(readFileSync(PUBLIC_HTML_TILE_VOICE, "utf8"));
    return;
  }

  if (req.method === "GET" && path === "/audio-review/elevenlabs-voice-selector") {
    if (!existsSync(PUBLIC_HTML_VOICE_SELECTOR)) {
      res.writeHead(404);
      res.end("missing public/audio-review-elevenlabs-voice-selector.html");
      return;
    }
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(readFileSync(PUBLIC_HTML_VOICE_SELECTOR, "utf8"));
    return;
  }

  if (req.method === "GET" && path === "/audio-review/elevenlabs-expressive") {
    if (!existsSync(PUBLIC_HTML_EXPRESSIVE_PROBE)) {
      res.writeHead(404);
      res.end("missing public/audio-review-elevenlabs-expressive.html");
      return;
    }
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(readFileSync(PUBLIC_HTML_EXPRESSIVE_PROBE, "utf8"));
    return;
  }

  if (path === "/api/expressive-probe/manifest" && req.method === "GET") {
    try {
      const doc = loadProbeManifest(SAMPLES);
      if (!doc) {
        throw new Error(
          "missing probe — run: npm run catalog:expressive-probe:mint",
        );
      }
      json(res, 200, doc);
    } catch (e) {
      json(res, 400, { error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  if (path === "/api/voice-selector/round" && req.method === "GET") {
    try {
      const round = loadRoundConfig(SAMPLES);
      const decisions = loadDecisions(SAMPLES);
      json(res, 200, { round, decisions });
    } catch (e) {
      json(res, 400, { error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  if (path === "/api/voice-selector/decisions" && req.method === "GET") {
    try {
      json(res, 200, loadDecisions(SAMPLES));
    } catch (e) {
      json(res, 400, { error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  if (path === "/api/voice-selector/pick" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const candidateId = String(body.candidateId ?? "").trim();
      const round = loadRoundConfig(SAMPLES);
      const cand = round.candidates.find((c) => c.id === candidateId);
      if (!cand) throw new Error(`unknown candidateId: ${candidateId}`);
      const out = saveDecision(
        {
          roundId: round.roundId,
          intentLabel: round.intentLabel,
          pickedCandidateId: cand.id,
          pickedVoiceId: cand.voice_id,
        },
        SAMPLES,
      );
      json(res, 200, out);
    } catch (e) {
      json(res, 400, { error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  if (path === "/api/tile-review/voices" && req.method === "GET") {
    json(res, 200, { voices: listTileReviewVoices() });
    return;
  }

  if (path === "/api/tile-review/lane" && req.method === "GET") {
    const voiceKey = url.searchParams.get("voice")?.trim();
    const surfaceId = url.searchParams.get("surface")?.trim() || "tiles";
    if (!voiceKey) {
      json(res, 400, { error: "voice required" });
      return;
    }
    try {
      json(res, 200, resolveTileReviewLane(voiceKey, surfaceId));
    } catch (e) {
      json(res, 400, { error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  if (path === "/api/batches" && req.method === "GET") {
    const pipeline = url.searchParams.get("pipeline");
    json(res, 200, { batches: listBatches(pipeline), pipeline: pipeline || "all" });
    return;
  }

  if (path === "/api/mint-runs" && req.method === "GET") {
    const voiceKey = url.searchParams.get("voice")?.trim();
    const surfaceId = url.searchParams.get("surface")?.trim() || "tiles";
    let batch = url.searchParams.get("batch") || "elevenlabs-tiles-core";
    if (voiceKey) {
      try {
        batch = resolveTileReviewLane(voiceKey, surfaceId).batch;
      } catch (e) {
        json(res, 400, { error: e instanceof Error ? e.message : String(e) });
        return;
      }
    }
    json(res, 200, { batch, voice: voiceKey ?? null, runs: listMintRuns(batch) });
    return;
  }

  if (path === "/api/mint-run-lookup" && req.method === "GET") {
    const runId = url.searchParams.get("runId")?.trim();
    if (!runId) {
      json(res, 400, { error: "runId required" });
      return;
    }
    const batch = findMintRunBatch(runId);
    if (!batch) {
      json(res, 404, { error: `unknown mint run: ${runId}` });
      return;
    }
    json(res, 200, { runId, batch });
    return;
  }

  if (path === "/api/files" && req.method === "GET") {
    const batch = url.searchParams.get("batch");
    const folder = url.searchParams.get("folder") || "takes";
    const shipFilter = url.searchParams.get("shipFilter") || "all";
    if (!batch || !["takes", "shortlist"].includes(folder)) {
      json(res, 400, { error: "batch and folder=takes|shortlist required" });
      return;
    }
    if (isElevenlabsReviewBatch(batch) && shipFilter === "mint-run") {
      const runId = url.searchParams.get("runId")?.trim();
      if (!runId) {
        json(res, 400, { error: "runId required when shipFilter=mint-run" });
        return;
      }
      try {
        let files = mintRunFileList(runId, batch, folder);
        const runShip = url.searchParams.get("runShip") || "all";
        if (runShip === "needs-ship") {
          files = files.filter((f) => !f.shippedViaReview);
        }
        json(res, 200, { batch, folder, shipFilter, runId, files });
      } catch (e) {
        json(res, 400, { error: e instanceof Error ? e.message : String(e) });
      }
      return;
    }
    let files = listMp3(batch, folder);
    if (isElevenlabsReviewBatch(batch)) {
      files = enrichFileListForTiles(batch, folder, files, slugFromMp3);
      files = filterFilesByShip(files, shipFilter);
    }
    json(res, 200, { batch, folder, shipFilter, files });
    return;
  }

  if (path === "/api/tile-lookup" && req.method === "GET") {
    try {
      const q = url.searchParams.get("q")?.trim();
      if (!q) throw new Error("q is required");
      const hit = lookupCatalogWord(q);
      const key = hit.catalogClip?.key ?? null;
      let localExists = false;
      let r2Exists = false;
      if (key) {
        localExists = catalogAudioLocalExists(key);
        r2Exists = localExists || probeR2ObjectExists(key);
      }
      json(res, 200, {
        ...hit,
        catalog: key
          ? {
              key,
              sha256: hit.catalogClip.sha256,
              localExists,
              r2Exists,
              audioUrl: `/api/catalog-audio?key=${encodeURIComponent(key)}`,
            }
          : null,
      });
    } catch (e) {
      json(res, 400, { error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  if (path === "/api/catalog-audio" && req.method === "GET") {
    try {
      const key = url.searchParams.get("key")?.trim();
      if (!key || !key.startsWith("audio/") || key.includes("..")) {
        throw new Error("invalid catalog audio key");
      }
      const abs = ensureCatalogAudioLocal(key);
      res.writeHead(200, {
        "content-type": "audio/mpeg",
        "cache-control": "no-store",
        "x-pip-catalog-key": key,
      });
      createReadStream(abs).pipe(res);
    } catch (e) {
      json(res, 400, { error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  if (path === "/api/v4-lab/review" && req.method === "GET") {
    try {
      const doc = loadReviewDoc(SAMPLES);
      const summary = reviewSummary(doc);
      json(res, 200, { bySlug: doc.bySlug, summary });
    } catch (e) {
      json(res, 400, { error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  if (path === "/api/v4-lab/review" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const slug = String(body.slug ?? "").trim();
      const status = String(body.status ?? "").trim();
      if (!slug) throw new Error("slug is required");
      const doc = setReviewStatus(slug, status, SAMPLES);
      json(res, 200, { slug, status: reviewStatusForSlug(slug, doc), bySlug: doc.bySlug });
    } catch (e) {
      json(res, 400, { error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  if (path === "/api/v4-lab/ipa" && req.method === "GET") {
    try {
      loadEnv();
      const q = url.searchParams.get("q")?.trim();
      if (!q) throw new Error("q is required");
      let spoken = q;
      try {
        spoken = lookupCatalogWord(q).spokenText;
      } catch {
        // free text
      }
      const context =
        url.searchParams.get("context") === "connected_speech" ? "connected_speech" : "isolated_tile";
      const result = await lookupIpaGroq({ text: spoken, context });
      json(res, 200, { spokenText: spoken, ...result });
    } catch (e) {
      json(res, 400, { error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  if (path === "/api/v4-lab/remint-all" && req.method === "POST") {
    try {
      loadEnv();
      const body = await readBody(req);
      const q = String(body.q ?? body.query ?? "").trim();
      if (!q) throw new Error("q is required");
      const spokenOverride = String(body.spokenText ?? "").trim();
      const ipa = String(body.ipa ?? "").trim();
      const ipaContext = body.ipaContext === "connected_speech" ? "connected_speech" : "isolated_tile";
      const mode = body.mode === "ipa" ? "ipa" : "plain";
      const result = await remintV4LabMatrix({
        q,
        spokenText: spokenOverride || undefined,
        ipa: ipa || undefined,
        ipaContext,
        samplesRoot: SAMPLES,
        mode,
      });
      const openPath =
        result.paths[0] ?? `${V4_LAB_BATCH}/takes/${labTakeFilename(result.slug, "v4_plain")}`;
      json(res, 200, { ...result, openPath, variations: V4_LAB_VARIATION_IDS });
    } catch (e) {
      json(res, 400, { error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  if (path === "/api/v4-lab/audit" && req.method === "GET") {
    try {
      const { abs, rel } = resolveSamplePath(url.searchParams.get("path"));
      const batch = rel.split("/")[0];
      if (!isV4LabBatch(batch)) throw new Error("audit is only for elevenlabs-v4-lab takes");
      const file = basename(abs);
      const slug = slugFromLabTakeFilename(file);
      const spoken = url.searchParams.get("spoken")?.trim() || slug.replace(/_/g, " ");
      const audit = auditGeneratedWordAudio({ filePath: abs, spokenText: spoken });
      json(res, 200, { path: rel, spokenText: spoken, audit });
    } catch (e) {
      json(res, 400, { error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  if (path === "/api/remint-tile-all" && req.method === "POST") {
    try {
      loadEnv();
      const body = await readBody(req);
      const q = String(body.q ?? body.query ?? body.slug ?? "").trim();
      if (!q) throw new Error("q is required");
      const hit = lookupCatalogWord(q);
      const paths = await remintAllTileVariations({
        slug: hit.slug,
        spokenText: hit.spokenText,
        samplesRoot: SAMPLES,
        includeEmphasis: true,
      });
      json(res, 200, {
        slug: hit.slug,
        spokenText: hit.spokenText,
        slot: hit.slot,
        paths,
        openPath: paths[0],
      });
    } catch (e) {
      json(res, 400, { error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  if (path === "/api/meta" && req.method === "GET") {
    try {
      const { abs, rel } = resolveSamplePath(url.searchParams.get("path"));
      const file = basename(abs);
      const batch = rel.split("/")[0];
      const voiceSel = isVoiceSelectorBatch(batch);
      let slug;
      let voiceSelectorCandidateId = null;
      if (voiceSel) {
        const parsed = parseProbeTakeFilename(file);
        if (!parsed) throw new Error("invalid voice selector take filename");
        slug = parsed.slug;
        voiceSelectorCandidateId = parsed.candidateId;
      } else {
        slug = isV4LabBatch(batch) ? slugFromLabTakeFilename(file) : slugFromMp3(file);
      }
      const backupAbs = join(SAMPLES, batch, "takes", `${slug}_backup.mp3`);
      const backupExists = existsSync(backupAbs);
      const backupPath = backupExists ? `${batch}/takes/${slug}_backup.mp3` : null;
      const emphasisAbs = join(SAMPLES, batch, "takes", `${slug}_emphasis.mp3`);
      const emphasisExists = existsSync(emphasisAbs);
      const emphasisPath = emphasisExists ? `${batch}/takes/${slug}_emphasis.mp3` : null;
      const el = isElevenlabsReviewBatch(batch);
      const v4Lab = isV4LabBatch(batch);
      let word = slug.replace(/_/g, " ");
      let slot = null;
      let utterance_id = null;
      if (!voiceSel && el) {
        const resolved = resolveTileReviewWord(slug, batch);
        word = resolved.word;
        slot = resolved.slot;
        utterance_id = resolved.utterance_id;
      } else if (!voiceSel && !v4Lab) {
        const row = recipeWordForSlug(batch, slug);
        word = row.word;
        slot = row.slot;
        utterance_id = row.utterance_id;
      } else if (!voiceSel && v4Lab) {
        try {
          const row = recipeWordForSlug(batch, slug);
          word = row.word;
          slot = row.slot;
          utterance_id = row.utterance_id;
        } catch {
          // optional
        }
      }
      const batchKind = voiceSel
        ? "voice-selector"
        : v4Lab
          ? "v4-lab"
          : batch === FORMS_REVIEW_BATCH
            ? "forms"
            : el
              ? "tiles"
              : "grok";
      let labVariationId = null;
      let labMintText = null;
      if (v4Lab) {
        const m = /_(v4_plain|v4_ipa)\.mp3$/i.exec(file);
        labVariationId = m ? m[1] : null;
      }
      json(res, 200, {
        path: rel,
        slug,
        mode: v4Lab || el ? "elevenlabs" : "grok",
        batchKind,
        labVariationId,
        labMintText,
        voiceSelectorCandidateId,
        utterance_id,
        canPublishTile: batchKind === "tiles" && !v4Lab && canPublishCatalogBatch(batch),
        slot,
        durationMs: durationMs(abs),
        bytes: statSync(abs).size,
        backupExists: el ? false : backupExists,
        backupPath: el ? null : backupPath,
        emphasisExists: el ? false : emphasisExists,
        emphasisPath: el ? null : emphasisPath,
        emphasisText: el ? null : emphasisGrokText(word),
        tileCapsExists: el ? emphasisExists : false,
        tileCapsPath: el ? emphasisPath : null,
        tileCapsText: el ? tileVariationText(word, "emphasis") : null,
        shippedViaReview: el ? isSlugShippedViaReview(slug, batch) : false,
        isBackupTake: /_backup(?:_raw)?\.mp3$/i.test(file),
      });
    } catch (e) {
      json(res, 400, { error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  if (path === "/api/audio" && req.method === "GET") {
    try {
      const { abs, rel } = resolveSamplePath(url.searchParams.get("path"));
      res.writeHead(200, {
        "content-type": "audio/mpeg",
        "cache-control": "no-store",
        "x-pip-path": rel,
      });
      createReadStream(abs).pipe(res);
    } catch (e) {
      json(res, 400, { error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  if (path === "/api/trim" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const ms = Number(body.ms);
      if (![20, 50, 100].includes(ms)) throw new Error("ms must be 20, 50, or 100");
      const { abs, rel } = resolveSamplePath(body.path);
      const tmp = `${abs}.trim-tmp.mp3`;
      trimAudioTail({ sourcePath: abs, destPath: tmp, trimTailMs: ms, minTrimMs: 20 });
      copyFileSync(tmp, abs);
      unlinkSync(tmp);
      json(res, 200, { path: rel, trimmedMs: ms, durationMs: durationMs(abs) });
    } catch (e) {
      json(res, 400, { error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  if (path === "/api/approve" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const { abs, rel } = resolveSamplePath(body.path);
      const parts = rel.split("/");
      const batch = parts[0];
      const file = parts[parts.length - 1];
      const slug = slugFromMp3(file);
      const shortlistDir = join(SAMPLES, batch, "shortlist");
      mkdirSync(shortlistDir, { recursive: true });
      const destName = `${slug}_recommended.mp3`;
      const destAbs = join(shortlistDir, destName);
      copyFileSync(abs, destAbs);
      const removed = pruneShortlistForSlug(shortlistDir, slug, destName);
      json(res, 200, {
        source: rel,
        shortlist: `${batch}/shortlist/${destName}`,
        slug,
        removedFromShortlist: removed,
      });
    } catch (e) {
      json(res, 400, { error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  if (path === "/api/ensure-tile-takes" && req.method === "POST") {
    try {
      loadEnv();
      const body = await readBody(req);
      const { rel } = resolveSamplePath(body.path);
      const { batch, slug } = backupPathsForSampleRel(rel);
      if (!isElevenlabsReviewBatch(batch)) {
        throw new Error("ensure-tile-takes is only for the ElevenLabs tile review batch");
      }
      const { word: spoken } = resolveTileReviewWord(slug, batch);
      const minted = await ensureDefaultTileTakes(slug, batch, SAMPLES, spoken);
      const paths = minted.map((id) => `${batch}/takes/${tileTakeFilename(slug, id)}`);
      json(res, 200, { slug, minted, paths });
    } catch (e) {
      json(res, 400, { error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  if (path === "/api/remint-backup" && req.method === "POST") {
    try {
      loadEnv();
      const body = await readBody(req);
      const { rel } = resolveSamplePath(body.path);
      const { batch } = backupPathsForSampleRel(rel);
      if (isElevenlabsReviewBatch(batch)) {
        throw new Error("Aga backup is for Grok explore batches only — use /audio-review/elevenlabs-tiles");
      }
      const { abs: outPath, rel: relOut, slug } = backupPathsForSampleRel(rel);
      const { word: spoken } = recipeWordForSlug(batch, slug);
      mkdirSync(dirname(outPath), { recursive: true });
      const result = await mintBackupVoice({ spoken, outPath, gentleTrim: true, fixBurst: false });
      json(res, 200, { ...result, path: relOut });
    } catch (e) {
      json(res, 400, { error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  if (path === "/api/mint-elevenlabs-tile" && req.method === "POST") {
    try {
      loadEnv();
      const body = await readBody(req);
      const variationId = String(body.variationId ?? "emphasis");
      const { rel } = resolveSamplePath(body.path);
      const { batch, slug } = backupPathsForSampleRel(rel);
      if (!isElevenlabsReviewBatch(batch)) {
        throw new Error("mint-elevenlabs-tile is only for the ElevenLabs tile review UI");
      }
      const result = await mintTileVariation({
        batch,
        slug,
        variationId,
        samplesRoot: SAMPLES,
      });
      json(res, 200, {
        path: result.relOut,
        text: result.text,
        variationId: result.variationId,
        bytes: result.bytes,
        durationMs: durationMs(result.outPath),
      });
    } catch (e) {
      json(res, 400, { error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  if (path === "/api/publish-tile" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const dryRun = Boolean(body.dryRun);
      const { abs, rel } = resolveSamplePath(body.path);
      const parts = rel.split("/");
      const batch = parts[0];
      if (batch === FORMS_REVIEW_BATCH) {
        const slug = slugFromMp3(parts[parts.length - 1]);
        const { word, utterance_id } = recipeWordForSlug(batch, slug);
        if (!utterance_id) throw new Error(`no utterance_id in recipes for slug ${slug}`);
        const result = publishCatalogForm({
          sourceMp3Path: abs,
          utterance_id,
          spokenText: word,
          slug,
          dryRun,
        });
        json(res, 200, { ...result, source: rel });
        return;
      }
      if (!isElevenlabsReviewBatch(batch)) throw new Error("publish-tile is only for ElevenLabs catalog review batches");
      const slug = slugFromMp3(parts[parts.length - 1]);
      let word;
      let slot;
      try {
        const row = recipeWordForSlug(batch, slug);
        word = row.word;
        slot = row.slot;
      } catch {
        const resolved = resolveTileReviewWord(slug, batch);
        word = resolved.word;
        slot = resolved.slot;
      }
      if (slot == null) throw new Error(`no lexicon slot for slug ${slug}`);
      const result = publishCatalogTile({
        sourceMp3Path: abs,
        slot,
        spokenText: word,
        dryRun,
      });
      json(res, 200, { ...result, source: rel });
    } catch (e) {
      json(res, 400, { error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  if (path === "/api/mint-grok-emphasis" && req.method === "POST") {
    try {
      loadEnv();
      const body = await readBody(req);
      const { rel } = resolveSamplePath(body.path);
      const { abs: outPath, rel: relOut, slug, batch } = emphasisTakePathForSampleRel(rel);
      if (isElevenlabsReviewBatch(batch)) {
        throw new Error("Grok emphasis is for explore batches only — use caps emphasis on /audio-review/elevenlabs-tiles");
      }
      const { word, defaults } = recipeWordForSlug(batch, slug);
      const text = emphasisGrokText(word);
      const ttsBody = buildGrokTtsBody(text, {
        voiceId: defaults.voice_id ?? "ara",
        language: defaults.language ?? "en",
        speed: defaults.speed ?? 1,
      });
      mkdirSync(dirname(outPath), { recursive: true });
      const buf = await synthesizeGrokVoice(ttsBody);
      writeFileSync(outPath, buf);
      json(res, 200, {
        path: relOut,
        text,
        bytes: buf.length,
        durationMs: durationMs(outPath),
      });
    } catch (e) {
      json(res, 400, { error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  /* --- 028 slice 3: tile-voice review page API → Worker admin routes --- */

  if (path === "/api/tilevoice/recent" && req.method === "GET") {
    return tilevoiceUpstream(res, "GET", `/admin/v1/tile-voice/recent${url.search}`);
  }
  if (path === "/api/tilevoice/held" && req.method === "GET") {
    return tilevoiceUpstream(res, "GET", "/admin/v1/tile-voice/held");
  }
  const tvAudio = path.match(/^\/api\/tilevoice\/audio\/([0-9a-f]{64})$/);
  if (tvAudio && req.method === "GET") {
    return tilevoiceUpstream(res, "GET", `/admin/v1/tile-voice/audio/${tvAudio[1]}`);
  }
  if (path === "/api/tilevoice/review" && req.method === "POST") {
    return tilevoiceUpstream(res, "POST", "/admin/v1/tile-voice/review", await readBody(req));
  }
  if (path === "/api/tilevoice/remint" && req.method === "POST") {
    const inBody = await readBody(req);
    // Remint (IPA): look the word's IPA up with the lab's Groq helper
    // when the founder didn't supply one — the Worker only mints, it
    // never guesses pronunciation.
    if (inBody.mode === "ipa" && !inBody.ipa) {
      try {
        let text = String(inBody.text ?? "");
        if (!text) {
          const rowRes = await tilevoiceFetch(`/admin/v1/tile-voice/row/${inBody.id}`);
          const row = rowRes?.ok ? (await rowRes.json())?.row : null;
          if (!row?.text) {
            json(res, 502, { error: "IPA lookup needs the clip row; admin row fetch failed" });
            return;
          }
          text = row.text;
        }
        const { ipa } = await lookupIpaGroq({ text });
        if (ipa) inBody.ipa = ipa;
      } catch (e) {
        json(res, 502, { error: `IPA lookup failed: ${e instanceof Error ? e.message : e}` });
        return;
      }
    }
    return tilevoiceUpstream(res, "POST", "/admin/v1/tile-voice/remint", inBody);
  }

  json(res, 404, { error: "not found" });
}

const invoked = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invoked) {
  loadEnv();
  createServer((req, res) => {
    handle(req, res).catch((err) => json(res, 500, { error: String(err) }));
  }).listen(PORT, "127.0.0.1", () => {
    console.log(`Pip AAC Grok explore review:  http://127.0.0.1:${PORT}/audio-review`);
    console.log(`Pip AAC ElevenLabs tile review: http://127.0.0.1:${PORT}/audio-review/elevenlabs-tiles`);
    console.log(`Pip AAC ElevenLabs v4 lab:       http://127.0.0.1:${PORT}/audio-review/elevenlabs-v4-lab`);
    console.log(`Pip AAC voice selector:          http://127.0.0.1:${PORT}/audio-review/elevenlabs-voice-selector`);
    console.log(
      `Pip AAC Eleven expressive probe: http://127.0.0.1:${PORT}/audio-review/elevenlabs-expressive`,
    );
    console.log(
      `Pip AAC Leo A/B (2 male voices): http://127.0.0.1:${PORT}/audio-review/elevenlabs-voice-selector — round leo-compare-001`,
    );
    console.log(
      `Pip AAC tile review (Eve):  http://127.0.0.1:${PORT}${tileReviewUrlForRun("gap-launch-food-2026-09-29", "elevenlabs-tiles-core")}`,
    );
    console.log(
      `Pip AAC tile review (Leo):  http://127.0.0.1:${PORT}${tileReviewUrlForRun("leo-pilot-10-1", ELEVENLABS_TILES_LEO_BATCH)}`,
    );
    console.log(`Pip AAC tile voice review:       http://127.0.0.1:${PORT}/audio-review/tile-voice`);
  });
}
