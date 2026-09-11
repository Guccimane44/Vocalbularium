import { createServer } from 'node:http';
import { AccountStore, StoreError } from '../core/store.mjs';
import { Authentication } from './auth.mjs';
import { Generation } from './generation.mjs';
import { MODULES } from '../core/modules.mjs';

function sessionValue(session) {
  if (!session || typeof session.installationId !== 'string' || typeof session.sessionId !== 'string' ||
    !session.installationId || !session.sessionId || !Number.isSafeInteger(session.epoch) || session.epoch < 1) {
    throw new StoreError('invalid', 'A valid browser session is required.');
  }
}
function captureValue(payload) {
  if (!payload || typeof payload.selectedText !== 'string' || !payload.selectedText.length) throw new StoreError('invalid', 'Select some text first.');
  sessionValue(payload.session);
  const snapshot = payload.snapshot;
  if (!snapshot || typeof snapshot.id !== 'string' || !Array.isArray(snapshot.pages) || snapshot.pages.length < 1 || snapshot.pages.length > 4 ||
    snapshot.pages.some(page => typeof page.id !== 'string' || !Array.isArray(page.modules) || page.modules.some(module =>
      !module || typeof module.id !== 'string' || !Object.hasOwn(MODULES, module.type))) ||
    new Set(snapshot.pages.map(page => page.id)).size !== snapshot.pages.length) {
    throw new StoreError('invalid', 'A saved deck configuration is required.');
  }
}

function respond(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}
async function readBody(request) {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new StoreError('invalid', 'Send a JSON request.');
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new StoreError('invalid', 'The request is too large.');
    chunks.push(chunk);
  }
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new StoreError('invalid', 'Send a JSON object.');
  return body;
}

export function createApplication({ filename = ':memory:', authOptions, provider } = {}) {
  const store = new AccountStore(filename);
  const authentication = new Authentication(store.db, authOptions);
  const generation = new Generation(store, provider);
  const server = createServer(async (request, response) => {
    const origin = request.headers.origin;
    if (origin && !/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) {
      respond(response, 403, { error: 'This origin is not allowed.', code: 'forbidden' }); return;
    }
    if (origin) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Vary', 'Origin');
      response.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
    try {
      const path = new URL(request.url, 'http://localhost').pathname;
      if (request.method === 'GET' && path === '/health') {
        respond(response, 200, { ok: true }); return;
      }
      if (request.method === 'POST' && path === '/api/login') {
        const body = await readBody(request);
        const result = authentication.login(body.username, body.password);
        respond(response, result ? 200 : 401, result ?? { error: 'Username or password is incorrect.', code: 'unauthorized' });
        return;
      }
      const token = request.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
      if (!authentication.accepts(token)) {
        respond(response, 401, { error: 'Sign in to continue.', code: 'unauthorized' }); return;
      }
      if (request.method === 'GET' && path === '/api/account') {
        respond(response, 200, store.account()); return;
      }
      if (request.method === 'POST') {
        const body = await readBody(request);
        let result;
        if (path === '/api/logout') {
          authentication.logout(token); result = { ok: true };
        } else if (path === '/api/session') {
          sessionValue(body.session);
          result = store.openSession(body.operationId, body.session);
        } else if (path === '/api/default-deck') {
          if (typeof body.deckId !== 'string') throw new StoreError('invalid', 'Choose a deck.');
          result = store.setDefault(body.operationId, body.deckId);
        } else if (path === '/api/capture') {
          captureValue(body.payload);
          if (body.recoverySession) sessionValue(body.recoverySession);
          result = store.capture(body.operationId, body.payload, { recoverySession: body.recoverySession });
          if (!result.replayed && !result.interrupted) generation.start(result.cardId);
        } else if (path === '/api/poll') {
          sessionValue(body.session);
          const attempts = store.pendingAttempts(body.session);
          result = { ready: attempts.filter(attempt => attempt.result).map(attempt => attempt.id), loading: attempts.length > 0 };
        } else if (path === '/api/publish') {
          sessionValue(body.payload?.session);
          if (typeof body.payload?.attemptId !== 'string') throw new StoreError('invalid', 'A page attempt is required.');
          result = store.publish(body.operationId, body.payload);
        } else { respond(response, 404, { error: 'This action is unavailable.', code: 'not_found' }); return; }
        respond(response, 200, result); return;
      }
      respond(response, 404, { error: 'This page is unavailable.', code: 'not_found' });
    } catch (error) {
      const known = error instanceof StoreError;
      respond(response, known ? (error.code === 'invalid' ? 400 : 409) : error instanceof SyntaxError ? 400 : 500,
        { error: known ? error.message : error instanceof SyntaxError ? 'The request is not valid JSON.' : 'The save could not be completed. Try again.',
          code: known ? error.code : 'server_error' });
      if (!known && !(error instanceof SyntaxError)) console.error(error);
    }
  });
  server.requestTimeout = 15000;
  return {
    store, authentication, generation, server,
    async start({ port = 4318, host = '127.0.0.1' } = {}) {
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
      return `http://${host}:${server.address().port}`;
    },
    async close() {
      await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
      await generation.close();
      store.close();
    }
  };
}
