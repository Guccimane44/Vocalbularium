// Versioned, allowlisted diagnostic data. Content is untrusted vocabulary data.
export const DIAGNOSTIC_VERSION = 1;
export const MAX_EVENT_BYTES = 4 * 1024 * 1024;
export const EXTENSION_LOG_BUDGET = 16 * 1024 * 1024;
const textFields = ['operationId', 'requestId', 'karteId', 'seiteId', 'attemptId', 'installationId',
  'sessionId', 'route', 'method', 'category', 'errorType', 'errorCode', 'model', 'phase'];
const numberFields = ['durationMs', 'queueMs', 'active', 'queued', 'reserved', 'admitted', 'rejected',
  'status', 'sequence', 'maxTokens', 'dropped'];
const contentEvents = new Set(['capture.invoked', 'capture.saved', 'generation.input', 'generation.output', 'provider.request', 'provider.response']);
export const eventNames = new Set(['process.started', 'process.stopping', 'process.failed', 'database.failed',
  'readiness.failed', 'api.completed', 'capture.invoked', 'capture.saved', 'generation.input', 'generation.output',
  'generation.work', 'provider.request', 'provider.response', 'recovery.started', 'recovery.completed',
  'recovery.failed', 'worker.started', 'worker.failed', 'request.started', 'request.completed',
  'request.failed', 'logging.gap']);

export function safeEvent(input, { source = 'backend', mode = 'full', secrets = [] } = {}) {
  if (!input || !eventNames.has(input.event)) throw new Error('Unknown diagnostic event.');
  if (input.version !== undefined && input.version !== DIAGNOSTIC_VERSION) throw new Error('Unsupported diagnostic version.');
  const clean = value => {
    let text = String(value);
    for (const secret of secrets) if (secret) text = text.replaceAll(secret, '[REDACTED]');
    return text;
  };
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  if (typeof occurredAt !== 'string' || !Number.isFinite(Date.parse(occurredAt))) throw new Error('Invalid diagnostic timestamp.');
  const eventId = input.eventId ?? crypto.randomUUID();
  if (typeof eventId !== 'string' || !/^[\da-f-]{36}$/.test(eventId)) throw new Error('Invalid diagnostic identity.');
  const value = { version: DIAGNOSTIC_VERSION, eventId, occurredAt: new Date(occurredAt).toISOString(),
    source, event: input.event, severity: ['debug', 'info', 'warn', 'error'].includes(input.severity) ? input.severity : 'info',
    outcome: ['started', 'succeeded', 'failed', 'canceled', 'rejected', 'replayed'].includes(input.outcome) ? input.outcome : 'started' };
  for (const key of textFields) if (typeof input[key] === 'string') value[key] = clean(input[key].slice(0, 512));
  for (const key of numberFields) if (Number.isFinite(input[key]) && input[key] >= 0) value[key] = input[key];
  if (mode === 'full' && contentEvents.has(input.event) && input.content) {
    const content = {};
    for (const key of ['selectedText', 'output']) if (typeof input.content[key] === 'string') content[key] = clean(input.content[key]);
    if (input.event === 'provider.request' && Array.isArray(input.content.prompts)) {
      content.prompts = input.content.prompts.filter(p => ['system', 'user', 'assistant'].includes(p?.role) && typeof p.content === 'string')
        .map(p => ({ role: p.role, content: clean(p.content) }));
    }
    if (Object.keys(content).length) value.content = content;
  }
  return value;
}

export function timeRange({ from = '1970-01-01T00:00:00.000Z', to = new Date().toISOString() } = {}) {
  if (typeof from !== 'string' || typeof to !== 'string' || !Number.isFinite(Date.parse(from)) ||
    !Number.isFinite(Date.parse(to)) || Date.parse(from) > Date.parse(to)) throw new Error('Choose a valid UTC time range.');
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
}
export const withinRange = (time, range) => time >= range.from && time <= range.to;
