import { StoreError } from '../core/store.mjs';
import { MODULES } from '../core/modules.mjs';
import {
  ApiFailureSchema, CardDeleteRequestSchema, CardRetryRequestSchema, CardSaveRequestSchema,
  CapturePreparationRequestSchema, CaptureRequestSchema, DeckDeleteRequestSchema,
  DeckSaveRequestSchema, DefaultDeckRequestSchema, JsonObjectSchema, LoginRequestSchema,
  HealthResponseSchema, LoginResponseSchema, ManualCardCreateRequestSchema, PollRequestSchema,
  PublishRequestSchema, SessionRequestSchema
} from '@vocabularium/contracts';
import { apiFailure } from './api-failure.mjs';
import { isCapturePayload } from './contract-validation.mjs';

const errorResponses = {
  400: ApiFailureSchema,
  401: ApiFailureSchema,
  403: ApiFailureSchema,
  404: ApiFailureSchema,
  409: ApiFailureSchema,
  500: ApiFailureSchema
};

function routeSchema(summary, body, { publicRoute = false, success = JsonObjectSchema, errors = {} } = {}) {
  return {
    summary,
    tags: ['account'],
    ...(body ? { body } : {}),
    response: { 200: success, ...errorResponses, ...errors },
    security: publicRoute ? [] : [{ bearerAuth: [] }]
  };
}

async function healthReply(store, reply) {
  try {
    await store.ready();
    return { ok: true };
  } catch {
    return reply.code(503).send({ ok: false });
  }
}

