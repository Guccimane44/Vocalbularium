// @ts-check
// Generation: capture, runs and their attempts, staging a provider's result,
// and publishing it into the component that asked for it.
import { randomUUID } from 'node:crypto';
import { blockText, mainKeyOf, noteDocument, textBlocks } from '@vocabularium/domain/pages';
import { generationTargets } from '@vocabularium/domain/page-modules';
import { isParentType } from '@vocabularium/domain/parents';
import { ruledOutOf } from '@vocabularium/domain/render';
import { hasFacetContent, isEmptyContent, parentContentOf, parentDocument, providerCore, validateParentContent } from '@vocabularium/domain/content';
import { hasText } from '@vocabularium/domain/markdown';
/** @import { BrowserSession, CapturePreparationRequest, Component, PageCaptureRequest, PageGenerateRequest, PublishRequest } from '@vocabularium/contracts' */
/** @import { ParentContent } from '@vocabularium/domain/content' */
/** @import { FacetType, ParentType } from '@vocabularium/domain/parents' */
/** @import { Attempt, AttemptModule, AttemptResult, AttemptRow, ComponentRow, GenerationEntry, GenerationRecord } from './store-records.js' */
import { StoreError, fail, digest, textValue, withFacets } from './store-common.mjs';
import { PageStore } from './store-pages.mjs';

// The generation record after a published attempt (D11): per part with
// content, the model and prompt version that produced it. A whole attempt
// records the core and each facet it produced; a facet's own Retry only that
// facet, the others keeping theirs. A result without a record leaves none.
// The core a card's Retry starts from (D19): the core the card has saved, the
// user's edits included, without its blank fields, or nothing when it has none.
// A core written for another main key has no reading of this one (0.13.2): once
// the user changes the main key, the card generates as on its first attempt.
const sameKey = (/** @type {string} */ a, /** @type {string} */ b) => a.trim().normalize('NFC') === b.trim().normalize('NFC');
/** @param {string} moduleType @param {Component['content']} content @param {string} mainKey @returns {{ previous?: Record<string, unknown> }} */
function previousOf(moduleType, content, mainKey) {
  const data = isParentType(moduleType) ? parentContentOf(content) : null;
  // A Pronunciation card has no text of its own: its reading is its language (D24).
  const read = data && (hasText(data.core) || (data.header.kind === 'pronunciation' && Boolean(data.header.language)));
  if (!data || !read || !sameKey(data.header.key, mainKey)) return {};
  const core = Object.entries(providerCore(/** @type {ParentType} */ (moduleType), data))
    .filter(([, value]) => Array.isArray(value) ? value.some(hasText) : typeof value !== 'string' || hasText(value));
  return core.length ? { previous: Object.fromEntries(core) } : {};
}
/** @param {GenerationRecord | null} previous @param {AttemptModule} module @param {ParentContent} content @param {GenerationEntry | undefined} made @returns {GenerationRecord | null} */
function generationAfter(previous, module, content, made) {
  const entry = made?.prompt ? { model: made.model ?? null, prompt: made.prompt } : null;
  if (!module.retry) return entry ? Object.fromEntries(['core', ...Object.keys(content.facets)].map(part => [part, entry])) : null;
  const record = { ...(previous ?? {}) };
  if (entry && hasFacetContent(content, module.retry)) record[module.retry] = entry;
  else delete record[module.retry];
  return Object.keys(record).length ? record : null;
}

