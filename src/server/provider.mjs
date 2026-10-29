import { composeModule, promptVersion } from '@vocabularium/domain/composer';
import { isParentType } from '@vocabularium/domain/parents';
import { randomUUID } from 'node:crypto';

// What every provider shares (D11): the composer builds the request, and this
// wraps the adapter's transport with the timeout, diagnostics, error codes and
// the result's outer checks. The domain checks the content afterwards (D09).
// An adapter extends Provider with `prompts(request)`, what it sends, and
// `send(request, prompts, signal, sessionId, reply)`, which fills `reply` with
// the response's status, its raw body and the model's text.

export const failure = (code, message) => Object.assign(new Error(message), { code });
const TIMEOUT = 60000;

// Every required part is there: a text part non-empty (and one of its enum,
// if any), an object part an object. Prompted JSON is no schema guarantee.
function requiredParts(value, schema) {
  for (const key of schema.required) {
    const field = schema.properties[key];
    if (field.type === 'object') {
      if (!value[key] || typeof value[key] !== 'object' || Array.isArray(value[key])) throw new Error();
      continue;
    }
    if (!Object.hasOwn(value, key) || typeof value[key] !== field.type || !value[key].trim()) throw new Error();
    if (field.enum && !field.enum.includes(value[key])) throw new Error();
  }
}

// The one repair: a reply that is not JSON, for a request with a core and
// facets, parses once a single `}` closes the core before its "facets" (the
// slip deepseek-v4.1-flash makes in a few percent of Chinese replies). The
// repaired object still passes every check; anything else stays invalid.
function parse(content, schema) {
  try { return JSON.parse(content); }
  catch (error) {
    const at = content.search(/,\s*"facets"\s*:(?![\s\S]*,\s*"facets"\s*:)/);
    if (!schema.properties.core || !schema.properties.facets || at < 0) throw error;
    return JSON.parse(`${content.slice(0, at)}}${content.slice(at)}`);
  }
}

export class Provider {
  // A composed request's result as an object with the request's outer shape.
  async complete(request, signal, sessionId = randomUUID()) {
    const started = performance.now();
    const trace = (event, extra = {}) => {
      try { this.diagnostic?.({ event, phase: request.name, pageId: sessionId, model: this.model, promptVersion: promptVersion(request), maxTokens: request.maxTokens, ...extra }); }
      catch { /* Logging never changes generation results. */ }
    };
    const prompts = this.prompts(request);
    trace('provider.request', { outcome: 'started', content: { prompts } });
    const reply = {};
    try {
      await this.send(request, prompts, AbortSignal.any([AbortSignal.timeout(TIMEOUT), ...(signal ? [signal] : [])]), sessionId, reply);
      let value;
      try {
        if (typeof reply.content !== 'string') throw new Error();
        value = parse(reply.content, request.schema);
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
        if (Object.keys(value).some(key => !Object.hasOwn(request.schema.properties, key))) throw new Error();
        requiredParts(value, request.schema);
      } catch { throw failure('provider_invalid', 'Generation returned an invalid result.'); }
      trace('provider.response', { outcome: 'succeeded', status: reply.status, durationMs: Math.round(performance.now() - started), content: { output: reply.raw } });
      return value;
    } catch (error) {
      trace('provider.response', { outcome: 'failed', severity: 'error', status: reply.status, errorType: error.name,
        errorCode: error.code, durationMs: Math.round(performance.now() - started), content: { output: reply.raw } });
      throw error;
    }
  }
  // A parent module (D08) as structured data (D09): its core, its flags first,
  // and its facets, in one call (D17); with a core, a facet's own Retry (0.7.3);
  // with a previous core, a card's Retry that keeps its reading (D19).
  async generate({ module, selectedText, context, facets, core, previous, language, sessionId }, signal) {
    if (!isParentType(module.type)) throw new Error('Unsupported generation module.');
    return this.complete(composeModule({ module, selectedText, context, facets: facets ?? [], core, previous, language }), signal, sessionId);
  }
}