/** @param {import('fastify').FastifyInstance} fastify @param {{store: import('../core/store.mjs').AccountStore, authentication: import('./auth.mjs').Authentication, generation: import('./generation.mjs').Generation}} services */
export function registerRoutes(fastify, { store, authentication, generation }) {
  fastify.get('/health/live', {
    schema: {
      summary: 'Check whether the API process is running', tags: ['health'], security: [],
      response: { 200: HealthResponseSchema }
    }
  }, async () => ({ ok: true }));

  fastify.get('/health/ready', {
    schema: {
      summary: 'Check whether the API can serve account requests', tags: ['health'], security: [],
      response: { 200: HealthResponseSchema, 503: HealthResponseSchema }
    }
  }, async (_request, reply) => healthReply(store, reply));

  // Keep the existing probe path for the local extension and current hosting configuration.
  fastify.get('/health', {
    schema: {
      summary: 'Compatibility readiness check', tags: ['health'], security: [],
      response: { 200: HealthResponseSchema, 503: HealthResponseSchema }
    }
  }, async (_request, reply) => healthReply(store, reply));

  fastify.post('/api/login', {
    schema: routeSchema('Create an account session', LoginRequestSchema, {
      publicRoute: true, success: LoginResponseSchema
    })
  }, async (request, reply) => {
    const result = await authentication.login(request.body.username, request.body.password);
    return reply.code(result ? 200 : 401).send(result ?? apiFailure('Username or password is incorrect.', 'unauthorized'));
  });

  fastify.get('/api/account', {
    schema: routeSchema('Read the signed-in account')
  }, async () => store.account());

  fastify.post('/api/logout', {
    schema: routeSchema('End the current account session', JsonObjectSchema)
  }, async request => {
    await authentication.logout(request.authToken);
    return { ok: true };
  });

  fastify.post('/api/session', {
    schema: routeSchema('Open a browser generation session', SessionRequestSchema)
  }, async request => {
    const body = request.body;
    sessionValue(body.session);
    const result = await store.openSession(body.operationId, body.session);
    await generation.cancelObsolete();
    return result;
  });

  fastify.post('/api/default-deck', {
    schema: routeSchema('Set the account default deck', DefaultDeckRequestSchema)
  }, async request => {
    const body = request.body;
    if (typeof body.deckId !== 'string') throw new StoreError('invalid', 'Choose a deck.');
    return store.setDefault(body.operationId, body.deckId);
  });

  fastify.post('/api/capture/prepare', {
    schema: routeSchema('Read the current capture destination', CapturePreparationRequestSchema)
  }, async request => {
    const body = request.body;
    sessionValue(body.payload?.session);
    return store.prepareCapture(body.operationId, body.payload);
  });

  fastify.post('/api/capture', {
    schema: routeSchema('Save a captured selection', CaptureRequestSchema)
  }, async request => {
    const body = request.body;
    captureValue(body.payload);
    if (body.recoverySession) sessionValue(body.recoverySession);
    const result = await store.capture(body.operationId, body.payload, { recoverySession: body.recoverySession });
    if (!result.replayed && !result.interrupted) await generation.start(result.cardId);
    return result;
  });

  fastify.post('/api/deck/save', {
    schema: routeSchema('Create or update a deck', DeckSaveRequestSchema)
  }, async request => {
    const result = await store.saveDeck(request.body.operationId, request.body.payload ?? {});
    await generation.cancelObsolete();
    return result;
  });

  fastify.post('/api/deck/delete', {
    schema: routeSchema('Delete a deck', DeckDeleteRequestSchema)
  }, async request => {
    const body = request.body;
    if (typeof body.payload?.deckId !== 'string') throw new StoreError('invalid', 'Choose a deck.');
    const result = await store.deleteDeck(body.operationId, body.payload);
    await generation.cancelObsolete();
    return result;
  });

  fastify.post('/api/card/create', {
    schema: routeSchema('Create a manual card', ManualCardCreateRequestSchema)
  }, async request => {
    const body = request.body;
    if (typeof body.payload?.deckId !== 'string') throw new StoreError('invalid', 'Choose a deck.');
    return store.createManual(body.operationId, body.payload);
  });

  fastify.post('/api/card/save', {
    schema: routeSchema('Save card page edits', CardSaveRequestSchema)
  }, async request => {
    const body = request.body;
    if (typeof body.payload?.cardId !== 'string') throw new StoreError('invalid', 'Choose a card.');
    return store.savePages(body.operationId, body.payload);
  });

  fastify.post('/api/card/delete', {
    schema: routeSchema('Delete a card', CardDeleteRequestSchema)
  }, async request => {
    const body = request.body;
    if (typeof body.payload?.cardId !== 'string') throw new StoreError('invalid', 'Choose a card.');
    const result = await store.deleteCard(body.operationId, body.payload.cardId);
    await generation.cancelObsolete();
    return result;
  });

  fastify.post('/api/card/retry', {
    schema: routeSchema('Retry generation for one card page', CardRetryRequestSchema, { errors: { 429: ApiFailureSchema } })
  }, async request => {
    const body = request.body;
    sessionValue(body.payload?.session);
    if (typeof body.payload?.cardId !== 'string' || typeof body.payload?.pageId !== 'string') {
      throw new StoreError('invalid', 'Choose a card page.');
    }
    let reservation;
    try {
      const result = await store.retry(body.operationId, body.payload, { admit: () => {
        reservation = generation.reserve();
        if (!reservation) throw new StoreError('generation_busy', 'Generation is busy. Try Retry again later.');
      } });
      if (!result.replayed) await generation.start(body.payload.cardId, body.payload.pageId, { reservation });
      return result;
    } finally {
      generation.release(reservation);
    }
  });

  fastify.post('/api/poll', {
    schema: routeSchema('Poll for generation results', PollRequestSchema)
  }, async request => {
    sessionValue(request.body.session);
    const attempts = await store.pendingAttempts(request.body.session);
    return {
      ready: attempts.filter(attempt => attempt.result).map(attempt => attempt.id),
      loading: attempts.length > 0,
      saveFailed: attempts.filter(attempt => generation.pendingResults.has(attempt.id)).map(attempt => attempt.id)
    };
  });

  fastify.post('/api/publish', {
    schema: routeSchema('Publish a completed page attempt', PublishRequestSchema)
  }, async request => {
    const body = request.body;
    sessionValue(body.payload?.session);
    if (typeof body.payload?.attemptId !== 'string') throw new StoreError('invalid', 'A page attempt is required.');
    await generation.saveResult(body.payload.attemptId, body.payload.session);
    return store.publish(body.operationId, body.payload);
  });
}

export function sessionValue(session) {
  if (!session || typeof session.installationId !== 'string' || typeof session.sessionId !== 'string' ||
    !session.installationId || !session.sessionId || !Number.isSafeInteger(session.epoch) || session.epoch < 1) {
    throw new StoreError('invalid', 'A valid browser session is required.');
  }
}

export function captureValue(payload) {
  if (!payload || typeof payload.selectedText !== 'string' || !payload.selectedText.length) {
    throw new StoreError('invalid', 'Select some text first.');
  }
  sessionValue(payload.session);
  if (!isCapturePayload(payload)) throw new StoreError('invalid', 'A saved deck configuration is required.');
  const snapshot = payload.snapshot;
  if (snapshot.pages.some(page => page.modules.some(module => !Object.hasOwn(MODULES, module.type))) ||
      new Set(snapshot.pages.map(page => page.id)).size !== snapshot.pages.length) {
    throw new StoreError('invalid', 'A saved deck configuration is required.');
  }
}
