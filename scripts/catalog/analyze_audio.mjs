#!/usr/bin/env node
/**
 * Acoustic analysis for voice clips and TTS takes.
 * Prefer the unified CLI: `node scripts/catalog/audio_inspect.mjs analyze ...`
 */

import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { formatAcousticTakeReport, measureAcousticTake } from "./audio_metrics.mjs";
import {
  auditGeneratedWordAudio,
  hasFfmpeg,
  isSingleLexicalWord,
  renderHuman,
} from "./audio_review.mjs";
import { inferSpokenFromFilename } from "./scan_local_audio.mjs";

function parseArgv(argv) {
  const out = { files: [], spoken: null, gate: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--spoken") {
      out.spoken = argv[i + 1];
      i += 1;
    } else if (arg === "--gate") {
      out.gate = true;
    } else if (arg === "--json") {
      out.json = true;
    } else if (arg === "--help" || arg === "-h") {
      out.help = true;
    } else {
      out.files.push(arg);
    }
  }
  return out;
}

const USAGE = `Usage:
  node scripts/catalog/analyze_audio.mjs [--gate] [--spoken WORD] [--json] <files...>

  Or: node scripts/catalog/audio_inspect.mjs analyze ...`;

function spokenForFile(filePath, globalSpoken) {
  if (globalSpoken) return globalSpoken.trim();
  return inferSpokenFromFilename(filePath);
}

export function cliMain(argv, { stdout = console.log, stderr = console.error } = {}) {
  const args = parseArgv(argv);
  if (args.help || args.files.length === 0) {
    stdout(USAGE);
    return args.files.length === 0 ? 1 : 0;
  }
  if (!hasFfmpeg()) {
    stderr("missing dependency: ffmpeg is not available on PATH");
    return 2;
  }

  const results = [];
  let anyReview = false;

  for (const filePath of args.files) {
    if (!existsSync(filePath)) {
      stderr(`File not found: ${filePath}`);
      continue;
    }
    const metrics = measureAcousticTake(filePath);
    const spoken = spokenForFile(filePath, args.spoken);
    let gate = null;
    if (args.gate || args.spoken) {
      if (spoken && isSingleLexicalWord(spoken)) {
        gate = auditGeneratedWordAudio({ filePath, spokenText: spoken });
        if (gate.outcome === "review") anyReview = true;
      } else if (args.gate) {
        gate = {
          outcome: "not_applicable",
          reasons: [{ code: "no_spoken_label", detail: `could not infer word from ${basename(filePath)}` }],
        };
      }
    }
    results.push({ filePath, spoken, metrics, gate });
  }

  if (args.json) {
    stdout(JSON.stringify(results, null, 2));
    return anyReview ? 1 : 0;
  }

  stdout("\n==================== ACOUSTIC TAKE ANALYSIS ====================");
  for (const r of results) {
    stdout(`\n${formatAcousticTakeReport(r.metrics)}`);
    if (r.gate) {
      const label = r.spoken ? `spoken=${r.spoken}` : "gate";
      stdout(`  Acoustic gate (${label}): ${renderHuman(r.gate)}`);
      if (r.gate.measurements?.longestInternalSilenceMs != null) {
        const m = r.gate.measurements;
        stdout(
          `    gap ${Math.round(m.longestInternalSilenceMs)}ms · renewed tail ${Math.round(m.activityAfterInternalSilenceMs)}ms`,
        );
      }
      if (r.gate.outcome === "review" && r.spoken) {
        stdout(
          `    heal: npm run catalog:audio:inspect -- trim heal --file ${JSON.stringify(r.filePath)} --spoken ${JSON.stringify(r.spoken)}`,
        );
        stdout(
          `    or:   npm run catalog:audio:inspect -- fix-burst --in ${JSON.stringify(r.filePath)} --out ${JSON.stringify(r.filePath.replace(/\.[^.]+$/, "_burstfix.mp3"))}`,
        );
      }
    }
  }
  stdout("\n=================================================================\n");
  return anyReview ? 1 : 0;
}

const invoked = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked) {
  process.exit(cliMain(process.argv.slice(2)));
}
