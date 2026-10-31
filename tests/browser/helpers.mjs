// Shared setup for the browser journeys: launching the extension, signing in,
// and reading cards, facet windows and the module window.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { isContentType } from '@vocabularium/domain/page-modules';
import { text } from '../helpers/pages.mjs';

export const keyOf = page => text(page.components.find(component => component.moduleType === 'main-key'));
// The bank entry with all four German facets, as structured content (D09).
// A German noun (D17): its grammatical role lets Article apply.
export const BANK = { core: { kind: 'word', language: 'Englisch', key: 'bank', gramRole: 'noun', meanings: ['Ufer'] }, facets: { article: { singular: 'das Ufer', plural: 'die Ufer' },
    examples: [{ sentence: 'We sat on the bank.', translation: 'Wir saßen am Ufer.' }], synonyms: ['Böschung'], antonyms: ['Strom'] } };
export const modulesOf = page => page.components.filter(component => isContentType(component.moduleType));
export const componentArticle = (page, heading) => page.locator('article.component').filter({ has: page.getByRole('heading', { name: heading, exact: true }) });
// A card's label in its tab drags the card; clicked, it ejects the card's actions (D07).
export const cardTab = (page, heading) => componentArticle(page, heading).locator('.tab-button');
// An action ejected from its card's tab, opening the tab first when the actions are not out.
export async function cardButton(page, name) {
  const button = page.getByRole('button', { name, exact: true });
  if (await button.count()) return button;
  await cardTab(page, name.replace(/^(Edit|Retry|Generate|Fold|Unfold|Delete) /, '')).click();
  return button;
}
// A parent's facet window (D13, 0.8.1), opened by Facet among its actions; already open, it is returned as it is.
export async function facetWindow(page, label) {
  const window = page.getByRole('group', { name: `Facets of ${label}`, exact: true });
  if (await window.count()) return window;
  await cardTab(page, label).click();
  await page.getByRole('button', { name: `Facets of ${label}`, exact: true }).click();
  await window.waitFor();
  return window;
}
// Since 0.13.3 (D23) a facet on the card has its Remove and one to add its Add, in two groups;
// these read the window in the module's order, whichever group a facet stands in.
export const escaped = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const tick = (window, facet) => window.getByRole('button', { name: new RegExp(`^(Add|Remove) ${escaped(facet)}$`) });
export const inOrder = (window, read) => window.locator('.facet-window-row').evaluateAll((rows, read) => rows
  .sort((a, b) => Number(a.dataset.index) - Number(b.dataset.index))
  .map(row => read === 'name' ? row.querySelector('.facet-window-name').textContent : row.hasAttribute('data-equipped')), read);
