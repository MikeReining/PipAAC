#!/usr/bin/env node
// Saves one outreach email as a Gmail draft in the founder's mailbox (Gmail
// API, verified by reading it back), then logs it. The founder reads, edits
// and presses Send; nothing is sent from here.
// Procedure and voice: docs/strategy/SLP_Outreach_System.md § Fast lane.
//
//   node scripts/outreach/draft.mjs --to a@b.com --subject "..." --source URL < body.txt
//   ... --force --replace <draftId>                  (new version; old draft deleted after the new one verifies)
//   node scripts/outreach/draft.mjs --check a@b.com     (exit 1 if already contacted)
//   node scripts/outreach/draft.mjs --list
//   node scripts/outreach/draft.mjs --auth              (one-time Google sign-in)
//
// The log is private contact data, kept outside the repo.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { gmail } from './gmail.mjs';

const SENDER = process.env.OUTREACH_SENDER || 'mike@pipaac.org';
const DIR = join(homedir(), '.pipaac-outreach');
const LOG = join(DIR, 'log.jsonl');
const mail = gmail({ dir: DIR, sender: SENDER, fromName: process.env.OUTREACH_FROM_NAME || 'Mike Reining' });

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1] ?? true;
};

const readLog = () => (existsSync(LOG)
  ? readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  : []);
const domainOf = (email) => email.split('@')[1]?.toLowerCase();

// Same address, or same organization domain (one contact per org).
function priorContact(email) {
  const d = domainOf(email);
  return readLog().find((r) => r.to.toLowerCase() === email.toLowerCase() || domainOf(r.to) === d);
}

if (flag('auth')) {
  mkdirSync(DIR, { recursive: true });
  console.log(`signed in as ${await mail.auth()}`);
  process.exit(0);
}

if (flag('list')) {
  for (const r of readLog()) console.log(`${r.at.slice(0, 10)}  ${r.to}  ${r.subject}`);
  process.exit(0);
}

const check = flag('check');
if (typeof check === 'string') {
  const hit = priorContact(check);
  if (hit) console.log(`already contacted: ${hit.to} on ${hit.at.slice(0, 10)} (${hit.subject})`);
  process.exit(hit ? 1 : 0);
}

const to = flag('to');
const subject = flag('subject');
const source = flag('source') || '';
const body = readFileSync(0, 'utf8').trim();
if (typeof to !== 'string' || typeof subject !== 'string' || !body) {
  console.error('need --to, --subject and a body on stdin');
  process.exit(2);
}

const hit = priorContact(to);
if (hit && !flag('force')) {
  console.error(`already contacted ${hit.to} on ${hit.at.slice(0, 10)}; pass --force to write again`);
  process.exit(1);
}

const { draftId, from } = await mail.createDraft({ to, subject, body });
const replace = flag('replace');
if (typeof replace === 'string') await mail.deleteDraft(replace);
mkdirSync(DIR, { recursive: true });
appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), to, subject, source, body, draftId }) + '\n');
console.log(`draft saved and read back: from ${from}, to ${to}, links verbatim`);
console.log(`Drafts: https://mail.google.com/mail/?authuser=${SENDER}#drafts`);
