// @ts-check
import Fastify, { LogController } from 'fastify';
import swagger from '@fastify/swagger';
import { randomUUID } from 'node:crypto';
import { AccountStore, StoreError } from '../core/store.mjs';
import { Authentication } from './auth.mjs';
import { Generation } from './generation.mjs';
import { Audio } from './audio.mjs';
import { apiFailure } from './api-failure.mjs';
import { registerRoutes } from './routes.mjs';
import { Diagnostics, diagnosticContext } from './diagnostics.mjs';
import { registerDiagnosticRoutes } from './diagnostic-routes.mjs';
/** @import { FastifyError, FastifyRequest, FastifyServerOptions } from 'fastify' */
/** @import { Socket } from 'node:net' */
/** @import { GenerationProvider } from './generation.mjs' */
/** @import { AudioProvider } from './audio.mjs' */
/** @import { ApiInstance } from '../../types/fastify.js' */
// The parts of a mutation's body the diagnostics record; the routes check the rest.
/** @typedef {{ operationId?: string, payload?: { pageId?: string, attemptId?: string, mainKey?: string, target?: { componentId?: string } } }} MutationBody */

const maxRequestBytes = 1024 * 1024;
const publicHealthPaths = new Set(['/health', '/health/live', '/health/ready']);
const invalidJsonCodes = new Set(['FST_ERR_CTP_EMPTY_JSON_BODY', 'FST_ERR_CTP_INVALID_JSON_BODY']);

/** @param {unknown} value */
function isJsonObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** @param {FastifyRequest} request */
function routePath(request) {
  return new URL(request.url, 'http://localhost').pathname;
}

/** @param {FastifyError} error @param {FastifyRequest} request */
function requestFailure(error, request) {
  if (error instanceof StoreError) {
    return {
      status: error.code === 'invalid' ? 400 : error.code === 'generation_busy' ? 429 : 409,
      value: apiFailure(error.message, error.code, error.details)
    };
  }
  if (error instanceof SyntaxError || invalidJsonCodes.has(error.code)) {
    return { status: 400, value: apiFailure('The request is not valid JSON.', 'invalid') };
  }
  if (error.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') {
    return { status: 400, value: apiFailure('Send a JSON request.', 'invalid') };
  }
  if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
    return { status: 400, value: apiFailure('The request is too large.', 'invalid') };
  }
  if (error.validation || error.code === 'FST_ERR_VALIDATION') {
    const message = isJsonObject(request.body) ? 'The request is not valid.' : 'Send a JSON object.';
    return { status: 400, value: apiFailure(message, 'invalid') };
  }
  return { status: 500, value: apiFailure('The save could not be completed. Try again.', 'server_error') };
}

