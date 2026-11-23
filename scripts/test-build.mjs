// @ts-check
// A ready-to-load extension for the owner to try a PR by hand. It builds a
// committed revision (HEAD by default) in a clean checkout, so local edits
// and untracked files never reach it, for the owner's API on 4318. Then it
// packages and checks it the way a delivery is, and unzips it beside the ZIP.
//
//   npm run test-build [-- <revision>]
//
// It writes artifacts/vocabularium-<version>-local-candidate-<commit>.zip, its
// .sha256, and the folder of the same name, whose extension/ is what Chrome's
// "Load unpacked" takes. A build of the same commit replaces the earlier one.
import { execFileSync } from 'node:child_process';
import { copyFile, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve('.');
/** @param {string} command @param {string[]} args @param {string} [cwd] @param {Record<string, string | undefined>} [env] */
const run = (command, args, cwd = root, env = process.env) => execFileSync(command, args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

const revision = run('git', ['rev-parse', '--verify', `${process.argv[2] ?? 'HEAD'}^{commit}`]).trim();
const commit = revision.slice(0, 7);
if (run('git', ['status', '--porcelain', '--untracked-files=no']).trim() && !process.argv[2])
  console.warn(`Uncommitted changes are not in this build: it is ${commit} as committed.`);

const checkout = await mkdtemp(join(tmpdir(), `vocabularium-test-build-${commit}-`));
run('git', ['worktree', 'add', '--detach', checkout, revision]);
try {
  // The checkout shares this repository's installed dependencies.
  await symlink(join(root, 'node_modules'), join(checkout, 'node_modules'));
  const origin = 'http://127.0.0.1:4318';
  const env = { ...process.env, VOCABULARIUM_API_URL: origin };
  run('npm', ['run', 'build'], checkout, env);
  run('python3', ['scripts/package.py'], checkout, env);
  const { version } = JSON.parse(await readFile(join(checkout, 'package.json'), 'utf8'));
  const built = join(checkout, 'artifacts', `vocabularium-${version}-local-candidate.zip`);
  run('python3', [join(root, '.agents/skills/vocabularium-deliver/scripts/verify_package.py'), built, '--expect-origin', origin, '--expect-revision', revision]);

  const name = `vocabularium-${version}-local-candidate-${commit}`;
  const zip = join(root, 'artifacts', `${name}.zip`), folder = join(root, 'artifacts', name);
  await copyFile(built, zip);
  const sha256 = createHash('sha256').update(await readFile(zip)).digest('hex');
  await writeFile(`${zip}.sha256`, `${sha256}  ${name}.zip\n`);
  await rm(folder, { recursive: true, force: true });
  run('unzip', ['-q', zip, '-d', folder]);
  console.log([`Built ${version} at ${commit} for ${origin}; the package check passed.`,
    `ZIP: ${zip}`, `SHA-256: ${sha256}`, `Load unpacked: ${join(folder, 'extension')}`].join('\n'));
} finally {
  run('git', ['worktree', 'remove', '--force', checkout]);
}
