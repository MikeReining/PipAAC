/**
 * Detached final-stop burst repair — finds a quiet gap then a short energy bump
 * at the end of a take (Grok doc §1.9) and cuts before the burst with a short fade.
 *
 * Ported from the ad-hoc batch-04 stop-fix script (RMS scan + 12ms fade).
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { decodePcmToMono16k, hasFfmpeg } from "./audio_review.mjs";

export function rmsFrames(samples, sr, hopSec = 0.005) {
  const hop = Math.max(1, Math.round(sr * hopSec));
  const frames = [];
  let peak = 0;
  for (let i = 0; i < samples.length; i += hop) {
    let acc = 0;
    const n = Math.min(hop, samples.length - i);
    for (let j = 0; j < n; j += 1) acc += samples[i + j] * samples[i + j];
    const rms = Math.sqrt(acc / n);
    if (rms > peak) peak = rms;
    frames.push({ at: i, rms });
  }
  return { hop, frames, peak };
}

/**
 * Sample index to keep through (exclusive end = cut before burst). If no burst,
 * returns samples.length.
 */
export function findDetachedBurstCutSample(
  samples,
  sr,
  {
    hopSec = 0.005,
    silentRatio = 0.04,
    burstRatio = 0.12,
    minQuietSec = 0.025,
    searchStartRatio = 0.35,
  } = {},
) {
  const { hop, frames, peak } = rmsFrames(samples, sr, hopSec);
  if (peak === 0 || frames.length < 3) return samples.length;

  const silent = peak * silentRatio;
  const burst = peak * burstRatio;
  let burstStart = -1;
  const minFrame = Math.floor(frames.length * searchStartRatio);

  for (let i = frames.length - 2; i > minFrame; i -= 1) {
    if (frames[i].rms < silent && frames[i + 1].rms > burst) {
      burstStart = frames[i + 1].at;
      let quiet = 0;
      for (let k = i; k >= 0 && frames[k].rms < silent; k -= 1) quiet += 1;
      if (quiet * hop >= sr * minQuietSec) break;
      burstStart = -1;
    }
  }
  return burstStart < 0 ? samples.length : burstStart;
}

/** Apply linear fade on the last `fadeSec` of kept audio (in-place on a copy). */
export function applyEndFade(samples, cutSample, sr, fadeSec = 0.012) {
  const out = samples.subarray(0, cutSample);
  const fade = Math.round(sr * fadeSec);
  for (let i = 0; i < fade && i < out.length; i += 1) {
    const g = i / fade;
    out[out.length - 1 - i] = Math.round(out[out.length - 1 - i] * g);
  }
  return out;
}

/**
 * A final consonant is a short release that peaks under 30% of the vowel and
 * then falls. An echo or a second syllable keeps rising after the gap.
 */
export function isConsonantRelease(samples, sr, cutSample) {
  if (cutSample >= samples.length) return false;
  const hop = Math.max(1, Math.round(sr * 0.01));
  let vowelPeak = 0;
  for (let i = 0; i < cutSample; i += hop) {
    let acc = 0;
    const n = Math.min(hop, cutSample - i);
    for (let j = 0; j < n; j += 1) acc += samples[i + j] * samples[i + j];
    vowelPeak = Math.max(vowelPeak, Math.sqrt(acc / n));
  }
  if (vowelPeak === 0) return false;
  const frames = [];
  for (let i = cutSample; i < samples.length; i += hop) {
    let acc = 0;
    const n = Math.min(hop, samples.length - i);
    for (let j = 0; j < n; j += 1) acc += samples[i + j] * samples[i + j];
    frames.push(Math.sqrt(acc / n) / vowelPeak);
  }
  let start = 0;
  while (start < frames.length && frames[start] < 0.05) start += 1;
  if (start >= frames.length) return false;
  const peak = frames[start];
  if (peak > 0.3) return false;
  for (let i = start + 1; i < Math.min(frames.length, start + 6); i += 1) {
    if (frames[i] > peak + 0.02) return false;
  }
  return true;
}

/**
 * Cut only a click in the last 80 ms that sits after a quiet stretch.
 * aga_bad_raw.mp3 keeps the /d/ this way. fix-burst cut that release off
 * and left 0.40 s.
 * @returns {number} sample index to keep through
 */
/**
 * Cut before a long silent gap (and any terminal spike) after the word.
 * @returns {number} exclusive end index, or samples.length if no long tail
 */
