import { spawnSync } from 'node:child_process';
import { cpSync } from 'node:fs';
import { resolve } from 'node:path';

for (const project of ['packages/contracts/tsconfig.json', 'packages/domain/tsconfig.json']) {
  const result = spawnSync(process.execPath, [resolve('node_modules/typescript/bin/tsc'), '-p', project], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// The catalog's prompt files and the composer's rules ship beside the compiled
// domain, where the composer reads them (D11).
cpSync(resolve('packages/domain/src'), resolve('packages/domain/dist'), { recursive: true, filter: source => !/\.ts$/.test(source) });
