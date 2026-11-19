// Starts Vocabularium for an agent to drive by hand, the way a user does, and
// keeps evidence of what it saw. The vocabularium-drive skill says when to use it.
//
//   npm run drive -- launch [--port 4360] [--seed empty|full] [--provider samples|unavailable] [--headed]
//   npm run drive -- doctor
//   npm run drive -- run <journey.mjs> [--name <label>]
//   npm run drive -- stop
//
// `launch` stays in the foreground until `stop` (run it in the background). It
// builds its own copy of the extension for its port, so the owner's
// artifacts/extension and their API on 4318 are left alone, and it works on a
// disposable database it drops when it stops. Evidence stays in .data/drive/evidence.
import { execFileSync } from 'node:child_process';
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { chromium } from 'playwright';
import { buildExtensionCopy } from './extension-copy.mjs';

const root = resolve('.');
const home = resolve('.data/drive');
const sessionFile = join(home, 'session.json');
const evidenceRoot = join(home, 'evidence');
const [command, ...rest] = process.argv.slice(2);
const { values: options, positionals } = parseArgs({ args: rest, allowPositionals: true, options: {
  port: { type: 'string', default: '4360' }, seed: { type: 'string', default: 'empty' },
  provider: { type: 'string', default: 'samples' }, headed: { type: 'boolean', default: false }, name: { type: 'string' }
} });

