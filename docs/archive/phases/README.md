# Archived phases

Closed phases only. Live queue: `docs/phases/README.md`.

Closeout checklist: `docs/operations/Execution-Playbook.md` § Phase Archive.

| Phase | Archived | Status | Notes | Successor |
| --- | --- | --- | --- | --- |
| [001 — Harness bootstrap](001_Harness_Bootstrap.md) | 2026-09-22 | Complete | Harness, health stub, CI green wall. Slice 2 opened the first product phase. | `002_Core_Board_And_Customize.md` (archived) |
| [002 — Core board and the Cooper proof](002_Core_Board_And_Customize.md) | 2026-09-22 | Complete | `grid60` coordinate map + board; offline Cooper add (name + photo, filed by context); local strip (sentence position, recency, same-hour, cap 4, core map untouched). 367117c, 954018a; known slice-3 defect (UTC hour term) queued for `docs/phases/006_Prediction_Engine.md` slice 1. | `docs/product/Motor_Grid_And_Art.md`, `docs/product/Personal_Entities.md` |
| [003 — Groups 2.0](003_Groups_2.md) | 2026-09-22 | Complete | One container (board_group + group_cell), fixed slots, paging, one Edit mode, one add flow, classifier placement, show-me-where. fb5a8d7…0555aa9 + c2c2fd2 (kvvfs persistence fix). | `docs/product/Motor_Grid_And_Art.md` § Groups |
| [003b — Groups language follow-up](003b_Groups_Language_Followup.md) | 2026-09-22 | Complete | group_label per locale, board_group.name = caregiver override; resolveProfile + bound locale/voice everywhere, TTS lang, locale-literal gate; per-locale strip GRAMMAR keyed by sense id. f203693, cfcd0a9, 5c971c4. | `docs/product/Language_And_Voice_Schema.md` § 13.2 |
| [004 — Keyboard 2.0](004_Keyboard.md) | 2026-09-23 | Complete | Per-locale key maps (en/de/es/fr, standard + ABC) in fixed 60-slot geometry, big caps (61%/51% ink); typing reducer with digit aliases + entity resolution; forgiving completions 89.1% recall @ 0.161 ms median; partner row (senses 685–687); keyboard_mode/keyboard_order profile settings; device-keyboard mode; next-word continuations (59.0% keystroke savings in sim). 26d4e52…9ca4653. Slice 6 real-iPad works test founder-deferred. | `docs/product/Profile_Presentation_Modes.md` § 4 |
