import test, { createTestStore, createTestApplication } from './helpers/database.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Generation } from '../src/server/generation.mjs';
import { OpenCodeProvider } from '../src/server/opencode.mjs';
import { moduleInstructions as parentInstructions, moduleSchema as parentSchema, promptVersion } from '@vocabularium/domain/composer';
import { generateComponents } from '@vocabularium/domain/modules';
import { facetsOf } from '@vocabularium/domain/parents';
import { formatContent, withKeyHighlighted } from '@vocabularium/domain/content';
import { plainLines } from '@vocabularium/domain/markdown';
import { isContentType } from '@vocabularium/domain/page-modules';
import { confirmed, generated, resultFor, sentenceResult, text, textBlocks, useModules, wordResult, staged } from './helpers/pages.mjs';

import { keyed, session, modules, fixture, finish, outcome, retryComponent, parentFixture, BANK, data, completion, REPLY } from './helpers/generation.mjs';

test('modules receive the exact main key and keep literal markers', async () => {
  const input = '  幸福\n';
  const received = [];
  const outcomes = await generateComponents({
    mainKey: input, modules: modules('chinese', 'chinese'),
    generate: async request => { received.push(request.selectedText); return resultFor(request, '<b>幸福</b> & 快乐'); }
  });
  assert.deepEqual(outcomes.map(item => plainLines(item.content.core)[0]), ['<b>幸福</b> & 快乐', '<b>幸福</b> & 快乐']);
  assert.deepEqual(received, [input, input]);
});

test('one request per module and none shared by the run; components fail independently (D17)', async (t) => {
  const requests = [];
  const { store, generation, capture } = await fixture(t, {
    generate: async request => { requests.push(request.module.type); if (request.module.type === 'german') throw Error('controlled failure'); return resultFor(request, 'explanation'); }
  }, ['chinese', 'german', 'chinese']);
  const page = await capture();
  assert.equal((await store.page(page.id)).status, 'loading');
  await finish(store, generation);
  assert.deepEqual(requests.sort(), ['chinese', 'chinese', 'german'], 'exactly one request per module, nothing before them');
  assert.equal((await store.page(page.id)).status, 'failed');
  assert.deepEqual(await outcome(store, page), [['explanation', 'completed'], ['', 'failed'], ['explanation', 'completed']]);
});

test('repeated modules generate independently, even when they produce the same text', async (t) => {
  let calls = 0;
  const { store, generation, capture } = await fixture(t, { generate: async request => { calls++; return resultFor(request, 'same example'); } }, ['chinese', 'chinese']);
  const page = await capture(); await finish(store, generation);
  assert.equal(calls, 2);
  assert.deepEqual(await outcome(store, page), [['same example', 'completed'], ['same example', 'completed']]);
});

// Parent modules (D08): one call for the core and the facets that apply.
test('a parent writes its core, its reading of the key and its facets in one call, as structured content (D09, D17)', async (t) => {
  const requests = [];
  const { store, generation, capture } = await parentFixture(t, {
    generate: async request => { requests.push(request); return request.selectedText.endsWith('.')
      ? sentenceResult('Wir saßen am Ufer.', { examples: [{ sentence: 'We stood by the river.', translation: 'Wir standen am Fluss.' }] }, { key: request.selectedText }) : BANK; }
  });
  const wordPage = await capture('bank'); await finish(store, generation);
  const sentencePage = await capture('We sat on the bank.'); await finish(store, generation);
  assert.deepEqual(requests.map(request => [request.module.type, request.facets]),
    [['german', ['article', 'examples', 'synonyms', 'antonyms']], ['german', ['article', 'examples', 'synonyms', 'antonyms']]], 'each request asks for every facet');
  assert.deepEqual(await data(store, wordPage), [{ type: 'parent', ...keyed(BANK) }], 'stored as one parent block of markdown; a facet left out, like Synonyms, has none');
  assert.equal((await outcome(store, sentencePage))[0][1], 'completed', 'a parent never completes empty for a sentence');
  assert.equal((await data(store, sentencePage))[0].header.kind, 'sentence', 'the card records its own reading');
  assert.ok(!('interpretation' in await store.page(sentencePage.id)));
});

