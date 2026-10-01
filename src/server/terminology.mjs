import { currentValue, legacyValue, legacyPath, usesCurrentFields } from '@vocabularium/contracts';
import { StoreError } from '../core/store.mjs';

// Older extensions retain their original request/response dialect. Shared routes
// use an explicit header for reads and accept either dialect for mutations.
export function registerTerminology(fastify) {
  fastify.decorateRequest('currentTerminology', false);
  fastify.addHook('onRequest', async request => {
    if (request.url.startsWith('/api/diagnostics/')) { request.currentTerminology = true; return; }
    request.currentTerminology = request.headers['x-vocabularium-terminology'] === 'karte-seite' ||
      /\/kartes?(?:\/|\?|$)/.test(request.url);
  });
  fastify.addHook('preValidation', async request => {
    if (request.url.startsWith('/api/diagnostics/')) return;
    request.currentTerminology ||= usesCurrentFields(request.body);
    try {
      request.body = currentValue(request.body);
      request.params = currentValue(request.params);
    } catch (error) { throw new StoreError('invalid', error.message); }
  });
  fastify.addHook('preSerialization', async (request, _reply, payload) =>
    request.currentTerminology ? payload : legacyValue(payload));
  fastify.addHook('onRoute', options => {
    if (options.method === 'HEAD' || options.config?.legacyTerminology) return;
    const old = legacyPath(options.url);
    if (old === options.url) return;
    fastify.route({ ...options, url: old,
      config: { ...options.config, legacyTerminology: true },
      schema: { ...options.schema, hide: true } });
  });
}
