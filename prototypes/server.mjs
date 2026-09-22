import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AccountStore } from '../src/core/store.mjs';
// Local-only M0 laboratory. No authentication or real model calls are implemented here.
export function createPrototype({ store, delayMs = 5000 } = {}) {
  if (!store)
    throw new Error('Provide a disposable PostgreSQL account store for the prototype.');
  const timers = new Set();
  let dropCaptureResponse = false;
  async function generate(cardId) {
    const card = await store.card(cardId);
    for (const page of card.pages) {
      const timer = setTimeout(async () => {
        timers.delete(timer);
        try {
          const attempt = await store.attempt(page.attempt_id);
          const outputs = attempt.modules.map(module => module.type === 'selected' ? card.selected_text
            : `Illustrative prototype output for: ${card.selected_text}`);
          await store.stage(page.attempt_id, { ok: true, text: outputs.join('\n\n') });
        } catch (error) {
          if (!['stale_attempt', 'stale_session', 'deleted'].includes(error.code)) console.error(error);
        }
      }, delayMs);
      timers.add(timer);
    }
  }
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    const origin = request.headers.origin;
    // An extension ID is not authentication. This is only the loopback prototype.
    if (origin?.startsWith('chrome-extension://')) response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Headers', 'content-type');
    if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
    try {
      if (request.method === 'GET' && request.url === '/fixture') {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end('<!doctype html><title>Vocabulary capture fixture</title><h1>Reading fixture</h1><p id="selection">  幸福\n</p><p>Continue reading here.</p><iframe src="/frame" title="Frame selection"></iframe>');
        return;
      }
      if (request.method === 'GET' && request.url === '/frame') {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end('<!doctype html><p id="frame-selection">我真的很幸福</p>'); return;
      }
      let result;
      if (request.method === 'GET' && request.url === '/state') result = { snapshot: (await store.snapshot()), cards: (await store.cards()) };
      else if (request.method === 'POST') {
        let raw = '';
        for await (const chunk of request) {
          raw += chunk;
          if (raw.length > 1024 * 1024) throw new Error('Prototype request is too large.');
        }
        const body = JSON.parse(raw);
        if (request.url === '/session') result = (await store.openSession(body.operationId, body.session));
        else if (request.url === '/capture') {
          result = (await store.capture(body.operationId, body.payload));
          if (!result.replayed)
            await generate(result.cardId);
          if (dropCaptureResponse) {
            dropCaptureResponse = false;
            response.writeHead(200, { 'Content-Type': 'application/json' });
            response.end('{'); // Commit succeeded, but no usable acknowledgment arrives.
            return;
          }
        } else if (request.url === '/poll') {
          const attempts = await store.pendingAttempts(body.session);
          result = { ready: attempts.filter(item => item.result).map(item => item.id), loading: attempts.length };
        } else if (request.url === '/publish') result = (await store.publish(body.operationId, body.payload));
        else if (request.url === '/save') result = (await store.savePages(body.operationId, body.payload));
        else { response.writeHead(404); response.end(); return; }
      } else { response.writeHead(404); response.end(); return; }
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify(result));
    } catch (error) {
      response.writeHead(error.code ? 409 : 400, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: error.message, code: error.code ?? 'invalid' }));
    }
  });
  return {
    store, server,
    dropNextCaptureResponse() { dropCaptureResponse = true; },
    async start(port = 4317) {
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
      return `http://127.0.0.1:${server.address().port}`;
    },
    async close() {
      for (const timer of timers) clearTimeout(timer);
      await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
      await store.close();
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const store = await AccountStore.open({ databaseUrl: process.env.PROTOTYPE_DATABASE_URL });
  const prototype = createPrototype({ store });
  console.log(`Foundation prototype: ${await prototype.start()}/fixture`);
  console.log('Illustrative output only. Load prototypes/extension as an unpacked extension.');
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await prototype.close(); process.exit(0); });
}