test('a parent drops entries of facets it does not have, and fails on a result outside its shape', async (t) => {
  const replies = [{ ...BANK, facets: { ...BANK.facets, antonyms: ['Strom'] } }, { text: '== Englisch ==\n: [1] Ufer' }, { core: { kind: 'sentence', translation: 'an earlier shape' }, facets: {} },
    wordResult(['Ufer'], { examples: [{ translation: 'only a translation' }] })];
  const { store, generation, capture } = await parentFixture(t, { generate: async () => replies.shift() }, ['article', 'examples']);
  const kept = await capture('bank'); await finish(store, generation);
  assert.deepEqual(await data(store, kept), [{ type: 'parent', ...keyed(BANK) }]);
  for (let index = 0; index < 3; index++) {
    const wrong = await capture('bank'); await finish(store, generation);
    assert.deepEqual(await outcome(store, wrong), [['', 'failed']], `refused reply ${index + 2}`);
  }
});

test('Go requests share a stable conversation per page; each retry is one new request', async (t) => {
  const sessions = [];
  const provider = new OpenCodeProvider({
    apiKey: 'test-only', fetchImpl: async (_, options) => {
      sessions.push(options.headers['x-opencode-session']);
      return Response.json(completion(JSON.stringify(REPLY)));
    }
  });
  const { store, generation, capture } = await fixture(t, provider);
  const first = await capture(); await finish(store, generation);
  assert.deepEqual(sessions, [first.id]);
  const { attemptIds } = await retryComponent(store, 'retry-go', await store.page(first.id), 0);
  await generation.start(first.id, attemptIds); await finish(store, generation);
  assert.deepEqual(sessions, Array(2).fill(first.id));
  const second = await capture(); await finish(store, generation);
  assert.deepEqual(sessions.slice(2), [second.id]);
  assert.notEqual(first.id, second.id);
});

test('generation passes the saved Context to each module’s request', async (t) => {
  const seen = [];
  const { store, generation } = await fixture(t, {
    generate: async request => { seen.push(['generate', request.selectedText, request.context]); return resultFor(request, 'explained'); }
  }, ['context', 'chinese']);
  const { pageId } = await store.capture('with-context', { session, mainKey: 'Bismarck', context: 'Otto von Bismarck, chancellor', snapshot: await store.snapshot() });
  await generation.start(pageId); await finish(store, generation);
  assert.deepEqual(seen, [['generate', 'Bismarck', 'Otto von Bismarck, chancellor']]);
});

test('a facet’s own Retry regenerates that facet’s markdown for the core already there, keeps the rest and the card’s reading, and keeps everything when it fails', async (t) => {
  const requests = [];
  let failing = false;
  const steep = [{ sentence: 'The bank was steep.', translation: 'Das Ufer war steil.' }];
  const { store, generation, capture } = await parentFixture(t, {
    generate: async request => {
      requests.push(request);
      if (failing) throw new Error('provider down');
      if (!request.core) return BANK;
      // A core written again is not taken; nor is another facet's entry.
      return { facets: request.facets[0] === 'examples' ? { examples: steep, synonyms: ['ignored'] } : { synonyms: ['Böschung'] } };
    }
  });
  const page = await capture('bank'); await finish(store, generation);
  const german = async () => generated(await store.page(page.id))[0];
  const stored = async () => (await german()).content.blocks[0];
  const retryFacet = async (facet, confirm = true) => {
    const payload = { pageId: page.id, target: { scope: 'facet', componentId: (await german()).id, facet }, session };
    const result = confirm ? await confirmed(store, randomUUID(), payload) : await store.generate(randomUUID(), payload);
    await generation.start(page.id, result.attemptIds);
    return result;
  };

  // A facet with content asks first; the content stays while it regenerates.
  await assert.rejects(store.generate(randomUUID(), { pageId: page.id, target: { scope: 'facet', componentId: (await german()).id, facet: 'examples' }, session }),
    { code: 'confirmation_required' });
  const { attemptIds } = await confirmed(store, randomUUID(), { pageId: page.id, target: { scope: 'facet', componentId: (await german()).id, facet: 'examples' }, session });
  let current = await german();
  assert.deepEqual(current.content.blocks[0], { type: 'parent', ...keyed(BANK) });
  assert.equal(current.status, 'loading');
  assert.equal(current.retryingFacet, 'examples');
  await generation.start(page.id, attemptIds); await finish(store, generation);
  assert.deepEqual(requests.at(-1).core, BANK.core, 'the provider writes for the core already there, its flags included');
  assert.deepEqual(requests.at(-1).facets, ['examples']);
  assert.equal(requests.length, 2, 'the card’s reading of the main key is kept: no request reads it again');
  const formatted = keyed(BANK);
  assert.deepEqual(await stored(), { type: 'parent', ...formatted, facets: { article: formatted.facets.article, examples: '1. The ==bank== was steep.\n   *Das Ufer war steil.*' } },
    'only the facet’s markdown changes, formatted from its JSON');
  current = await german();
  assert.equal(current.status, 'completed');
  assert.equal(current.retryingFacet, undefined);

  // A facet without an entry starts at once and gains one.
  await retryFacet('synonyms', false); await finish(store, generation);
  assert.equal((await stored()).facets.synonyms, 'Böschung');

  // A failed facet Retry keeps the content, and a waiting facet still waits.
  await store.deleteFacet(randomUUID(), { pageId: page.id, componentId: current.id, parent: 'german', facet: 'antonyms' });
  await store.addFacet(randomUUID(), { pageId: page.id, componentId: current.id, parent: 'german', facet: 'antonyms' });
  const before = await stored();
  failing = true;
  await retryFacet('antonyms', false); await finish(store, generation);
  current = await german();
  assert.deepEqual(await stored(), before);
  assert.equal(current.status, 'completed');
  assert.equal(current.failedFacet, 'antonyms');
  assert.deepEqual(current.waitingFacets, ['antonyms']);

  // A parent without structured content yet is retried whole.
  const { componentId } = await store.addModule(randomUUID(), { pageId: page.id, type: 'german' });
  await store.addFacet(randomUUID(), { pageId: page.id, componentId, parent: 'german', facet: 'examples' });
  await assert.rejects(store.generate(randomUUID(), { pageId: page.id, target: { scope: 'facet', componentId, facet: 'examples' }, session }),
    { code: 'invalid', message: /Retry the whole module first/ });
});