// In deck settings a module is an empty card (0.7.1): its tab ejects Remove.
export async function removeFromDeck(page, label, nth = 0) {
  await componentArticle(page, label).nth(nth).locator('.tab-button').click();
  await page.getByRole('button', { name: `Remove ${label}`, exact: true }).click();
}
export const apiOrigin = process.env.VOCABULARIUM_API_URL ?? 'http://127.0.0.1:4318';
export async function launch(profile, extension = resolve(process.env.VOCABULARIUM_TEST_EXTENSION ?? 'artifacts/extension')) {
  const config = await readFile(join(extension, 'config.js'), 'utf8');
  assert.equal(JSON.parse(config.match(/^export const API_URL = (.+);/m)[1]), apiOrigin, 'Refuse a package pointed at a different API from the disposable fixture');
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/app.html`);
  return { context, page, id, worker };
}
// The account menu holds appearance, diagnostic logs and log out once signed in (D05);
// since 0.13.3 its trigger at the sidebar's foot names the account (D23).
export const accountTrigger = page => page.getByRole('button', { name: 'Account: admin', exact: true });
export async function accountMenu(page) {
  const trigger = accountTrigger(page);
  // From the keyboard: the capture popup can sit over the trigger in the top-right corner.
  if (await trigger.count() && await trigger.getAttribute('aria-expanded') !== 'true') await trigger.press('Enter');
}
// Appearance is a segmented control of three radios (D23); the menu stays open, so Escape closes it.
export const APPEARANCES = { system: 'System', light: 'Sage', dark: 'Moss night' };
export async function chooseAppearance(page, value) {
  await accountMenu(page);
  await page.getByRole('group', { name: 'Appearance', exact: true }).getByRole('radio', { name: APPEARANCES[value], exact: true }).check();
  if (await accountTrigger(page).count()) await page.keyboard.press('Escape');
}
export async function signIn(page) {
  await page.getByLabel('Username', { exact: true }).fill('admin');
  await page.getByLabel('Password', { exact: true }).fill('admin');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('heading', { name: 'Your decks', exact: true }).waitFor();
}
export async function waitFor(predicate, message, timeout = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out: ${message}`);
}
// Reports the step in progress, and the slowest finished ones, when a long
// browser journey fails or times out without naming where it stopped.
export function steps(t) {
  const finished = [];
  let current = { name: 'setup', started: Date.now() }, done = false;
  t.after(() => {
    if (done) return;
    const slowest = finished.toSorted((a, b) => b[1] - a[1]).slice(0, 3).map(([name, ms]) => `${name} ${ms} ms`).join(', ');
    t.diagnostic(`stopped during "${current.name}" after ${Date.now() - current.started} ms; slowest earlier steps: ${slowest || 'none'}`);
  });
  const step = name => {
    const now = Date.now();
    finished.push([current.name, now - current.started]);
    current = { name, started: now };
  };
  step.done = () => { done = true; };
  return step;
}
export async function captureFrom(browser, text) {
  return browser.worker.evaluate(async ({ text, origin }) => {
    const tabs = await chrome.tabs.query({ url: origin + '/health' });
    return globalThis.captureForTest({ menuItemId: 'capture', selectionText: text }, tabs[0]);
  }, { text, origin: apiOrigin });
}
// A page view has loaded once its header action is there (D04: no page-level Edit page).
export const pageReady = page => page.getByRole('button', { name: 'Delete page', exact: true }).waitFor();
export const windowModule = (page, type) => page.locator(`.window-module[data-type="${type}"] .window-module-body`);
// Adds a module from the window by dragging it to the end of the list, the way a pointer user does.
// Opens the module window's family group holding this module, when it is collapsed.
export async function openFamily(source) {
  await source.waitFor({ state: 'attached' });
  const group = source.locator('xpath=ancestor::details[1]');
  if (await group.count() && !await group.evaluate(node => node.open)) await group.locator('summary').click();
}
export async function addFromWindow(page, type, target = page.locator('.drop-end'), options = {}) {
  const viewport = page.viewportSize();
  if (viewport.height < 1400) await page.setViewportSize({ width: viewport.width, height: 1400 });
  await drag(page, windowModule(page, type), target, { ...options, follow: true });
}
// Pointer drags go through dnd-kit's activation distance, so move in steps.
export async function drag(page, source, target, { below = false, above = false, follow = false } = {}) {
  await openFamily(source);
  // A mouse cannot leave the viewport; the module window is sticky, so it stays in view.
  // The page may re-render once as its account refresh lands; scroll again if it did.
  await target.scrollIntoViewIfNeeded().catch(() => target.scrollIntoViewIfNeeded());
  const from = await source.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 4 });
  // Read the target once the drag is active, then aim at it in two passes in case the page scrolled.
  // Reordering corrects only for scrolling: a sortable target slides aside as the drag reaches
  // it, and following it would lead the pointer back to the dragged card's own slot. A module
  // from the window follows its target (`follow`), as the eye does when the entries make room.
  let to = await target.boundingBox();
  const scrolled = await page.evaluate(() => scrollY);
  for (let pass = 0; pass < 2; pass++) {
    if (follow && pass) { await new Promise(resolve => setTimeout(resolve, 300)); to = await target.boundingBox(); }
    const shift = follow ? 0 : scrolled - await page.evaluate(() => scrollY);
    await page.mouse.move(to.x + to.width / 2, to.y + shift + to.height * (below ? 0.8 : above ? 0.25 : 0.5), { steps: 8 });
  }
  await page.mouse.up();
  // dnd-kit swallows clicks for 50 ms after a drop so the release is not also a click.
  await new Promise(resolve => setTimeout(resolve, 100));
}
