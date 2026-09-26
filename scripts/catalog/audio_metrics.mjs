/**
 * Prosody and loudness metrics for local TTS takes (compare winners, spot clipping).
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { basename } from "node:path";

import { decodePcmToMono16k, DECODE_SAMPLE_RATE } from "./audio_review.mjs";

/** @param {Int16Array} samples */
export function pitchTrack(samples) {
  const sampleRate = DECODE_SAMPLE_RATE;
  const frameSize = 800;
  const hopSize = 400;
  const pitches = [];

  for (let i = 0; i + frameSize < samples.length; i += hopSize) {
    let bestR = 0;
    let bestLag = 0;
    const minLag = Math.floor(sampleRate / 400);
    const maxLag = Math.floor(sampleRate / 80);

    let energy = 0;
    for (let j = 0; j < frameSize; j += 1) energy += samples[i + j] * samples[i + j];
    if (energy < 1e7) continue;

    for (let lag = minLag; lag <= maxLag; lag += 1) {
      let r = 0;
      for (let j = 0; j < frameSize - lag; j += 1) {
        r += samples[i + j] * samples[i + j + lag];
      }
      if (r > bestR) {
        bestR = r;
        bestLag = lag;
      }
    }
    if (bestLag > 0 && bestR / energy > 0.4) {
      pitches.push(Math.round(sampleRate / bestLag));
    }
  }
  return pitches;
}

function pitchSlopeHz(pitches) {
  if (pitches.length < 2) return null;
  const mid = Math.floor(pitches.length / 2);
  const avg = (arr) => arr.reduce((sum, v) => sum + v, 0) / (arr.length || 1);
  return Math.round(avg(pitches.slice(mid)) - avg(pitches.slice(0, mid)));
}

function formatPitchLine(pitches) {
  if (pitches.length === 0) return "No voice detected";
  const avgP = Math.round(pitches.reduce((a, b) => a + b, 0) / pitches.length);
  const minP = Math.min(...pitches);
  const maxP = Math.max(...pitches);
  const mid = Math.floor(pitches.length / 2);
  const p1 = Math.round(pitches.slice(0, mid).reduce((a, b) => a + b, 0) / (mid || 1));
  const p2 = Math.round(pitches.slice(mid).reduce((a, b) => a + b, 0) / ((pitches.length - mid) || 1));
  const drift = pitchSlopeHz(pitches) ?? 0;
  const sign = drift > 0 ? "+" : "";
  return `Avg: ${avgP}Hz [${minP}-${maxP}Hz] | Slope: ${p1}Hz -> ${p2}Hz (${sign}${drift}Hz)`;
}

function syllableEnvelope(samples) {
  const win = 1600;
  const env = [];
  for (let i = 0; i < samples.length; i += win) {
    let sum = 0;
    for (let j = i; j < Math.min(i + win, samples.length); j += 1) sum += samples[j] * samples[j];
    const rms = Math.round(Math.sqrt(sum / win));
    if (rms > 150) env.push(rms);
  }
  if (env.length === 0) return { envelopeShape: "flat", peakPos: "0%" };
  const maxR = Math.max(...env);
  const peakIdx = env.indexOf(maxR);
  const peakPos = `${Math.round((peakIdx / env.length) * 100)}%`;
  const envelopeShape = env.map((v) => Math.round((v / maxR) * 9)).join("");
  return { envelopeShape, peakPos };
}

/**
 * @param {string} filePath
 * @param {{ decode?: typeof decodePcmToMono16k }} [opts]
 */
export function measureAcousticTake(filePath, { decode = decodePcmToMono16k } = {}) {
  if (!existsSync(filePath)) {
    throw new Error(`file not found: ${filePath}`);
  }

  const name = basename(filePath);

  let meanVol = "N/A";
  let maxVol = "N/A";
  let duration = "N/A";
  try {
    const volOut = execSync(`ffmpeg -i "${filePath}" -af "volumedetect" -f null - 2>&1`).toString();
    meanVol = volOut.match(/mean_volume: ([-0-9.]+) dB/)?.[1] ?? "N/A";
    maxVol = volOut.match(/max_volume: ([-0-9.]+) dB/)?.[1] ?? "N/A";
  } catch {
    // volumedetect may still print to stderr on success paths
  }

  try {
    const durOut = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}" 2>/dev/null`,
    )
      .toString()
      .trim();
    if (durOut) duration = `${parseFloat(durOut).toFixed(2)}s`;
  } catch {
    // ignore
  }

  let dynRange = "N/A";
  let crest = "N/A";
  let crestValue = null;
  try {
    const statsOut = execSync(`ffmpeg -i "${filePath}" -af "astats=metadata=1:reset=1" -f null - 2>&1`).toString();
    dynRange = statsOut.match(/Dynamic range: ([-0-9.]+)/)?.[1] ?? "N/A";
    const crestRaw = statsOut.match(/Crest factor: ([-0-9.]+)/)?.[1] ?? null;
    if (dynRange !== "N/A") dynRange = `${parseFloat(dynRange).toFixed(1)} dB`;
    if (crestRaw != null) {
      crestValue = parseFloat(crestRaw);
      crest = crestValue.toFixed(2);
    }
  } catch {
    // ignore
  }

  const { pcm } = decode(filePath);
  const pitches = pitchTrack(pcm);
  const pitchStr = formatPitchLine(pitches);
  const { envelopeShape, peakPos } = syllableEnvelope(pcm);

  return {
    filePath,
    name,
    duration,
    meanVol: `${meanVol} dB`,
    maxVol: `${maxVol} dB`,
    dynRange,
    crest,
    crestValue,
    pitchSlopeHz: pitchSlopeHz(pitches),
    pitchStr,
    peakPos,
    envelopeShape,
  };
}

export function formatAcousticTakeReport(result) {
  const lines = [
    `▶ ${result.name}`,
    `  Duration:     ${result.duration.padEnd(8)} | Volume (Mean/Max): ${result.meanVol} / ${result.maxVol}`,
    `  Dyn Range:    ${String(result.dynRange).padEnd(8)} | Crest Factor:      ${result.crest}`,
    `  Pitch (F0):   ${result.pitchStr}`,
    `  Energy Shape: ${result.envelopeShape} (Peak at ${result.peakPos} of utterance)`,
  ];
  return lines.join("\n");
}