test('a card’s Retry, alone or with the page, starts over: the same request as a first attempt, nothing from the card, edits or not (D28)', async (t) => {
  const requests = [];
  let failing = true;
  const { store, generation, capture } = await parentFixture(t, {
    // The core's key is the selection, as the model writes it.
    generate: async request => { requests.push(request); if (failing) throw new Error('provider down'); return { ...BANK, core: { ...BANK.core, key: request.selectedText } }; }
  });
  const page = await capture('bank'); await finish(store, generation);
  const german = async () => generated(await store.page(page.id))[0];
  const retry = async target => {
    const { attemptIds } = await confirmed(store, randomUUID(), { pageId: page.id, target, session });
    await generation.start(page.id, attemptIds); await finish(store, generation);
  };
  const first = requests[0];
  assert.equal(first.previous, undefined, 'the first attempt has no earlier core');
  const fresh = (request, selectedText = 'bank') => {
    assert.equal(request.previous, undefined, 'nothing from the card goes with it');
    assert.equal(request.core, undefined, 'the whole card is written again, not a facet for a given core');
    assert.equal(request.selectedText, selectedText);
    assert.deepEqual(request.facets, first.facets);
    assert.deepEqual(request.module, first.module);
  };
  // A failed card's Retry, then a generated card's.
  failing = false;
  await retry({ scope: 'component', componentId: (await german()).id });
  fresh(requests.at(-1));
  await retry({ scope: 'component', componentId: (await german()).id });
  fresh(requests.at(-1));
  // The user's edit to the meanings no longer steers it, nor the page's Retry.
  const current = await german();
  const block = current.content.blocks[0];
  await store.savePage(randomUUID(), { pageId: page.id, changes: [{ componentId: current.id, content: { version: 1, blocks: [{ ...block, core: block.core.replace('Ufer', 'Sitzbank') }] } }] });
  await retry({ scope: 'page' });
  fresh(requests.at(-1));
  // A changed main key is read as on a first attempt, like any key.
  const key = (await store.page(page.id)).components.find(component => component.moduleType === 'main-key');
  await store.savePage(randomUUID(), { pageId: page.id, changes: [{ componentId: key.id, content: textBlocks('Schloss') }] });
  await retry({ scope: 'component', componentId: (await german()).id });
  fresh(requests.at(-1), 'Schloss');
});

