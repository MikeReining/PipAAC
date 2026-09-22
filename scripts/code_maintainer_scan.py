#!/usr/bin/env python3
"""Rank likely code-maintenance targets.

This is intentionally small and stack-neutral. It finds files whose size,
comments, TODOs, fallback patterns, or broad naming suggest future maintenance
pressure. The score is advisory; judgment still owns target selection.
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import os
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable


DEFAULT_EXCLUDE_DIRS = {
    ".git",
    ".next",
    ".turbo",
    ".venv",
    ".vercel",
    ".wmd",
    ".wmd-eval",
    "__pycache__",
    "build",
    "coverage",
    "dist",
    "experiments",
    "fixtures",
    "node_modules",
    "target",
    "vendor",
}

DEFAULT_EXCLUDE_SUFFIXES = {
    ".lock",
    ".log",
    ".map",
    ".min.css",
    ".min.js",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".ico",
    ".pdf",
    ".zip",
}

DEFAULT_EXCLUDE_FILES = {
    "_ds_bundle.js",
    "build-report.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
}

DEFAULT_EXCLUDE_PATHS = {
    "packages/curated-backgrounds/catalog/backgrounds.json",
    "packages/service-registry/data/p1-candidates.generated.json",
    "packages/service-registry/data/registry.json",
    "packages/service-registry/service-icons/v1/manifest.json",
}

DEFAULT_EXCLUDE_PREFIXES = {
    "packages/curated-backgrounds/catalog/rounds/",
}

TEXT_SUFFIXES = {
    ".c",
    ".cc",
    ".css",
    ".go",
    ".h",
    ".html",
    ".js",
    ".json",
    ".jsx",
    ".md",
    ".mdx",
    ".mjs",
    ".py",
    ".rs",
    ".sh",
    ".sql",
    ".ts",
    ".tsx",
    ".txt",
    ".yaml",
    ".yml",
}

FALLBACK_MARKERS = (
    "|| 0",
    "|| ''",
    "|| []",
    "catch (",
    "catch(",
    "except Exception",
    "TODO",
    "FIXME",
    "HACK",
)

BROAD_NAMES = (
    "data",
    "result",
    "item",
    "items",
    "handler",
    "manager",
    "utils",
    "helpers",
)

CSS_CLASS_RE = re.compile(r"\.([_a-zA-Z][-_a-zA-Z0-9]*)")
CSS_NAMESPACE_MIN_OCCURRENCES = 3

DEFAULT_RULES_PATH = "docs/operations/code-maintainer/DYNAMIC_RULES.json"


@dataclass
class Signal:
    name: str
    count: int
    suppressed: bool


@dataclass
class Finding:
    path: str
    score: int
    lines: int
    bytes: int
    long_lines: int
    todo_markers: int
    fallback_markers: int
    broad_name_hits: int
    signals: list[Signal]
    reasons: list[str]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="*", default=["."], help="Files or directories to scan.")
    parser.add_argument("--top", type=int, default=15, help="Number of ranked files to print.")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON.")
    parser.add_argument(
        "--rules",
        default=DEFAULT_RULES_PATH,
        help=f"Suppression rules JSON. Default: {DEFAULT_RULES_PATH}.",
    )
    parser.add_argument(
        "--include-docs",
        action="store_true",
        help="Include Markdown/docs. Default includes docs only when explicitly passed.",
    )
    return parser.parse_args()


def normalize_path(path: Path | str) -> str:
    return Path(path).as_posix().lstrip("./")


def load_rules(path: str) -> list[dict]:
    rules_path = Path(path)
    if not rules_path.exists():
        return []
    try:
        data = json.loads(rules_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    suppressions = data.get("suppressions")
    if isinstance(suppressions, list):
        return [rule for rule in suppressions if isinstance(rule, dict)]
    legacy_rules = data.get("rules")
    if isinstance(legacy_rules, list):
        return [rule for rule in legacy_rules if isinstance(rule, dict)]
    return []


def suppression_matches(rule: dict, path: str, signal: str) -> bool:
    rule_path = rule.get("path")
    rule_signal = rule.get("signal")
    if not isinstance(rule_path, str) or not isinstance(rule_signal, str):
        return False
    if rule_signal not in {signal, "*"}:
        return False
    if "*" in rule_path:
        return fnmatch.fnmatch(path, rule_path)
    return path == rule_path


def is_suppressed(rules: list[dict], path: str, signal: str) -> bool:
    return any(suppression_matches(rule, path, signal) for rule in rules)


def is_excluded(path: Path) -> bool:
    normalized = normalize_path(path)
    if normalized in DEFAULT_EXCLUDE_PATHS:
        return True
    if any(normalized.startswith(prefix) for prefix in DEFAULT_EXCLUDE_PREFIXES):
        return True
    if any(part in DEFAULT_EXCLUDE_DIRS for part in path.parts):
        return True
    name = path.name
    if name in DEFAULT_EXCLUDE_FILES:
        return True
    if ".generated." in name:
        return True
    return any(name.endswith(suffix) for suffix in DEFAULT_EXCLUDE_SUFFIXES)


def is_text_candidate(path: Path, include_docs: bool, explicit: bool) -> bool:
    if is_excluded(path):
        return False
    if path.suffix not in TEXT_SUFFIXES:
        return False
    if path.suffix in {".md", ".mdx", ".txt"} and not (include_docs or explicit):
        return False
    return True


def iter_files(paths: Iterable[str], include_docs: bool) -> Iterable[Path]:
    for raw in paths:
        root = Path(raw)
        explicit = root.is_file()
        if explicit:
            if is_text_candidate(root, include_docs=True, explicit=True):
                yield root
            continue
        if not root.exists():
            continue
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if d not in DEFAULT_EXCLUDE_DIRS]
            for filename in filenames:
                path = Path(dirpath) / filename
                if path.as_posix().lstrip("./") == "scripts/code_maintainer_scan.py":
                    continue
                if is_text_candidate(path, include_docs=include_docs, explicit=False):
                    yield path


def count_broad_names(text: str) -> int:
    padded = f" {text.replace('_', ' ').replace('-', ' ')} "
    return sum(padded.count(f" {name} ") for name in BROAD_NAMES)


def count_css_namespaces(text: str) -> int:
    namespaces: dict[str, int] = {}
    for match in CSS_CLASS_RE.finditer(text):
        class_name = match.group(1)
        if "__" in class_name:
            namespace = class_name.split("__", 1)[0]
        elif "-" in class_name:
            namespace = class_name.split("-", 1)[0]
        else:
            namespace = class_name
        namespaces[namespace] = namespaces.get(namespace, 0) + 1
    return sum(
        1
        for count in namespaces.values()
        if count >= CSS_NAMESPACE_MIN_OCCURRENCES
    )


def add_signal(
    *,
    path: str,
    name: str,
    count: int,
    score: int,
    reason: str,
    rules: list[dict],
    signals: list[Signal],
    reasons: list[str],
) -> int:
    suppressed = is_suppressed(rules, path, name)
    signals.append(Signal(name=name, count=count, suppressed=suppressed))
    if suppressed:
        return 0
    reasons.append(reason)
    return score


def scan_file(path: Path, rules: list[dict]) -> Finding | None:
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return None

    normalized_path = normalize_path(path)
    lines = text.splitlines()
    line_count = len(lines)
    long_lines = sum(1 for line in lines if len(line) > 120)
    todo_markers = sum(text.count(marker) for marker in ("TODO", "FIXME", "HACK"))
    fallback_markers = sum(text.count(marker) for marker in FALLBACK_MARKERS)
    broad_name_hits = count_broad_names(text)
    css_namespace_count = count_css_namespaces(text) if path.suffix == ".css" else 0

    score = 0
    signals: list[Signal] = []
    reasons: list[str] = []

    if line_count >= 1200:
        score += add_signal(
            path=normalized_path,
            name="file_size",
            count=line_count,
            score=80,
            reason="very-large-file",
            rules=rules,
            signals=signals,
            reasons=reasons,
        )
    elif line_count >= 900:
        score += add_signal(
            path=normalized_path,
            name="file_size",
            count=line_count,
            score=55,
            reason="large-file",
            rules=rules,
            signals=signals,
            reasons=reasons,
        )
    elif line_count >= 500:
        score += add_signal(
            path=normalized_path,
            name="file_size",
            count=line_count,
            score=30,
            reason="medium-large-file",
            rules=rules,
            signals=signals,
            reasons=reasons,
        )
    elif line_count >= 300:
        score += add_signal(
            path=normalized_path,
            name="file_size",
            count=line_count,
            score=15,
            reason="growing-file",
            rules=rules,
            signals=signals,
            reasons=reasons,
        )

    if path.suffix == ".css":
        if line_count >= 1200:
            score += add_signal(
                path=normalized_path,
                name="css_surface",
                count=line_count,
                score=55,
                reason=f"very-large-css-surface:namespaces:{css_namespace_count}",
                rules=rules,
                signals=signals,
                reasons=reasons,
            )
        elif line_count >= 900:
            score += add_signal(
                path=normalized_path,
                name="css_surface",
                count=line_count,
                score=35,
                reason=f"large-css-surface:namespaces:{css_namespace_count}",
                rules=rules,
                signals=signals,
                reasons=reasons,
            )
        elif line_count >= 500 and css_namespace_count >= 4:
            score += add_signal(
                path=normalized_path,
                name="css_surface",
                count=css_namespace_count,
                score=25,
                reason=f"mixed-css-surface:namespaces:{css_namespace_count}",
                rules=rules,
                signals=signals,
                reasons=reasons,
            )

    if long_lines:
        score += add_signal(
            path=normalized_path,
            name="long_lines",
            count=long_lines,
            score=min(20, long_lines),
            reason=f"long-lines:{long_lines}",
            rules=rules,
            signals=signals,
            reasons=reasons,
        )
    if todo_markers:
        score += add_signal(
            path=normalized_path,
            name="todo_markers",
            count=todo_markers,
            score=min(30, todo_markers * 5),
            reason=f"todo-markers:{todo_markers}",
            rules=rules,
            signals=signals,
            reasons=reasons,
        )
    if fallback_markers:
        score += add_signal(
            path=normalized_path,
            name="fallback_markers",
            count=fallback_markers,
            score=min(30, fallback_markers * 4),
            reason=f"fallback-markers:{fallback_markers}",
            rules=rules,
            signals=signals,
            reasons=reasons,
        )
    if broad_name_hits >= 20:
        score += add_signal(
            path=normalized_path,
            name="broad_names",
            count=broad_name_hits,
            score=15,
            reason=f"broad-names:{broad_name_hits}",
            rules=rules,
            signals=signals,
            reasons=reasons,
        )
    elif broad_name_hits >= 8:
        score += add_signal(
            path=normalized_path,
            name="broad_names",
            count=broad_name_hits,
            score=8,
            reason=f"broad-names:{broad_name_hits}",
            rules=rules,
            signals=signals,
            reasons=reasons,
        )

    if path.name.lower() in {"utils.ts", "utils.js", "helpers.ts", "helpers.js"}:
        score += add_signal(
            path=normalized_path,
            name="generic_module_name",
            count=1,
            score=12,
            reason="generic-module-name",
            rules=rules,
            signals=signals,
            reasons=reasons,
        )

    if score == 0:
        return None

    return Finding(
        path=normalized_path,
        score=score,
        lines=line_count,
        bytes=len(text.encode("utf-8")),
        long_lines=long_lines,
        todo_markers=todo_markers,
        fallback_markers=fallback_markers,
        broad_name_hits=broad_name_hits,
        signals=signals,
        reasons=reasons,
    )


def main() -> int:
    args = parse_args()
    rules = load_rules(args.rules)
    findings = [
        finding
        for path in iter_files(args.paths, args.include_docs)
        if (finding := scan_file(path, rules))
    ]
    findings.sort(key=lambda finding: (-finding.score, -finding.lines, finding.path))

    if args.json:
        print(json.dumps([asdict(finding) for finding in findings[: args.top]], indent=2))
        return 0

    if not findings:
        print("No maintenance candidates found.")
        return 0

    print(f"{'score':>5} {'lines':>6}  path")
    print(f"{'-' * 5} {'-' * 6}  {'-' * 40}")
    for finding in findings[: args.top]:
        reason = ", ".join(finding.reasons)
        print(f"{finding.score:>5} {finding.lines:>6}  {finding.path}  [{reason}]")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
