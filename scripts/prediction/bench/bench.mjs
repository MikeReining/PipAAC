#!/usr/bin/env node
/**
 * 017 step 13 — one comparison command.
 *
 *   node scripts/prediction/bench/bench.mjs [--users=1-80] [--arms=A0,A3]
 *     [--days=30] [--run=name] [--final]
 *
 * For each synthetic user: one seeded board (answer-key typed words
 * removed), one frozen schedule shared by every arm, then every pick
 * priced through the real-board action model. Report →
 * out/prediction/<run>/report.{md,json}. Eval users (81–100) only under
 * --final on a clean tree, and the run is logged to final_runs.jsonl.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "../../../src/board/catalog.mjs";
import { loadSimFixture, replayArms } from "../../../src/board/sim_replay.mjs";
import { addPersonalEntity } from "../../../src/board/entities.mjs";
import { placeItem } from "../../../public/shared/groups.mjs";
import {
  loadSynthUsers, parseUserSpec, recordFinalRun, requireFinal,
  splitFor, userToFixture,
} from "../synth/splits.mjs";
import { actionModel, seedUserBoard } from "./actions.mjs";
import { buildArms } from "./arms.mjs";
import { writeReport } from "./report.mjs";

const repoRoot = join(import.meta.dirname, "../../..");
const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : d;
};

const usersSpec = arg("users", "1-80");
const ids = parseUserSpec(usersSpec);
const final = process.argv.includes("--final");
if (ids.some((id) => splitFor(id) === "eval")) requireFinal(process.argv);
const purpose = final ? "eval" : "tune";
const onlyArms = arg("arms", null)?.split(",");
const daysCap = arg("days", null) && Number(arg("days"));
const runName = arg("run", `run_${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}`);

const { catalog } = loadSimFixture(repoRoot);
const MODEL = catalog.prediction;
const catGroup = new Map(
  (catalog.groups ?? []).filter((g) => g.category).map((g) => [g.category, g.id]));

/** A seeded board db for this user: full seed minus typed words, with
 *  the user's entities filed into their category groups. */
function userDb(user) {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  seedUserBoard(db, catalog, user);
  const ents = user.entities.map((e) =>
    addPersonalEntity(db, { spokenName: e.name.toLowerCase(), category: e.category }));
  for (const e of ents) {
    const ent = user.entities.find((x) => x.name.toLowerCase() === e.spokenName);
    placeItem(db, catGroup.get(ent?.category) ?? "grp_my_words", "entity", e.id);
  }
  return { db, ents };
}

const users = loadSynthUsers(ids, { purpose });
const armDefs = buildArms({ model: MODEL })
  .filter((a) => !onlyArms || onlyArms.some((p) => a.name.startsWith(p)));

/* Users are independent — each replays every arm on its own seeded
 * board — so --jobs=N fans the id list out to N child processes and
 * merges their report.json results into one report. A shard child
 * (--shard) skips the final-run ledger; the parent records once. */
const jobs = Math.max(1, Number(arg("jobs", 1)));
const isShard = process.argv.includes("--shard");
if (jobs > 1) {
  const { spawn } = await import("node:child_process");
  const { readFileSync } = await import("node:fs");
  const chunks = [...Array(jobs)].map(() => []);
  ids.forEach((id, i) => chunks[i % jobs].push(id));
  const merge = {};
  const running = chunks.map((chunk, i) => new Promise((res, rej) => {
    if (!chunk.length) return res();
    const childRun = `${runName}_p${i}`;
    const child = spawn(process.execPath, [
      join(import.meta.dirname, "bench.mjs"),
      `--users=${chunk.join(",")}`, `--run=${childRun}`, "--shard",
      ...(onlyArms ? [`--arms=${onlyArms.join(",")}`] : []),
      ...(daysCap ? [`--days=${daysCap}`] : []),
      ...(final ? ["--final"] : []),
    ], { stdio: ["ignore", "inherit", "inherit"], cwd: repoRoot });
    child.on("exit", (code) => (code === 0 ? res() : rej(new Error(`shard ${childRun} failed (${code})`))));
  }));
  await Promise.all(running).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
  for (const [i, chunk] of chunks.entries()) {
    if (!chunk.length) continue;
    const shardJson = JSON.parse(readFileSync(
      join(repoRoot, "out/prediction", `${runName}_p${i}`, "report.json"), "utf8"));
    for (const [name, rows] of Object.entries(shardJson.results ?? {})) {
      merge[name] = [...(merge[name] ?? []), ...rows];
    }
  }
  const outDir = join(repoRoot, "out/prediction", runName);
  mkdirSync(outDir, { recursive: true });
  writeReport(merge, { outDir, runName, usersSpec, arms: armDefs.map((a) => a.name) });
  if (final) {
    recordFinalRun({
      commit: process.env.GIT_COMMIT ?? "unknown", run: runName,
      arms: armDefs.map((a) => a.name), users: ids.length,
    });
  }
  console.log(`report → ${join(outDir, "report.md")}`);
  process.exit(0);
}

