// A facet’s own Retry, tag removal and hung tags (0.7.3).
import test, { createTestApplication } from '../helpers/database.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import { wordResult, staged } from '../helpers/pages.mjs';
import { componentArticle, launch, signIn, waitFor } from './helpers.mjs';

test('0.7.3: a facet’s own Retry beside its Delete, a tag’s remove keeping its colours, and hung tags lifting with their tab', { timeout: 60000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-facet-retry-browser-'));
  const calls = [];
  let release;
  const application = await createTestApplication(t, { provider: {
    generate: request => { calls.push(request); return new Promise(resolve => { release = resolve; }); }
  } });
  await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await a.page.setViewportSize({ width: 1280, height: 1400 });
  const store = application.store;
  const session = { installationId: 'fixture', sessionId: 'facet-retry', epoch: 1 };
  await store.openSession('facet-retry-session', session);
  const { pageId } = await store.capture('facet-retry-capture', { session, mainKey: 'bank', snapshot: await store.snapshot() });
  const first = (await store.page(pageId)).components.find(item => item.moduleType === 'german');
  // Structured content (D09).
  // A noun (D17): Article applies, so its own Retry asks the provider.
  const core = { kind: 'word', language: 'Englisch', key: 'bank', gramRole: 'noun', meanings: ['Ufer'] };
  await store.stage(first.attemptId, staged({ core, facets: { article: { singular: 'das Ufer', plural: 'die Ufer' },
    examples: [{ sentence: 'We sat on the bank.', translation: 'Wir saßen am Ufer.' }] } }));
  await store.publish('facet-retry-publish', { attemptId: first.attemptId, session });
  // A second German, empty, with a facet: only its tab, its tag hung below.
  const { componentId: empty } = await store.addModule('facet-retry-empty', { pageId, type: 'german' });
  await store.addFacet('facet-retry-empty-facet', { pageId, componentId: empty, parent: 'german', facet: 'synonyms' });
  await signIn(a.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  const card = componentArticle(a.page, 'German 1');
  const examples = card.locator('.facet[data-facet="examples"]');
  await examples.waitFor();

  // Retry sits beside Delete; with content it asks in the row, in the family colour.
  await examples.hover();
  const retry = a.page.getByRole('button', { name: 'Retry Examples from German 1', exact: true });
  assert.deepEqual(await examples.locator('.facet-actions button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label'))),
    ['About Examples from German 1', 'Edit Examples from German 1', 'Retry Examples from German 1', 'Delete Examples from German 1']);
  // Asking, the question stands left of its buttons and Cancel lands under the pointer (0.7.3).
  const underPointer = async (button, confirm) => {
    const box = await button.boundingBox();
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await a.page.mouse.move(at.x, at.y); await a.page.mouse.down(); await a.page.mouse.up();
    const row = examples.locator('.facet-confirm');
    assert.equal(await row.getAttribute('data-confirm'), confirm);
    assert.deepEqual(await row.locator(':scope > *').evaluateAll(parts => parts.map(part => part.getAttribute('aria-label') ?? part.textContent)),
      ['Are you sure?', `Yes, ${confirm} Examples from German 1`, 'Keep Examples from German 1']);
    await settleIn(row);
    assert.equal(await a.page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('button')?.getAttribute('aria-label'), at),
      'Keep Examples from German 1', `Cancel is under the pointer after ${confirm}`);
    assert.equal(await a.page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Keep Examples from German 1');
  };
  const settleIn = locator => locator.evaluate(node => Promise.all(node.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {}))));
  await underPointer(a.page.getByRole('button', { name: 'Delete Examples from German 1', exact: true }), 'delete');
  await a.page.getByRole('button', { name: 'Keep Examples from German 1', exact: true }).click();
  await examples.hover();
  await underPointer(retry, 'retry');
  await examples.locator('.facet-confirm').screenshot({ path: 'artifacts/v0.7.3-facet-confirm.png' });
  await a.page.getByRole('button', { name: 'Yes, retry Examples from German 1', exact: true }).click();

  // While it regenerates the card stays open with the rest of its content.
  // The spark runs round the facet's tab (0.7.4), the only sign that it generates.
  await examples.locator('.facet-tab .spark:not([data-ending])').waitFor();
  assert.equal(await examples.locator('.facet-body').evaluate(node => getComputedStyle(node).animationName), 'none', 'its content no longer fades');
  assert.equal(await card.locator('.facet-tag[data-facet="examples"] .facet-tag-open').evaluate(node => getComputedStyle(node).animationName), 'none', 'nor its tag breathes');
  assert.equal(await card.getAttribute('data-generating'), null, 'not folded down to its tab');
  assert.match(await card.locator('.facet[data-facet="article"]').textContent(), /das Ufer · die Ufer/);
  assert.match(await examples.textContent(), /We sat on the bank\./);
  await waitFor(() => release, 'facet provider started');
  assert.deepEqual(calls.map(call => [call.facets, call.core]), [[['examples'], core]], 'the provider writes the facet alone for the core');
  release({ facets: { examples: [{ sentence: 'The bank was steep.', translation: 'Das Ufer war steil.' }] } });
  await waitFor(async () => /The bank was steep\./.test(await examples.textContent()), 'new examples shown');
  // The main key is a stored highlight in what was generated (D10, amended a fourth time):
  // the editor shows it, and removing it there removes it from the card.
  assert.equal(await examples.locator('.facet-body mark.md-highlight').textContent(), 'bank');
  await examples.hover();
  await a.page.getByRole('button', { name: 'Edit Examples from German 1', exact: true }).click();
  const exampleText = card.getByRole('textbox', { name: 'Examples, German 1', exact: true });
  await exampleText.waitFor();
  assert.equal(await exampleText.locator('mark').textContent(), 'bank', 'the editor shows the main key’s highlight');
  await exampleText.locator('mark').dblclick(); await a.page.waitForTimeout(300);
  await examples.locator('.md-toolbar [data-tool="highlight"]').click();
  assert.equal(await exampleText.locator('mark').count(), 0);
  await examples.getByRole('button', { name: 'Save', exact: true }).click();
  await card.getByRole('textbox').waitFor({ state: 'detached' });
  assert.equal(await examples.locator('.facet-body mark').count(), 0, 'and it stays removed on the card');
  assert.match(await examples.textContent(), /The bank was steep\./);
  assert.match(await card.locator('.facet[data-facet="article"]').textContent(), /das Ufer · die Ufer/, 'the other facet stays');
  assert.equal(await examples.locator('.facet-note').count(), 0);
  await a.page.screenshot({ path: 'artifacts/v0.7.3-facet-retry.png' });

  // Hovering an empty card lifts its tab and what hangs below it together.
  const hung = componentArticle(a.page, 'German 2');
  await a.page.mouse.move(5, 5);
  await a.page.waitForTimeout(400);
  const place = () => hung.evaluate(node => ({ tab: node.querySelector('.card-tab').getBoundingClientRect().top,
    tags: node.querySelector('.facet-tags').getBoundingClientRect().top }));
  const rest = await place();
  await hung.locator('.card-tab').hover();
  await a.page.waitForTimeout(400);
  const lifted = await place();
  assert.ok(Math.abs((rest.tab - lifted.tab) - 2) < .5, `the tab lifts (${rest.tab} → ${lifted.tab})`);
  assert.ok(Math.abs((rest.tags - lifted.tags) - (rest.tab - lifted.tab)) < .5, `the hung tags lift with it (${rest.tags} → ${lifted.tags})`);

  // A facet with nothing in it wears a blander tag; one with content does not.
  const unfilled = holder => holder.locator('.facet-tag').evaluateAll(tags => tags.map(tag => [tag.dataset.facet, tag.hasAttribute('data-unfilled')]));
  assert.deepEqual(await unfilled(card), [['article', false], ['examples', false], ['synonyms', true], ['antonyms', true]]);
  assert.deepEqual(await unfilled(hung), [['synonyms', true]]);
  assert.match(await card.locator('.facet-tag[data-facet="synonyms"]').evaluate(tag => getComputedStyle(tag, '::before').filter), /saturate\(0\.3\)/);
  assert.doesNotMatch(await card.locator('.facet-tag[data-facet="article"]').evaluate(tag => getComputedStyle(tag, '::before').filter), /saturate/);
  // No tag is a button, hung or on an open card's edge (0.13.2; on the edge one pulled out to its Retry from 0.7.4).
  assert.equal(await hung.getByRole('img', { name: 'Synonyms, empty', exact: true }).count(), 1);
  const synonymsTag = card.locator('.facet-tag[data-facet="synonyms"]');
  assert.equal(await card.getByRole('img', { name: 'Synonyms, empty', exact: true }).count(), 1);
  assert.equal(await card.locator('.facet-tags').getByRole('button').count(), 0, 'no tag interaction on the card');
  assert.equal(await hung.locator('.facet-tags').getByRole('button').count(), 0, 'nor below an empty card');
  const tucked = await synonymsTag.boundingBox();
  await a.page.mouse.click(tucked.x + tucked.width / 2, tucked.y + tucked.height / 2);
  await a.page.waitForTimeout(300);
  assert.deepEqual(await synonymsTag.boundingBox(), tucked, 'clicking a tag moves nothing');
  // An empty facet's own Retry, beside its heading, asks nothing: the facet generates at once, its tag breathing.
  await card.locator('.facet[data-facet="synonyms"]').hover();
  await card.getByRole('button', { name: 'Retry Synonyms from German 1', exact: true }).click();
  assert.equal(await card.locator('.facet-confirm').count(), 0, 'no "Are you sure?"');
  await waitFor(async () => await synonymsTag.getAttribute('data-retrying') !== null, 'Synonyms generating');
  // Generating, the empty facet's section stands in its place, its heading only, the spark round its tab (0.7.4).
  const synonyms = card.locator('.facet[data-facet="synonyms"]');
  await synonyms.locator('.facet-tab .spark').waitFor();
  assert.notEqual(await synonyms.getAttribute('data-pending'), null);
  assert.equal(await synonyms.locator('.facet-body').count(), 0);
  assert.deepEqual(await card.locator('.facet').evaluateAll(sections => sections.map(each => each.dataset.facet)), ['article', 'examples', 'synonyms', 'antonyms']);
  await card.screenshot({ path: 'artifacts/v0.7.4-facet-generating.png' });
  await waitFor(() => calls.length === 2, 'facet provider started again');
  assert.deepEqual(calls[1].facets, ['synonyms']);
  release({ facets: { synonyms: ['Böschung'] } });
  await synonyms.locator('.facet-body').waitFor();
  assert.equal(await synonyms.getAttribute('data-pending'), null, 'the block stays, with its content');
  assert.deepEqual(await card.locator('.facet').evaluateAll(sections => sections.map(each => each.dataset.facet)), ['article', 'examples', 'synonyms', 'antonyms'],
    'in its place in the parent’s order');
  assert.equal(await synonymsTag.getAttribute('data-unfilled'), null);
  assert.equal(await synonymsTag.getAttribute('data-retrying'), null);
  // A facet with content asks first, in its row.
  await card.locator('.facet[data-facet="article"]').hover();
  await card.getByRole('button', { name: 'Retry Article from German 1', exact: true }).click();
  await card.getByRole('button', { name: 'Yes, retry Article from German 1', exact: true }).click();
  await waitFor(() => calls.length === 3, 'the Article regenerates at once');
  release({ facets: { article: { singular: 'das Ufer', plural: 'die Ufer' } } });
  await waitFor(async () => await card.locator('.facet-tag[data-facet="article"]').getAttribute('data-retrying') === null, 'Article done');
  // An empty facet that comes back empty: its section shows while it generates, then goes again.
  await card.locator('.facet[data-facet="antonyms"]').hover();
  await card.getByRole('button', { name: 'Retry Antonyms from German 1', exact: true }).click();
  await card.locator('.facet[data-facet="antonyms"][data-pending]').waitFor();
  await waitFor(() => calls.length === 4, 'Antonyms requested');
  release({ facets: {} });
  // An empty result leaves its heading, dimmed, with no text (D10, amended a sixth time).
  await waitFor(async () => await card.locator('.facet[data-facet="antonyms"]').getAttribute('data-pending') === null, 'Antonyms done');
  assert.equal(await card.locator('.facet[data-facet="antonyms"] .facet-body').count(), 0);
  assert.notEqual(await card.locator('.facet-tag[data-facet="antonyms"]').getAttribute('data-unfilled'), null, 'its tag stays bland');
  await card.screenshot({ path: 'artifacts/v0.7.4-facet-tabs.png' });

  // The module window fits the viewport; below its search, the list scrolls on its own.
  await a.page.setViewportSize({ width: 1280, height: 520 });
  const moduleWindow = a.page.locator('.module-window');
  const list = moduleWindow.locator('.window-scroll');
  // Scrolled down, the sticky window stands wholly in the viewport.
  await a.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await waitFor(async () => { const box = await moduleWindow.boundingBox(); return box.y >= -1 && box.y + box.height <= 521; }, 'the window wholly in view');
  const windowBox = await moduleWindow.boundingBox();
  assert.ok(windowBox.height <= 520 - 48 + 1, `the window fits the viewport (${windowBox.height}px)`);
  assert.ok(await list.evaluate(node => node.scrollHeight > node.clientHeight + 20), 'the list overflows and scrolls');
  const searchAt = (await moduleWindow.locator('.window-search').boundingBox()).y;
  const pageAt = await a.page.evaluate(() => window.scrollY);
  const listBox = await list.boundingBox();
  await a.page.mouse.move(listBox.x + listBox.width / 2, listBox.y + listBox.height / 2);
  await a.page.mouse.wheel(0, 2000);
  await waitFor(() => list.evaluate(node => node.scrollTop + node.clientHeight >= node.scrollHeight - 1), 'list scrolled to its end');
  assert.equal((await moduleWindow.locator('.window-search').boundingBox()).y, searchAt, 'the heading and search stay put');
  assert.equal(await a.page.evaluate(() => window.scrollY), pageAt, 'the page does not scroll with it');
  await list.evaluate(node => { node.scrollTop = 120; });
  await moduleWindow.screenshot({ path: 'artifacts/v0.7.3-module-window-scroll.png' });
  await list.evaluate(node => { node.scrollTop = 0; });
  await a.page.setViewportSize({ width: 1280, height: 1400 });

  // Generating, a card's hung tags stay beneath its tab, so the rail does not cover the spark.
  await hung.locator('.tab-button').click();
  await a.page.getByRole('button', { name: 'Retry German 2', exact: true }).click();
  await waitFor(async () => await hung.getAttribute('data-generating') !== null, 'German 2 generating');
  await hung.locator('.spark').waitFor();
  const layers = await hung.evaluate(node => [getComputedStyle(node.querySelector('.card-tab')).zIndex, getComputedStyle(node.querySelector('.facet-tags')).zIndex]);
  assert.ok(Number(layers[0]) > Number(layers[1]), `the tab, with its spark, above the hung tags (${layers})`);
  const box = await hung.locator('.card-tab').boundingBox();
  assert.equal(await a.page.evaluate(({ x, y }) => document.elementsFromPoint(x, y).find(node => node.matches('.spark i, .facet-tags, .card-tab'))?.className,
    { x: box.x + 30, y: box.y + box.height - 1 }), 'card-tab', 'at the tab\'s bottom edge the tab is uppermost, not the rail');
  await hung.locator('.card-tab').screenshot({ path: 'artifacts/v0.7.3-spark-over-rail.png' });
  release(wordResult(['Ufer'], { synonyms: ['Böschung'] }, { key: 'bank' }));
  await waitFor(async () => await hung.getAttribute('data-generating') === null, 'German 2 generated');
});