const head = () => execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const alive = (/** @type {number} */ pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const free = (/** @type {number} */ port) => new Promise(done => {
  const server = createServer().once('error', () => done(false)).once('listening', () => server.close(() => done(true)));
  server.listen(port, '127.0.0.1');
});
async function session() {
  const text = await readFile(sessionFile, 'utf8').catch(() => null);
  if (!text) throw new Error('No drive session: start one with `npm run drive -- launch`.');
  return JSON.parse(text);
}

if (command === 'launch') await launch();
else if (command === 'doctor') process.exitCode = await doctor();
else if (command === 'run') await journey(positionals[0]);
else if (command === 'stop') await stop();
else { console.error('Usage: npm run drive -- launch | doctor | run <journey.mjs> | stop'); process.exitCode = 2; }

async function launch() {
  const existing = await readFile(sessionFile, 'utf8').then(JSON.parse, () => null);
  if (existing && alive(existing.pid)) throw new Error(`A drive session already runs (process ${existing.pid}, port ${existing.port}): use it, or \`npm run drive -- stop\`.`);
  const port = Number(options.port), cdpPort = port + 1;
  for (const candidate of [port, cdpPort]) if (!await free(candidate)) throw new Error(`Port ${candidate} is taken: pass another --port. Never stop a process you did not start.`);
  if (!['empty', 'full'].includes(options.seed)) throw new Error('--seed is empty or full.');
  if (!['samples', 'unavailable'].includes(options.provider)) throw new Error('--provider is samples or unavailable.');

  const scratch = await mkdtemp(join(tmpdir(), 'vocabularium-drive-'));
  const extension = join(scratch, 'extension');
  console.log(`Building the extension for port ${port}…`);
  await buildExtensionCopy(root, port, extension);
  // The capture menu needs a selection on a web page; a journey calls the worker's handler instead.
  await appendFile(join(extension, 'background.js'), '\nglobalThis.captureForTest = handleCapture;\n');

  process.env.TEST_API_PORT = String(port);
  const { createTestApplication, createTestDatabase } = await import('../tests/helpers/database.mjs');
  const { SilentSpeech, sample, seed } = await import('../tests/screens/fixtures.mjs');
  const { isParentType } = await import('@vocabularium/domain/parents');
  // Each module answers with its catalog sample, keyed to the selection; nothing reaches a model.
  const provider = options.provider === 'unavailable' ? { generate: async () => { throw new Error('Controlled provider is unavailable.'); } }
    : { generate: async (/** @type {any} */ { module, selectedText }) => {
      if (!isParentType(module.type)) throw new Error(`No sample for ${module.type}.`);
      const card = structuredClone(await sample(module.type));
      card.core.key = selectedText.trim();
      return card;
    } };
  // The helpers keep their databases per test; a drive session is one test of its own.
  const fixture = /** @type {import('node:test').TestContext} */ (/** @type {unknown} */ ({}));
  const database = await createTestDatabase(fixture, 'drive');
  const application = await createTestApplication(fixture, { databaseKey: 'drive', provider, speechProvider: new SilentSpeech() });
  await application.start();
  if (options.seed === 'full') await seed(application, database.databaseUrl);

  const profile = join(scratch, 'profile');
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: !options.headed, viewport: { width: 1280, height: 900 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, `--remote-debugging-port=${cdpPort}`]
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const app = `chrome-extension://${new URL(worker.url()).host}/app.html`;
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto(app);
  await page.getByLabel('Username', { exact: true }).fill('admin');
  await page.getByLabel('Password', { exact: true }).fill('admin');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('heading', { name: 'Your decks', exact: true }).waitFor();

  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    console.log('Stopping: closing the browser and the API, dropping the database…');
    await context.close().catch(error => console.error(error.message));
    await application.close().catch(error => console.error(error.message));
    await database.cleanup().catch(error => console.error(error.message));
    await rm(scratch, { recursive: true, force: true });
    await rm(sessionFile, { force: true });
    console.log(`Stopped. Evidence stays in ${evidenceRoot}.`);
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  await mkdir(home, { recursive: true });
  const state = { pid: process.pid, port, cdpPort, app, commit: head(), seed: options.seed, provider: options.provider,
    database: new URL(database.databaseUrl).pathname.slice(1), databaseUrl: database.databaseUrl, startedAt: new Date().toISOString() };
  await writeFile(sessionFile, `${JSON.stringify(state, null, 2)}\n`);
  console.log(`Ready: signed in as admin at ${app}, API on http://127.0.0.1:${port}, seed ${options.seed}, provider ${options.provider}.`);
  await new Promise(() => {});
}

async function doctor() {
  const state = await session();
  /** @type {boolean[]} */
  const results = [];
  const check = (/** @type {string} */ name, /** @type {boolean} */ ok, /** @type {string} */ detail) => { results.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${detail}`); };
  check('process', alive(state.pid), `launch process ${state.pid}`);
  const health = await fetch(`http://127.0.0.1:${state.port}/health/live`).then(reply => reply.json(), () => null);
  check('API', health?.ok === true, health ? `http://127.0.0.1:${state.port} answers` : `nothing answers on ${state.port}`);
  const commit = head();
  check('build', health?.build?.commit === commit, health?.build ? `the API runs ${health.build.commit.slice(0, 7)}${health.build.dirty ? ' with uncommitted changes' : ''}; the checkout is at ${commit.slice(0, 7)}` : 'no build stamp');
  const targets = await fetch(`http://127.0.0.1:${state.cdpPort}/json/list`).then(reply => reply.json(), () => null);
  check('browser', Array.isArray(targets), targets ? `Chromium answers on ${state.cdpPort}` : `nothing answers on ${state.cdpPort}`);
  check('app page', !!targets?.some((/** @type {{ url: string }} */ target) => target.url.startsWith(state.app)), state.app);
  return results.every(Boolean) ? 0 : 1;
}

async function journey(/** @type {string | undefined} */ file) {
  if (!file) throw new Error('Name a journey file: `npm run drive -- run <journey.mjs>`.');
  const state = await session();
  const label = options.name ?? basename(file).replace(/\.m?js$/, '');
  const evidence = join(evidenceRoot, `${new Date().toISOString().replace(/[:.]/g, '-')}-${label}`);
  await mkdir(evidence, { recursive: true });
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${state.cdpPort}`);
  const context = browser.contexts()[0];
  const page = context.pages().find(candidate => candidate.url().startsWith(state.app)) ?? await context.newPage();
  if (!page.url().startsWith(state.app)) await page.goto(state.app);
  page.setDefaultTimeout(15000);
  const worker = context.serviceWorkers()[0];
  const database = new pg.Client({ connectionString: state.databaseUrl });
  await database.connect();
  let shots = 0;
  const helpers = {
    page, context, app: state.app, api: `http://127.0.0.1:${state.port}`,
    /** Saves a screenshot, numbered in the order taken, once running animations end: a card caught mid-fold misleads. */
    shot: async (/** @type {string} */ name) => {
      await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== 'running' || animation.effect?.getComputedTiming().iterations === Infinity), null, { timeout: 5000 }).catch(() => {});
      const path = join(evidence, `${String(++shots).padStart(2, '0')}-${name}.png`);
      await page.screenshot({ path });
      return path;
    },
    /** Saves a value as JSON beside the screenshots. */
    json: async (/** @type {string} */ name, /** @type {unknown} */ value) => writeFile(join(evidence, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`),
    /** Reads the disposable database: rows prove a side effect the screen only implies. */
    query: async (/** @type {string} */ sql, /** @type {unknown[]} */ values = []) => (await database.query(sql, values)).rows,
    /** Captures `text` from a web page, as the context menu does. */
    capture: async (/** @type {string} */ text) => worker.evaluate(async ({ text, origin }) => {
      const tabs = await /** @type {any} */ (chrome).tabs.query({ url: `${origin}/*` });
      return /** @type {any} */ (globalThis).captureForTest({ menuItemId: 'capture', selectionText: text }, tabs[0]);
    }, { text, origin: `http://127.0.0.1:${state.port}` }),
    /** Opens the API's own page in a tab, so a capture has a web page to come from. */
    webPage: async () => { const tab = await context.newPage(); await tab.goto(`http://127.0.0.1:${state.port}/health/live`); await page.bringToFront(); return tab; }
  };
  const record = { journey: resolve(file), commit: head(), apiCommit: state.commit, startedAt: new Date().toISOString(), ok: false, error: /** @type {string | null} */ (null) };
  try {
    const run = (await import(pathToFileURL(resolve(file)).href)).default;
    await run(helpers);
    record.ok = true;
  } catch (error) {
    record.error = /** @type {Error} */ (error).stack ?? String(error);
    await page.screenshot({ path: join(evidence, 'failure.png') }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await page.screenshot({ path: join(evidence, 'end.png') }).catch(() => {});
    await writeFile(join(evidence, 'journey.json'), `${JSON.stringify({ ...record, finishedAt: new Date().toISOString() }, null, 2)}\n`);
    await database.end();
    // Disconnects; the browser and its signed-in page stay up for the next journey.
    await browser.close();
  }
  console.log(`${record.ok ? 'Passed' : 'Failed'}: ${label}. Evidence: ${evidence}`);
  if (record.error) console.error(record.error);
}

async function stop() {
  const state = await readFile(sessionFile, 'utf8').then(JSON.parse, () => null);
  if (!state) { console.log('No drive session runs.'); return; }
  if (alive(state.pid)) {
    process.kill(state.pid, 'SIGTERM');
    for (let waited = 0; alive(state.pid); waited += 100) {
      if (waited > 30000) throw new Error(`Process ${state.pid} did not stop within 30 seconds.`);
      await new Promise(done => setTimeout(done, 100));
    }
  } else await rm(sessionFile, { force: true });
  console.log(`Stopped the drive session on port ${state.port}. Evidence stays in ${evidenceRoot}.`);
}
