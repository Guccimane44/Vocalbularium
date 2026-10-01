import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import test, { createTestApplication, createTestStore } from './helpers/database.mjs';
import { legacyDatabase, oldFingerprint } from './helpers/legacy-database.mjs';
import { migrateDatabase } from '../scripts/migrate.mjs';
import { AccountStore } from '../src/core/store.mjs';
import { Generation } from '../src/server/generation.mjs';
import { currentValue, currentHash, legacyValue } from '@vocabularium/contracts';

const session = { installationId: 'old-installation', sessionId: 'old-session', epoch: 1 };
const content = 'A card on a page; cardId and pageId are user text. 幸福';

test('populated upgrade preserves content, identity, receipts, staged results and old generation journal', async t => {
  const key = 'populated-terminology';
  const database = await legacyDatabase(t, key);
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-terminology-outbox-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const oldSave = { cardId: 'old-card', changes: [{ pageId: 'front', text: 'earlier committed text' }] };
  const client = new pg.Client({ connectionString: database.databaseUrl }); await client.connect();
  let receipt;
  try {
    await client.query("INSERT INTO decks(id,name) VALUES('old-deck','Cards and pages are my deck name'); INSERT INTO account VALUES(1,'old-deck')");
    for (const [position, id] of ['front', 'staged', 'journal'].entries()) await client.query('INSERT INTO layout_pages VALUES($1,$2,$3,$4)', [id,'old-deck',position,'[]']);
    await client.query('INSERT INTO installations VALUES($1,$2,$3)', [session.installationId,1,session.sessionId]);
    await client.query('INSERT INTO cards(id,deck_id,selected_text,created_at,interpretation) VALUES($1,$2,$3,$4,$5)', ['old-card','old-deck',content,'2026-09-01T00:00:00.000Z',JSON.stringify({ inputType:'word_phrase',sourceLanguage:'English' })]);
    await client.query('INSERT INTO pages(card_id,page_id,text) VALUES($1,$2,$3)', ['old-card','front',content]);
    for (const id of ['staged','journal']) {
      await client.query('INSERT INTO attempts(id,card_id,page_id,installation_id,session_id,epoch,modules,result) VALUES($1,$2,$3,$4,$5,1,$6,$7)', [`attempt-${id}`,'old-card',id,session.installationId,session.sessionId,'[]',id==='staged'?JSON.stringify({ok:true,text:content}):null]);
      await client.query("INSERT INTO pages(card_id,page_id,status,attempt_id) VALUES($1,$2,'loading',$3)", ['old-card',id,`attempt-${id}`]);
    }
    receipt = (await client.query('INSERT INTO receipts(operation_id,fingerprint,result) VALUES($1,$2,$3) RETURNING *', ['old-save',oldFingerprint('save-pages',oldSave),JSON.stringify({cardId:'old-card'})])).rows[0];
  } finally { await client.end(); }
  await writeFile(join(directory,'attempt-journal.json'),JSON.stringify({ok:true,text:content}));
  await migrateDatabase(database.databaseUrl);
  const store = await AccountStore.open({ ...database, outbox:directory }); database.resources.push(store);
  const snapshot = await store.snapshot();
  assert.equal(snapshot.name,'Cards and pages are my deck name');
  assert.deepEqual(snapshot.seites.map(seite=>seite.id),['front','staged','journal']);
  const karte = await store.karte('old-card');
  assert.equal(karte.selected_text,content); assert.equal(karte.created_at,'2026-09-01T00:00:00.000Z');
  assert.equal(karte.seites[0].text,content); assert.equal(karte.interpretation.sourceLanguage,'English');
  const replay = await store.saveSeites('old-save',currentValue(oldSave));
  assert.equal(replay.replayed,true); assert.equal(String(replay.sequence),String(receipt.sequence));
  assert.equal(replay.karteId,'old-card'); assert.equal((await store.karte('old-card')).seites[0].text,content);
  await assert.rejects(store.saveSeites('old-save',{...currentValue(oldSave),changes:[]}),{code:'operation_reused'});
  await store.database.transaction(async()=>{
    const after=await store.database.one('SELECT * FROM receipts WHERE operation_id=$1',['old-save']);
    assert.equal(after.fingerprint,receipt.fingerprint); assert.equal(after.result,receipt.result);
  });
  const generation = await Generation.create(store,{interpret:async()=>{throw new Error('No provider calls permitted');}});
  database.resources.push(generation);
  assert.deepEqual((await store.attempt('attempt-journal')).result,{ok:true,text:content});
  assert.deepEqual((await store.attempt('attempt-staged')).result,{ok:true,text:content});
  await assert.rejects(readFile(join(directory,'attempt-journal.json')),{code:'ENOENT'});
  for(const id of ['staged','journal']) await store.publish(`publish-${id}`,{attemptId:`attempt-${id}`,session});
  assert.deepEqual((await store.karte('old-card')).seites.map(seite=>seite.text),[content,content,content]);
  await generation.close(); await store.close();

  const app = await createTestApplication(t,{databaseKey:key}); const origin=await app.start({port:0});
  const login=await fetch(origin+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'admin'})}).then(r=>r.json());
  const request=async(path,body,current=false)=>{
    const response=await fetch(origin+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${login.token}`,...(body?{'Content-Type':'application/json'}:{}),...(current?{'X-Vocabularium-Terminology':'karte-seite'}:{})},body:body&&JSON.stringify(body)});
    return {status:response.status,data:await response.json()};
  };
  const legacy=await request('/api/cards/old-card'); assert.equal(legacy.status,200); assert.equal(legacy.data.pages[0].page_id,'front');
  const modern=await request('/api/kartes/old-card'); assert.equal(modern.data.seites[0].seite_id,'front');
  assert.deepEqual(currentValue(legacy.data),modern.data);
  const oldReplay=await request('/api/card/save',{operationId:'old-save',payload:oldSave});
  assert.equal(oldReplay.data.cardId,'old-card'); assert.equal(oldReplay.data.replayed,true);
  const newReplay=await request('/api/karte/save',{operationId:'old-save',payload:currentValue(oldSave)});
  assert.equal(newReplay.data.karteId,'old-card'); assert.equal(newReplay.data.sequence,oldReplay.data.sequence);
  // A pending old operation first sent after upgrade remains the same operation
  // when a new build later retries it. Duplicate content remains separate items.
  const pending={deckId:'old-deck',pages:[{pageId:'front',text:content}]};
  const saved=await request('/api/card/create',{operationId:'pending-create',payload:pending});
  const again=await request('/api/karte/create',{operationId:'pending-create',payload:currentValue(pending)});
  assert.equal(again.data.karteId,saved.data.cardId); assert.equal(again.data.replayed,true);
  assert.equal((await app.store.kartes()).length,2);
  const cached=await request('/api/account'); assert.ok(cached.data.cards); assert.ok(cached.data.decks[0].pages);
  const current=await request('/api/account',undefined,true); assert.ok(current.data.kartes); assert.ok(current.data.decks[0].seites);
  const mixed=await request('/api/karte/save',{operationId:'mixed',payload:{cardId:'old-card',karteId:'old-card',changes:[]}});
  assert.equal(mixed.status,400); assert.equal((await app.store.kartes()).length,2);
  await app.close();
});

test('recovery adapters preserve operation identity, arbitrary text, draft dictionaries and legacy links', async t => {
  const old={operationId:'keep-op',path:'/api/card/save',payload:{operationId:'keep-op',payload:{cardId:'cardId',changes:[{pageId:'pageId',text:content}]}},state:'pending'};
  const draft={route:'#card/cardId/pageId',cardId:'cardId',pageIds:['pageId'],base:{cardId:content},texts:{pageId:content},pending:{type:'save-card',...old}};
  const current=currentValue(draft);
  assert.equal(current.route,'#karte/cardId/pageId'); assert.equal(current.pending.path,'/api/karte/save');
  assert.equal(current.pending.type,'save-karte'); assert.equal(current.pending.operationId,'keep-op');
  assert.deepEqual(current.base,draft.base); assert.deepEqual(current.texts,draft.texts);
  assert.deepEqual(legacyValue(current),draft);
  assert.equal(currentHash('#new-card/deck/pageId'),'#new-karte/deck/pageId');
  assert.equal(currentHash('#configure/deck'),'#configure/deck');
  const store=await createTestStore(t),snapshot=await store.snapshot();
  const sessionNow={...session,sessionId:'after-upgrade',epoch:2}; await store.openSession('new-session',sessionNow);
  const pending={session,selectedText:content,snapshot:legacyValue(snapshot)};
  const result=await store.capture('old-pending-capture',currentValue(pending),{recoverySession:sessionNow});
  const replay=await store.capture('old-pending-capture',currentValue(pending),{recoverySession:sessionNow});
  assert.equal(result.interrupted,true); assert.equal(replay.karteId,result.karteId); assert.equal(replay.replayed,true);
  assert.equal((await store.kartes()).length,1); assert.ok((await store.karte(result.karteId)).seites.every(seite=>seite.status==='failed'));
});

test('legacy preparation receipts, removal confirmations and list cursors remain valid after rename', async t => {
  const store = await createTestStore(t), snapshot = await store.snapshot();
  await store.openSession('compat-session',session);
  const payload = { session, selectedText: content };
  await store.database.transaction(() => store.database.run('INSERT INTO receipts(operation_id,fingerprint,result) VALUES($1,$2,$3)',
    ['legacy-preparation',oldFingerprint('prepare-capture',payload),JSON.stringify({snapshot:legacyValue(snapshot)})]));
  const prepared = await store.prepareCapture('legacy-preparation',payload);
  assert.equal(prepared.replayed,true); assert.deepEqual(prepared.snapshot,snapshot);
  const first = await store.createManual('cursor-first',{deckId:snapshot.id,seites:[{seiteId:snapshot.seites[1].id,text:content}]});
  await store.createManual('cursor-second',{deckId:snapshot.id,seites:[]});
  const batch = await store.listKartes(snapshot.id,{limit:1});
  const oldCursor=JSON.parse(Buffer.from(batch.nextCursor,'base64url').toString('utf8'));
  oldCursor.kind=oldCursor.kind.replace(/^kartes:/,'cards:');
  const next=await store.listKartes(snapshot.id,{limit:1,cursor:Buffer.from(JSON.stringify(oldCursor)).toString('base64url')});
  assert.equal(next.kartes.length,1); assert.notEqual(next.kartes[0].id,batch.kartes[0].id);
  const { createHash } = await import('node:crypto');
  const oldConfirmation=createHash('sha256').update(JSON.stringify([{card_id:first.karteId,page_id:snapshot.seites[1].id,text:content}])).digest('hex');
  const removal={deck:{...snapshot,seites:[snapshot.seites[0]]},baseSeiteIds:snapshot.seites.map(seite=>seite.id),confirmation:oldConfirmation};
  await store.saveDeck('old-confirmation',removal);
  assert.equal((await store.karte(first.karteId)).seites.length,1);
  await store.deleteKarte('legacy-delete-kind',first.karteId);
  await store.database.transaction(async()=>{
    const receipt=await store.database.one('SELECT fingerprint FROM receipts WHERE operation_id=$1',['legacy-delete-kind']);
    assert.equal(receipt.fingerprint,oldFingerprint('delete-card',{cardId:first.karteId}));
  });
});

test('terminology adapters preserve binary sort keys in their JSON wire representation', () => {
  const row = { karteId: 'synthetic-karte', front_sort_key: Buffer.from([0, 97, 0, 98]) };
  const wire = JSON.parse(JSON.stringify(row));
  assert.deepEqual(currentValue(row), wire);
  assert.deepEqual(legacyValue(row), { cardId: row.karteId, front_sort_key: wire.front_sort_key });
  assert.deepEqual(currentValue(legacyValue(row)), wire);
});
