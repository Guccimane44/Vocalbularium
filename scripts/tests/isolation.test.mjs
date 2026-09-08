import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  symlinkSync,
  existsSync,
  realpathSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  runPath,
  readRun,
  resetRun,
  fixtureEnvironment,
  reservePort,
  copySource,
  saveRun,
  validateMutableTree,
} from '../isolation.mjs';
import { spawnOwned } from '../owned-process.mjs';

function fixture(t, id = 'owned') {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), 'vocab-isolation space-')),
  );
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = runPath(id, root);
  mkdirSync(dir, { recursive: true });
  const data = {
    schema: 1,
    root,
    id,
    token: randomUUID(),
    status: 'stopped',
    port: 12345,
  };
  writeFileSync(join(dir, 'run.json'), JSON.stringify(data));
  return { root, dir, data };
}
test('IDs and symlink ancestors cannot escape the owned state directory', (t) => {
  const { root, dir } = fixture(t);
  for (const id of ['../x', '', '/', 'UPPER', 'a/b', 'a'.repeat(33)])
    assert.throws(() => runPath(id, root));
  rmSync(dir, { recursive: true });
  symlinkSync('/private/tmp', dir);
  assert.throws(() => readRun('owned', root), /real directories/);
  rmSync(dir);
  symlinkSync(join(root, 'missing'), dir);
  assert.throws(() => runPath('owned', root), /real directories/);
});
test('reset removes only stopped owned state, never symlink targets', async (t) => {
  const { root, dir } = fixture(t);
  const other = join(root, 'keep');
  writeFileSync(other, 'keep');
  symlinkSync(other, join(dir, 'link'));
  await resetRun('owned', root);
  assert.equal(readFileSync(other, 'utf8'), 'keep');
  assert.equal(existsSync(dir), false);
});
test('unowned, malformed and stale running markers fail closed without PID signalling', async (t) => {
  const { root, dir, data } = fixture(t);
  for (const value of [null, {}, { ...data, root: '/private/tmp' }]) {
    writeFileSync(join(dir, 'run.json'), JSON.stringify(value));
    await assert.rejects(resetRun('owned', root));
  }
  writeFileSync(
    join(dir, 'run.json'),
    JSON.stringify({ ...data, status: 'running', pid: process.pid }),
  );
  await assert.rejects(resetRun('owned', root), /no live controller/);
  assert.ok(existsSync(dir)); // A reused PID is irrelevant; reset never signals it.
});
test('fixture environment ignores inherited secrets, local-tool overrides and npm configuration', (t) => {
  const { dir } = fixture(t);
  const env = fixtureEnvironment(dir);
  for (const key of [
    'OPENAI_API_KEY',
    'RESEND_API_KEY',
    'AUTH_SECRET',
    'NODE_OPTIONS',
    'APPLE_CLIENT_ID',
  ])
    assert.equal(env[key], undefined);
  assert.ok(env.HOME.startsWith(dir));
  assert.ok(env.MINIFLARE_REGISTRY_PATH.startsWith(dir));
  assert.ok(env.NPM_CONFIG_USERCONFIG.startsWith(dir));
  assert.equal(readFileSync(env.NPM_CONFIG_GLOBALCONFIG, 'utf8'), '');
});
test('lifecycle and browser locks prevent deletion of stopped markers during resume', async (t) => {
  const { root, dir } = fixture(t);
  for (const lock of ['.controller.lock', '.browser.lock']) {
    writeFileSync(join(dir, lock), 'owned');
    await assert.rejects(resetRun('owned', root));
    assert.ok(existsSync(dir));
    rmSync(join(dir, lock));
  }
  mkdirSync(join(dir, 'browser'));
  symlinkSync('nonexistent-host-pid', join(dir, 'browser/SingletonLock'));
  await assert.rejects(resetRun('owned', root), /Close the owned browser/);
});
test('resource symlinks and old metadata temporary links cannot cause outside writes', (t) => {
  const { root, dir, data } = fixture(t);
  const other = join(root, 'keep');
  mkdirSync(other);
  symlinkSync(other, join(dir, 'home'));
  assert.throws(() => fixtureEnvironment(dir), /symlinks/);
  assert.equal(existsSync(join(other, 'npm-user.conf')), false);
  const target = join(other, 'sentinel');
  writeFileSync(target, 'unchanged');
  symlinkSync(target, join(dir, 'run.json.next'));
  saveRun(dir, data);
  assert.equal(readFileSync(target, 'utf8'), 'unchanged');
  const profile = join(dir, 'browser');
  mkdirSync(profile);
  symlinkSync(target, join(profile, 'Preferences'));
  assert.throws(() => validateMutableTree(profile), /symlinks/);
});
test('snapshot excludes project npm config and active environment files even if Git lists them', (t) => {
  const { root } = fixture(t);
  execFileSync('git', ['init', '--quiet', root]);
  mkdirSync(join(root, 'apps/web'), { recursive: true });
  for (const name of ['.npmrc', '.env.local', '.dev.vars'])
    writeFileSync(join(root, 'apps/web', name), 'DUMMY_PRIVATE_CONFIGURATION');
  writeFileSync(join(root, 'apps/web/.env.example'), 'OPENAI_API_KEY=\n');
  const destination = join(root, 'copy');
  copySource(destination, root);
  for (const name of ['.npmrc', '.env.local', '.dev.vars'])
    assert.equal(existsSync(join(destination, 'apps/web', name)), false);
  assert.ok(existsSync(join(destination, 'apps/web/.env.example')));
});
test(
  'owned supervisor terminates inherited-group descendants that ignore TERM before reporting cleanup',
  { timeout: 10_000 },
  async (t) => {
    const { dir } = fixture(t);
    const output = join(dir, 'heartbeat');
    const grandchild = `process.on('SIGTERM',()=>{});setInterval(()=>require('node:fs').appendFileSync(${JSON.stringify(output)},'x'),20);`;
    const program = `process.on('SIGTERM',()=>{});require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:'ignore'});setInterval(()=>{},1000);`;
    const owned = spawnOwned(process.execPath, ['-e', program], {
      env: fixtureEnvironment(dir),
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    t.after(() => owned.stop());
    const deadline = Date.now() + 3000;
    while (!existsSync(output) && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 20));
    assert.ok(existsSync(output));
    assert.equal((await owned.stop()).clean, true);
    const content = readFileSync(output, 'utf8');
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(readFileSync(output, 'utf8'), content);
  },
);
test('port reservations reject occupied ports and invalid values', async (t) => {
  const reservation = await reservePort();
  t.after(() => reservation.release());
  await assert.rejects(reservePort(reservation.port), { code: 'EADDRINUSE' });
  for (const port of [-1, 80, 70000, NaN])
    await assert.rejects(reservePort(port));
});

test('cancellation at controller readiness cannot spawn a runtime after cleanup', async (t) => {
  const { Server } = await import('node:http');
  const childProcess = await import('node:child_process');
  const { syncBuiltinESMExports } = await import('node:module');
  const { root } = await import('../doctor.mjs');
  const { startRun } = await import('../isolation.mjs');
  const id = 'cancel-' + randomUUID().slice(0, 8);
  const dir = runPath(id);
  mkdirSync(join(dir, 'checkout/apps/web'), { recursive: true });
  saveRun(dir, {
    schema: 1,
    root,
    id,
    token: randomUUID(),
    status: 'stopped',
    port: 0,
  });
  const abort = new AbortController();
  const originalListen = Server.prototype.listen;
  t.mock.method(Server.prototype, 'listen', function (...args) {
    const callback = args.pop();
    return originalListen.call(this, ...args, () => {
      abort.abort();
      callback();
    });
  });
  const originalSpawn = childProcess.default.spawn;
  let spawned = 0;
  childProcess.default.spawn = () => {
    spawned++;
    throw new Error('Unexpected process launch');
  };
  syncBuiltinESMExports();
  t.after(() => {
    childProcess.default.spawn = originalSpawn;
    syncBuiltinESMExports();
    rmSync(dir, { recursive: true, force: true });
  });
  await assert.rejects(
    startRun({ id, resume: true, signal: abort.signal }),
    /cancelled/,
  );
  assert.equal(spawned, 0);
  assert.equal(readRun(id).data.status, 'stopped');
  assert.equal(existsSync(join(dir, '.controller.lock')), false);
});
