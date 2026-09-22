# Catalog audio (WorkbookBench reuse)

Pip AAC does not regenerate ElevenLabs audio when WorkbookBench already has a ready take for the same spoken word.

| Artifact | Role |
| --- | --- |
| `../launch_lexicon.json` | 599 launch words (generated from `docs/product/Initial_Vocabulary_600.md`) |
| `wbb_audio_overrides.json` | Optional homonym map: spoken text → WorkbookBench `senseId` |
| `audio_import.json` | Import plan: each lexicon row → R2 `key` + SHA-256 (generated) |
| `../../assets/catalog/` | Materialized MP3 bytes under `audio/` (gitignored `.mp3`; fill via materialize) |

## Commands

```bash
# Regenerate lexicon JSON after editing Initial_Vocabulary_600.md
npm run catalog:lexicon

# Coverage report (needs WorkbookBench clone — set WORKBOOKBENCH_ROOT if auto-detect fails)
npm run catalog:audio:coverage
npm run catalog:audio:coverage -- --tier 1

# Write data/catalog/audio_import.json
npm run catalog:audio:import

# Copy hits from R2 workbookbench-catalog into assets/catalog/audio/
npm run catalog:audio:materialize -- --tier 1
npm run catalog:audio:materialize -- --dry-run
```

Load `.env` before ElevenLabs gap-fill scripts (future): `set -a && source .env && set +a`.
