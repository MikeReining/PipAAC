#!/usr/bin/env node
/** 041 Slice D2 — the check-wall leg for the speed probe. Finds (or
 *  boots) an agent dev copy in the 21088-21098 range, then runs
 *  speed_probe.mjs against it. The agent copy it starts is left
 *  running — agent slots are meant to persist (scripts/dev.mjs). */
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import {
  AGENT_PORT_FIRST, AGENT_PORT_LAST, isPortListening,
} from "../dev.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

let port = null;
for (let p = AGENT_PORT_FIRST; p <= AGENT_PORT_LAST && !port; p++) {
  if (await isPortListening(p)) port = p;
}

if (!port) {
  port = AGENT_PORT_FIRST;
  spawn(process.execPath, [path.join(repoRoot, "node_modules/wrangler/bin/wrangler.js"),
    "dev", "--ip", "127.0.0.1", "--port", String(port),
    "--local-upstream", `localhost:${port}`, "--upstream-protocol", "http",
    "--inspector-port", "21230",
    "--persist-to", path.join(repoRoot, ".wrangler", `slot-${port - 21087}`),
    "--show-interactive-dev-session", "false"],
    { cwd: repoRoot, detached: true, stdio: "ignore" }).unref();
  const deadline = Date.now() + 60_000;
  while (!(await isPortListening(port))) {
    if (Date.now() > deadline) {
      console.error("speed gate: agent copy never came up on :" + port);
      process.exit(1);
    }
    await sleep(500);
  }
  // Wrangler binds the port before the Worker is ready — give it a beat.
  await sleep(1500);
}

const r = spawnSync(process.execPath,
  [path.join(repoRoot, "scripts/probes/speed_probe.mjs"), `http://localhost:${port}`],
  { cwd: repoRoot, encoding: "utf8", stdio: "inherit" });
process.exit(r.status ?? 1);
