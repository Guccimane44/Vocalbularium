// Facet tags on a card and in deck settings.
import test, { createTestApplication } from '../helpers/database.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { staged } from '../helpers/pages.mjs';
import { BANK, componentArticle, cardButton, facetWindow, tick, launch, signIn, waitFor } from './helpers.mjs';

test('facet tags: abbreviations in order, on the left edge, along the edge to the bottom right when folded and back, flown in from the facet window, popped when deleted, and hung from the tab in deck settings', { timeout: 60000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-facet-tags-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await a.page.setViewportSize({ width: 1280, height: 1400 });
  const store = application.store;
  const session = { installationId: 'fixture', sessionId: 'facet-tags', epoch: 1 };
  await store.openSession('facet-tags-session', session);
  const { pageId } = await store.capture('facet-tags-capture', { session, mainKey: 'bank', snapshot: await store.snapshot() });
  const german = () => store.page(pageId).then(page => page.components.find(item => item.moduleType === 'german'));
  const first = await german();
  await store.stage(first.attemptId, staged(BANK));
  await store.publish('facet-tags-publish', { attemptId: first.attemptId, session });
  await signIn(a.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  const card = componentArticle(a.page, 'German');
  const tags = card.locator('.facet-tags');
  await card.locator('.facet').first().waitFor();
  // Every animation a tag starts, as its keyframes, recorded as it starts.
  await a.page.evaluate(() => {
    window.tagMotions = [];
    const original = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      if (this.classList?.contains('facet-tag')) window.tagMotions.push({ facet: this.dataset.facet, keyframes: keyframes.map(frame => frame.transform ?? null) });
      return original.call(this, keyframes, options);
    };
  });
  const motions = async facet => (await a.page.evaluate(() => window.tagMotions)).filter(each => each.facet === facet);
  // Every tag that pops, as it is rendered: a popping tag stands only TAG_POP_MS,
  // too short to wait for on a slow runner, so it is recorded as it appears.
  const watchPops = () => a.page.evaluate(() => {
    window.tagPops = [];
    const record = node => {
      if (node.nodeType !== 1) return;
      for (const tag of [node, ...node.querySelectorAll('.facet-tag')]) {
        if (tag.matches('.facet-tag[data-leaving]')) window.tagPops.push({ facet: tag.dataset.facet, animation: getComputedStyle(tag).animationName });
      }
    };
    new MutationObserver(records => records.forEach(each => each.type === 'attributes' ? record(each.target) : each.addedNodes.forEach(record)))
      .observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-leaving'] });
  });
  const popped = (facet, scope) => waitFor(async () => (await a.page.evaluate(() => window.tagPops))
    .some(each => each.facet === facet && each.animation === 'bop'), `${facet} popped in ${scope}`);
  // A move along the card's edge: from the start, every point keeps to one side or the other
  // (within the rounded turn) and the move ends in place.
  const points = motion => motion.keyframes.map(frame => frame.match(/^translate\((-?[\d.e-]+)px, (-?[\d.e-]+)px\)$/).slice(1).map(Number));
  const keepsTo = (motion, onFirstSide, onSecondSide) => {
    const path = points(motion);
    const [x0, y0] = path[0];
    return path.length > 3 && path.every(([x, y]) => onFirstSide(x, y, x0, y0) || onSecondSide(x, y, x0, y0)) && path.at(-1).every(value => Math.abs(value) < .5);
  };
  const settle = () => card.evaluate(node => Promise.all(node.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {}))));
  const geometry = () => card.evaluate(node => {
    const box = node.getBoundingClientRect();
    return [...node.querySelectorAll('.facet-tag:not([data-leaving])')].map(tag => {
      const rect = tag.getBoundingClientRect();
      return { left: rect.left - box.left, right: rect.right - box.left, top: rect.top - box.top, bottom: rect.bottom - box.top, width: box.width, height: box.height };
    });
  });

  // One tag per facet, marked with its abbreviation, in the parent's order, stuck out of the card's left edge.
  assert.equal(await tags.getAttribute('data-layout'), 'edge');
  assert.deepEqual(await tags.locator('.facet-tag-mark').allTextContents(), ['Ar', 'Ex', 'Sy', 'An']);
  const edge = await geometry();
  assert.ok(edge.every(tag => tag.right <= 2 && tag.right >= -2), `tags stand against the left edge (${JSON.stringify(edge)})`);
  assert.ok(edge.every((tag, index) => !index || tag.top > edge[index - 1].top), 'one under another, in order');
  await a.page.screenshot({ path: 'artifacts/v0.7.1-facet-tags-edge.png' });

  // Folded, the tags move down the left side and then along the bottom to its right.
  await (await cardButton(a.page, 'Fold German')).click();
  await waitFor(async () => await tags.getAttribute('data-layout') === 'folded', 'tags folded');
  const down = (await motions('article')).at(-1);
  assert.ok(keepsTo(down, (x, y, x0) => Math.abs(x - x0) <= 15, (x, y) => Math.abs(y) <= 15),
    `down the left side, round the corner, along the bottom (${down.keyframes})`);
  // The card folds only once its tags have travelled: the last one sets out 3 × 40ms after the first.
  assert.equal(await card.locator('.card-fold').evaluate(node => getComputedStyle(node).transitionDelay), '0.72s');
  // The card's padding and height fold with it rather than jumping (a row's own transitions once replaced them).
  const folds = (await card.evaluate(node => getComputedStyle(node).transitionProperty)).split(', ');
  assert.ok(['padding', 'margin', 'min-height'].every(property => folds.includes(property)), `the card's fold transitions stay (${folds})`);
  await settle();
  const bottom = await geometry();
  assert.ok(bottom.every(tag => tag.top >= tag.height - 8 && tag.top <= tag.height && tag.bottom > tag.height), `the tags hang from the folded card's bottom edge (${JSON.stringify(bottom)})`);
  assert.ok(bottom.every(tag => tag.right <= tag.width && tag.left > tag.width / 2), 'at its right');
  assert.ok(bottom.every((tag, index) => !index || tag.left > bottom[index - 1].left), 'in order, left to right');
  await a.page.screenshot({ path: 'artifacts/v0.7.1-facet-tags-folded.png' });

  // A folded card's tags are no buttons (0.7.4); unfolded, the tags go back the same way.
  assert.equal(await tags.getByRole('button', { name: /^Synonyms/ }).count(), 0);
  await (await cardButton(a.page, 'Unfold German')).click();
  // The card opens first, with the tags waiting on its bottom edge; then they travel back.
  assert.equal(await tags.getAttribute('data-layout'), 'folded', 'the tags wait while the card opens');
  await waitFor(async () => await tags.getAttribute('data-layout') === 'edge', 'tags back on the edge');
  const up = (await motions('article')).at(-1);
  assert.ok(keepsTo(up, (x, y, x0, y0) => Math.abs(y - y0) <= 15, x => Math.abs(x) <= 15),
    `along the bottom, round the corner, up the left side (${up.keyframes})`);
  const [, startY] = points(up)[0];
  assert.ok(startY > 100, `they set out from the opened card's bottom edge (${startY}px below their place)`);

  // A tag only shows its facet (0.13.2): nothing on it is a button.
  assert.equal(await tags.getByRole('button').count(), 0, 'no tag interaction');
  const antonymsTag = await card.locator('.facet-tag[data-facet="antonyms"]').boundingBox();
  await a.page.mouse.click(antonymsTag.x + antonymsTag.width / 2, antonymsTag.y + antonymsTag.height / 2);
  assert.equal(await card.locator('.facet-tag[data-pulled]').count(), 0, 'clicking a tag pulls nothing out');
  // A facet deleted from its section pops its tag.
  await a.page.getByRole('button', { name: 'Delete Antonyms from German', exact: true }).click();
  await watchPops();
  await a.page.getByRole('button', { name: 'Yes, delete Antonyms from German', exact: true }).click();
  await popped('antonyms', 'the card');
  await card.locator('.facet-tag[data-facet="antonyms"]').waitFor({ state: 'detached' });
  assert.deepEqual((await german()).facets, ['article', 'examples', 'synonyms']);

  // Ticked again in the facet window, the tag flies in from its row to its place in the parent's order (D13).
  const facets = await facetWindow(a.page, 'German');
  // Measured before the click, once its row is in view: the added facet then moves to On this card (D23).
  await tick(facets, 'Antonyms').scrollIntoViewIfNeeded();
  const origin = await facets.locator('.facet-window-row[data-facet="antonyms"] .facet-tab-mark').boundingBox();
  await tick(facets, 'Antonyms').click();
  await card.locator('.facet-tag[data-facet="antonyms"]').waitFor();
  const flight = (await motions('antonyms')).at(-1);
  assert.equal(flight.keyframes.length, 3, 'an arc from the row');
  const [, dx, dy] = flight.keyframes[0].match(/^translate\((-?[\d.]+)px, (-?[\d.]+)px/);
  const landed = await card.locator('.facet-tag[data-facet="antonyms"]').evaluate(node => { node.getAnimations().forEach(each => each.finish()); const box = node.getBoundingClientRect(); return { x: box.left + box.width / 2, y: box.top + box.height / 2 }; });
  assert.ok(Math.abs(landed.x + Number(dx) - (origin.x + origin.width / 2)) < 4 && Math.abs(landed.y + Number(dy) - (origin.y + origin.height / 2)) < 4,
    `it starts out at its row (${flight.keyframes[0]}; landed ${JSON.stringify(landed)}, row ${JSON.stringify(origin)})`);
  assert.deepEqual(await tags.locator('.facet-tag-mark').allTextContents(), ['Ar', 'Ex', 'Sy', 'An']);
  // Unticked in the facet window, a facet waiting for Retry goes at once.
  await tick(facets, 'Antonyms').click();
  await a.page.keyboard.press('Escape');
  await waitFor(async () => !(await german()).facets.includes('antonyms'), 'waiting Antonyms deleted without asking');

  // Under reduced motion the tags stand in their places without moving.
  await a.page.emulateMedia({ reducedMotion: 'reduce' });
  const before = (await a.page.evaluate(() => window.tagMotions)).length;
  await (await cardButton(a.page, 'Fold German')).click();
  await waitFor(async () => await tags.getAttribute('data-layout') === 'folded', 'tags folded at once');
  assert.equal((await a.page.evaluate(() => window.tagMotions)).length, before, 'no tag moved');
  await a.page.emulateMedia({ reducedMotion: 'no-preference' });

  // Deck settings: every module is a folded card that never unfolds, its facets hanging from the end of its bottom edge (0.13.2; hung below the tab on chains from 0.7.1).
  const deckId = (await store.page(pageId)).deckId;
  await a.page.goto(`chrome-extension://${a.id}/app.html#configure/${deckId}`);
  const row = a.page.locator('.deck-module[data-type="german"]');
  await row.locator('.facet-tag').first().waitFor();
  assert.deepEqual(await a.page.locator('.deck-module').evaluateAll(nodes => nodes.map(node => [node.dataset.type, node.hasAttribute('data-folded'), node.hasAttribute('data-empty')])),
    [['main-key', true, false], ['context', true, false], ['german', true, false]], 'every module folded, the main key too');
  assert.equal(await row.locator('.facet-tags').getAttribute('data-layout'), 'folded');
  const hung = await row.evaluate(node => {
    const band = node.getBoundingClientRect();
    return [...node.querySelectorAll('.facet-tag')].map(tag => { const box = tag.getBoundingClientRect(); return { below: box.top - band.bottom, end: band.right - box.right, chain: getComputedStyle(tag, '::after').opacity }; });
  });
  assert.ok(hung.every(tag => Math.abs(tag.below + 6) <= 2 && tag.chain === '0'), `from the band's bottom edge, without chains (${JSON.stringify(hung)})`);
  assert.ok(hung.at(-1).end > 10 && hung.at(-1).end < 30 && hung[0].end > hung.at(-1).end, `at its end, in order (${JSON.stringify(hung)})`);
  assert.ok((await row.boundingBox()).height < 30, 'a slim band');
  // Its tab ejects About, Facet and Remove: no Fold or Unfold.
  await row.locator('.tab-button').click();
  assert.deepEqual(await row.locator('.card-actions button').evaluateAll(buttons => buttons.map(button => button.textContent)), ['About', 'Facet', 'Remove']);
  await row.locator('.tab-button').click();
  await a.page.screenshot({ path: 'artifacts/v0.7.1-facet-tags-deck-settings.png', fullPage: true });
  // No tag is a button there either (0.13.2). Unticked in the facet window, a tag pops; ticked again, it flies in from its row.
  assert.equal(await row.locator('.facet-tags').getByRole('button').count(), 0, 'no tag interaction');
  // The six-dot menu opens over the tags hung below the tab, the card lifted under the pointer (0.13.2: it opened beneath them).
  await row.locator('.menu-button').click();
  await row.locator('.row-menu-list').waitFor();
  await row.locator('.card-tab').hover();
  await a.page.waitForTimeout(400);
  // Tags let the pointer through, so for the hit test they briefly take it.
  assert.deepEqual(await row.locator('.row-menu-list [role="menuitem"]').evaluateAll(items => {
    const hittable = document.head.appendChild(Object.assign(document.createElement('style'), { textContent: '.facet-tags, .facet-tag { pointer-events: auto !important; }' }));
    const onTop = items.map(item => {
      const box = item.getBoundingClientRect();
      return [12, 40, 70].every(x => Boolean(document.elementFromPoint(box.left + x, box.top + box.height / 2)?.closest('.row-menu-list')));
    });
    hittable.remove();
    return onTop;
  }), [true, true], 'every menu entry is on top');
  await a.page.keyboard.press('Escape');
  await row.locator('.row-menu-list').waitFor({ state: 'detached' });
  const remove = await facetWindow(a.page, 'German');
  await watchPops();
  await tick(remove, 'Antonyms').click();
  await a.page.keyboard.press('Escape');
  await popped('antonyms', 'deck settings');
  await row.locator('.facet-tag[data-facet="antonyms"]').waitFor({ state: 'detached' });
  await a.page.evaluate(() => {
    window.tagMotions = [];
    const original = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      if (this.classList?.contains('facet-tag')) window.tagMotions.push({ facet: this.dataset.facet, keyframes: keyframes.map(frame => frame.transform ?? null) });
      return original.call(this, keyframes, options);
    };
  });
  const deckFacets = await facetWindow(a.page, 'German');
  await tick(deckFacets, 'Antonyms').click();
  await row.locator('.facet-tag[data-facet="antonyms"]').waitFor();
  await a.page.keyboard.press('Escape');
  assert.equal((await motions('antonyms')).at(-1)?.keyframes.length, 3, 'flown in');
  assert.deepEqual(await row.locator('.facet-tag-mark').allTextContents(), ['Ar', 'Ex', 'Sy', 'An']);
  // The last tag pops too, and the tab no longer makes room; a facet added again still flies in.
  const untick = await facetWindow(a.page, 'German');
  await watchPops();
  for (const name of ['Article', 'Examples', 'Synonyms', 'Antonyms']) await tick(untick, name).click();
  await a.page.keyboard.press('Escape');
  await popped('antonyms', 'deck settings, the last tag');
  await row.locator('.facet-tag').first().waitFor({ state: 'detached' });
  assert.equal(await row.getAttribute('data-tagged'), null);
  await tick(await facetWindow(a.page, 'German'), 'Article').click();
  await row.locator('.facet-tag[data-facet="article"]').waitFor();
  assert.equal((await motions('article')).at(-1)?.keyframes.length, 3, 'flown in, not moved from where it stood before');
  // Scrolled since the list last drew, the first module added moves no other entry (0.13.2: each replayed from below by the scroll's length).
  await a.page.setViewportSize({ width: 1280, height: 420 });
  await a.page.evaluate(() => window.scrollTo(0, 0));
  await a.page.waitForTimeout(300);
  await a.page.evaluate(() => window.scrollTo(0, 160));
  await a.page.waitForTimeout(300);
  const moved = await a.page.evaluate(() => new Promise(done => {
    const entries = [...document.querySelectorAll('.shaping-list [data-row-id] > *')];
    document.querySelector('[aria-label="Add Text at the end"]').click();
    requestAnimationFrame(() => done(entries.filter(entry => entry.isConnected && entry.getAnimations().some(animation =>
      animation.effect?.getKeyframes?.().some(frame => /translateY\((?!0px)/.test(frame.transform ?? '')))).length));
  }));
  assert.equal(moved, 0, 'no entry replays from below');
  await a.page.setViewportSize({ width: 1280, height: 1400 });
});
