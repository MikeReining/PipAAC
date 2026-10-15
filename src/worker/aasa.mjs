/**
 * apple-app-site-association for app.pipaac.org (phase 044 universal links).
 *
 * Apple fetches /.well-known/apple-app-site-association over HTTPS with no
 * redirect and wants application/json. The file has no extension, so the
 * static-assets layer would serve octet-stream; the Worker answers it
 * instead (the assets layer only sees real files, and none exists here).
 *
 *  - applinks: only the emailed sign-in link, `/?signin=<token>`
 *    (accounts.js builds `<origin>/?signin=<token>`). Every other URL on
 *    the host keeps opening in Safari. The supporter invite link
 *    (`/?invite=<token>`) is deliberately NOT claimed: the app has no
 *    invitee landing flow yet, and the web has one that works.
 *  - webcredentials: the same app id the marketing site's file carries
 *    (site/public/.well-known/apple-app-site-association), so passkeys
 *    associate from either host.
 */
export const APP_ID = "LP5YNK7A36.org.pipaac";

export const AASA = {
  applinks: {
    details: [{
      appIDs: [APP_ID],
      components: [{
        "/": "/",
        "?": { signin: "?*" },
        comment: "The emailed sign-in link opens in the app.",
      }],
    }],
  },
  webcredentials: { apps: [APP_ID] },
};

export const AASA_PATHS = new Set([
  "/.well-known/apple-app-site-association",
  "/apple-app-site-association",
]);

export function aasaResponse(request) {
  const headers = { "content-type": "application/json", "cache-control": "public, max-age=3600" };
  if (request.method === "HEAD") return new Response(null, { status: 200, headers });
  return new Response(JSON.stringify(AASA), { status: 200, headers });
}