/** picks[] → shownFor(message position): the frozen stream guarantees
 *  identical order — walk messages against the pick list. */
function alignShown(picks, messages) {
  let k = 0;
  const out = [];
  for (const m of messages) {
    const shown = [];
    for (let i = 0; i < m.words.length; i++) shown.push(picks[k++]?.shownKeys ?? []);
    out.push(shown);
  }
  return out;
}

const results = {}; // armName -> [{userId, cohorts, stats}]
for (const u of users) {
  const { db: boardDb, ents } = userDb(u);
  const fx = userToFixture(u);
  const arms = armDefs.map((a) => {
    const { db } = userDb(u); // every arm replays into its own board db
    return { ...a, db, entities: ents };
  });
  const replayed = await replayArms(catalog, fx, arms,
    daysCap ? { days: [...Array(daysCap)].map((_, i) => i + 1), measureFrom: 1 }
      : { measureFrom: 1 });

  const messages = u.days.flatMap((d) => d.messages);
  for (const arm of arms) {
    const shownByMsg = alignShown(replayed[arm.name].picks, messages);
    const m = actionModel(boardDb, catalog, ents);
    let words = 0, ms = 0, actions = 0;
    const v = { hit: 0, harmful: 0, unhelpful: 0 };
    const curve = { d1: [0, 0], w1: [0, 0], last: [0, 0] }; // [hits, moments]
    let hits = 0, moments = 0, recall = 0, shownMoments = 0;
    let mi = 0; // flat message index — matches alignShown's walk
    for (const d of u.days) {
      for (const msg of d.messages) {
        const c = m.costMessage(msg, (i) => shownByMsg[mi][i]);
        words += msg.words.length; ms += c.ms; actions += c.actions;
        for (const k of ["hit", "harmful", "unhelpful"]) v[k] += c.verdicts[k] ?? 0;
        mi++;
      }
    }
    // Strip metrics from the replay picks themselves.
    const core = new Set(boardDb.prepare(
      "SELECT sense_id AS id FROM core_cell WHERE layout = 'grid60'",
    ).all().map((r) => `sense:${r.id}`));
    const pos = { p1: [0, 0], later: [0, 0] };      // [hits, moments]
    const tgt = { core: [0, 0], noncore: [0, 0] };  // [hits, moments]
    for (const p of replayed[arm.name].picks) {
      if (p.position === 0) continue;
      moments++;
      const hit = p.shownKeys.includes(p.label) ? 1 : 0;
      if (p.shownKeys.length > 0) shownMoments++;
      hits += hit;
      if (p.candidates.some((c) => `${c.kind}:${c.id}` === p.label)) recall++;
      const bucket = p.day === 1 ? "d1" : p.day <= 7 ? "w1" : p.day >= 22 ? "last" : null;
      if (bucket) { curve[bucket][1]++; curve[bucket][0] += hit; }
      const pk = p.position === 1 ? "p1" : "later";
      pos[pk][1]++; pos[pk][0] += hit;
      const tk = core.has(p.label) ? "core" : "noncore";
      tgt[tk][1]++; tgt[tk][0] += hit;
    }
    results[arm.name] ??= [];
    results[arm.name].push({
      userId: u.id, persona: u.persona,
      words, ms, actions, hits, moments, recall, shownMoments,
      verdicts: v, curve, pos, tgt,
      msgs: messages.length,
      wpm: words / (ms / 60000),
      hitRate: moments ? hits / moments : 0,
      recallRate: moments ? recall / moments : 0,
      falseShowRate: moments ? (shownMoments - hits) / moments : 0,
    });
  }
  process.stderr.write(`\r${u.id} done (${Object.keys(results[armDefs[0].name] ?? []).length}/${users.length})`);
}
process.stderr.write("\n");

const outDir = join(repoRoot, "out/prediction", runName);
mkdirSync(outDir, { recursive: true });
writeReport(results, { outDir, runName, usersSpec, arms: armDefs.map((a) => a.name) });

if (final && !isShard) {
  recordFinalRun({
    commit: process.env.GIT_COMMIT ?? "unknown", run: runName,
    arms: armDefs.map((a) => a.name), users: ids.length,
  });
}
console.log(`report → ${join(outDir, "report.md")}`);
