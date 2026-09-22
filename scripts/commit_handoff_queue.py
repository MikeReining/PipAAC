#!/usr/bin/env python3
"""Local Codex -> Cursor commit handoff queue.

The queue is intentionally narrow: Codex records exact files + a commit message;
Cursor processes one pending item by staging only those files and committing.
"""

from __future__ import annotations

import argparse
import contextlib
import fcntl
import json
import os
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

ROOT = Path(__file__).resolve().parents[1]
QUEUE_PATH = ROOT / ".wmd" / "commit-queue.jsonl"
LOCK_PATH = ROOT / ".wmd" / "commit-queue.lock"
ALLOWED_REPO = str(ROOT)

# Maintainer ledger / telemetry files. A commit whose staged changes are
# limited to these is bookkeeping-only and must never land: the RUNLOG is an
# audit trail for meaningful batches, not a heartbeat. A real batch always
# touches at least one durable, non-ledger file (a fix, detector, gate, or spec).
LEDGER_BASENAMES = {
    "RUNLOG.md",
    "HEALTH.md",
    "HOTSPOT-PROOF-MAP.md",
    "LEDGER.md",
}
LEDGER_PREFIXES = (".wmd/",)

# Automation control plane: the scripts, hooks, and queue plumbing that run the
# handoff itself. An ordinary request must not rewrite the machinery that runs
# it. Editing these requires an explicit, human-named maintenance task, signalled
# per item via allow_control_plane (--allow-control-plane on request).
CONTROL_PLANE_PATHS = {
    "scripts/commit_handoff_queue.py",
    "scripts/commit_queue_watcher.py",
    "scripts/install_commit_queue_watcher.sh",
    ".cursor/hooks.json",
}
CONTROL_PLANE_PREFIXES = (
    ".cursor/hooks/",
    "scripts/commit_handoff/",
)


class HandoffError(Exception):
    pass


