#!/usr/bin/env node
/**
 * Batch acoustic scan for local MP3 takes: prosody metrics + activity_after_silence gate.
 *
 *   node scripts/catalog/scan_local_audio.mjs data/samples/approved/*.mp3
 *   node scripts/catalog/scan_local_audio.mjs --manifest data/samples/approved/manifest.json path/to/clips/*.mp3
 *
 * Writes JSON under `.cache/audio-review/scan-<timestamp>.json` (gitignored).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { repoRoot } from "./paths.mjs";
import { measureAcousticTake } from "./audio_metrics.mjs";
import {
  audioReviewCacheDir,
  auditGeneratedWordAudio,
  hasFfmpeg,
  isSingleLexicalWord,
  OUTCOME_REVIEW,
} from "./audio_review.mjs";

function parseArgv(argv) {
  const out = { files: [], manifest: null, jsonOnly: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--manifest") {
      out.manifest = argv[i + 1];
      i += 1;
    } else if (arg === "--json") {
      out.jsonOnly = true;
    } else if (arg === "--help" || arg === "-h") {
      out.help = true;
    } else {
      out.files.push(arg);
    }
  }
  return out;
}

function loadManifestWordByFile(manifestPath) {
  if (!manifestPath || !existsSync(manifestPath)) return new Map();
  const data = JSON.parse(readFileSync(manifestPath, "utf8"));
  const map = new Map();
  for (const clip of data.clips ?? []) {
    if (clip?.file && clip?.word) map.set(clip.file, clip.word);
  }
  return map;
}

/** Guess spoken label from filename when no manifest row exists. */
export function inferSpokenFromFilename(filePath) {
  const base = basename(filePath).replace(/\.[^.]+$/, "");
  const stripped = base.replace(/^ara_/, "");
  if (isSingleLexicalWord(stripped)) return stripped;
  if (isSingleLexicalWord(base)) return base;
  return null;
}

function resolveSpoken(filePath, manifestMap) {
  const fromManifest = manifestMap.get(basename(filePath));
  if (fromManifest && isSingleLexicalWord(fromManifest)) return fromManifest;
  return inferSpokenFromFilename(filePath);
}

function scanOne(filePath, spoken) {
  const metrics = measureAcousticTake(filePath);
  let gate = null;
  if (spoken) {
    gate = auditGeneratedWordAudio({ filePath, spokenText: spoken });
  }
  return {
    file: filePath,
    spoken,
    metrics,
    gate,
    flagged: gate?.outcome === OUTCOME_REVIEW,
  };
}

const USAGE = `usage:
  node scripts/catalog/scan_local_audio.mjs [--manifest PATH] [--json] <files...>

  --manifest  map basename -> spoken word (e.g. data/samples/approved/manifest.json)
  --json      print report JSON only (no human summary)`;

export function runScanCli(argv, { stdout = console.log, stderr = console.error } = {}) {
  const args = parseArgv(argv);
  if (args.help || args.files.length === 0) {
    stdout(USAGE);
    return args.help ? 0 : 1;
  }
  if (!hasFfmpeg()) {
    stderr("missing dependency: ffmpeg is not available on PATH");
    return 2;
  }

  const manifestMap = loadManifestWordByFile(args.manifest);
  const rows = [];
  for (const filePath of args.files) {
    if (!existsSync(filePath)) {
      stderr(`skip missing: ${filePath}`);
      continue;
    }
    const spoken = resolveSpoken(filePath, manifestMap);
    try {
      rows.push(scanOne(filePath, spoken));
    } catch (err) {
      rows.push({
        file: filePath,
        spoken,
        error: err instanceof Error ? err.message : String(err),
        flagged: true,
      });
    }
  }

  const flagged = rows.filter((r) => r.flagged);
  const generatedAt = new Date().toISOString();
  const report = {
    schema: "pippaac.local-audio-scan.v1",
    generatedAt,
    scanned: rows.length,
    flagged: flagged.length,
    rows: rows.map((r) => ({
      file: r.file,
      spoken: r.spoken,
      outcome: r.gate?.outcome ?? (r.error ? "error" : "no_gate"),
      reasons: r.gate?.reasons ?? (r.error ? [{ code: "scan_error", detail: r.error }] : []),
      measurements: r.gate?.measurements ?? {},
      metrics: r.metrics
        ? {
            duration: r.metrics.duration,
            meanVol: r.metrics.meanVol,
            maxVol: r.metrics.maxVol,
            pitchStr: r.metrics.pitchStr,
            peakPos: r.metrics.peakPos,
          }
        : null,
    })),
  };

  const cacheDir = audioReviewCacheDir(repoRoot);
  mkdirSync(cacheDir, { recursive: true });
  const stamp = generatedAt.replace(/[:.]/g, "").replace("Z", "Z");
  const reportPath = join(cacheDir, `scan-${stamp}.json`);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  if (args.jsonOnly) {
    stdout(JSON.stringify({ ...report, reportPath }, null, 2));
  } else {
    stdout(`\nLocal audio scan — ${flagged.length} flagged of ${rows.length} (${generatedAt})`);
    stdout(`Report: ${reportPath}\n`);
    if (flagged.length === 0) {
      stdout("No acoustic gate flags. Listen anyway before shipping.\n");
    } else {
      for (const row of flagged) {
        const reason = row.gate?.reasons?.[0];
        const code = reason?.code ?? row.error ?? "unknown";
        const at = reason?.atMs != null ? ` @ ${reason.atMs}ms` : "";
        const tail = row.gate?.measurements?.activityAfterInternalSilenceMs;
        const tailHint = tail != null ? ` tail ${Math.round(tail)}ms` : "";
        stdout(`• ${basename(row.file)} (${row.spoken ?? "?"}) — ${code}${at}${tailHint}`);
        if (row.spoken) {
          stdout(
            `    heal: npm run catalog:audio:inspect -- trim heal --file ${JSON.stringify(row.file)} --spoken ${JSON.stringify(row.spoken)}`,
          );
          stdout(`    burst: npm run catalog:audio:inspect -- fix-burst --in ${JSON.stringify(row.file)} --out ...`);
        }
      }
      stdout("");
    }
  }

  return flagged.length > 0 ? 1 : 0;
}

const invoked = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked) {
  process.exit(runScanCli(process.argv.slice(2)));
}
