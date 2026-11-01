// @ts-check
// The tools the catalog's content checks may ask for (0.16.0), as the golden
// sets and the language gate supply them on the owner's machine and in CI.
import { spawnSync } from 'node:child_process';

/** @type {import('@vocabularium/domain/checks').CheckTools} */
export const checkTools = {
  // Parses without running: `ast.parse` reads the code and executes nothing.
  pythonParses: async code => spawnSync('python3', ['-I', '-c', 'import ast, sys; ast.parse(sys.stdin.read())'], { input: code }).status === 0
};
