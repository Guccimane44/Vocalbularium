// The parent editor in place, and an empty parent written by hand (0.7.5).
import test, { createTestApplication } from '../helpers/database.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { text, staged } from '../helpers/pages.mjs';
import { BANK, componentArticle, cardButton, escaped, launch, signIn, waitFor } from './helpers.mjs';

test('0.7.5: the parent editor in place: names and top line locked, no markdown (typed stays typed), the toolbar beside the focused part, empty facets filled, any part emptied', { timeout: 60000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-live-editor-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await a.page.setViewportSize({ width: 1280, height: 1400 });
  const store = application.store;
  const session = { installationId: 'fixture', sessionId: 'live-editor', epoch: 1 };
  await store.openSession('live-editor-session', session);
  const { pageId } = await store.capture('live-editor-capture', { session, mainKey: 'bank', snapshot: await store.snapshot() });
  const first = (await store.page(pageId)).components.find(item => item.moduleType === 'german');
  const { antonyms, ...facets } = BANK.facets;
  await store.stage(first.attemptId, staged({ core: BANK.core, facets }));
  await store.publish('live-editor-publish', { attemptId: first.attemptId, session });
  const stored = async () => (await store.page(pageId)).components.find(item => item.moduleType === 'german').content.blocks[0];
  await signIn(a.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  const card = componentArticle(a.page, 'German');
  await card.locator('.entry-core').waitFor();
  // The editor looks as the card will (D10, amended): the same number column, fonts and colours.
  const looks = scope => scope.evaluate(node => {
    const style = (element, pseudo) => { const css = getComputedStyle(element, pseudo); return [css.fontFamily, css.fontSize, css.fontStyle, css.color, css.fontWeight, css.lineHeight]; };
    const core = node.querySelector('.entry-core li, .live-core li');
    const example = node.querySelector('.facet[data-facet="examples"] li');
    return { coreNumber: style(core, '::before'), coreText: style(core), exampleNumber: style(example, '::before'), example: style(example),
      translation: style(example.querySelector('em')), synonyms: style(node.querySelector('.facet[data-facet="synonyms"] p')) };
  });
  const onCard = await looks(card);
  await (await cardButton(a.page, 'Edit German')).click();
  const editor = card.getByRole('group', { name: 'Edit German', exact: true });
  await editor.waitFor();
  assert.deepEqual(await looks(card), onCard, 'what is edited looks as the card shows it');
  await editor.waitFor();
  const part = name => editor.getByRole('textbox', { name: `${name}, German`, exact: true });

  // In place, formatted, with no markdown characters, numbers or separators of its own.
  assert.equal(await editor.locator('.entry-heading').textContent(), 'EnglischbankWortNomen', 'the top line with its labels (D17), not editable');
  assert.deepEqual(await editor.locator('.facet-tab-label').allTextContents(), ['Article', 'Examples', 'Synonyms', 'Antonyms']);
  assert.equal(await part('Meanings').textContent(), 'Ufer');
  assert.equal(await part('Examples').locator('em').textContent(), 'Wir saßen am Ufer.', 'the translation is italic, not *starred*');
  assert.doesNotMatch(await editor.textContent(), /\*|==|`|^\s*\d+\./m);
  assert.equal(await a.page.evaluate(() => document.activeElement?.tagName), 'BODY', 'opening moves the focus nowhere');
  assert.notEqual(await editor.locator('.facet[data-facet="antonyms"]').getAttribute('data-unfilled'), null, 'the empty facet is dimmed in its place');
  await a.page.screenshot({ path: 'artifacts/v0.7.4-live-editor.png' });

  // No markdown (D10, 0.7.5): typed markdown stays as typed; the toolbar formats.
  const toolbars = editor.locator('.md-toolbar');
  const facetTool = (facet, label) => editor.locator(`.facet[data-facet="${facet}"] .md-toolbar`).getByRole('button', { name: label, exact: true });
  const coreTool = label => editor.locator('.live-core .md-toolbar').getByRole('button', { name: label, exact: true });
  assert.equal(await toolbars.count(), 0, 'no toolbar while nothing is focused');
  await part('Synonyms').click(); await a.page.keyboard.press('End');
  await a.page.keyboard.type(', **fest**');
  assert.equal(await part('Synonyms').textContent(), 'Böschung, **fest**', 'typed markdown stays as typed');
  assert.equal(await part('Synonyms').locator('strong').count(), 0);
  assert.equal(await toolbars.count(), 1, 'one toolbar, beside the focused facet');
  assert.equal(await editor.locator('.facet[data-facet="synonyms"] .facet-title .md-toolbar').count(), 1, 'on its rule, beside its tab');
  assert.deepEqual(await toolbars.getByRole('button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label'))),
    ['Bold', 'Italic', 'Highlight', 'Highlight colours', 'Inline code', 'Bulleted list', 'Numbered list']);
  // A button shows whether its formatting applies at the cursor.
  await part('Examples').locator('em').click();
  await waitFor(async () => await facetTool('examples', 'Italic').getAttribute('aria-pressed') === 'true', 'Italic pressed in the translation');
  assert.equal(await facetTool('examples', 'Bold').getAttribute('aria-pressed'), 'false');
  assert.equal(await toolbars.count(), 1, 'the toolbar follows the focus');
  // Bold from the toolbar and from Cmd/Ctrl+B; inline code from the toolbar, keeping the focus in the text.
  await part('Meanings').click(); await a.page.keyboard.press('ControlOrMeta+a');
  await coreTool('Bold').click();
  assert.equal(await part('Meanings').locator('strong').count(), 1);
  assert.equal(await a.page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Meanings, German', 'the focus stays in the text');
  await a.page.keyboard.press('ControlOrMeta+b');
  assert.equal(await part('Meanings').locator('strong').count(), 0, 'Cmd/Ctrl+B toggles it back');
  await a.page.keyboard.press('ControlOrMeta+b');
  // Faster than a person, ProseMirror would still hold the whole selection.
  await a.page.waitForTimeout(300);
  await part('Meanings').click(); await a.page.waitForTimeout(300);
  await a.page.keyboard.type(' x'); await a.page.keyboard.press('Shift+ArrowLeft');
  await coreTool('Inline code').click();
  assert.equal(await part('Meanings').locator('code').textContent(), 'x');
  // Lists and highlight from the toolbar; a typed "- " stays a dash.
  const tag = card.locator('.facet-tag[data-facet="antonyms"]');
  assert.notEqual(await tag.getAttribute('data-unfilled'), null);
  await part('Antonyms').click();
  await a.page.keyboard.type('- Strom');
  assert.equal(await part('Antonyms').locator('ul').count(), 0, 'no list from a typed dash');
  await waitFor(async () => await tag.getAttribute('data-unfilled') === null, 'the tag fills as you type');
  await a.page.keyboard.press('ControlOrMeta+a'); await a.page.keyboard.type('Strom stark');
  await facetTool('antonyms', 'Bulleted list').click();
  assert.equal(await part('Antonyms').locator('ul li').count(), 1);
  assert.equal(await facetTool('antonyms', 'Bulleted list').getAttribute('aria-pressed'), 'true');
  await facetTool('antonyms', 'Numbered list').click();
  assert.equal(await part('Antonyms').locator('ol li').count(), 1, 'the numbered list takes its place');
  await a.page.keyboard.press('End');
  for (let i = 0; i < 5; i++) await a.page.keyboard.press('Shift+ArrowLeft');
  await facetTool('antonyms', 'Highlight').click();
  assert.equal(await part('Antonyms').locator('mark').textContent(), 'stark');
  // Pasted markdown stays as its characters.
  await a.page.waitForTimeout(300); await part('Synonyms').click(); await a.page.waitForTimeout(300);
  await part('Synonyms').evaluate(node => {
    const data = new DataTransfer(); data.setData('text/plain', ' ==p==');
    node.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  assert.match(await part('Synonyms').textContent(), /\*\*fest\*\* ==p==$/);
  // Tabbing to the toolbar keeps it shown; leaving the part hides it.
  await part('Article').click(); await a.page.keyboard.press('ControlOrMeta+a'); await a.page.keyboard.press('Backspace');
  await a.page.keyboard.press('Shift+Tab');
  assert.equal(await a.page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Numbered list', 'the toolbar is reached from the keyboard');
  assert.equal(await editor.locator('.facet[data-facet="article"] .md-toolbar').count(), 1);
  assert.equal(await editor.locator('.md-editor > ul + p, .md-editor > ol + p').count(), 0, 'no blank line after a list');
  await part('Antonyms').click();
  await editor.locator('.facet[data-facet="antonyms"] .facet-title').screenshot({ path: 'artifacts/v0.7.5-toolbar.png' });
  await a.page.screenshot({ path: 'artifacts/v0.7.5-toolbar-editor.png' });
  await card.getByRole('button', { name: 'Save', exact: true }).click();
  await card.locator('.live-editor').waitFor({ state: 'detached' });
  const saved = await stored();
  assert.equal(saved.core, '1. **Ufer** `x`');
  assert.deepEqual(saved.facets, { examples: '1. We sat on the bank.\n   *Wir saßen am Ufer.*', synonyms: 'Böschung, \\*\\*fest\\*\\* \\=\\=p\\=\\=', antonyms: '1. Strom ==stark==' },
    'typed markdown stored escaped; the emptied Article gone; the empty Antonyms filled');
  assert.deepEqual(saved.header, { kind: 'word', language: 'Englisch', key: 'bank', gramRole: 'noun' }, 'the top line kept, its flags included');
  // The card shows the formatting, and typed markdown as typed.
  assert.equal(await card.locator('.entry-core strong').textContent(), 'Ufer');
  assert.equal(await card.locator('.facet[data-facet="synonyms"]').locator('.facet-body').textContent(), 'Böschung, **fest** ==p==');
  assert.equal(await card.locator('.facet[data-facet="antonyms"] ol li').count(), 1);
  assert.equal(await card.locator('.facet[data-facet="antonyms"] .md-highlight').textContent(), 'stark');
  // The emptied Article keeps its heading, dimmed, with no text (D10, amended a sixth time).
  assert.notEqual(await card.locator('.facet[data-facet="article"]').getAttribute('data-unfilled'), null);
  assert.equal(await card.locator('.facet[data-facet="article"] .facet-body').count(), 0);
  // The default highlight is the main key's yellow (D10, amended a third time); the card draws no emphasis of its own (fourth).
  assert.equal(await card.locator('.facet[data-facet="antonyms"] .md-highlight').evaluate(node => getComputedStyle(node).backgroundColor),
    await a.page.evaluate(() => { const probe = document.body.appendChild(Object.assign(document.createElement('i'), { style: 'background: var(--highlight)' }));
      const colour = getComputedStyle(probe).backgroundColor; probe.remove(); return colour; }));
  assert.equal(await card.locator('mark:not(.md-highlight)').count(), 0, 'no drawn emphasis of the main key');

  // Cancel discards; the core may be emptied too.
  await (await cardButton(a.page, 'Edit German')).click();
  await part('Meanings').click(); await a.page.keyboard.type('discarded');
  await card.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal((await stored()).core, '1. **Ufer** `x`');
  await (await cardButton(a.page, 'Edit German')).click();
  await part('Meanings').click(); await a.page.keyboard.press('ControlOrMeta+a'); await a.page.keyboard.press('Backspace');
  await card.getByRole('button', { name: 'Save', exact: true }).click();
  await card.locator('.live-editor').waitFor({ state: 'detached' });
  assert.equal((await stored()).core, '');
  assert.equal(await card.locator('.entry-heading').textContent(), 'EnglischbankWortNomen', 'an emptied core shows its top line');
  await a.page.screenshot({ path: 'artifacts/v0.7.4-live-editor-saved.png' });
});

test('0.7.5: an empty parent is written by hand: its top line the main key, the language blank, saved and shown', { timeout: 60000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-empty-parent-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await a.page.setViewportSize({ width: 1280, height: 1400 });
  const store = application.store;
  const session = { installationId: 'fixture', sessionId: 'empty-parent', epoch: 1 };
  await store.openSession('empty-parent-session', session);
  const { pageId } = await store.capture('empty-parent-capture', { session, mainKey: 'bank', snapshot: await store.snapshot() });
  const first = (await store.page(pageId)).components.find(item => item.moduleType === 'german');
  await store.stage(first.attemptId, staged('Ufer'));
  await store.publish('empty-parent-publish', { attemptId: first.attemptId, session });
  const { componentId } = await store.addModule('empty-parent-add', { pageId, type: 'german' });
  const written = async () => (await store.page(pageId)).components.find(item => item.id === componentId).content.blocks[0];
  await signIn(a.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  const card = componentArticle(a.page, 'German 2');
  await card.waitFor();
  assert.notEqual(await card.getAttribute('data-empty'), null, 'only its tab');

  // Edit opens it with a top line of the main key, the language blank, and an empty core to fill.
  await (await cardButton(a.page, 'Edit German 2')).click();
  const editor = card.getByRole('group', { name: 'Edit German 2', exact: true });
  await editor.waitFor();
  assert.equal(await editor.locator('.entry-heading-text').textContent(), 'bank');
  const core = editor.getByRole('textbox', { name: 'Meanings, German 2', exact: true });
  await core.click();
  await a.page.keyboard.type('Ufer am Fluss');
  await card.screenshot({ path: 'artifacts/v0.7.5-empty-parent-editor.png' });
  await card.getByRole('button', { name: 'Save', exact: true }).click();
  await editor.waitFor({ state: 'detached' });
  assert.deepEqual(await written(), { type: 'parent', header: { kind: 'word', language: '', key: 'bank' }, core: 'Ufer am Fluss', facets: {} });
  await card.locator('.entry-core').waitFor();
  assert.equal(await card.getAttribute('data-empty'), null, 'a card with content now');
  assert.equal(await card.locator('.entry-core').textContent(), 'Ufer am Fluss');
});