test('the core’s own Retry writes the core alone for the reading it had: flags, top line and every facet kept, confirmed, replayed, and kept when it fails (D28)', async (t) => {
  const requests = [];
  let failing = false;
  const { store, generation, capture } = await parentFixture(t, {
    generate: async request => {
      requests.push(request);
      if (failing) throw new Error('provider down');
      if (!request.previous) return BANK;
      // The provider changes a flag and the key: neither is taken; only the meanings are new.
      return { core: { ...BANK.core, kind: 'word', gramRole: 'verb', key: 'banks', meanings: ['Flussufer', 'Uferböschung'] }, facets: { examples: [{ sentence: 'ignored' }] } };
    }
  });
  const page = await capture('bank'); await finish(store, generation);
  const german = async () => generated(await store.page(page.id))[0];
  const target = async () => ({ scope: 'core', componentId: (await german()).id });
  const before = (await german()).content.blocks[0];
  const record = (await store.generationRecords(page.id))[(await german()).id];

  // A written core asks first; the content stays while the core regenerates.
  await assert.rejects(store.generate(randomUUID(), { pageId: page.id, target: await target(), session }), { code: 'confirmation_required' });
  const operationId = randomUUID();
  const asked = await store.generate(randomUUID(), { pageId: page.id, target: await target(), session }).catch(error => error);
  const payload = { pageId: page.id, target: await target(), session, confirmation: asked.details.confirmation };
  const first = await store.generate(operationId, payload);
  let current = await german();
  assert.deepEqual(current.content.blocks[0], before);
  assert.equal(current.status, 'loading');
  assert.equal(current.retryingFacet, 'core');
  // A replayed operation ID returns its first result, starting nothing more.
  assert.deepEqual(await store.generate(operationId, payload), { ...first, replayed: true });
  await generation.start(page.id, first.attemptIds); await finish(store, generation);
  const request = requests.at(-1);
  assert.deepEqual(request.previous, BANK.core, 'the core it had, as "previous"');
  assert.equal(request.core, undefined);
  assert.deepEqual(request.facets, [], 'no facet is asked for');
  current = await german();
  assert.equal(current.status, 'completed');
  assert.equal(current.retryingFacet, undefined);
  const after = current.content.blocks[0];
  assert.deepEqual(after.header, before.header, 'the top line, its flags included, stays');
  assert.deepEqual(after.facets, before.facets, 'every facet stays');
  assert.equal(after.core, '1. Flussufer\n2. Uferböschung');
  const next = (await store.generationRecords(page.id))[current.id];
  assert.deepEqual(Object.keys(next).sort(), Object.keys(record).sort(), 'the record keeps every part');
  assert.deepEqual(next.article, record.article, 'a facet keeps its record');

  // A failed core Retry keeps the content and names the core as failed.
  failing = true;
  const { attemptIds } = await confirmed(store, randomUUID(), { pageId: page.id, target: await target(), session });
  await generation.start(page.id, attemptIds); await finish(store, generation);
  current = await german();
  assert.deepEqual(current.content.blocks[0], after);
  assert.equal(current.status, 'completed');
  assert.equal(current.failedFacet, 'core');

  // A core written for another main key is not retried on its own, nor is a card without a core.
  const key = (await store.page(page.id)).components.find(component => component.moduleType === 'main-key');
  await store.savePage(randomUUID(), { pageId: page.id, changes: [{ componentId: key.id, content: textBlocks('Schloss') }] });
  await assert.rejects(store.generate(randomUUID(), { pageId: page.id, target: await target(), session }), { code: 'invalid', message: /cannot be retried on its own/ });
  const { componentId } = await store.addModule(randomUUID(), { pageId: page.id, type: 'german' });
  await assert.rejects(store.generate(randomUUID(), { pageId: page.id, target: { scope: 'core', componentId }, session }), { code: 'invalid' });
});

