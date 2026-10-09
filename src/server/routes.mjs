import { StoreError } from '../core/store.mjs';
import { MODULES } from '../core/modules.mjs';
import {
  ApiFailureSchema, KarteDeleteRequestSchema, KarteRetryRequestSchema, KarteSaveRequestSchema,
  CapturePreparationRequestSchema, CaptureRequestSchema, DeckDeleteRequestSchema,
  DeckSaveRequestSchema, DefaultDeckRequestSchema, JsonObjectSchema, LoginRequestSchema,
  HealthResponseSchema, LoginResponseSchema, ManualKarteCreateRequestSchema, PollRequestSchema,
  PublishRequestSchema, SessionRequestSchema
} from '@vocabularium/contracts';
import { apiFailure } from './api-failure.mjs';
import { isCapturePayload } from './contract-validation.mjs';
import Type from 'typebox';

const errorResponses = {
  400: ApiFailureSchema,
  401: ApiFailureSchema,
  403: ApiFailureSchema,
  404: ApiFailureSchema,
  409: ApiFailureSchema,
  500: ApiFailureSchema
};
const listQuery = Type.Object({ cursor: Type.Optional(Type.String()), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })) }, { additionalProperties: false });
const karteListQuery = Type.Object({
  cursor: Type.Optional(Type.String()), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
  order: Type.Optional(Type.Union(['newest', 'oldest', 'az', 'za'].map(value => Type.Literal(value))))
}, { additionalProperties: false });
const deckParams = Type.Object({ deckId: Type.String({ minLength: 1 }) });
const karteParams = Type.Object({ karteId: Type.String({ minLength: 1 }) });

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

  fastify.get('/api/account/summary', {
    schema: routeSchema('Read bounded account and default-deck metadata')
  }, async () => store.summary());

  fastify.get('/api/decks', {
    schema: { ...routeSchema('Read one page of deck summaries'), querystring: listQuery }
  }, async request => store.listDecks(request.query));

  fastify.get('/api/decks/:deckId', {
    schema: { ...routeSchema('Read one deck configuration'), params: deckParams }
  }, async request => store.deck(request.params.deckId));

  fastify.get('/api/decks/:deckId/kartes', {
    schema: { ...routeSchema('Read one ordered page of karte summaries'), params: deckParams, querystring: karteListQuery }
  }, async request => store.listKartes(request.params.deckId, request.query));

  fastify.get('/api/kartes/:karteId', {
    schema: { ...routeSchema('Read one karte and its seites'), params: karteParams }
  }, async request => store.karte(request.params.karteId));

  fastify.get('/api/captures/recent', {
    schema: routeSchema('Read the twenty most recent saved captures')
  }, async () => store.recentCaptures());

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
    if (!result.replayed && !result.interrupted) await generation.start(result.karteId);
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

  fastify.post('/api/karte/create', {
    schema: routeSchema('Create a manual karte', ManualKarteCreateRequestSchema)
  }, async request => {
    const body = request.body;
    if (typeof body.payload?.deckId !== 'string') throw new StoreError('invalid', 'Choose a deck.');
    return store.createManual(body.operationId, body.payload);
  });

  fastify.post('/api/karte/save', {
    schema: routeSchema('Save karte seite edits', KarteSaveRequestSchema)
  }, async request => {
    const body = request.body;
    if (typeof body.payload?.karteId !== 'string') throw new StoreError('invalid', 'Choose a karte.');
    return store.saveSeites(body.operationId, body.payload);
  });

  fastify.post('/api/karte/delete', {
    schema: routeSchema('Delete a karte', KarteDeleteRequestSchema)
  }, async request => {
    const body = request.body;
    if (typeof body.payload?.karteId !== 'string') throw new StoreError('invalid', 'Choose a karte.');
    const result = await store.deleteKarte(body.operationId, body.payload.karteId);
    await generation.cancelObsolete();
    return result;
  });

  fastify.post('/api/karte/retry', {
    schema: routeSchema('Retry generation for one karte seite', KarteRetryRequestSchema, { errors: { 429: ApiFailureSchema } })
  }, async request => {
    const body = request.body;
    sessionValue(body.payload?.session);
    if (typeof body.payload?.karteId !== 'string' || typeof body.payload?.seiteId !== 'string') {
      throw new StoreError('invalid', 'Choose a karte seite.');
    }
    let reservation;
    try {
      const result = await store.retry(body.operationId, body.payload, { admit: () => {
        reservation = generation.reserve();
        if (!reservation) throw new StoreError('generation_busy', 'Generation is busy. Try Retry again later.');
      } });
      if (!result.replayed) await generation.start(body.payload.karteId, body.payload.seiteId, { reservation });
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
      saveFailed: attempts.filter(attempt => generation.failedResults.has(attempt.id)).map(attempt => attempt.id)
    };
  });

  fastify.post('/api/publish', {
    schema: routeSchema('Publish a completed seite attempt', PublishRequestSchema)
  }, async request => {
    const body = request.body;
    sessionValue(body.payload?.session);
    if (typeof body.payload?.attemptId !== 'string') throw new StoreError('invalid', 'A seite attempt is required.');
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
  if (snapshot.seites.some(seite => seite.modules.some(module => !Object.hasOwn(MODULES, module.type))) ||
      new Set(snapshot.seites.map(seite => seite.id)).size !== snapshot.seites.length) {
    throw new StoreError('invalid', 'A saved deck configuration is required.');
  }
}