def utc_now() -> str:
    return (
        datetime.now(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z")
    )


def run_git(
    args: list[str], *, check: bool = True, input_text: str | None = None
) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        ["git", *args],
        cwd=ROOT,
        text=True,
        input=input_text,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if check and result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        raise HandoffError(f"git {' '.join(args)} failed: {detail}")
    return result


def current_branch() -> str:
    result = run_git(["rev-parse", "--abbrev-ref", "HEAD"])
    return result.stdout.strip()


def read_queue() -> list[dict[str, Any]]:
    if not QUEUE_PATH.exists():
        return []
    items: list[dict[str, Any]] = []
    for line_no, raw_line in enumerate(
        QUEUE_PATH.read_text(encoding="utf-8").splitlines(), 1
    ):
        line = raw_line.strip()
        if not line:
            continue
        try:
            item = json.loads(line)
        except json.JSONDecodeError as exc:
            raise HandoffError(f"{QUEUE_PATH}:{line_no}: invalid JSON: {exc}") from exc
        if not isinstance(item, dict):
            raise HandoffError(f"{QUEUE_PATH}:{line_no}: queue item must be a JSON object")
        items.append(item)
    return items


def write_queue(items: list[dict[str, Any]]) -> None:
    QUEUE_PATH.parent.mkdir(parents=True, exist_ok=True)
    temp_path = QUEUE_PATH.with_name(f"{QUEUE_PATH.name}.tmp-{os.getpid()}-{uuid.uuid4().hex}")
    payload = "".join(
        json.dumps(item, separators=(",", ":"), sort_keys=True) + "\n"
        for item in items
    )
    temp_path.write_text(payload, encoding="utf-8")
    os.replace(temp_path, QUEUE_PATH)


def normalize_path(raw_path: str) -> str:
    if not isinstance(raw_path, str) or not raw_path.strip():
        raise HandoffError("paths must be non-empty strings")
    if raw_path != raw_path.strip():
        raise HandoffError(f"path has surrounding whitespace: {raw_path!r}")
    path = Path(raw_path)
    if path.is_absolute():
        raise HandoffError(f"absolute paths are not allowed: {raw_path}")
    if any(part in ("", ".", "..") for part in path.parts):
        raise HandoffError(f"path must stay inside repo: {raw_path}")
    if any(char in raw_path for char in "*?{}"):
        raise HandoffError(f"wildcards are not allowed: {raw_path}")
    repo_path = (ROOT / path).resolve()
    try:
        repo_path.relative_to(ROOT)
    except ValueError as exc:
        raise HandoffError(f"path escapes repo: {raw_path}") from exc
    if repo_path.exists() and repo_path.is_dir():
        raise HandoffError(f"directories are not allowed; list files explicitly: {raw_path}")
    if not repo_path.exists():
        tracked = run_git(["ls-files", "--error-unmatch", "--", raw_path], check=False)
        if tracked.returncode != 0:
            raise HandoffError(f"path does not exist and is not tracked: {raw_path}")
    return path.as_posix()


def validate_paths(paths: Any) -> list[str]:
    if not isinstance(paths, list) or not paths:
        raise HandoffError("paths must be a non-empty array")
    normalized: list[str] = []
    seen: set[str] = set()
    for raw_path in paths:
        path = normalize_path(raw_path)
        if path not in seen:
            normalized.append(path)
            seen.add(path)
    return normalized


def validate_commit_message(message: Any) -> str:
    if not isinstance(message, str) or not message.strip():
        raise HandoffError("commit_message must be a non-empty string")
    if "\n" in message or "\r" in message or "\x00" in message:
        raise HandoffError("commit_message must be a single line")
    return message


def validate_patch_text(raw_patch: Any) -> str | None:
    if raw_patch is None:
        return None
    if not isinstance(raw_patch, str) or not raw_patch.strip():
        raise HandoffError("patch must be a non-empty string when provided")
    if "\x00" in raw_patch:
        raise HandoffError("patch must not contain NUL bytes")
    return raw_patch


def validate_pending_item(
    item: dict[str, Any],
) -> tuple[str, list[str], str, str | None, bool]:
    if item.get("repo") != ALLOWED_REPO:
        raise HandoffError(f"repo must be {ALLOWED_REPO}")
    if item.get("status") != "pending":
        raise HandoffError("item status must be pending")
    branch = item.get("branch")
    if not isinstance(branch, str) or not branch:
        raise HandoffError("branch must be a non-empty string")
    paths = validate_paths(item.get("paths"))
    message = validate_commit_message(item.get("commit_message"))
    patch = validate_patch_text(item.get("patch"))
    allow_control_plane = bool(item.get("allow_control_plane"))
    return branch, paths, message, patch, allow_control_plane


def is_ledger_path(path: str) -> bool:
    posix = Path(path).as_posix()
    if any(posix.startswith(prefix) for prefix in LEDGER_PREFIXES):
        return True
    return Path(posix).name in LEDGER_BASENAMES


def is_control_plane_path(path: str) -> bool:
    posix = Path(path).as_posix()
    if posix in CONTROL_PLANE_PATHS:
        return True
    return any(posix.startswith(prefix) for prefix in CONTROL_PLANE_PREFIXES)


def assert_paths_allowed(paths: list[str], *, allow_control_plane: bool) -> None:
    if allow_control_plane:
        return
    blocked = sorted(path for path in paths if is_control_plane_path(path))
    if blocked:
        raise HandoffError(
            "refusing to modify the automation control plane: "
            + ", ".join(blocked)
            + " (resubmit with --allow-control-plane for an explicit, "
            "human-named maintenance task)"
        )


def assert_not_ledger_only(paths: set[str]) -> None:
    if paths and all(is_ledger_path(path) for path in paths):
        raise HandoffError(
            "refusing bookkeeping-only commit: staged changes are limited to "
            "maintainer ledger/telemetry files ("
            + ", ".join(sorted(paths))
            + "); a commit must touch at least one durable, non-ledger file "
            "(a fix, detector, gate, or spec)"
        )


@contextlib.contextmanager
def single_writer_lock() -> Iterator[bool]:
    """Yield True if this process holds the exclusive handoff lock.

    Staging and committing must be single-writer: two processors editing the
    index at once is what made past concurrency catastrophic. The lock is
    non-blocking, so a second processor cleanly yields False and skips instead
    of colliding; the queued item is retried on the next poll.
    """
    LOCK_PATH.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(LOCK_PATH, os.O_CREAT | os.O_RDWR, 0o644)
    acquired = False
    try:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            acquired = True
        except (BlockingIOError, OSError):
            acquired = False
        yield acquired
    finally:
        if acquired:
            with contextlib.suppress(OSError):
                fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)


