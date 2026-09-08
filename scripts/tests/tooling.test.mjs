import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  cpSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  chmodSync,
  symlinkSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { inspect, root } from '../doctor.mjs';
import { runSteps } from '../verify.mjs';

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'vocab-tooling space-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const file of [
    '.node-version',
    'package.json',
    'apps/web/package.json',
    'apps/web/package-lock.json',
    '.openai/hosting.json',
    'apps/web/.openai/hosting.json',
    'apps/web/wrangler.local.json',
    'apps/web/.env.example',
  ]) {
    mkdirSync(resolve(directory, file, '..'), { recursive: true });
    cpSync(resolve(root, file), resolve(directory, file));
  }
  return directory;
}
const expected = {
  nodeVersion: '22.21.0',
  npmVersion: '10.9.4',
  bootstrap: true,
};

test('bootstrap doctor accepts source-only checkout; installed dependencies remain required normally', (t) => {
  const directory = fixture(t);
  assert.ok(inspect({ ...expected, directory }).every((c) => c.ok));
  const failures = inspect({ ...expected, directory, bootstrap: false }).filter(
    (c) => !c.ok,
  );
  assert.ok(failures.length > 0);
  assert.ok(
    failures.every(
      (c) =>
        /^(Dependency|Executable) /.test(c.name) && c.remedy.includes('setup'),
    ),
  );
});
test('wrong runtime/npm and missing or malformed tracked metadata fail with remediation', (t) => {
  const directory = fixture(t);
  assert.equal(
    inspect({ ...expected, directory, nodeVersion: '24.0.0' }).find(
      (c) => c.name === 'Node runtime',
    ).ok,
    false,
  );
  assert.equal(
    inspect({ ...expected, directory, npmVersion: undefined }).find(
      (c) => c.name === 'npm runtime',
    ).ok,
    false,
  );
  rmSync(join(directory, 'apps/web/package-lock.json'));
  writeFileSync(
    join(directory, '.openai/hosting.json'),
    'DO_NOT_PRINT_THIS_VALUE',
  );
  const result = inspect({ ...expected, directory });
  assert.ok(result.filter((c) => !c.ok).length >= 3);
  assert.ok(!JSON.stringify(result).includes('DO_NOT_PRINT_THIS_VALUE'));
});
test('mismatched Site identity fails without network or repair', (t) => {
  const directory = fixture(t);
  writeFileSync(
    join(directory, '.openai/hosting.json'),
    JSON.stringify({ project_id: 'different', d1: 'DB' }),
  );
  assert.equal(
    inspect({ ...expected, directory }).find(
      (c) => c.name === 'Hosting manifests',
    ).ok,
    false,
  );
});
test('malformed config shapes and contradictory pins return findings, not exceptions', (t) => {
  const directory = fixture(t);
  const file = join(directory, 'package.json');
  const pkg = JSON.parse(readFileSync(file, 'utf8'));
  pkg.engines.node = '24.0.0';
  writeFileSync(file, JSON.stringify(pkg));
  writeFileSync(
    join(directory, 'apps/web/wrangler.local.json'),
    JSON.stringify({ d1_databases: { binding: 'DB' } }),
  );
  const result = inspect({ ...expected, directory });
  assert.equal(result.find((c) => c.name === 'Toolchain metadata').ok, false);
  assert.equal(result.find((c) => c.name === 'Local D1 binding').ok, false);
  pkg.packageManager = 10;
  writeFileSync(file, JSON.stringify(pkg));
  assert.equal(
    inspect({ ...expected, directory }).find((c) => c.name === 'npm runtime')
      .ok,
    false,
  );
});
test('directories and non-executable files cannot masquerade as package executables', (t) => {
  const directory = fixture(t);
  const bin = join(directory, 'apps/web/node_modules/.bin');
  mkdirSync(join(bin, 'tsx'), { recursive: true });
  writeFileSync(join(bin, 'tsc'), 'not executable');
  chmodSync(join(bin, 'tsc'), 0o600);
  const result = inspect({ ...expected, directory, bootstrap: false });
  assert.equal(result.find((c) => c.name === 'Executable tsx').ok, false);
  assert.equal(result.find((c) => c.name === 'Executable tsc').ok, false);
});
test('verification fails closed and never runs later steps after exit, signal or spawn error', () => {
  for (const failure of [
    { status: 7 },
    { status: null, signal: 'SIGTERM' },
    { error: new Error('missing') },
    {},
  ]) {
    const calls = [];
    const status = runSteps(
      [['first'], ['failure'], ['must-not-run']],
      (step) => {
        calls.push(step[0]);
        return step[0] === 'first' ? { status: 0 } : failure;
      },
    );
    assert.notEqual(status, 0);
    assert.deepEqual(calls, ['first', 'failure']);
  }
});
test('real CLI through a symlink and spaced checkout executes checks and propagates child failure', (t) => {
  const directory = fixture(t);
  const alias = directory + ' alias';
  symlinkSync(directory, alias, 'dir');
  t.after(() => rmSync(alias));
  mkdirSync(join(directory, 'scripts/tests'), { recursive: true });
  for (const name of ['doctor.mjs', 'verify.mjs'])
    cpSync(join(root, 'scripts', name), join(directory, 'scripts', name));
  const doctor = spawnSync(
    process.execPath,
    [join(alias, 'scripts/doctor.mjs')],
    { encoding: 'utf8' },
  );
  assert.equal(doctor.status, 1);
  assert.match(doctor.stdout, /Doctor:/);
  symlinkSync(
    join(root, 'apps/web/node_modules'),
    join(directory, 'apps/web/node_modules'),
    'dir',
  );
  writeFileSync(
    join(directory, 'scripts/tests/tooling.test.mjs'),
    "import test from 'node:test'; test('fixture', () => {});\n",
  );
  const file = join(directory, 'package.json');
  const pkg = JSON.parse(readFileSync(file, 'utf8'));
  pkg.scripts.test = 'node -e "process.exit(7)"';
  pkg.scripts.typecheck = 'node -e "console.log(\'MUST_NOT_EXECUTE\')"';
  writeFileSync(file, JSON.stringify(pkg));
  const result = spawnSync(
    process.execPath,
    [join(alias, 'scripts/verify.mjs'), '--fast'],
    {
      encoding: 'utf8',
      env: { ...process.env, OPENAI_API_KEY: 'DO_NOT_PRINT_SENTINEL' },
    },
  );
  assert.equal(result.status, 7);
  assert.match(result.stdout, /Doctor:/);
  assert.ok(!result.stdout.includes('MUST_NOT_EXECUTE'));
  assert.ok(!(result.stdout + result.stderr).includes('DO_NOT_PRINT_SENTINEL'));
});
