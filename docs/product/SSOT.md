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
| **DECIDED 2026-09-22** (not built). Coordinate map: `grid60` default (10×6) + `grid80` dense (10×8, all 75 core cells); Groups anchor | `docs/product/Core_Coordinate_Map.md` |
| **DECIDED 2026-09-22** (not built). Clean-room initial launch vocabulary (599 words: 75 Root Core + 524 Primary Fringe) | `docs/product/Initial_Vocabulary_600.md` |
| **DECIDED 2026-09-22** (not built). Personal entity is a record, not a core cell. Add = name + photo + optional hint, one confirm; filing by context or classification, never a form | `docs/product/Personal_Entities.md` |
| **DECIDED 2026-09-22** (not built). Sense, utterance, label, shared picture, one clip per voice. Profile picks one voice. Core cells store sense ids per layout. No edge table — strip relevance is computed live | `docs/product/Language_And_Voice_Schema.md` |
| **DECIDED 2026-09-22** (not built). Predictive strip ranking: local first paint under 50 ms; core cells never reorder | `docs/strategy/Dual_Engine_Predictive_Intelligence.md` |
| **DECIDED 2026-09-22** (not built). Model roles: Muse Spark (`meta/muse-spark-1.3-contributor`, multimodal, via OpenRouter) = write-time entity enrichment, once per entity, cached; Jev = read-time candidate ranking. Entity enrichment is the only off-device transmission of adult-supplied name/photo | `docs/product/Personal_Entities.md` § Enrichment |
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
