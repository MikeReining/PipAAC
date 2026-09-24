# Opening book — sources

What `opening_book.en.json` is built from, and under what terms. The
build is `scripts/prediction/book/build_book.mjs`, driven by the pinned
hashes and per-band weights in `book_sources.json`. The file itself is
aggregate next-word probabilities over Pip's closed vocabulary only —
no transcript text, utterances, speaker IDs, or raw lines of any source.

| Source | License / permission | Use in the shipped book |
| --- | --- | --- |
| CHILDES / TalkBank child speech | CC BY-NC-SA 4.0 + written permission 2026-09-23 ([record](permissions/2026-09-23_TalkBank_CHILDES.md)) | The only weighted source. Band-filtered at MLU < 2, full corpus + 0.5 band tilt at MLU 2–3.5, full corpus at MLU > 3.5 — the mix that won the sweep (`scripts/prediction/book/sweep.mjs`). |
| CHILDES / TalkBank caregiver speech | same | Measured, weight 0 — every caregiver mix traded first-word cells away on the held-out scorer. |
| TinyDialogues (Feng, Goodman & Frank, EMNLP 2024; [HF dataset](https://huggingface.co/datasets/styfeng/TinyDialogues)) | MIT | Measured, weight 0. Train files only; val splits are held out for scoring. |
| Imagine AAC (Vertanen & Kristensson, EMNLP 2011; [aactext.org/imagine](https://www.aactext.org/imagine/)) | CC BY 4.0 | Measured, weight 0. Train file only; dev file is held out for scoring. |
| childlike_en.jsonl (Pip-authored frames, slot-filled from the launch vocabulary) | ours | Measured, weight 0. |

Raw source files stay in the gitignored local cache
(`data/prediction/childes/`); the repo carries the manifest, the
aggregate table, and the scorers. The CHILDES permission scope is
written out in R11 in `docs/phases/017_Prediction_Hardening.md`.
