// @ts-check
// Checks the store's promises about browser sessions and operation receipts on
// every ordering of a few operations, against the real AccountStore on
// PostgreSQL. A test checks the orders someone thought of; this tries them all,
// until no order adds anything new, or --depth operations long. The vocabularium-sessions skill
// says what it proves and how to read a failure.
//
//   npm run check:sessions -- [--depth <n>] [--workers 6]
//
// The rules, each checked after every step:
//   replay     An operation ID used again with the same payload returns its
//              first result and changes nothing.
//   reuse      An operation ID used again with another payload is refused and
//              changes nothing.
//   stale      An operation from a browser session that is not its
//              installation's current one changes nothing (a replay of its own
//              earlier receipt aside).
//   fenced     No attempt is still loading once its browser session has ended,
//              and a component and its attempt agree on loading or completed.
//   deleted    A deleted page never comes back, nor do its components or attempts.
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual, parseArgs } from 'node:util';
import pg from 'pg';
import { formatContent } from '@vocabularium/domain/content';
import { AccountStore } from '../src/core/store.mjs';
import { createTestDatabase } from '../tests/helpers/database.mjs';
/** @import { BrowserSession } from '@vocabularium/contracts' */

const { values: options } = parseArgs({ options: { depth: { type: 'string', default: 'Infinity' }, workers: { type: 'string', default: '6' } } });
const depth = Number(options.depth), workers = Number(options.workers);

// One installation restarts its browser (A, then B); the selection is captured from each.
/** @type {Record<'A' | 'B', BrowserSession>} */
const SESSIONS = { A: { installationId: 'laptop', sessionId: 'browser-a', epoch: 1 }, B: { installationId: 'laptop', sessionId: 'browser-b', epoch: 2 } };
const sample = JSON.parse(await readFile('packages/domain/src/catalog/languages/german/samples/en.json', 'utf8')).word_phrase;
const content = formatContent('german', sample);

/**
 * @typedef {{ pages: Map<string, string>, attempts: Map<string, string>, snapshot: any, client: pg.Client }} Known what earlier steps made: a capture's page and attempt, by capture
 * @typedef {{ name: string, operation?: string, payload?: unknown, session?: 'A' | 'B', run: (store: AccountStore, known: Known) => Promise<any> }} Step
 */
/** @type {Step[]} */
const STEPS = [
  { name: 'open A', operation: 'open-a', payload: SESSIONS.A, session: 'A', run: store => store.openSession('open-a', SESSIONS.A) },
  { name: 'open B', operation: 'open-b', payload: SESSIONS.B, session: 'B', run: store => store.openSession('open-b', SESSIONS.B) },
  { name: 'capture from A', operation: 'capture-a', payload: 'Ufer', session: 'A', run: (store, known) => capture(store, known, 'capture-a', 'A', 'Ufer') },
  { name: 'capture from B', operation: 'capture-b', payload: 'Ufer', session: 'B', run: (store, known) => capture(store, known, 'capture-b', 'B', 'Ufer') },
  { name: "reuse A's capture ID for another word", operation: 'capture-a', payload: 'Bank', session: 'A', run: (store, known) => capture(store, known, 'capture-a', 'A', 'Bank') },
  { name: "stage A's result", session: 'A', run: (store, known) => store.stage(need(known.attempts, 'capture-a'), { ok: true, content }) },
  { name: "publish A's result from A", operation: 'publish-a', session: 'A', run: (store, known) => store.publish('publish-a', { attemptId: need(known.attempts, 'capture-a'), session: SESSIONS.A }) },
  { name: "publish A's result from B", operation: 'publish-a-from-b', session: 'B', run: (store, known) => store.publish('publish-a-from-b', { attemptId: need(known.attempts, 'capture-a'), session: SESSIONS.B }) },
  { name: "delete A's page", operation: 'delete-a', run: (store, known) => store.deletePage('delete-a', need(known.pages, 'capture-a')) }
];
// A step that needs something no earlier step made is not run.
class Disabled extends Error {}
/** @param {Map<string, string>} map @param {string} key */
const need = (map, key) => { const value = map.get(key); if (!value) throw new Disabled(); return value; };
/** @param {AccountStore} store @param {Known} known @param {string} operation @param {'A' | 'B'} session @param {string} mainKey */
async function capture(store, known, operation, session, mainKey) {
  const result = await store.capture(operation, { session: SESSIONS[session], mainKey, snapshot: known.snapshot });
  if (!known.pages.has(operation)) {
    known.pages.set(operation, result.pageId);
    const { rows } = await known.client.query("SELECT attempt_id FROM components WHERE page_id = $1 AND module_type = 'german'", [result.pageId]);
    if (rows[0]?.attempt_id) known.attempts.set(operation, rows[0].attempt_id);
  }
  return result;
}

