import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

for (const project of ['packages/contracts/tsconfig.json', 'packages/domain/tsconfig.json']) {
  const result = spawnSync(process.execPath, [resolve('node_modules/typescript/bin/tsc'), '-p', project], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
