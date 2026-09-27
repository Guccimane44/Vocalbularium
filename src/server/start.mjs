import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApplication } from './app.mjs';
import { loadConfig } from './config.mjs';

const config = loadConfig();
mkdirSync(config.directory, { recursive: true });
const application = await createApplication({
  databaseUrl: config.databaseUrl,
  outbox: resolve(config.directory, 'generation-outbox'),
  generationOptions: { maxActive: config.generationMaxActive, maxQueued: config.generationMaxQueued },
  logger: { level: config.logLevel }
});

let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    if (stopping) return;
    stopping = true;
    void (async () => {
      application.log.info({ signal }, 'Shutting down account API');
      try {
        await application.close();
      } catch (error) {
        application.log.error({
          signal,
          errorType: typeof error?.name === 'string' ? error.name : 'Error',
          errorCode: typeof error?.code === 'string' ? error.code : undefined
        }, 'Account API shutdown failed');
        process.exitCode = 1;
      }
    })();
  });
}

try {
  const address = await application.start({ port: config.port, host: config.host });
  application.log.info({ address }, 'Vocabularium account API listening');
} catch (error) {
  application.log.error({
    errorType: typeof error?.name === 'string' ? error.name : 'Error',
    errorCode: typeof error?.code === 'string' ? error.code : undefined
  }, 'Vocabularium account API failed to start');
  await application.close();
  throw error;
}
