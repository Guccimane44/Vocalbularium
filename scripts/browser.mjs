import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { root } from './doctor.mjs';
import {
  fixtureEnvironment,
  resourceDirectory,
  validateMutableTree,
} from './isolation.mjs';

export async function launchProfile(run) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = join(root, '.artifacts/browsers');
  const { chromium } = await import(
    pathToFileURL(join(root, 'apps/web/node_modules/playwright/index.mjs')).href
  );
  const lock = join(run.dir, '.browser.lock'),
    token = randomUUID();
  writeFileSync(lock, token, { flag: 'wx', mode: 0o600 });
  const release = () => {
    try {
      if (readFileSync(lock, 'utf8') === token) rmSync(lock);
    } catch {
      /* Already removed during teardown. */
    }
  };
  try {
    resourceDirectory(run.dir, 'browser');
    validateMutableTree(join(run.dir, 'browser'));
    const extension = join(run.snapshot, 'apps/chrome');
    const context = await chromium.launchPersistentContext(
      join(run.dir, 'browser'),
      {
        executablePath: join(root, 'scripts/chromium-sandbox.sh'),
        channel: 'chromium',
        headless: true,
        env: {
          ...fixtureEnvironment(run.dir),
          VOCAB_CHROMIUM_EXECUTABLE: chromium.executablePath(),
          VOCAB_NETWORK_POLICY: join(root, 'scripts/loopback.sb'),
        },
        args: [
          `--disable-extensions-except=${extension}`,
          `--load-extension=${extension}`,
        ],
      },
    );
    context.once('close', release);
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      return ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
        url.protocol === 'chrome-extension:'
        ? route.continue()
        : route.abort('blockedbyclient');
    });
    return context;
  } catch (error) {
    release();
    throw error;
  }
}