export class GenerationStore extends PageStore {
  loadingAttempts() {
    return this.database.transaction(() => /** @type {Promise<Pick<AttemptRow, 'id' | 'page_id' | 'run_id' | 'session_id' | 'result'>[]>} */ (this.database.all("SELECT id, page_id, run_id, session_id, result FROM component_attempts WHERE state = 'loading'")));
  }
  /** @param {string} operationId @param {PageCaptureRequest['payload']} payload @param {{ recoverySession?: BrowserSession }} [options] */
  async capture(operationId, { session, mainKey, context, snapshot }, { recoverySession } = {}) {
    return await this.command(operationId, 'capture', { session, mainKey, context, snapshot }, async () => {
      await this.requireSession(recoverySession ?? session);
      const interrupted = recoverySession && (recoverySession.sessionId !== session.sessionId || recoverySession.epoch !== session.epoch);
      if (recoverySession && (recoverySession.installationId !== session.installationId || recoverySession.epoch < session.epoch)) {
        fail('wrong_session', 'Capture recovery belongs to its originating installation.');
      }
      if (typeof mainKey !== 'string' || mainKey.length === 0) fail('invalid', 'Select some text first.');
      if (context !== undefined) textValue(context, 'Context must be text.');
      const deck = await this.deck(snapshot.id);
      // Capture follows the deck's current configuration, not the prepared snapshot:
      // Context taken while the deck had the Context module is dropped if it no longer does.
      const contextModule = deck.modules.find(module => module.type === 'context');
      // Context is markdown (D10, amended a fourth time): stored escaped, the main key highlighted.
      const values = new Map(contextModule && context ? [[contextModule.id, noteDocument(context, mainKey)]] : []);
      const id = await this.insertPage(deck, { selectedText: mainKey, mainKey, values });
      const { attemptIds } = await this.startRun(id, session, generationTargets({ scope: 'capture' }, (await this.page(id)).components));
      if (interrupted) for (const attemptId of attemptIds) await this.failAttempt(attemptId);
      return { pageId: id, interrupted: Boolean(interrupted) };
    });
  }
  /** @param {string} operationId @param {CapturePreparationRequest['payload']} payload */
  async prepareCapture(operationId, { session, mainKey }) {
    return await this.command(operationId, 'prepare-capture', { session, mainKey }, async () => {
      await this.requireSession(session);
      if (typeof mainKey !== 'string' || !mainKey.length) fail('invalid', 'Select some text first.');
      return { snapshot: (await this.snapshot()) };
    });
  }
  // One run per request. Since D17 its attempts share no reading of the main
  // key: each module reads it in its own request.
  /** @param {string} pageId @param {BrowserSession} session @param {readonly Component[]} targets @param {{ facet?: string | null, mainKey?: string }} [options] */
  async startRun(pageId, session, targets, { facet, mainKey = '' } = {}) {
    if (!targets.length) return { runId: null, attemptIds: [] };
    const runId = randomUUID();
    await this.database.run("INSERT INTO generation_runs (id, page_id) VALUES ($1, $2)", [runId, pageId]);
    const attemptIds = [];
    for (const { id: componentId, moduleInstanceId, moduleType, facets, waitingFacets, status, content } of targets) {
      const attemptId = randomUUID();
      // An attempt generates the facets its parent has when it starts (D08).
      // A facet's own attempt generates that facet alone: afterwards the
      // content holds what it held before, and that facet. It keeps the
      // content meanwhile, and how to put the component back if it fails.
      const module = facet
        // A facet's own Retry targets a parent component, which has its facets.
        ? { id: moduleInstanceId, type: moduleType, facets: /** @type {string[]} */ (facets).filter(each => each === facet || !waitingFacets?.includes(each)),
          retry: facet, prior: { status, waiting: Boolean(waitingFacets?.includes(facet)) } }
        // A card's Retry keeps the reading of the core it had, as saved (D19).
        : { id: moduleInstanceId, type: moduleType, ...withFacets(moduleType, facets), ...previousOf(moduleType, content, mainKey) };
      await this.database.run(`INSERT INTO component_attempts
        (id, page_id, component_id, run_id, installation_id, session_id, epoch, module) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [attemptId, pageId, componentId, runId, session.installationId, session.sessionId, session.epoch, JSON.stringify(module)]);
      if (facet) await this.database.run("UPDATE components SET status = 'loading', attempt_id = $1 WHERE page_id = $2 AND id = $3", [attemptId, pageId, componentId]);
      else await this.database.run("UPDATE components SET content = $1, status = 'loading', attempt_id = $2, generation = NULL WHERE page_id = $3 AND id = $4",
        [JSON.stringify(textBlocks('')), attemptId, pageId, componentId]);
      attemptIds.push(attemptId);
    }
    return { runId, attemptIds };
  }
  // A facet's own attempt that fails (0.7.3) leaves the content as it was and
  // the component in its earlier state; a facet that was waiting still waits.
  /** @param {Pick<Attempt, 'id' | 'module'>} attempt */
  async keepAfterFacetFailure(attempt) {
    const { retry, prior } = attempt.module;
    await this.database.run("UPDATE components SET status = $2 WHERE attempt_id = $1 AND status = 'loading'", [attempt.id, prior?.status ?? null]);
    const module = prior?.waiting ? { ...attempt.module, facets: (attempt.module.facets ?? []).filter(item => item !== retry) } : attempt.module;
    await this.database.run("UPDATE component_attempts SET state = 'failed', result = NULL, module = $2 WHERE id = $1 AND state = 'loading'", [attempt.id, JSON.stringify(module)]);
  }
  // Each component's generation record (D11), by component ID; the interface does not show it.
  /** @param {string} pageId @returns {Promise<Record<string, GenerationRecord>>} */
  async generationRecords(pageId) {
    return this.database.transaction(async () => {
      const rows = /** @type {{ id: string, generation: string }[]} */ (await this.database.all('SELECT id, generation FROM components WHERE page_id = $1 AND generation IS NOT NULL', [pageId]));
      return Object.fromEntries(rows.map(row => [row.id, JSON.parse(row.generation)]));
    });
  }
  /** @param {string} attemptId */
  async failAttempt(attemptId) {
    return this.database.transaction(async () => {
      const row = /** @type {Pick<AttemptRow, 'id' | 'module'> | undefined} */ (await this.database.one("SELECT id, module FROM component_attempts WHERE id = $1", [attemptId]));
      const attempt = row && { ...row, module: /** @type {AttemptModule} */ (JSON.parse(row.module)) };
      if (attempt?.module.retry) return this.keepAfterFacetFailure(attempt);
      await this.database.run("UPDATE components SET content = $2, status = 'failed', generation = NULL WHERE attempt_id = $1 AND status = 'loading'", [attemptId, JSON.stringify(textBlocks(''))]);
      await this.database.run("UPDATE component_attempts SET state = 'failed', result = NULL WHERE id = $1 AND state = 'loading'", [attemptId]);
    });
  }
  /** @param {BrowserSession} session */
  async pendingAttempts(session) {
    return this.database.transaction(async () => {
      await this.requireSession(session);
      const attempts = [];
      for (const { id } of /** @type {Pick<AttemptRow, 'id'>[]} */ (await this.database.all("SELECT id FROM component_attempts WHERE installation_id = $1 AND session_id = $2 AND state = 'loading'", [session.installationId, session.sessionId]))) attempts.push(await this.attempt(id));
      return attempts;
    });
  }
  // Provider completion only stages a result. It cannot publish component content.
  /** @param {string} attemptId @param {AttemptResult} result */
  async stage(attemptId, result) {
    return this.database.transaction(async () => {
      const attempt = await this.attempt(attemptId);
      if (attempt.state !== 'loading' || attempt.result) fail('stale_attempt', 'The attempt no longer accepts results.');
      await this.requireSession({ installationId: attempt.installation_id, sessionId: attempt.session_id, epoch: attempt.epoch });
      // A generated result is structured content (D09).
      if (typeof result.ok !== 'boolean' || (result.ok && !(result.content && typeof result.content === 'object' && !Array.isArray(result.content)))) fail('invalid', 'Invalid component result.');
      // The model and prompt version that produced it (D11), when known.
      if (result.generation !== undefined && !(result.generation && typeof result.generation.prompt === 'string' &&
        (result.generation.model === null || typeof result.generation.model === 'string'))) fail('invalid', 'Invalid generation record.');
      await this.database.run("UPDATE component_attempts SET result = $1 WHERE id = $2", [JSON.stringify(result), attemptId]);
    });
  }
  /** @param {string} operationId @param {PublishRequest['payload']} payload */
  async publish(operationId, { attemptId, session }) {
    return await this.command(operationId, 'publish', { attemptId, session }, async () => {
      await this.requireSession(session);
      const attempt = await this.attempt(attemptId);
      if (attempt.installation_id !== session.installationId || attempt.session_id !== session.sessionId) {
        fail('wrong_session', 'Only the originating browser session can publish this result.');
      }
      if (attempt.state !== 'loading' || !attempt.result) fail('stale_attempt', 'No current result is ready.');
      if (attempt.module.retry && !attempt.result.ok) {
        const component = await this.database.one("SELECT id FROM components WHERE page_id = $1 AND id = $2 AND attempt_id = $3 AND status = 'loading'",
          [attempt.page_id, attempt.component_id, attemptId]);
        if (!component) fail('stale_attempt', 'The component has moved on to another attempt.');
        await this.keepAfterFacetFailure(attempt);
        return { pageId: attempt.page_id, componentId: attempt.component_id, state: 'failed' };
      }
      const state = attempt.result.ok ? 'completed' : 'failed';
      const generated = attempt.result.ok ? validateParentContent(attempt.module.type, attempt.result.content) : null;
      const content = generated ? parentDocument(generated) : textBlocks('');
      const previous = /** @type {Pick<ComponentRow, 'generation'> | undefined} */ (await this.database.one('SELECT generation FROM components WHERE page_id = $1 AND id = $2', [attempt.page_id, attempt.component_id]));
      const generation = generated ? generationAfter(previous?.generation && JSON.parse(previous.generation), attempt.module, generated, attempt.result.generation) : null;
      const changed = await this.database.run(`UPDATE components SET content = $1, status = $2, generation = $6
        WHERE page_id = $3 AND id = $4 AND attempt_id = $5 AND status = 'loading'`,
      [JSON.stringify(content), state, attempt.page_id, attempt.component_id, attemptId, generation && JSON.stringify(generation)]);
      if (!changed.rowCount) fail('stale_attempt', 'The component has moved on to another attempt.');
      await this.database.run("UPDATE component_attempts SET state = $1, result = NULL WHERE id = $2", [state, attemptId]);
      return { pageId: attempt.page_id, componentId: attempt.component_id, state };
    });
  }
  // The content a confirmed retry replaces. The client shows it, then echoes the digest.
  /** @param {readonly Component[]} targets */
  confirmationDigest(targets) {
    return digest(targets.map(component => ({ moduleInstanceId: component.moduleInstanceId, content: component.content })));
  }
  /** @param {string} operationId @param {PageGenerateRequest['payload']} payload @param {{ admit?: (count: number) => void }} [options] */
  async generate(operationId, { pageId, target, session, confirmation }, { admit } = {}) {
    return await this.command(operationId, 'generate', { pageId, target, session, confirmation }, async () => {
      await this.requireSession(session);
      const page = await this.page(pageId);
      if (!target || !['missing', 'page', 'component', 'facet'].includes(target.scope)) fail('invalid', 'Choose what to generate.');
      let targets;
      try { targets = generationTargets(target, page.components); }
      catch (error) { fail('invalid', /** @type {Error} */ (error).message); }
      if (targets.some(component => component.status === 'loading')) fail('generating', 'A component is already generating.');
      // Replacing content needs confirmation. A component with nothing in it has
      // nothing to replace, whether it never generated, failed, or generated
      // nothing (0.6.3; until then any earlier attempt needed confirmation).
      // A facet's own Retry (0.7.3) replaces only its section.
      const facet = target.scope === 'facet' ? target.facet : null;
      // A facet the card's flags rule out has nothing to generate (D17): no attempt starts.
      if (facet && targets.some(component => { const data = parentContentOf(component.content);
        return data && ruledOutOf(/** @type {ParentType} */ (component.moduleType), data)[/** @type {FacetType} */ (facet)]; })) {
        fail('invalid', 'This facet does not apply to this card.');
      }
      // Structured content (D09) is compared as data: a facet's entry, or the whole content.
      const replaced = (/** @type {Component} */ component) => {
        const data = parentContentOf(component.content);
        if (facet) return data && hasFacetContent(data, facet) ? data.facets[/** @type {FacetType} */ (facet)] : null;
        // Structured content emptied of everything has nothing to replace (0.6.3).
        return data ? (isEmptyContent(data) ? null : data) : (blockText(component.content) || null);
      };
      const replaces = targets.some(replaced);
      if (target.scope !== 'missing' && replaces) {
        const expected = facet ? digest(targets.map(component => ({ moduleInstanceId: component.moduleInstanceId, facet, content: replaced(component) })))
          : this.confirmationDigest(targets);
        if (confirmation !== expected) {
          throw new StoreError('confirmation_required', 'Retry replaces this content, including your edits.', { confirmation: expected });
        }
      }
      admit?.(targets.length);
      return { pageId, attemptIds: (await this.startRun(pageId, session, targets, { facet, mainKey: mainKeyOf(page.components) })).attemptIds };
    });
  }
}
