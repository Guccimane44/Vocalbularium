// The page view: main key tiers, content, and the generation reveal.
import test, { createTestApplication } from '../helpers/database.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { text, useModules, wordResult, staged } from '../helpers/pages.mjs';
import { modulesOf, componentArticle, cardTab, cardButton, launch, chooseAppearance, signIn, waitFor, steps } from './helpers.mjs';

test('page view: main key tiers, Show all, rendered and plain content, quiet card status, and module window search and families', { timeout: 45000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-page-view-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  const store = application.store;
  await useModules(store, ['context', 'german', 'chinese']);
  const session = { installationId: 'fixture', sessionId: 'page-view', epoch: 1 };
  await store.openSession('page-view-session', session);
  const passage = Array.from({ length: 30 }, (_, index) => `Sentence number ${index + 1} of a long passage that keeps going.`).join(' ');
  const pages = {}, keys = {};
  for (const [name, key] of [['word', '幸福'], ['phrase', 'to bite off more than you can chew'], ['sentence', 'Sie lächelte und sagte, dass sie nie wieder an diesen Ort zurückkehren wolle.'], ['passage', passage]]) {
    const { pageId } = await store.capture(`page-view-${name}`, { session, mainKey: key, snapshot: await store.snapshot() });
    pages[name] = pageId; keys[name] = key;
    const [examples, usage] = modulesOf(await store.page(pageId));
    await store.stage(examples.attemptId, staged('Bedeutung'));
    await store.publish(`page-view-examples-${name}`, { attemptId: examples.attemptId, session });
    await store.failAttempt(usage.attemptId);
  }
  await signIn(a.page);
  const open = async name => {
    await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pages[name]}`);
    await a.page.locator('h1.main-key').filter({ hasText: keys[name] }).waitFor();
  };
  for (const name of ['word', 'phrase', 'sentence', 'passage']) {
    await open(name);
    assert.equal(await a.page.locator('h1.main-key').getAttribute('data-tier'), name);
    assert.equal(await a.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name} fits`);
  }
  // A passage shows six lines and Show all; the heading keeps the whole text.
  const title = a.page.locator('h1.main-key');
  assert.equal(await title.textContent(), passage);
  const lines = async () => title.evaluate(node => Math.round(node.clientHeight / parseFloat(getComputedStyle(node).lineHeight)));
  assert.equal(await lines(), 6);
  await a.page.getByRole('button', { name: 'Show all', exact: true }).click();
  assert.ok(await lines() > 6);
  await a.page.getByRole('button', { name: 'Show less', exact: true }).click();
  assert.equal(await lines(), 6);

  // A card draws its structured content (D09), never stored syntax; a failed card says so beside a visible Retry.
  await open('word');
  const examples = componentArticle(a.page, 'German');
  assert.equal(await examples.locator('.entry-core li').textContent(), 'Bedeutung');
  assert.equal(await examples.locator('pre').count(), 0);
  assert.equal(await examples.locator('.list-status').count(), 0, 'a completed card shows no status');
  const failed = componentArticle(a.page, 'Chinese');
  assert.equal(await failed.locator('.list-status').textContent(), 'Generation failed');
  // Actions wait inside the tab until it is clicked (D07); a failed card keeps its Retry out.
  await failed.getByRole('button', { name: 'Retry Chinese', exact: true }).waitFor();
  assert.equal(await failed.getByRole('button', { name: 'Edit Chinese', exact: true }).count(), 0, 'only Retry waits beside a failed tab');
  assert.equal(await examples.locator('.card-actions').count(), 0, 'no actions until the tab is clicked');
  // The tag is two buttons edge to edge: the six dots at its left end, the label to its right end.
  await examples.locator('.card-tab').scrollIntoViewIfNeeded();
  assert.deepEqual(await examples.locator('.card-tab').evaluate(node => {
    const box = node.getBoundingClientRect();
    return [2, box.width / 2, box.width - 2].map(x => document.elementFromPoint(box.left + x, box.top + box.height / 2)?.closest('button')?.className);
  }), ['menu-button', 'tab-button', 'tab-button']);
  await examples.hover();
  assert.equal(await examples.locator('.card-actions').count(), 0, 'hovering no longer shows actions');
  await cardTab(a.page, 'German').click();
  // A parent's Facet opens its facet window (D13, 0.8.1).
  assert.deepEqual(await examples.locator('.card-actions button').allTextContents(), ['Edit', 'Retry', 'Facet', 'About', 'Fold', 'Delete']);
  assert.equal(await cardTab(a.page, 'German').getAttribute('aria-expanded'), 'true');
  assert.equal(await examples.locator('.card-actions button').first().evaluate(node => getComputedStyle(node).animationName), 'eject', 'the actions eject from the tab');
  await a.page.mouse.click(5, 5);
  assert.equal(await examples.locator('.card-actions').count(), 0, 'a click elsewhere puts them back');
  // Fold: the card slides shut to its tab and stays folded in this browser; Unfold opens it again.
  await (await cardButton(a.page, 'Fold German')).click();
  assert.equal(await examples.getAttribute('data-folded'), 'true');
  assert.match(await examples.locator('.card-fold').evaluate(node => getComputedStyle(node).transitionProperty), /grid-template-rows/, 'folding moves smoothly');
  await waitFor(async () => (await examples.locator('.card-fold').evaluate(node => node.getBoundingClientRect().height)) < 1, 'the content folds away');
  assert.equal(await examples.locator('.card-fold-inner').evaluate(node => node.inert), true, 'folded content is out of reach');
  await a.page.reload();
  await examples.locator('.card-tab').waitFor();
  assert.equal(await examples.getAttribute('data-folded'), 'true', 'the fold is remembered');
  await (await cardButton(a.page, 'Unfold German')).click();
  await waitFor(async () => (await examples.locator('.card-fold').evaluate(node => node.getBoundingClientRect().height)) > 20, 'the content unfolds');
  assert.equal(await examples.getAttribute('data-folded'), null);
  // From the keyboard: Enter ejects them, Escape puts them back and returns to the tab.
  await cardTab(a.page, 'German').focus();
  await a.page.keyboard.press('Enter');
  await examples.getByRole('button', { name: 'Edit German', exact: true }).waitFor();
  await a.page.keyboard.press('Escape');
  assert.equal(await examples.locator('.card-actions').count(), 0);
  assert.equal(await a.page.evaluate(() => document.activeElement.className), 'tab-button');
  // The six dots open the card's menu; its entries are placeholders.
  await a.page.getByRole('button', { name: 'More for German', exact: true }).click();
  const menu = a.page.getByRole('menu', { name: 'More for German' });
  assert.deepEqual(await menu.getByRole('menuitem').evaluateAll(items => items.map(item => [item.firstChild.textContent, item.getAttribute('aria-disabled')])),
    [['Duplicate', 'true'], ['Copy text', 'true'], ['Move to page…', 'true']]);
  await a.page.keyboard.press('Escape');
  // A menu lies above the cards below it, their tabs included: Context is empty, so the next tab is right under it.
  await a.page.getByRole('button', { name: 'More for Context', exact: true }).click();
  const contextMenu = a.page.getByRole('menu', { name: 'More for Context' });
  const covered = await contextMenu.getByRole('menuitem').evaluateAll(items => items.filter(item => {
    const box = item.getBoundingClientRect();
    return !document.elementFromPoint(box.left + 8, box.top + box.height / 2)?.closest('[role="menu"]');
  }).map(item => item.firstChild.textContent));
  assert.deepEqual(covered, [], 'no menu entry is hidden under the next card');
  await a.page.keyboard.press('Escape');
  assert.equal(await contextMenu.count(), 0);
  // Retrying a card with nothing in it, such as a failed one, starts at once: no question, no dialog (0.6.3).
  const usageBefore = (await store.page(pages.word)).components.find(item => item.moduleType === 'chinese').attemptId;
  await failed.getByRole('button', { name: 'Retry Chinese', exact: true }).click();
  await waitFor(async () => (await store.page(pages.word)).components.find(item => item.moduleType === 'chinese').attemptId !== usageBefore, 'the failed card retried');
  assert.equal(await a.page.getByRole('dialog').count(), 0, 'no dialog');
  assert.equal(await a.page.locator('[data-confirm]').count(), 0, 'no question');
  for (const theme of ['light', 'dark']) {
    await chooseAppearance(a.page, theme);
    await a.page.screenshot({ path: `artifacts/v0.6.0-page-${theme}.png`, fullPage: true });
  }

  // The module window groups by family, opens the families already here, and searches.
  const window = a.page.locator('.module-window');
  // How to drag waits behind the "?" beside the window's heading: hover shows it, a click keeps it, Escape closes it.
  const help = window.getByRole('button', { name: 'How to add modules', exact: true });
  const helpText = window.getByRole('note');
  assert.equal(await helpText.isVisible(), false, 'the explanation is hidden at first');
  await help.hover();
  await helpText.waitFor();
  assert.equal(await helpText.textContent(), 'Drag a module into the page, or back here to put it back. From the keyboard: Space picks it up, the arrow keys move it, Space drops it, Escape puts it back.');
  await a.page.mouse.move(5, 5);
  await helpText.waitFor({ state: 'hidden' });
  await help.click(); await a.page.mouse.move(5, 5);
  assert.equal(await helpText.isVisible(), true, 'a click keeps it open');
  await window.screenshot({ path: 'artifacts/v0.6.3-module-help.png' });
  await a.page.keyboard.press('Escape');
  await helpText.waitFor({ state: 'hidden' });
  const families = await window.locator('details').evaluateAll(nodes => nodes.map(node => [node.querySelector('summary').textContent, node.open]));
  // Translation is called Languages since 0.8.0; Expertise and Sound have no module on this page, so they start closed (D11, D24).
  assert.deepEqual(families, [['Languages2', true], ['Expertise2', false], ['Sound1', false], ['Notes2', true]]);
  // A module on the page is not marked in the window (D13, 0.8.1), and the search no longer finds facets.
  assert.equal(await window.getByText('Already here').count(), 0);
  await window.getByLabel('Search modules', { exact: true }).fill('pinyin');
  await window.getByText('No module matches “pinyin”.').waitFor();
  await window.getByLabel('Search modules', { exact: true }).fill('chinese');
  assert.deepEqual(await window.locator('.window-module:visible').evaluateAll(nodes => nodes.map(node => node.dataset.type)), ['chinese']);
  await window.getByLabel('Search modules', { exact: true }).fill('nothing like this');
  await window.getByText('No module matches “nothing like this”.').waitFor();
  await window.getByLabel('Search modules', { exact: true }).fill('');
  assert.equal(await window.locator('.window-module').count(), 7);
  await a.page.setViewportSize({ width: 390, height: 800 });
  await a.page.screenshot({ path: 'artifacts/v0.6.0-page-narrow.png', fullPage: true });
  assert.equal(await a.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
});

