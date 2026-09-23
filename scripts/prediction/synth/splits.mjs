/**
 * 017 step 12 — the unseen-eval guard. One module owns who may read
 * which synthetic users:
 *
 *   ids 1–60  fit   — default-weight fitting (fit_defaults.mjs)
 *   ids 61–80 tune  — threshold / prompt / flag tuning
 *   ids 81–100 eval — read only by a --final bench run on a clean tree
 *
 * `loadSynthUsers` enforces the split AND re-verifies every file's
 * SHA-256 against the committed manifest — the bench cannot run on a
 * drifted answer key even if it skips gen_users --check. `requireFinal`
 * is the eval gate: the flag plus a clean git tree, so repeated peeking
 * is a deliberate, visible commit.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const repoRoot = join(import.meta.dirname, "../../..");
export const USERS_DIR = join(repoRoot, "out/prediction/synth");
export const MANIFEST = join(repoRoot, "data/prediction/synth/manifest.json");
export const FINAL_RUNS = join(repoRoot, "data/prediction/final_runs.jsonl");

export const SPLITS = { fit: [1, 60], tune: [61, 80], eval: [81, 100] };

export function splitFor(id) {
  for (const [name, [lo, hi]] of Object.entries(SPLITS)) {
    if (id >= lo && id <= hi) return name;
  }
  throw new Error(`user id ${id} outside 1–${SPLITS.eval[1]}`);
}

/** "--users 1-10,14,20-30" → [1..10,14,20..30]. */
export function parseUserSpec(spec) {
  const ids = new Set();
  for (const part of String(spec).split(",")) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part.trim());
    if (!m) throw new Error(`bad --users spec "${part}"`);
    const [lo, hi] = [Number(m[1]), Number(m[2] ?? m[1])];
    for (let i = lo; i <= hi; i++) ids.add(i);
  }
  return [...ids].sort((a, b) => a - b);
}

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

/**
 * Load users for a purpose. Eval ids throw unless purpose is 'eval'
 * (which itself requires requireFinal to have run — the caller passes
 * purpose 'eval' only after the gate). Every file is hash-checked
 * against the manifest, so a stale or edited answer key fails here.
 */
export function loadSynthUsers(ids, { purpose, dir = USERS_DIR, manifest = MANIFEST } = {}) {
  for (const id of ids) {
    const split = splitFor(id);
    if (split === "eval" && purpose !== "eval") {
      throw new Error(`user ${id} is eval — ${purpose} may not read it`);
    }
    if (purpose === "fit" && split !== "fit") {
      throw new Error(`user ${id} is ${split} — fit reads ids 1–60 only`);
    }
    if (purpose === "tune" && split === "fit") {
      // Fit users may be tuned on — only eval is sealed.
    }
  }
  const want = JSON.parse(readFileSync(manifest, "utf8"));
  const users = [];
  for (const id of ids) {
    const uid = `u${String(id).padStart(3, "0")}`;
    const file = join(dir, `${uid}.json`);
    if (!existsSync(file)) {
      throw new Error(`${uid} missing — run gen_users.mjs first`);
    }
    const raw = readFileSync(file, "utf8");
    if (want.users[uid] !== sha256(raw.trimEnd())) {
      throw new Error(
        `${uid} fails the manifest hash — the answer key drifted; ` +
        `regenerate and commit a new manifest deliberately`);
    }
    users.push(JSON.parse(raw));
  }
  return users;
}

/**
 * A synth user as a replay fixture: all messages in `unscripted`, no
 * routine template, entities lowercased to match the answer-key words.
 */
export function userToFixture(user) {
  const unscripted = {};
  const days = user.days.map((d) => {
    unscripted[d.day] = d.messages.map((m) => ({ at: m.at, words: m.words }));
    return { day: d.day, kind: d.kind };
  });
  return {
    entities: user.entities.map((e) => ({
      name: e.name.toLowerCase(), category: e.category })),
    schoolDay: { sentences: [] },
    weekendDay: { sentences: [] },
    unscripted,
    days,
  };
}

/**
 * The eval gate (017-12.3): eval users are read only under `--final`,
 * and `--final` only on a clean git tree — a peek is a commit, visible
 * in history. `statusRunner` is injectable for tests.
 */
export function requireFinal(argv, {
  statusRunner = () => execFileSync("git", ["status", "--porcelain"], { cwd: repoRoot, encoding: "utf8" }),
} = {}) {
  if (!argv.includes("--final")) {
    throw new Error("eval users require --final");
  }
  const dirty = statusRunner().trim();
  if (dirty) {
    throw new Error(
      `--final requires a clean git tree:\n${dirty.split("\n").slice(0, 10).join("\n")}`);
  }
}

/** Append one final-run record — the audit trail of every eval read. */
export function recordFinalRun(entry, file = FINAL_RUNS) {
  appendFileSync(file, JSON.stringify({ date: new Date().toISOString(), ...entry }) + "\n");
}
