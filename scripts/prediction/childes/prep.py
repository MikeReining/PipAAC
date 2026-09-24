#!/usr/bin/env python3
"""CHILDES prep: parquet -> parsed transcript cache. One-time, local only.

Reads the Hugging Face mirror parquet (10,828 English CHILDES transcripts,
speaker-tagged) and writes data/prediction/childes/transcripts.jsonl —
one JSON line per transcript: {"i": <idx>, "u": [["CHI", "w o r d s"], ...]}.

The cache dir is gitignored; transcript text never enters git (R11).
Requires: pip install pandas pyarrow.

Usage: python3 prep.py [--src <parquet>] [--out <jsonl>]
"""
import json, re, sys, os

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
CACHE = os.path.join(REPO, "data", "prediction", "childes")
SRC = os.path.join(CACHE, "childes-raw.parquet")
OUT = os.path.join(CACHE, "transcripts.jsonl")

TAG_RE = re.compile(r"<([A-Z0-9_]+)>")
SKIP_TAGS = {"PAR0", "PAR1", "LAN", "ENG", "SPA"}

def parse_transcript(text):
    """-> list of (speaker, [words]). Each <TAG> starts an utterance."""
    utts = []
    cur_spk, cur = None, []
    for piece in TAG_RE.split(text):
        piece = piece.strip()
        if not piece:
            continue
        if re.fullmatch(r"[A-Z0-9_]+", piece) and ":" not in piece:
            if piece in SKIP_TAGS:
                continue
            if cur_spk is not None and cur:
                utts.append((cur_spk, cur))
            cur_spk, cur = piece, []
            continue
        for tok in piece.split():
            w = tok.split(":")[0].strip().strip(".,!?;\"'()[]{}<>").lower()
            if w and not w.startswith("<"):
                cur.append(w)
    if cur_spk is not None and cur:
        utts.append((cur_spk, cur))
    return utts

def main():
    src, out = SRC, OUT
    args = sys.argv[1:]
    for i, a in enumerate(args):
        if a == "--src": src = args[i + 1]
        elif a == "--out": out = args[i + 1]
    import pandas as pd
    df = pd.read_parquet(src)
    n_utts = 0
    with open(out, "w") as f:
        for i, text in enumerate(df.text):
            utts = parse_transcript(text)
            n_utts += len(utts)
            f.write(json.dumps({"i": i, "u": [[s, " ".join(w)] for s, w in utts]}) + "\n")
    print(f"wrote {len(df)} transcripts, {n_utts} utterances -> {out}")

if __name__ == "__main__":
    main()
