// @ts-check
// Builds the extension for an API on `port` into `target`, and leaves
// artifacts/extension as it was: the owner's loaded extension points at their
// own API on 4318. The screens harness and scripts/drive.mjs both use it.
import { execFile } from 'node:child_process';
import { access, cp, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const exists = (/** @type {string} */ path) => access(path).then(() => true, () => false);
/** @param {string} command @param {string[]} args @param {string} cwd @param {Record<string, string>} [env] */
const run = (command, args, cwd, env = {}) => exec(command, args, { cwd, env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024 });

/** @param {string} checkout @param {string | number} port @param {string} target */
export async function buildExtensionCopy(checkout, port, target) {
  await run('npm', ['run', 'build:packages'], checkout);
  const output = join(checkout, 'artifacts/extension'), kept = `${output}.copy-kept`;
  const had = await exists(output);
  if (had) { await rm(kept, { recursive: true, force: true }); await rename(output, kept); }
  try {
    await run(process.execPath, ['scripts/build.mjs'], checkout, { VOCABULARIUM_API_URL: `http://127.0.0.1:${port}` });
    await cp(output, target, { recursive: true });
  } finally {
    await rm(output, { recursive: true, force: true });
    if (had) await rename(kept, output);
  }
}
