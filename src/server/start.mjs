import { resolve } from 'node:path';
import { createApplication } from './app.mjs';
import { loadConfig } from './config.mjs';
import { Diagnostics } from './diagnostics.mjs';

let config, application, diagnostics;
try {
  config = loadConfig();
  diagnostics = new Diagnostics({ directory: resolve(config.directory, 'diagnostics'),
    budgetBytes: config.diagnosticBudgetBytes, mode: config.diagnosticContent,
    secrets: [process.env.OPENCODE_API_KEY, process.env.OPENAI_API_KEY,
      decodeURIComponent(new URL(config.databaseUrl).password)].filter(Boolean) });
  application = await createApplication({
    diagnostics, databaseUrl: config.databaseUrl,
    outbox: resolve(config.directory, 'generation-outbox'),
    generationOptions: { maxActive: config.generationMaxActive, maxQueued: config.generationMaxQueued },
    logger: { level: config.logLevel }
  });
  await application.start({ port: config.port, host: config.host });
} catch (error) {
  diagnostics ??= new Diagnostics({ directory: resolve('.data', 'diagnostics') });
  diagnostics.emit({ event: 'process.failed', severity: 'error', outcome: 'failed',
    phase: config ? 'startup' : 'configuration', errorType: error.name, errorCode: error.code });
  if (application) await application.close();
  else await diagnostics.close();
  console.error('Vocabularium startup failed. Inspect local diagnostic logs for safe error metadata.');
  process.exitCode = 1;
}

if (application && !process.exitCode) {
  let stopping = false;
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    if (stopping) return;
    stopping = true;
    void application.close().catch(async error => {
      diagnostics.emit({ event: 'process.failed', severity: 'error', outcome: 'failed',
        phase: 'shutdown', errorType: error.name, errorCode: error.code });
      await diagnostics.close(); process.exitCode = 1;
    });
  });
}
