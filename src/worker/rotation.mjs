// Credential changes commit inside the user's relay. External proof-index
// writes follow the SQL commit and are repaired by an idempotent retry.
import { indexProof, proofIndexKey } from "./restore.js";

const response = (data, status = 200) => Response.json(data, { status });
export const recoveryId = async (relay) => {
  const proof = relay.metaGet("recovery_proof");
  return proof ? (await proofIndexKey(proof)).slice(3) : null;
};

export function requestRotation(relay) {
  const epoch = relay.epoch() + 1;
  relay.metaSet("rotate_min_epoch", String(epoch));
  return epoch;
}

export function revokeDevice(relay, target) {
  relay.ctx.storage.transactionSync(() => {
    relay.ctx.storage.sql.exec("DELETE FROM device WHERE device_id = ?", target);
    relay.ctx.storage.sql.exec("DELETE FROM device_key WHERE device_id = ?", target);
    requestRotation(relay);
  });
  relay.dropRevokedSockets();
}

export function revokeSupporter(relay, acct) {
  relay.ctx.storage.transactionSync(() => {
    const sql = relay.ctx.storage.sql;
    sql.exec("DELETE FROM supporter WHERE acct_id = ?", acct);
    sql.exec("DELETE FROM device WHERE via_acct = ?", acct);
    sql.exec("DELETE FROM device_key WHERE device_id NOT IN (SELECT device_id FROM device)");
    sql.exec("DELETE FROM join_token WHERE for_acct = ?", acct);
    requestRotation(relay);
  });
  relay.dropRevokedSockets();
}

function applyKeys(relay, epoch, wrapped) {
  const sql = relay.ctx.storage.sql;
  const allowed = relay.allowedDevices();
  for (const [dev, wk] of Object.entries(wrapped)) {
    if (!allowed.has(dev)) continue;
    const json = JSON.stringify(wk);
    sql.exec("UPDATE device SET wrapped_key = ?, epoch = ? WHERE device_id = ?", json, epoch, dev);
    sql.exec("INSERT OR REPLACE INTO device_key (device_id, epoch, wrapped_key) VALUES (?, ?, ?)", dev, epoch, json);
  }
  relay.metaSet("key_epoch", String(epoch));
  if (epoch >= Number(relay.metaGet("rotate_min_epoch") ?? 0)) {
    sql.exec("DELETE FROM meta WHERE k = 'rotate_min_epoch'");
  }
}

function coversDevices(relay, wrapped) {
  return relay.ctx.storage.sql.exec("SELECT device_id FROM device WHERE dh_pub IS NOT NULL")
    .toArray().every((d) => wrapped[d.device_id]);
}

export function rotateKeys(relay, { epoch, wrapped, expected_proof }) {
  if (expected_proof !== undefined && expected_proof !== relay.metaGet("recovery_proof")) {
    return response({ error: "recovery_conflict" }, 409);
  }
  if (!Number.isSafeInteger(epoch) || !wrapped || epoch <= relay.epoch()) {
    return response({ error: "bad_epoch" }, 409);
  }
  if (expected_proof !== undefined && !coversDevices(relay, wrapped)) {
    return response({ error: "devices_changed" }, 409);
  }
  relay.ctx.storage.transactionSync(() => applyKeys(relay, epoch, wrapped));
  return response({ ok: true, epoch });
}

export async function replaceRecovery(relay, userId, body) {
  const { recovery_proof: proof, recovery_bundle: bundle, expected_proof, epoch, wrapped } = body;
  if (!proof) return response({ error: "bad_recovery" }, 400);
  // Older clients still use the split recovery/keys contract. Keep that
  // route compatible; updated clients always send the guarded contract.
  if (expected_proof === undefined) {
    await indexProof(relay.env, userId, relay.metaGet("recovery_proof"), proof);
    relay.metaSet("recovery_proof", proof);
    if (bundle) relay.metaSet("recovery_bundle", bundle);
    return response({ ok: true });
  }
  const committed = JSON.parse(relay.metaGet("recovery_rotation") ?? "null");
  const retry = committed?.proof === proof && committed?.epoch === epoch
    && relay.metaGet("recovery_proof") === proof;
  if (!retry) {
    if (relay.metaGet("recovery_proof") !== expected_proof) {
      return response({ error: "recovery_conflict" }, 409);
    }
    if (!bundle || !wrapped || !Number.isSafeInteger(epoch) || epoch !== relay.epoch() + 1) {
      return response({ error: "bad_epoch" }, 409);
    }
    if (!coversDevices(relay, wrapped)) return response({ error: "devices_changed" }, 409);
    // No external await inside the commit: restores can never see a new
    // proof paired with an old-root current epoch.
    relay.ctx.storage.transactionSync(() => {
      relay.metaSet("recovery_proof", proof);
      relay.metaSet("recovery_bundle", bundle);
      relay.metaSet("recovery_rotation", JSON.stringify({ proof, epoch, previous: expected_proof }));
      applyKeys(relay, epoch, wrapped);
    });
  }
  await indexProof(relay.env, userId, expected_proof, proof);
  if (relay.metaGet("recovery_proof") !== proof) {
    return response({ error: "recovery_conflict" }, 409);
  }
  return response({ ok: true, epoch });
}
