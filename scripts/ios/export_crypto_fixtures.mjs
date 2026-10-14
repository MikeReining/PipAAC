#!/usr/bin/env node
/**
 * A0-S2 crypto fixtures (phase 044 § 6): envelopes produced by the web's
 * sync_crypto.mjs under fixed test keys, for Swift (CryptoKit) to open.
 *
 *   node scripts/ios/export_crypto_fixtures.mjs          write node.json
 *   node scripts/ios/export_crypto_fixtures.mjs --check  open the committed
 *                                                        file with the JS; exit 1 on failure
 *
 * Keys are fixed (crypto_verify.mjs FIXED); IVs, ECDSA signatures,
 * ephemeral ECDH keys and generated account keys are random in WebCrypto,
 * so the produced envelope IS the fixture. --check therefore verifies the
 * committed file still opens with the current sync_crypto.mjs rather than
 * regenerating bytes. Swift writes its own swift.json in the same schema.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  deriveEpochKey, exportPublicKey, genAccountKeys, memoryKeyStore,
  putUserKey, retiredRootsName, sealAccountPriv, sealBlob, sealData, sealEpochBundle,
  sealOp, signPayload, sha256Hex, userRootName, wrapUserKey,
} from "../../public/shared/sync_crypto.mjs";
import {
  FIXED, b64u, dhPubRaw, importAesRaw, importSignPriv, importSignPub, verifyDoc,
} from "./crypto_verify.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(repoRoot, "apps/PipAAC/PipAACTests/Fixtures/crypto/node.json");
const subtle = globalThis.crypto.subtle;
const te = new TextEncoder();
const rawOf = async (k) => new Uint8Array(await subtle.exportKey("raw", k));

async function build() {
  const key = await importAesRaw(FIXED.aes);
  const keyB = b64u(FIXED.aes);
  const cases = {};

  cases.deriveEpochKey = [];
  for (const [root, epoch] of [[FIXED.root, 1], [FIXED.root, 7], [FIXED.root2, 1]]) {
    cases.deriveEpochKey.push({
      root: b64u(root), epoch, key: b64u(await rawOf(await deriveEpochKey(root, epoch))),
    });
  }

  cases.sealData = [];
  for (const plain of [new Uint8Array(0), te.encode("hello pip"), new Uint8Array(300).map((_, i) => i)]) {
    cases.sealData.push({ key: keyB, plain: b64u(plain), env: await sealData(key, plain) });
  }

  /* sealOp deflates when the JSON utf8 is over 4096 bytes (DEFLATE_OVER). */
  const small = { t: "place", id: "op_1", name: "café ☕ \u{1F600}", n: [1, 2.5, null, true] };
  const edge = { pad: "x".repeat(4096 - '{"pad":""}'.length) }; // exactly 4096: not deflated
  const big = { rows: Array.from({ length: 400 }, (_, i) => ({ i, label: `word ${i}`, ok: i % 2 === 0 })) };
  cases.sealOp = [];
  for (const op of [small, edge, big]) {
    const opJson = JSON.stringify(op);
    cases.sealOp.push({
      key: keyB, opJson, compressed: te.encode(opJson).length > 4096,
      env: await sealOp(key, op),
    });
  }

  cases.sealBlob = [];
  for (const [plain, epoch] of [[te.encode("blob bytes"), 1], [new Uint8Array(1000).map((_, i) => i * 7), 3]]) {
    cases.sealBlob.push({ key: keyB, plain: b64u(plain), epoch, sealed: await sealBlob(key, plain, epoch) });
  }

  cases.sha256Hex = [];
  for (const bytes of [new Uint8Array(0), te.encode("abc"), new Uint8Array(500).map((_, i) => i)]) {
    cases.sha256Hex.push({ bytes: b64u(bytes), hex: await sha256Hex(bytes) });
  }

  const signPriv = await importSignPriv(FIXED.signD);
  const signPub = await importSignPub(FIXED.signD);
  const spki = await exportPublicKey(signPub);
  const msg = te.encode("sign me ✓");
  const sig = await signPayload(signPriv, msg);
  const strSig = await signPayload(signPriv, "a string payload"); // JS utf8-encodes strings
  cases.signPayload = [
    { pub: spki, payload: b64u(msg), sig, valid: true },
    { pub: spki, payload: b64u(te.encode("a string payload")), sig: strSig, valid: true },
    { pub: spki, payload: b64u(te.encode("sign me")), sig, valid: false },
  ];
  cases.exportPublicKey = [{ d: b64u(FIXED.signD), spki }];
  cases.exportDhPublic = [{ d: b64u(FIXED.dhD), raw: b64u(dhPubRaw(FIXED.dhD)) }];

  const dhPub = b64u(dhPubRaw(FIXED.dhD));
  cases.wrapUserKey = [];
  for (const raw of [FIXED.aes, FIXED.aes2]) {
    cases.wrapUserKey.push({
      recipientD: b64u(FIXED.dhD), recipientPub: dhPub, userKey: b64u(raw),
      grant: await wrapUserKey(await importAesRaw(raw), dhPub),
    });
  }

  /* Bundle: outgoing root FIXED.root holds epochs 1..3 (epoch 2 is a stored
   * grant that differs from the derived key — a stored key wins), sealed
   * to the new root FIXED.root2. */
  const store = memoryKeyStore();
  await store.put(userRootName("u1"), FIXED.root);
  await putUserKey(store, "u1", await importAesRaw(FIXED.aes2), 2);
  await store.put(retiredRootsName("u1"), "[]");
  const json = await sealEpochBundle(store, "u1", FIXED.root2, 3);
  const keys = {
    1: b64u(await rawOf(await deriveEpochKey(FIXED.root, 1))),
    2: b64u(FIXED.aes2),
    3: b64u(await rawOf(await deriveEpochKey(FIXED.root, 3))),
  };
  cases.epochBundle = [{ root: b64u(FIXED.root2), keys, json }];

  const acct = await genAccountKeys();
  cases.accountPriv = [{
    prf: b64u(FIXED.prf), pub: acct.pub, priv: b64u(acct.priv),
    sealed: await sealAccountPriv(acct.priv, FIXED.prf),
  }];

  return {
    version: 1, writer: "node",
    keys: {
      aes: b64u(FIXED.aes), aes2: b64u(FIXED.aes2), root: b64u(FIXED.root), root2: b64u(FIXED.root2),
      signD: b64u(FIXED.signD), dhD: b64u(FIXED.dhD), prf: b64u(FIXED.prf),
    },
    cases,
  };
}

if (process.argv.includes("--check")) {
  let doc;
  try { doc = JSON.parse(readFileSync(OUT, "utf8")); }
  catch { console.error("crypto fixtures missing — run npm run ios:crypto-fixtures"); process.exit(1); }
  try {
    const counts = await verifyDoc(doc);
    console.log("crypto fixtures OK", JSON.stringify(counts));
  } catch (e) {
    console.error(`crypto fixtures fail: ${e.message}`);
    process.exit(1);
  }
} else {
  const doc = await build();
  await verifyDoc(doc); // never commit what the JS itself cannot open
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(doc, null, 1) + "\n");
  console.log(`wrote ${OUT}`);
}
