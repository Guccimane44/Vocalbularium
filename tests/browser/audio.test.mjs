// Pronunciation: the Sound card and the German facet (D24).
import test, { createTestApplication } from '../helpers/database.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatContent } from '@vocabularium/domain/content';
import { text, useModules, staged } from '../helpers/pages.mjs';
import { componentArticle, cardTab, cardButton, launch, chooseAppearance, signIn, waitFor } from './helpers.mjs';

// A second of silence as WAV, so the browser can really play a clip (D24).
function silentWav(seconds = 1, rate = 8000) {
  const samples = seconds * rate, bytes = Buffer.alloc(44 + samples);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(36 + samples, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate, 28);
  bytes.writeUInt16LE(1, 32); bytes.writeUInt16LE(8, 34); bytes.write('data', 36); bytes.writeUInt32LE(samples, 40);
  bytes.fill(128, 44);
  return bytes;
}

test('0.14.0: a Pronunciation card in Sound speaks the main key: generating, failed and its Retry, playing, and a language it cannot speak (D24)', { timeout: 60000 }, async (t) => {
  const { FakeSpeechProvider } = await import('../helpers/speech.mjs');
  class WavSpeech extends FakeSpeechProvider {
    bitRate = 64000;
    async send(request, signal, reply) { await super.send(request, signal, reply); reply.mime = 'audio/wav'; reply.bytes = silentWav(); }
  }
  const speech = new WavSpeech({ fail: { Gift: 'provider_refused' } });
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-pronunciation-browser-'));
  const application = await createTestApplication(t, { speechProvider: speech }); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await a.page.setViewportSize({ width: 1280, height: 1000 });
  const { store, audio } = application;
  const session = { installationId: 'fixture', sessionId: 'pronunciation', epoch: 1 };
  await store.openSession('pronunciation-session', session);
  const deckId = (await store.snapshot()).id;
  const { pageId } = await store.createPage('pronunciation-page', { deckId, mainKey: 'Gift' });
  await signIn(a.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  await a.page.getByRole('heading', { name: 'Gift', exact: true }).first().waitFor();

  // Sound in the module window, with its one module.
  const sound = a.page.locator('.module-window details').filter({ has: a.page.locator('summary', { hasText: 'Sound' }) });
  await sound.locator('summary').click();
  assert.deepEqual(await sound.locator('.window-module').evaluateAll(nodes => nodes.map(node => node.dataset.type)), ['pronunciation']);
  await a.page.getByRole('button', { name: 'Add Pronunciation at the end', exact: true }).click();
  const card = componentArticle(a.page, 'Pronunciation');
  await card.waitFor();
  assert.match(await card.getAttribute('class'), /fam-sound/);

  // Generated and published: the language named in English, the key, and its clip.
  const publish = async (id, language, key) => {
    const component = (await store.page(id)).components.find(item => item.moduleType === 'pronunciation');
    const { attemptIds: [attemptId] } = await store.generate(`generate-${id}`, { pageId: id, target: { scope: 'component', componentId: component.id }, session });
    await store.stage(attemptId, staged(formatContent('pronunciation', { core: { language, key }, facets: {} })));
    const result = await store.publish(`publish-${id}`, { attemptId, session });
    const page = await store.page(id);
    await audio.afterPublish({ pageId: id, componentId: component.id, moduleType: 'pronunciation',
      content: page.components.find(item => item.id === component.id).content, mainKey: key, state: result.state });
  };
  await publish(pageId, 'de', 'Gift');
  await a.page.reload();
  const player = card.locator('.clip-player');
  await card.locator('.clip-player[data-state="failed"]').waitFor();
  assert.equal(await card.locator('.entry-heading .entry-language').textContent(), 'German');
  assert.equal(await card.locator('.entry-heading .entry-key').textContent(), 'Gift');
  assert.equal(await player.locator('.clip-note').textContent(), 'The speech service could not speak this.');
  const heights = [Math.round((await player.boundingBox()).height)];
  const shot = async name => a.page.screenshot({ path: `artifacts/v0.14.0-pronunciation-${name}.png`,
    clip: await card.boundingBox().then(box => ({ x: box.x - 20, y: box.y - 30, width: box.width + 40, height: box.height + 50 })) });
  await shot('failed');

  // A spoken card has no text to edit and no facets: its actions are Retry, About, Fold and Delete.
  await cardTab(a.page, 'Pronunciation').click();
  const actions = await a.page.locator(`#actions-${await card.getAttribute('data-component-id')} button`).allTextContents();
  assert.deepEqual(actions, ['Retry', 'About', 'Fold', 'Delete']);
  await a.page.keyboard.press('Escape');

  // The clip's own Retry speaks it again; the card's text stays.
  delete speech.fail.Gift;
  await a.page.getByRole('button', { name: 'Speak Gift again', exact: true }).click();
  await card.locator('.clip-player[data-state="ready"]').waitFor();
  assert.equal(await player.locator('.clip-time').textContent(), '0:01');
  heights.push(Math.round((await player.boundingBox()).height));
  await shot('light');

  // Playing: the button pauses and the line fills; it ends back at Play.
  const play = a.page.getByRole('button', { name: 'Play Gift', exact: true });
  await play.click();
  await card.locator('.clip-player[data-state="playing"]').waitFor();
  assert.equal(await a.page.getByRole('button', { name: 'Pause Gift', exact: true }).getAttribute('aria-pressed'), 'true');
  await waitFor(async () => (await card.locator('.clip-fill').evaluate(node => parseFloat(node.style.width))) > 0, 'the progress line fills');
  await shot('playing');
  await card.locator('.clip-player[data-state="ready"]').waitFor({ timeout: 5000 });
  assert.equal(speech.calls.length, 2, 'played from the clip, not spoken again');

  // Dark: the same row in Moss night.
  await chooseAppearance(a.page, 'dark');
  const colours = await card.locator('.clip-play').evaluate(node => [getComputedStyle(node).backgroundColor, getComputedStyle(node).color]);
  assert.deepEqual(colours, ['rgb(242, 155, 181)', 'rgb(70, 17, 31)'], 'the Sound pink with its dark label in Moss night');
  await shot('dark');
  await chooseAppearance(a.page, 'light');

  // A language the speech model does not speak: the key alone, a note in the row's place, and no clip.
  const other = await store.createPage('pronunciation-other', { deckId, mainKey: 'carpe diem', initial: [] });
  await store.addModule('pronunciation-other-add', { pageId: other.pageId, type: 'pronunciation' });
  await publish(other.pageId, 'other', 'carpe diem');
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${other.pageId}`);
  const unspoken = componentArticle(a.page, 'Pronunciation').locator('.clip-player[data-state="unspoken"]');
  await unspoken.waitFor();
  assert.equal(await componentArticle(a.page, 'Pronunciation').locator('.entry-heading .entry-language').count(), 0);
  assert.equal(await unspoken.locator('.clip-note').textContent(), 'This language can\'t be spoken yet.');
  assert.equal(await unspoken.getByRole('button', { name: 'Retry', exact: true }).count(), 1);
  heights.push(Math.round((await unspoken.boundingBox()).height));
  await a.page.screenshot({ path: 'artifacts/v0.14.0-pronunciation-unspoken.png', clip: await componentArticle(a.page, 'Pronunciation').boundingBox()
    .then(box => ({ x: box.x - 20, y: box.y - 30, width: box.width + 40, height: box.height + 50 })) });
  assert.deepEqual(heights, [44, 44, 44], 'every state keeps the row\'s height');
  assert.deepEqual((await store.clips(other.pageId)), []);
});

test('0.14.0: a German card’s Pronunciation facet speaks each line beside its own player; a line fails and retries on its own, and the lines are not edited (D24)', { timeout: 60000 }, async (t) => {
  const { FakeSpeechProvider } = await import('../helpers/speech.mjs');
  class WavSpeech extends FakeSpeechProvider {
    bitRate = 64000;
    async send(request, signal, reply) { await super.send(request, signal, reply); reply.mime = 'audio/wav'; reply.bytes = silentWav(); }
  }
  const speech = new WavSpeech({ fail: { 'das Ufer': 'provider_response' } });
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-pronunciation-facet-browser-'));
  const application = await createTestApplication(t, { speechProvider: speech }); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await a.page.setViewportSize({ width: 1280, height: 1000 });
  const { store, audio } = application;
  const session = { installationId: 'fixture', sessionId: 'pronunciation-facet', epoch: 1 };
  await store.openSession('pronunciation-facet-session', session);
  const [german] = await useModules(store, ['german']);
  const { pageId } = await store.createPage('pronunciation-facet-page', { deckId: (await store.snapshot()).id, mainKey: 'bank' });
  const component = (await store.page(pageId)).components.find(item => item.moduleType === 'german');
  assert.ok(component.facets.includes('pronunciation') && german.facets.includes('pronunciation'), 'German offers Pronunciation, last');
  const { attemptIds: [attemptId] } = await store.generate('pronunciation-facet-generate', { pageId, target: { scope: 'component', componentId: component.id }, session });
  await store.stage(attemptId, staged(formatContent('german', { core: { kind: 'word', language: 'Englisch', key: 'bank', gramRole: 'noun', meanings: ['Geldinstitut', 'Ufer eines Flusses'] },
    facets: { article: { singular: 'die Bank', plural: 'die Banken' }, pronunciation: ['die Bank', 'das Ufer'] } })));
  const result = await store.publish('pronunciation-facet-publish', { attemptId, session });
  await audio.afterPublish({ pageId, componentId: component.id, moduleType: 'german', mainKey: 'bank', state: result.state,
    content: (await store.page(pageId)).components.find(item => item.id === component.id).content });

  await signIn(a.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  const card = componentArticle(a.page, 'German');
  const facet = card.locator('section.facet[data-facet="pronunciation"]');
  await facet.locator('.clip-player[data-state="failed"]').waitFor();
  await facet.locator('.clip-player[data-state="ready"]').waitFor();
  assert.deepEqual(await facet.locator('.spoken-text').allTextContents(), ['die Bank', 'das Ufer']);
  assert.deepEqual(await facet.locator('.clip-player').evaluateAll(nodes => nodes.map(node => node.dataset.state)), ['ready', 'failed'],
    'each line has its own clip; one failing leaves the other');
  assert.equal(await facet.locator('.facet-title .tag-mark, .facet-title').first().textContent().then(text => text.includes('Pronunciation')), true);
  const shot = async name => a.page.screenshot({ path: `artifacts/v0.14.0-pronunciation-facet-${name}.png`,
    clip: await card.boundingBox().then(box => ({ x: box.x - 20, y: box.y - 30, width: box.width + 40, height: box.height + 50 })) });
  await shot('failed');

  // The facet has About, Retry and Delete, and no Edit: its lines must match their audio.
  await facet.locator('.facet-title').hover();
  assert.equal(await a.page.getByRole('button', { name: 'Edit Pronunciation from German', exact: true }).count(), 0);
  assert.equal(await a.page.getByRole('button', { name: 'Retry Pronunciation from German', exact: true }).count(), 1);
  assert.equal(await a.page.getByRole('button', { name: 'Edit Article from German', exact: true }).count(), 1, 'other facets keep their Edit');

  // The failed line's own Retry speaks it alone again.
  delete speech.fail['das Ufer'];
  await a.page.getByRole('button', { name: 'Speak das Ufer again', exact: true }).click();
  await waitFor(async () => (await facet.locator('.clip-player').evaluateAll(nodes => nodes.map(node => node.dataset.state))).join() === 'ready,ready', 'both lines ready');
  assert.deepEqual(speech.calls.map(call => `${call.language}:${call.text}`), ['de:die Bank', 'de:das Ufer', 'de:das Ufer']);
  await shot('light');
  await a.page.getByRole('button', { name: 'Play das Ufer', exact: true }).click();
  await facet.locator('.clip-player[data-state="playing"]').waitFor();
  assert.equal(await facet.locator('.clip-player').first().getAttribute('data-state'), 'ready', 'one clip plays at a time');
  await facet.locator('.clip-player[data-state="playing"]').waitFor({ state: 'detached', timeout: 5000 });

  // In the card's editor the lines are shown and not editable; saving keeps them.
  await (await cardButton(a.page, 'Edit German')).click();
  const part = card.locator('.live-editor .facet[data-facet="pronunciation"] [contenteditable]');
  await part.waitFor();
  assert.equal(await part.getAttribute('contenteditable'), 'false');
  await card.getByRole('button', { name: 'Save', exact: true }).click();
  await card.locator('.live-editor').waitFor({ state: 'detached' });
  assert.deepEqual(await facet.locator('.spoken-text').allTextContents(), ['die Bank', 'das Ufer']);

  await chooseAppearance(a.page, 'dark');
  await shot('dark');
  await chooseAppearance(a.page, 'light');
});