// Everything a step could change, in a stable order.
/** @param {pg.Client} client */
async function state(client) {
  const read = async (/** @type {string} */ sql) => (await client.query(sql)).rows;
  return {
    installations: await read('SELECT id, epoch, session_id FROM installations ORDER BY id'),
    receipts: await read('SELECT operation_id, fingerprint, result FROM receipts ORDER BY sequence'),
    pages: await read('SELECT id, deck_id, selected_text FROM pages ORDER BY id'),
    components: await read('SELECT page_id, id, module_type, position, content, status, attempt_id FROM components ORDER BY page_id, position'),
    attempts: await read('SELECT id, page_id, component_id, installation_id, session_id, epoch, state, result FROM component_attempts ORDER BY id')
  };
}

// How each step ended, over the whole run, to show what the orders exercised.
/** @type {Map<string, number>} */
const tally = new Map();
/** @param {any} value */
const withoutSequence = value => value && typeof value === 'object' ? (({ sequence, replayed, ...rest }) => rest)(value) : value;

/**
 * Runs one order of steps on a fresh copy of the template. Returns the first broken rule, if any, and whether
 * the last step changed anything: a step that changed nothing leaves the order equal to a shorter one, so
 * extending it would only repeat orders already checked.
 * @param {string} template @param {string} adminUrl @param {Step[]} order
 */
