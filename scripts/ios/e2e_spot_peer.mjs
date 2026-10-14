/**
 * 044 D5: the node peer's side of the `spotlight` / `spotlight-supporter` E2E scenarios
 * (scripts/ios/e2e_sync.sh). Seams are handed over by e2e_web_peer.mjs, like e2e_team_peer.mjs.
 */
export function makeSpotPeer({ put, has, waitFor, sleep, log, spotMod, syncSendModel, syncSendLive, liveInbox }) {
/* --- 044 D5: live modeling and the Spotlight glow. The iPad is the CHILD's board; this peer is the
 * adult's desktop. Everything the peer does goes through the web's own writers (startSession/endSession
 * record the ops; syncSendModel is the live message), and everything it CLAIMS about the iPad it reads
 * from its own database or from the relay's live frames - never from the iPad's screen. FLOW:
 *   host -> peer-session.json {startedAt,targets}   a session started here (not a supporter's device)
 *   ui -> ui-saw-glow            glow + dim on screen; the UI relaunches the app
 *   ui -> ui-saw-resume          still glowing after the restart
 *   host -> peer-modeled.json    a modeled word (re-sent every 1.2 s until the child has tapped)
 *   ui -> ui-saw-modeled, ui-tapped   the child taps modeled / glowing / dimmed words
 *   host: the three taps ARRIVED here as sealed live frames carrying this session's start
 *   ui -> ui-ended-chip          the child's End chip; host sees the row gone
 *   host -> peer-supporter-session.json   a session started on a supporter's device
 *   ui -> ui-saw-plain           the child's board stays plain, but a modeled word still lights
 *   host ends it; ui -> ui-done
 */
const sessionRow = (db) => db.prepare("SELECT started_at, targets, by_supporter FROM spotlight_session WHERE id = 1").all()[0] ?? null;
async function untilRow(db, pred, what, ms = 60000) {
  const t0 = Date.now();
  while (!pred(sessionRow(db))) {
    if (Date.now() - t0 > ms) throw new Error(`timed out: ${what}`);
    await sleep(100);
  }
}
async function settleOps(db) {
  for (let i = 0; i < 100 && db.prepare("SELECT COUNT(*) c FROM sync_op WHERE relay_seq IS NULL").all()[0].c; i++) await sleep(100);
}
async function spotlightFlow(db, dumpTo) {
  const targets = ["sense:sns_0013", "sense:sns_0014"];
  spotMod.startSession(db, { name: "Mealtime", targets, by_supporter: 0 });
  const startedAt = sessionRow(db).started_at;
  await settleOps(db);
  put("peer-session.json", JSON.stringify({ startedAt, targets, name: "Mealtime" }));
  log("started the session", startedAt);
  await waitFor("ui-saw-glow", 240000);
  await waitFor("ui-saw-resume", 240000);

  // A helper's tap lights a word. The iPad may be mid-reconnect: send again until it has seen it.
  const modeled = "sense:sns_0015";
  for (let i = 0; !has("ui-tapped"); i++) {
    const sent = await syncSendModel(modeled, "word");
    if (i === 0) put("peer-modeled.json", JSON.stringify({ key: modeled, sent }));
    await sleep(1200);
    if (i > 100) throw new Error("the iPad never showed the modeled word");
  }
  // The child's taps ride the relay back: sealed, never stored, carrying THIS session's start.
  const want = ["sense:sns_0015", "sense:sns_0013", "sense:sns_0016"];
  const t0 = Date.now();
  while (liveInbox.filter((m) => m.k === "tap").length < want.length) {
    if (Date.now() - t0 > 60000) throw new Error(`child taps never arrived: ${JSON.stringify(liveInbox)}`);
    await sleep(100);
  }
  const taps = liveInbox.filter((m) => m.k === "tap");
  const ok = JSON.stringify(taps.map((m) => m.t)) === JSON.stringify(want) && taps.every((m) => m.s === startedAt);
  put("peer-saw-taps.json", JSON.stringify({ ok, taps }));
  log("child taps via the relay", JSON.stringify(taps), ok ? "OK" : "MISMATCH");
  if (!ok) throw new Error("the child's taps did not match what the iPad tapped");

  // The End chip on the iPad ends the session for everyone (a synced spot_end op).
  await waitFor("ui-ended-chip", 240000);
  await untilRow(db, (r) => r === null, "the iPad's End reached this peer");
  put("peer-saw-end", Date.now());
  log("saw the iPad end the session");

  // A session started on a SUPPORTER's device leaves the child's board plain until a word is modeled.
  spotMod.startSession(db, { name: "Coach", targets, by_supporter: 1 });
  await settleOps(db);
  put("peer-supporter-session.json", JSON.stringify({ name: "Coach" }));
  for (let i = 0; !has("ui-saw-plain"); i++) {
    if (i > 0) await syncSendModel("sense:sns_0016", "more");
    await sleep(1200);
    if (i > 100) throw new Error("the iPad never confirmed the plain board");
  }
  spotMod.endSession(db);
  await settleOps(db);
  put("peer-ended", Date.now());
  await waitFor("ui-done", 240000);
  await sleep(1500);
  dumpTo(db, "peer.dump");
  put("host-done", Date.now());
  process.exit(0);
}

/* --- the iPad as a SUPPORTER's device (role partner): its taps are models, the tip shows, the
 * child's presses (sent here as the child's board would) are counted. FLOW:
 *   host -> peer-session.json {startedAt}   session started on a supporter's device
 *   ui -> ui-modeled (it tapped sns_0013)
 *   host: the model frame ARRIVED (relay), opened here -> peer-saw-model.json
 *   host -> peer-child-taps.json            two child presses + one from another session
 *   ui -> ui-saw-count, ui-done */
async function spotlightSupporterFlow(db, dumpTo) {
  const targets = ["sense:sns_0013"];
  spotMod.startSession(db, { name: "Coach", targets, by_supporter: 1 });
  const startedAt = sessionRow(db).started_at;
  await settleOps(db);
  put("peer-session.json", JSON.stringify({ startedAt, targets }));
  await waitFor("ui-modeled", 240000);
  const t0 = Date.now();
  while (!liveInbox.some((m) => m.k === "model")) {
    if (Date.now() - t0 > 60000) throw new Error("the supporter's model frame never arrived");
    await sleep(100);
  }
  const models = liveInbox.filter((m) => m.k === "model");
  put("peer-saw-model.json", JSON.stringify(models));
  log("supporter's tap via the relay", JSON.stringify(models));
  // The child's board (this peer) presses: two in this session, one from another.
  for (let i = 0; !has("ui-saw-count"); i++) {
    if (i === 0) {
      await syncSendLive({ k: "tap", t: "sense:sns_0013", s: startedAt });
      await syncSendLive({ k: "tap", t: "sense:sns_0013", s: startedAt });
      await syncSendLive({ k: "tap", t: "sense:sns_0014", s: startedAt - 5 });
      put("peer-child-taps.json", "2");
    }
    await sleep(1000);
    if (i > 120) throw new Error("the iPad never showed the count");
  }
  await waitFor("ui-done", 240000);
  await sleep(1500);
  dumpTo(db, "peer.dump");
  put("host-done", Date.now());
  process.exit(0);
}

  return { spotlightFlow, spotlightSupporterFlow };
}
