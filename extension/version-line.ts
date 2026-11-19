// The version and commit this extension was built from, shown at the foot of
// the homepage and the login page (0.16.7), so the owner can always tell which
// build is running. The account menu says when the API's commit differs (builds.js).
import { BUILD } from './config.js';
import { t } from './i18n.ts';

export function versionLine(): string {
  if (BUILD.version === 'unknown') return '';
  const commit = /^[0-9a-f]{40}$/.test(BUILD.commit) ? BUILD.commit.slice(0, 7) : BUILD.commit;
  return t(BUILD.dirty ? 'app.versionChanged' : 'app.version', { version: BUILD.version, commit });
}
