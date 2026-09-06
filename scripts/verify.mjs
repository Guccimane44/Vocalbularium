import { spawnSync } from 'node:child_process';
import { root, npmCommand, isMain } from './doctor.mjs';

export function runSteps(steps, execute) {
  for (const step of steps) {
    console.log(`Verify: ${step.join(' ')}`);
    const result = execute(step);
    if (result.error || result.signal || result.status !== 0) {
      console.error(`Verification stopped: ${step[0]} failed.`);
      return Number.isInteger(result.status) && result.status > 0
        ? result.status
        : 1;
    }
  }
  return 0;
}

export function main(args = process.argv.slice(2)) {
  if (args.some((arg) => arg !== '--fast')) {
    console.error('Usage: node scripts/verify.mjs [--fast]');
    return 2;
  }
  const steps = [
    ['node', 'scripts/doctor.mjs'],
    ['node', '--test', 'scripts/tests/tooling.test.mjs'],
    ['npm', 'test'],
    ['npm', 'run', 'typecheck'],
    ...[
      'apps/chrome/background.js',
      'apps/chrome/popup.js',
      'apps/web/public/sw.js',
    ].map((file) => ['node', '--check', file]),
  ];
  if (!args.includes('--fast')) steps.push(['npm', 'run', 'build']);
  return runSteps(steps, ([command, ...parameters]) =>
    command === 'npm'
      ? npmCommand(parameters, { cwd: root, stdio: 'inherit' })
      : spawnSync(process.execPath, parameters, {
          cwd: root,
          stdio: 'inherit',
        }),
  );
}

if (isMain(import.meta.url)) process.exitCode = main();
