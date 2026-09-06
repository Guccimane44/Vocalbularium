import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isMain } from './doctor.mjs';

// The supervisor stays alive as process-group leader through group termination.
// Control uses its live IPC channel, never a saved PID or a process-name search.
export function spawnOwned(executable, args, options) {
  const { stdio = ['ignore', 'inherit', 'inherit'], ...rest } = options;
  const supervisor = spawn(
    process.execPath,
    [fileURLToPath(import.meta.url), executable, ...args],
    {
      ...rest,
      detached: true,
      stdio: [...stdio, 'ipc'],
    },
  );
  let result,
    drained = false,
    stopped = false;
  supervisor.on('message', (message) => {
    if (message.type === 'result') result = message;
    if (message.type === 'drained') drained = true;
  });
  const done = new Promise((resolve) => {
    supervisor.once('error', () => resolve({ clean: false, code: 1 }));
    supervisor.once('close', (_code, signal) =>
      resolve({
        clean: drained && signal === 'SIGKILL',
        code: result?.code ?? (stopped && drained ? 0 : 1),
      }),
    );
  });
  return {
    done,
    stop() {
      stopped = true;
      if (supervisor.connected) supervisor.send({ type: 'stop' }, () => {});
      return done;
    },
  };
}

function supervise() {
  let closing = false;
  const keepAlive = setInterval(() => {}, 60_000);
  const drain = () => {
    if (closing) return;
    closing = true;
    // The leader handles TERM and remains alive, preventing group-ID reuse.
    process.kill(-process.pid, 'SIGTERM');
    setTimeout(() => {
      const kill = () => {
        clearInterval(keepAlive);
        process.kill(-process.pid, 'SIGKILL');
      };
      if (process.connected) process.send({ type: 'drained' }, kill);
      else kill();
    }, 300);
  };
  process.on('SIGTERM', drain);
  process.on('SIGINT', drain);
  process.on('disconnect', drain);
  process.on('message', (message) => {
    if (message.type === 'stop') drain();
  });
  const child = spawn(process.argv[2], process.argv.slice(3), {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  const report = (code, signal) => {
    if (process.connected)
      process.send({ type: 'result', code, signal }, drain);
    else drain();
  };
  child.once('error', () => report(1));
  child.once('exit', report);
}
if (isMain(import.meta.url)) supervise();
