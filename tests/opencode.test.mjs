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

import { session, BANK, data, completion, GERMAN, REPLY } from './helpers/generation.mjs';

test('OpenCode uses the Go endpoint, selected DeepSeek model, and only selection data', async () => {
  let body;
  const provider = new OpenCodeProvider({
    apiKey: 'test-only', fetchImpl: async (url, options) => {
      assert.equal(url, 'https://opencode.ai/zen/go/v1/chat/completions'); body = JSON.parse(options.body);
      assert.equal(options.headers.Authorization, 'Bearer test-only');
      assert.equal(options.headers['User-Agent'], 'Vocabularium/0.13.1');
      assert.equal(options.headers['x-opencode-session'], 'capture-conversation');
      assert.equal(options.method, 'POST'); assert.ok(options.signal instanceof AbortSignal);
      return Response.json(completion(JSON.stringify(REPLY)));
    }
  });
  assert.deepEqual(await provider.generate({ ...GERMAN, sessionId: 'capture-conversation' }), REPLY);
  assert.equal(body.model, 'deepseek-v4.1-flash'); assert.equal(body.stream, false);
  assert.equal(body.messages.length, 2); assert.equal(body.messages[0].role, 'system');
  assert.match(body.messages[0].content, /JSON schema/);
  assert.equal(body.messages[1].role, 'user');
  assert.deepEqual(JSON.parse(body.messages[1].content), { selectedText: '幸福', instanceId: 'g' });
});

test('OpenCode rejects incomplete, refused, malformed, and wrong-schema responses', async () => {
  const provider = new OpenCodeProvider({ apiKey: 'test-only' });
  for (const result of [
    null, {}, { choices: [] }, { error: { message: 'upstream failure' } },
    completion(JSON.stringify(REPLY), 'length'), completion(JSON.stringify(REPLY), 'content_filter'),
    completion(JSON.stringify(REPLY), 'stop', { refusal: 'declined' }),
    completion(JSON.stringify(REPLY), 'stop', { role: 'user' }),
    completion(JSON.stringify(REPLY), 'stop', { tool_calls: [{ id: 'call' }] }),
    completion(JSON.stringify(REPLY), 'stop', { function_call: { name: 'tool' } }),
    completion(null), completion('not JSON'), completion('```json\n{}\n```'),
    ...[null, [], {}, { ...REPLY, unexpected: true }, { inputType: 'word_phrase' }]
      .map(value => completion(JSON.stringify(value)))
  ]) {
    provider.fetch = async () => Response.json(result);
    await assert.rejects(provider.generate(GERMAN));
  }
  provider.fetch = async () => new Response('<html>Gateway unavailable</html>');
  await assert.rejects(provider.generate(GERMAN), /invalid result/);
});

test('OpenCode passes module context and returns the structured result; rejects a result without its parts or with extra fields', async () => {
  const input = { module: { id: 'example-2', type: 'german' }, selectedText: '幸福', facets: ['examples'] };
  const output = { core: { kind: 'word', language: 'Chinesisch', key: '幸福', romanization: 'xìngfú', meanings: ['Glück'] },
    facets: { examples: [{ sentence: '幸福就在身边。', translation: 'Das Glück ist ganz nah.' }] } };
  const provider = new OpenCodeProvider({
    apiKey: 'test-only', model: 'configured-model', fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.model, 'configured-model');
      assert.deepEqual(JSON.parse(body.messages[1].content), { selectedText: input.selectedText, instanceId: 'example-2' }, 'no input type: the core reads the key (D17)');
      return Response.json(completion(JSON.stringify(output)));
    }
  });
  assert.deepEqual(await provider.generate(input), output);
  const withContext = new OpenCodeProvider({ apiKey: 'test-only', fetchImpl: async (_, options) => {
    assert.equal(JSON.parse(JSON.parse(options.body).messages[1].content).context, 'surrounding text');
    return Response.json(completion(JSON.stringify(output)));
  } });
  assert.deepEqual(await withContext.generate({ ...input, context: 'surrounding text' }), output);
  for (const value of [{ text: 'markup' }, { core: output.core }, { core: 'text', facets: {} }, { core: output.core, facets: [] }, { ...output, extra: 'ignored?' }, {}]) {
    provider.fetch = async () => Response.json(completion(JSON.stringify(value)));
    await assert.rejects(provider.generate(input), /invalid result/, JSON.stringify(value));
  }
  // A reply whose core lacks only its closing brace before "facets" is
  // repaired; any other malformed reply stays invalid.
  const text = JSON.stringify(output);
  const slipped = text.replace('},"facets"', ',"facets"');
  provider.fetch = async () => Response.json(completion(slipped));
  assert.deepEqual(await provider.generate(input), output);
  for (const reply of [slipped.slice(0, -1), `${slipped.slice(0, -1)},"kind":"word"}`,
    text.replace(']},"facets"', '},"facets"'), `${text.slice(0, -1)},"kind":"word"}`, slipped.replace(',"facets"', '"facets"')]) {
    provider.fetch = async () => Response.json(completion(reply));
    await assert.rejects(provider.generate(input), /invalid result/, reply);
  }
  provider.fetch = async () => Response.json(completion('{"inputType":"word_phrase","facets":{}'));
  await assert.rejects(provider.generate(input), /invalid result/);
});

