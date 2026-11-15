// A facet’s own Edit, and Context and Text with the toolbar editor (0.7.5).
import test, { createTestApplication } from '../helpers/database.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { blockText } from '@vocabularium/domain/pages';
import { text, staged, fieldEdit } from '../helpers/pages.mjs';
import { BANK, componentArticle, cardButton, launch, signIn, waitFor } from './helpers.mjs';

test('0.7.5: a facet’s own Edit opens that facet alone in place, with its toolbar, Save and Cancel, and saves only that facet', { timeout: 60000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-facet-edit-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await a.page.setViewportSize({ width: 1280, height: 1400 });
  const store = application.store;
  const session = { installationId: 'fixture', sessionId: 'facet-edit', epoch: 1 };
  await store.openSession('facet-edit-session', session);
  const { pageId } = await store.capture('facet-edit-capture', { session, mainKey: 'bank', snapshot: await store.snapshot() });
  const first = (await store.page(pageId)).components.find(item => item.moduleType === 'german');
  const { antonyms, ...facets } = BANK.facets;
  await store.stage(first.attemptId, staged({ core: BANK.core, facets }));
  await store.publish('facet-edit-publish', { attemptId: first.attemptId, session });
  const german = async () => (await store.page(pageId)).components.find(item => item.moduleType === 'german');
  const stored = async () => (await german()).content.blocks[0];
  await signIn(a.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  const card = componentArticle(a.page, 'German');
  const synonyms = card.locator('.facet[data-facet="synonyms"]');
  await synonyms.waitFor();

  // The Examples are plain text like every other facet (D10, amended again).
  const font = locator => locator.evaluate(node => { const css = getComputedStyle(node); return [css.fontFamily, css.fontSize, css.lineHeight]; });
  assert.deepEqual(await font(card.locator('.facet[data-facet="examples"] li > span')), await font(card.locator('.facet[data-facet="article"] p')));
  // Edit sits beside Retry and Delete, for a facet with content.
  await synonyms.hover();
  assert.deepEqual(await synonyms.locator('.facet-actions button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label'))),
    ['About Synonyms from German', 'Edit Synonyms from German', 'Retry Synonyms from German', 'Delete Synonyms from German']);
  await a.page.getByRole('button', { name: 'Edit Synonyms from German', exact: true }).click();

  // That facet alone becomes an editor in place, focused, with its toolbar and its Save and Cancel below it.
  const text = card.getByRole('textbox', { name: 'Synonyms, German', exact: true });
  await text.waitFor();
  assert.equal(await card.getByRole('textbox').count(), 1, 'only that facet is open');
  await waitFor(() => a.page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Synonyms, German'), 'the focus is in its text');
  assert.equal(await synonyms.locator('.facet-title .md-toolbar').count(), 1);
  assert.deepEqual(await synonyms.locator('.component-tools button').allTextContents(), ['Cancel', 'Save']);
  assert.equal(await card.locator(':scope > .card-fold .component-tools').count(), 1, 'one Save and Cancel, the facet\'s');
  assert.deepEqual(await card.locator('.facet').evaluateAll(sections => sections.map(each => each.dataset.facet)), ['article', 'examples', 'synonyms', 'antonyms'], 'in its place');
  assert.match(await card.locator('.facet[data-facet="article"]').textContent(), /das Ufer · die Ufer/, 'the rest reads as before');
  // It counts as editing the card: the other facets' actions and the card's Edit wait.
  await card.locator('.facet[data-facet="article"]').hover();
  assert.equal(await a.page.getByRole('button', { name: 'Edit Article from German', exact: true }).isDisabled(), true);
  assert.equal(await a.page.getByRole('button', { name: 'Retry Article from German', exact: true }).isDisabled(), true);
  assert.equal(await card.locator('.card-actions').count(), 0, 'the card\'s actions are put away');
  await a.page.screenshot({ path: 'artifacts/v0.7.5-facet-edit.png' });

  // Cancel restores everything.
  await text.click(); await a.page.keyboard.type(', discarded');
  await synonyms.getByRole('button', { name: 'Cancel', exact: true }).click();
  await card.getByRole('textbox').waitFor({ state: 'detached' });
  assert.equal((await stored()).facets.synonyms, 'Böschung');
  assert.equal(await synonyms.locator('.facet-body').textContent(), 'Böschung');

  // Save writes only that facet, over the latest content: another installation's core edit meanwhile stays.
  await synonyms.hover();
  await a.page.getByRole('button', { name: 'Edit Synonyms from German', exact: true }).click();
  await text.waitFor();
  await waitFor(() => a.page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Synonyms, German'), 'focused again');
  await a.page.keyboard.type(', fest');
  await a.page.keyboard.press('Shift+ArrowLeft'); await a.page.keyboard.press('Shift+ArrowLeft');
  await a.page.keyboard.press('Shift+ArrowLeft'); await a.page.keyboard.press('Shift+ArrowLeft');
  await synonyms.locator('.md-toolbar').getByRole('button', { name: 'Bold', exact: true }).click();
  await store.savePage('facet-edit-elsewhere', { pageId, changes: [{ componentId: first.id, content: fieldEdit(await german(), 'Flussufer') }] });
  await synonyms.getByRole('button', { name: 'Save', exact: true }).click();
  await card.getByRole('textbox').waitFor({ state: 'detached' });
  const saved = await stored();
  assert.equal(saved.facets.synonyms, 'Böschung, **fest**');
  assert.equal(saved.core, '1. Flussufer', 'the core changed elsewhere is kept');
  assert.equal(saved.facets.article, 'das Ufer · die Ufer');
  await waitFor(async () => (await synonyms.locator('.facet-body strong').count()) === 1, 'the card shows it');

  // A size and a font from the toolbar, on the selected text; saved inside the markdown, shown on the card, read back when edited.
  await synonyms.hover();
  await a.page.getByRole('button', { name: 'Edit Synonyms from German', exact: true }).click();
  await text.waitFor();
  await waitFor(() => a.page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Synonyms, German'), 'focused for size');
  await a.page.keyboard.press('ControlOrMeta+a'); await a.page.waitForTimeout(300);
  const size = synonyms.locator('.md-toolbar').getByRole('combobox', { name: 'Text size', exact: true });
  const fontChoice = synonyms.locator('.md-toolbar').getByRole('combobox', { name: 'Font', exact: true });
  assert.deepEqual([await size.inputValue(), await fontChoice.inputValue()], ['', ''], 'Normal and Text at first');
  await size.selectOption('large');
  await fontChoice.selectOption('display');
  await waitFor(async () => await text.locator('.md-size-large .md-font-display, .md-font-display .md-size-large').count() > 0, 'the editor shows it at once');
  await synonyms.locator('.facet-title').screenshot({ path: 'artifacts/v0.7.5-size-font-toolbar.png' });
  await synonyms.getByRole('button', { name: 'Save', exact: true }).click();
  await card.getByRole('textbox').waitFor({ state: 'detached' });
  assert.equal((await stored()).facets.synonyms, '[Böschung,]{size=large font=display} **[fest]{size=large font=display}**');
  assert.equal(await synonyms.locator('.facet-body .md-size-large.md-font-display').count(), 2, 'the card shows it as set');
  assert.equal(await synonyms.locator('.facet-body').textContent(), 'Böschung, fest');
  await card.screenshot({ path: 'artifacts/v0.7.5-size-font-card.png' });
  await synonyms.hover();
  await a.page.getByRole('button', { name: 'Edit Synonyms from German', exact: true }).click();
  await text.waitFor();
  await text.locator('strong').click();
  await waitFor(async () => await size.inputValue() === 'large' && await fontChoice.inputValue() === 'display', 'the choices show what applies');
  await synonyms.getByRole('button', { name: 'Cancel', exact: true }).click();
  await card.getByRole('textbox').waitFor({ state: 'detached' });

  // A highlight colour from the palette: the button keeps the last one used; saved in the span, shown on the card.
  await synonyms.hover();
  await a.page.getByRole('button', { name: 'Edit Synonyms from German', exact: true }).click();
  await text.waitFor();
  await waitFor(() => a.page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Synonyms, German'), 'focused for colour');
  await a.page.keyboard.press('ControlOrMeta+a'); await a.page.waitForTimeout(300);
  await synonyms.locator('.md-toolbar').getByRole('button', { name: 'Highlight colours', exact: true }).click();
  const palette = synonyms.locator('.md-palette');
  assert.deepEqual(await palette.getByRole('button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label'))),
    ['Yellow highlight', 'Green highlight', 'Blue highlight', 'Pink highlight', 'Orange highlight', 'No highlight']);
  { const box = await synonyms.locator('.facet-title').boundingBox();
    await a.page.screenshot({ path: 'artifacts/v0.7.5-highlight-palette.png', clip: { x: box.x + box.width - 340, y: box.y - 6, width: 350, height: 80 } }); }
  await palette.getByRole('button', { name: 'Green highlight', exact: true }).click();
  assert.equal(await palette.count(), 0, 'the palette closes');
  assert.equal(await synonyms.locator('.md-toolbar [data-tool="highlight"]').getAttribute('data-colour'), 'green', 'the button keeps the colour');
  await synonyms.getByRole('button', { name: 'Save', exact: true }).click();
  await card.getByRole('textbox').waitFor({ state: 'detached' });
  assert.equal((await stored()).facets.synonyms, '[Böschung,]{size=large font=display highlight=green} **[fest]{size=large font=display highlight=green}**');
  assert.equal(await synonyms.locator('.facet-body mark.md-highlight-green').count(), 2);
  assert.equal(await synonyms.locator('.facet-body mark.md-highlight-green').first().evaluate(node => getComputedStyle(node).backgroundColor),
    await a.page.evaluate(() => { const probe = document.body.appendChild(Object.assign(document.createElement('i'), { style: 'background: var(--highlight-green)' }));
      const colour = getComputedStyle(probe).backgroundColor; probe.remove(); return colour; }), 'in the palette\'s green');
  await card.screenshot({ path: 'artifacts/v0.7.5-highlight-card.png' });

  // Emptied, the facet loses its content and leaves the card; its tag stays, bland.
  await synonyms.hover();
  await a.page.getByRole('button', { name: 'Edit Synonyms from German', exact: true }).click();
  await text.waitFor();
  await waitFor(() => a.page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Synonyms, German'), 'focused again');
  await a.page.keyboard.press('ControlOrMeta+a'); await a.page.keyboard.press('Backspace');
  await synonyms.getByRole('button', { name: 'Save', exact: true }).click();
  // Emptied, it keeps its heading, dimmed, with no text (D10, amended a sixth time). The editor's own
  // section is dimmed too while its text is empty, so the editor has to be closed first.
  await card.getByRole('textbox').waitFor({ state: 'detached' });
  await waitFor(async () => await synonyms.getAttribute('data-unfilled') !== null, 'Synonyms emptied');
  assert.equal(await synonyms.locator('.facet-body').count(), 0);
  // Its heading keeps Edit, Retry and Delete; Edit fills it by hand; Delete goes at once, as there is nothing to lose.
  await synonyms.hover();
  assert.deepEqual(await synonyms.locator('.facet-actions button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label'))),
    ['About Synonyms from German', 'Edit Synonyms from German', 'Retry Synonyms from German', 'Delete Synonyms from German']);
  await synonyms.screenshot({ path: 'artifacts/v0.7.5-empty-facet.png' });
  await a.page.getByRole('button', { name: 'Edit Synonyms from German', exact: true }).click();
  await text.waitFor();
  await waitFor(() => a.page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Synonyms, German'), 'focused to fill');
  await a.page.keyboard.type('Ufer');
  await synonyms.getByRole('button', { name: 'Save', exact: true }).click();
  await card.getByRole('textbox').waitFor({ state: 'detached' });
  assert.equal((await stored()).facets.synonyms, 'Ufer', 'filled by hand');
  await synonyms.hover();
  await a.page.getByRole('button', { name: 'Edit Synonyms from German', exact: true }).click();
  await text.waitFor();
  await waitFor(() => a.page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Synonyms, German'), 'focused to empty');
  await a.page.keyboard.press('ControlOrMeta+a'); await a.page.keyboard.press('Backspace');
  await synonyms.getByRole('button', { name: 'Save', exact: true }).click();
  await card.getByRole('textbox').waitFor({ state: 'detached' });
  await synonyms.hover();
  await a.page.getByRole('button', { name: 'Delete Synonyms from German', exact: true }).click();
  await synonyms.waitFor({ state: 'detached' });
  assert.equal(await card.locator('.facet-confirm').count(), 0, 'no "Are you sure?" for an empty facet');
  assert.equal((await stored()).facets.synonyms, undefined);
  assert.notEqual(await card.locator('.facet-tag[data-facet="synonyms"]').getAttribute('data-unfilled'), null);
});

test('0.7.5: Context and Text edit with the toolbar editor, from their tab', { timeout: 60000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-notes-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await a.page.setViewportSize({ width: 1280, height: 1400 });
  const store = application.store;
  const session = { installationId: 'fixture', sessionId: 'notes', epoch: 1 };
  await store.openSession('notes-session', session);
  const { pageId } = await store.capture('notes-capture', { session, mainKey: 'bank', context: 'We sat by the bank, 2*3 times.', snapshot: await store.snapshot() });
  const context = async () => (await store.page(pageId)).components.find(item => item.moduleType === 'context');
  assert.equal(blockText((await context()).content), 'We sat by the ==bank==, 2\\*3 times.', 'captured as markdown, the main key highlighted');
  await signIn(a.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  const card = componentArticle(a.page, 'Context');
  await card.locator('.note-body').waitFor();
  assert.equal(await card.locator('.note-body').textContent(), 'We sat by the bank, 2*3 times.', 'reads as captured');

  // No row of its own (D10, amended a fifth time): it is edited and deleted from its tab.
  assert.equal(await card.locator('.facet-actions').count(), 0);
  // Edit opens the same toolbar editor; the main key's highlight shows there.
  await (await cardButton(a.page, 'Edit Context')).click();
  const text = card.getByRole('textbox', { name: 'Edit Context', exact: true });
  await text.waitFor();
  await waitFor(() => a.page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Edit Context'), 'focused');
  assert.equal(await text.locator('mark').textContent(), 'bank');
  assert.equal(await card.locator('.md-toolbar').count(), 1);
  await a.page.keyboard.press('ControlOrMeta+a'); await a.page.waitForTimeout(300);
  await card.locator('.md-toolbar').getByRole('button', { name: 'Italic', exact: true }).click();
  await card.getByRole('button', { name: 'Save', exact: true }).click();
  await text.waitFor({ state: 'detached' });
  assert.match(blockText((await context()).content), /^\*We sat by the ==bank==, 2\\\*3 times\.\*$/);
  assert.equal(await card.locator('.note-body em').count() > 0, true, 'the card shows it formatted');

  // The tab's Delete asks first, then deletes the component.
  await (await cardButton(a.page, 'Delete Context')).click();
  await a.page.getByRole('button', { name: 'Yes, delete Context', exact: true }).click();
  await waitFor(async () => !(await context()), 'Context deleted');
});
