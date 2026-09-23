/**
 * QR card. The last-resort credential: a device that holds the recovery
 * root can show it, and a fresh device can restore from it.
 */
import {
  deriveEpochKey, exportDhPublic, exportPublicKey, getDeviceIdentity,
  getUserKey, openEpochBundle, openKeyStore, putUserKey, retireRoot,
  sealEpochBundle, userRootName, wrapUserKey,
} from "../shared/sync_crypto.mjs";
import { cardPayload, recoverFromText, recoveryProof } from "../shared/recovery.mjs";
import { RECOVERY_WORDS } from "../shared/recovery_words.mjs";
import { restoreDevice } from "../shared/sync_client.mjs";
import { addUser } from "../shared/users.mjs";

const $ = (id) => document.getElementById(id);

export function mountRecovery({
  me, saveUser, userStore, flushDb, toast, qrcode, userClient,
}) {
  const relayBase = location.origin;
  /* ------------------------------------------------------------------ *
   * QR card (§ 9) — the last-resort credential: a QR + short code
   * carrying the recovery root. Only a device holding the root can show
   * it — the device that set up sync, or one restored from a card. A
   * merely-paired device cannot re-derive the root, so removing it stays
   * a real removal.
   * ------------------------------------------------------------------ */

  const recOverlay = $("recform");
  const recBody = $("rec-body");
  const recGo = $("rec-go");
  const recPrint = $("rec-print");

  function openRec(title) {
    $("rec-title").textContent = title;
    recBody.innerHTML = "";
    recGo.hidden = true;
    recPrint.hidden = true;
    recOverlay.classList.add("open");
  }
  recOverlay.addEventListener("click", (e) => {
    if (e.target === recOverlay || e.target.closest("[data-close]")) {
      recOverlay.classList.remove("open");
    }
  });

  /** The card as one PNG: QR plus the short code for devices without a camera. */
  async function cardPngBlob(payload, userId) {
    const q = qrcode(0, "M");
    q.addData(payload);
    q.make();
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = q.createDataURL(8, 4);
    });
    const W = 640, H = 640 + 128;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fffdf4";
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(img, (W - img.width) / 2, 24);
    ctx.fillStyle = "#21313f";
    ctx.font = "600 26px " + getComputedStyle(document.body).fontFamily;
    ctx.textAlign = "center";
    ctx.fillText("Pip QR card", W / 2, 640);
    ctx.font = "20px ui-monospace, monospace";
    ctx.fillText(`${userId.slice(0, 8)}… ${payload.split(":").pop()}`, W / 2, 672);
    return new Promise((res) => c.toBlob(res, "image/png"));
  }

  /** 015 slice 3: the QR card — scan it on a fresh device to restore. */
  async function showCard() {
    const cfg = me.sync;
    if (!cfg?.userId) {
      openRec("QR card");
      recBody.innerHTML =
        '<p class="hint">Link this user first — the card backs up a synced user.</p>';
      return;
    }
    const root = await openKeyStore().get(userRootName(me.id));
    if (!root) {
      openRec("QR card");
      recBody.innerHTML =
        '<p class="hint">This device was linked by another device and cannot show the card — '
        + "print it on the device that set up sync.</p>";
      return;
    }
    const rootBytes = root instanceof Uint8Array ? root : new Uint8Array(root);
    const payload = cardPayload(cfg.userId, rootBytes);
    openRec("QR card");
    const qr = document.createElement("div");
    qr.className = "pair-qr";
    const q = qrcode(0, "M");
    q.addData(payload);
    q.make();
    qr.innerHTML = q.createSvgTag({ cellSize: 3, margin: 8, scalable: true });
    const code = document.createElement("p");
    code.className = "rec-code";
    code.textContent = payload.split(":").pop().replace(/(.{4})/g, "$1 ").trim();
    const warn = document.createElement("p");
    warn.className = "hint";
    warn.textContent = "Anyone holding this card can restore the whole user — keep it "
      + "private. What the child says is not on it: speech history never leaves a device.";
    const actions = document.createElement("div");
    actions.className = "row";
    const save = document.createElement("button");
    save.className = "btn secondary";
    save.textContent = "Save image";
    save.onclick = async () => {
      const blob = await cardPngBlob(payload, cfg.userId);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "pip-qr-card.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    };
    const share = document.createElement("button");
    share.className = "btn secondary";
    share.textContent = "Share…";
    share.onclick = async () => {
      const blob = await cardPngBlob(payload, cfg.userId);
      const file = new File([blob], "pip-qr-card.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Pip QR card" }).catch(() => {});
      } else {
        await navigator.clipboard.writeText(payload);
        toast("Copied — send it to yourself and print it");
      }
    };
    const replace = document.createElement("button");
    replace.className = "btn secondary";
    replace.textContent = "Replace card…";
    replace.onclick = async () => {
      if (!confirm("Replace this QR card? Every card printed so far stops working — "
        + "print the new one.")) return;
      await replaceCard();
    };
    actions.append(save, share, replace);
    recBody.append(qr, code, actions, warn);
    recPrint.hidden = false;
    recPrint.onclick = () => window.print();
  }

  /** Replace card: new root, old proof dies at the relay, new epoch keys go to
      the remaining devices. Old epochs stay readable: stored keys where a
      device holds them, and the sealed bundle for any future card restore. */
  async function replaceCard() {
    const { client } = await userClient();
    const store = openKeyStore();
    const oldRoot = await store.get(userRootName(me.id));
    const oldEpoch = me.sync?.epoch ?? 1;
    const newRoot = crypto.getRandomValues(new Uint8Array(32));
    // Seal the old era's keys to the new root BEFORE swapping roots — the
    // bundle is what a new-card restore opens the whole backlog with.
    const bundle = await sealEpochBundle(store, me.id, newRoot, oldEpoch);
    await client.replaceRecovery(await recoveryProof(newRoot), bundle);
    if (oldRoot) {
      await retireRoot(store, me.id,
        oldRoot instanceof Uint8Array ? oldRoot : new Uint8Array(oldRoot), oldEpoch);
    }
    await store.put(userRootName(me.id), newRoot);
    const epoch = oldEpoch + 1;
    const key = await deriveEpochKey(newRoot, epoch);
    await putUserKey(store, me.id, key, epoch);
    const { devices } = await client.listDevices();
    const wrapped = {};
    for (const d of devices) {
      if (d.dh_pub) wrapped[d.device_id] = await wrapUserKey(key, d.dh_pub);
    }
    await client.rotateKeys(epoch, wrapped);
    await saveUser({ sync: { ...me.sync, epoch } });
    await showCard();
  }

  /** Shared restore: { userId, root } → relay restore → registry → reload. */
  async function doRestore(userId, root, status) {
    const store = openKeyStore();
    const identity = await getDeviceIdentity(store);
    const r = await restoreDevice(relayBase, userId, {
      proof: await recoveryProof(root),
      device_id: identity.deviceId,
      pubkey: await exportPublicKey(identity.verify),
      dh_pub: await exportDhPublic(identity.dh.publicKey),
    });
    await store.put(userRootName(userId), root);
    if (r.recovery_bundle) {
      try {
        // Card replaced at least once — the bundle carries the keys for
        // the eras sealed under retired roots.
        for (const [e, k] of Object.entries(await openEpochBundle(root, r.recovery_bundle))) {
          await putUserKey(store, userId, k, Number(e));
        }
      } catch { /* a bundle this root can't open stays ignored */ }
    }
    await getUserKey(store, userId, r.epoch);
    const restored = await addUser(userStore, {
      id: userId,
      sync: { userId, epoch: r.epoch, cursor: 0 },
    });
    if (r.moved) sessionStorage.setItem("pip_restore_moved", "1");
    status.textContent = "Restoring the user…";
    sessionStorage.setItem("pip_active_user", restored.id);
    await flushDb();
    location.reload();
  }

  /** Decode one image into card text via BarcodeDetector; null when unreadable. */
  async function scanBitmap(bitmap) {
    const det = new BarcodeDetector({ formats: ["qr_code"] });
    for (const b of await det.detect(bitmap)) {
      if (b.rawValue?.startsWith("pip:recover:")) return b.rawValue;
    }
    return null;
  }

  /** Fresh device: scan the QR card, pick a photo of it, or paste its code. */
  function restoreFlow() {
    if (me.sync?.userId) {
      openRec("Restore a user");
      recBody.innerHTML =
        '<p class="hint">This device is already linked to a user.</p>';
      return;
    }
    openRec("Restore a user");
    const canScan = typeof BarcodeDetector === "function";
    const status = document.createElement("p");
    status.className = "hint";
    const run = async (text) => {
      recGo.hidden = true;
      status.textContent = "Checking the card…";
      try {
        const found = await recoverFromText(text, RECOVERY_WORDS);
        if (!found) {
          recGo.hidden = false;
          status.textContent = "That doesn't look like a QR card — paste the code "
            + "under the square, or an old sheet's words.";
          return;
        }
        await doRestore(found.userId, found.root, status);
      } catch (e) {
        recGo.hidden = false;
        status.textContent = /checksum|word/i.test(e.message)
          ? e.message
          : "That card doesn't open this user — print a fresh card on a linked "
            + "device, or use its code.";
      }
    };
    if (canScan) {
      const row = document.createElement("div");
      row.className = "row";
      const scanBtn = document.createElement("button");
      scanBtn.className = "btn";
      scanBtn.textContent = "Scan the card";
      scanBtn.onclick = async () => {
        row.hidden = true;
        status.textContent = "Point the camera at the card…";
        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" },
          });
          const video = document.createElement("video");
          video.muted = true;
          video.className = "rec-video";
          video.srcObject = stream;
          recBody.prepend(video);
          await video.play();
          const det = new BarcodeDetector({ formats: ["qr_code"] });
          for (;;) {
            const found = (await det.detect(video))
              .find((b) => b.rawValue?.startsWith("pip:recover:"));
            if (found) { video.remove(); await run(found.rawValue); break; }
            await new Promise((r) => setTimeout(r, 300));
          }
        } catch (e) {
          row.hidden = false;
          status.textContent = "Could not open the camera — pick a photo of the "
            + "card or paste its code.";
        } finally {
          stream?.getTracks().forEach((t) => t.stop());
        }
      };
      const photo = document.createElement("input");
      photo.type = "file";
      photo.accept = "image/*";
      photo.hidden = true;
      photo.onchange = async () => {
        if (!photo.files?.[0]) return;
        status.textContent = "Reading the photo…";
        try {
          const text = await scanBitmap(await createImageBitmap(photo.files[0]));
          if (text) await run(text);
          else status.textContent = "No QR card found in that photo.";
        } catch {
          status.textContent = "Could not read that photo — paste the card's code.";
        }
      };
      const pick = document.createElement("button");
      pick.className = "btn secondary";
      pick.textContent = "Choose a photo";
      pick.onclick = () => photo.click();
      row.append(scanBtn, pick, photo);
      recBody.append(row);
    }
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = (canScan
      ? "No camera? Paste the code printed under the square. "
      : "Paste the code printed under the card's square. ")
      + "On a free user, restoring moves the user here — the other "
      + "devices are unlinked.";
    const ta = document.createElement("textarea");
    ta.id = "rec-paste";
    ta.placeholder = "card code, or an old sheet's user id + 24 words";
    recBody.append(hint, ta, status);
    recGo.hidden = false;
    recGo.textContent = "Restore";
    recGo.onclick = () => {
      if (!ta.value.trim()) return;
      run(ta.value);
    };
  }

  $("dev-sheet").onclick = () => showCard().catch((e) => {
    openRec("QR card");
    recBody.innerHTML = `<p class="hint">Could not build the card: ${e.message}</p>`;
  });
  $("dev-restore").onclick = () => restoreFlow();

  return { showCard };
}
