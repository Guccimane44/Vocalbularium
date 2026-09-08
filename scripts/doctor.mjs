import {
  accessSync,
  constants,
  existsSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';

export const root = resolve(import.meta.dirname, '..');

export function inspect({
  directory = root,
  nodeVersion = process.versions.node,
  npmVersion,
  bootstrap = false,
} = {}) {
  const checks = [];
  const check = (name, ok, remedy) =>
    checks.push({ name, ok: Boolean(ok), remedy });
  const json = (file) => {
    try {
      const data = JSON.parse(readFileSync(resolve(directory, file), 'utf8'));
      if (!data || typeof data !== 'object' || Array.isArray(data))
        throw new Error('shape');
      return data;
    } catch {
      check(file, false, 'Restore this tracked JSON file from Git.');
      return null;
    }
  };
  let pin;
  try {
    pin = readFileSync(resolve(directory, '.node-version'), 'utf8').trim();
  } catch {
    check('Node pin', false, 'Restore .node-version from Git.');
  }
  check(
    'Node runtime',
    /^\d+\.\d+\.\d+$/.test(pin ?? '') && nodeVersion === pin,
    'Select the exact Node version in .node-version using your version manager.',
  );
  const pkg = json('package.json');
  const expectedNpm =
    typeof pkg?.packageManager === 'string'
      ? pkg.packageManager.match(/^npm@(\d+\.\d+\.\d+)$/)?.[1]
      : undefined;
  check(
    'npm runtime',
    expectedNpm && npmVersion === expectedNpm,
    'Use the exact npm version in package.json packageManager; no tools are installed automatically.',
  );
  check(
    'Toolchain metadata',
    pin &&
      expectedNpm &&
      pkg?.engines?.node === pin &&
      pkg?.engines?.npm === expectedNpm,
    'Align root engines with .node-version and packageManager.',
  );
  const web = json('apps/web/package.json');
  const lock = json('apps/web/package-lock.json');
  check(
    'Web lockfile',
    lock?.lockfileVersion === 3 &&
      isDeepStrictEqual(
        lock?.packages?.['']?.dependencies,
        web?.dependencies,
      ) &&
      isDeepStrictEqual(
        lock?.packages?.['']?.devDependencies,
        web?.devDependencies,
      ),
    'Restore a matching web package.json/package-lock.json pair; do not update dependencies to bypass this check.',
  );
  const hosting = json('.openai/hosting.json');
  const webHosting = json('apps/web/.openai/hosting.json');
  check(
    'Hosting manifests',
    hosting?.project_id &&
      hosting.d1 === 'DB' &&
      isDeepStrictEqual(hosting, webHosting),
    'Restore the matching registered Site manifests; never register a new Site for local checks.',
  );
  const local = json('apps/web/wrangler.local.json');
  check(
    'Local D1 binding',
    Array.isArray(local?.d1_databases) &&
      local.d1_databases.some(
        (d) =>
          d?.binding === 'DB' &&
          d.database_id === '00000000-0000-4000-8000-000000000000' &&
          d.migrations_dir === 'drizzle',
      ),
    'Restore the local-only D1 configuration.',
  );
  check(
    'Environment example',
    existsSync(resolve(directory, 'apps/web/.env.example')),
    'Restore apps/web/.env.example. Fixture checks need no live credentials.',
  );
  if (!bootstrap && web) {
    for (const [name, version] of Object.entries({
      ...web.dependencies,
      ...web.devDependencies,
    })) {
      let installed;
      try {
        installed = JSON.parse(
          readFileSync(
            resolve(directory, 'apps/web/node_modules', name, 'package.json'),
            'utf8',
          ),
        ).version;
      } catch {
        /* Report only package identity, never file contents. */
      }
      check(
        `Dependency ${name}`,
        installed === version,
        'Run npm run setup in this checkout.',
      );
    }
    for (const executable of ['tsx', 'tsc', 'vinext', 'wrangler']) {
      let runnable = false;
      try {
        const file = resolve(
          directory,
          'apps/web/node_modules/.bin',
          executable,
        );
        accessSync(file, constants.X_OK);
        runnable = statSync(file).isFile();
      } catch {
        /* Missing/non-executable files are findings, not repairs. */
      }
      check(
        `Executable ${executable}`,
        runnable,
        'Run npm run setup in this checkout to restore package executables.',
      );
    }
  }
  return checks;
}

export function npmCommand(args, options = {}) {
  // npm supplies its CLI path during lifecycle scripts; avoid shell interpolation.
  return process.env.npm_execpath
    ? spawnSync(process.execPath, [process.env.npm_execpath, ...args], options)
    : spawnSync(
        process.platform === 'win32' ? 'npm.cmd' : 'npm',
        args,
        options,
      );
}

export function main(args = process.argv.slice(2)) {
  if (args.some((arg) => !['--bootstrap', '--json'].includes(arg))) {
    console.error('Usage: node scripts/doctor.mjs [--bootstrap] [--json]');
    return 2;
  }
  const npm = npmCommand(['--version'], { encoding: 'utf8' });
  const checks = inspect({
    npmVersion: npm.status === 0 ? npm.stdout.trim() : undefined,
    bootstrap: args.includes('--bootstrap'),
  });
  const native = spawnSync('xcode-select', ['-p'], { encoding: 'utf8' });
  const generator = spawnSync('xcodegen', ['--version'], { encoding: 'utf8' });
  const optional = {
    fullXcode:
      native.status === 0 && native.stdout.includes('.app/Contents/Developer'),
    xcodegen: generator.status === 0,
    note: 'Optional native prerequisites only; no iOS build or live service check was run.',
  };
  if (args.includes('--json'))
    console.log(JSON.stringify({ checks, optional }, null, 2));
  else {
    for (const item of checks.filter((c) => !c.ok))
      console.error(`FAIL ${item.name}: ${item.remedy}`);
    console.log(
      `Doctor: ${checks.filter((c) => c.ok).length}/${checks.length} checks passed.`,
    );
    console.log(
      `Optional native tools: full Xcode ${optional.fullXcode ? 'available' : 'unavailable'}, XcodeGen ${optional.xcodegen ? 'available' : 'unavailable'}.`,
    );
  }
  return checks.every((c) => c.ok) ? 0 : 1;
}

export function isMain(url) {
  try {
    return url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}
if (isMain(import.meta.url)) process.exitCode = main();
