/**
 * 028 slice 5 — the reconcile's math and the vendor stats shape.
 * WT9's instrument: ledger minted chars vs the vendor counter delta.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseWindow, reconcile, vendorTotal,
} from "./tilevoice_reconcile.mjs";

const DAY = 86_400_000;

test("vendor analytics body: sums total_usage over the rows", () => {
  const body = {
    columns: ["timestamp", "total_usage", "total_minutes"],
    column_types: ["DateTime", "Int", "Float"],
    rows: [["2026-09-28 00:00:00", 40, 0.1], ["2026-09-29 00:00:00", 7, 0.02]],
  };
  assert.equal(vendorTotal(body), 47);
  assert.equal(vendorTotal({ columns: [], rows: [] }), 0);
  assert.equal(vendorTotal(null), 0);
  // Missing the metric column → 0, never NaN.
  assert.equal(vendorTotal({ columns: ["timestamp"], rows: [[1]] }), 0);
});

test("reconcile: gaps and the credits-per-char sizing input", () => {
  const r = reconcile({
    ledgerChars: 100, ledgerMints: 10, vendorChars: 115, vendorCredits: 138,
  });
  assert.equal(r.charsGap, 15);
  assert.equal(r.creditsPerChar, 1.38); // the plan multiplies by this
  assert.equal(r.creditsPerVendorChar, 1.2);
  assert.equal(r.charsPerMint, 10);
  // No ledger mints → no ratio (never divide by zero).
  const empty = reconcile({ ledgerChars: 0, ledgerMints: 0, vendorChars: 0, vendorCredits: 0 });
  assert.equal(empty.creditsPerChar, null);
  assert.equal(empty.charsGap, 0);
});

test("parseWindow: default is the current UTC day; --days spans UTC days", () => {
  const now = Date.UTC(2026, 8, 29, 15, 30); // mid-day
  const dayStart = now - (now % DAY);
  const today = parseWindow([], now);
  assert.equal(today.from, dayStart);
  assert.equal(today.to, dayStart + DAY);

  const week = parseWindow(["--days", "7"], now);
  assert.equal(week.to, dayStart + DAY);
  assert.equal(week.from, dayStart - 6 * DAY);

  // Explicit dates: --to is inclusive (next UTC midnight).
  const w = parseWindow(["--from", "2026-09-28", "--to", "2026-09-28"], now);
  assert.equal(w.from, Date.UTC(2026, 8, 28));
  assert.equal(w.to, Date.UTC(2026, 8, 29));

  assert.throws(() => parseWindow(["--from", "nope"], now), /bad date/);
});
