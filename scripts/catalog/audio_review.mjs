#!/usr/bin/env node
/**
 * Generated word-audio acceptance gate — deterministic acoustic auditor.
 * Ported from WorkbookBench `scripts/catalog/audio_review.mjs` (same rule set).
 *
 * Rule `activity_after_silence`: a lexical single word that goes quiet for
 * >= 160 ms and then speaks again (post-word pop, sniff acting, etc.) fails to
 * review.
 *
 *   node scripts/catalog/audio_review.mjs audit --file FILE --spoken TEXT [--json]
 *
 * Exit 0 = pass or not applicable, 1 = review, 2 = invalid invocation or a
 * missing dependency (ffmpeg).
 */

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const OUTCOME_PASS = "pass";
export const OUTCOME_REVIEW = "review";
export const OUTCOME_NOT_APPLICABLE = "not_applicable";

export const REASON_NOT_SINGLE_LEXICAL_WORD = "not_single_lexical_word";
export const REASON_ACTIVITY_AFTER_SILENCE = "activity_after_silence";
export const REASON_DECODE_FAILED = "decode_failed";
export const REASON_NO_ACTIVITY = "no_activity";

export const FRAME_MS = 20;
export const ACTIVE_THRESHOLD_DBFS = -40;
export const MIN_INTERNAL_SILENCE_MS = 160;
export const MIN_RENEWED_ACTIVITY_MS = 40;

/** Sub-gate residue: a sound that comes back after the word and holds, quieter than -40 dB. */
export const RESIDUE_SPEECH_DB = -36;
export const RESIDUE_CEILING_DB = -38;
export const RESIDUE_FLOOR_DB = -60;
export const RESIDUE_RISE_DB = 6;
export const RESIDUE_HOLD_MS = 100;
export const RESIDUE_LOOKBACK_MS = 80;

/** Slapback echo: the wave nearly dies, then a medium copy comes back. */
export const ECHO_QUIET_RATIO = 0.08;
export const ECHO_RETURN_RATIO = 0.12;
export const DECODE_SAMPLE_RATE = 16000;