/** @param {{
  databaseUrl?: string, outbox?: string, accountId?: number, authOptions?: ConstructorParameters<typeof Authentication>[1],
  provider?: GenerationProvider, generationOptions?: ConstructorParameters<typeof Generation>[2],
  speechProvider?: AudioProvider, audioOptions?: ConstructorParameters<typeof Audio>[2],
  diagnostics?: Diagnostics, logger?: FastifyServerOptions['logger'], documentationOnly?: boolean
}} [options] */
export async function createApplication({ databaseUrl, outbox, accountId = 1, authOptions, provider, generationOptions, speechProvider, audioOptions, diagnostics = new Diagnostics(), logger = false, documentationOnly = false } = {}) {
  /** @param {Record<string, unknown>} event */
  const emit = event => diagnostics.emit({ ...diagnosticContext.getStore(), ...event });
  // A documentation-only application serves no requests, so its parts are
  // typed as present: only the routes' schemas are read.
  /** @type {AccountStore} */
  let store;
  try { store = /** @type {AccountStore} */ (documentationOnly ? null : await AccountStore.open({ databaseUrl, outbox, accountId, diagnostic: emit })); }
  catch (caught) {
    const error = /** @type {FastifyError} */ (caught);
    emit({ event: 'process.failed', outcome: 'failed', severity: 'error', phase: 'database_initialize', errorType: error.name, errorCode: error.code });
    await diagnostics.close(); throw error;
  }
  const authentication = /** @type {Authentication} */ (documentationOnly ? null : new Authentication(store.database, authOptions));
  /** @type {Generation} */
  let generation;
  /** @type {Audio} */
  let audio;
  try {
    await authentication?.initialize();
    generation = /** @type {Generation} */ (documentationOnly ? null : await Generation.create(store, provider, { ...generationOptions, emit,
      diagnostic: (/** @type {Record<string, unknown>} */ event) => { emit({ ...event, event: 'generation.work', phase: event.event,
        severity: event.event === 'failed' ? 'error' : event.event === 'rejected' ? 'warn' : 'info',
        outcome: event.event === 'failed' || event.category === 'failed' ? 'failed' : event.event === 'rejected' ? 'rejected' : event.category === 'canceled' ? 'canceled' : ['settled', 'staged'].includes(/** @type {string} */ (event.event)) ? 'succeeded' : 'started' });
        generationOptions?.diagnostic?.(event); } }));
    if (generation) { generation.provider.diagnostic = emit; diagnostics.addSecret(generation.provider.apiKey); }
    // Spoken parts' audio (D24): its own jobs and limits beside the text attempts.
    audio = /** @type {Audio} */ (documentationOnly ? null : await Audio.create(store, speechProvider, { ...audioOptions, emit }));
    if (audio) { audio.provider.diagnostic = emit; diagnostics.addSecret(audio.provider.apiKey); }
  } catch (caught) {
    const error = /** @type {FastifyError} */ (caught);
    emit({ event: 'process.failed', outcome: 'failed', severity: 'error', phase: 'initialize', errorType: error.name, errorCode: error.code });
    await store?.close(); await diagnostics.close(); throw error;
  }
  const fastify = Fastify({
    logger,
    bodyLimit: maxRequestBytes,
    requestTimeout: 15_000,
    requestIdHeader: false,
    genReqId: () => randomUUID(),
    logController: new LogController({ disableRequestLogging: true })
  });
  fastify.server.requestTimeout = 15_000;
  // Closing waits for every open connection. Node's idle reaping skips a
  // connection that has not sent a request yet (browsers open them ahead of
  // time), and a response still in flight keeps its keep-alive connection for
  // keepAliveTimeout (72 s). Once closing, end each connection that has no
  // active request; in-flight requests still complete.
  /** @type {Map<Socket, number>} */
  const activeRequests = new Map();
  let closing = false;
  /** @param {Socket} socket */
  const release = socket => { if (closing && !activeRequests.get(socket)) socket.destroy(); };
  fastify.server.on('connection', socket => {
    activeRequests.set(socket, 0);
    socket.on('close', () => activeRequests.delete(socket));
    release(socket);
  });
  fastify.server.on('request', (request, response) => {
    const socket = request.socket;
    activeRequests.set(socket, (activeRequests.get(socket) ?? 0) + 1);
    response.on('close', () => {
      if (!activeRequests.has(socket)) return;
      activeRequests.set(socket, /** @type {number} */ (activeRequests.get(socket)) - 1);
      setImmediate(() => release(socket));
    });
  });
  fastify.decorateRequest('authToken', null);
  fastify.decorateRequest('diagnosticStarted', null);
  fastify.decorateRequest('diagnosticResult', null);

  fastify.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Vocabularium Account API',
        version: '0.16.2',
        description: 'Local account, capture, deck, page, and generation-session API.'
      },
      servers: [{ url: 'http://127.0.0.1:4318' }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer' }
        }
      },
      tags: [
        { name: 'health', description: 'Process and readiness probes' },
        { name: 'account', description: 'Account, deck, and page operations' }
      ]
    }
  });

  fastify.addHook('onRequest', async (request, reply) => {
    request.diagnosticStarted = performance.now();
    const origin = request.headers.origin;
    if (origin && !/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) {
      return reply.code(403).send(apiFailure('This origin is not allowed.', 'forbidden'));
    }
    if (origin) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Vary', 'Origin');
      reply.header('Access-Control-Allow-Headers', 'authorization, content-type');
      reply.header('Access-Control-Expose-Headers', 'X-Request-Id');
      reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    if (request.method === 'OPTIONS') return reply.code(204).send();

    const path = routePath(request);
    const isPublic = (request.method === 'GET' && publicHealthPaths.has(path)) ||
      (request.method === 'POST' && path === '/api/login');
    if (!isPublic) {
      const authorization = request.headers.authorization;
      const token = typeof authorization === 'string' ? authorization.match(/^Bearer (\S+)$/)?.[1] : undefined;
      if (!token || !await store.ordered(() => authentication.accepts(token))) {
        return reply.code(401).send(apiFailure('Sign in to continue.', 'unauthorized'));
      }
      request.authToken = token;
      diagnostics.addSecret(token);
    }

    if (request.method === 'POST' && !request.headers['content-type']?.startsWith('application/json')) {
      return reply.code(400).send(apiFailure('Send a JSON request.', 'invalid'));
    }
  });

  // A validated handler reserves its place before asynchronous authentication.
  // Otherwise token lookups could reorder two already-arrived saves.
  fastify.addHook('onRoute', options => {
    if (publicHealthPaths.has(options.url) || options.url === '/api/login') return;
    const handler = options.handler;
    options.handler = function (request, reply) {
      if (options.url.startsWith('/api/diagnostics/')) return handler.call(this, request, reply);
      return store.ordered(async () => {
        if (!await authentication.accepts(request.authToken)) {
          return reply.code(401).send(apiFailure('Sign in to continue.', 'unauthorized'));
        }
        return diagnosticContext.run({ requestId: request.id, operationId: /** @type {MutationBody | undefined} */ (request.body)?.operationId }, () => handler.call(this, request, reply));
      });
    };
  });

  fastify.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-Request-Id', request.id);
    if (reply.statusCode !== 204) reply.header('Cache-Control', 'no-store');
    if (!request.routeOptions?.url?.startsWith('/api/diagnostics/') && request.method !== 'OPTIONS') {
      /** @type {Record<string, unknown> | undefined} */
      let result; try { result = JSON.parse(/** @type {string} */ (payload)); } catch { /* Metadata only. */ }
      diagnostics.addSecret(result?.token);
      request.diagnosticResult = { code: result?.code, pageId: result?.pageId, sequence: result?.sequence, replayed: result?.replayed };
    }
    return payload;
  });

  fastify.addHook('onResponse', async (request, reply) => {
    const route = request.routeOptions?.url ?? 'unmatched';
    const body = /** @type {MutationBody | undefined} */ (request.body);
    const status = reply.statusCode, payload = body?.payload;
    /** @type {{ code?: unknown, pageId?: unknown, sequence?: unknown, replayed?: unknown }} */
    const result = request.diagnosticResult ?? {};
    // Idle polling and routine health/list refreshes create no successful entries.
    if (route.startsWith('/api/diagnostics/') || request.method === 'OPTIONS' ||
      (status < 400 && (route === '/api/poll' || route.startsWith('/health') ||
        ['/api/account', '/api/account/summary', '/api/captures/recent', '/api/decks'].includes(route)))) return;
    emit({ event: 'api.completed', requestId: request.id, operationId: body?.operationId,
      pageId: result.pageId ?? payload?.pageId ?? /** @type {{ pageId?: string } | undefined} */ (request.params)?.pageId, componentId: payload?.target?.componentId, attemptId: payload?.attemptId,
      method: request.method, route, status, sequence: result.sequence, errorCode: result.code,
      severity: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
      outcome: status >= 400 ? 'failed' : result.replayed ? 'replayed' : 'succeeded',
      durationMs: Math.round(performance.now() - /** @type {number} */ (request.diagnosticStarted)) });
    if (route === '/api/capture' && status === 200) emit({ event: 'capture.saved', requestId: request.id,
      operationId: body?.operationId, pageId: result.pageId, outcome: result.replayed ? 'replayed' : 'succeeded',
      content: { selectedText: payload?.mainKey } });
    if (route.startsWith('/health') && status === 503) emit({ event: 'readiness.failed', outcome: 'failed', severity: 'error' });
  });

  fastify.setErrorHandler((/** @type {FastifyError} */ error, request, reply) => {
    const failure = requestFailure(error, request);
    if (failure.status === 500) {
      request.log.error({
        requestId: request.id,
        method: request.method,
        route: request.routeOptions?.url ?? 'unmatched',
        errorType: typeof error.name === 'string' ? error.name : 'Error',
        errorCode: typeof error.code === 'string' ? error.code : undefined
      }, 'API request failed');
    }
    return reply.code(failure.status).send(failure.value);
  });

  fastify.setNotFoundHandler(async (request, reply) => {
    if (!request.authToken && !(request.method === 'GET' && publicHealthPaths.has(routePath(request)))) {
      const token = typeof request.headers.authorization === 'string'
        ? request.headers.authorization.match(/^Bearer (\S+)$/)?.[1]
        : undefined;
      if (!await authentication.accepts(token)) return reply.code(401).send(apiFailure('Sign in to continue.', 'unauthorized'));
    }
    return reply.code(404).send(apiFailure('This page is unavailable.', 'not_found'));
  });

  fastify.register(async (/** @type {ApiInstance} */ api) => {
    registerRoutes(api, { store, authentication, generation, audio });
    registerDiagnosticRoutes(api, diagnostics);

    // Keep authenticated POSTs to unknown paths on the same JSON parsing and error path.
    api.route({
      method: ['GET', 'POST'],
      url: '/*',
      schema: { hide: true },
      handler: async (request, reply) => {
        if (request.method === 'POST' && !isJsonObject(request.body)) {
          return reply.code(400).send(apiFailure('Send a JSON object.', 'invalid'));
        }
        const message = request.method === 'POST' ? 'This action is unavailable.' : 'This page is unavailable.';
        return reply.code(404).send(apiFailure(message, 'not_found'));
      }
    });
  });

  return {
    store,
    authentication,
    generation,
    audio,
    diagnostics,
    server: fastify.server,
    log: fastify.log,
    async openapi() {
      await fastify.ready();
      return fastify.swagger();
    },
    async start({ port = 4318, host = '127.0.0.1' } = {}) {
      const address = (await fastify.listen({ port, host })).replace(/\/$/, '');
      emit({ event: 'process.started', outcome: 'succeeded' }); return address;
    },
    async close() {
      closing = true;
      const closed = fastify.close();
      for (const socket of activeRequests.keys()) release(socket);
      await closed;
      await generation?.close();
      await audio?.close();
      await store?.close();
      emit({ event: 'process.stopping', outcome: 'succeeded' });
      await diagnostics.close();
    }
  };
}
