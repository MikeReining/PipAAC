# PipAAC SSOT

Single source of truth for durable product facts. Map facts → owner doc here;
do not duplicate long policy in `AGENTS.md`.

## Product identity

| Fact | Owner |
| --- | --- |
| Product name: **Pip AAC** (repo: PipAAC) | This file |
| **DECIDED 2026-09-21**. Relational Language Graph AAC with Multi-Surface Views (founder brief) | `docs/strategy/Vision.md` |
| **DECIDED 2026-09-21**. Dual-Engine Predictive Intelligence (TypeSafe Jev + Local-First SQLite) | `docs/strategy/Dual_Engine_Predictive_Intelligence.md` |
| **DECIDED 2026-09-22** (not built). Clean-room motor grid, Fitzgerald color, stick-figure and object art, predictive-strip layout | `docs/product/Motor_Grid_And_Art.md` |
| **DECIDED 2026-09-22** (not built). Coordinate map: `grid60` default (10×6) + `grid90` dense (10×9, all 81 core cells); Groups anchor | `docs/product/Core_Coordinate_Map.md` |
| **DECIDED 2026-09-22** (not built). Zones are an in-place board mode on their own coordinate map (`zone_slot`); custom groups are first-class zones; positions move only in caregiver arrange mode | `docs/product/Motor_Grid_And_Art.md` + `docs/product/Language_And_Voice_Schema.md` §6.3b |
| **DECIDED 2026-09-22** (not built). Clean-room initial launch vocabulary (656 words: 81 Root Core + 575 Primary Fringe), membership ranked by `data/reference/` AoA + Fry | `docs/product/Initial_Vocabulary_600.md` |
| **DECIDED 2026-09-22** (not built). Personal entity is a record, not a core cell. Add = name + photo + optional hint, one confirm; filing by context or classification, never a form | `docs/product/Personal_Entities.md` |
| **DECIDED 2026-09-22** (not built). Sense, utterance, label, shared picture, one clip per voice. Profile picks one voice. Core cells store sense ids per layout. No edge table — strip relevance is computed live | `docs/product/Language_And_Voice_Schema.md` |
| **DECIDED 2026-09-22** (not built). Predictive strip ranking: local first paint under 50 ms; core cells never reorder | `docs/strategy/Dual_Engine_Predictive_Intelligence.md` |
| **DECIDED 2026-09-22** (not built). Model roles: Muse Spark (`meta/muse-spark-1.3-contributor`, multimodal, via OpenRouter) = write-time entity enrichment, once per entity, cached; Jev = read-time candidate ranking. Entity enrichment is the only off-device transmission of adult-supplied name/photo | `docs/product/Personal_Entities.md` § Enrichment |
| **DECIDED 2026-09-22** (not built). Ethical pricing law: core communication is free & local-first; never subscription-gated; flat one-time / Medicaid grant friendly | `docs/product/Pricing_And_Packaging.md` |
| **DECIDED 2026-09-22** (not built). Vocabulary masking: masked cells render blank; coordinates never shift; biometrics + PIN Parent Corner with "Retire, Never Delete" trash restore | `docs/product/Vocabulary_Masking_And_Safety.md` |
| **DECIDED 2026-09-22** (not built). Profile presentation modes: Symbol+Label (default) vs. Label-Only (clean text mode for literate adults, ALS, aphasia) on identical coordinate map | `docs/product/Profile_Presentation_Modes.md` |
| **DECIDED 2026-09-22** (not built). Voice cloning: 10–15s sample (ElevenLabs) generates local OPFS cached clips for 0ms offline speech (Mom's voice / SLP voice / ALS banking) | `docs/product/Voice_Cloning_And_Synthesis.md` |
| **PROPOSED.** Primary domain `pippaac.org` (not registered in repo) | `docs/strategy/Vision.md` |
| **BUILT** (`src/worker/index.js:12-14`). Harness Worker exposes `GET /health` | `docs/operations/TechStack.md` |
| Dev harness (same family as LocalFlyers / WorkbookBench) | `docs/FOLDER_MAP.md`, `AGENTS.md` |
| Dev process | `docs/operations/` + `AGENTS.md` |
| Live work index | `docs/phases/README.md` |

## Engineering laws (pointer)

Cross-cutting: `docs/product/Design_Invariants.md`. Test rules: `AGENTS.md` § Running Tests.

## Agent discovery

- Router: `AGENTS.md`
- Slice execution: `docs/operations/Execution-Playbook.md`
- Bug intake: `docs/operations/Debugger.md`
- Maintenance: `docs/operations/code-maintainer/SKILL.md`
