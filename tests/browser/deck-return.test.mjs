// Going back from a page to its deck draws no empty or loading box over a deck
// that has pages (0.16.1): the dashed box of an empty deck, shown for a moment
// while the list loaded, read as an error. A reload keeps the list on screen.
import test, { createTestApplication } from '../helpers/database.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { staged } from '../helpers/pages.mjs';
import { BANK, componentArticle, crumb, launch, signIn } from './helpers.mjs';

test('deck return: the way back from a page and a re-sort draw no empty or loading box over the list', { timeout: 60000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-deck-return-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await a.page.setViewportSize({ width: 1280, height: 1000 });
  const store = application.store;
  const session = { installationId: 'fixture', sessionId: 'deck-return', epoch: 1 };
  await store.openSession('deck-return-session', session);
  const { pageId } = await store.capture('deck-return-capture', { session, mainKey: 'bank', snapshot: await store.snapshot() });
  const german = (await store.page(pageId)).components.find(item => item.moduleType === 'german');
  await store.stage(german.attemptId, staged(BANK));
  await store.publish('deck-return-publish', { attemptId: german.attemptId, session });
  await signIn(a.page);
  // Records, from now on, whether the empty box or the loading line was ever drawn.
  const watch = () => a.page.evaluate(() => {
    window.drawn = [];
    const look = () => { for (const node of document.querySelectorAll('.empty, .list-loading')) window.drawn.push(`${node.className}: ${node.textContent.trim()}`); };
    new MutationObserver(look).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  const drawn = () => a.page.evaluate(() => window.drawn);
  for (const way of ['back link', 'browser back']) {
    await a.page.goto(`chrome-extension://${a.id}/app.html#deck/${(await store.snapshot()).id}`);
    await a.page.locator('.page-row').first().waitFor();
    await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
    await componentArticle(a.page, 'German').waitFor();
    await watch();
    if (way === 'back link') await crumb(a.page, 'My Deck').click(); else await a.page.goBack();
    await a.page.locator('.page-row').first().waitFor();
    await new Promise(resolve => setTimeout(resolve, 400));
    assert.deepEqual((await drawn()).filter(text => text.endsWith('…') || text.startsWith('empty')), [], `${way}: no empty or loading box over the list`);
  }
  // Another order reloads the list in place.
  await watch();
  await a.page.getByLabel('Sort pages', { exact: true }).selectOption('za');
  await new Promise(resolve => setTimeout(resolve, 400));
  assert.deepEqual((await drawn()).filter(text => text.endsWith('…') || text.startsWith('empty')), [], 'a re-sort keeps the list');
  assert.equal(await a.page.locator('.page-row').count() > 0, true);
});
