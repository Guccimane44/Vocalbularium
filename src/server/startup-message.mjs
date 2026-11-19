// @ts-check
/** @typedef {Error & { code?: string }} StartError */

const GENERIC = 'Vocabularium startup failed. Inspect local diagnostic logs for safe error metadata.';

/**
 * Explains a failed start in one line. Another API already running is the
 * common case: it holds the database lock (`api_already_running`) or the port
 * (`EADDRINUSE`). Then the message names the address and, if that API answers,
 * its build, so the owner knows which process to stop.
 * @param {StartError} error
 * @param {{ host?: string, port?: number, fetch?: typeof globalThis.fetch }} [options]
 */
export async function startupMessage(error, { host = '127.0.0.1', port = 4318, fetch = globalThis.fetch } = {}) {
  if (error?.code !== 'api_already_running' && error?.code !== 'EADDRINUSE') return GENERIC;
  const address = `http://${host.includes(':') ? `[${host}]` : host}:${port}`;
  const build = await runningBuild(address, fetch);
  const holder = error.code === 'EADDRINUSE' ? `Port ${port} on ${host} is already in use` : 'Another Vocabularium API already owns this database';
  const running = build
    ? `Vocabularium ${build.version} (${build.commit.slice(0, 7)}${build.dirty ? ', with uncommitted changes' : ''}) is running at ${address}.`
    : build === null ? `Something is answering at ${address}, but it does not say which build it is.`
    : `Nothing answers at ${address}, so the other API may use another port or another checkout.`;
  return `Vocabularium startup failed: ${holder}. ${running} Stop that process (Ctrl+C in its terminal), then start again.`;
}

/**
 * @param {string} address
 * @param {typeof globalThis.fetch} fetch
 * @returns {Promise<{ version: string, commit: string, dirty?: boolean } | null | undefined>}
 *   The build, null when something answers without one, undefined when nothing answers.
 */
async function runningBuild(address, fetch) {
  try {
    const response = await fetch(`${address}/health/live`, { signal: AbortSignal.timeout(1000) });
    const body = await response.json().catch(() => null);
    const build = body?.build;
    return typeof build?.version === 'string' && typeof build?.commit === 'string' ? build : null;
  } catch {
    return undefined;
  }
}
