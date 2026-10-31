// Cards and editing: manual pages, Retry, deletion and a card’s Retry input.
import test, { createTestApplication } from '../helpers/database.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import { text, useModules, wordResult, staged } from '../helpers/pages.mjs';
import { keyOf, modulesOf, componentArticle, cardTab, cardButton, launch, signIn, waitFor, pageReady, addFromWindow, drag } from './helpers.mjs';

test('manual page UI: per-card actions, drafts, leave choices, sorting, failed-save recovery, and deletion', { timeout: 45000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-manual-browser-'));
  const databaseKey = join(directory, 'account-fixture');
  let application = await createTestApplication(t, { databaseKey }); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await signIn(a.page);
  await a.page.getByRole('heading', { name: 'My Deck', exact: true }).click();
  await a.page.getByRole('button', { name: 'Add page manually', exact: true }).click();
  await a.page.getByLabel('Main key', { exact: true }).fill('zebra');
  await a.page.getByLabel('Context (optional)', { exact: true }).fill('zoo animal');
  await a.page.getByRole('button', { name: '← My Deck', exact: true }).click();
  await a.page.getByRole('dialog').getByRole('button', { name: 'Continue editing', exact: true }).click();
  assert.equal(await a.page.getByLabel('Main key', { exact: true }).inputValue(), 'zebra');
  await a.page.getByRole('button', { name: '← My Deck', exact: true }).click();
  await a.page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await a.page.getByRole('link', { name: 'zebra', exact: true }).click();
  // A never-generated component offers Retry too, which starts it at once (0.6.3; earlier Generate).
  await (await cardButton(a.page, 'Retry German')).waitFor();
  assert.equal(await a.page.getByRole('button', { name: /^Generate / }).count(), 0, 'no Generate');
  const created = (await application.store.pages())[0];
  const shape = async () => (await application.store.page(created.id)).components.map(item => [item.moduleType, text(item)]);
  assert.equal(created.status, null, 'manual creation never generates');
  assert.deepEqual(await shape(), [['main-key', 'zebra'], ['context', 'zoo animal'], ['german', '']]);
  assert.equal(await a.page.getByRole('button', { name: /^Retry / }).count(), 1, 'only the never-generated component offers Retry');
  for (const removed of ['Edit page', 'Generate missing', 'Retry page']) {
    assert.equal(await a.page.getByRole('button', { name: removed, exact: true }).count(), 0, `no page-level ${removed} (D04)`);
  }
  // An empty component is only its tab, with its actions (0.6.2).
  const ungenerated = componentArticle(a.page, 'German');
  assert.equal(await ungenerated.getAttribute('data-empty'), 'true');
  assert.equal(await ungenerated.locator('.card-body').count(), 0);
  await ungenerated.getByRole('button', { name: 'Retry German', exact: true }).waitFor();

  // Shaping by dragging, each step saved at once.
  await addFromWindow(a.page, 'text');
  await componentArticle(a.page, 'Text').waitFor();
  assert.deepEqual(await shape(), [['main-key', 'zebra'], ['context', 'zoo animal'], ['german', ''], ['text', '']]);
  await drag(a.page, cardTab(a.page, 'Text'), componentArticle(a.page, 'German'));
  await waitFor(async () => (await shape())[2][0] === 'text', 'Text moved up');
  assert.equal(await a.page.getByRole('button', { name: /^Move / }).count(), 0, 'no move buttons (D04)');
  // Deleting a component with content asks beside its tab, not in a dialog (0.6.3): Cancel lands
  // under the pointer, where Delete was, and the final Delete stands to its left.
  const askDelete = await cardButton(a.page, 'Delete Context');
  await a.page.locator('.card-actions[data-open]').evaluate(node => Promise.all(node.getAnimations({ subtree: true }).map(animation => animation.finished)));
  const was = await askDelete.boundingBox();
  await askDelete.click();
  const keep = a.page.getByRole('button', { name: 'Keep Context', exact: true });
  const confirmDelete = a.page.getByRole('button', { name: 'Yes, delete Context', exact: true });
  await keep.waitFor();
  assert.equal(await a.page.getByRole('dialog').count(), 0, 'no dialog');
  assert.equal(await a.page.locator('.confirm-text').textContent(), 'Are you sure?');
  await a.page.locator('[data-confirm]').evaluate(node => Promise.all(node.getAnimations({ subtree: true }).map(animation => animation.finished)));
  assert.equal(await a.page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('button')?.getAttribute('aria-label'),
    [was.x + was.width / 2, was.y + was.height / 2]), 'Keep Context', 'Cancel is under the pointer');
  assert.ok((await confirmDelete.boundingBox()).x < (await keep.boundingBox()).x, 'the final Delete is to the left of Cancel');
  assert.equal(await a.page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Keep Context', 'focus is on Cancel');
  await a.page.locator('.shaping-list').screenshot({ path: 'artifacts/v0.6.3-confirm-delete.png' });
  await keep.click();
  assert.equal(await confirmDelete.count(), 0);
  assert.equal((await shape()).length, 4);
  await (await cardButton(a.page, 'Delete Context')).click();
  await confirmDelete.click();
  await waitFor(async () => (await shape()).length === 3, 'Context deleted');
  // An empty component goes at once, without asking.
  await addFromWindow(a.page, 'chinese');
  await waitFor(async () => (await shape()).length === 4, 'Chinese added');
  await (await cardButton(a.page, 'Delete Chinese')).click();
  await waitFor(async () => (await shape()).length === 3, 'empty Chinese deleted at once');
  assert.equal(await a.page.locator('[data-confirm]').count(), 0, 'no question for an empty component');
  assert.deepEqual(await shape(), [['main-key', 'zebra'], ['text', ''], ['german', '']]);
  // The main key is the page title, shown once: no card, no lock mark (0.6.3), and only Edit, always visible like Delete page.
  const header = a.page.locator('.page-header[data-type="main-key"]');
  assert.equal(await header.getByRole('img').count(), 0, 'no lock mark');
  await a.page.mouse.move(5, 5);
  assert.equal(await header.getByRole('button', { name: 'Edit Main key', exact: true }).evaluate(node => getComputedStyle(node).opacity), '1', 'Edit is visible without hovering');
  assert.equal(await a.page.getByRole('heading', { level: 1 }).textContent(), 'zebra');
  assert.equal(await a.page.locator('article.component[data-type="main-key"]').count(), 0, 'no separate main key card');
  for (const missing of ['Drag Main key', 'Delete Main key', 'Retry Main key', 'Generate Main key']) {
    assert.equal(await a.page.getByRole('button', { name: missing, exact: true }).count(), 0, `the main key has only Edit (${missing})`);
  }
  assert.equal(await componentArticle(a.page, 'Text').getAttribute('data-empty'), 'true');
  assert.equal(await componentArticle(a.page, 'Text').locator('.card-body, .add-text').count(), 0, 'no placeholder for an empty Text');

  // Editing is one card at a time, with Save and Cancel in the card.
  const mainKeyField = a.page.getByRole('textbox', { name: 'Edit Main key', exact: true });
  await a.page.getByRole('button', { name: 'Edit Main key', exact: true }).click();
  await a.page.getByRole('button', { name: 'Save', exact: true }).waitFor();
  assert.equal(await a.page.locator('.window-module[data-type="text"]').getAttribute('aria-disabled'), 'true', 'shaping waits until editing ends');
  assert.equal(await a.page.locator('.module-window .notice').count(), 0, 'no notice while editing (0.5.2)');
  assert.equal(await (await cardButton(a.page, 'Edit Text')).isDisabled(), true, 'one card at a time');
  await mainKeyField.fill('discard this');
  await a.page.getByRole('button', { name: '← My Deck', exact: true }).click();
  await a.page.getByRole('dialog').getByRole('button', { name: 'Discard', exact: true }).click();
  assert.equal(keyOf(await application.store.page(created.id)), 'zebra');
  await a.page.getByRole('link', { name: 'zebra', exact: true }).click();
  await a.page.getByRole('button', { name: 'Edit Main key', exact: true }).click();
  // Saving an empty main key keeps the editor open and says so inside the field.
  await mainKeyField.fill('');
  await a.page.getByRole('button', { name: 'Save', exact: true }).click();
  await waitFor(async () => await mainKeyField.getAttribute('placeholder') === 'Main key can not be empty.', 'the message stands inside the empty main key');
  assert.equal(await a.page.locator('.notice.error').count(), 0, 'no notice below the field');
  await mainKeyField.fill('cancel this');
  await a.page.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(keyOf(await application.store.page(created.id)), 'zebra');
  await (await cardButton(a.page, 'Edit Text')).click();
  await a.page.getByRole('textbox', { name: 'Edit Text', exact: true }).fill('saved own text');
  await a.page.getByRole('button', { name: 'Save', exact: true }).click();
  await waitFor(async () => (await shape())[1][1] === 'saved own text', 'Text saved from its card');
  await a.page.getByRole('button', { name: 'Edit Main key', exact: true }).click();
  await mainKeyField.fill('alpha');
  await application.close();
  await a.page.getByRole('button', { name: 'Save', exact: true }).click();
  await a.page.getByRole('button', { name: 'Try saving again', exact: true }).waitFor();
  assert.equal(await mainKeyField.inputValue(), 'alpha');
  application = (await createTestApplication(t, { databaseKey })); await application.start();
  await a.page.getByRole('button', { name: 'Try saving again', exact: true }).click();
  await a.page.getByRole('button', { name: 'Edit Main key', exact: true }).waitFor();
  const saved = await application.store.page(created.id);
  assert.deepEqual(saved.components.map(item => [item.moduleType, text(item)]), [['main-key', 'alpha'], ['text', 'saved own text'], ['german', '']]);
  assert.equal(saved.createdAt, created.createdAt);
  await a.page.getByRole('button', { name: '← My Deck', exact: true }).click();
  await a.page.getByRole('button', { name: 'Add page manually', exact: true }).click();
  await a.page.getByRole('button', { name: 'Save', exact: true }).click();
  // An empty main key says so inside its field, not in a notice below it (0.6.3).
  const newKey = a.page.getByLabel('Main key', { exact: true });
  await waitFor(async () => await newKey.getAttribute('placeholder') === 'Main key can not be empty.', 'the message stands inside the empty field');
  assert.equal(await newKey.getAttribute('aria-invalid'), 'true');
  assert.equal(await a.page.locator('.notice.error').count(), 0, 'no notice below the field');
  assert.equal(await a.page.evaluate(() => document.activeElement.id), 'main-key', 'the field takes focus');
  await a.page.screenshot({ path: 'artifacts/v0.6.3-empty-main-key.png' });
  await newKey.fill('aardvark');
  await a.page.getByRole('button', { name: /^(Save|Try saving again)$/ }).click();
  await pageReady(a.page);
  await a.page.getByRole('button', { name: '← My Deck', exact: true }).click();
  await a.page.getByLabel('Sort pages', { exact: true }).selectOption('az');
  await waitFor(async () => JSON.stringify(await a.page.locator('.page-rows .entry').allTextContents()) === JSON.stringify(['aardvark', 'alpha']), 'ascending page list loaded');
  await a.page.getByLabel('Sort pages', { exact: true }).selectOption('za');
  await waitFor(async () => JSON.stringify(await a.page.locator('.page-rows .entry').allTextContents()) === JSON.stringify(['alpha', 'aardvark']), 'descending page list loaded');
  await a.page.getByRole('link', { name: 'alpha', exact: true }).click();
  await a.page.getByRole('button', { name: 'Delete page', exact: true }).click();
  await a.page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal((await application.store.pages()).length, 2);
  await a.page.getByRole('button', { name: 'Delete page', exact: true }).click();
  await a.page.getByRole('dialog').getByRole('button', { name: 'Delete page', exact: true }).click();
  await a.page.getByRole('link', { name: 'aardvark', exact: true }).waitFor();
  assert.equal((await application.store.pages()).length, 1);
});

