#!/usr/bin/env python3
"""Lightweight watcher for .wmd/commit-queue.jsonl.

Polls every POLL_INTERVAL seconds. When the file's mtime changes (or on
startup with an existing file), calls process-next. No AI, no tokens — pure
Python and git.

Run via LaunchAgent for persistent background operation, or manually:
  python3 scripts/commit_queue_watcher.py
"""

from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
QUEUE_PATH = REPO_ROOT / ".wmd" / "commit-queue.jsonl"
SCRIPT = REPO_ROOT / "scripts" / "commit_handoff_queue.py"
POLL_INTERVAL = 2  # seconds

# Flags forwarded verbatim to `commit_handoff_queue.py process-next` (e.g.
# --skip-green-wall). Visible in `ps`, so a bypassed gate is never invisible.
PASSTHROUGH_ARGS = sys.argv[1:]


def process_next() -> None:
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "process-next", *PASSTHROUGH_ARGS],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )
    output = (result.stdout + result.stderr).strip()
    if output and output != "no pending commit handoff":
        print(f"[commit-queue-watcher] {output}", flush=True)


def run() -> None:
    print(
        f"[commit-queue-watcher] watching {QUEUE_PATH} (interval={POLL_INTERVAL}s)",
        flush=True,
    )
    last_mtime: float = 0.0
    if QUEUE_PATH.exists():
        last_mtime = QUEUE_PATH.stat().st_mtime
        process_next()
    while True:
        time.sleep(POLL_INTERVAL)
        try:
            if not QUEUE_PATH.exists():
                last_mtime = 0.0
                continue
            mtime = QUEUE_PATH.stat().st_mtime
            if mtime != last_mtime:
                last_mtime = mtime
                process_next()
        except Exception as exc:
            print(f"[commit-queue-watcher] error: {exc}", flush=True)


if __name__ == "__main__":
    run()
