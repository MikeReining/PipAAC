/**
 * ?unlock — the founder's one-tap link for testing a licensed user, and
 * early supporters' way in before payments land (015).
 *
 *   /?unlock=<PIP_UNLOCK_TOKEN>   any host: the worker mints this user's
 *                                 license (mint-only token)
 *   /?unlock                      localhost only: the dev-only endpoint
 *                                 mints it, so preview needs no token
 *
 * The license then activates exactly like a pasted key (devices-ui
 * activateLicense: relay first, device copy second). The param is
 * stripped at once so a token doesn't linger in the address bar.
 */
const LOOPBACK = ["localhost", "127.0.0.1", "[::1]"];

export function unlockFromUrl({ me, activateLicense, toast }) {
  const params = new URLSearchParams(location.search);
  if (!params.has("unlock")) return;
  const token = params.get("unlock");
  params.delete("unlock");
  const qs = params.toString();
  history.replaceState(null, "", location.pathname + (qs ? `?${qs}` : ""));
  const [path, body] = !token && LOOPBACK.includes(location.hostname)
    ? ["/api/v1/voice/dev-license", { user_id: me.id }]
    : ["/api/v1/voice/unlock", { user_id: me.id, token }];
  fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => (r.ok ? r.json() : null))
    .then(async (d) => {
      if (!d?.license) { toast("That unlock link didn't work."); return; }
      await activateLicense(d.license, { quiet: true });
      toast(`Pip Lifetime is on for ${me.name || "this person"}.`);
    })
    .catch((e) => {
      console.warn("unlock failed", e);
      toast("Couldn't reach Pip to unlock — try again online.");
    });
}
