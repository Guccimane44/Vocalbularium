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
    headers: { ...(body ? { 'Content-Type': 'application/json', 'X-Vocabularium-Terminology': 'karte-seite' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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
  assert.deepEqual(deck.seites.map(seite => seite.modules.map(module => module.type)), [['selected'], ['german-examples']], 'Use the initial My Deck layout for this smoke check.');

  async function complete(karteId) {
    const deadline = Date.now() + 150000;
    while (Date.now() < deadline) {
      const polled = await request('/api/poll', a.token, { session: a.session });
      assert.deepEqual(polled.saveFailed, []);
      for (const attemptId of polled.ready) {
        await request('/api/publish', a.token, { operationId: randomUUID(), payload: { attemptId, session: a.session } });
      }
      const karte = (await request('/api/account', b.token)).kartes.find(karte => karte.id === karteId);
      assert.ok(karte, 'The second installation can see the saved capture.');
      if (karte.status !== 'loading') { assert.equal(karte.status, 'completed'); return karte; }
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    throw new Error('Hosted generation did not complete in time.');
  }

  for (const [selectedText, inputType] of [['幸福', 'word_phrase'], ['画蛇添足', 'word_phrase'], ['我真的很幸福', 'sentence']]) {
    const { snapshot } = await request('/api/capture/prepare', a.token, { operationId: randomUUID(), payload: { session: a.session, selectedText } });
    const capture = { operationId: randomUUID(), payload: { session: a.session, selectedText, snapshot } };
    const { karteId } = await request('/api/capture', a.token, capture);
    const repeated = await request('/api/capture', a.token, capture);
    assert.equal(repeated.karteId, karteId); assert.equal(repeated.replayed, true);
    let karte = await complete(karteId);
    assert.deepEqual(karte.interpretation, { inputType, sourceLanguage: 'Chinese' });
    assert.equal(karte.seites[0].text, selectedText);
    if (inputType === 'sentence') assert.equal(karte.seites[1].text, '');
    else {
      assert.match(karte.seites[1].text, /=== Bedeutungen ===/);
      assert.match(karte.seites[1].text, /=== Beispiele ===/);
      assert.match(karte.seites[1].text, /\n:: /);
    }
    if (selectedText === '画蛇添足') {
      await request('/api/karte/retry', a.token, { operationId: randomUUID(), payload: { karteId, seiteId: karte.seites[1].seite_id, session: a.session } });
      karte = await complete(karteId);
      assert.equal(karte.seites[0].text, selectedText);
      assert.ok(karte.seites[1].text.trim());
      evidence.checks.push('Explicit seite retry preserves the other seite');
    }
    evidence.captures.push({ selectedText, interpretation: karte.interpretation, seites: karte.seites.map(({ text, status }) => ({ text, status })) });
    console.log(`Hosted capture passed: ${inputType}`);
  }
  evidence.checks.push('Word, phrase and sentence generation; initial-layout applicability; duplicate operation replay; visibility from a second installation');

  const { karteId } = await request('/api/karte/create', a.token, { operationId: randomUUID(), payload: { deckId: deck.id, seites: deck.seites.map(seite => ({ seiteId: seite.id, text: 'Hosted smoke draft' })) } });
  const save = { operationId: randomUUID(), payload: { karteId, changes: [{ seiteId: deck.seites[0].id, text: 'First installation' }] } };
  await request('/api/karte/save', a.token, save);
  await request('/api/karte/save', b.token, { operationId: randomUUID(), payload: { karteId, changes: [{ seiteId: deck.seites[0].id, text: 'Second installation wins' }, { seiteId: deck.seites[1].id, text: 'Second seite stays' }] } });
  await request('/api/karte/save', a.token, save);
  let karte = (await request('/api/account', a.token)).kartes.find(karte => karte.id === karteId);
  assert.deepEqual(karte.seites.map(seite => seite.text), ['Second installation wins', 'Second seite stays']);
  await request('/api/karte/save', a.token, { operationId: randomUUID(), payload: { karteId, changes: [{ seiteId: deck.seites[0].id, text: 'Later first seite' }] } });
  karte = (await request('/api/account', b.token)).kartes.find(karte => karte.id === karteId);
  assert.deepEqual(karte.seites.map(seite => seite.text), ['Later first seite', 'Second seite stays']);
  await request('/api/karte/delete', a.token, { operationId: randomUUID(), payload: { karteId } });
  assert.equal((await request('/api/account', b.token)).kartes.some(karte => karte.id === karteId), false);
  evidence.checks.push('Manual creation, ordered same-seite edits, preserved other-seite edits, replay without overwriting newer content, and deletion synchronize');

  const seite = () => ({ id: randomUUID(), modules: [] });
  const draft = { name: 'Hosted configuration check', seites: [seite(), seite()] };
  const { deckId } = await request('/api/deck/save', a.token, { operationId: randomUUID(), payload: { deck: draft } });
  try {
    draft.id = deckId;
    const { karteId } = await request('/api/karte/create', a.token, { operationId: randomUUID(), payload: {
      deckId, seites: draft.seites.map((seite, index) => ({ seiteId: seite.id, text: `Retain seite ${index + 1}` }))
    } });
    const extended = structuredClone(draft); extended.seites.push(seite());
    await request('/api/deck/save', b.token, { operationId: randomUUID(), payload: { deck: extended, baseSeiteIds: draft.seites.map(seite => seite.id) } });
    const appended = (await request('/api/account', a.token)).kartes.find(karte => karte.id === karteId);
    assert.deepEqual(appended.seites.map(seite => [seite.text, seite.status]), [['Retain seite 1', null], ['Retain seite 2', null], ['', null]]);
    const removal = { deck: { ...extended, seites: [extended.seites[0], extended.seites[2]] }, baseSeiteIds: extended.seites.map(seite => seite.id) };
    const warning = await request('/api/deck/save', a.token, { operationId: randomUUID(), payload: removal }, 409);
    assert.equal(warning.code, 'content_loss');
    await request('/api/karte/save', b.token, { operationId: randomUUID(), payload: { karteId, changes: [{ seiteId: draft.seites[1].id, text: 'Remote edit after the warning' }] } });
    const changed = await request('/api/deck/save', a.token, { operationId: randomUUID(), payload: { ...removal, confirmation: warning.details.confirmation } }, 409);
    assert.equal(changed.code, 'content_loss');
    assert.notEqual(changed.details.confirmation, warning.details.confirmation);
    await request('/api/deck/save', a.token, { operationId: randomUUID(), payload: { ...removal, confirmation: changed.details.confirmation } });
    const stale = await request('/api/deck/save', b.token, { operationId: randomUUID(), payload: { deck: draft, baseSeiteIds: draft.seites.map(seite => seite.id) } }, 409);
    assert.equal(stale.code, 'deleted');
    const retained = (await request('/api/account', b.token)).kartes.find(karte => karte.id === karteId);
    assert.deepEqual(retained.seites.map(seite => [seite.seite_id, seite.text]), [[draft.seites[0].id, 'Retain seite 1'], [extended.seites[2].id, '']]);
    evidence.checks.push('Concurrent deck configuration: empty appends, retained seite identity, content-loss confirmation revalidated after a remote edit, and stale deleted-seite rejection');
  } finally {
    await request('/api/deck/delete', a.token, { operationId: randomUUID(), payload: { deckId } });
  }
} finally {
  for (const { token } of clients) await request('/api/logout', token, {}).catch(() => {});
}
await mkdir('.data', { recursive: true });
await writeFile('.data/hosted-smoke.json', JSON.stringify(evidence, null, 2) + '\n');
console.log('Hosted API smoke passed. Three sample captures remain in My Deck; evidence is in .data/hosted-smoke.json.');
