/**
 * Live-relay pairing probe: runs a real second device through the
 * production pair/claim/grant path with the shipped crypto modules —
 * claim the code, unwrap the granted user key, fetch+decrypt the op
 * log, submit a real op, then read the tail back. Usage:
 *
 *   node scripts/probes/prod_pair_probe.mjs <PAIR_CODE> [baseUrl]
 *
 * The probe's submitted op is a set_setting on person_name — a valid
 * synced op kind — so a linked device visibly receives it.
 */
import {
  exportDhPublic, exportPublicKey, getDeviceIdentity, memoryKeyStore,
  unwrapUserKey,
} from "../../public/shared/sync_crypto.mjs";
import { pairClient, relayClient } from "../../public/shared/sync_client.mjs";

const code = process.argv[2]?.replace(/\s+/g, "");
const base = process.argv[3] ?? "https://app.pipaac.org";
if (!code) { console.error("usage: prod_pair_probe.mjs <PAIR_CODE> [baseUrl]"); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const store = memoryKeyStore();
const identity = await getDeviceIdentity(store);
const pair = pairClient(base);

await pair.claim(code, {
  device_id: identity.deviceId,
  sig_pub: await exportPublicKey(identity.verify),
  dh_pub: await exportDhPublic(identity.dh.publicKey),
  label: "node-probe",
});
console.log("claimed", code, "as", identity.deviceId.slice(0, 12));

let grant = null;
for (let i = 0; i < 90 && !grant; i++) {
  const st = await pair.status(code).catch(() => null);
  if (st?.status === "granted" && st.grant) grant = st.grant;
  else if (st?.status === "refused") throw new Error(`grant refused: ${st.refused ?? st.grant?.refused}`);
  await sleep(1000);
}
if (!grant) throw new Error("grant never landed");
const epoch = grant.epoch ?? 1;
console.log("granted: user", grant.user_id.slice(0, 12), "epoch", epoch);

const keys = new Map();
if (Array.isArray(grant.keys) && grant.keys.length) {
  for (const g of grant.keys) {
    if (Number.isInteger(g?.epoch)) keys.set(g.epoch, await unwrapUserKey(identity.dh.privateKey, g));
  }
} else {
  keys.set(epoch, await unwrapUserKey(identity.dh.privateKey, grant));
}
const userKey = keys.get(epoch) ?? [...keys.values()][0];
const client = relayClient({ userId: grant.user_id, baseUrl: base, identity, userKey });

// Fetch the whole tail — proves the wrapped key opens real history.
const { ops: envs } = await client.fetchOps(0, 500);
const plain = [];
for (const row of envs) plain.push(await client.openOp(row.env));
console.log("fetched", envs.length, "ops; newest kinds:",
  plain.slice(-5).map((o) => o.kind ?? o.op?.kind));

// Submit a real op — the linked device must apply it as incoming sync.
const op = {
  op_id: `op_probe_${Date.now()}`,
  device_id: identity.deviceId,
  kind: "set_setting",
  args: { key: "person_name", value: "ProbeB" },
  created_at: Date.now(),
};
const { ops: assigned } = await client.submit([op], epoch);
console.log("submitted, relay_seq:", assigned?.[0]?.relay_seq ?? assigned);

// Own echo must read back decrypted on a later fetch.
for (let i = 0; i < 30; i++) {
  const { ops: tail } = await client.fetchOps(envs.length, 50);
  const mine = tail.find((t) => t.relay_seq === assigned?.[0]?.relay_seq);
  if (mine) {
    const back = await client.openOp(mine.env);
    console.log("echo verified:", back.kind, JSON.stringify(back.args));
    process.exit(0);
  }
  await sleep(1000);
}
throw new Error("submitted op never came back on fetch");
