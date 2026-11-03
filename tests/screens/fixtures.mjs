// The account every screen is captured from (0.16.0 increment A): fixed decks,
// pages and cards built through the store with the catalog's own English samples,
// so a screen changes only when the interface does.
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { formatContent } from '@vocabularium/domain/content';
import { facetsOf, isParentType } from '@vocabularium/domain/parents';
import { FakeSpeechProvider } from '../helpers/speech.mjs';

// Every capture reads this as now; the pages were made earlier the same day.
export const NOW = new Date('2026-06-15T12:00:00.000Z');
const session = { installationId: 'screens', sessionId: 'screens', epoch: 1 };

// A second of silence as WAV, so a clip has a length the player can show.
function silentWav(seconds = 1, rate = 8000) {
  const samples = seconds * rate, bytes = Buffer.alloc(44 + samples);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(36 + samples, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate, 28);
  bytes.writeUInt16LE(1, 32); bytes.writeUInt16LE(8, 34); bytes.write('data', 36); bytes.writeUInt32LE(samples, 40);
  bytes.fill(128, 44);
  return bytes;
}
export class SilentSpeech extends FakeSpeechProvider {
  bitRate = 64000;
  async send(request, signal, reply) { await super.send(request, signal, reply); reply.mime = 'audio/wav'; reply.bytes = silentWav(); }
}

const FOLDERS = { german: 'languages/german', chinese: 'languages/chinese', 'computer-science': 'expertise/computer-science',
  mathematics: 'expertise/mathematics', pronunciation: 'sound/pronunciation' };
const sample = async type => JSON.parse(await readFile(`packages/domain/src/catalog/${FOLDERS[type]}/samples/en.json`, 'utf8')).word_phrase;

// The pages a screen opens, by the module group they show and their state.
export const GROUPS = { german: ['german'], chinese: ['chinese'], expertise: ['mathematics', 'computer-science'], pronunciation: ['pronunciation'] };
export const STATES = ['complete', 'loading', 'failed'];

const waitUntil = async (predicate, message, timeout = 15000) => {
  const start = Date.now();
  while (!await predicate()) {
    if (Date.now() - start > timeout) throw new Error(`Timed out: ${message}`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
};

// A deck's colour follows its random ID until one is chosen: the new account's deck gets one at once.
export async function colourHome(store) {
  const home = await store.deck((await store.snapshot()).id);
  await store.saveDeck('screens-deck-colour', { deck: { ...home, colour: 'meaning' } });
}
// Fills the account and returns the IDs the screens open.
export async function seed(application, databaseUrl) {
  const { store, audio } = application;
  await store.openSession('screens-session', session);
  const home = await store.deck((await store.snapshot()).id);
  const useModules = (key, types) => store.saveDeck(`screens-deck-${key}`, { deck: { ...home, colour: 'meaning',
    modules: [home.modules.find(module => module.type === 'main-key'), ...types.map((type, index) => ({ id: `screens-${key}-${index}`, type, ...(isParentType(type) ? { facets: facetsOf(type) } : {}) }))] } });
  const pages = {};
  for (const [group, types] of Object.entries(GROUPS)) {
    const samples = await Promise.all(types.map(sample));
    for (const state of STATES) {
      await useModules(`${group}-${state}`, types);
      const mainKey = samples[0].core.key;
      const { pageId } = await store.capture(`screens-capture-${group}-${state}`, { session, mainKey, snapshot: await store.snapshot() });
      pages[`${group}-${state}`] = pageId;
      const components = (await store.page(pageId)).components.filter(component => types.includes(component.moduleType));
      for (const [index, component] of components.entries()) {
        if (state === 'failed') await store.failAttempt(component.attemptId);
        if (state !== 'complete') continue;
        await store.stage(component.attemptId, { ok: true, content: formatContent(component.moduleType, samples[index]) });
        const result = await store.publish(`screens-publish-${component.id}`, { attemptId: component.attemptId, session });
        const content = (await store.page(pageId)).components.find(item => item.id === component.id).content;
        await audio.afterPublish({ pageId, componentId: component.id, moduleType: component.moduleType, content, mainKey, state: result.state });
      }
      if (state === 'complete') await waitUntil(async () => (await store.clips(pageId)).every(clip => clip.state === 'ready'), `${group}: clips spoken`);
    }
  }
  // The home deck keeps the modules a new account starts with; a second deck has no pages yet.
  await store.saveDeck('screens-deck-home', { deck: { ...home, colour: 'meaning' } });
  const empty = await store.createDeck('Reading list');
  await store.saveDeck('screens-deck-empty', { deck: { ...await store.deck(empty.id), colour: 'connections' } });
  // A page made by hand: its cards wait for Generate.
  pages.new = (await store.createPage('screens-page-new', { deckId: home.id, mainKey: 'Ufer' })).pageId;
  await fixTimes(databaseUrl);
  return { deckId: home.id, emptyDeckId: empty.id, pages };
}

// Each page was made a minute after the one before, ending an hour before NOW.
async function fixTimes(databaseUrl) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows } = await client.query('SELECT id FROM pages ORDER BY created_at, id');
    for (const [index, { id }] of rows.entries()) {
      const time = new Date(NOW.getTime() - 3600_000 - (rows.length - 1 - index) * 60_000).toISOString();
      await client.query('UPDATE pages SET created_at = $2 WHERE id = $1', [id, time]);
    }
  } finally { await client.end(); }
}