export function findLongTailCutSample(
  samples,
  sr,
  {
    hopMs = 10,
    peakRatio = 0.02,
    silenceRatio = 0.015,
    minSpeechMs = 150,
    minGapMs = 300,
    padMs = 80,
  } = {},
) {
  const hop = Math.max(1, Math.round(sr * (hopMs / 1000)));
  const frames = [];
  for (let i = 0; i < samples.length; i += hop) {
    let acc = 0;
    const n = Math.min(hop, samples.length - i);
    for (let j = 0; j < n; j += 1) acc += samples[i + j] * samples[i + j];
    frames.push({ i, rms: Math.sqrt(acc / n) });
  }
  const peak = frames.reduce((m, f) => Math.max(m, f.rms), 0);
  if (peak === 0) return samples.length;

  const isLoud = (f) => f.rms >= peak * peakRatio;
  const isQuiet = (f) => f.rms < peak * silenceRatio;

  let speechRunMs = 0;
  for (let i = 0; i < frames.length; i += 1) {
    speechRunMs = isLoud(frames[i]) ? speechRunMs + hopMs : 0;
    if (speechRunMs < minSpeechMs) continue;

    let quietMs = 0;
    for (let j = i + 1; j < frames.length; j += 1) {
      if (isQuiet(frames[j]) || frames[j].rms < peak * peakRatio) quietMs += hopMs;
      else quietMs = 0;
      if (quietMs < minGapMs) continue;

      let loudTailFrames = 0;
      for (let k = j + 1; k < frames.length; k += 1) {
        if (isLoud(frames[k])) loudTailFrames += 1;
      }
      // Terminal spike only — not speech after a mid-word pause.
      if (loudTailFrames > 2) continue;

      const trailingMs = ((samples.length - (frames[i].i + hop)) / sr) * 1000;
      if (trailingMs < minGapMs) continue;

      const cut = frames[i].i + hop + Math.round(sr * (padMs / 1000));
      return Math.min(samples.length, cut);
    }
  }
  return samples.length;
}

/**
 * Long quiet run from the file end (optional terminal spike), then speech.
 */
export function findTerminalTailCutSample(
  samples,
  sr,
  {
    hopMs = 10,
    peakRatio = 0.02,
    minTailQuietMs = 300,
    padMs = 80,
    maxTerminalLoudFrames = 2,
  } = {},
) {
  const hop = Math.max(1, Math.round(sr * (hopMs / 1000)));
  const frames = [];
  for (let i = 0; i < samples.length; i += hop) {
    let acc = 0;
    const n = Math.min(hop, samples.length - i);
    for (let j = 0; j < n; j += 1) acc += samples[i + j] * samples[i + j];
    frames.push({ i, rms: Math.sqrt(acc / n) });
  }
  const peak = frames.reduce((m, f) => Math.max(m, f.rms), 0);
  if (peak === 0) return samples.length;
  const isLoud = (f) => f.rms >= peak * peakRatio;

  let i = frames.length - 1;
  let terminalLoud = 0;
  while (i >= 0 && isLoud(frames[i]) && terminalLoud < maxTerminalLoudFrames) {
    terminalLoud += 1;
    i -= 1;
  }
  let quietFrames = 0;
  while (i >= 0 && !isLoud(frames[i])) {
    quietFrames += 1;
    i -= 1;
  }
  if (quietFrames * hopMs < minTailQuietMs || i < 0) return samples.length;

  const cut = frames[i].i + hop + Math.round(sr * (padMs / 1000));
  return Math.min(samples.length, cut);
}

/**
 * Gentle click trim, or a long padded tail when ElevenLabs returns ~3s.
 */
export function resolveBackupEndCutSample(
  samples,
  sr,
  { minTrailingTailMs = 350, speechPadMs = 80, longTakeMs = 1200 } = {},
) {
  const totalMs = (samples.length / sr) * 1000;
  let speechCut = samples.length;
  if (totalMs >= longTakeMs) {
    speechCut = findTerminalTailCutSample(samples, sr, { padMs: speechPadMs });
  }
  if (speechCut >= samples.length) {
    speechCut = findLongTailCutSample(samples, sr, { padMs: speechPadMs });
  }
  const trailingMs = ((samples.length - speechCut) / sr) * 1000;
  if (speechCut < samples.length && trailingMs >= minTrailingTailMs) {
    return { cutSample: speechCut, mode: "trailing_tail", trailingMs, totalMs };
  }
  const gentle = gentleEndCutSample(samples, sr);
  const gentleTrailingMs = ((samples.length - gentle) / sr) * 1000;
  if (gentle < samples.length) {
    return { cutSample: gentle, mode: "gentle_click", trailingMs: gentleTrailingMs, totalMs };
  }
  return { cutSample: samples.length, mode: "none", trailingMs: 0, totalMs };
}