test('retry UI: exact confirmation asked beside the tab, a first Retry without warning, and a two-installation lock preserve drafts until explicit resubmission', { timeout: 35000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-retry-browser-'));
  let release;
  const application = await createTestApplication(t, {
    provider: {
      generate: (_, signal) => new Promise((resolve, reject) => { release = resolve; signal.addEventListener('abort', () => reject(Error('aborted')), { once: true }); })
    }
  });
  await useModules(application.store, ['chinese', 'german']);
  await application.start();
  const session = { installationId: 'fixture', sessionId: 'fixture', epoch: 1 };
  await application.store.openSession('fixture', session);
  const { pageId } = await application.store.capture('fixture-capture', { session, mainKey: '幸福', snapshot: (await application.store.snapshot()) });
  for (const item of modulesOf(await application.store.page(pageId))) {
    await application.store.stage(item.attemptId, staged('saved original'));
    await application.store.publish(item.id, { attemptId: item.attemptId, session });
  }
  const a = await launch(join(directory, 'a')), b = await launch(join(directory, 'b'));
  t.after(async () => { await a.context.close(); await b.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await signIn(a.page); await signIn(b.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  await b.page.goto(`chrome-extension://${b.id}/app.html#page/${pageId}`);
  // Installation b edits the explanation card in its live editor while a retries it.
  await (await cardButton(b.page, 'Edit German')).click();
  const bMeanings = b.page.getByRole('textbox', { name: 'Meanings, German', exact: true });
  await bMeanings.click(); await b.page.keyboard.press('ControlOrMeta+a'); await b.page.keyboard.type('draft back');
  // Retrying content asks beside the tab, as Delete does, in the card's colour; no dialog (0.6.3).
  const retryExplanation = () => cardButton(a.page, 'Retry German');
  await (await retryExplanation()).click();
  const keepExplanation = a.page.getByRole('button', { name: 'Keep German', exact: true });
  await keepExplanation.waitFor();
  assert.equal(await a.page.getByRole('dialog').count(), 0, 'no dialog');
  assert.equal(await a.page.locator('[data-confirm="retry"] .confirm-text').textContent(), 'Are you sure?');
  await a.page.locator('[data-confirm="retry"]').evaluate(node => Promise.all(node.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {}))));
  await a.page.locator('.shaping-list').screenshot({ path: 'artifacts/v0.6.3-confirm-retry.png' });
  assert.notEqual(await a.page.locator('[data-confirm="retry"] .action-confirm').evaluate(node => getComputedStyle(node).backgroundColor),
    await a.page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--status-failed').trim()), 'not red');
  await keepExplanation.click();
  assert.equal(text(modulesOf(await application.store.page(pageId))[1]), 'saved original');
  await (await retryExplanation()).click();
  await a.page.getByRole('button', { name: 'Yes, retry German', exact: true }).click();
  assert.equal(await a.page.getByRole('dialog').count(), 0, 'the answer beside the tab is the confirmation');
  await waitFor(() => release, 'retry provider started');
  await waitFor(async () => (await retryExplanation()).isDisabled(), 'retry disables its control while generating');
  // Every Retry is briefly disabled while the request is in flight; once accepted, only the generating component stays locked.
  await waitFor(async () => (await cardButton(a.page, 'Retry Chinese')).isEnabled(), 'other components stay available');
  assert.equal(await (await retryExplanation()).isDisabled(), true);
  await b.page.getByRole('button', { name: 'Save', exact: true }).click();
  await b.page.getByRole('alert').filter({ hasText: 'still generating' }).waitFor();
  assert.deepEqual(modulesOf(await application.store.page(pageId)).map(text), ['saved original', '']);
  assert.equal(await bMeanings.textContent(), 'draft back', 'the draft is kept');
  release(wordResult('regenerated component'));
  await waitFor(async () => modulesOf(await application.store.page(pageId))[1].status === 'completed', 'retry saved');
  assert.deepEqual(modulesOf(await application.store.page(pageId)).map(text), ['saved original', 'regenerated component']);
  assert.deepEqual(modulesOf(await application.store.page(pageId)).map(text), ['saved original', 'regenerated component']);
  // An explicit resubmission saves the draft over the regenerated content (D09).
  await b.page.getByRole('button', { name: 'Try saving again', exact: true }).click();
  await b.page.locator('.component-tools').waitFor({ state: 'detached' });
  assert.deepEqual(modulesOf(await application.store.page(pageId)).map(text), ['saved original', 'draft back']);

  // A deck change never reaches the page; a module dragged onto it generates from its card without a warning.
  await useModules(application.store, ['chinese', 'german', 'german']);
  await a.page.reload();
  await a.page.locator('h1.main-key').waitFor();
  assert.equal(await componentArticle(a.page, 'German').count(), 1, 'a deck change never reaches the page');
  await addFromWindow(a.page, 'german');
  // Two Germans on one page are numbered in their tabs (0.7.2).
  await componentArticle(a.page, 'German 2').locator('.tab-button').click();
  await componentArticle(a.page, 'German 2').getByRole('button', { name: 'Retry German 2', exact: true }).click();
  await waitFor(async () => modulesOf(await application.store.page(pageId)).filter(item => item.attemptId).length === 3, 'the added module generated');
  assert.equal(await a.page.getByRole('dialog').count(), 0);
});

test('0.9.1: deleting a page goes straight to its deck, and an ejected action stays lifted under a pointer at its lower edge', { timeout: 45000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-0-9-1-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  const store = application.store;
  await useModules(store, ['german']);
  const session = { installationId: 'fixture', sessionId: 'fix-0-9-1', epoch: 1 };
  await store.openSession('fix-0-9-1-session', session);
  const { pageId } = await store.capture('fix-0-9-1-page', { session, mainKey: 'Glück', snapshot: await store.snapshot() });
  for (const item of (await store.page(pageId)).components.filter(component => component.attemptId)) {
    await store.stage(item.attemptId, staged('Freude'));
    await store.publish(`fix-0-9-1-${item.id}`, { attemptId: item.attemptId, session });
  }
  await signIn(a.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  await a.page.locator('h1.main-key').waitFor();
  // Lifting on hover moved the action off a pointer at its lower edge, which
  // dropped it under the pointer again: it flickered with every move.
  await cardTab(a.page, 'German').click();
  const action = a.page.locator('.card-actions[data-open] button').first();
  await action.waitFor();
  await new Promise(resolve => setTimeout(resolve, 800));
  const box = await action.boundingBox();
  let hovered = '';
  for (let step = 0; step < 20; step++) {
    await a.page.mouse.move(box.x + box.width / 2 + step % 2, box.y + box.height - 1);
    await new Promise(resolve => setTimeout(resolve, 60));
    hovered += await action.evaluate(button => button.matches(':hover') ? 'H' : '.');
  }
  assert.equal(hovered, 'H'.repeat(20), 'the action stays hovered at its lower edge');
  await a.page.keyboard.press('Escape');
  // Every heading the view shows from Delete to the deck: never Page unavailable in between.
  await a.page.evaluate(() => {
    window.headings = [];
    new MutationObserver(() => window.headings.push(document.querySelector('#app h1')?.textContent))
      .observe(document.querySelector('#app'), { childList: true, subtree: true, characterData: true });
  });
  await a.page.getByRole('button', { name: 'Delete page', exact: true }).click();
  await a.page.getByRole('dialog').getByRole('button', { name: 'Delete page', exact: true }).click();
  await a.page.getByRole('heading', { name: 'My Deck' }).waitFor();
  await new Promise(resolve => setTimeout(resolve, 500));
  const headings = [...new Set(await a.page.evaluate(() => window.headings))];
  assert.ok(!headings.includes('Page unavailable'), `no unavailable page on the way to the deck (${JSON.stringify(headings)})`);
});

test('0.12.2: a card’s Retry gives the model the core it had, with the meanings as the user edited them (D19)', { timeout: 45000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-reading-browser-'));
  const requests = [];
  const bench = { core: { kind: 'word', language: 'Deutsch', key: 'Bank', gramRole: 'noun', meanings: ['Sitzbank'] }, facets: {} };
  const application = await createTestApplication(t, { provider: { generate: async request => { requests.push(request); return bench; } } });
  await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  const store = application.store;
  const session = { installationId: 'fixture', sessionId: 'reading', epoch: 1 };
  await store.openSession('reading-session', session);
  await useModules(store, ['german']);
  const { pageId } = await store.capture('reading-capture', { session, mainKey: 'Bank', snapshot: await store.snapshot() });
  const german = (await store.page(pageId)).components.find(item => item.moduleType === 'german');
  // The first reading took Bank as a place to keep money.
  await store.stage(german.attemptId, staged({ core: { kind: 'word', language: 'Deutsch', key: 'Bank', gramRole: 'noun', meanings: ['Geldinstitut'] }, facets: {} }));
  await store.publish('reading-publish', { attemptId: german.attemptId, session });
  await signIn(a.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  const card = componentArticle(a.page, 'German');
  await card.locator('.entry-core').waitFor();
  // The user corrects the reading in the meanings, then retries the card.
  await (await cardButton(a.page, 'Edit German')).click();
  const meanings = a.page.getByRole('textbox', { name: 'Meanings, German', exact: true });
  await meanings.click(); await a.page.keyboard.press('ControlOrMeta+a'); await a.page.keyboard.type('Sitzgelegenheit für mehrere');
  await a.page.getByRole('button', { name: 'Save', exact: true }).click();
  await a.page.locator('.component-tools').waitFor({ state: 'detached' });
  await (await cardButton(a.page, 'Retry German')).click();
  await a.page.getByRole('button', { name: 'Yes, retry German', exact: true }).click();
  await waitFor(() => requests.length === 1, 'the Retry reached the provider');
  assert.deepEqual(requests[0].previous, { kind: 'word', language: 'Deutsch', key: 'Bank', gramRole: 'noun', meanings: ['Sitzgelegenheit für mehrere'] },
    'the core as saved, with the edited meanings');
  assert.equal(requests[0].core, undefined);
  await card.locator('.entry-core', { hasText: 'Sitzbank' }).waitFor();
});
