# Folder Map

## Current

```txt
PipAAC/
  README.md
  .gitignore
  AGENTS.md
  CLAUDE.md
  wrangler.jsonc
  docs/
    WORKING_RULES.md
    FOLDER_MAP.md
    workflows/
    operations/
      Execution-Playbook.md
      Debugger.md
      Deslop.md
      Testing.md
      Code_Audit.md
      code-maintainer/
      art-generator/
    phases/
      README.md
    backlog/
      README.md
    archive/
      phases/
    product/
      SSOT.md
      Design_Invariants.md
      Design_System.md
      Motor_Grid_And_Art.md
      Core_Coordinate_Map.md
      Initial_Vocabulary_600.md
      Personal_Entities.md
      Language_And_Voice_Schema.md
      Pricing_And_Packaging.md
      Vocabulary_Masking_And_Safety.md
      Profile_Presentation_Modes.md
      Voice_Cloning_And_Synthesis.md
      Clipart_Pipeline_And_Catalog_Growth.md
    strategy/
      README.md
      Vision.md
      Roadmap.md
    founder/
    handovers/
  data/
    README.md
  scripts/
    test.sh
    check.mjs
    check_fast.mjs
    dev.mjs
    install_dev_slot0.sh
    commit_handoff_queue.py
    health/
  src/
    worker/
      index.js
  .cursor/
    cli.json
    hooks.json
    hooks/
  .wmd/
    commit-queue.jsonl
  .github/
    workflows/
```

## File roles

- `AGENTS.md` — agent router, project laws, test rules.
- `docs/operations/Execution-Playbook.md` — slice packets, lane routing, closeout.
- `docs/operations/code-maintainer/SKILL.md` — maintenance skill (8 lenses).
- `docs/phases/README.md` — live work index and § Next queue.
- `docs/strategy/Vision.md` — product job (founder brief pending).
- `docs/strategy/Roadmap.md` — phase sequence map.
- `docs/product/SSOT.md` — durable product facts map.
- `docs/product/Motor_Grid_And_Art.md` — clean-room motor grid, Fitzgerald color, stick figure, object art, predictive-strip layout.
- `docs/product/Design_System.md` — designer handoff: palette tokens, word-tile anatomy and states, brand marks, strip/sentence-bar visuals.
- `assets/brand/` — Pip mark masters (SVG + PNG poses); `public/brand/` — served copies (favicon, ink mark, touch/maskable icons).
- `assets/style-refs/` — frozen art style bundles, incl. `tile-v1/` placeholder crops.
- `docs/product/Core_Coordinate_Map.md` — slot assignments per named layout (`grid60`, `grid90`).
- `docs/product/Personal_Entities.md` — personal entity records and the on-device add.
- `docs/product/Word_Library.md` — Word Library, word card, add paths, voices and recordings, suggested words.
- `docs/product/Platforms_iOS_And_Web.md` — the iOS app and the web app.
- `docs/product/Sync_And_Web_Editing.md` — sync without accounts, web editing (design proposed).
- `docs/product/Language_And_Voice_Schema.md` — catalog/device schema, playback rules.
- `scripts/test.sh` — protected test runner.
- `scripts/check.mjs` / `check_fast.mjs` — closeout and iteration gates.
- `scripts/dev.mjs` — founder browse copy vs agent copies.
- `scripts/install_dev_slot0.sh` — macOS LaunchAgent for the browse copy.
- `src/worker/index.js` — Cloudflare Worker entrypoint (`/health` stub today).
