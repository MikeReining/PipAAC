/** Resumable card replacement. The journal is durable before the relay
 * changes credentials; it leaves only after local keys, registry and the
 * active sealing client have caught up. No root travels to the relay. */
import {
  deriveEpochKey, getDeviceIdentity, putUserKey, retireRoot, sealEpochBundle,
  unwrapUserKey, userRootName, wrapUserKey,
} from "./sync_crypto.mjs";
import { recoveryProof, ROOT_BYTES } from "./recovery.mjs";
import { STALL_MS, withDeadline } from "./bounded.mjs";

export const rotationJournalName = (id) => `rotation/${id}`;
const locks = new Map();
function locked(id, fn) {
  const run = withDeadline((locks.get(id) ?? Promise.resolve()).then(() =>
    globalThis.navigator?.locks?.request
      ? navigator.locks.request(`pip-rotation:${id}`, fn) : fn()),
    STALL_MS, `rotation lock ${id}`);
  const tail = run.catch(() => {});
  locks.set(id, tail);
  tail.then(() => { if (locks.get(id) === tail) locks.delete(id); });
  return run;
}
const bytes = (root) => root instanceof Uint8Array ? root : new Uint8Array(root);
export const rootRecoveryId = async (root) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256",
    new TextEncoder().encode(await recoveryProof(bytes(root)))))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");

/** A stale card holder must not derive a future key from a retired root. */
export async function currentRecoveryRoot(store, id, client) {
  const root = await store.get(userRootName(id));
  if (!root) return null;
  const self = await client.selfKey();
  if (self.recovery_id && self.recovery_id !== await rootRecoveryId(root)) {
    throw new Error("The recovery card changed on another device. Use its current card.");
  }
  return bytes(root);
}

async function importGrants(store, id, client) {
  const self = await client.selfKey();
  const identity = await getDeviceIdentity(store);
  for (const [epoch, grant] of Object.entries(self.wrapped_keys ?? {})) {
    await putUserKey(store, id, await unwrapUserKey(identity.dh.privateKey,
      typeof grant === "string" ? JSON.parse(grant) : grant), Number(epoch));
  }
  return self;
}

async function prepare(store, user, client, newRoot) {
  const oldRoot = await currentRecoveryRoot(store, user.id, client);
  if (!oldRoot) throw new Error("Make the card on the device that set up backup.");
  // Import actual historical keys before sealing the bundle. Local UI epoch
  // may lag the relay, including rotations under a previously replaced card.
  await importGrants(store, user.id, client);
  const { current_epoch, devices } = await client.listDevices();
  if (!Number.isSafeInteger(current_epoch)) throw new Error("Relay did not return its key epoch.");
  const oldEpoch = current_epoch;
  const epoch = oldEpoch + 1;
  const key = await deriveEpochKey(newRoot, epoch);
  const wrapped = {};
  for (const d of devices) {
    if (d.dh_pub) wrapped[d.device_id] = await wrapUserKey(key, d.dh_pub);
  }
  return { oldRoot, newRoot, oldEpoch, epoch, wrapped,
    expected_proof: await recoveryProof(oldRoot), proof: await recoveryProof(newRoot),
    bundle: await sealEpochBundle(store, user.id, newRoot, oldEpoch) };
}

async function resume({ store, user, client, saveUser, rekey }) {
  const name = rotationJournalName(user.id);
  const job = await store.get(name);
  if (!job) return null;
  try {
    await client.replaceRecovery(job.proof, job.bundle, {
      expected_proof: job.expected_proof, epoch: job.epoch, wrapped: job.wrapped,
    });
  } catch (err) {
    // A competing removal rotation won before this replacement committed.
    // Re-stage the SAME new root at the relay's current epoch; never overwrite
    // a committed replacement or manufacture another card on retry.
    if (["bad_epoch", "devices_changed"].includes(err.message)) {
      await store.put(name, await prepare(store, user, client, job.newRoot));
    }
    throw err;
  }
  await retireRoot(store, user.id, bytes(job.oldRoot), job.oldEpoch);
  await store.put(userRootName(user.id), bytes(job.newRoot));
  await putUserKey(store, user.id, await deriveEpochKey(bytes(job.newRoot), job.epoch), job.epoch);
  const self = await importGrants(store, user.id, client);
  const epoch = Math.max(job.epoch, self.current_epoch ?? job.epoch);
  await saveUser({ sync: { ...user.sync, epoch } });
  await rekey(epoch);
  await store.del(name);
  return epoch;
}

export const resumeRecoveryCard = (args) => locked(args.user.id, () => resume(args));
export const replaceRecoveryCard = (args) => locked(args.user.id, async () => {
  const name = rotationJournalName(args.user.id);
  if (!(await args.store.get(name))) {
    const root = crypto.getRandomValues(new Uint8Array(ROOT_BYTES));
    await args.store.put(name, await prepare(args.store, args.user, args.client, root));
  }
  return resume(args);
});

/** Removal itself records a relay obligation. Root holders complete it;
 * an interrupted owner catches up through grants and retries on recovery. */
export async function completeRemovalRotation({ store, user, client, saveUser, rekey }) {
  return locked(user.id, async () => {
    if (!(await store.get(userRootName(user.id)))) return null;
    const self = await client.selfKey();
    const need = Number(self.rotate_min_epoch ?? 0);
    if (!need || need <= self.current_epoch) return null;
    const root = await currentRecoveryRoot(store, user.id, client);
    const { devices, current_epoch } = await client.listDevices();
    if (!Number.isSafeInteger(current_epoch)) throw new Error("Relay did not return its key epoch.");
    const epoch = Math.max(need, current_epoch + 1);
    const key = await deriveEpochKey(root, epoch);
    const wrapped = {};
    for (const d of devices) {
      if (d.dh_pub) wrapped[d.device_id] = await wrapUserKey(key, d.dh_pub);
    }
    await client.rotateKeys(epoch, wrapped, { expected_proof: await recoveryProof(root) });
    await putUserKey(store, user.id, key, epoch);
    await saveUser({ sync: { ...user.sync, epoch } });
    await rekey(epoch);
    return epoch;
  });
}
