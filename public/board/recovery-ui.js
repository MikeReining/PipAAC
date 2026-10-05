/**
 * QR card. The last-resort credential: a device that holds the recovery
 * root can show it, and a fresh device can restore from it.
 */
import {
  deriveEpochKey, exportDhPublic, exportPublicKey, getDeviceIdentity,
  getUserKey, openEpochBundle, openKeyStore, putUserKey, retireRoot,
  sealEpochBundle, userRootName, wrapUserKey,
} from "../shared/sync_crypto.mjs";
import {
  cardLink, keyToWords, recoverFromText, recoveryProof, ROOT_BYTES, wordsFromHash,
} from "../shared/recovery.mjs";
import { RECOVERY_WORDS } from "../shared/recovery_words.mjs";
import { restoreByProof } from "../shared/sync_client.mjs";
import { addUser, putUser } from "../shared/users.mjs";

const $ = (id) => document.getElementById(id);

export function mountRecovery({
  me, saveUser, userStore, flushDb, toast, qrcode, userClient,
  ensureUser = async () => { throw new Error("no relay"); },
  // Replace-card rotates the epoch — the running sync client must start
  // sealing under the new key, not find out from the next inbound op.
  syncRekey = async () => null,
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

  /** The card as one PNG: QR plus the 12 words for devices without a camera. */
  async function cardPngBlob(payload, words) {
    const q = qrcode(0, "M");
    q.addData(payload);
    q.make();
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = q.createDataURL(8, 4);
    });
    const W = 640, H = 640 + 224;
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
    ctx.font = "24px ui-monospace, monospace";
    ctx.textAlign = "left";
    words.forEach((w, i) => {
      ctx.fillText(`${i + 1} ${w}`, 70 + (i % 3) * 190, 690 + Math.floor(i / 3) * 36);
    });
    return new Promise((res) => c.toBlob(res, "image/png"));
  }

  /** 015 slice 3: the QR card — scan it on a fresh device to restore. */
  async function showCard() {
    // Asking for the card turns on the encrypted backup it restores
    // from (founder 2026-09-28): the relay holds only sealed data the
    // card alone can open, so there is nothing to ask permission for.
    if (!me.sync?.userId) {
      try {
        await ensureUser({ quiet: true });
      } catch { /* the board may exist on the relay even if the first sync failed */ }
      if (!me.sync?.userId) {
        openRec("Recovery card");
        recBody.innerHTML =
          '<p class="hint">Connect to the internet to make the card. Pip keeps an encrypted copy that only the card can open.</p>';
        return;
      }
    }
    const cfg = me.sync;
    const root = await openKeyStore().get(userRootName(me.id));
    if (!root) {
      openRec("Recovery card");
      recBody.innerHTML =
        '<p class="hint">This device was linked by another device and cannot show the card — '
        + "print it on the device that set up sync.</p>";
      return;
    }
    const rootBytes = root instanceof Uint8Array ? root : new Uint8Array(root);
    const payload = await cardLink(relayBase, rootBytes, RECOVERY_WORDS);
    const words = (await keyToWords(rootBytes, RECOVERY_WORDS)).split(" ");
    openRec("Recovery card");
    // Settings' checklist and Backup warning read this: the card has
    // been on screen on this device at least once (registry, device-local).
    if (!me.cardShownAt) saveUser({ cardShownAt: Date.now() }).catch(() => {});
    const qr = document.createElement("div");
    qr.className = "pair-qr";
    const q = qrcode(0, "M");
    q.addData(payload);
    q.make();
    qr.innerHTML = q.createSvgTag({ cellSize: 3, margin: 8, scalable: true });
    const code = document.createElement("ol");
    code.className = "rec-code";
    for (const w of words) code.append(Object.assign(document.createElement("li"), { textContent: w }));
    const warn = document.createElement("p");
    warn.className = "hint";
    warn.textContent = "Anyone with this link can open your user.";
    const btn = (label, onclick) => Object.assign(document.createElement("button"),
      { className: "btn secondary", textContent: label, onclick });
    const emailBody = `Open this link on the device you want Pip on:\n\n${payload}\n`;
    const mail = btn("Email", async () => {
      // Phones: the share sheet lists Gmail and every other mail app.
      if (matchMedia("(pointer: coarse)").matches && navigator.share) {
        await navigator.share({ title: "Pip recovery link", text: emailBody }).catch(() => {});
        return;
      }
      const q = new URLSearchParams({ view: "cm", fs: "1", su: "Pip recovery link",
        body: emailBody }).toString().replaceAll("+", "%20");
      window.open(`https://mail.google.com/mail/?${q}`, "_blank", "noopener");
    });
    const copy = btn("Copy link", async () => {
      await navigator.clipboard.writeText(payload).catch(() => {});
      toast("Link copied");
    });
    const more = document.createElement("details");
    more.innerHTML = "<summary>More…</summary>";
    const moreRow = document.createElement("div");
    moreRow.className = "row";
    moreRow.append(
      btn("Save image", async () => {
        const blob = await cardPngBlob(payload, words);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "pip-qr-card.png";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      }),
      btn("Replace card…", async () => {
        if (!confirm("Replace this card? Every link and print so far stops working.")) return;
        await replaceCard();
      }),
    );
    more.append(moreRow);
    const actions = document.createElement("div");
    actions.className = "row";
    actions.append(mail, copy);
    recBody.append(qr, code, actions, more, warn);
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
    const newRoot = crypto.getRandomValues(new Uint8Array(ROOT_BYTES));
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
    await syncRekey(epoch);
    await showCard();
  }

  /** Shared restore: root → relay restore → registry → reload. */
  async function doRestore(root, status) {
    const store = openKeyStore();
    const identity = await getDeviceIdentity(store);
    const r = await restoreByProof(relayBase, {
      proof: await recoveryProof(root),
      device_id: identity.deviceId,
      pubkey: await exportPublicKey(identity.verify),
      dh_pub: await exportDhPublic(identity.dh.publicKey),
    });
    const userId = r.user_id;
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
    // Restored from the card: this person has it in hand, so Backup and
    // the Protect card don't ask for one.
    const restored = await addUser(userStore, {
      id: userId,
      sync: { userId, epoch: r.epoch, cursor: 0 },
    });
    await putUser(userStore, { ...restored, cardShownAt: Date.now() });
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
      if (b.rawValue?.includes("#restore=")) return b.rawValue;
    }
    return null;
  }

  /** Fresh device: scan the QR card, pick a photo of it, or paste its code. */
  function restoreFlow(prefill = "") {
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
          status.textContent = "That doesn't look like a recovery link — paste the "
            + "link or the 12 words.";
          return;
        }
        await doRestore(found.root, status);
      } catch (e) {
        recGo.hidden = false;
        status.textContent = /checksum|word/i.test(e.message)
          ? e.message
          : "That card doesn't open a user — make a fresh card on a linked "
            + "device.";
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
              .find((b) => b.rawValue?.includes("#restore="));
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
      ? "No camera? Paste the link or the 12 words. "
      : "Paste the link or the 12 words. ")
      + "On a free user, restoring moves the user here — the other "
      + "devices are unlinked.";
    const ta = document.createElement("textarea");
    ta.id = "rec-paste";
    ta.placeholder = "recovery link, or the 12 words";
    ta.value = prefill;
    recBody.append(hint, ta, status);
    recGo.hidden = false;
    recGo.textContent = "Restore";
    recGo.onclick = () => {
      if (!ta.value.trim()) return;
      run(ta.value);
    };
  }

  $("dev-sheet").onclick = () => showCard().catch((e) => {
    openRec("Recovery card");
    recBody.innerHTML = `<p class="hint">Could not build the card: ${e.message}</p>`;
  });
  $("dev-restore").onclick = () => restoreFlow();

  // A tapped recovery link lands here with the words in the hash: open
  // Restore with them filled in. Restoring can move the user off other
  // devices, so the adult still presses Restore.
  const linked = wordsFromHash(location.hash);
  if (linked) {
    history.replaceState(null, "", location.pathname + location.search);
    restoreFlow(linked.replaceAll("-", " "));
    // On a new device the welcome is up; the link's whole point is to
    // skip it, so Restore sits above it — at the body's level, since #app
    // is its own stacking context under the welcome.
    document.body.append($("recform"));
    $("recform").classList.add("over-welcome");
  }

  return { showCard };
}
