// @ts-check
import { composeModule, promptVersion } from '@vocabularium/domain/composer';
import { isParentType } from '@vocabularium/domain/parents';
import { randomUUID } from 'node:crypto';
/** @import { InterfaceLanguage } from '@vocabularium/contracts' */
/** @import { Request } from '@vocabularium/domain/composer' */
/** @import { GenerateModule } from '@vocabularium/domain/modules' */
// A composed request's schema, as moduleSchema builds it: an object's parts.
/** @typedef {{ properties: Record<string, { type: string, enum?: string[] }>, required: string[] }} ObjectSchema */
// What an adapter's `send` fills in.
/** @typedef {{ status?: number, raw?: string, content?: unknown }} Reply */
// A failed call: an Error with one of the provider error codes.
/** @typedef {Error & { code?: string }} ProviderError */
// What an adapter adds to Provider, and the server sets on it for diagnostics.
/** @typedef {{
  model?: string | null,
  diagnostic?: (event: Record<string, unknown>) => void,
  prompts(request: Request): unknown,
  send(request: Request, prompts: unknown, signal: AbortSignal, sessionId: string, reply: Reply): Promise<void>
}} Adapter */

// What every provider shares (D11): the composer builds the request, and this
// wraps the adapter's transport with the timeout, diagnostics, error codes and
// the result's outer checks. The domain checks the content afterwards (D09).
// An adapter extends Provider with `prompts(request)`, what it sends, and
// `send(request, prompts, signal, sessionId, reply)`, which fills `reply` with
// the response's status, its raw body and the model's text.

/** @param {string} code @param {string} message */
export const failure = (code, message) => Object.assign(new Error(message), { code });
const TIMEOUT = 60000;

// Every required part is there: a text part non-empty (and one of its enum,
// if any), an object part an object. Prompted JSON is no schema guarantee.
/** @param {Record<string, unknown>} value @param {ObjectSchema} schema */
function requiredParts(value, schema) {
  for (const key of schema.required) {
    const field = schema.properties[key];
    if (field.type === 'object') {
      if (!value[key] || typeof value[key] !== 'object' || Array.isArray(value[key])) throw new Error();
      continue;
    }
    if (!Object.hasOwn(value, key) || typeof value[key] !== field.type || !(/** @type {string} */ (value[key])).trim()) throw new Error();
    if (field.enum && !field.enum.includes(/** @type {string} */ (value[key]))) throw new Error();
  }
}

// The one repair: a reply that is not JSON, for a request with a core and
// facets, parses once a single `}` closes the core before its "facets" (the
// slip deepseek-v4.1-flash makes in a few percent of Chinese replies). The
// repaired object still passes every check; anything else stays invalid.
/** @param {string} content @param {ObjectSchema} schema @returns {unknown} */
function parse(content, schema) {
  try { return JSON.parse(content); }
  catch (error) {
    const at = content.search(/,\s*"facets"\s*:(?![\s\S]*,\s*"facets"\s*:)/);
    if (!schema.properties.core || !schema.properties.facets || at < 0) throw error;
    return JSON.parse(`${content.slice(0, at)}}${content.slice(at)}`);
  }
}

export class Provider {
  /** @param {Request} request @param {AbortSignal} [signal] @param {string} [sessionId] @returns {Promise<Record<string, unknown>>} */
  async complete(request, signal, sessionId = randomUUID()) {
    const adapter = /** @type {Provider & Adapter} */ (/** @type {unknown} */ (this));
    const started = performance.now();
    const schema = /** @type {ObjectSchema} */ (/** @type {unknown} */ (request.schema));
    /** @param {string} event @param {Record<string, unknown>} [extra] */
    const trace = (event, extra = {}) => {
      try { adapter.diagnostic?.({ event, phase: request.name, pageId: sessionId, model: adapter.model, promptVersion: promptVersion(request), maxTokens: request.maxTokens, ...extra }); }
      catch { /* Logging never changes generation results. */ }
    };
    const prompts = adapter.prompts(request);
    trace('provider.request', { outcome: 'started', content: { prompts } });
    /** @type {Reply} */
    const reply = {};
    try {
      await adapter.send(request, prompts, AbortSignal.any([AbortSignal.timeout(TIMEOUT), ...(signal ? [signal] : [])]), sessionId, reply);
      /** @type {Record<string, unknown>} */
      let value;
      try {
        if (typeof reply.content !== 'string') throw new Error();
        const parsed = parse(reply.content, schema);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
        value = /** @type {Record<string, unknown>} */ (parsed);
        if (Object.keys(value).some(key => !Object.hasOwn(schema.properties, key))) throw new Error();
        requiredParts(value, schema);
      } catch { throw failure('provider_invalid', 'Generation returned an invalid result.'); }
      trace('provider.response', { outcome: 'succeeded', status: reply.status, durationMs: Math.round(performance.now() - started), content: { output: reply.raw } });
      return value;
    } catch (caught) {
      const error = /** @type {ProviderError} */ (caught);
      trace('provider.response', { outcome: 'failed', severity: 'error', status: reply.status, errorType: error.name,
        errorCode: error.code, durationMs: Math.round(performance.now() - started), content: { output: reply.raw } });
      throw error;
    }
  }
  // A parent module (D08) as structured data (D09): its core, its flags first,
  // and its facets, in one call (D17); with a core, a facet's own Retry (0.7.3);
  // with a previous core, a card's Retry that keeps its reading (D19).
  /** @param {Parameters<GenerateModule>[0] & { context?: string, language?: InterfaceLanguage, sessionId?: string }} request @param {AbortSignal} [signal] */
  async generate({ module, selectedText, context, facets, core, previous, language, sessionId }, signal) {
    if (!isParentType(module.type)) throw new Error('Unsupported generation module.');
    return this.complete(composeModule({ module, selectedText, context, facets: facets ?? [], core, previous, language }), signal, sessionId);
  }
}