const SINGLE_LEXICAL_WORD_RE = /^\p{L}+(?:['’\-]\p{L}+)*$/u;

export function isSingleLexicalWord(spokenText) {
  const text = String(spokenText ?? "").trim();
  if (!text) return false;
  return SINGLE_LEXICAL_WORD_RE.test(text);
}

export function frameRmsDbFs(pcm, start, length) {
  let sum = 0;
  for (let i = start; i < start + length; i += 1) {
    const s = pcm[i];
    sum += s * s;
  }
  if (sum === 0) return -Infinity;
  const rms = Math.sqrt(sum / length);
  return 20 * Math.log10(rms / 32768);
}

export function analyzePcm(
  pcm,
  {
    sampleRate = DECODE_SAMPLE_RATE,
    frameMs = FRAME_MS,
    activeThresholdDb = ACTIVE_THRESHOLD_DBFS,
    minSilenceMs = MIN_INTERNAL_SILENCE_MS,
    minRenewedMs = MIN_RENEWED_ACTIVITY_MS,
  } = {},
) {
  const frameSize = Math.max(1, Math.round((sampleRate * frameMs) / 1000));
  const frameCount = Math.floor(pcm.length / frameSize);
  const active = new Array(frameCount);
  for (let f = 0; f < frameCount; f += 1) {
    active[f] = frameRmsDbFs(pcm, f * frameSize, frameSize) > activeThresholdDb;
  }

  const durationMs = (pcm.length / sampleRate) * 1000;

  let first = 0;
  while (first < frameCount && !active[first]) first += 1;
  let last = frameCount - 1;
  while (last >= 0 && !active[last]) last -= 1;

  const hasActivity = first < frameCount && last >= 0 && first <= last;
  let longestInternalSilenceMs = 0;
  let activityAfterInternalSilenceMs = 0;
  let flag = null;

  if (hasActivity) {
    const minSilenceFrames = Math.ceil(minSilenceMs / frameMs);
    const minRenewedFrames = Math.ceil(minRenewedMs / frameMs);

    let i = first;
    while (i <= last) {
      if (!active[i]) {
        let j = i;
        while (j <= last && !active[j]) j += 1;
        const silenceMs = (j - i) * frameMs;
        let k = j;
        while (k <= last && active[k]) k += 1;
        const renewedMs = (k - j) * frameMs;
        if (silenceMs > longestInternalSilenceMs) {
          longestInternalSilenceMs = silenceMs;
          activityAfterInternalSilenceMs = renewedMs;
        }
        if (!flag && (j - i) >= minSilenceFrames && (k - j) >= minRenewedFrames) {
          flag = { code: REASON_ACTIVITY_AFTER_SILENCE, atMs: j * frameMs };
        }
        i = j;
      } else {
        i += 1;
      }
    }
  }

  return {
    hasActivity,
    durationMs,
    longestInternalSilenceMs,
    activityAfterInternalSilenceMs,
    flag,
  };
}

/**
 * A second sound under the -40 dB gate: after the word, level drops, then rises
 * by at least RESIDUE_RISE_DB and holds. The activity_after_silence rule cannot
 * see it. minute_plain.mp3 (batch-05) is the case; minute_period.mp3 is not.
 */
export function analyzeResidueShelf(
  pcm,
  {
    sampleRate = DECODE_SAMPLE_RATE,
    frameMs = FRAME_MS,
  } = {},
) {
  const frame = Math.max(1, Math.round((sampleRate * frameMs) / 1000));
  const dbs = [];
  for (let i = 0; i + frame <= pcm.length; i += frame) {
    dbs.push(frameRmsDbFs(pcm, i, frame));
  }
  let lastSpeech = -1;
  for (let i = 0; i < dbs.length; i += 1) {
    if (dbs[i] > RESIDUE_SPEECH_DB) lastSpeech = i;
  }
  const holdFrames = Math.ceil(RESIDUE_HOLD_MS / frameMs);
  const lookback = Math.ceil(RESIDUE_LOOKBACK_MS / frameMs);
  for (let i = lastSpeech + 1; i < dbs.length; i += 1) {
    const db = dbs[i];
    if (!(db <= RESIDUE_CEILING_DB && db > RESIDUE_FLOOR_DB)) continue;
    let quiet = db;
    const from = Math.max(lastSpeech + 1, i - lookback);
    for (let k = from; k < i; k += 1) quiet = Math.min(quiet, dbs[k]);
    if (db - quiet < RESIDUE_RISE_DB) continue;
    let held = 0;
    for (let k = i; k < dbs.length; k += 1) {
      const level = dbs[k];
      if (Math.abs(level - db) <= 3 && level <= RESIDUE_CEILING_DB && level > RESIDUE_FLOOR_DB) held += 1;
      else break;
    }
    if (held >= holdFrames) {
      return {
        detected: true,
        atMs: i * frameMs,
        riseDb: db - quiet,
        holdMs: held * frameMs,
      };
    }
  }
  return { detected: false, atMs: null, riseDb: 0, holdMs: 0 };
}

/**
 * After the peak, the level falls below 8% and later climbs back to at least
 * 12%. go_period.mp3 does this (the audible echo). A smooth decay does not.
 * A loud consonant can too, so the scorer only deducts when the voice is also
 * smeared: crest under 4 and a pitch drop of 48 Hz or more.
 */
export function analyzeEchoReturn(pcm, { sampleRate = DECODE_SAMPLE_RATE } = {}) {
  const hop = Math.max(1, Math.round(sampleRate * 0.01));
  const frames = [];
  for (let i = 0; i < pcm.length; i += hop) {
    let acc = 0;
    const n = Math.min(hop, pcm.length - i);
    for (let j = 0; j < n; j += 1) acc += pcm[i + j] * pcm[i + j];
    frames.push(Math.sqrt(acc / n));
  }
  const peak = frames.reduce((max, v) => Math.max(max, v), 0);
  if (peak === 0) return { detected: false, returnRatio: 0, atMs: null };
  let peakAt = 0;
  for (let i = 1; i < frames.length; i += 1) {
    if (frames[i] > frames[peakAt]) peakAt = i;
  }
  let quietAt = -1;
  for (let i = peakAt; i < frames.length; i += 1) {
    if (frames[i] / peak < ECHO_QUIET_RATIO) {
      quietAt = i;
      break;
    }
  }
  if (quietAt < 0) return { detected: false, returnRatio: 0, atMs: null };
  let back = 0;
  let at = quietAt;
  for (let i = quietAt; i < frames.length; i += 1) {
    if (frames[i] > back) {
      back = frames[i];
      at = i;
    }
  }
  const returnRatio = back / peak;
  return {
    detected: returnRatio >= ECHO_RETURN_RATIO,
    returnRatio,
    atMs: at * 10,
  };
}

export function decodePcmToMono16k(filePath, { spawn = spawnSync, ffmpegBinary = "ffmpeg" } = {}) {
  const result = spawn(
    ffmpegBinary,
    ["-v", "error", "-i", filePath, "-f", "s16le", "-acodec", "pcm_s16le", "-ac", "1", "-ar", String(DECODE_SAMPLE_RATE), "-vn", "-"],
    { encoding: null, maxBuffer: 256 * 1024 * 1024 },
  );
  if (result.error) {
    if (result.error.code === "ENOENT") {
      throw new Error(`ffmpeg not found (${ffmpegBinary}) — install ffmpeg to run the acoustic auditor`);
    }
    throw new Error(`ffmpeg failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderr = typeof result.stderr?.toString === "function" ? result.stderr.toString() : "";
    throw new Error(`ffmpeg decode failed (exit ${result.status})${stderr ? `: ${stderr.trim()}` : ""}`);
  }
  const bytes = result.stdout;
  if (!bytes || bytes.length < 2) {
    throw new Error("ffmpeg produced no PCM output");
  }
  const pcm = new Int16Array(bytes.length / 2);
  for (let i = 0; i < pcm.length; i += 1) {
    pcm[i] = bytes.readInt16LE(i * 2);
  }
  return { pcm, sampleRate: DECODE_SAMPLE_RATE };
}

export function hasFfmpeg({ spawn = spawnSync, ffmpegBinary = "ffmpeg" } = {}) {
  const result = spawn(ffmpegBinary, ["-version"], { encoding: null });
  return !result.error && result.status === 0;
}

export function auditGeneratedWordAudio({
  filePath,
  spokenText,
  decode = decodePcmToMono16k,
  analyze = analyzePcm,
} = {}) {
  if (!isSingleLexicalWord(spokenText)) {
    return {
      outcome: OUTCOME_NOT_APPLICABLE,
      reasons: [{ code: REASON_NOT_SINGLE_LEXICAL_WORD }],
      measurements: {},
    };
  }

  let decoded;
  try {
    decoded = decode(filePath);
  } catch (err) {
    return {
      outcome: OUTCOME_REVIEW,
      reasons: [{ code: REASON_DECODE_FAILED, detail: err instanceof Error ? err.message : String(err) }],
      measurements: {},
    };
  }

  const analysis = analyze(decoded.pcm, { sampleRate: decoded.sampleRate });

  if (!analysis.hasActivity) {
    return {
      outcome: OUTCOME_REVIEW,
      reasons: [{ code: REASON_NO_ACTIVITY }],
      measurements: {
        durationMs: analysis.durationMs,
        longestInternalSilenceMs: 0,
        activityAfterInternalSilenceMs: 0,
      },
    };
  }

  const measurements = {
    durationMs: analysis.durationMs,
    longestInternalSilenceMs: analysis.longestInternalSilenceMs,
    activityAfterInternalSilenceMs: analysis.activityAfterInternalSilenceMs,
  };

  if (analysis.flag) {
    return {
      outcome: OUTCOME_REVIEW,
      reasons: [{ code: analysis.flag.code, atMs: analysis.flag.atMs }],
      measurements,
    };
  }

  return { outcome: OUTCOME_PASS, reasons: [], measurements };
}

export function audioReviewCacheDir(root) {
  return join(root, ".cache", "audio-review");
}

export function saveReviewFailureReport({
  word,
  root,
  reasons,
  candidatePath,
  attemptCount,
  timestamp = new Date().toISOString(),
}) {
  const dir = audioReviewCacheDir(root);
  mkdirSync(dir, { recursive: true });
  const safe = String(word ?? "").replace(/[^a-zA-Z0-9]+/g, "-");
  const stamp = String(timestamp ?? "").replace(/[^0-9a-zA-Z]/g, "");
  const base = join(dir, `${safe}-${stamp}`);
  const candidateDest = `${base}.mp3`;
  const reportPath = `${base}.json`;
  if (candidatePath && existsSync(candidatePath)) {
    copyFileSync(candidatePath, candidateDest);
  }
  const report = {
    word,
    outcome: OUTCOME_REVIEW,
    attemptCount,
    reasons,
    candidatePath: candidateDest,
    reviewedAt: timestamp,
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { reportPath, candidatePath: candidateDest, report };
}

export function renderAudioReviewFailure(word, reasons, { candidatePath, reportPath, attemptCount }) {
  const codes = [...new Set((reasons ?? []).map((r) => r?.code).filter(Boolean))];
  return [
    `audio review: ${JSON.stringify(word)} failed ${attemptCount} attempts`,
    codes.length > 0 ? `reasons: ${codes.join(", ")}` : null,
    `report: ${reportPath}`,
    `candidate: ${candidatePath}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function parseCliArgs(argv) {
  const out = { file: null, spoken: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--file") {
      out.file = argv[i + 1];
      i += 1;
    } else if (arg === "--spoken") {
      out.spoken = argv[i + 1];
      i += 1;
    } else if (arg === "--json") {
      out.json = true;
    } else {
      throw new Error(`unknown flag: ${arg}`);
    }
  }
  return out;
}

export function renderHuman(result) {
  if (result.outcome === OUTCOME_NOT_APPLICABLE) {
    return `not_applicable (${result.reasons[0]?.code ?? "unknown"})`;
  }
  if (result.outcome === OUTCOME_REVIEW) {
    const reason = result.reasons[0] ?? {};
    return `review ${reason.code}${reason.atMs != null ? ` at ${reason.atMs}ms` : ""}`;
  }
  return "pass";
}

const USAGE = "usage: node scripts/catalog/audio_review.mjs audit --file FILE --spoken TEXT [--json]";

export function cliMain(
  argv,
  {
    stdout = console.log,
    stderr = console.error,
    hasFfmpeg: hasFfmpegImpl = hasFfmpeg,
    audit = auditGeneratedWordAudio,
  } = {},
) {
  const cmd = argv[0];
  if (cmd !== "audit") {
    stderr(USAGE);
    return 2;
  }
  let args;
  try {
    args = parseCliArgs(argv.slice(1));
  } catch (err) {
    stderr(err instanceof Error ? err.message : String(err));
    stderr(USAGE);
    return 2;
  }
  if (!args.file || !args.spoken) {
    stderr(USAGE);
    return 2;
  }

  if (!isSingleLexicalWord(args.spoken)) {
    const result = {
      outcome: OUTCOME_NOT_APPLICABLE,
      reasons: [{ code: REASON_NOT_SINGLE_LEXICAL_WORD }],
      measurements: {},
    };
    if (args.json) stdout(JSON.stringify(result));
    else stdout(renderHuman(result));
    return 0;
  }

  if (!hasFfmpegImpl()) {
    stderr("missing dependency: ffmpeg is not available on PATH");
    return 2;
  }

  const result = audit({ filePath: args.file, spokenText: args.spoken });
  if (args.json) stdout(JSON.stringify(result));
  else stdout(renderHuman(result));
  return result.outcome === OUTCOME_REVIEW ? 1 : 0;
}

const invoked = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked) {
  process.exit(cliMain(process.argv.slice(2)));
}
