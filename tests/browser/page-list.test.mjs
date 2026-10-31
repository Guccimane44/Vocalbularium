// The page list and the sidebar.
import test, { createTestApplication } from '../helpers/database.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { sentenceResult, text, textBlocks, useModules, wordResult, staged } from '../helpers/pages.mjs';
import { keyOf, modulesOf, apiOrigin, launch, accountTrigger, accountMenu, chooseAppearance, signIn, waitFor, pageReady } from './helpers.mjs';

test('page list: quiet states, layouts remembered per deck, sorting, grouping, every pointer target, text selection and keyboard navigation', { timeout: 60000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-rows-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  const store = application.store;
  await useModules(store, ['chinese', 'german']);
  const deck = await store.snapshot();
  const other = await store.createDeck('Other deck');
  const session = { installationId: 'fixture', sessionId: 'rows', epoch: 1 };
  await store.openSession('rows-session', session);
  const ids = {};
  for (const state of ['completed', 'loading', 'failed']) {
    const { pageId } = await store.capture(`row-${state}`, { session, mainKey: `${state} entry`, snapshot: deck }); ids[state] = pageId;
    const [front, back] = modulesOf(await store.page(pageId));
    await store.stage(front.attemptId, staged(sentenceResult(`${state} entry`)));
    await store.publish(`row-front-${state}`, { attemptId: front.attemptId, session });
    if (state === 'completed') {
      await store.stage(back.attemptId, staged(wordResult(['erledigter Eintrag'], { examples: [{ sentence: 'Done.', translation: 'Erledigt.' }] })));
      await store.publish('row-completed-back', { attemptId: back.attemptId, session });
    } else if (state === 'failed')
      await store.failAttempt(back.attemptId);
  }
  ids.neutral = (await store.createPage('row-neutral', { deckId: deck.id, mainKey: 'neutral entry' })).pageId;
  await signIn(a.page);

  // Recent captures: nothing for completed work, words for the rest.
  const capture = text => a.page.locator('.capture').filter({ has: a.page.getByText(text, { exact: true }) });
  await capture('completed entry').waitFor();
  // The decks come first, the recent captures after them (D23, 0.13.3).
  assert.equal(await a.page.locator('.grid').evaluate(grid => Boolean(grid.compareDocumentPosition(document.querySelector('.recent')) & Node.DOCUMENT_POSITION_FOLLOWING)), true, 'recent captures follow the decks');
  // The account menu sits at the sidebar's foot; its trigger names the account and its server, and it opens upward (D23).
  const trigger = accountTrigger(a.page);
  assert.equal(await trigger.evaluate(node => node.closest('#sidebar') !== null), true, 'the trigger is in the sidebar');
  assert.equal(await a.page.locator('.app-header .account-trigger').count(), 0, 'not in the header');
  await accountMenu(a.page);
  assert.equal(await trigger.locator('.account-name').textContent(), 'admin');
  assert.equal(await trigger.locator('.account-server').textContent(), new URL(apiOrigin).host, 'the trigger names the server too');
  assert.deepEqual(await a.page.getByRole('group', { name: 'Appearance', exact: true }).getByRole('radio').evaluateAll(nodes => nodes.map(node => node.labels[0].textContent)), ['System', 'Sage', 'Moss night']);
  assert.ok((await a.page.locator('.account-panel').boundingBox()).y + (await a.page.locator('.account-panel').boundingBox()).height <= (await trigger.boundingBox()).y, 'the menu opens upward');
  assert.deepEqual(await a.page.locator('.account-main > .menu-action, .account-main > .language-row').allTextContents(), ['LanguageEnglish', 'Diagnostic logs', 'Log out']);
  await a.page.keyboard.press('Escape');
  assert.equal(await a.page.locator('.capture .badge, .capture .state-icon').count(), 0);
  assert.equal(await capture('completed entry').locator('.list-status').count(), 0);
  assert.equal(await capture('completed entry').locator('.meaning-line').textContent(), 'erledigter Eintrag');
  assert.equal(await capture('loading entry').locator('.list-status').textContent(), 'Generating 1 of 2');
  assert.equal(await capture('failed entry').locator('.list-status').textContent(), 'Generation failed');
  assert.equal(await capture('failed entry').getAttribute('data-state'), 'failed');
  await a.worker.evaluate(async (deck) => {
    const now = new Date().toISOString();
    await chrome.storage.local.set({
      'capture-visual-saving': { operationId: 'visual-saving', state: 'saving', createdAt: now, payload: { mainKey: 'Saving example', snapshot: deck } },
      'capture-visual-failed': { operationId: 'visual-failed', state: 'pending', error: 'Controlled save failure', createdAt: now, payload: { mainKey: 'Unsaved example', snapshot: deck } }
    });
  }, deck);
  const unsaved = capture('Unsaved example'), saving = capture('Saving example');
  await unsaved.getByRole('button', { name: 'Try saving again', exact: true }).waitFor();
  assert.equal(await unsaved.getAttribute('data-state'), 'unsaved');
  assert.equal(await unsaved.locator('.list-status').textContent(), 'Not saved');
  assert.equal(await unsaved.getByText('Controlled save failure', { exact: true }).count(), 1);
  assert.equal(await saving.getAttribute('data-state'), 'saving');
  assert.equal(await saving.locator('.list-status').textContent(), 'Saving to your account');
  assert.equal(await saving.getByRole('link').count(), 0, 'an unsaved capture has no page to open');
  for (const theme of ['light', 'dark']) {
    await chooseAppearance(a.page, theme);
    await a.page.screenshot({ path: `artifacts/v0.6.0-dashboard-${theme}.png`, fullPage: true });
  }
  await a.worker.evaluate(() => chrome.storage.local.remove(['capture-visual-saving', 'capture-visual-failed']));
  await capture('failed entry').getByRole('button', { name: 'Retry…', exact: true }).click();
  await pageReady(a.page);
  assert.ok(a.page.url().endsWith(`#page/${ids.failed}`), 'Retry… opens the page; the list starts no generation');
  assert.equal((await store.page(ids.failed)).status, 'failed');

  // The deck list: List by default, rows in the same quiet states.
  await a.page.goto(a.page.url().replace(/#.*$/, `#deck/${deck.id}`));
  const row = state => a.page.locator(`[data-page-id="${ids[state]}"]`);
  await row('completed').waitFor();
  assert.equal(await a.page.getByRole('button', { name: 'List', exact: true }).getAttribute('aria-pressed'), 'true', 'List is the default layout');
  for (const state of Object.keys(ids)) {
    assert.equal(await row(state).getAttribute('data-state'), state);
    assert.equal(await row(state).getByRole('link').count(), 1);
  }
  assert.equal(await row('completed').locator('.list-status').count(), 0);
  assert.equal(await row('neutral').locator('.list-status').count(), 0);
  assert.equal(await row('completed').locator('.meaning-line').textContent(), 'erledigter Eintrag');
  assert.equal(await row('completed').getByRole('img').getAttribute('aria-label'), '2 modules filled');
  assert.equal(await row('neutral').getByRole('img').count(), 0, 'a page with nothing filled shows no marks');
  assert.equal(await row('loading').locator('.list-status').textContent(), 'Generating 1 of 2');
  assert.equal(await row('failed').getByRole('button', { name: 'Retry…', exact: true }).count(), 1);
  assert.deepEqual(await a.page.locator('.group-heading').allTextContents(), ['Today'], 'creation-time orders group by date');
  for (const theme of ['light', 'dark']) {
    await chooseAppearance(a.page, theme);
    await row('completed').getByRole('link').focus();
    await a.page.screenshot({ path: `artifacts/v0.6.0-list-${theme}.png`, fullPage: true });
    const report = await a.page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const luminance = color => {
        const rgb = color.trim().replace('#', '').match(/../g).map(value => parseInt(value, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
        return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
      };
      const ratio = (a, b) => { const [hi, lo] = [a, b].map(name => luminance(style.getPropertyValue(`--${name}`))).sort((a, b) => b - a); return (hi + .05) / (lo + .05); };
      const backgrounds = ['ground', 'surface', 'surface-hover', 'surface-active', 'status-failed-bg'];
      return [
        ...backgrounds.flatMap(bg => ['ink', 'ink-soft', 'ink-muted'].map(fg => ({ pair: `${fg}/${bg}`, ratio: ratio(fg, bg), minimum: 4.5 }))),
        ...backgrounds.map(bg => ({ pair: `focus/${bg}`, ratio: ratio('focus', bg), minimum: 3 })),
        ...['ground', 'surface', 'surface-hover'].map(bg => ({ pair: `line-control/${bg}`, ratio: ratio('line-control', bg), minimum: 3 })),
        { pair: 'status-failed/status-failed-bg', ratio: ratio('status-failed', 'status-failed-bg'), minimum: 4.5 },
        ...['ground', 'surface'].map(bg => ({ pair: `status-busy/${bg}`, ratio: ratio('status-busy', bg), minimum: 3 })),
        { pair: 'on-ink/ink', ratio: ratio('on-ink', 'ink'), minimum: 4.5 }
      ];
    });
    for (const item of report) assert.ok(item.ratio >= item.minimum, `${theme} ${item.pair}: ${item.ratio.toFixed(2)}`);
    t.diagnostic(`${theme} minimum text ${Math.min(...report.filter(item => item.minimum === 4.5).map(item => item.ratio)).toFixed(2)}:1; minimum cue/focus/border ${Math.min(...report.filter(item => item.minimum === 3).map(item => item.ratio)).toFixed(2)}:1`);
  }
  const { sortPages } = await import('../../extension/sorting.ts');
  const listed = () => a.page.locator('[data-page-id]').evaluateAll(rows => rows.map(row => row.dataset.pageId));
  for (const order of ['newest', 'oldest', 'az', 'za']) {
    await a.page.getByLabel('Sort pages', { exact: true }).selectOption(order);
    const expected = sortPages((await store.pages()).filter(page => page.deckId === deck.id).map(page => ({ id: page.id, createdAt: page.createdAt, mainKey: keyOf(page) })), order).map(page => page.id);
    await waitFor(async () => JSON.stringify(await listed()) === JSON.stringify(expected), `${order} page order loaded`);
    assert.equal(await a.page.locator('.group-heading').count(), order === 'az' || order === 'za' ? 0 : 1);
    for (const layout of ['Table', 'Gallery', 'List']) {
      await a.page.getByRole('button', { name: layout, exact: true }).click();
      assert.deepEqual(await listed(), expected, `${layout} keeps the ${order} order`);
    }
  }

  // The layout is remembered per deck on the installation.
  await a.page.getByRole('button', { name: 'Gallery', exact: true }).click();
  await a.page.reload();
  await a.page.locator('.page-card').first().waitFor();
  assert.equal(await a.page.getByRole('button', { name: 'Gallery', exact: true }).getAttribute('aria-pressed'), 'true');
  await a.page.goto(a.page.url().replace(/#.*$/, `#deck/${other.id}`));
  await a.page.getByRole('heading', { name: 'Other deck', exact: true }).waitFor();
  assert.equal(await a.page.getByRole('button', { name: 'List', exact: true }).getAttribute('aria-pressed'), 'true', 'other decks keep their own layout');
  await a.page.goto(a.page.url().replace(/#.*$/, `#deck/${deck.id}`));
  await a.page.locator('.page-card').first().waitFor();
  await a.page.getByRole('button', { name: 'List', exact: true }).click();

  for (const target of ['entry', 'marks', 'space', 'keyboard']) {
    const completed = row('completed');
    if (target === 'entry') await completed.getByRole('link').click();
    else if (target === 'marks') await completed.getByRole('img').click();
    else if (target === 'space') {
      // Raw mouse clicks do not scroll; bring the row on screen first.
      await completed.scrollIntoViewIfNeeded();
      const box = await completed.boundingBox(); await a.page.mouse.click(box.x + box.width - 8, box.y + box.height / 2);
    } else { await completed.getByRole('link').focus(); await a.page.keyboard.press('Enter'); }
    await pageReady(a.page);
    assert.ok(a.page.url().endsWith(`#page/${ids.completed}`), target);
    await a.page.getByRole('button', { name: '← My Deck', exact: true }).click();
    await row('completed').waitFor();
  }
  await row('completed').getByRole('link').evaluate(node => {
    const selection = getSelection(), range = document.createRange(); range.selectNodeContents(node); selection.removeAllRanges(); selection.addRange(range);
    node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
  });
  await a.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.ok(a.page.url().endsWith(`#deck/${deck.id}`), 'selecting entry text does not navigate');

  // Long text in every layout, at a narrow width, without overflow.
  const completedKey = (await store.page(ids.completed)).components.find(item => item.moduleType === 'main-key');
  await store.savePage('row-long-text', { pageId: ids.completed, changes: [{ componentId: completedKey.id, content: textBlocks('LongWord'.repeat(40) + ' 幸福 — Grüße') }] });
  await a.page.reload();
  await row('completed').waitFor();
  await a.page.setViewportSize({ width: 390, height: 760 });
  for (const layout of ['List', 'Table', 'Gallery']) {
    await a.page.getByRole('button', { name: layout, exact: true }).click();
    await a.page.screenshot({ path: `artifacts/v0.6.0-${layout.toLowerCase()}-narrow.png`, fullPage: true });
    assert.equal(await a.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${layout} fits`);
  }
  await a.page.getByRole('button', { name: 'List', exact: true }).click();
  await a.page.emulateMedia({ forcedColors: 'active' });
  await row('failed').getByRole('link').focus();
  await a.page.screenshot({ path: 'artifacts/v0.6.0-list-forced-colors.png', fullPage: true });
  assert.equal(await row('failed').locator('.list-status').textContent(), 'Generation failed', 'status is a word, never colour alone');
  await row('neutral').getByRole('link', { name: 'neutral entry', exact: true }).press('Enter');
  await pageReady(a.page);
  assert.ok(a.page.url().endsWith(`#page/${ids.neutral}`));
});

test('sidebar: the current deck stays marked on a page while the account refreshes', { timeout: 60000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-sidebar-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  const store = application.store;
  await useModules(store, ['german']);
  const session = { installationId: 'fixture', sessionId: 'sidebar', epoch: 1 };
  await store.openSession('sidebar-session', session);
  const { pageId } = await store.capture('sidebar-page', { session, mainKey: '幸福', snapshot: await store.snapshot() });
  const [examples] = modulesOf(await store.page(pageId));
  await store.stage(examples.attemptId, staged('Glück'));
  await store.publish('sidebar-publish', { attemptId: examples.attemptId, session });
  await signIn(a.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  await a.page.locator('h1.main-key').waitFor();
  await a.page.locator('#sidebar .nav-item[aria-current="page"]').filter({ hasText: 'My Deck' }).waitFor();
  // Record every sidebar rebuild and whether My Deck was still marked after it.
  const watch = () => a.page.evaluate(() => {
    window.sidebarLog = [];
    new MutationObserver(() => window.sidebarLog.push(Boolean(document.querySelector('#sidebar .nav-decks [aria-current="page"]'))))
      .observe(document.querySelector('#sidebar'), { childList: true });
  });
  const log = () => a.page.evaluate(() => window.sidebarLog);
  // The first refresh after loading may still bring what the background synced meanwhile.
  await new Promise(resolve => setTimeout(resolve, 5500));
  await watch();
  // Two more refresh cycles with nothing changed: nothing is redrawn.
  await new Promise(resolve => setTimeout(resolve, 11000));
  assert.deepEqual(await log(), [], 'an unchanged account does not redraw the sidebar');
  // A real change redraws it, and My Deck stays marked throughout.
  await store.capture('sidebar-second', { session, mainKey: '快乐', snapshot: await store.snapshot() });
  await a.page.locator('#sidebar .nav-count').filter({ hasText: '2' }).waitFor({ timeout: 12000 });
  await new Promise(resolve => setTimeout(resolve, 500));
  const redraws = await log();
  assert.ok(redraws.length > 0, 'the change redrew the sidebar');
  assert.ok(redraws.every(Boolean), `My Deck stays marked through every redraw (${JSON.stringify(redraws)})`);
});
