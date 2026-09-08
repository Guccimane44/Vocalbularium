import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { root } from './doctor.mjs';
import { fixtureEnvironment, resourceDirectory } from './isolation.mjs';

const install = resourceDirectory(root, '.artifacts/browser-install');
const browsers = resourceDirectory(root, '.artifacts/browsers');
const result = spawnSync(
  process.execPath,
  [
    join(root, 'apps/web/node_modules/playwright/cli.js'),
    'install',
    'chromium',
    '--no-shell',
  ],
  {
    cwd: root,
    stdio: 'inherit',
    env: { ...fixtureEnvironment(install), PLAYWRIGHT_BROWSERS_PATH: browsers },
  },
);
process.exitCode = result.error || result.signal ? 1 : (result.status ?? 1);
