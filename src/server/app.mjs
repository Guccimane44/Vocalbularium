import { createServer } from 'node:http';
import { AccountStore, StoreError } from '../core/store.mjs';
import { Authentication } from './auth.mjs';

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

export function createApplication({ filename = ':memory:', authOptions } = {}) {
  const store = new AccountStore(filename);
  const authentication = new Authentication(store.db, authOptions);
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
          if (!body.session || typeof body.session !== 'object') throw new StoreError('invalid', 'A browser session is required.');
          result = store.openSession(body.operationId, body.session);
        } else if (path === '/api/default-deck') {
          if (typeof body.deckId !== 'string') throw new StoreError('invalid', 'Choose a deck.');
          result = store.setDefault(body.operationId, body.deckId);
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
    store, authentication, server,
    async start({ port = 4318, host = '127.0.0.1' } = {}) {
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
      return `http://${host}:${server.address().port}`;
    },
    async close() {
      await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
      store.close();
    }
  };
}
