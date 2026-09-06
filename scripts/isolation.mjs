import { execFileSync } from 'node:child_process';
import { createServer as httpServer } from 'node:http';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  realpathSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  cpSync,
  rmSync,
  openSync,
  closeSync,
  constants,
  readdirSync,
} from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { root, isMain } from './doctor.mjs';
import { spawnOwned } from './owned-process.mjs';

export function runPath(id, directory = root) {
  if (!/^[a-z][a-z0-9-]{0,31}$/.test(id ?? ''))
    throw new Error(
      'Use a run ID of 1–32 lowercase letters, digits or hyphens, starting with a letter.',
    );
  const base = realpathSync(directory);
  let path = base;
  for (const part of ['.artifacts', 'runs', id]) {
    path = join(path, part);
    let stat;
    try {
      stat = lstatSync(path);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (stat && (stat.isSymbolicLink() || !stat.isDirectory()))
      throw new Error(
        'Run paths must be real directories inside this checkout.',
      );
  }
  return path;
}

export function readRun(id, directory = root) {
  const dir = runPath(id, directory),
    file = join(dir, 'run.json');
  if (
    !existsSync(file) ||
    !lstatSync(file).isFile() ||
    lstatSync(file).isSymbolicLink()
  )
    throw new Error(
      'Refusing unowned run state: a regular ownership marker is required.',
    );
  let data;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw new Error('Invalid run ownership marker.');
  }
  if (
    !data ||
    data.schema !== 1 ||
    data.id !== id ||
    data.root !== realpathSync(directory) ||
    !['preparing', 'running', 'stopped'].includes(data.status) ||
    !/^[0-9a-f-]{36}$/.test(data.token ?? '')
  )
    throw new Error('Run ownership does not match this checkout.');
  return { dir, data };
}
export function saveRun(dir, data) {
  const temporary = join(dir, '.run-next-' + randomUUID());
  writeFileSync(temporary, JSON.stringify(data, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600,
  });
  renameSync(temporary, join(dir, 'run.json'));
}

