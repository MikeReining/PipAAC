/**
 * 017 step 13 — the bench report. Every number is computed from the
 * answer key and the painted offer (shownKeys), never an arm's self-
 * report. Bootstrap intervals resample USERS (the unit of evidence —
 * a predictor that only helps one child isn't a result).
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** 95% bootstrap CI over per-user values. Deterministic rng. */
function ci95(values, fn = mean, iters = 800) {
  if (values.length < 2) return [fn(values), fn(values)];
  let s = 1234567;
  const rnd = () => (s = (s * 1103515245 + 12345) >>> 0) / 4294967296;
  const boots = [];
  for (let i = 0; i < iters; i++) {
    const sample = values.map(() => values[Math.floor(rnd() * values.length)]);
    boots.push(fn(sample));
  }
  boots.sort((a, b) => a - b);
  return [boots[Math.floor(iters * 0.025)], boots[Math.floor(iters * 0.975)]];
}

/** Persona → cohort tags (a user can sit in several). */
export function cohortsFor(p) {
  const tags = [];
  if (p.pattern && p.pattern !== "standard") tags.push(`eval:${p.pattern}`);
  if (p.routine >= 0.7) tags.push("routine-heavy");
  if (p.routine < 0.5) tags.push("varied");
  if (p.noveltyPerWeek >= 10) tags.push("novelty-heavy");
  if (p.jitterMin >= 35 && p.routine < 0.5) tags.push("unpredictable");
  if (p.jitterMin >= 30 || p.weekendShiftMin >= 90) tags.push("schedule-change");
  return tags.length ? tags : ["standard"];
}

const fmtCi = ([lo, hi], d = 1) => `[${lo.toFixed(d)},${hi.toFixed(d)}]`;

export function writeReport(results, { outDir, runName, usersSpec, arms }) {
  const a0 = results["A0 nopred"];
  const armNames = Object.keys(results);
  const lines = [];
  lines.push(`# prediction bench — ${runName}`);
  lines.push(`users: ${usersSpec} | arms: ${armNames.join(", ")}`);
  lines.push("");
  lines.push("| arm | WPM | ΔWPM vs A0 | hit% | recall% | false-show% | harmful% | acts/word |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  const json = { run: runName, users: usersSpec, arms: {} };

  for (const name of armNames) {
    const rows = results[name];
    const wpmMean = mean(rows.map((r) => r.wpm));
    const wpmCi = ci95(rows.map((r) => r.wpm));
    const dWpm = a0 ? wpmMean - mean(a0.map((r) => r.wpm)) : 0;
    const hit = mean(rows.map((r) => r.hitRate));
    const rec = mean(rows.map((r) => r.recallRate));
    const fs = mean(rows.map((r) => r.falseShowRate));
    const totV = rows.reduce((t, r) =>
      t + r.verdicts.hit + r.verdicts.harmful + r.verdicts.unhelpful, 0);
    const harmful = rows.reduce((t, r) => t + r.verdicts.harmful, 0) / (totV || 1);
    const actsW = rows.reduce((t, r) => t + r.actions, 0)
      / rows.reduce((t, r) => t + r.words, 0);
    lines.push(`| ${name} | ${wpmMean.toFixed(1)} ${fmtCi(wpmCi)} | ` +
      `${dWpm >= 0 ? "+" : ""}${dWpm.toFixed(1)} | ${(hit * 100).toFixed(1)} | ` +
      `${(rec * 100).toFixed(1)} | ${(fs * 100).toFixed(1)} | ` +
      `${(harmful * 100).toFixed(1)} | ${actsW.toFixed(2)} |`);
    json.arms[name] = { wpmMean, wpmCi, dWpm, hit, rec, fs, harmful, actsW };
  }

  // Detail table: learning curve, position and target splits, effort.
  const rate = (a) => (a[1] ? a[0] / a[1] : 0);
  const sum2 = (rows, k) => rows.reduce((t, r) =>
    [t[0] + r[k][0], t[1] + r[k][1]], [0, 0]);
  lines.push("", "| arm | hit d1 | hit wk1 | hit d22+ | hit pos-1 | hit pos-2+ | hit core | hit non-core | acts/msg |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const name of armNames) {
    const rows = results[name];
    const curve = { d1: sum2(rows.map((r) => ({ d1: r.curve.d1 })), "d1"),
      w1: sum2(rows.map((r) => ({ w1: r.curve.w1 })), "w1"),
      last: sum2(rows.map((r) => ({ last: r.curve.last })), "last") };
    const p1 = sum2(rows.map((r) => ({ p1: r.pos.p1 })), "p1");
    const later = sum2(rows.map((r) => ({ later: r.pos.later })), "later");
    const tCore = sum2(rows.map((r) => ({ core: r.tgt.core })), "core");
    const tNc = sum2(rows.map((r) => ({ nc: r.tgt.noncore })), "nc");
    const actsM = rows.reduce((t, r) => t + r.actions, 0)
      / rows.reduce((t, r) => t + r.msgs, 0);
    const pc = (a) => (rate(a) * 100).toFixed(1);
    lines.push(`| ${name} | ${pc(curve.d1)} | ${pc(curve.w1)} | ${pc(curve.last)} | ` +
      `${pc(p1)} | ${pc(later)} | ${pc(tCore)} | ${pc(tNc)} | ${actsM.toFixed(1)} |`);
    Object.assign(json.arms[name], {
      curveHit: { d1: rate(curve.d1), w1: rate(curve.w1), last: rate(curve.last) },
      posHit: { p1: rate(p1), later: rate(later) },
      targetHit: { core: rate(tCore), noncore: rate(tNc) },
      actsPerMsg: actsM,
    });
  }

  // Regressions: every user where an improved arm loses to A1.
  const a1 = results["A1 backoff"];
  if (a1) {
    const losses = [];
    for (const name of armNames) {
      if (["A0 nopred", "A1 backoff"].includes(name)) continue;
      results[name].forEach((r, i) => {
        if (r.wpm < a1[i].wpm - 0.05) losses.push(`${name} < A1 on ${r.userId}`);
      });
    }
    lines.push("", `## regressions vs A1 (${losses.length || "none"})`);
    for (const l of losses.slice(0, 30)) lines.push(`- ${l}`);
  }

  // Cohort table: wpm per cohort per arm.
  const cohorts = new Set();
  for (const name of armNames) {
    for (const r of results[name]) cohortsFor(r.persona).forEach((c) => cohorts.add(c));
  }
  lines.push("", "## WPM by cohort", "",
    "| cohort | " + armNames.join(" | ") + " |", "| --- |" + " --- |".repeat(armNames.length));
  for (const c of [...cohorts].sort()) {
    const cells = armNames.map((name) => {
      const rows = results[name].filter((r) => cohortsFor(r.persona).includes(c));
      return rows.length ? mean(rows.map((r) => r.wpm)).toFixed(1) : "—";
    });
    lines.push(`| ${c} | ${cells.join(" | ")} |`);
  }

  // The raw per-user rows ride along — a sharded run (--jobs) merges
  // shards by reading these back, not by re-deriving aggregates.
  json.results = results;
  writeFileSync(join(outDir, "report.md"), lines.join("\n") + "\n");
  writeFileSync(join(outDir, "report.json"), JSON.stringify(json, null, 1) + "\n");
}