def run_green_wall(*, skip: bool = False) -> None:
    if skip:
        print(
            "WARNING: --skip-green-wall — committing without `npm run check`. "
            "The slice's own proof is the only gate.",
            file=sys.stderr,
        )
        return
    result = subprocess.run(
        ["npm", "run", "check"],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    if result.returncode != 0:
        output = (result.stdout or "").strip()
        tail = output[-8000:] if len(output) > 8000 else output
        raise HandoffError(f"npm run check failed before commit:\n{tail}")


def staged_paths() -> set[str]:
    result = run_git(["diff", "--cached", "--name-only"])
    return {line.strip() for line in result.stdout.splitlines() if line.strip()}


def update_item_status(
    items: list[dict[str, Any]],
    item_id: str,
    *,
    status: str,
    commit_sha: str | None = None,
    failure_reason: str | None = None,
) -> None:
    for item in items:
        if item.get("id") == item_id:
            item["status"] = status
            item["completed_at"] = utc_now()
            item["commit_sha"] = commit_sha
            item["failure_reason"] = failure_reason
            write_queue(items)
            return
    raise HandoffError(f"queue item disappeared: {item_id}")


def read_patch_file(path: str | None) -> str | None:
    if path is None:
        return None
    patch_path = Path(path)
    if not patch_path.is_file():
        raise HandoffError(f"patch file does not exist: {path}")
    patch = patch_path.read_text(encoding="utf-8")
    return validate_patch_text(patch)


def enqueue(
    paths: list[str],
    message: str,
    branch: str | None,
    patch: str | None = None,
    *,
    allow_control_plane: bool = False,
) -> str:
    normalized_paths = validate_paths(paths)
    assert_paths_allowed(normalized_paths, allow_control_plane=allow_control_plane)
    item_id = str(uuid.uuid4())
    item = {
        "id": item_id,
        "status": "pending",
        "branch": branch or current_branch(),
        "repo": ALLOWED_REPO,
        "paths": normalized_paths,
        "commit_message": validate_commit_message(message),
        "patch": validate_patch_text(patch),
        "allow_control_plane": allow_control_plane,
        "created_at": utc_now(),
        "completed_at": None,
        "commit_sha": None,
        "failure_reason": None,
    }
    items = read_queue()
    items.append(item)
    write_queue(items)
    return item_id


def find_item(item_id: str) -> dict[str, Any]:
    for item in read_queue():
        if item.get("id") == item_id:
            return item
    raise HandoffError(f"queue item not found: {item_id}")


def wait_for_item(item_id: str, timeout_seconds: int, interval_seconds: int) -> int:
    deadline = time.monotonic() + timeout_seconds
    while True:
        item = find_item(item_id)
        status = item.get("status")
        if status == "done":
            print(f"done {item.get('commit_sha')}")
            return 0
        if status == "failed":
            print(f"failed {item.get('failure_reason')}", file=sys.stderr)
            return 2
        if time.monotonic() >= deadline:
            print(f"timeout waiting for {item_id}", file=sys.stderr)
            return 3
        time.sleep(interval_seconds)


def process_next(*, skip_green_wall: bool = False) -> int:
    with single_writer_lock() as acquired:
        if not acquired:
            print("commit handoff busy; another processor holds the lock")
            return 0
        return _process_pending(skip_green_wall=skip_green_wall)


def _process_pending(*, skip_green_wall: bool = False) -> int:
    items = read_queue()
    item = next((candidate for candidate in items if candidate.get("status") == "pending"), None)
    if item is None:
        print("no pending commit handoff")
        return 0

    item_id = str(item.get("id", ""))
    staged_by_worker: list[str] = []
    try:
        if not item_id:
            raise HandoffError("id must be a non-empty string")
        expected_branch, paths, message, patch, allow_control_plane = validate_pending_item(item)
        assert_paths_allowed(paths, allow_control_plane=allow_control_plane)
        actual_branch = current_branch()
        if actual_branch != expected_branch:
            raise HandoffError(f"branch mismatch: expected {expected_branch}, got {actual_branch}")
        before = staged_paths()
        requested = set(paths)
        unexpected_preexisting = before - requested
        if unexpected_preexisting:
            raise HandoffError(
                "pre-existing staged changes would be included: "
                + ", ".join(sorted(unexpected_preexisting))
            )
        if patch is None:
            run_git(["add", "--", *paths])
        else:
            run_git(["apply", "--cached", "--whitespace=nowarn", "-"], input_text=patch)
        staged_by_worker = paths
        after = staged_paths()
        unexpected = after - requested
        if unexpected:
            raise HandoffError("unexpected staged paths: " + ", ".join(sorted(unexpected)))
        if not after:
            raise HandoffError("requested paths produced no staged changes")
        assert_not_ledger_only(after)
        run_green_wall(skip=skip_green_wall)
        run_git(["commit", "-m", message])
        commit_sha = run_git(["rev-parse", "HEAD"]).stdout.strip()
    except Exception as exc:
        failure_reason = str(exc)
        if staged_by_worker:
            cleanup = run_git(["restore", "--staged", "--", *staged_by_worker], check=False)
            if cleanup.returncode != 0:
                cleanup_detail = (cleanup.stderr or cleanup.stdout).strip()
                failure_reason = f"{failure_reason}; failed to unstage request: {cleanup_detail}"
        update_item_status(read_queue(), item_id, status="failed", failure_reason=failure_reason)
        print(f"failed {item_id}: {exc}", file=sys.stderr)
        return 2

    update_item_status(read_queue(), item_id, status="done", commit_sha=commit_sha)
    print(f"done {item_id} {commit_sha}")
    return 0


def status(item_id: str | None) -> int:
    items = read_queue()
    selected = items if item_id is None else [item for item in items if item.get("id") == item_id]
    for item in selected:
        print(json.dumps(item, sort_keys=True))
    if item_id is not None and not selected:
        print(f"queue item not found: {item_id}", file=sys.stderr)
        return 1
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    request = subparsers.add_parser("request", help="append a pending commit request")
    request.add_argument("--message", required=True, help="single-line commit message")
    request.add_argument("--branch", help="expected branch; defaults to current branch")
    request.add_argument(
        "--patch-file",
        help="optional unified diff to apply to the index instead of staging whole paths",
    )
    request.add_argument(
        "--path",
        action="append",
        required=True,
        dest="paths",
        help="explicit file path",
    )
    request.add_argument(
        "--allow-control-plane",
        action="store_true",
        help=(
            "permit editing automation control-plane files (commit-handoff "
            "scripts, Cursor hooks, queue plumbing). Use only for an explicit, "
            "human-named maintenance task."
        ),
    )
    request.add_argument("--wait", action="store_true", help="wait for Cursor to process the item")
    request.add_argument("--timeout-seconds", type=int, default=600)
    request.add_argument("--interval-seconds", type=int, default=60)

    wait = subparsers.add_parser("wait", help="wait for a queue item by id")
    wait.add_argument("id")
    wait.add_argument("--timeout-seconds", type=int, default=600)
    wait.add_argument("--interval-seconds", type=int, default=60)

    process = subparsers.add_parser("process-next", help="process the oldest pending item")
    process.add_argument(
        "--skip-green-wall",
        action="store_true",
        help=(
            "commit without running `npm run check` first. Only for a baseline that is "
            "already red for reasons unrelated to the queued work; the queued slice's own "
            "proof becomes the sole gate."
        ),
    )

    show = subparsers.add_parser("status", help="print queue items")
    show.add_argument("id", nargs="?")

    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        if args.command == "request":
            item_id = enqueue(
                args.paths,
                args.message,
                args.branch,
                read_patch_file(args.patch_file),
                allow_control_plane=args.allow_control_plane,
            )
            print(item_id)
            if args.wait:
                return wait_for_item(item_id, args.timeout_seconds, args.interval_seconds)
            return 0
        if args.command == "wait":
            return wait_for_item(args.id, args.timeout_seconds, args.interval_seconds)
        if args.command == "process-next":
            return process_next(skip_green_wall=args.skip_green_wall)
        if args.command == "status":
            return status(args.id)
    except HandoffError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
