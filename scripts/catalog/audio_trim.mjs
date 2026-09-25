#!/usr/bin/env node
/**
 * Local tail trim for TTS takes (PCM-exact, 50 ms steps). Ported from
 * WorkbookBench `scripts/catalog/review/audioTrim.mjs` — no catalog/R2 upload.
 *
 *   node scripts/catalog/audio_trim.mjs --in FILE --out FILE --ms 50
 *   node scripts/catalog/audio_trim.mjs heal --file FILE --spoken WORD [--out FILE]
 */

import { spawnSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  auditGeneratedWordAudio,
  hasFfmpeg,
  OUTCOME_PASS,
  REASON_ACTIVITY_AFTER_SILENCE,
} from "./audio_review.mjs";

export const AUDIO_TAIL_TRIM_STEP_MS = 50;

function trimFailure(message, trimTailMs) {
  const err = new Error(message);
  err.trimTailMs = trimTailMs;
  return err;
}

/** Re-encode one MP3 ending at exactly `trimTailMs` before its source end. */
export function trimAudioTail({ sourcePath, destPath, trimTailMs, spawn = spawnSync } = {}) {
  if (!Number.isInteger(trimTailMs) || trimTailMs < AUDIO_TAIL_TRIM_STEP_MS) {
    throw new Error(`trimTailMs must be an integer of at least ${AUDIO_TAIL_TRIM_STEP_MS}`);
  }
  const probe = spawn(
    "ffprobe",
    ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=sample_rate,channels", "-of", "json", sourcePath],
    { encoding: "utf8" },
  );
  let stream;
  try {
    stream = JSON.parse(String(probe.stdout ?? "")).streams?.[0];
  } catch {
    stream = null;
  }
  const sampleRate = Number(stream?.sample_rate);
  const channels = Number(stream?.channels);
  if (probe.error || probe.status !== 0 || !Number.isInteger(sampleRate) || !Number.isInteger(channels)) {
    const detail = `${probe.stderr ?? ""}`.trim();
    throw new Error(`could not read audio stream${detail ? `: ${detail}` : ""}`);
  }
  const decoded = spawn(
    "ffmpeg",
    ["-v", "error", "-i", sourcePath, "-f", "s16le", "-acodec", "pcm_s16le", "-"],
    { maxBuffer: 128 * 1024 * 1024 },
  );
  const pcm = Buffer.isBuffer(decoded.stdout) ? decoded.stdout : Buffer.from(decoded.stdout ?? "");
  const frameBytes = channels * 2;
  const trimBytes = Math.round((trimTailMs / 1000) * sampleRate) * frameBytes;
  if (decoded.error || decoded.status !== 0 || trimBytes >= pcm.length) {
    const detail = `${decoded.stderr ?? ""}`.trim();
    if (trimBytes >= pcm.length) throw trimFailure("trim would remove the entire take", trimTailMs);
    throw new Error(`could not decode audio${detail ? `: ${detail}` : ""}`);
  }
  const outputPcm = pcm.subarray(0, pcm.length - trimBytes);
  const result = spawn(
    "ffmpeg",
    [
      "-y",
      "-f",
      "s16le",
      "-ar",
      String(sampleRate),
      "-ac",
      String(channels),
      "-i",
      "-",
      "-codec:a",
      "libmp3lame",
      "-b:a",
      "128k",
      destPath,
    ],
    { encoding: "utf8", input: outputPcm, maxBuffer: 128 * 1024 * 1024 },
  );
  if (result.error || result.status !== 0 || !existsSync(destPath)) {
    const detail = `${result.stderr ?? ""}`.trim();
    throw new Error(`could not trim audio${detail ? `: ${detail}` : ""}`);
  }
}

/**
 * Try cumulative tail trims until the acoustic gate passes or we exhaust steps.
 * Always trims from the original source file (not from a prior lossy encode).
 */