export function resourceDirectory(dir, relative) {
  let path = dir;
  for (const part of relative.split('/')) {
    if (!part || part === '.' || part === '..')
      throw new Error('Invalid owned resource path.');
    path = join(path, part);
    let stat;
    try {
      stat = lstatSync(path);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (stat && (stat.isSymbolicLink() || !stat.isDirectory()))
      throw new Error('Owned resource directories cannot be symlinks.');
    if (!stat) mkdirSync(path);
  }
  return path;
}
function regularOutput(file) {
  let stat;
  try {
    stat = lstatSync(file);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (stat && (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1))
    throw new Error('Output must be an owned regular file, not a link.');
  return openSync(
    file,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_TRUNC |
      constants.O_NOFOLLOW,
    0o600,
  );
}
export function validateMutableTree(dir) {
  let stat;
  try {
    stat = lstatSync(dir);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  if (stat.isSymbolicLink())
    throw new Error('Mutable state cannot contain symlinks.');
  if (stat.isDirectory())
    for (const name of readdirSync(dir)) validateMutableTree(join(dir, name));
  else if (stat.isFile() && stat.nlink !== 1)
    throw new Error('Mutable state cannot contain hard links.');
}
function browserIsOpen(dir) {
  return ['.browser.lock', 'browser/SingletonLock'].some((file) => {
    try {
      lstatSync(join(dir, file));
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  });
}

export function fixtureEnvironment(dir) {
  // Deliberately do not copy process.env, npm configuration, auth or provider keys.
  for (const name of ['home', 'tmp', 'logs', 'registry']) {
    resourceDirectory(dir, name);
    validateMutableTree(join(dir, name));
  }
  const userConfig = join(dir, 'home/npm-user.conf'),
    globalConfig = join(dir, 'home/npm-global.conf');
  for (const file of [userConfig, globalConfig]) closeSync(regularOutput(file));
  return {
    PATH: [
      dirname(process.execPath),
      '/usr/bin',
      '/bin',
      '/usr/sbin',
      '/sbin',
    ].join(':'),
    HOME: join(dir, 'home'),
    TMPDIR: join(dir, 'tmp'),
    LANG: 'en_US.UTF-8',
    CODEX_SANDBOX: 'seatbelt',
    WRANGLER_SEND_METRICS: 'false',
    WRANGLER_WRITE_LOGS: 'false',
    WRANGLER_LOG_PATH: join(dir, 'logs'),
    MINIFLARE_REGISTRY_PATH: join(dir, 'registry'),
    CI: '1',
    NPM_CONFIG_USERCONFIG: userConfig,
    NPM_CONFIG_GLOBALCONFIG: globalConfig,
    NPM_CONFIG_REGISTRY: 'https://registry.npmjs.org',
    NPM_CONFIG_LOGS_DIR: join(dir, 'logs/npm'),
  };
}

export function copySource(destination, directory = root) {
  const files = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: directory, encoding: 'utf8' },
  )
    .split('\0')
    .filter(Boolean);
  for (const file of new Set(files)) {
    const parts = file.split('/');
    if (
      parts.some((p) =>
        ['.git', '.artifacts', 'node_modules', 'dist', '.wrangler'].includes(p),
      ) ||
      (/^(\.env|\.dev\.vars)/.test(basename(file)) &&
        basename(file) !== '.env.example') ||
      basename(file) === '.npmrc' ||
      /\.(pem|key|p12|p8|sqlite(?:3)?|db)$/i.test(file)
    )
      continue;
    const source = resolve(directory, file);
    if (
      !source.startsWith(realpathSync(directory) + '/') ||
      parts.includes('..')
    )
      throw new Error('Source path escaped the checkout.');
    if (!existsSync(source)) continue; // A deleted tracked file is absent in this working snapshot.
    if (
      realpathSync(source) !== source ||
      lstatSync(source).isSymbolicLink() ||
      !lstatSync(source).isFile()
    )
      throw new Error(
        'Source snapshot accepts regular files without symlink ancestors only.',
      );
    const target = resolve(destination, file);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target);
  }
}

export async function reservePort(port = 0) {
  if (
    !Number.isInteger(port) ||
    port < 0 ||
    port > 65535 ||
    (port > 0 && port < 1024)
  )
    throw new Error('Port must be zero (allocate) or 1024–65535.');
  const server = createServer();
  await new Promise((yes, no) => {
    server.once('error', no);
    server.listen(port, '127.0.0.1', yes);
  });
  return {
    port: server.address().port,
    release: () => new Promise((resolve) => server.close(resolve)),
  };
}

export function sandboxCommand(args) {
  if (process.platform !== 'darwin' || !existsSync('/usr/bin/sandbox-exec'))
    throw new Error(
      'Isolated runtime currently requires the verified macOS sandbox. Other platforms are not verified.',
    );
  return [
    '/usr/bin/sandbox-exec',
    ['-f', join(root, 'scripts/loopback.sb'), process.execPath, ...args],
  ];
}

export async function startRun({ id, port = 0, resume = false, signal } = {}) {
  sandboxCommand([]); // Fail before creating state on unsupported platforms.
  const dir = runPath(id);
  let metadata;
  if (existsSync(dir)) {
    if (!resume)
      throw new Error(
        'Run ID already exists; use --resume for stopped state or test:reset.',
      );
    metadata = readRun(id).data;
    if (metadata.status !== 'stopped')
      throw new Error('Only stopped owned runs can resume.');
    port = metadata.port;
  } else if (resume) throw new Error('Cannot resume a missing run.');
  const reservation = await reservePort(port);
  let control,
    task,
    log,
    locked = false,
    claimed = false,
    released = false,
    closed = false,
    failure = 0;
  const snapshot = join(dir, 'checkout'),
    web = join(snapshot, 'apps/web');
  const origin = `http://127.0.0.1:${reservation.port}`;
  let complete;
  const wait = new Promise((resolve) => {
    complete = resolve;
  });
  const stop = async () => {
    if (closed) return wait;
    closed = true;
    if (task && !(await task.stop()).clean) {
      closed = false;
      throw new Error(
        'Supervisor did not verify process-group cleanup; owned state and lock retained.',
      );
    }
    if (!released) {
      await reservation.release();
      released = true;
    }
    if (control) control.close();
    if (log !== undefined) {
      closeSync(log);
      log = undefined;
    }
    if (claimed && metadata && existsSync(dir)) {
      metadata.status = 'stopped';
      delete metadata.controlPort;
      saveRun(dir, metadata);
    }
    if (locked) {
      rmSync(join(dir, '.controller.lock'));
      locked = false;
    }
    complete(failure);
  };
  try {
    mkdirSync(dirname(dir), { recursive: true });
    if (!resume) mkdirSync(dir); // Atomic duplicate-ID rejection.
    writeFileSync(join(dir, '.controller.lock'), '', {
      flag: 'wx',
      mode: 0o600,
    });
    locked = true;
    if (resume) {
      const current = readRun(id).data;
      if (current.status !== 'stopped' || current.token !== metadata.token)
        throw new Error('Run changed while acquiring its lifecycle lock.');
      resourceDirectory(dir, 'checkout/apps/web');
      for (const folder of [snapshot, web]) {
        if (
          readdirSync(folder).some(
            (name) =>
              (/^(\.env|\.dev\.vars)/.test(name) && name !== '.env.example') ||
              name === '.npmrc',
          )
        )
          throw new Error(
            'Remove active environment/npm configuration from the disposable snapshot before resuming.',
          );
      }
      validateMutableTree(join(web, '.wrangler'));
    }
    metadata = {
      schema: 1,
      id,
      root: realpathSync(root),
      token: randomUUID(),
      status: 'preparing',
      port: reservation.port,
      origin,
    };
    saveRun(dir, metadata);
    claimed = true;
    if (signal?.aborted) throw new Error('Run cancelled before setup.');
    signal?.addEventListener(
      'abort',
      () => {
        void stop();
      },
      { once: true },
    );
    const env = fixtureEnvironment(dir);
    log = regularOutput(join(dir, 'runtime.log')); // Fresh invocation evidence only.
    if (!resume) {
      copySource(snapshot);
      const original = join(web, 'vite.config.ts');
      renameSync(original, join(web, 'vite.application.config.ts'));
      // A generated local-only wrapper; tracked application configuration is unchanged.
      writeFileSync(
        original,
        `import base from './vite.application.config';\nexport default async (env) => { const config = typeof base === 'function' ? await base(env) : base; return { ...config, envDir: ${JSON.stringify(join(dir, 'home'))}, server: { ...config.server, host: '127.0.0.1', port: ${reservation.port}, strictPort: true } }; };\n`,
      );
      const npm =
        process.env.npm_execpath ??
        realpathSync(join(dirname(process.execPath), 'npm'));
      const cache = resourceDirectory(root, '.artifacts/npm-cache');
      await command(
        process.execPath,
        [
          npm,
          'ci',
          '--prefer-offline',
          '--no-audit',
          '--no-fund',
          '--cache',
          cache,
        ],
        env,
      );
      if (closed) throw new Error('Run cancelled during setup.');
      const [executable, args] = sandboxCommand([
        join(web, 'node_modules/wrangler/bin/wrangler.js'),
        'd1',
        'migrations',
        'apply',
        'DB',
        '--local',
        '--config',
        'wrangler.local.json',
      ]);
      await command(executable, args, env);
      if (closed) throw new Error('Run cancelled during migration.');
    }
    control = httpServer(async (request, response) => {
      if (
        request.method !== 'POST' ||
        request.url !== '/stop' ||
        request.headers['x-run-token'] !== metadata.token
      ) {
        response.writeHead(403).end();
        return;
      }
      try {
        await stop();
        response.writeHead(204).end();
      } catch {
        response.writeHead(409).end();
      }
    });
    await new Promise((yes, no) => {
      control.once('error', no);
      control.listen(0, '127.0.0.1', yes);
    });
    if (closed || signal?.aborted)
      throw new Error('Run cancelled while opening its controller.');
    metadata.controlPort = control.address().port;
    await reservation.release();
    released = true;
    if (closed || signal?.aborted)
      throw new Error('Run cancelled before launching its runtime.');
    const [executable, args] = sandboxCommand([
      join(web, 'node_modules/vinext/dist/cli.js'),
      'dev',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(metadata.port),
    ]);
    task = spawnOwned(executable, args, {
      cwd: web,
      env,
      stdio: ['ignore', log, log],
    });
    let ready = false,
      exited = false;
    task.done.then(() => {
      exited = true;
    });
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline && !exited && !closed) {
      if (
        stripVTControlCharacters(
          readFileSync(join(dir, 'runtime.log'), 'utf8'),
        ).includes(`Local:   ${origin}/`)
      ) {
        try {
          const response = await fetch(origin + '/api/health', {
            signal: AbortSignal.timeout(1500),
          });
          ready = response.ok;
        } catch {
          /* Wait until compiled. */
        }
        if (ready) break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!ready || exited || closed)
      throw new Error(
        'Isolated runtime did not become ready; inspect its runtime.log.',
      );
    metadata.status = 'running';
    saveRun(dir, metadata);
    task.done.then((result) => {
      if (!closed) {
        failure = result.code || (result.clean ? 0 : 1);
        void stop();
      }
    });
    return { id, dir, snapshot, origin, stop, wait };
  } catch (error) {
    await stop();
    throw error;
  }
  async function command(executable, args, env) {
    task = spawnOwned(executable, args, {
      cwd: web,
      env,
      stdio: ['ignore', log, log],
    });
    const result = await task.done;
    if (!result.clean || result.code !== 0)
      throw new Error('Local setup command failed; inspect the owned run log.');
    task = undefined;
  }
}

export async function resetRun(id, directory = root) {
  let { dir, data } = readRun(id, directory);
  if (browserIsOpen(dir))
    throw new Error('Close the owned browser profile before resetting.');
  const generation = data.token;
  if (data.status !== 'stopped') {
    if (
      !Number.isInteger(data.controlPort) ||
      data.controlPort < 1024 ||
      data.controlPort > 65535
    )
      throw new Error(
        'Run is not stopped and has no live controller. Inspect stale state; no PID will be signalled.',
      );
    let response;
    try {
      response = await fetch(`http://127.0.0.1:${data.controlPort}/stop`, {
        method: 'POST',
        headers: { 'x-run-token': data.token },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new Error(
        'Controller unavailable; refusing stale-process cleanup. No PID was signalled.',
      );
    }
    if (response.status !== 204)
      throw new Error(
        'Controller did not acknowledge ownership; refusing cleanup.',
      );
    ({ dir, data } = readRun(id, directory));
    if (data.status !== 'stopped')
      throw new Error('Run has not stopped; refusing cleanup.');
  }
  const lock = join(dir, '.controller.lock');
  const browserLock = join(dir, '.browser.lock');
  let browserLocked = false,
    removed = false;
  writeFileSync(lock, '', { flag: 'wx', mode: 0o600 });
  try {
    ({ dir, data } = readRun(id, directory));
    if (data.status !== 'stopped' || data.token !== generation)
      throw new Error('Run changed during cleanup; refusing reset.');
    if (browserIsOpen(dir))
      throw new Error('Close the owned browser profile before resetting.');
    writeFileSync(browserLock, '', { flag: 'wx', mode: 0o600 });
    browserLocked = true;
    rmSync(dir, { recursive: true });
    removed = true;
  } finally {
    if (!removed && existsSync(dir)) {
      if (browserLocked) rmSync(browserLock, { force: true });
      rmSync(lock, { force: true });
    }
  }
}

export async function main(args = process.argv.slice(2)) {
  let id,
    port = 0,
    resume = false,
    reset = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--run-id') id = args[++i];
    else if (args[i] === '--port') port = Number(args[++i]);
    else if (args[i] === '--resume') resume = true;
    else if (args[i] === '--reset') reset = true;
    else
      throw new Error(
        'Usage: --run-id <id> [--port <port>] [--resume|--reset]',
      );
  }
  if (reset) {
    if (resume) throw new Error('Choose resume or reset, not both.');
    await resetRun(id);
    console.log('Removed only the owned run.');
    return;
  }
  const controller = new AbortController();
  const stop = () => {
    controller.abort();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  const run = await startRun({ id, port, resume, signal: controller.signal });
  console.log(`Isolated preview: ${run.origin}\nOwned state: ${run.dir}`);
  process.exitCode = await run.wait;
}
if (isMain(import.meta.url))
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
