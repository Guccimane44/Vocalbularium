// `npm run screens`: captures the screen catalogue (0.16.0 increment A) into
// `.data/screens/<time>/screens/` and compares it with a baseline, writing
// `.data/screens/<time>/index.html`.
//
//   npm run screens                     compare with the baseline directory (.data/screens/baseline)
//   npm run screens -- --base main      capture main too, in a temporary worktree, and compare with it
//   npm run screens -- --update         write this capture as the baseline directory
//
// Also: --baseline <dir>, --threshold <ratio>, --port <port> (4341), --only <regex>,
// --languages en,ar and --themes light. It fails on a capture error, a layout
// violation, or a screen whose changed-pixel ratio is over the threshold.
import { execFile } from 'node:child_process';
import { access, cp, mkdir, mkdtemp, readdir, rename, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { compare } from './compare.mjs';

const exec = promisify(execFile);
// Over this share of its pixels a screen counts as changed. Tuned on unchanged
// main in CI, where two captures differ by no pixel at all; see docs/guides/screens.md.
export const THRESHOLD = 0.0001;

const { values: options } = parseArgs({ options: {
  base: { type: 'string' }, update: { type: 'boolean' }, baseline: { type: 'string' }, threshold: { type: 'string' },
  port: { type: 'string' }, out: { type: 'string' }, only: { type: 'string' }, languages: { type: 'string' }, themes: { type: 'string' }
} });
const root = resolve('.');
const port = options.port ?? process.env.SCREENS_PORT ?? '4341';
const threshold = Number(options.threshold ?? process.env.SCREENS_THRESHOLD ?? THRESHOLD);
const baseline = resolve(options.baseline ?? '.data/screens/baseline');
const out = resolve(options.out ?? join('.data/screens', new Date().toISOString().replace(/[:.]/g, '-')));
const scratch = await mkdtemp(join(tmpdir(), 'vocabularium-screens-build-'));
const filters = ['only', 'languages', 'themes'].flatMap(name => options[name] ? [`--${name}`, options[name]] : []);
const exists = path => access(path).then(() => true, () => false);
const run = (command, args, cwd, env = {}) => exec(command, args, { cwd, env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024 });

// Builds the extension of the checkout at `checkout` for the screens' port into `target`,
// leaving the checkout's own `artifacts/extension` (the owner's, pointed at 4318) as it was.
async function buildExtension(checkout, target) {
  await run('npm', ['run', 'build:packages'], checkout);
  const output = join(checkout, 'artifacts/extension'), kept = `${output}.screens-kept`;
  const had = await exists(output);
  if (had) { await rm(kept, { recursive: true, force: true }); await rename(output, kept); }
  try {
    await run(process.execPath, ['scripts/build.mjs'], checkout, { VOCABULARIUM_API_URL: `http://127.0.0.1:${port}` });
    await cp(output, target, { recursive: true });
  } finally {
    await rm(output, { recursive: true, force: true });
    if (had) await rename(kept, output);
  }
}
async function capture(checkout, label, target) {
  const extension = join(scratch, `${label}-extension`);
  console.log(`Building ${label}…`);
  await buildExtension(checkout, extension);
  console.log(`Capturing ${label}…`);
  const child = execFile(process.execPath, ['tests/screens/capture.mjs', '--out', target, '--extension', extension, '--port', port, ...filters],
    { cwd: checkout, env: process.env, maxBuffer: 64 * 1024 * 1024 });
  child.stdout.pipe(process.stdout); child.stderr.pipe(process.stderr);
  const code = await new Promise(done => child.on('close', done));
  if (code) console.error(`Capturing ${label} reported errors (exit ${code}).`);
  return code;
}
// A worktree of `ref` sharing this checkout's installed dependencies; only the
// workspace packages point at the worktree's own. The catalogue is this checkout's,
// so both sides show the same screens. A different lockfile gets its own install.
async function worktree(ref) {
  const directory = join(scratch, 'base');
  await run('git', ['worktree', 'add', '--detach', directory, ref], root);
  const { stdout: lock } = await run('git', ['diff', '--quiet', ref, '--', 'package-lock.json'], root).then(() => ({ stdout: 'same' }), () => ({ stdout: 'different' }));
  if (lock === 'same') {
    await mkdir(join(directory, 'node_modules/@vocabularium'), { recursive: true });
    for (const entry of await readdir(join(root, 'node_modules'))) {
      if (entry !== '@vocabularium') await symlink(join(root, 'node_modules', entry), join(directory, 'node_modules', entry));
    }
    for (const name of ['contracts', 'domain']) await symlink(`../../packages/${name}`, join(directory, 'node_modules/@vocabularium', name));
  } else {
    console.log(`${ref} has another package-lock.json: installing its dependencies…`);
    await run('npm', ['ci', '--no-audit', '--no-fund'], directory);
  }
  await rm(join(directory, 'tests/screens'), { recursive: true, force: true });
  await cp(join(root, 'tests/screens'), join(directory, 'tests/screens'), { recursive: true });
  return directory;
}

let failed = false, base = null;
try {
  if (options.base) {
    base = await worktree(options.base);
    if (await capture(base, options.base, join(out, 'base'))) failed = true;
  }
  if (await capture(root, 'working tree', join(out, 'screens'))) failed = true;
  const { summary } = await compare({ before: base ? join(out, 'base') : baseline, after: join(out, 'screens'), report: out, threshold });
  if (options.update) {
    await rm(baseline, { recursive: true, force: true });
    await cp(join(out, 'screens'), baseline, { recursive: true });
    console.log(`Wrote the baseline to ${baseline}.`);
  }
  console.log(`${summary.total} captures: ${summary.hasBaseline ? `${summary.changed} changed over ${threshold}` : 'no baseline'}, ${summary.new} new, ${summary.removed} removed, ` +
    `${summary.errors} errors, ${summary.rules ? `${summary.violations} layout violations` : 'no layout rules'}; largest unflagged change ${summary.maxNoise}.`);
  console.log(`Report: ${join(out, 'index.html')}`);
  if (summary.errors || summary.violations || (!options.update && (summary.changed || summary.new || summary.removed) && summary.hasBaseline)) failed = true;
} finally {
  if (base) await run('git', ['worktree', 'remove', '--force', base], root).catch(error => console.error(error.message));
  await rm(scratch, { recursive: true, force: true });
}
process.exitCode = failed ? 1 : 0;
