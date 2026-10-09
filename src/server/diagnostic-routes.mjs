import { StoreError } from '../core/store.mjs';

export function registerDiagnosticRoutes(api, diagnostics) {
  const schema = { tags: ['diagnostics'], security: [{ bearerAuth: [] }] };
  api.get('/api/diagnostics/status', { schema }, async () => { await diagnostics.ready; return diagnostics.status(); });
  api.get('/api/diagnostics/events', { schema }, async request => {
    try { return await diagnostics.inspect(request.query); }
    catch { throw new StoreError('invalid', 'Choose valid diagnostic filters.'); }
  });
  api.post('/api/diagnostics/events', { bodyLimit: 8 * 1024 * 1024, schema: { ...schema, body: {
    type: 'object', required: ['events'], additionalProperties: false,
    properties: { events: { type: 'array', maxItems: 32, items: { type: 'object' } } }
  } } }, async request => {
    try { return await diagnostics.ingest(request.body.events); }
    catch { throw new StoreError('invalid', 'Send valid diagnostic events.'); }
  });
  api.post('/api/diagnostics/cleanup', { schema: { ...schema, body: {
    type: 'object', additionalProperties: false, properties: {
      from: { type: 'string', format: 'date-time' }, to: { type: 'string', format: 'date-time' }, preview: { type: 'boolean' }
    }
  } } }, async request => {
    try { return await diagnostics.cleanup(request.body, request.body.preview === true); }
    catch { throw new StoreError('invalid', 'Diagnostic cleanup could not complete. Existing records were preserved.'); }
  });
}
