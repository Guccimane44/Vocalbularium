import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

// Run explicitly against the owner's disposable MVP test account. This creates three sample captures.
const origin = new URL(process.env.VOCABULARIUM_API_URL);
if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) {
  throw new Error('Set VOCABULARIUM_API_URL to the test backend HTTPS origin.');
}
async function request(path, token, body, expectedStatus = 200) {
  const response = await fetch(new URL(path, origin), {
    method: body ? 'POST' : 'GET',
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(90000)
  });
  assert.equal(response.status, expectedStatus, `${path}: HTTP ${response.status}`);
  return response.json();
}
const evidence = { date: new Date().toISOString(), origin: origin.origin, checks: [], captures: [] };
assert.equal((await request('/health')).ok, true);
const unauthorized = await fetch(new URL('/api/account', origin), { signal: AbortSignal.timeout(90000) });
assert.equal(unauthorized.status, 401);
evidence.checks.push('Health and unauthenticated account protection');
const clients = [];
try {
  for (let index = 0; index < 2; index++) {
    const { token } = await request('/api/login', null, { username: 'admin', password: 'admin' });
    const session = { installationId: randomUUID(), sessionId: randomUUID(), epoch: 1 };
    clients.push({ token, session });
    await request('/api/session', token, { operationId: randomUUID(), session });
  }
  const [a, b] = clients;
  const account = await request('/api/account', a.token);
  const deck = account.decks.find(deck => deck.id === account.defaultDeckId);
  assert.deepEqual(deck.pages.map(page => page.modules.map(module => module.type)), [['selected'], ['german-examples']], 'Use the initial My Deck layout for this smoke check.');

  async function complete(karteId) {
    const deadline = Date.now() + 150000;
    while (Date.now() < deadline) {
      const polled = await request('/api/poll', a.token, { session: a.session });
      assert.deepEqual(polled.saveFailed, []);
      for (const attemptId of polled.ready) {
        await request('/api/publish', a.token, { operationId: randomUUID(), payload: { attemptId, session: a.session } });
      }
      const karte = (await request('/api/account', b.token)).cards.find(karte => karte.id === karteId);
      assert.ok(karte, 'The second installation can see the saved capture.');
      if (karte.status !== 'loading') { assert.equal(karte.status, 'completed'); return karte; }
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    throw new Error('Hosted generation did not complete in time.');
  }

  for (const [selectedText, inputType] of [['幸福', 'word_phrase'], ['画蛇添足', 'word_phrase'], ['我真的很幸福', 'sentence']]) {
    const { snapshot } = await request('/api/capture/prepare', a.token, { operationId: randomUUID(), payload: { session: a.session, selectedText } });
    const capture = { operationId: randomUUID(), payload: { session: a.session, selectedText, snapshot } };
    const { cardId: karteId } = await request('/api/capture', a.token, capture);
    const repeated = await request('/api/capture', a.token, capture);
    assert.equal(repeated.cardId, karteId); assert.equal(repeated.replayed, true);
    let karte = await complete(karteId);
    assert.deepEqual(karte.interpretation, { inputType, sourceLanguage: 'Chinese' });
    assert.equal(karte.pages[0].text, selectedText);
    if (inputType === 'sentence') assert.equal(karte.pages[1].text, '');
    else {
      assert.match(karte.pages[1].text, /=== Bedeutungen ===/);
      assert.match(karte.pages[1].text, /=== Beispiele ===/);
      assert.match(karte.pages[1].text, /\n:: /);
    }
    if (selectedText === '画蛇添足') {
      await request('/api/card/retry', a.token, { operationId: randomUUID(), payload: { cardId: karteId, pageId: karte.pages[1].page_id, session: a.session } });
      karte = await complete(karteId);
      assert.equal(karte.pages[0].text, selectedText);
      assert.ok(karte.pages[1].text.trim());
      evidence.checks.push('Explicit page retry preserves the other page');
    }
    evidence.captures.push({ selectedText, interpretation: karte.interpretation, pages: karte.pages.map(({ text, status }) => ({ text, status })) });
    console.log(`Hosted capture passed: ${inputType}`);
  }
  evidence.checks.push('Word, phrase and sentence generation; initial-layout applicability; duplicate operation replay; visibility from a second installation');

  const { cardId: karteId } = await request('/api/card/create', a.token, { operationId: randomUUID(), payload: { deckId: deck.id, pages: deck.pages.map(page => ({ pageId: page.id, text: 'Hosted smoke draft' })) } });
  const save = { operationId: randomUUID(), payload: { cardId: karteId, changes: [{ pageId: deck.pages[0].id, text: 'First installation' }] } };
  await request('/api/card/save', a.token, save);
  await request('/api/card/save', b.token, { operationId: randomUUID(), payload: { cardId: karteId, changes: [{ pageId: deck.pages[0].id, text: 'Second installation wins' }, { pageId: deck.pages[1].id, text: 'Second page stays' }] } });
  await request('/api/card/save', a.token, save);
  let karte = (await request('/api/account', a.token)).cards.find(karte => karte.id === karteId);
  assert.deepEqual(karte.pages.map(page => page.text), ['Second installation wins', 'Second page stays']);
  await request('/api/card/save', a.token, { operationId: randomUUID(), payload: { cardId: karteId, changes: [{ pageId: deck.pages[0].id, text: 'Later first page' }] } });
  karte = (await request('/api/account', b.token)).cards.find(karte => karte.id === karteId);
  assert.deepEqual(karte.pages.map(page => page.text), ['Later first page', 'Second page stays']);
  await request('/api/card/delete', a.token, { operationId: randomUUID(), payload: { cardId: karteId } });
  assert.equal((await request('/api/account', b.token)).cards.some(karte => karte.id === karteId), false);
  evidence.checks.push('Manual creation, ordered same-page edits, preserved other-page edits, replay without overwriting newer content, and deletion synchronize');

  const page = () => ({ id: randomUUID(), modules: [] });
  const draft = { name: 'Hosted configuration check', pages: [page(), page()] };
  const { deckId } = await request('/api/deck/save', a.token, { operationId: randomUUID(), payload: { deck: draft } });
  try {
    draft.id = deckId;
    const { cardId: karteId } = await request('/api/card/create', a.token, { operationId: randomUUID(), payload: {
      deckId, pages: draft.pages.map((page, index) => ({ pageId: page.id, text: `Retain page ${index + 1}` }))
    } });
    const extended = structuredClone(draft); extended.pages.push(page());
    await request('/api/deck/save', b.token, { operationId: randomUUID(), payload: { deck: extended, basePageIds: draft.pages.map(page => page.id) } });
    const appended = (await request('/api/account', a.token)).cards.find(karte => karte.id === karteId);
    assert.deepEqual(appended.pages.map(page => [page.text, page.status]), [['Retain page 1', null], ['Retain page 2', null], ['', null]]);
    const removal = { deck: { ...extended, pages: [extended.pages[0], extended.pages[2]] }, basePageIds: extended.pages.map(page => page.id) };
    const warning = await request('/api/deck/save', a.token, { operationId: randomUUID(), payload: removal }, 409);
    assert.equal(warning.code, 'content_loss');
    await request('/api/card/save', b.token, { operationId: randomUUID(), payload: { cardId: karteId, changes: [{ pageId: draft.pages[1].id, text: 'Remote edit after the warning' }] } });
    const changed = await request('/api/deck/save', a.token, { operationId: randomUUID(), payload: { ...removal, confirmation: warning.details.confirmation } }, 409);
    assert.equal(changed.code, 'content_loss');
    assert.notEqual(changed.details.confirmation, warning.details.confirmation);
    await request('/api/deck/save', a.token, { operationId: randomUUID(), payload: { ...removal, confirmation: changed.details.confirmation } });
    const stale = await request('/api/deck/save', b.token, { operationId: randomUUID(), payload: { deck: draft, basePageIds: draft.pages.map(page => page.id) } }, 409);
    assert.equal(stale.code, 'deleted');
    const retained = (await request('/api/account', b.token)).cards.find(karte => karte.id === karteId);
    assert.deepEqual(retained.pages.map(page => [page.page_id, page.text]), [[draft.pages[0].id, 'Retain page 1'], [extended.pages[2].id, '']]);
    evidence.checks.push('Concurrent deck configuration: empty appends, retained page identity, content-loss confirmation revalidated after a remote edit, and stale deleted-page rejection');
  } finally {
    await request('/api/deck/delete', a.token, { operationId: randomUUID(), payload: { deckId } });
  }
} finally {
  for (const { token } of clients) await request('/api/logout', token, {}).catch(() => {});
}
await mkdir('.data', { recursive: true });
await writeFile('.data/hosted-smoke.json', JSON.stringify(evidence, null, 2) + '\n');
console.log('Hosted API smoke passed. Three sample captures remain in My Deck; evidence is in .data/hosted-smoke.json.');
