# AssistiveWare — full YouTube transcript capture

**BUILT 2026-09-22.** Complete transcript + metadata capture of the
AssistiveWare YouTube channel (`@AssistiveWare`): **254/254 videos**, every
one indexed in the local `vortex.db` (`~/.vvx/`) with `sensed_at` set and an
`.srt` transcript at `~/.vvx/transcripts/Youtube/AssistiveWare/`.

Pulled with `vvx` (Competitor X-Ray workflow). No media was downloaded —
sense-only.

## What's here

- `sync-2026-09-22.ndjson` — bulk sync manifest, one JSON object per video
  (metadata + full `transcriptBlocks`), 206 videos.
- `slow_fetch.ndjson` — catch-up manifest for the 48 videos the bulk sync
  missed after YouTube rate-limiting; same schema.
- `sync-2026-09-22.log`, `slow_fetch.log`, `slow_fetch2.log` — run logs.
- `channel_ids.txt` — all 254 video IDs (flat-playlist enumeration).
- `done_ids.txt`, `missing_ids.txt`, `missing_pass2.txt` — coverage diff
  artifacts.
- `slow_fetch.sh`, `slow_fetch2.sh` — the sequential catch-up scripts.

## Querying

The database is the interface — prefer it over reading the NDJSON:

```bash
vvx sql "SELECT title, upload_date, view_count FROM videos
         WHERE uploader = 'AssistiveWare' ORDER BY view_count DESC LIMIT 20;"
vvx search "modeling OR 'core word'" --uploader "AssistiveWare"
vvx library --uploader "AssistiveWare"
```

Transcripts on disk: `~/.vvx/transcripts/Youtube/AssistiveWare/*.srt`.

## Notes for the next pull

- `vvx sync` uses 3 concurrent workers with no pacing flag; a 254-video
  channel trips YouTube per-IP 429s on the subtitle endpoint after ~200
  videos. Sequential `vvx sense` with ~25s spacing gets through.
- `vvx sync` wedged at ~583% CPU with no output after sustained 429s —
  kill and resume rather than waiting it out. (Reported-worthy vvx bug.)
- `--browser chrome` borrows cookies and cleared both the remaining 429s
  and a "Please sign in" bot-check. `--browser safari` fails on macOS
  (container sandbox).
- Re-run `vvx sync "https://www.youtube.com/@AssistiveWare/videos" --incremental`
  to pick up future uploads.
