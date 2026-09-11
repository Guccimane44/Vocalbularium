import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const url = new URL(process.env.VOCABULARIUM_API_URL ?? 'http://127.0.0.1:4318');
const local = ['127.0.0.1', 'localhost'].includes(url.hostname);
if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
  throw new Error('Use an HTTPS server origin, or HTTP localhost for development, without credentials, path, or query.');
}
const output = resolve('artifacts/extension');
await mkdir(resolve('artifacts'), { recursive: true });
await rm(output, { recursive: true, force: true });
await cp(resolve('extension'), output, { recursive: true });
const manifest = JSON.parse(await readFile(resolve(output, 'manifest.json'), 'utf8'));
manifest.host_permissions = [`${url.protocol}//${url.hostname}/*`];
await writeFile(resolve(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(resolve(output, 'config.js'), `export const API_URL = ${JSON.stringify(url.origin)};\n`);
console.log(`Built extension in artifacts/extension for ${url.origin}`);
