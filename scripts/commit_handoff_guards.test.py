#!/usr/bin/env python3
"""Guards for the commit handoff queue.

Proves the three structural safeguards added after the maintainer-loop incident:
  1. single-writer lock  -> two processors can never stage/commit at once;
  2. bookkeeping-only refusal -> a commit must touch a non-ledger file;
  3. control-plane denial -> the handoff cannot rewrite its own machinery
     without an explicit, human-named maintenance task.

Run: python3 scripts/commit_handoff_guards.test.py
"""

from __future__ import annotations

import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import commit_handoff_queue as q  # noqa: E402


class LedgerPathTests(unittest.TestCase):
    def test_ledger_basenames_anywhere(self) -> None:
        for path in (
            "docs/operations/code-maintainer/RUNLOG.md",
            "docs/operations/code-maintainer/HEALTH.md",
            "docs/operations/code-maintainer/HOTSPOT-PROOF-MAP.md",
            "anywhere/LEDGER.md",
        ):
            self.assertTrue(q.is_ledger_path(path), path)

    def test_wmd_plumbing_is_ledger(self) -> None:
        self.assertTrue(q.is_ledger_path(".wmd/commit-queue.jsonl"))

    def test_real_source_is_not_ledger(self) -> None:
        self.assertFalse(q.is_ledger_path("packages/renderer/block_renderer.mjs"))


class LedgerOnlyCommitTests(unittest.TestCase):
    def test_ledger_only_is_refused(self) -> None:
        with self.assertRaises(q.HandoffError):
            q.assert_not_ledger_only({"docs/operations/code-maintainer/RUNLOG.md"})

    def test_multiple_ledger_only_is_refused(self) -> None:
        with self.assertRaises(q.HandoffError):
            q.assert_not_ledger_only(
                {
                    "docs/operations/code-maintainer/RUNLOG.md",
                    "docs/operations/code-maintainer/HEALTH.md",
                }
            )

    def test_ledger_plus_real_file_is_allowed(self) -> None:
        q.assert_not_ledger_only(
            {
                "docs/operations/code-maintainer/RUNLOG.md",
                "packages/renderer/block_renderer.mjs",
            }
        )

    def test_empty_set_is_noop(self) -> None:
        q.assert_not_ledger_only(set())


class ControlPlaneTests(unittest.TestCase):
    def test_control_plane_paths_detected(self) -> None:
        for path in (
            "scripts/commit_handoff_queue.py",
            "scripts/commit_queue_watcher.py",
            "scripts/install_commit_queue_watcher.sh",
            ".cursor/hooks.json",
            ".cursor/hooks/process-commit-queue.sh",
            "scripts/commit_handoff/processor.py",
        ):
            self.assertTrue(q.is_control_plane_path(path), path)

    def test_ordinary_path_is_not_control_plane(self) -> None:
        self.assertFalse(q.is_control_plane_path("apps/studio/app/page.js"))

    def test_denied_without_flag(self) -> None:
        with self.assertRaises(q.HandoffError):
            q.assert_paths_allowed(
                ["scripts/commit_queue_watcher.py"], allow_control_plane=False
            )

    def test_allowed_with_explicit_flag(self) -> None:
        q.assert_paths_allowed(
            ["scripts/commit_queue_watcher.py"], allow_control_plane=True
        )

    def test_ordinary_paths_pass(self) -> None:
        q.assert_paths_allowed(
            ["apps/studio/app/page.js", "packages/renderer/block_renderer.mjs"],
            allow_control_plane=False,
        )


class SingleWriterLockTests(unittest.TestCase):
    def setUp(self) -> None:
        self._original_lock = q.LOCK_PATH
        self._tmpdir = tempfile.mkdtemp(prefix="handoff-lock-test-")
        q.LOCK_PATH = Path(self._tmpdir) / "commit-queue.lock"

    def tearDown(self) -> None:
        q.LOCK_PATH = self._original_lock
        shutil.rmtree(self._tmpdir, ignore_errors=True)

    def test_second_acquisition_is_blocked(self) -> None:
        with q.single_writer_lock() as first:
            self.assertTrue(first)
            with q.single_writer_lock() as second:
                self.assertFalse(second)

    def test_lock_is_released_after_use(self) -> None:
        with q.single_writer_lock() as first:
            self.assertTrue(first)
        with q.single_writer_lock() as third:
            self.assertTrue(third)


if __name__ == "__main__":
    unittest.main(verbosity=2)