async function explore(template, adminUrl, order) {
  const name = `${template}_${Math.random().toString(16).slice(2, 10)}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}" TEMPLATE "${template}"`);
  const url = new URL(adminUrl); url.pathname = `/${name}`;
  const store = await AccountStore.open({ databaseUrl: url.href });
  const client = new pg.Client({ connectionString: url.href });
  await client.connect();
  /** @type {Known} */
  const known = { pages: new Map(), attempts: new Map(), snapshot: await store.snapshot(), client };
  /** @type {Map<string, { payload: unknown, result: unknown }>} */
  const receipts = new Map();
  /** @type {Partial<Record<string, string>>} */
  const current = {};
  const deleted = new Set();
  /** @type {string[]} */
  const trail = [];
  let last = false;
  try {
    for (const step of order) {
      const before = await state(client);
      /** @type {any} */ let result = null;
      /** @type {any} */ let error = null;
      try { result = await step.run(store, known); } catch (thrown) {
        if (thrown instanceof Disabled) { tally.set('not possible yet', (tally.get('not possible yet') ?? 0) + 1); return { failure: null, extend: false }; }
        error = thrown;
      }
      const after = await state(client);
      const unchanged = isDeepStrictEqual(before, after);
      const outcome = error ? `refused (${error.code ?? error.message})` : result?.replayed ? 'replayed' : 'done';
      tally.set(outcome, (tally.get(outcome) ?? 0) + 1);
      trail.push(`${step.name}: ${outcome}`);
      const broken = (/** @type {string} */ rule, /** @type {string} */ why) => ({ failure: { rule, why, trail: [...trail] }, extend: false });
      last = !unchanged;

      const earlier = step.operation ? receipts.get(step.operation) : undefined;
      if (earlier && isDeepStrictEqual(earlier.payload, step.payload)) {
        if (error || !result?.replayed) return broken('replay', `${step.operation} used again with the same payload was not replayed`);
        if (!isDeepStrictEqual(withoutSequence(result), withoutSequence(earlier.result))) return broken('replay', `${step.operation} replayed another result`);
        if (!unchanged) return broken('replay', `replaying ${step.operation} changed the database`);
        continue;
      }
      if (earlier) {
        if (error?.code !== 'operation_reused') return broken('reuse', `${step.operation} used with another payload was ${error ? `refused as ${error.code}` : 'accepted'}`);
        if (!unchanged) return broken('reuse', `refusing ${step.operation} changed the database`);
        continue;
      }
      const session = step.session && SESSIONS[step.session];
      const isCurrent = session && step.operation !== 'open-a' && step.operation !== 'open-b' ? current[session.installationId] === session.sessionId : true;
      if (!isCurrent && !error) return broken('stale', `${step.name} succeeded from a browser session that had ended or never opened`);
      if (!isCurrent && !unchanged) return broken('stale', `${step.name} from an ended browser session changed the database`);
      if (error && !unchanged) return broken('stale', `${step.name} was refused (${error.code}) but changed the database`);
      if (!error) {
        if (step.operation) receipts.set(step.operation, { payload: step.payload, result });
        if (step.name.startsWith('open ') && session) current[session.installationId] = session.sessionId;
        if (step.operation === 'delete-a') deleted.add(result.pageId);
      }

      // State rules, after every step.
      const sessionOf = new Map(after.installations.map(row => [row.id, row.session_id]));
      for (const attempt of after.attempts) {
        if (attempt.state === 'loading' && sessionOf.get(attempt.installation_id) !== attempt.session_id) return broken('fenced', `attempt of ${attempt.session_id} still loading after its session ended`);
      }
      const attemptState = new Map(after.attempts.map(row => [row.id, row.state]));
      for (const component of after.components) {
        if (!component.attempt_id || !['loading', 'completed'].includes(component.status)) continue;
        if (attemptState.get(component.attempt_id) !== component.status) return broken('fenced', `a ${component.module_type} component is ${component.status} but its attempt is ${attemptState.get(component.attempt_id)}`);
      }
      for (const pageId of deleted) {
        if ([...after.pages, ...after.components.map(row => ({ id: row.page_id })), ...after.attempts.map(row => ({ id: row.page_id }))].some(row => row.id === pageId)) return broken('deleted', `deleted page ${pageId} is still there or came back`);
      }
    }
    return { failure: null, extend: last };
  } finally {
    await client.end();
    await store.close();
    await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`).catch(() => {});
    await admin.end();
  }
}

const fixture = /** @type {import('node:test').TestContext} */ (/** @type {unknown} */ ({}));
const template = await createTestDatabase(fixture, 'sessions');
const templateName = new URL(template.databaseUrl).pathname.slice(1);
// A new account: its deck, My Deck, makes a German card on capture.
const setup = await AccountStore.open({ databaseUrl: template.databaseUrl });
await setup.close();
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL ?? 'postgresql://vocabularium_test@127.0.0.1:5432/postgres';

// Breadth first: every one-step order, then each order that changed something, extended by every step.
const started = Date.now();
/** @type {{ rule: string, why: string, trail: string[] }[]} */
const failures = [];
/** @type {Step[][]} */
let level = STEPS.map(step => [step]);
let explored = 0;
for (let length = 1; length <= depth && level.length && !failures.length; length++) {
  /** @type {Step[][]} */
  const extended = [];
  let next = 0;
  await Promise.all(Array.from({ length: workers }, async () => {
    while (next < level.length && failures.length < 5) {
      const order = level[next++];
      const { failure, extend } = await explore(templateName, adminUrl, order);
      explored++;
      if (failure) failures.push(failure);
      else if (extend && length < depth) for (const step of STEPS) extended.push([...order, step]);
    }
  }));
  level = extended;
}
await template.cleanup();
if (failures.length) {
  // Breadth first, so the first is a shortest order that breaks a rule.
  const [{ rule, why, trail }] = failures;
  console.error(`Broke "${rule}": ${why}.\n  ${trail.map((line, index) => `${index + 1}. ${line}`).join('\n  ')}`);
  if (failures.length > 1) console.error(`(${failures.length - 1} more orders of the same length broke a rule.)`);
  process.exitCode = 1;
} else {
  const bound = Number.isFinite(depth) ? `up to ${depth} steps long` : 'until none added anything new';
  console.log(`Checked ${explored} orders of ${STEPS.length} operations, ${bound} (orders equal to a shorter one left out), in ${((Date.now() - started) / 1000).toFixed(0)} s: every rule held after every step.`);
  console.log(`Steps: ${[...tally].sort((a, b) => b[1] - a[1]).map(([outcome, count]) => `${count} ${outcome}`).join(', ')}.`);
}
