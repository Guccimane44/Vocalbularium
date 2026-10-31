// The module window: dragging modules onto a page and into deck settings.
import test, { createTestApplication } from '../helpers/database.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { text } from '../helpers/pages.mjs';
import { cardTab, launch, signIn, waitFor, steps, windowModule, openFamily, drag } from './helpers.mjs';

test('module window: drag modules onto a page and into deck settings, and reorder by drag and keyboard', { timeout: 45000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-shaping-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  // Tall enough that both the module window, with the Translation family's facets open, and its drop targets are on screen at once.
  await a.page.setViewportSize({ width: 1280, height: 1700 });
  const store = application.store;
  const session = { installationId: 'fixture', sessionId: 'shaping', epoch: 1 };
  await store.openSession('shaping-session', session);
  const { pageId } = await store.capture('shaping-capture', { session, mainKey: '幸福', context: 'Wir sind 幸福.', snapshot: await store.snapshot() });
  const types = async () => (await store.page(pageId)).components.map(item => item.moduleType);
  const card = name => a.page.locator('article.component').filter({ has: a.page.getByRole('heading', { name, exact: true }) });
  await signIn(a.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  await card('Context').waitFor();

  // Dragged over the page and back onto the window, a module is put back, not added.
  const textModule = await windowModule(a.page, 'text').boundingBox();
  const contextCard = await card('Context').boundingBox();
  await a.page.mouse.move(textModule.x + textModule.width / 2, textModule.y + textModule.height / 2);
  await a.page.mouse.down();
  await a.page.mouse.move(contextCard.x + contextCard.width / 2, contextCard.y + contextCard.height / 4, { steps: 10 });
  // Over the page it drags as a card does (0.6.3): the module itself, as the card it will become,
  // keeps to the card column while a gap opens where it would land and the cards make room.
  const landingCard = a.page.locator('.landing-row .component[data-landing][data-type="text"]');
  const moving = a.page.locator('.drag-preview .component[data-landing][data-type="text"]');
  await landingCard.waitFor({ state: 'attached' });
  await moving.waitFor();
  assert.equal(await landingCard.isVisible(), false, 'the gap is empty');
  assert.deepEqual(await a.page.locator('.shaping-list [data-row-id]').evaluateAll(rows => rows.map(row => row.dataset.rowId === 'landing' ? 'landing' : 'card')),
    ['landing', 'card', 'card'], 'the gap opens before Context');
  const columnLeft = async locator => Math.round((await locator.locator('.card-tab').boundingBox()).x);
  assert.ok(Math.abs(await columnLeft(moving) - await columnLeft(card('Context'))) <= 6, 'the module keeps to the card column (tilted as a dragged card)');
  await waitFor(async () => (await card('Context').boundingBox()).y > contextCard.y + 20, 'Context makes room');
  await a.page.locator('.shaping-list').screenshot({ path: 'artifacts/v0.6.3-drag-in.png' });
  await a.page.mouse.move(textModule.x + textModule.width / 2, textModule.y + textModule.height / 2, { steps: 10 });
  await a.page.locator('.module-window[data-over]').waitFor();
  assert.equal(await landingCard.count(), 0, 'no gap over the window');
  await moving.waitFor();
  await a.page.mouse.up();
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.deepEqual(await types(), ['main-key', 'context', 'german'], 'a module dropped back on the window is not added');
  assert.equal(await a.page.locator('.landing-row').count(), 0);

  // Drag Text from the window onto the upper half of the Context card: it lands before it. From the
  // drop until the card arrives, it stays one element in one place, built like the card (0.6.3).
  await openFamily(windowModule(a.page, 'text'));
  const source = await windowModule(a.page, 'text').boundingBox();
  await a.page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await a.page.mouse.down();
  await a.page.mouse.move(source.x + source.width / 2 + 10, source.y + source.height / 2 + 10, { steps: 4 });
  const target = await card('Context').boundingBox();
  await a.page.mouse.move(target.x + target.width / 2, target.y + target.height / 4, { steps: 10 });
  await landingCard.waitFor({ state: 'attached' });
  // While dragged, the module is marked in the window and the dragged card carries a focus ring (0.6.3).
  assert.equal(await a.page.locator('.window-module[data-type="text"]').getAttribute('data-dragging'), 'true');
  assert.equal(await moving.locator('.card-tab').evaluate(node => getComputedStyle(node).outlineStyle), 'solid', 'the dragged card is marked');
  await a.page.locator('.shaping-list').evaluate(list => Promise.all(list.getAnimations({ subtree: true })
    .filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))));
  await a.page.evaluate(() => { window.incoming = document.querySelector('.landing-row'); });
  await a.page.mouse.up();
  assert.equal(await a.page.evaluate(() => document.querySelector('.landing-row[data-saving]') === window.incoming), true, 'the dropped module fills its gap');
  // It glides into the gap, then stays there until the card arrives in the same place.
  await a.page.evaluate(() => new Promise(resolve => setTimeout(resolve, 320))).then(() => a.page.evaluate(() => {
    window.track = [];
    const sample = () => {
      const node = document.querySelector('.shaping-list article.component[data-type="text"] .card-tab');
      if (node) window.track.push(Math.round(node.getBoundingClientRect().y));
      if (window.track.length < 200) requestAnimationFrame(sample);
    };
    sample();
  }));
  await waitFor(async () => (await types()).includes('text'), 'Text dragged onto the page');
  await card('Text').waitFor();
  await waitFor(() => a.page.evaluate(() => window.track.length >= 200), 'arrival tracked', 8000);
  const track = await a.page.evaluate(() => window.track);
  assert.ok(Math.max(...track) - Math.min(...track) <= 3, `the module stays in place from drop to arrival (${Math.min(...track)}–${Math.max(...track)})`);
  assert.deepEqual(await types(), ['main-key', 'text', 'context', 'german']);
  assert.deepEqual((await store.deck((await store.page(pageId)).deckId)).modules.map(module => module.type),
    ['main-key', 'context', 'german'], 'the deck is unchanged');

  // Reorder by dragging a handle to the end. The server's move response is held:
  // the new order must show at once and never snap back while it is saved (D04).
  await card('Text').waitFor();
  const handler = application.server.listeners('request')[0];
  application.server.removeListener('request', handler);
  let holdMoves = true; const heldMoves = [];
  application.server.on('request', (request, response) => {
    if (holdMoves && request.url === '/api/page/components/move') { heldMoves.push(() => handler(request, response)); return; }
    handler(request, response);
  });
  const headings = async () => ['Main key', ...await a.page.locator('.shaping-list article.component h2').allTextContents()];
  // Over the end zone the card moves only up and down, and the others make room as for the last place (0.6.3).
  const rowOf = heading => a.page.locator('.sortable-row').filter({ has: a.page.getByRole('heading', { name: heading, exact: true }) });
  // Wait for the cards to finish sliding into place after the add before aiming at one.
  await a.page.locator('.shaping-list').evaluate(list => Promise.all(list.getAnimations({ subtree: true })
    .filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))));
  const from = await cardTab(a.page, 'Text').boundingBox(), end = await a.page.locator('.drop-end').boundingBox();
  await a.page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await a.page.mouse.down();
  await a.page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 4 });
  await a.page.mouse.move(end.x + end.width / 2 + 120, end.y + end.height / 2, { steps: 12 });
  const shiftOf = heading => rowOf(heading).evaluate(node => new DOMMatrix(getComputedStyle(node).transform).m42);
  await waitFor(async () => await shiftOf('German') < -20 && await shiftOf('Context') < -20, 'every card after it makes room');
  assert.equal(await rowOf('Text').evaluate(node => new DOMMatrix(getComputedStyle(node).transform).m41), 0, 'the card stays in its column');
  // Every frame after the drop, each card only moves on toward its place, never back (no flicker).
  await a.page.evaluate(() => {
    window.settling = [];
    const sample = () => {
      window.settling.push(Object.fromEntries([...document.querySelectorAll('.shaping-list .sortable-row')]
        .map(row => [row.querySelector('h2')?.textContent, row.firstElementChild.getBoundingClientRect().y])));
      if (window.settling.length < 45) requestAnimationFrame(sample);
    };
    sample();
  });
  await a.page.mouse.up();
  await waitFor(() => a.page.evaluate(() => window.settling.length >= 45), 'drop settled');
  const settling = await a.page.evaluate(() => window.settling);
  for (const heading of ['Context', 'German', 'Text']) {
    const steps = settling.map(frame => frame[heading]).filter(y => y !== undefined).map((y, index, all) => index ? y - all[index - 1] : 0);
    assert.ok(!(steps.some(step => step > 2) && steps.some(step => step < -2)), `${heading} settles without jumping back (${steps.map(Math.round)})`);
  }
  await waitFor(() => heldMoves.length === 1, 'move request reached the server');
  for (let sample = 0; sample < 5; sample++) {
    assert.deepEqual(await headings(), ['Main key', 'Context', 'German', 'Text'], 'the new order shows before the save finishes');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.deepEqual(await types(), ['main-key', 'text', 'context', 'german'], 'the move is still held');
  holdMoves = false; heldMoves.shift()();
  await waitFor(async () => (await types()).at(-1) === 'text', 'Text dragged to the end');
  assert.deepEqual(await types(), ['main-key', 'context', 'german', 'text']);
  assert.deepEqual(await headings(), ['Main key', 'Context', 'German', 'Text']);

  // Keyboard reorder: Space picks the card up by its tab, the arrows move it, Space drops it.
  await cardTab(a.page, 'Text').focus();
  const announced = text => a.page.locator('[id^="DndLiveRegion"]').filter({ hasText: text }).waitFor({ state: 'attached' });
  await a.page.keyboard.press('Space');
  await announced('Text is over position 4.');
  // The sensor needs a moment after pickup before it moves.
  await new Promise(resolve => setTimeout(resolve, 300));
  await a.page.keyboard.press('ArrowUp');
  await announced('Text is over position 3.');
  await a.page.keyboard.press('ArrowUp');
  await announced('Text is over position 2.');
  await a.page.keyboard.press('Space');
  await waitFor(async () => (await types())[1] === 'text', 'Text moved up from the keyboard');
  assert.deepEqual(await types(), ['main-key', 'text', 'context', 'german']);
  await announced('Text was dropped.');
  assert.equal(await a.page.locator('.card-actions').count(), 0, 'Space drags; it never ejects the actions');

  // Keyboard add from the window: Space picks a module up, the arrows step through
  // the landing places (the end zone is last), Space drops it.
  await openFamily(windowModule(a.page, 'text'));
  await windowModule(a.page, 'text').focus();
  await a.page.keyboard.press('Space');
  await announced('Text is over');
  await new Promise(resolve => setTimeout(resolve, 300));
  for (let step = 0; step < 6; step++) await a.page.keyboard.press('ArrowDown');
  await announced('Text is over the end.');
  await openFamily(windowModule(a.page, 'chinese'));
  await a.page.keyboard.press('Space');
  // The window's + adds a module as the last component, without dragging (0.6.3), even when
  // pressed right after another add: the server appends it after whatever the page holds.
  await a.page.locator('.window-module[data-type="chinese"]').getByRole('button', { name: 'Add Chinese at the end', exact: true }).click();
  await waitFor(async () => (await types()).length === 6, 'Text and Chinese added');
  assert.deepEqual(await types(), ['main-key', 'text', 'context', 'german', 'text', 'chinese']);
  await card('Chinese').waitFor();

  // Deck settings take a dragged module too, and the main key stays first.
  const deckId = (await store.page(pageId)).deckId;
  await a.page.goto(`chrome-extension://${a.id}/app.html#configure/${deckId}`);
  // Wait for the configuration itself, not only the page shell, before dragging.
  await a.page.locator('.deck-module[data-type="german"]').waitFor();
  await drag(a.page, windowModule(a.page, 'chinese'), a.page.locator('.drop-end'));
  await a.page.locator('.deck-module').filter({ hasText: 'Chinese' }).waitFor();
  // The + works in deck settings too: the module goes last in the list.
  await openFamily(windowModule(a.page, 'chinese'));
  await a.page.locator('.window-module[data-type="chinese"]').getByRole('button', { name: 'Add Chinese at the end', exact: true }).click();
  await waitFor(async () => await a.page.locator('.shaping-list .deck-module').last().getAttribute('data-type') === 'chinese', 'Chinese added last');
  await a.page.getByRole('button', { name: 'Save', exact: true }).click();
  await a.page.getByRole('heading', { name: 'Your decks', exact: true }).waitFor();
  assert.deepEqual((await store.deck(deckId)).modules.map(module => module.type), ['main-key', 'context', 'german', 'chinese', 'chinese']);
  assert.deepEqual(await types(), ['main-key', 'text', 'context', 'german', 'text', 'chinese'], 'the page keeps its own modules');
});
