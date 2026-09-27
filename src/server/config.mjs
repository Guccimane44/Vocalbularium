import { resolve } from 'node:path';

const logLevels = new Set(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']);

/** @param {NodeJS.ProcessEnv} [environment] */
export function loadConfig(environment = process.env) {
  const portText = environment.PORT ?? '4318';
  if (typeof portText !== 'string' || !/^\d+$/.test(portText)) {
    throw new Error('Invalid PORT: expected an integer from 0 to 65535.');
  }
  const port = Number(portText);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) {
    throw new Error('Invalid PORT: expected an integer from 0 to 65535.');
  }

  const host = environment.HOST ?? '127.0.0.1';
  if (typeof host !== 'string' || !host.trim() || host.includes('\0')) {
    throw new Error('Invalid HOST: expected a non-empty hostname or IP address.');
  }

  const dataDirectory = environment.DATA_DIR ?? '.data';
  if (typeof dataDirectory !== 'string' || !dataDirectory.trim() || dataDirectory.includes('\0')) {
    throw new Error('Invalid DATA_DIR: expected a non-empty directory path.');
  }

  const logLevel = environment.LOG_LEVEL ?? 'info';
  if (typeof logLevel !== 'string' || !logLevels.has(logLevel)) {
    throw new Error('Invalid LOG_LEVEL: choose trace, debug, info, warn, error, fatal, or silent.');
  }

  const generationLimit = (name, fallback) => {
    const value = environment[name] ?? String(fallback);
    if (typeof value !== 'string' || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) ||
      Number(value) < (name === 'GENERATION_MAX_ACTIVE' ? 1 : 0)) {
      throw new Error(`Invalid ${name}: expected a non-negative safe integer${name === 'GENERATION_MAX_ACTIVE' ? ' greater than zero' : ''}.`);
    }
    return Number(value);
  };
  const generationMaxActive = generationLimit('GENERATION_MAX_ACTIVE', 4);
  const generationMaxQueued = generationLimit('GENERATION_MAX_QUEUED', 16);

  const databaseUrl = environment.DATABASE_URL;
  try {
    const url = new URL(databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2) throw new Error();
  } catch { throw new Error('Invalid DATABASE_URL: provide a PostgreSQL database connection URL.'); }
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    throw new Error('The owner-testing API must bind to loopback.');
  }
  return Object.freeze({ host, port, directory: resolve(dataDirectory), logLevel, databaseUrl,
    generationMaxActive, generationMaxQueued });
}
