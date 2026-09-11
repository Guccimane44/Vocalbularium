import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApplication } from './app.mjs';

const directory = resolve(process.env.DATA_DIR ?? '.data');
mkdirSync(directory, { recursive: true });
const application = createApplication({ filename: resolve(directory, 'account.sqlite') });
const address = await application.start({ port: Number(process.env.PORT ?? 4318), host: process.env.HOST ?? '127.0.0.1' });
console.log(`Vocabularium account server: ${address}`);
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
  await application.close(); process.exit(0);
});
