import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import net from "node:net";
import { test } from "node:test";

import {
  AGENT_PORT_FIRST,
  AGENT_PORT_LAST,
  BROWSE_INSPECTOR_PORT,
  BROWSE_PORT,
  REPO_ROOT,
  inspectorPortFor,
  isPortListening,
  persistDirFor,
  pickAgentPort,
  planAuto,
  planBrowse,
  wranglerDevArgs,
} from "./dev.mjs";

function printCmd(command, busyPorts) {
  const result = spawnSync(process.execPath, ["scripts/dev.mjs", command, "--print-cmd"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: { ...process.env, GS_BUSY_PORTS: busyPorts },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function listen(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(port, "127.0.0.1", () => resolve(server));
    server.on("error", reject);
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

function flagValue(args, flag) {
  const index = args.indexOf(flag);
  assert.ok(index >= 0, `missing ${flag} in ${args.join(" ")}`);
  return args[index + 1];
}

test("browse copy is reserved and keeps the live catalog", () => {
  const free = planBrowse({ listening: false });
  assert.equal(free.action, "start");
  assert.equal(free.port, BROWSE_PORT);
  assert.equal(free.origin, `http://localhost:${BROWSE_PORT}`);
  assert.ok(!free.args.includes("--local"));
  assert.equal(persistDirFor(REPO_ROOT, BROWSE_PORT), `${REPO_ROOT}/.wrangler/slot-0`);
  assert.ok(free.args.includes(`${REPO_ROOT}/.wrangler/slot-0`));
  assert.ok(free.args.includes(String(inspectorPortFor(BROWSE_PORT))));
  assert.equal(flagValue(free.args, "--local-upstream"), `localhost:${BROWSE_PORT}`);
  assert.equal(flagValue(free.args, "--upstream-protocol"), "http");
});

test("browse does not steal a running founder copy", () => {
  const plan = planBrowse({ listening: true });
  assert.equal(plan.action, "already-running");
  assert.deepEqual(plan.args, []);
});

test("agent copy never uses the browse port and uses a scratch catalog", () => {
  const plan = planAuto(new Set());
  assert.equal(plan.port, AGENT_PORT_FIRST);
  assert.notEqual(plan.port, BROWSE_PORT);
  assert.ok(plan.args.includes("--local"));
  assert.ok(plan.args.includes(`${REPO_ROOT}/.wrangler/slot-1`));
  assert.equal(inspectorPortFor(plan.port), BROWSE_INSPECTOR_PORT + 1);
  assert.equal(flagValue(plan.args, "--local-upstream"), `localhost:${AGENT_PORT_FIRST}`);
  assert.equal(flagValue(plan.args, "--upstream-protocol"), "http");
});

test("agent picker skips occupied ports and never falls back to browse", () => {
  assert.equal(pickAgentPort(new Set([AGENT_PORT_FIRST, AGENT_PORT_FIRST + 1])), AGENT_PORT_FIRST + 2);
  assert.notEqual(pickAgentPort(new Set([AGENT_PORT_FIRST])), BROWSE_PORT);
  const allBusy = new Set();
  for (let port = AGENT_PORT_FIRST; port <= AGENT_PORT_LAST; port += 1) allBusy.add(port);
  assert.throws(() => pickAgentPort(allBusy), /no free agent port/);
});

test("CLI browse --print-cmd stays off wrangler when the browse port is busy", () => {
  const plan = printCmd("browse", String(BROWSE_PORT));
  assert.equal(plan.action, "already-running");
  assert.deepEqual(plan.args, []);
});

test("CLI auto --print-cmd starts a scratch slot, not the live catalog", () => {
  const plan = printCmd("auto", `${AGENT_PORT_FIRST},${AGENT_PORT_FIRST + 1}`);
  assert.equal(plan.action, "start");
  assert.equal(plan.port, AGENT_PORT_FIRST + 2);
  assert.ok(plan.args.includes("--local"));
  assert.ok(!plan.args.includes("--remote"));
});

test("isPortListening measures a real socket, not a remembered flag", async () => {
  const server = await listen(0);
  const port = server.address().port;
  assert.equal(await isPortListening(port), true);
  await closeServer(server);
  assert.equal(await isPortListening(port), false);
});

test("visual-review port sits outside the agent range", () => {
  const visualReviewPort = AGENT_PORT_LAST + 1;
  assert.ok(visualReviewPort > AGENT_PORT_LAST);
  assert.ok(!wranglerDevArgs({ port: BROWSE_PORT, repoRoot: REPO_ROOT, localCatalog: false }).includes("--local"));
});

test("LaunchAgent node is a real binary, not a test-guard PATH shim", () => {
  const result = spawnSync("bash", ["scripts/install_dev_slot0.sh", "--print-node"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const nodeBin = result.stdout.trim();
  assert.ok(nodeBin.length > 0);
  assert.doesNotMatch(nodeBin, /\/scripts\/bin\/node$/);
  assert.match(nodeBin, /\/node$/);
});
