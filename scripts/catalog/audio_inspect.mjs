#!/usr/bin/env node
/**
 * Single entry point for local catalog audio: compare takes, run the acoustic gate,
 * batch-scan folders, trim tails, and fix detached stop bursts.
 *
 *   node scripts/catalog/audio_inspect.mjs <command> [options]
 *
 * Minting new Grok takes is intentionally separate (cost + founder listen):
 *   node scripts/catalog/mint_grok_samples.mjs --dir data/samples/batch-04 --only dont_unrel.mp3
 */

import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import { cliMain as analyzeCli } from "./analyze_audio.mjs";
import { cliMain as auditCli } from "./audio_review.mjs";
import { cliMain as burstCli } from "./audio_stop_burst.mjs";
import { cliMain as trimCli } from "./audio_trim.mjs";
import { runScanCli } from "./scan_local_audio.mjs";

const HELP = `Pip AAC — local audio inspect & clean

Commands:
  analyze   Prosody report (pitch, energy shape, loudness)
            analyze [--gate] [--spoken WORD] [--json] <files...>

  audit     activity_after_silence gate (WorkbookBench rule)
            audit --file FILE --spoken WORD [--json]

  scan      Batch gate + metrics → .cache/audio-review/scan-*.json
            scan [--manifest PATH] [--json] <files...>

  trim      Fixed tail trim (50ms steps) or heal loop
            trim --in FILE --out FILE --ms 50
            trim heal --file FILE --spoken WORD [--out FILE]

  fix-burst Detached /t/ /d/ pop after a quiet gap (batch-04 algorithm)
            fix-burst --in FILE --out FILE [--dry-run]
            fix-burst batch --dir data/samples/batch-04

Related (mint / Whisper — uses env keys, not .env parsing):
  node scripts/catalog/mint_grok_samples.mjs --dir DIR --only file.mp3
  node scripts/catalog/transcribe_groq.mjs <files...>

Examples:
  npm run catalog:audio:inspect -- analyze data/samples/happy_*.mp3
  npm run catalog:audio:inspect -- analyze --gate --spoken the data/samples/approved/the.mp3
  npm run catalog:audio:inspect -- scan --manifest data/samples/approved/manifest.json data/samples/approved/*.mp3
  npm run catalog:audio:inspect -- fix-burst batch --dir data/samples/batch-04
`;

export function cliMain(argv, deps = {}) {
  const stdout = deps.stdout ?? console.log;
  const stderr = deps.stderr ?? console.error;
  const cmd = argv[0];
  const rest = argv.slice(1);

  if (!cmd || cmd === "--help" || cmd === "-h") {
    stdout(HELP);
    return 0;
  }

  switch (cmd) {
    case "analyze":
      return analyzeCli(rest, { stdout, stderr });
    case "audit":
      return auditCli(["audit", ...rest], { stdout, stderr });
    case "scan":
      return runScanCli(rest, { stdout, stderr });
    case "trim":
      return trimCli(rest, { stdout, stderr });
    case "fix-burst":
      return burstCli(rest, { stdout, stderr });
    default:
      stderr(`unknown command: ${cmd}\n`);
      stdout(HELP);
      return 2;
  }
}

const invoked = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked) {
  process.exit(cliMain(process.argv.slice(2)));
}
