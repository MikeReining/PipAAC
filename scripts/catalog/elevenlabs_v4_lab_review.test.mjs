import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";

import {
  loadReviewDoc,
  reviewStatusForSlug,
  setReviewStatus,
} from "./elevenlabs_v4_lab_review.mjs";
import { V4_LAB_BATCH } from "./elevenlabs_v4_lab.mjs";

test("setReviewStatus approve and reject", () => {
  const root = mkdtempSync(join(tmpdir(), "pip-v4-review-"));
  const batchDir = join(root, V4_LAB_BATCH);
  mkdirSync(batchDir, { recursive: true });
  try {
    setReviewStatus("an", "approved", root);
    let doc = loadReviewDoc(root);
    assert.equal(reviewStatusForSlug("an", doc), "approved");
    setReviewStatus("cars", "rejected", root);
    doc = loadReviewDoc(root);
    assert.equal(reviewStatusForSlug("cars", doc), "rejected");
    assert.equal(reviewStatusForSlug("missing", doc), "pending");
    setReviewStatus("an", "pending", root);
    doc = loadReviewDoc(root);
    assert.equal(reviewStatusForSlug("an", doc), "pending");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
