// The core's own Edit (0.16.2), as a facet's: at the end of the core's top
// line, it opens the core alone in place with its toolbar, Save and Cancel,
// and saves only the core, over the latest content.
import test, { createTestApplication } from '../helpers/database.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { staged } from '../helpers/pages.mjs';
import { BANK, componentArticle, launch, signIn, waitFor } from './helpers.mjs';

test('0.16.2: the core’s own Edit opens the core alone in place, saves only the core, and a spoken core has none', { timeout: 60000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-core-edit-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await a.page.setViewportSize({ width: 1280, height: 1400 });
  const store = application.store;
  const session = { installationId: 'fixture', sessionId: 'core-edit', epoch: 1 };
  await store.openSession('core-edit-session', session);
  const { pageId } = await store.capture('core-edit-capture', { session, mainKey: 'bank', snapshot: await store.snapshot() });
  const first = (await store.page(pageId)).components.find(item => item.moduleType === 'german');
  await store.stage(first.attemptId, staged(BANK));
  await store.publish('core-edit-publish', { attemptId: first.attemptId, session });
  const german = async () => (await store.page(pageId)).components.find(item => item.moduleType === 'german');
  const stored = async () => (await german()).content.blocks[0];
  await signIn(a.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  const card = componentArticle(a.page, 'German');
  await card.locator('.entry-core').waitFor();

  // The Edit sits at the end of the core's top line, hidden until the core is pointed at.
  const edit = card.getByRole('button', { name: 'Edit Meanings from German', exact: true });
  await a.page.mouse.move(5, 5);
  assert.equal(await edit.evaluate(node => getComputedStyle(node).opacity), '0');
  await card.locator('.entry-core').hover();
  await waitFor(async () => await edit.evaluate(node => getComputedStyle(node).opacity) === '1', 'Edit shows on the core');
  assert.equal(await edit.evaluate(node => Boolean(node.closest('.entry-heading'))), true, 'on the core’s top line');
  await edit.click();

  // The core alone becomes an editor in place, focused, with its toolbar and its Save and Cancel; the facets read as before.
  const text = card.getByRole('textbox', { name: 'Meanings, German', exact: true });
  await text.waitFor();
  assert.equal(await card.getByRole('textbox').count(), 1, 'only the core is open');
  await waitFor(() => a.page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Meanings, German'), 'the focus is in its text');
  assert.equal(await card.locator('.core-editing .md-toolbar').count(), 1);
  assert.deepEqual(await card.locator('.core-editing .component-tools button').allTextContents(), ['Cancel', 'Save']);
  assert.match(await card.locator('.facet[data-facet="article"]').textContent(), /das Ufer · die Ufer/);
  await card.locator('.facet[data-facet="article"]').hover();
  assert.equal(await a.page.getByRole('button', { name: 'Edit Article from German', exact: true }).isDisabled(), true, 'the facets wait');

  // Cancel restores the core.
  await text.click(); await a.page.keyboard.type(' discarded');
  await card.locator('.core-editing').getByRole('button', { name: 'Cancel', exact: true }).click();
  await card.getByRole('textbox').waitFor({ state: 'detached' });
  const before = (await stored()).core;
  assert.doesNotMatch(before, /discarded/, 'nothing saved');

  // Save writes only the core, over the latest content: a facet edited elsewhere meanwhile stays.
  await card.locator('.entry-core').hover();
  await edit.click();
  await text.waitFor();
  await waitFor(() => a.page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Meanings, German'), 'focused again');
  await a.page.keyboard.press('ControlOrMeta+End');
  await a.page.keyboard.type(' (river)');
  const elsewhere = await stored();
  await store.savePage('core-edit-elsewhere', { pageId, changes: [{ componentId: first.id, facet: 'synonyms',
    content: { version: 1, blocks: [{ ...elsewhere, facets: { ...elsewhere.facets, synonyms: 'Gestade' } }] } }] });
  await card.locator('.core-editing').getByRole('button', { name: 'Save', exact: true }).click();
  await card.getByRole('textbox').waitFor({ state: 'detached' });
  const saved = await stored();
  assert.notEqual(saved.core, before);
  assert.match(saved.core, /\(river\)/);
  assert.equal(saved.facets.synonyms, 'Gestade', 'the facet changed elsewhere is kept');
  await waitFor(async () => /\(river\)/.test(await card.locator('.entry-core').textContent()), 'the card shows it');
  await a.page.screenshot({ path: 'artifacts/v0.16.2-core-edit.png' });
});
