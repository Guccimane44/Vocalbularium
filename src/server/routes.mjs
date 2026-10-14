import { StoreError } from '../core/store.mjs';
import { isModuleType } from '@vocabularium/domain/page-modules';
import {
  ApiFailureSchema, CapturePreparationRequestSchema, ComponentDeleteRequestSchema, ComponentMoveRequestSchema,
  DeckConfigurationSaveRequestSchema, DeckDeleteRequestSchema, FacetAddRequestSchema, FacetDeleteRequestSchema, ModuleAddRequestSchema,
  DefaultDeckRequestSchema, JsonObjectSchema, LoginRequestSchema, HealthResponseSchema, LoginResponseSchema,
  PageCaptureRequestSchema, PageCreateRequestSchema, PageDeleteRequestSchema, PageGenerateRequestSchema,
  PageSaveRequestSchema, PollRequestSchema, PublishRequestSchema, SessionRequestSchema
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
const pageListQuery = Type.Object({
  cursor: Type.Optional(Type.String()), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
  order: Type.Optional(Type.Union(['newest', 'oldest', 'az', 'za'].map(value => Type.Literal(value))))
}, { additionalProperties: false });
const deckParams = Type.Object({ deckId: Type.String({ minLength: 1 }) });
const pageParams = Type.Object({ pageId: Type.String({ minLength: 1 }) });

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

  fastify.get('/api/decks/:deckId/pages', {
    schema: { ...routeSchema('Read one ordered batch of page summaries'), params: deckParams, querystring: pageListQuery }
  }, async request => store.listPages(request.params.deckId, request.query));

  fastify.get('/api/pages/:pageId', {
    schema: { ...routeSchema('Read one page and its components'), params: pageParams }
  }, async request => store.page(request.params.pageId));

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
    schema: routeSchema('Save a captured selection', PageCaptureRequestSchema)
  }, async request => {
    const body = request.body;
    captureValue(body.payload);
    if (body.recoverySession) sessionValue(body.recoverySession);
    const result = await store.capture(body.operationId, body.payload, { recoverySession: body.recoverySession });
    if (!result.replayed && !result.interrupted) await generation.start(result.pageId);
    return result;
  });

  fastify.post('/api/deck/save', {
    schema: routeSchema('Create or update a deck configuration', DeckConfigurationSaveRequestSchema)
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

  fastify.post('/api/page/create', {
    schema: routeSchema('Create a page manually, without generation', PageCreateRequestSchema)
  }, async request => store.createPage(request.body.operationId, request.body.payload));

  fastify.post('/api/page/save', {
    schema: routeSchema('Save page component edits', PageSaveRequestSchema)
  }, async request => store.savePage(request.body.operationId, request.body.payload));

  // Shaping: each step is one ordered operation, applied immediately.
  fastify.post('/api/page/modules/add', {
    schema: routeSchema('Add a module to one page', ModuleAddRequestSchema)
  }, async request => store.addModule(request.body.operationId, request.body.payload));

  fastify.post('/api/page/components/delete', {
    schema: routeSchema('Delete a component and its module from a page', ComponentDeleteRequestSchema)
  }, async request => {
    const result = await store.deleteComponent(request.body.operationId, request.body.payload);
    await generation.cancelObsolete();
    return result;
  });

  // Facets (D08): a facet joins or leaves one parent component.
  fastify.post('/api/page/facets/add', {
    schema: routeSchema('Add a facet to a parent module on one page', FacetAddRequestSchema)
  }, async request => store.addFacet(request.body.operationId, request.body.payload));

  fastify.post('/api/page/facets/delete', {
    schema: routeSchema('Delete a facet from a parent module on one page', FacetDeleteRequestSchema)
  }, async request => store.deleteFacet(request.body.operationId, request.body.payload));

  fastify.post('/api/page/components/move', {
    schema: routeSchema('Move a component on its page', ComponentMoveRequestSchema)
  }, async request => store.moveComponent(request.body.operationId, request.body.payload));

  fastify.post('/api/page/delete', {
    schema: routeSchema('Delete a page', PageDeleteRequestSchema)
  }, async request => {
    const result = await store.deletePage(request.body.operationId, request.body.payload.pageId);
    await generation.cancelObsolete();
    return result;
  });

  fastify.post('/api/page/generate', {
    schema: routeSchema('Generate missing components, or retry one component or the whole page',
      PageGenerateRequestSchema, { errors: { 429: ApiFailureSchema } })
  }, async request => {
    const body = request.body;
    sessionValue(body.payload.session);
    let reservation;
    try {
      const result = await store.generate(body.operationId, body.payload, { admit: count => {
        if (!count) return;
        reservation = generation.reserve(count);
        if (!reservation) {
          generation.rejected++;
          generation.record('rejected', 'generation_busy');
          throw new StoreError('generation_busy', 'Generation is busy. Try again later.');
        }
      } });
      if (!result.replayed && result.attemptIds.length) await generation.start(result.pageId, result.attemptIds, { reservation });
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
    schema: routeSchema('Publish a completed component attempt', PublishRequestSchema)
  }, async request => {
    const body = request.body;
    sessionValue(body.payload?.session);
    if (typeof body.payload?.attemptId !== 'string') throw new StoreError('invalid', 'A component attempt is required.');
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
  if (!payload || typeof payload.mainKey !== 'string' || !payload.mainKey.length) {
    throw new StoreError('invalid', 'Select some text first.');
  }
  sessionValue(payload.session);
  if (!isCapturePayload(payload)) throw new StoreError('invalid', 'A saved deck configuration is required.');
  const { modules } = payload.snapshot;
  if (modules.some(module => !isModuleType(module.type)) || new Set(modules.map(module => module.id)).size !== modules.length) {
    throw new StoreError('invalid', 'A saved deck configuration is required.');
  }
}
