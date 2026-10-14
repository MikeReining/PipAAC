import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { findMissingPlatformLabels } from "./check_platform_label.mjs";

function tmpPhases(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phases-"));
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body);
  return dir;
}

test("phases below 045 are exempt", () => {
  assert.deepEqual(findMissingPlatformLabels(tmpPhases({ "044_x.md": "# x\n" })), []);
});

test("045+ without a label fails; with a label passes", () => {
  const dir = tmpPhases({
    "045_bad.md": "# bad\n",
    "046_ok.md": "# ok\n\n**Platforms:** web\n",
    "README.md": "# r\n",
  });
  assert.deepEqual(findMissingPlatformLabels(dir), ["045_bad.md"]);
});

test("label beyond line 15 does not count", () => {
  const body = "# t\n" + "\n".repeat(20) + "**Platforms:** web\n";
  assert.deepEqual(findMissingPlatformLabels(tmpPhases({ "047_late.md": body })), ["047_late.md"]);
});
