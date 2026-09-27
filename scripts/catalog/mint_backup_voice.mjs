#!/usr/bin/env node
/**
 * Mint one catalog clip with the committed ElevenLabs backup voice (Aga clone).
 * Saves the raw take and, by default, trims a long ElevenLabs tail or fades a terminal click.
 * fix-burst is opt-in. On "bad" it cut the /d/ and left 0.40 s. The ear kept
 * the gentle trim.
 *
 *   npm run catalog:audio:mint-backup -- --spoken bad
 *   npm run catalog:audio:mint-backup -- --spoken "can't" --out data/samples/my/cant.mp3
 *   npm run catalog:audio:mint-backup -- --spoken bad --fix-burst
 */

import { mkdirSync, readFileSync, unlinkSync, writeFileSync, copyFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

import { fixDetachedBurst, gentleEndTrim } from "./audio_stop_burst.mjs";
import { synthesizeElevenLabs } from "./elevenlabs_tts.mjs";
import { getBackupVoice, loadCatalogVoices } from "./voices.mjs";
import { repoRoot } from "./paths.mjs";

function slug(spoken) {
  return spoken
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseArgv(argv) {
  const out = { spoken: null, text: null, out: null, noFixBurst: false, fixBurst: false, dryRun: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--spoken") {
      out.spoken = argv[i + 1];
      i += 1;
    } else if (arg === "--text") {
      out.text = argv[i + 1];
      i += 1;
    } else if (arg === "--out") {
      out.out = argv[i + 1];
      i += 1;
    } else if (arg === "--no-fix-burst") {
      out.noFixBurst = true;
    } else if (arg === "--fix-burst") {
      out.fixBurst = true;
    } else if (arg === "--dry-run") {
      out.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      out.help = true;
    }
  }
  return out;
}

const USAGE = `usage:
  node scripts/catalog/mint_backup_voice.mjs --spoken WORD [--text "exact TTS text"] [--out FILE] [--fix-burst]

  Voice ID and model: data/catalog/voices.json → backup
  Requires ELEVENLABS_API_KEY in the environment.`;

function loadEnvOptional() {
  try {
    for (const line of readFileSync(join(repoRoot, ".env"), "utf8").split("\n")) {
      const m = /^([A-Z_]+)=(.+)$/.exec(line.trim());
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // use exported env
  }
}

export async function mintBackupVoice({
  spoken,
  text = null,
  outPath = null,
  fixBurst = false,
  gentleTrim = true,
  dryRun = false,
  backup = getBackupVoice(),
} = {}) {
  const label = spoken?.trim();
  if (!label) throw new Error("--spoken is required");
  const ttsText = (text ?? label).trim();
  const dest = outPath ? resolve(outPath) : join(repoRoot, "data/samples/backup-mint", `${slug(label)}.mp3`);

  if (dryRun) {
    return { outPath: dest, text: ttsText, voiceId: backup.voice_id, dryRun: true };
  }

  const raw = await synthesizeElevenLabs({
    text: ttsText,
    voiceId: backup.voice_id,
    model: backup.model ?? undefined,
    voiceSettings: backup.voice_settings ?? undefined,
  });

  mkdirSync(dirname(dest), { recursive: true });
  const useBurst = fixBurst || backup.post_process?.fix_tail_burst === true;
  const useGentle = !useBurst && gentleTrim && backup.post_process?.gentle_end_trim !== false;
  if (!useBurst && !useGentle) {
    writeFileSync(dest, raw);
    return { outPath: dest, bytes: raw.length, fixBurst: false, gentleTrim: false, voiceId: backup.voice_id, text: ttsText };
  }

  const rawPath = join(tmpdir(), `pip-backup-${process.pid}-${Date.now()}.mp3`);
  writeFileSync(rawPath, raw);
  try {
    const rawKeep = dest.replace(/\.mp3$/i, `${backup.post_process?.keep_raw_suffix ?? "_raw"}.mp3`);
    writeFileSync(rawKeep, raw);
    let trimMeta = {};
    if (useBurst) trimMeta = fixDetachedBurst({ sourcePath: rawPath, destPath: dest });
    else {
      trimMeta = gentleEndTrim({
        sourcePath: rawPath,
        destPath: dest,
        speechPadMs: 120,
        minTrailingTailMs: 400,
        paddedTakeMs: 2000,
      });
      if (trimMeta.trimMode === "none") {
        copyFileSync(rawPath, dest);
        trimMeta = { ...trimMeta, keptMs: trimMeta.totalMs, trimmed: false };
      }
    }
    return {
      outPath: dest,
      rawPath: rawKeep,
      bytes: raw.length,
      fixBurst: useBurst,
      gentleTrim: useGentle,
      trimMode: trimMeta.trimMode,
      trailingMsRemoved: trimMeta.trailingMsRemoved,
      voiceId: backup.voice_id,
      text: ttsText,
    };
  } finally {
    try {
      unlinkSync(rawPath);
    } catch {
      // ignore
    }
  }
}

async function main() {
  const args = parseArgv(process.argv.slice(2));
  if (args.help || !args.spoken) {
    console.log(USAGE);
    console.log(`\nbackup voice: ${loadCatalogVoices().backup.voice_id} (${loadCatalogVoices().backup.label})`);
    process.exit(args.help ? 0 : 1);
  }
  loadEnvOptional();
  const result = await mintBackupVoice({
    spoken: args.spoken,
    text: args.text,
    outPath: args.out,
    fixBurst: args.fixBurst && !args.noFixBurst,
    gentleTrim: !args.fixBurst && !args.noFixBurst,
    dryRun: args.dryRun,
  });
  if (result.dryRun) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`wrote ${result.outPath}${result.rawPath ? ` (raw ${result.rawPath})` : ""}`);
  const extra =
    result.trimMode && result.trimMode !== "none"
      ? ` trim_mode=${result.trimMode}${result.trailingMsRemoved != null ? ` tail_removed_ms=${Math.round(result.trailingMsRemoved)}` : ""}`
      : "";
  console.log(
    `voice=${result.voiceId} text=${JSON.stringify(result.text)} fix_burst=${result.fixBurst} gentle_trim=${result.gentleTrim}${extra}`,
  );
}

const invoked = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
