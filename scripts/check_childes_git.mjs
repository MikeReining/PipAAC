// Guard for 017 R11: CHILDES transcript text must never land in git.
// Fails if (a) the local cache dir is not gitignored, (b) any file under it
// is tracked or staged, or (c) any tracked file contains raw-transcript
// speaker markers (the CHI/MOT/… role tags used by the corpus format).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const fail = (msg) => { console.error(`childes-git-guard: ${msg}`); process.exit(1); };

try {
  git(['check-ignore', 'data/prediction/childes/x']);
} catch {
  fail('data/prediction/childes/ is not gitignored');
}

const inside = git(['ls-files', '--', 'data/prediction/childes']);
if (inside) fail(`tracked files under the cache: ${inside}`);

const staged = git(['diff', '--cached', '--name-only']);
if (staged.split('\n').some((p) => p.startsWith('data/prediction/childes/')))
  fail('staged files under the cache');

const MARKER = new RegExp(`<(${['CHI', 'MOT', 'FAT', 'GMO', 'GRM', 'INV', 'SST'].join('|')})>`);
for (const p of git(['ls-files']).split('\n').filter(Boolean)) {
  if (p.endsWith('.png') || p.endsWith('.parquet') || p.endsWith('.zip')) continue;
  let text;
  try { text = readFileSync(path.join(root, p), 'utf8'); } catch { continue; }
  if (MARKER.test(text)) fail(`transcript speaker marker in tracked file: ${p}`);
}

console.log('childes-git-guard: clean');
