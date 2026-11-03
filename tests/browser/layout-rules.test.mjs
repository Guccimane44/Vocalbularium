// Layout rules (0.16.0 increment B): each rule fails on its broken fixture and
// passes on the correct ones.
import test, { createTestApplication } from '../helpers/database.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { staged } from '../helpers/pages.mjs';
import { BANK, launch, signIn, steps } from './helpers.mjs';
import { checkLayout, measureLandmarks, RULES } from '../screens/rules/index.mjs';

const fixture = name => pathToFileURL(resolve('tests/screens/rules/fixtures', `${name}.html`)).href;
const summary = violations => violations.map(each => `${each.rule} ${each.selector}: ${each.message}`).join('\n');

test('0.16.0: each layout rule fails on its broken fixture and passes on the correct ones', { timeout: 60000 }, async (t) => {
  const browser = await chromium.launch({ channel: 'chromium', headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const check = async (name, options = {}) => {
    await page.goto(fixture(name));
    return checkLayout(page, { screen: `fixture-${name}`, theme: 'light', allowlist: [], ...options });
  };

  for (const name of ['correct', 'correct-rtl', 'correct-french']) assert.deepEqual(await check(name), [], name);
  // The keyboard's focus on a button with its ring passes.
  await page.goto(fixture('correct'));
  await page.keyboard.press('Tab');
  assert.deepEqual(await checkLayout(page, { theme: 'light', allowlist: [] }), [], 'a focused button with its ring');
  // Arabic compared with the same screen in English: every landmark mirrors.
  await page.goto(fixture('correct'));
  const english = await measureLandmarks(page);
  assert.ok(english.landmarks['deck sidebar'] && english.landmarks['card tab'], 'the English fixture shows the sidebar and a card tab');
  assert.deepEqual(await check('correct-rtl', { english }), [], 'correct-rtl against English');

  const broken = async (name, rule, selector, options) => {
    const violations = await check(name, options);
    assert.ok(violations.length > 0, `${name}: no violation`);
    assert.ok(violations.every(each => each.rule === rule), `${name}: only ${rule}\n${summary(violations)}`);
    assert.ok(violations.some(each => each.selector.includes(selector)), `${name}: names ${selector}\n${summary(violations)}`);
    return violations;
  };
  await broken('overflowing-label', RULES.overflow, 'label.broken');
  const [clipped] = await broken('clipped-button', RULES.overflow, 'button.broken');
  assert.match(clipped.message, /cut off/);
  await broken('small-target', RULES.target, 'button.broken');
  await broken('wide-element', RULES.viewport, 'div.broken');
  await broken('unmirrored-rtl', RULES.mirror, 'nav#sidebar');
  await broken('unmirrored-rtl', RULES.mirror, 'nav#sidebar', { english });
  await broken('english-in-french', RULES.english, 'h1.broken');
  const [colour] = await broken('raw-colour', RULES.colour, 'p.broken');
  assert.match(colour.message, /rgb\(255, 0, 170\)/);
  // Only the focused element's ring is checked, so the fixture is focused from the keyboard.
  assert.deepEqual(await check('no-focus-ring'), [], 'no-focus-ring, unfocused');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const focus = await checkLayout(page, { theme: 'light', allowlist: [] });
  assert.deepEqual(focus.map(each => [each.rule, each.selector]), [[RULES.focus, 'body > main > button.broken']], summary(focus));
  // In forced colours the browser's system colours are allowed.
  await page.emulateMedia({ forcedColors: 'active' });
  assert.deepEqual(await check('raw-colour'), [], 'raw-colour in forced colours');
  await page.emulateMedia({ forcedColors: 'none' });
  // An allowlisted violation is not reported.
  assert.deepEqual(await check('raw-colour', { allowlist: [{ screen: 'fixture-raw-colour', rule: RULES.colour, selector: 'body > main > p.broken', description: 'fixture' }] }), []);
});

// The real screens on main: what they break today is in the allowlist, so anything new fails.
test('0.16.0: the layout rules on the dashboard, a German page, its facet window and the account menu, in English and Arabic, light and dark', { timeout: 120000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-layout-rules-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await a.page.setViewportSize({ width: 1280, height: 1000 });
  const store = application.store;
  const session = { installationId: 'fixture', sessionId: 'layout', epoch: 1 };
  await store.openSession('layout-session', session);
  const { pageId } = await store.capture('layout-capture', { session, mainKey: 'bank', snapshot: await store.snapshot() });
  const [german] = (await store.page(pageId)).components.filter(item => item.moduleType === 'german');
  await store.stage(german.attemptId, staged(BANK));
  await store.publish('layout-publish', { attemptId: german.attemptId, session });
  await signIn(a.page);

  const { catalogNames } = await import('@vocabularium/domain/about');
  const messages = async code => ({ ...JSON.parse(await readFile(`extension/locales/${code}/messages.json`, 'utf8')), ...catalogNames(code) });
  // Each screen, opened from the start, settled before it is checked.
  // Finite animations only, and at most two seconds: a paused one never finishes.
  const settle = () => a.page.evaluate(() => Promise.race([new Promise(resolve => setTimeout(resolve, 2000)),
    Promise.all(document.getAnimations().filter(each => each.effect?.getComputedTiming().endTime !== Infinity).map(each => each.finished.catch(() => {})))]));
  const screens = {
    dashboard: async m => {
      await a.page.goto(`chrome-extension://${a.id}/app.html`);
      await a.page.getByRole('heading', { name: m['dashboard.title'], exact: true }).waitFor();
      await a.page.locator('.recent').waitFor();
    },
    'german-page': async () => {
      await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
      await a.page.locator('article.component[data-type="german"] .facet[data-facet="article"]').waitFor();
    },
    'facet-window': async m => {
      await screens['german-page'](m);
      const label = m['catalog.german.label'] ?? 'German';
      await a.page.locator('article.component[data-type="german"] .tab-button').click({ timeout: 10000 });
      await a.page.getByRole('button', { name: m['card.facetsOf'].replace('{card}', label), exact: true }).click({ timeout: 10000 });
      await a.page.locator('.facet-window-row').first().waitFor({ timeout: 10000 });
    },
    'account-menu': async m => {
      await screens.dashboard(m);
      await a.page.locator('.account-trigger').press('Enter');
      await a.page.locator('.account-panel').waitFor();
    }
  };
  const found = [];
  const english = {};
  const step = steps(t);
  for (const language of ['en', 'ar']) {
    const m = await messages(language);
    await store.setLanguage(`layout-${language}`, language);
    for (const [screen, open] of Object.entries(screens)) {
      for (const theme of ['light', 'dark']) {
        step(`${screen} ${language} ${theme}: open`);
        await open(m);
        step(`${screen} ${language} ${theme}: settle`);
        await a.page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
        await settle();
        if (language === 'en') english[screen] ??= await measureLandmarks(a.page);
        step(`${screen} ${language} ${theme}: check`);
        for (const each of await checkLayout(a.page, { screen, theme, language, english: english[screen] })) found.push({ screen, theme, language, ...each });
      }
    }
  }
  step.done();
  await store.setLanguage('layout-back', 'en');
  // The rules found what they measure, so an empty result means something.
  assert.deepEqual(Object.keys(english['german-page'].landmarks).sort(), ['card tab', 'deck sidebar', 'module window']);
  assert.ok(english['account-menu'].landmarks['account menu'], 'the account menu is measured');
  assert.deepEqual(found, [], `real screens break layout rules outside the allowlist:\n${found.map(each => `${each.screen} ${each.language} ${each.theme} ${each.rule} ${each.selector}: ${each.message}`).join('\n')}`);
});