test('generation reveal: finished content rises into its card and is announced; reduced motion keeps the state without movement', { timeout: 45000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-reveal-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  const store = application.store;
  await useModules(store, ['chinese', 'german']);
  const session = { installationId: 'fixture', sessionId: 'reveal', epoch: 1 };
  await store.openSession('reveal-session', session);
  const { pageId } = await store.capture('reveal-capture', { session, mainKey: '幸福', snapshot: await store.snapshot() });
  const [explanation, examples] = modulesOf(await store.page(pageId));
  await signIn(a.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  const card = name => componentArticle(a.page, name);
  // While it generates, the card is only its tab, with a spark running round the tab's edge (0.6.3).
  await card('Chinese').and(a.page.locator('[data-generating]')).waitFor();
  assert.equal(await card('Chinese').locator('.card-fold').isVisible(), false, 'no body while generating');
  assert.equal(await card('Chinese').locator('.list-status').count(), 0, 'no Generating line');
  assert.equal(await card('Chinese').locator('.spark i').first().evaluate(node => getComputedStyle(node).animationName), 'travel');
  // The comet runs round the tab's outline at a steady pace, corners and long edges alike.
  const steps = await card('Chinese').locator('.spark i').first().evaluate(async head => {
    const points = [];
    for (let frame = 0; frame < 90; frame++) {
      const box = head.getBoundingClientRect();
      points.push([box.x + box.width / 2, box.y + box.height / 2, performance.now()]);
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    return points.slice(1).map(([x, y, t], index) => Math.hypot(x - points[index][0], y - points[index][1]) / (t - points[index][2]))
      .filter(speed => speed > 0 && speed < 5);
  });
  const sorted = [...steps].sort((a, b) => a - b), median = sorted[Math.floor(sorted.length / 2)];
  assert.ok(sorted[Math.floor(sorted.length * .1)] > median * .6 && sorted[Math.floor(sorted.length * .9)] < median * 1.4,
    `steady speed (10th–90th percentile ${sorted[Math.floor(sorted.length * .1)].toFixed(3)}–${sorted[Math.floor(sorted.length * .9)].toFixed(3)} px/ms, median ${median.toFixed(3)})`);
  assert.equal(await card('Chinese').getByRole('status').first().textContent(), 'Chinese: generating');
  await a.page.locator('.shaping-list').screenshot({ path: 'artifacts/v0.6.3-generating.png' });

  await store.stage(explanation.attemptId, staged(wordResult(['生活称心如意'], {}, { language: '汉语', key: '幸福' })));
  await store.publish('reveal-publish-1', { attemptId: explanation.attemptId, session });
  // The spark does not vanish: it fades away as the content rises in.
  await card('Chinese').locator('.spark[data-ending]').waitFor({ state: 'attached', timeout: 15000 });
  await card('Chinese').locator('.spark').waitFor({ state: 'detached', timeout: 3000 });
  await card('Chinese').locator('.card-body[data-reveal] .entry-core li').waitFor({ timeout: 15000 });
  assert.equal(await card('Chinese').getByRole('status').textContent(), 'Chinese generated.');
  assert.notEqual(await card('Chinese').locator('.entry-core li').evaluate(node => getComputedStyle(node).animationName), 'none', 'the content rises');

  // Reduced motion: the same state, shown at once.
  await a.page.emulateMedia({ reducedMotion: 'reduce' });
  await store.failAttempt(examples.attemptId);
  await card('German').locator('.list-status').filter({ hasText: 'Generation failed' }).waitFor({ timeout: 15000 });
  assert.equal(await card('German').getByRole('status').textContent(), 'German: generation failed.');
  const durations = await a.page.evaluate(() => [...document.querySelectorAll('.component, .component *, .card-actions')]
    .map(node => getComputedStyle(node)).flatMap(style => [style.animationDuration, style.transitionDuration].flatMap(value => value.split(', ')))
    .map(value => parseFloat(value) * (value.endsWith('ms') ? 1 : 1000)));
  assert.ok(Math.max(...durations) <= 0.01, `nothing moves under reduced motion (longest ${Math.max(...durations)} ms)`);
});
