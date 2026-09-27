import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { hostPermission, serverOrigin } from './extension-origin.mjs';

const run = promisify(execFile);
await run(process.execPath, [resolve('node_modules/wxt/bin/wxt.mjs'), 'build', '--browser', 'chrome'], {
  maxBuffer: 1024 * 1024
});

const output = resolve('artifacts/extension');
// The bundled worker's injected feedback renderer fetches these CSS files by fixed name.
for (const file of ['theme.css', 'feedback.css']) {
  await cp(resolve('extension', file), resolve(output, file));
}
await writeFile(resolve(output, 'config.js'), `export const API_URL = ${JSON.stringify(serverOrigin)};\n`);

const sourceManifest = JSON.parse(await readFile(resolve('extension/manifest.json'), 'utf8'));
const manifest = JSON.parse(await readFile(resolve(output, 'manifest.json'), 'utf8'));
assert.deepEqual(manifest, { ...sourceManifest, host_permissions: [hostPermission] }, 'WXT changed the extension identity or permissions');
const worker = await readFile(resolve(output, 'background.js'), 'utf8');
assert.ok(worker.includes(JSON.stringify(serverOrigin)), 'The worker does not contain the configured API origin');
console.log(`Built WXT extension in artifacts/extension for ${serverOrigin}`);
