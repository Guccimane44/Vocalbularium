// @ts-check
// The source a build or a running API came from: the app's version, the git
// commit of the checkout and whether it had uncommitted changes. The extension
// bakes its stamp in when it is built; the API takes its own when it starts
// and reports it in /health. The account menu warns when the two differ, so a
// stale extension or an API started from another branch shows at once.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));

/** @typedef {{ version: string, commit: string, dirty: boolean }} SourceStamp */

/** @type {SourceStamp | undefined} */
let cached;

/** @returns {SourceStamp} */
export function sourceStamp() {
  if (cached) return cached;
  const version = String(JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version);
  // The screens (tests/screens/run.mjs) fix the commit, so the version line and
  // the account menu do not change their captures with every commit.
  const fixed = process.env.VOCABULARIUM_SOURCE_STAMP;
  if (fixed) return (cached = { version, ...JSON.parse(fixed) });
  /** @param {string[]} args */
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  try {
    cached = { version, commit: git(['rev-parse', 'HEAD']), dirty: git(['status', '--porcelain', '--untracked-files=no']) !== '' };
  } catch {
    // Not a git checkout, for example an unpacked archive: the commit is unknown.
    cached = { version, commit: 'unknown', dirty: false };
  }
  return cached;
}