test('each generated part records its model and prompt version; a facet’s own Retry records only that facet, and saves keep the record (D11)', async (t) => {
  let failing = false;
  const provider = {
    model: 'pinned-model',
    generate: async request => {
      if (failing) throw new Error('provider down');
      return request.core ? { facets: { examples: [{ sentence: 'The bank was steep.', translation: 'Das Ufer war steil.' }] } } : BANK;
    }
  };
  const { store, generation, capture } = await parentFixture(t, provider, ['article', 'examples', 'synonyms']);
  const page = await capture('bank'); await finish(store, generation);
  const german = async () => generated(await store.page(page.id))[0];
  const record = async () => (await store.generationRecords(page.id))[(await german()).id];
  const whole = promptVersion({ instructions: parentInstructions('german', ['article', 'examples', 'synonyms']),
    schema: parentSchema('german', ['article', 'examples', 'synonyms']) });
  const entry = { model: 'pinned-model', prompt: whole };
  // Synonyms came back empty: it has no content, so nothing records it.
  assert.deepEqual(await record(), { core: entry, article: entry, examples: entry });

  const retry = promptVersion({ instructions: parentInstructions('german', ['examples'], true),
    schema: parentSchema('german', ['examples'], true) });
  assert.notEqual(retry, whole);
  const { attemptIds } = await confirmed(store, randomUUID(), { pageId: page.id, target: { scope: 'facet', componentId: (await german()).id, facet: 'examples' }, session });
  await generation.start(page.id, attemptIds); await finish(store, generation);
  assert.deepEqual(await record(), { core: entry, article: entry, examples: { model: 'pinned-model', prompt: retry } }, 'only the retried facet changes');

  // A user's edits, whole or of one facet, never change the record.
  const block = (await german()).content.blocks[0];
  await store.savePage(randomUUID(), { pageId: page.id, changes: [{ componentId: (await german()).id, content: { version: 1, blocks: [{ ...block, core: 'mein Ufer' }] } }] });
  await store.savePage(randomUUID(), { pageId: page.id, changes: [{ componentId: (await german()).id, facet: 'article',
    content: { version: 1, blocks: [{ ...block, facets: { ...block.facets, article: 'das Bankufer' } }] } }] });
  assert.equal((await german()).content.blocks[0].core, 'mein Ufer');
  assert.deepEqual(await record(), { core: entry, article: entry, examples: { model: 'pinned-model', prompt: retry } });

  // A whole Retry that fails leaves no content, and no record.
  failing = true;
  await generation.start(page.id, (await retryComponent(store, randomUUID(), await store.page(page.id), 0)).attemptIds); await finish(store, generation);
  assert.equal((await german()).status, 'failed');
  assert.equal(await record(), undefined);
});

test('an Expertise module explains in the account’s language, and its prompt version records which (D14, K36)', async (t) => {
  const requests = [];
  const { store, generation, capture } = await fixture(t, {
    generate: async request => { requests.push(request); return { core: { relevance: 'subject', key: request.selectedText, explanation: ['La partie visible.'] }, facets: {} }; }
  }, ['computer-science']);
  await store.setLanguage('to-french', 'fr');
  const page = await capture('Frontend'); await finish(store, generation);
  const card = generated(await store.page(page.id))[0];
  assert.equal(card.status, 'completed');
  assert.equal(requests[0].language, 'fr', 'the provider is asked in French');
  const french = promptVersion({ instructions: parentInstructions('computer-science', ['code'], false, 'fr'), schema: parentSchema('computer-science', ['code']) });
  assert.equal((await store.generationRecords(page.id))[card.id].core.prompt, french);
  assert.notEqual(french, promptVersion({ instructions: parentInstructions('computer-science', ['code']), schema: parentSchema('computer-science', ['code']) }));
});

test('an Expertise module explains the key in English as one core with its case, its top line the key only (D11, D17)', async (t) => {
  const requests = [];
  const { store, generation, capture } = await fixture(t, {
    model: 'pinned-model',
    generate: async request => {
      requests.push(request);
      return request.selectedText.endsWith('.')
        ? { core: { relevance: 'subject', key: request.selectedText, explanation: ['A page asks a server for data.'] }, facets: {} }
        : { core: { relevance: 'subject', key: request.selectedText, explanation: ['The part of a program people see.', 'Like a dining room.'] }, facets: {} };
    }
  }, ['computer-science']);
  const page = await capture('Frontend'); await finish(store, generation);
  const card = generated(await store.page(page.id))[0];
  assert.equal(card.status, 'completed');
  assert.deepEqual(card.content.blocks[0], { type: 'parent', header: { kind: 'expertise', key: 'Frontend', relevance: 'subject' },
    core: 'The part of a program people see.\n\nLike a dining room.', facets: {} });
  assert.deepEqual(requests[0].facets, ['code'], 'its facet asked for; it says when it applies');
  const prompt = promptVersion({ instructions: parentInstructions('computer-science', ['code']), schema: parentSchema('computer-science', ['code']) });
  assert.deepEqual((await store.generationRecords(page.id))[card.id], { core: { model: 'pinned-model', prompt } });
  assert.match(parentInstructions('computer-science', []), /as computer science understands it/);
  assert.match(parentInstructions('mathematics', []), /Write every part in English/);
  assert.match(parentInstructions('mathematics', []), /"relevance": "<subject \| neighbouring \| unrelated>"/);

  const said = await capture('The frontend sends a request.'); await finish(store, generation);
  assert.deepEqual(generated(await store.page(said.id))[0].content.blocks[0], { type: 'parent',
    header: { kind: 'expertise', key: 'The frontend sends a request.', relevance: 'subject' }, core: 'A page asks a server for data.', facets: {} });
});
