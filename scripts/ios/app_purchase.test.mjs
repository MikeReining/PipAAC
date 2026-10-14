/**
 * 044 F1 - the Lifetime page's render model and the shared product id, run
 * from the BUILT core (what ships). Instruments the facade cannot influence:
 * the web page's own markup (public/index.html), the .storekit file the
 * Swift tests purchase from, and the Worker's one product constant.
 * (The Worker round trip is src/worker/appstore.test.mjs; the StoreKit
 * flow is PipAACTests/PurchaseTests.swift and PipAACUITests/LifetimeUITests.)
 *
 * Run: scripts/test.sh scripts/ios/app_purchase.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

import { PIP_LIFETIME_PRODUCT_ID } from "../../src/worker/appstore_product.mjs";

const root = new URL("../../", import.meta.url).pathname;
const ctx = vm.createContext({ crypto: globalThis.crypto, __pipHost: {} });
vm.runInContext(readFileSync(join(root, "apps/PipAAC/PipAAC/Core/pip-core.js"), "utf8"), ctx);
const j = (v) => JSON.parse(JSON.stringify(v));
const P = ctx.PIPCORE.purchase;
const html = readFileSync(join(root, "public/index.html"), "utf8");
const lifetime = html.slice(html.indexOf('data-sec="lifetime"'), html.indexOf("</section>", html.indexOf('data-sec="lifetime"')));
const strip = (s) => s.replace(/<em class="life-mini[\s\S]*?<\/em>/g, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

test("one product id: the core, the Worker constant and the .storekit file agree", () => {
  assert.equal(P.PRODUCT_ID, "org.pipaac.lifetime.user");
  assert.equal(P.PRODUCT_ID, PIP_LIFETIME_PRODUCT_ID);
  const sk = JSON.parse(readFileSync(join(root, "apps/PipAAC/StoreKit/Pip.storekit"), "utf8"));
  assert.deepEqual(sk.products.map((p) => [p.productID, p.type]), [[P.PRODUCT_ID, "Consumable"]]);
});

test("what Lifetime adds and Free forever are the web page's words", () => {
  const m = j(P.model({ name: "Maya", licensed: false, endsAt: null }));
  const items = [...lifetime.matchAll(/<li><span class="life-ico">[\s\S]*?<span><b>([\s\S]*?)<\/b>([\s\S]*?)<\/span><\/li>/g)]
    .map((x) => ({ title: strip(x[1]), detail: strip(x[2]) }));
  assert.equal(items.length, 8);
  assert.deepEqual(m.features, items);
  const free = [...lifetime.slice(lifetime.indexOf("life-checks")).matchAll(/<li>([^<]+)<\/li>/g)].map((x) => x[1]);
  assert.deepEqual(m.free, free);
  assert.ok(lifetime.includes(m.lede));
  assert.ok(lifetime.includes(m.ownedSub));
  assert.ok(lifetime.includes("No subscription. Ever."));
});

test("owned vs for sale, and the countdown line, as the web renders them", () => {
  const now = 1_700_000_000_000;
  const sale = j(P.model({ name: "Maya", licensed: false, endsAt: now + 3 * 86_400_000 - 1000, now }));
  assert.equal(sale.owned, false);
  assert.equal(sale.trialLine, "Free trial · 3 days left. Everything below is on.");
  assert.equal(sale.featuresLabel, "What Lifetime adds");
  assert.equal(j(P.model({ licensed: false, endsAt: now + 1000, now })).trialLine,
    "Free trial · 1 day left. Everything below is on.");
  assert.equal(j(P.model({ licensed: false, endsAt: now - 1, now })).trialLine,
    "Free trial ended. Buy to turn it all back on.");
  const owned = j(P.model({ name: "Maya", licensed: true, endsAt: null }));
  assert.equal(owned.owned, true);
  assert.equal(owned.trialLine, null);
  assert.equal(owned.ownedTitle, "Maya has Pip Lifetime");
  assert.equal(owned.featuresLabel, "What's on");
  assert.equal(j(P.model({ licensed: true })).ownedTitle, "This person has Pip Lifetime");
});

test("no web checkout, unlock link or schools link anywhere in the app's page", () => {
  const all = JSON.stringify(j(P.model({ name: "Maya", licensed: false, endsAt: null })));
  for (const bad of ["http", "pipaac.org", "unlock link", "Copy unlock", "schools", "checkout", "Half price"]) {
    assert.ok(!all.toLowerCase().includes(bad.toLowerCase()), bad);
  }
});

test("refund and failed-payment words are the web's reconcilePlan toasts", () => {
  const dev = readFileSync(join(root, "public/board/devices-ui.js"), "utf8");
  for (const issue of ["failed", "refunded"]) {
    const text = P.issueText(issue);
    assert.ok(dev.includes(text), text);
  }
  assert.equal(P.issueText(null), null);
});
