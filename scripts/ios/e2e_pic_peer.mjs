/**
 * 044 E6b: the node peer's side of the `pictures` E2E scenario
 * (scripts/ios/e2e_sync.sh). Seams are handed over by e2e_web_peer.mjs, like
 * e2e_spot_peer.mjs / e2e_team_peer.mjs.
 *
 * A picture CHOSEN on one side reaches the other. The finder's answers are
 * canned by the proxy (e2e_canned_pictures.mjs; no paid API), so the bytes of
 * each pick are known here without asking the iPad. FLOW:
 *   host -> peer-expect-pictures.json {ipadSha, webSha, ipadSense, webSense}
 *   host picks webSense's picture the way the web card does (bytes up by
 *        hash, then setImageOverride) -> peer-picked.json
 *   ui   -> ui-picked   the iPad chose its picture for ipadSense (Find -> tap)
 *   host reads ITS OWN image_override row and pulls the blob from the relay
 *        by hash, opens it (hash checked) -> peer-verified-ipad-picture.json
 *   ui   -> ui-done
 */
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function makePicPeer({ root, shared, put, waitFor, sleep, log, sc, syncUploadBlob, syncHealth }) {
  async function picturesFlow(db, client, userKey, dumpTo) {
    const canned = await import(pathToFileURL(join(root, "scripts/ios/e2e_canned_pictures.mjs")).href);
    const images = await import(pathToFileURL(join(shared, "images.mjs")).href);
    const ipadSha = canned.sha256Hex(canned.cannedPng(canned.IPAD_PICK));
    const webBytes = new Uint8Array(canned.cannedPng(canned.WEB_PICK));
    const webSha = canned.sha256Hex(webBytes);
    const ipadSense = "sns_0013", webSense = "sns_0014";
    put("peer-expect-pictures.json", JSON.stringify({ ipadSha, webSha, ipadSense, webSense }));

    globalThis.__peerBlobs.set(webSha, webBytes);
    await syncUploadBlob(webBytes);
    for (let i = 0; i < 200 && syncHealth().mediaPending; i++) await sleep(100);
    if (syncHealth().mediaPending) throw new Error("peer picture never uploaded");
    images.setImageOverride(db, { senseId: webSense, photoKey: `blob:${webSha}` });
    put("peer-picked.json", JSON.stringify({ sense: webSense, sha: webSha }));
    log("picked", webSense, webSha.slice(0, 12));

    await waitFor("ui-picked", 240000);
    const t0 = Date.now();
    const rowFor = () => db.prepare(
      "SELECT photo_key FROM image_override WHERE sense_id = ? AND status = 'ready'").all(ipadSense)[0];
    while (rowFor()?.photo_key !== `blob:${ipadSha}`) {
      if (Date.now() - t0 > 90000) throw new Error(`the iPad's picture op never arrived (row: ${JSON.stringify(rowFor())})`);
      await sleep(200);
    }
    let bytes = null;
    for (;;) {
      try {
        const env = await client.getBlob(ipadSha);
        bytes = await sc.openBlob(userKey, { sha: ipadSha, env }); // throws on a hash mismatch
        break;
      } catch (e) {
        if (Date.now() - t0 > 90000) throw new Error(`the iPad's picture never reached the relay: ${e.message}`);
        await sleep(500);
      }
    }
    const got = canned.sha256Hex(Buffer.from(bytes));
    put("peer-verified-ipad-picture.json", JSON.stringify({
      sense: ipadSense, rowKey: rowFor().photo_key, sha: ipadSha, hashMatches: got === ipadSha,
      bytesAreTheCannedPicture: Buffer.from(bytes).equals(canned.cannedPng(canned.IPAD_PICK)), bytes: bytes.length }));
    log("verified the iPad's picture", ipadSha.slice(0, 12));
    await waitFor("ui-done");
    await sleep(1500);
    dumpTo(db, "peer.dump");
    put("host-done", Date.now());
    process.exit(0);
  }
  return { picturesFlow };
}
