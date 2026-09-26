/**
 * Score local MP3 takes for Grok word exploration (Whisper + acoustics).
 * Ear still wins — this only ranks candidates for shortlist review.
 */

import { measureAcousticTake } from "./audio_metrics.mjs";
import { analyzeDetachedBurst } from "./audio_stop_burst.mjs";
import {
  analyzeEchoReturn,
  analyzeResidueShelf,
  auditGeneratedWordAudio,
  decodePcmToMono16k,
  isSingleLexicalWord,
} from "./audio_review.mjs";

/** @typedef {{ word: string, slug: string, whisperMustMatch?: string[], whisperReject?: string[], durationMs?: [number, number] }} WordRecipe */

const DEFAULT_DURATION_MS = [550, 1100];
const IDEAL_DURATION_MS = [720, 950];

const SWALLOW_REJECT = {
  "can't": [/^can[.!?\s]*$/i],
  "won't": [/^won[.!?\s]*$/i, /^one[.!?\s]*$/i],
  "don't": [/^don[.!?\s]*$/i],
  "didn't": [/^didn[.!?\s]*$/i, /^did[.!?\s]*$/i],
};

function normalizeHeard(text) {
  return String(text ?? "")
    .trim()
    .toLowerCase()
    .replace(/[.!?,]+$/g, "")
    .trim();
}

export function scoreWhisperTranscript(word, heard, recipe = {}) {
  const h = normalizeHeard(heard);
  const must = (recipe.whisperMustMatch ?? [word]).map((w) => normalizeHeard(w));
  const reject = [...(recipe.whisperReject ?? []), ...(SWALLOW_REJECT[word] ?? [])].map((w) =>
    typeof w === "string" ? normalizeHeard(w) : w,
  );

  if (!h || h.startsWith("fail ")) {
    return { ok: false, reason: "whisper_failed", heard: h };
  }
  for (const pat of reject) {
    if (pat instanceof RegExp && pat.test(h)) {
      return { ok: false, reason: "whisper_reject", heard: h };
    }
    if (typeof pat === "string" && h === pat) {
      return { ok: false, reason: "whisper_reject", heard: h };
    }
  }
  const ok = must.some((m) => h === m || h.includes(m));
  return { ok, reason: ok ? "whisper_ok" : "whisper_mismatch", heard: h };
}

export function scoreAcoustics(filePath, spokenWord) {
  const metrics = measureAcousticTake(filePath);
  const durSec = parseFloat(String(metrics.duration).replace(/s$/, "")) || 0;
  const durMs = durSec * 1000;

  let gate = null;
  if (isSingleLexicalWord(spokenWord)) {
    gate = auditGeneratedWordAudio({ filePath, spokenText: spokenWord });
  }
  const { pcm } = decodePcmToMono16k(filePath);
  const burst = analyzeDetachedBurst(pcm, 16000);
  const residue = analyzeResidueShelf(pcm, { sampleRate: 16000 });
  const echo = analyzeEchoReturn(pcm, { sampleRate: 16000 });

  return { metrics, durMs, gate, burst, residue, echo };
}

/**
 * Higher is better. Returns breakdown for the exploration report.
 */
export function scoreTake({ word, recipe, filePath, whisperText, spokenForGate, requireWhisper = true }) {
  const whisperSkipped = whisperText == null || whisperText === "";
  const whisper = whisperSkipped
    ? { ok: true, reason: "whisper_skipped", heard: "" }
    : scoreWhisperTranscript(word, whisperText, recipe);
  const [minMs, maxMs] = recipe.durationMs ?? DEFAULT_DURATION_MS;
  const [idealLo, idealHi] = IDEAL_DURATION_MS;

  let acoustic = null;
  let score = -1000;
  const notes = [];

  if (!whisper.ok) {
    return { score, whisper, acoustic: null, notes: [whisper.reason] };
  }
  if (requireWhisper && whisperSkipped) {
    return { score: -200, whisper, acoustic: null, notes: ["whisper_missing"] };
  }

  try {
    acoustic = scoreAcoustics(filePath, spokenForGate ?? word);
  } catch (err) {
    notes.push(`acoustic_error: ${err instanceof Error ? err.message : err}`);
    return { score: -500, whisper, acoustic: null, notes };
  }

  score = whisperSkipped ? 60 : 100;
  if (whisperSkipped) notes.push("whisper_skipped");
  const { durMs, gate, burst, residue, echo, metrics } = acoustic;

  if (durMs < minMs) {
    score -= 40;
    notes.push("too_short");
  } else if (durMs > maxMs) {
    score -= 25;
    notes.push("too_long");
  } else if (durMs >= idealLo && durMs <= idealHi) {
    score += 15;
    notes.push("duration_sweet_spot");
  }

  if (gate?.outcome === "review") {
    score -= 35;
    notes.push(`gate_${gate.reasons[0]?.code ?? "review"}`);
  }

  if (burst.burstDetected && !burst.consonantRelease) {
    score -= 45;
    notes.push("tail_burst");
  } else if (burst.consonantRelease) {
    score += 10;
    notes.push("consonant_release");
  } else {
    score += 10;
    notes.push("no_tail_burst");
  }

  if (residue?.detected) {
    score -= 60;
    notes.push("residue_shelf");
  }

  // go_period: the wave dies, a copy returns, and the voice is smeared and falling.
  // A consonant burst is louder and does not also collapse the pitch.
  const smearedFall = metrics.pitchSlopeHz != null
    && metrics.pitchSlopeHz <= -48
    && metrics.crestValue != null
    && metrics.crestValue < 4;
  if (echo?.detected && smearedFall) {
    score -= 40;
    notes.push("echo_return");
  }

  return { score, whisper, acoustic: { durMs, gate, burst, residue, echo, metrics }, notes };
}

function residueHoldMs(row) {
  return row.acoustic?.residue?.holdMs ?? (row.notes?.includes("residue_shelf") ? 1 : 0);
}

function pitchSlope(row) {
  const value = row.pitchSlopeHz ?? row.acoustic?.metrics?.pitchSlopeHz;
  return Number.isFinite(value) ? value : null;
}

export function pickBestPerWord(scoredRows) {
  const byWord = new Map();
  for (const row of scoredRows) {
    const prev = byWord.get(row.word);
    if (!prev || row.score > prev.score) {
      byWord.set(row.word, row);
      continue;
    }
    if (row.score < prev.score) continue;
    if (residueHoldMs(row) < residueHoldMs(prev)) {
      byWord.set(row.word, row);
      continue;
    }
    if (residueHoldMs(row) > residueHoldMs(prev)) continue;
    const prevSlope = pitchSlope(prev);
    const nextSlope = pitchSlope(row);
    // find_plain fell 64 Hz and tied the steady take, then won because it was first.
    if (prevSlope != null && nextSlope != null && nextSlope - prevSlope >= 40) {
      byWord.set(row.word, row);
    }
  }
  return [...byWord.values()].sort((a, b) => a.word.localeCompare(b.word));
}