test('OpenCode authentication and rate failures make no fallback requests and keep upstream details private', async () => {
  const provider = new OpenCodeProvider({ apiKey: 'test-only' });
  for (const status of [401, 403, 404, 429, 500]) {
    let calls = 0;
    provider.fetch = async () => { calls++; return Response.json({ error: { message: 'private upstream details' } }, { status }); };
    await assert.rejects(provider.generate(GERMAN), { message: 'The generation service could not complete this request.' });
    assert.equal(calls, 1);
  }
  await assert.rejects(new OpenCodeProvider({ apiKey: '', fetchImpl: () => assert.fail('No request without a key') }).generate(GERMAN), /not configured/);
});

test('OpenCode aborts in-flight requests when their generation is canceled', async () => {
  const controller = new AbortController();
  const provider = new OpenCodeProvider({
    apiKey: 'test-only', fetchImpl: async (_, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    })
  });
  const pending = provider.generate(GERMAN, controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});

test('OpenCode asks a parent for its core, its flags first, and the facets asked for as JSON, without markup (D09, D17)', async () => {
  const german = parentInstructions('german', ['article', 'synonyms']);
  assert.match(german, /"kind": "<word \| sentence>"/);
  assert.match(german, /"gramRole"/);
  assert.match(german, /only when "gramRole" is noun/, 'a facet says when it applies');
  assert.ok(german.indexOf('"article"') < german.indexOf('"synonyms"'));
  assert.doesNotMatch(german, /"examples"|"antonyms"|===|\[1\]/);
  const chinese = parentInstructions('chinese', ['examples', 'pinyin']);
  assert.doesNotMatch(chinese, /gramRole/, 'Chinese has no grammatical role');
  assert.match(chinese, /simplified characters/);
  assert.match(chinese, /for a sentence, exactly one \{ "text"/);
  assert.match(parentInstructions('german', []), /"facets" as an empty object/);
  assert.match(chinese, /one \{ "text": "<the Chinese word or words of that meaning>", "pinyin": "<their pinyin with tone marks>" \} per meaning/);
  assert.match(chinese, /without Markdown, numbering or headings/);

  const schema = parentSchema('german', ['article', 'examples']);
  assert.deepEqual(Object.keys(schema.properties), ['core', 'facets']);
  assert.deepEqual(schema.properties.core.required, ['kind', 'language', 'key', 'meanings']);
  assert.deepEqual(Object.keys(schema.properties.core.properties), ['kind', 'language', 'key', 'romanization', 'gramRole', 'meanings'], 'the flags come first');
  assert.deepEqual(Object.keys(schema.properties.facets.properties), ['article', 'examples']);
  assert.deepEqual(schema.properties.facets.required, [], 'every facet may be left out');
  assert.deepEqual(parentSchema('chinese', ['pinyin']).properties.core.required, ['kind', 'language', 'key', 'meanings']);

  const provider = new OpenCodeProvider({ apiKey: 'test-only', fetchImpl: async (_, options) => {
    const [system, user] = JSON.parse(options.body).messages;
    assert.match(system.content, /"examples"/);
    assert.match(system.content, /Match this JSON schema: \{"type":"object"/);
    assert.deepEqual(JSON.parse(user.content), { selectedText: 'bank', instanceId: 'g' });
    return Response.json(completion(JSON.stringify(wordResult('Ufer'))));
  } });
  assert.deepEqual(await provider.generate({ module: { id: 'g', type: 'german', facets: ['examples'] }, selectedText: 'bank',
    facets: ['examples'] }), wordResult('Ufer'));
});

test('OpenCode asks a facet’s own Retry for its facets only, written for the supplied core', async () => {
  const instructions = parentInstructions('german', ['examples'], true);
  assert.match(instructions, /already written and supplied as "core". Return only "facets"/);
  assert.doesNotMatch(instructions, /"kind": "<word/);
  assert.deepEqual(Object.keys(parentSchema('german', ['examples'], true).properties), ['facets']);
  const core = { kind: 'word', language: 'Englisch', key: 'bank', meanings: ['Ufer'] };
  const provider = new OpenCodeProvider({ apiKey: 'test-only', fetchImpl: async (_, options) => {
    const [, user] = JSON.parse(options.body).messages;
    assert.deepEqual(JSON.parse(user.content), { selectedText: 'bank', core, instanceId: 'g' });
    return Response.json(completion(JSON.stringify({ facets: { examples: [{ sentence: 'A bank.' }] } })));
  } });
  assert.deepEqual(await provider.generate({ module: { id: 'g', type: 'german', facets: ['examples'] }, selectedText: 'bank',
    facets: ['examples'], core }), { facets: { examples: [{ sentence: 'A bank.' }] } });
});

test('OpenCode sends a card’s Retry the core it had as "previous", with the reading prompt, and asks for the whole card (D19)', async () => {
  const instructions = parentInstructions('german', ['examples'], false, 'en', true);
  assert.match(instructions, /"kind": "<word/);
  assert.match(instructions, /supplied as "previous"[^\n]*keeping that reading/);
  assert.deepEqual(Object.keys(parentSchema('german', ['examples']).properties), ['core', 'facets']);
  const previous = { kind: 'word', language: 'Englisch', key: 'bank', gramRole: 'noun', meanings: ['Sitzbank'] };
  const provider = new OpenCodeProvider({ apiKey: 'test-only', fetchImpl: async (_, options) => {
    const [system, user] = JSON.parse(options.body).messages;
    assert.match(system.content, /supplied as "previous"/);
    assert.deepEqual(JSON.parse(user.content), { selectedText: 'bank', previous, instanceId: 'g' });
    return Response.json(completion(JSON.stringify(BANK)));
  } });
  assert.deepEqual(await provider.generate({ module: { id: 'g', type: 'german', facets: ['examples'] }, selectedText: 'bank',
    facets: ['examples'], previous }), BANK);
  // A first attempt names no earlier reading.
  assert.doesNotMatch(parentInstructions('german', ['examples']), /"previous"/);
});

test('provider events carry the prompt version of the request they send (D11)', async () => {
  const events = [];
  const provider = new OpenCodeProvider({ apiKey: 'test-only', fetchImpl: async () => Response.json({ choices: [{ finish_reason: 'stop',
    message: { role: 'assistant', content: JSON.stringify(BANK) } }] }) });
  provider.diagnostic = event => events.push(event);
  const facets = ['article', 'examples'];
  await provider.generate({ module: { id: 'g', type: 'german' }, selectedText: 'bank', facets });
  const expected = promptVersion({ instructions: parentInstructions('german', facets), schema: parentSchema('german', facets) });
  assert.deepEqual(events.map(event => [event.event, event.promptVersion]), [['provider.request', expected], ['provider.response', expected]]);
});

test('the request OpenCode sends for an Expertise module in Chinese carries the Chinese writing guide and a length in characters (D15)', async () => {
  const bodies = [];
  const provider = new OpenCodeProvider({ apiKey: 'test-only', fetchImpl: async (url, init) => {
    bodies.push(JSON.parse(init.body));
    return Response.json({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify({ core: { relevance: 'subject', key: 'cache', explanation: ['缓存（cache）是……'] }, facets: {} }) } }] });
  } });
  await provider.generate({ module: { id: 'cs', type: 'computer-science' }, selectedText: 'cache', facets: [], language: 'zh-Hans' });
  const system = bodies[0].messages.find(message => message.role === 'system').content;
  assert.match(system, /at most about 80 Chinese characters each/);
  assert.match(system, /哈希表（hash table）/);
  assert.doesNotMatch(system, /at most 50 words|\{\{/);
  await provider.generate({ module: { id: 'g', type: 'german' }, selectedText: 'bank', facets: ['article'], language: 'zh-Hans' }).catch(() => {});
  assert.doesNotMatch(bodies[1].messages.find(message => message.role === 'system').content, /哈希表/, 'a Languages module gets no guide');
});