export function gentleEndCutSample(samples, sr) {
  const hop = Math.max(1, Math.round(sr * 0.01));
  const frames = [];
  for (let i = 0; i < samples.length; i += hop) {
    let acc = 0;
    const n = Math.min(hop, samples.length - i);
    for (let j = 0; j < n; j += 1) acc += samples[i + j] * samples[i + j];
    frames.push(Math.sqrt(acc / n));
  }
  const peak = frames.reduce((max, v) => Math.max(max, v), 0);
  if (peak === 0) return samples.length;
  const windowStart = Math.max(0, frames.length - 8);
  let clickAt = -1;
  for (let i = windowStart; i < frames.length; i += 1) {
    if (frames[i] / peak < 0.02) continue;
    let quiet = 0;
    for (let k = Math.max(0, i - 5); k < i; k += 1) {
      if (frames[k] / peak < 0.015) quiet += 1;
    }
    if (quiet >= 4) clickAt = i;
  }
  if (clickAt < 0) return samples.length;
  return Math.min(samples.length, clickAt * hop);
}

export function analyzeDetachedBurst(samples, sr, opts) {
  const cutSample = findDetachedBurstCutSample(samples, sr, opts);
  const burstDetected = cutSample < samples.length;
  return {
    cutSample,
    burstDetected,
    consonantRelease: burstDetected && isConsonantRelease(samples, sr, cutSample),
    keptMs: (cutSample / sr) * 1000,
    totalMs: (samples.length / sr) * 1000,
  };
}

function writePcmWav(path, sr, samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i += 1) data.writeInt16LE(samples[i], i * 2);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sr, 24);
  header.writeUInt32LE(sr * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([header, data]));
}

/**
 * Decode → detect burst → fade → encode MP3.
 * @returns {{ burstDetected: boolean, keptMs: number, totalMs: number }}
 */
/**
 * Fade off a terminal click. Does not remove a detached consonant.
 * @returns {{ keptMs: number, totalMs: number, trimmed: boolean }}
 */
export function gentleEndTrim({
  sourcePath,
  destPath,
  decode = decodePcmToMono16k,
  spawn = spawnSync,
  fadeSec = 0.02,
  minTrailingTailMs = 350,
  speechPadMs = 80,
} = {}) {
  const { pcm, sampleRate: sr } = decode(sourcePath);
  const resolved = resolveBackupEndCutSample(pcm, sr, { minTrailingTailMs, speechPadMs });
  const cutSample = resolved.cutSample;
  const faded = applyEndFade(pcm, cutSample, sr, fadeSec);
  const wav = join(tmpdir(), `pip-gentle-${process.pid}-${Date.now()}.wav`);
  writePcmWav(wav, sr, faded);
  const result = spawn(
    "ffmpeg",
    ["-y", "-v", "error", "-i", wav, "-codec:a", "libmp3lame", "-b:a", "128k", destPath],
    { encoding: "utf8" },
  );
  if (result.error || result.status !== 0 || !existsSync(destPath)) {
    const detail = `${result.stderr ?? ""}`.trim();
    throw new Error(`could not encode gently trimmed audio${detail ? `: ${detail}` : ""}`);
  }
  return {
    keptMs: (cutSample / sr) * 1000,
    totalMs: resolved.totalMs,
    trimmed: cutSample < pcm.length,
    trimMode: resolved.mode,
    trailingMsRemoved: resolved.mode === "trailing_tail" ? resolved.trailingMs : undefined,
  };
}

