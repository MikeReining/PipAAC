#!/usr/bin/env node
/**
 * Local Worker slots. The founder browse copy is port 21087 / slot-0 and keeps
 * the live CATALOG. Agents start their own copy with `npm run dev:agent`.
 * Ports live in the 210xx block — the 87xx range collides with every other
 * wrangler project on this Mac (founder ruling 2026-09-28).
 */
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const BROWSE_PORT = 21087;
export const BROWSE_INSPECTOR_PORT = 21229;
export const AGENT_PORT_FIRST = 21088;
export const AGENT_PORT_LAST = 21098;
export const LAUNCHD_LABEL = "com.pippaac.dev-slot0";

const WRANGLER_JS = path.join(REPO_ROOT, "node_modules/wrangler/bin/wrangler.js");

export function slotForPort(port) {
  return port - BROWSE_PORT;
}

export function inspectorPortFor(port) {
  return BROWSE_INSPECTOR_PORT + slotForPort(port);
}

export function persistDirFor(repoRoot, port) {
  return path.join(repoRoot, ".wrangler", `slot-${slotForPort(port)}`);
}

export function parseBusyPorts(raw) {
  const busy = new Set();
  if (!raw) return busy;
  for (const part of raw.split(",")) {
    const port = Number(part.trim());
    if (Number.isInteger(port) && port > 0) busy.add(port);
  }
  return busy;
}

export function pickAgentPort(busyPorts) {
  for (let port = AGENT_PORT_FIRST; port <= AGENT_PORT_LAST; port += 1) {
    if (!busyPorts.has(port)) return port;
  }
  throw new Error(
    `no free agent port in ${AGENT_PORT_FIRST}-${AGENT_PORT_LAST}; stop an agent copy or run: node scripts/dev.mjs status`,
  );
}

export function wranglerDevArgs({ port, repoRoot, localCatalog }) {
  const args = [
    "dev",
    "--ip",
    "127.0.0.1",
    "--port",
    String(port),
    "--local-upstream",
    `localhost:${port}`,
    "--upstream-protocol",
    "http",
    "--inspector-port",
    String(inspectorPortFor(port)),
    "--persist-to",
    persistDirFor(repoRoot, port),
    "--show-interactive-dev-session",
    "false",
  ];
  if (localCatalog) args.push("--local");
  return args;
}

export function planBrowse({ listening, service = false }) {
  if (!service && listening) {
    return {
      action: "already-running",
      port: BROWSE_PORT,
      origin: `http://localhost:${BROWSE_PORT}`,
      args: [],
    };
  }
  return {
    action: "start",
    port: BROWSE_PORT,
    origin: `http://localhost:${BROWSE_PORT}`,
    args: wranglerDevArgs({ port: BROWSE_PORT, repoRoot: REPO_ROOT, localCatalog: false }),
  };
}

export function planAuto(busyPorts) {
  const port = pickAgentPort(busyPorts);
  return {
    action: "start",
    port,
    origin: `http://localhost:${port}`,
    args: wranglerDevArgs({ port, repoRoot: REPO_ROOT, localCatalog: true }),
  };
}

export function isPortListening(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host }, () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
  });
}

async function busyPortsInRange(first, last) {
  const override = process.env.GS_BUSY_PORTS;
  if (override != null && override !== "") return parseBusyPorts(override);
  if (override === "") return new Set();
  const busy = new Set();
  for (let port = first; port <= last; port += 1) {
    if (await isPortListening(port)) busy.add(port);
  }
  return busy;
}

function parseCli(argv) {
  const args = argv.slice(2);
  const command = args.find((arg) => !arg.startsWith("-")) ?? "browse";
  return {
    command,
    printCmd: args.includes("--print-cmd"),
    service: args.includes("--service"),
  };
}

function printPlan(plan, extra = {}) {
  console.log(JSON.stringify({ ...plan, ...extra }, null, 2));
}

function alreadyRunningMessage(origin) {
  return [
    `Already running at ${origin}`,
    "This is the founder browse copy. Agents start their own with: npm run dev:agent",
  ].join("\n");
}

function launchdInstalled() {
  if (process.platform !== "darwin") return false;
  const result = spawnSync("launchctl", ["list", LAUNCHD_LABEL], { encoding: "utf8" });
  return result.status === 0;
}

function kickstartBrowse() {
  const result = spawnSync(
    "launchctl",
    ["kickstart", `gui/${process.getuid()}/${LAUNCHD_LABEL}`],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    const detail = `${result.stderr || result.stdout || ""}`.trim();
    throw new Error(`launchctl kickstart failed${detail ? `: ${detail}` : ""}`);
  }
}

async function waitUntilListening(port, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isPortListening(port)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`timed out waiting for http://127.0.0.1:${port}`);
}

async function waitUntilFree(ports) {
  const list = Array.isArray(ports) ? ports : [ports];
  let warned = false;
  for (;;) {
    const busy = [];
    for (const port of list) {
      if (await isPortListening(port)) busy.push(port);
    }
    if (busy.length === 0) return;
    if (!warned) {
      console.log(`Waiting for port ${busy.join(", ")} to be free…`);
      warned = true;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

function execWrangler(args) {
  const child = spawn(process.execPath, [WRANGLER_JS, ...args], {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
  });
}

async function status() {
  const rows = [];
  for (let port = BROWSE_PORT; port <= AGENT_PORT_LAST; port += 1) {
    const listening = await isPortListening(port);
    if (!listening) continue;
    rows.push({
      slot: slotForPort(port),
      port,
      origin: `http://localhost:${port}`,
      role: port === BROWSE_PORT ? "browse" : "agent",
    });
  }
  console.log(JSON.stringify({ listening: rows }, null, 2));
}

async function main() {
  const cli = parseCli(process.argv);
  if (!["browse", "auto", "status"].includes(cli.command)) {
    console.error("usage: node scripts/dev.mjs <browse|auto|status> [--print-cmd] [--service]");
    process.exit(2);
  }

  if (cli.command === "status") {
    await status();
    return;
  }

  if (cli.command === "browse") {
    const busy = await busyPortsInRange(BROWSE_PORT, BROWSE_PORT);
    const plan = planBrowse({ listening: busy.has(BROWSE_PORT), service: cli.service });
    if (cli.printCmd) {
      printPlan(plan);
      return;
    }
    if (plan.action === "already-running") {
      console.log(alreadyRunningMessage(plan.origin));
      return;
    }
    if (!cli.service && launchdInstalled()) {
      kickstartBrowse();
      await waitUntilListening(BROWSE_PORT, 30_000);
      console.log(alreadyRunningMessage(plan.origin));
      return;
    }
    if (cli.service) await waitUntilFree([BROWSE_PORT, inspectorPortFor(BROWSE_PORT)]);
    console.log(`Browse copy: ${plan.origin}`);
    execWrangler(plan.args);
    return;
  }

  const busy = await busyPortsInRange(AGENT_PORT_FIRST, AGENT_PORT_LAST);
  const plan = planAuto(busy);
  if (cli.printCmd) {
    printPlan(plan);
    return;
  }
  console.log(`Agent copy: ${plan.origin}`);
  console.log("Scratch catalog (not the live library). Founder browse copy stays on npm run dev.");
  execWrangler(plan.args);
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
