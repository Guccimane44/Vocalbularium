// Captures the screen catalogue (0.16.0 increment A) from a disposable account:
// every screen in light and dark and in each interface language, as
// `<screen>-<theme>-<language>.png` in `--out`, with `manifest.json` listing each
// capture and the layout rules it broke. `npm run screens` runs it; it can also run
// on its own against an extension built for `--port`:
//   node --env-file-if-exists=.env.postgres tests/screens/capture.mjs --out <dir> --extension <dir> --port <port>
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { SCREENS } from './catalogue.mjs';
import { NOW, SilentSpeech, colourHome, seed } from './fixtures.mjs';

export const LANGUAGES = ['en', 'ar', 'zh-Hans', 'fr', 'ru', 'es'];
export const THEMES = ['light', 'dark'];
const PHASES = ['signed-out', 'empty', 'full'];
const VIEWPORT = { width: 1280, height: 900 };

const { values: options } = parseArgs({ options: {
  out: { type: 'string' }, extension: { type: 'string' }, port: { type: 'string' },
  only: { type: 'string' }, languages: { type: 'string' }, themes: { type: 'string' }
} });
if (!options.out || !options.extension || !options.port) throw new Error('Pass --out, --extension and --port.');
const out = resolve(options.out), extension = resolve(options.extension);
const only = options.only ? new RegExp(options.only) : null;
const languages = options.languages ? options.languages.split(',') : LANGUAGES;
const themes = options.themes ? options.themes.split(',') : THEMES;
const config = await readFile(join(extension, 'config.js'), 'utf8');
if (JSON.parse(config.match(/^export const API_URL = (.+);/m)[1]) !== `http://127.0.0.1:${options.port}`) throw new Error(`The extension in ${extension} is not built for port ${options.port}.`);
process.env.TEST_API_PORT = options.port;

// Layout rules (increment B) run on every capture when the folder has them.
const rulesFile = new URL('./rules/index.mjs', import.meta.url);
const checkLayout = await access(rulesFile).then(() => import(rulesFile.href).then(module => module.checkLayout), () => null);

const { createTestApplication, createTestDatabase } = await import('../helpers/database.mjs');
const fixture = {};
const database = await createTestDatabase(fixture, 'screens');
const application = await createTestApplication(fixture, { databaseKey: 'screens', speechProvider: new SilentSpeech() });
await application.start();
await colourHome(application.store);
const profile = await mkdtemp(join(tmpdir(), 'vocabularium-screens-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium', headless: true, viewport: VIEWPORT, deviceScaleFactor: 1, timezoneId: 'UTC', locale: 'en-US',
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--font-render-hinting=none', '--disable-lcd-text']
});
await context.clock.setFixedTime(NOW);
// Chance repeats too: every document draws the same numbers (a new deck's colour is one).
await context.addInitScript(() => {
  let state = 0x9e3779b9;
  Math.random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
});
const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
const app = `chrome-extension://${new URL(worker.url()).host}/app.html`;
const page = await context.newPage();
page.setDefaultTimeout(15000);

const started = Date.now();
const captures = [];
await mkdir(out, { recursive: true });
try {
  await page.goto(app);
  let ids = null;
  for (const phase of PHASES) {
    const screens = SCREENS.filter(screen => screen.phase === phase && (!only || only.test(screen.name)));
    if (phase === 'full') ids = await seed(application, database.databaseUrl);
    if (!screens.length) continue;
    for (const language of languages) {
      const shown = screens.filter(screen => !screen.languages || screen.languages.includes(language));
      if (!shown.length) continue;
      await chooseLanguage(language, phase);
      for (const screen of shown) await captureScreen(screen, language, ids);
    }
  }
} finally {
  await context.close();
  try { for (const resource of database.resources) await resource.close(); } finally { await database.cleanup(); }
  await rm(profile, { recursive: true, force: true });
}
const failed = captures.filter(capture => capture.error);
await writeFile(join(out, 'manifest.json'), JSON.stringify({ rules: Boolean(checkLayout), durationMs: Date.now() - started, captures }, null, 2));
console.log(`Captured ${captures.length - failed.length} of ${captures.length} screens in ${Math.round((Date.now() - started) / 1000)} s into ${out}.`);
for (const { file, error } of failed) console.error(`${file}: ${error}`);
process.exitCode = failed.length ? 1 : 0;

async function signIn() {
  await page.locator('#username').fill('admin');
  await page.locator('#password').fill('admin');
  await page.locator('section.login button.primary').click();
  await page.locator('.account-trigger').waitFor();
}
// The account's language; signed out, the sign-in form keeps the last account's language.
async function chooseLanguage(language, phase) {
  if (!await page.locator('.account-trigger').count()) { await page.goto(app); await signIn(); }
  await application.store.setLanguage(`screens-language-${language}-${phase}`, language);
  await page.goto(app);
  await page.waitForFunction(code => document.documentElement.lang === code, language);
  await page.locator('.account-trigger').waitFor();
  if (phase === 'signed-out') {
    await page.evaluate(() => chrome.runtime.sendMessage({ type: 'logout' }));
    await page.goto(app);
    await page.locator('section.login form').waitFor();
  }
}
async function captureScreen(screen, language, ids) {
  // A new document for each screen, so nothing is left open from the one before.
  await page.goto('about:blank');
  await page.setViewportSize(VIEWPORT);
  await page.goto(`${app}#${screen.route(ids ?? {})}`);
  try {
    await page.waitForFunction(code => document.documentElement.lang === code, language);
    await screen.ready(page);
    await screen.show?.(page);
    await screen.settle?.(page);
  } catch (error) {
    for (const theme of themes) captures.push({ file: `${screen.name}-${theme}-${language}.png`, screen: screen.name, theme, language, error: error.message.split('\n')[0] });
    return;
  }
  for (const theme of themes) {
    const file = `${screen.name}-${theme}-${language}.png`;
    await page.emulateMedia({ colorScheme: theme });
    await settle();
    await fit();
    // The pointer rests outside the view, so nothing shows its hover.
    await page.mouse.move(0, 0);
    await page.screenshot({ path: join(out, file), animations: 'disabled', caret: 'hide' });
    const violations = checkLayout ? await checkLayout(page, { screen: screen.name, theme, language })
      .catch(error => [{ rule: 'rules-crashed', selector: '', message: error.message }]) : [];
    captures.push({ file, screen: screen.name, theme, language, violations });
  }
}
// The view grows to the whole screen, its open sheet included, so a full-height
// sidebar or sheet is drawn as it would be on a tall window, not cut at the fold.
async function fit() {
  for (let pass = 0; pass < 3; pass++) {
    const needed = await page.evaluate(() => {
      const scrollers = [...document.querySelectorAll('dialog[open], dialog[open] *')].filter(node => /auto|scroll/.test(getComputedStyle(node).overflowY));
      return Math.max(document.documentElement.scrollHeight, innerHeight + Math.max(0, ...scrollers.map(node => node.scrollHeight - node.clientHeight)));
    });
    const height = Math.min(Math.ceil(needed), 8000);
    if (height <= page.viewportSize().height) return;
    await page.setViewportSize({ width: VIEWPORT.width, height });
    await settle();
  }
}
// Fonts loaded, images decoded, every finite animation finished, and two frames drawn.
async function settle() {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
    await Promise.all(document.getAnimations().filter(each => each.effect?.getComputedTiming().iterations !== Infinity).map(each => each.finished.catch(() => {})));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}
