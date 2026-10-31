// Content cards: Expertise, Conjugation, Formula and Code.
import test, { createTestApplication } from '../helpers/database.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatContent } from '@vocabularium/domain/content';
import { useModules, staged } from '../helpers/pages.mjs';
import { componentArticle, launch, signIn, waitFor } from './helpers.mjs';

test('0.8.0: an Expertise card, leaf green with a graduation cap, explains the key in English under a top line without a language', { timeout: 60000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-expertise-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await a.page.setViewportSize({ width: 1280, height: 1200 });
  const store = application.store;
  const session = { installationId: 'fixture', sessionId: 'expertise', epoch: 1 };
  await store.openSession('expertise-session', session);
  const { pageId } = await store.createPage('expertise-page', { deckId: (await store.snapshot()).id, mainKey: 'Frontend' });
  await signIn(a.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  await a.page.getByRole('heading', { name: 'Frontend', exact: true }).first().waitFor();

  // The module window groups Computer Science and Mathematics under Expertise, with its mark.
  const window = a.page.locator('.module-window');
  const expertise = window.locator('details').filter({ has: a.page.locator('summary', { hasText: 'Expertise' }) });
  await expertise.locator('summary').click();
  assert.deepEqual(await expertise.locator('.window-module').evaluateAll(nodes => nodes.map(node => node.dataset.type)), ['computer-science', 'mathematics']);
  assert.equal(await expertise.locator('summary .fam-icon path').count(), 3, 'the graduation cap');
  await a.page.getByRole('button', { name: 'Add Computer Science at the end', exact: true }).click();
  const card = componentArticle(a.page, 'Computer Science');
  await card.waitFor();
  assert.match(await card.getAttribute('class'), /fam-expertise/);

  // Generated: the key on the top line, no language, and the explanation in paragraphs.
  const component = (await store.page(pageId)).components.find(item => item.moduleType === 'computer-science');
  const { attemptIds: [attemptId] } = await store.generate('expertise-generate', { pageId, target: { scope: 'component', componentId: component.id }, session });
  await store.stage(attemptId, staged(formatContent('computer-science', { core: { relevance: 'subject', key: 'Frontend',
    explanation: ['The part of a program that people see and touch.', 'Think of a restaurant: the frontend is the dining room.'] }, facets: {} })));
  await store.publish('expertise-publish', { attemptId, session });
  await a.page.reload();
  await card.locator('.entry-core').waitFor();
  assert.equal(await card.locator('.entry-heading .entry-key').textContent(), 'Frontend');
  assert.equal(await card.locator('.entry-heading .entry-language').count(), 0, 'an Expertise core names no language');
  assert.deepEqual(await card.locator('.entry-core p').allTextContents(), ['The part of a program that people see and touch.', 'Think of a restaurant: the frontend is the dining room.']);
  const colours = await card.locator('.card-tab').first().evaluate(node => [getComputedStyle(node).backgroundColor, getComputedStyle(node).color]);
  assert.deepEqual(colours, ['rgb(70, 110, 18)', 'rgb(255, 255, 255)'], 'leaf green with a white label in the light theme');
  await a.page.screenshot({ path: 'artifacts/v0.8.0-expertise-card.png', fullPage: true });
});

test('0.12.0: a German verb’s Conjugation is a table on the card, its top line says Verb, and its own Edit edits the table as its source (D17)', { timeout: 45000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-grammar-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  const store = application.store;
  const session = { installationId: 'fixture', sessionId: 'grammar', epoch: 1 };
  await store.openSession('grammar-session', session);
  await useModules(store, ['german']);
  const { pageId } = await store.capture('grammar-capture', { session, mainKey: 'laufen', snapshot: await store.snapshot() });
  const german = (await store.page(pageId)).components.find(item => item.moduleType === 'german');
  const conjugation = { columns: ['Präsens', 'Präteritum', 'Perfekt'], rows: [
    { label: 'ich', cells: ['laufe', 'lief', 'bin gelaufen'] }, { label: 'du', cells: ['läufst', 'liefst', 'bist gelaufen'] }] };
  // A verb: Article and Declension would be dropped by the facet check, so the model's are left out here.
  await store.stage(german.attemptId, staged({ core: { kind: 'word', language: 'Deutsch', key: 'laufen', gramRole: 'verb', meanings: ['sich zu Fuß fortbewegen'] },
    facets: { examples: [{ sentence: 'Wir laufen.' }], conjugation } }));
  await store.publish('grammar-publish', { attemptId: german.attemptId, session });
  await signIn(a.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  const card = componentArticle(a.page, 'German');
  const facet = card.locator('.facet[data-facet="conjugation"]');
  await facet.locator('table').waitFor();

  assert.deepEqual(await card.locator('.entry-heading .entry-label').allTextContents(), ['Wort', 'Verb']);
  assert.deepEqual(await facet.locator('thead th').allTextContents(), ['', 'Präsens', 'Präteritum', 'Perfekt']);
  assert.deepEqual(await facet.locator('tbody tr').evaluateAll(rows => rows.map(row => [...row.cells].map(cell => cell.textContent))),
    [['ich', 'laufe', 'lief', 'bin gelaufen'], ['du', 'läufst', 'liefst', 'bist gelaufen']]);
  assert.equal(await facet.locator('tbody th[scope="row"]').count(), 2, 'each row is labelled by its person');
  await card.screenshot({ path: 'artifacts/v0.12.0-conjugation.png' });
  // A facet the verb rules out shows no note; its Retry stays, unavailable, on its heading (0.12.1; its tag has none since 0.13.2).
  const declension = card.locator('.facet[data-facet="declension"]');
  assert.equal(await card.locator('.facet-note[data-note="ruled-out"]').count(), 0);
  await declension.hover();
  assert.equal(await a.page.getByRole('button', { name: 'Retry Declension from German', exact: true }).isDisabled(), true);
  await card.screenshot({ path: 'artifacts/v0.12.1-retry-unavailable.png', animations: 'disabled' });
  assert.equal(await a.page.getByRole('button', { name: 'Retry Conjugation from German', exact: true }).isDisabled(), false, 'Conjugation applies');
  // Its About opens the facet's page, as its › in the facet window does (0.12.1; a page since 0.13.0).
  await a.page.getByRole('button', { name: 'About Conjugation from German', exact: true }).click();
  const conjugationAbout = a.page.getByRole('dialog', { name: 'Conjugation', exact: true });
  await conjugationAbout.waitFor();
  await a.page.screenshot({ path: 'artifacts/v0.12.1-facet-about.png', animations: 'disabled' });
  assert.equal(await conjugationAbout.locator('.about-applies').innerText(), 'Verbs');
  await a.page.keyboard.press('Escape');
  await conjugationAbout.waitFor({ state: 'detached' });

  // Its own Edit opens the table's source, a row a line; a change shows on the card after Save.
  await facet.hover();
  await a.page.getByRole('button', { name: 'Edit Conjugation from German', exact: true }).click();
  const source = card.getByRole('textbox', { name: 'Conjugation, German', exact: true });
  await source.waitFor();
  assert.equal(await source.evaluate(node => node.tagName), 'TEXTAREA');
  assert.match(await source.inputValue(), /^\|  \| Präsens \| Präteritum \| Perfekt \|\n\| --- \|/);
  await source.fill((await source.inputValue()).replace('läufst', 'rennst'));
  await facet.getByRole('button', { name: 'Save', exact: true }).click();
  await waitFor(async () => (await facet.locator('tbody tr').nth(1).locator('td').first().textContent()) === 'rennst', 'the edited table shows');
  const stored = (await store.page(pageId)).components.find(item => item.moduleType === 'german').content.blocks[0].facets.conjugation;
  assert.match(stored, /\| du \| rennst \| liefst \| bist gelaufen \|/);
});

test('0.12.0: a Formula renders with KaTeX, a broken one shows its LaTeX, and a Code example is highlighted and edited as its source (D17)', { timeout: 45000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-formula-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  const store = application.store;
  const session = { installationId: 'fixture', sessionId: 'formula', epoch: 1 };
  await store.openSession('formula-session', session);
  await useModules(store, ['mathematics', 'computer-science']);
  const { pageId } = await store.capture('formula-capture', { session, mainKey: 'eigenvalue', snapshot: await store.snapshot() });
  const [math, cs] = (await store.page(pageId)).components.filter(item => ['mathematics', 'computer-science'].includes(item.moduleType));
  await store.stage(math.attemptId, staged(formatContent('mathematics', { core: { relevance: 'subject', hasFormula: 'yes', key: 'eigenvalue', explanation: ['A stretch factor.'] },
    facets: { formula: { latex: 'A\\mathbf{v} = \\lambda \\mathbf{v}', symbols: [{ symbol: '\\lambda', meaning: 'the eigenvalue' }] } } })));
  await store.publish('formula-publish', { attemptId: math.attemptId, session });
  await store.stage(cs.attemptId, staged(formatContent('computer-science', { core: { relevance: 'subject', hasCode: 'yes', key: 'eigenvalue', explanation: ['Computed numerically.'] },
    facets: { code: { language: 'python', code: 'import numpy as np\n# the eigenvalues of a matrix\nvalues = np.linalg.eigvals([[2, 0], [0, 3]])' } } })));
  await store.publish('code-publish', { attemptId: cs.attemptId, session });
  await signIn(a.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);

  const formula = componentArticle(a.page, 'Mathematics').locator('.facet[data-facet="formula"]');
  await formula.locator('.md-math .katex-display').waitFor();
  assert.ok(await formula.locator('.md-math .katex-mathml math').count() === 1, 'KaTeX writes MathML for assistive technology');
  assert.equal(await formula.locator('li .md-math-inline .katex').count(), 1, 'the symbol is inline math');
  assert.match(await formula.locator('li').textContent(), /the eigenvalue/);
  const fonts = await a.page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter(font => font.family.includes('KaTeX') && font.status === 'loaded').length; });
  assert.ok(fonts > 0, 'KaTeX’s fonts load from the extension');

  const code = componentArticle(a.page, 'Computer Science').locator('.facet[data-facet="code"]');
  await code.locator('pre.md-code[data-language="python"] .hljs-keyword').first().waitFor();
  assert.equal(await code.locator('pre.md-code code').textContent(), 'import numpy as np\n# the eigenvalues of a matrix\nvalues = np.linalg.eigvals([[2, 0], [0, 3]])');
  assert.equal(await code.locator('.hljs-comment').textContent(), '# the eigenvalues of a matrix');
  await componentArticle(a.page, 'Mathematics').screenshot({ path: 'artifacts/v0.12.0-formula.png' });
  await componentArticle(a.page, 'Computer Science').screenshot({ path: 'artifacts/v0.12.0-code.png' });

  // A formula KaTeX cannot read shows its source; the Formula's own Edit edits it as source.
  await formula.hover();
  await a.page.getByRole('button', { name: 'Edit Formula from Mathematics', exact: true }).click();
  const source = componentArticle(a.page, 'Mathematics').getByRole('textbox', { name: 'Formula, Mathematics', exact: true });
  await source.waitFor();
  assert.equal(await source.evaluate(node => node.tagName), 'TEXTAREA');
  await source.fill((await source.inputValue()).replace('A\\mathbf{v} = \\lambda \\mathbf{v}', '\\frac{1}{'));
  await formula.getByRole('button', { name: 'Save', exact: true }).click();
  await formula.locator('pre.md-math-source').waitFor();
  assert.equal(await formula.locator('pre.md-math-source').textContent(), '\\frac{1}{');
});