export function healWordAudioTail({
  sourcePath,
  spokenText,
  destPath,
  maxTrimMs = 500,
  audit = auditGeneratedWordAudio,
  trim = trimAudioTail,
} = {}) {
  if (!existsSync(sourcePath)) throw new Error(`source not found: ${sourcePath}`);
  const steps = [];
  let bestPartial = null;
  for (let ms = AUDIO_TAIL_TRIM_STEP_MS; ms <= maxTrimMs; ms += AUDIO_TAIL_TRIM_STEP_MS) {
    const candidate = destPath ? destPath : join(dirname(sourcePath), `_heal_${ms}ms_${basename(sourcePath)}`);
    trim({ sourcePath, destPath: candidate, trimTailMs: ms });
    const verdict = audit({ filePath: candidate, spokenText });
    const onlyTailFlag =
      verdict.outcome !== OUTCOME_PASS &&
      (verdict.reasons ?? []).length > 0 &&
      (verdict.reasons ?? []).every((r) => r?.code === REASON_ACTIVITY_AFTER_SILENCE);
    steps.push({ trimTailMs: ms, candidatePath: candidate, verdict });
    if (verdict.outcome === OUTCOME_PASS) {
      return { ok: true, trimTailMs: ms, candidatePath: candidate, steps };
    }
    if (onlyTailFlag) {
      bestPartial = { trimTailMs: ms, candidatePath: candidate };
      if (destPath) {
        return {
          ok: false,
          trimTailMs: ms,
          candidatePath: candidate,
          steps,
          hint: "still flags activity_after_silence — listen and trim another 50ms or re-mint",
        };
      }
      continue;
    }
    if (!destPath && existsSync(candidate)) {
      try {
        unlinkSync(candidate);
      } catch {
        // ignore
      }
    }
  }
  if (bestPartial) {
    return {
      ok: false,
      trimTailMs: bestPartial.trimTailMs,
      candidatePath: bestPartial.candidatePath,
      steps,
      hint: "still flags activity_after_silence — listen and trim another 50ms or re-mint",
    };
  }
  return { ok: false, trimTailMs: null, candidatePath: null, steps };
}

function parseTrimArgv(argv) {
  const out = { in: null, out: null, ms: null, command: null, file: null, spoken: null, maxTrimMs: 500 };
  if (argv[0] === "heal") {
    out.command = "heal";
    for (let i = 1; i < argv.length; i += 1) {
      const arg = argv[i];
      if (arg === "--file") {
        out.file = argv[i + 1];
        i += 1;
      } else if (arg === "--spoken") {
        out.spoken = argv[i + 1];
        i += 1;
      } else if (arg === "--out") {
        out.out = argv[i + 1];
        i += 1;
      } else if (arg === "--max-ms") {
        out.maxTrimMs = Number(argv[i + 1]);
        i += 1;
      } else {
        throw new Error(`unknown flag: ${arg}`);
      }
    }
    return out;
  }
  out.command = "trim";
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--in") {
      out.in = argv[i + 1];
      i += 1;
    } else if (arg === "--out") {
      out.out = argv[i + 1];
      i += 1;
    } else if (arg === "--ms") {
      out.ms = Number(argv[i + 1]);
      i += 1;
    } else {
      throw new Error(`unknown flag: ${arg}`);
    }
  }
  return out;
}

const TRIM_USAGE =
  "usage:\n" +
  "  node scripts/catalog/audio_trim.mjs --in FILE --out FILE --ms 50\n" +
  "  node scripts/catalog/audio_trim.mjs heal --file FILE --spoken WORD [--out FILE] [--max-ms 500]";

export function cliMain(argv, { stdout = console.log, stderr = console.error } = {}) {
  let args;
  try {
    args = parseTrimArgv(argv);
  } catch (err) {
    stderr(err instanceof Error ? err.message : String(err));
    stderr(TRIM_USAGE);
    return 2;
  }
  if (!hasFfmpeg()) {
    stderr("missing dependency: ffmpeg is not available on PATH");
    return 2;
  }
  if (args.command === "trim") {
    if (!args.in || !args.out || !args.ms) {
      stderr(TRIM_USAGE);
      return 2;
    }
    trimAudioTail({ sourcePath: args.in, destPath: args.out, trimTailMs: args.ms });
    stdout(`trimmed ${args.ms}ms tail -> ${args.out}`);
    return 0;
  }
  if (args.command === "heal") {
    if (!args.file || !args.spoken) {
      stderr(TRIM_USAGE);
      return 2;
    }
    const result = healWordAudioTail({
      sourcePath: args.file,
      spokenText: args.spoken,
      destPath: args.out,
      maxTrimMs: args.maxTrimMs,
    });
    if (result.ok) {
      stdout(`pass after ${result.trimTailMs}ms trim -> ${result.candidatePath}`);
      return 0;
    }
    if (result.candidatePath) {
      stdout(
        `best effort ${result.trimTailMs}ms -> ${result.candidatePath}${result.hint ? ` (${result.hint})` : ""}`,
      );
      return 1;
    }
    stderr("heal failed — no trim produced an audible candidate");
    return 1;
  }
  stderr(TRIM_USAGE);
  return 2;
}

const invoked = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked) {
  process.exit(cliMain(process.argv.slice(2)));
}
