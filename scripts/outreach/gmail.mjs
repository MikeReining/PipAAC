// Gmail API drafts for outreach, signed in as the founder's own Google login.
// Exists because the claude.ai Gmail connector rewrites every link into a
// google.com/url redirect (anthropics/claude-code#94247). A plain RFC 822
// message sent through the API keeps links verbatim.
//
// One-time setup: docs/strategy/SLP_Outreach_System.md § Gmail API setup.
// Client key: GMAIL_CLIENT_ID/SECRET in the repo .env. Token: ~/.pipaac-outreach/.

import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const SCOPE = 'https://www.googleapis.com/auth/gmail.compose';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

export function gmail({ dir, sender, fromName }) {
  const CLIENT = join(dir, 'client.json');
  const TOKEN = join(dir, 'token.json');

  // Repo .env (GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET), else a downloaded client.json.
  const client = () => {
    const env = new URL('../../.env', import.meta.url);
    if (!process.env.GMAIL_CLIENT_ID && existsSync(env)) process.loadEnvFile(env);
    const { GMAIL_CLIENT_ID: client_id, GMAIL_CLIENT_SECRET: client_secret } = process.env;
    if (client_id && client_secret) return { client_id, client_secret };
    if (!existsSync(CLIENT)) throw new Error(`no GMAIL_CLIENT_ID in .env or ${CLIENT}; see § Gmail API setup`);
    const j = JSON.parse(readFileSync(CLIENT, 'utf8'));
    return j.installed || j.web || j;
  };

  async function tokenRequest(params) {
    const { client_id, client_secret } = client();
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: new URLSearchParams({ client_id, client_secret, ...params }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(`token: ${j.error} ${j.error_description || ''}`);
    return j;
  }

  async function accessToken() {
    if (!existsSync(TOKEN)) throw new Error('not signed in; run draft.mjs --auth');
    const t = JSON.parse(readFileSync(TOKEN, 'utf8'));
    if (t.access_token && t.expires_at > Date.now() + 60_000) return t.access_token;
    const j = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh_token });
    const next = { ...t, access_token: j.access_token, expires_at: Date.now() + j.expires_in * 1000 };
    writeFileSync(TOKEN, JSON.stringify(next), { mode: 0o600 });
    return next.access_token;
  }

  async function call(path, init = {}) {
    const res = await fetch(API + path, {
      ...init,
      headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json' },
    });
    if (res.status === 204) return null;
    const j = await res.json();
    if (!res.ok) throw new Error(`gmail ${path}: ${j.error?.message || res.status}`);
    return j;
  }

  // Browser sign-in with a loopback redirect + PKCE; stores the refresh token.
  async function auth() {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const server = createServer();
    await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
    const redirect = `http://127.0.0.1:${server.address().port}`;
    const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
      client_id: client().client_id, redirect_uri: redirect, response_type: 'code', scope: SCOPE,
      code_challenge: challenge, code_challenge_method: 'S256',
      access_type: 'offline', prompt: 'consent', login_hint: sender,
    });
    const code = await new Promise((ok, fail) => {
      server.on('request', (req, res) => {
        const q = new URL(req.url, redirect).searchParams;
        res.end(q.get('code') ? 'Signed in. You can close this tab.' : `Sign-in failed: ${q.get('error')}`);
        server.close();
        q.get('code') ? ok(q.get('code')) : fail(new Error(q.get('error') || 'no code'));
      });
      execFileSync('open', [url]);
      console.log(`If no browser opened, visit:\n${url}`);
    });
    const j = await tokenRequest({
      grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirect,
    });
    writeFileSync(TOKEN, JSON.stringify({
      refresh_token: j.refresh_token, access_token: j.access_token,
      expires_at: Date.now() + j.expires_in * 1000,
    }), { mode: 0o600 });
    const who = await profile();
    if (who !== sender.toLowerCase()) {
      rmSync(TOKEN);
      throw new Error(`signed in as ${who}, not ${sender}; token discarded`);
    }
    return who;
  }

  const profile = async () => (await call('/profile')).emailAddress.toLowerCase();

  const header = (s) => (/^[\x20-\x7e]*$/.test(s)
    ? s : `=?UTF-8?B?${Buffer.from(s).toString('base64')}?=`);

  // Plain text only: no HTML part for anything to rewrite.
  function mime({ to, subject, body }) {
    const b64 = Buffer.from(body.replace(/\r?\n/g, '\r\n')).toString('base64').replace(/.{76}/g, '$&\r\n');
    return [
      `From: ${header(fromName)} <${sender}>`, `To: ${to}`, `Subject: ${header(subject)}`,
      'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64', '', b64,
    ].join('\r\n');
  }

  // Read the stored draft back from Gmail; the API response is the instrument,
  // not what we sent.
  async function verify(draftId, { body }) {
    const d = await call(`/drafts/${draftId}?format=full`);
    const texts = [];
    const walk = (p) => {
      if (p.body?.data) texts.push(Buffer.from(p.body.data, 'base64url').toString('utf8'));
      (p.parts || []).forEach(walk);
    };
    walk(d.message.payload);
    const from = d.message.payload.headers.find((h) => h.name.toLowerCase() === 'from')?.value || '';
    const stored = texts.join('\n');
    const problems = [];
    if (!from.toLowerCase().includes(sender.toLowerCase())) problems.push(`From is "${from}"`);
    if (/google\.com\/url\?/.test(stored)) problems.push('a link was rewritten to google.com/url');
    for (const link of body.match(/https?:\/\/\S+/g) || []) {
      if (!stored.includes(link)) problems.push(`link missing verbatim: ${link}`);
    }
    return { messageId: d.message.id, from, problems };
  }

  async function createDraft(msg) {
    const who = await profile();
    if (who !== sender.toLowerCase()) throw new Error(`token is for ${who}, not ${sender}`);
    const raw = Buffer.from(mime(msg)).toString('base64url');
    const d = await call('/drafts', { method: 'POST', body: JSON.stringify({ message: { raw } }) });
    const check = await verify(d.id, msg);
    if (check.problems.length) {
      await call(`/drafts/${d.id}`, { method: 'DELETE' });
      throw new Error(`draft failed checks and was deleted: ${check.problems.join('; ')}`);
    }
    return { draftId: d.id, ...check };
  }

  return { auth, createDraft };
}