export function fixDetachedBurst({
  sourcePath,
  destPath,
  decode = decodePcmToMono16k,
  spawn = spawnSync,
  fadeSec = 0.012,
} = {}) {
  const { pcm, sampleRate: sr } = decode(sourcePath);
  const analysis = analyzeDetachedBurst(pcm, sr);
  const faded = applyEndFade(pcm, analysis.cutSample, sr, fadeSec);
  const wav = join(tmpdir(), `pip-burst-${process.pid}-${Date.now()}.wav`);
  writePcmWav(wav, sr, faded);
  const result = spawn(
    "ffmpeg",
    ["-y", "-v", "error", "-i", wav, "-codec:a", "libmp3lame", "-b:a", "128k", destPath],
    { encoding: "utf8" },
  );
  if (result.error || result.status !== 0 || !existsSync(destPath)) {
    const detail = `${result.stderr ?? ""}`.trim();
    throw new Error(`could not encode burst-fixed audio${detail ? `: ${detail}` : ""}`);
  }
  return {
    burstDetected: analysis.burstDetected,
    keptMs: analysis.keptMs,
    totalMs: analysis.totalMs,
  };
}

/** Manifest rows with `source` + detached-burst note → [srcPath, destPath]. */
export function burstFixPairsFromManifest(manifestPath, dir) {
  const rows = JSON.parse(readFileSync(manifestPath, "utf8"));
  const pairs = [];
  for (const row of rows) {
    if (!row?.source || !row?.file) continue;
    const note = String(row.note ?? "");
    if (!note.includes("detached release burst")) continue;
    pairs.push([join(dir, row.source), join(dir, row.file)]);
  }
  return pairs;
}

const USAGE =
  "usage:\n" +
  "  node scripts/catalog/audio_stop_burst.mjs --in FILE --out FILE [--dry-run]\n" +
  "  node scripts/catalog/audio_stop_burst.mjs batch --dir DIR [--manifest manifest.json]";

export function cliMain(argv, { stdout = console.log, stderr = console.error } = {}) {
  if (!hasFfmpeg()) {
    stderr("missing dependency: ffmpeg is not available on PATH");
    return 2;
  }

  if (argv[0] === "batch") {
    let dir = null;
    let manifestName = "manifest.json";
    for (let i = 1; i < argv.length; i += 1) {
      if (argv[i] === "--dir") {
        dir = argv[i + 1];
        i += 1;
      } else if (argv[i] === "--manifest") {
        manifestName = argv[i + 1];
        i += 1;
      } else {
        stderr(`unknown flag: ${argv[i]}`);
        stderr(USAGE);
        return 2;
      }
    }
    if (!dir) {
      stderr(USAGE);
      return 2;
    }
    const manifestPath = join(dir, manifestName);
    const pairs = burstFixPairsFromManifest(manifestPath, dir);
    if (pairs.length === 0) {
      stderr(`no burst-fix rows in ${manifestPath}`);
      return 1;
    }
    let anyCut = 0;
    for (const [src, dest] of pairs) {
      if (!existsSync(src)) {
        stderr(`skip missing source: ${src}`);
        continue;
      }
      const r = fixDetachedBurst({ sourcePath: src, destPath: dest });
      stdout(
        `${basename(dest)}: ${r.burstDetected ? "burst cut" : "no burst"} kept ${r.keptMs.toFixed(0)}ms of ${r.totalMs.toFixed(0)}ms`,
      );
      if (r.burstDetected) anyCut += 1;
    }
    return 0;
  }

  let sourcePath = null;
  let destPath = null;
  let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--in") {
      sourcePath = argv[i + 1];
      i += 1;
    } else if (arg === "--out") {
      destPath = argv[i + 1];
      i += 1;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else {
      stderr(`unknown arg: ${arg}`);
      stderr(USAGE);
      return 2;
    }
  }
  if (!sourcePath) {
    stderr(USAGE);
    return 2;
  }
  if (!destPath) destPath = sourcePath.replace(/\.[^.]+$/, "_burstfix.mp3");

  const { pcm, sampleRate: sr } = decodePcmToMono16k(sourcePath);
  const analysis = analyzeDetachedBurst(pcm, sr);
  if (dryRun) {
    stdout(
      JSON.stringify({
        burstDetected: analysis.burstDetected,
        keptMs: analysis.keptMs,
        totalMs: analysis.totalMs,
        wouldWrite: destPath,
      }),
    );
    return 0;
  }
  const r = fixDetachedBurst({ sourcePath, destPath });
  stdout(
    `wrote ${destPath} — ${r.burstDetected ? "burst removed" : "unchanged length"} (${r.keptMs.toFixed(0)}ms / ${r.totalMs.toFixed(0)}ms)`,
  );
  return 0;
}

const burstInvoked = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (burstInvoked) {
  process.exit(cliMain(process.argv.slice(2)));
}
