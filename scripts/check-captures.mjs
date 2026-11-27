// @ts-check
// Model-checks the capture protocol, from the menu click to a saved page, with
// TLC over formal/captures/Captures.tla: every order of lost replies, Try saving
// again, worker restarts and browser restarts within the bounds in Captures.cfg.
// The vocabularium-captures skill says what it proves and how to read a failure.
//
//   npm run check:captures                        every rule, on the real design
//   npm run check:captures -- --break <name>      the model with a code mistake
//   npm run check:captures -- --self-test         every break fails its rule
//
// It needs Java 11 or later (JAVA_HOME, Homebrew's openjdk, or java on PATH).
// The first run downloads TLC 1.7.4 into ~/.cache/vocabularium and checks it.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const TLC = {
  version: '1.7.4',
  url: 'https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar',
  sha256: '936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88'
};
const MODEL = resolve('formal/captures');

// Each rule in plain words, and the harm when it breaks.
const RULES = {
  OnePage: ['A capture never makes a second page, whatever is resent.', 'The user finds the same word twice in a deck.'],
  NeverLost: ['A capture the user made has its page, or a receipt to retry.', 'A capture vanishes without a trace.'],
  SavedHasPage: ['A receipt says saved only when its page exists.', 'Recent captures says saved for a page that does not exist.'],
  NeverReused: ['No capture is refused as operation_reused.', 'A capture can never be saved: every retry is refused.'],
  Fenced: ['No attempt keeps loading once its browser session has ended.', 'A card spins forever, or a late result lands after its session ended.'],
  InFlightNotInterrupted: ['A save in flight is never told it was interrupted.', 'Recent captures offers Try saving again for a capture that is still saving.']
};
// Each modelled code mistake, and the rule that must catch it.
const BREAKS = {
  'no-replay': 'OnePage',
  'fail-drops-receipt': 'NeverLost',
  'saved-before-reply': 'SavedHasPage',
  'recovery-in-fingerprint': 'NeverReused',
  'interrupted-generates': 'Fenced',
  'reconcile-marks-in-flight': 'InFlightNotInterrupted'
};
// Each action of a counterexample, in the code's words.
const STEPS = {
  StartSession: 'initialize: the browser has no session, so a new one is made with the next epoch',
  OpenSessionAndReconcile: 'initialize: /api/session opens the session, then reconcile marks "interrupted" every saving capture this worker is not saving',
  WorkerRestart: 'Chrome stops the worker; chrome.storage.session survives',
  BrowserRestart: 'the browser restarts: the worker goes and chrome.storage.session is cleared',
  Capture: 'the user captures from the menu: handleCapture keeps a saving receipt and calls submit',
  TryAgain: 'the user presses Try saving again: submit runs on the stored receipt',
  DeckChange: 'the default deck\'s configuration changes',
  Ctx: 'submit: context() awaits initialize and reads the session',
  SendPrepare: 'submit sends /api/capture/prepare',
  SendCapture: 'submit sends /api/capture',
  Timeout: 'the request fails or its reply is lost; submit writes the receipt pending',
  PrepareReply: 'submit reads the prepare reply',
  CaptureReply: 'submit reads the capture reply',
  HandOff: 'clearHandedOffCaptures removes the saved receipt',
  ServeSomePrepare: 'the store serves prepareCapture',
  ServeSomeCapture: 'the store serves capture',
  LoseSomeRequest: 'a request is lost before the server sees it',
  Generated: 'the capture\'s attempts finish',
  Done: 'nothing left to do'
};

const { values: options } = parseArgs({ options: { break: { type: 'string', multiple: true, default: [] }, 'self-test': { type: 'boolean', default: false } } });

function findJava() {
  const candidates = [process.env.JAVA_HOME && join(process.env.JAVA_HOME, 'bin/java'), '/opt/homebrew/opt/openjdk/bin/java', '/usr/local/opt/openjdk/bin/java', 'java'];
  for (const java of candidates) {
    if (java && spawnSync(java, ['-version'], { stdio: 'ignore' }).status === 0) return java;
  }
  throw new Error('No Java runtime: install one (brew install openjdk) or set JAVA_HOME.');
}

async function findTlc() {
  const dir = join(homedir(), '.cache/vocabularium', `tlc-${TLC.version}`), jar = join(dir, 'tla2tools.jar');
  if (!existsSync(jar)) {
    console.log(`Downloading TLC ${TLC.version} from ${TLC.url}…`);
    const response = await fetch(TLC.url);
    if (!response.ok) throw new Error(`Downloading TLC failed: ${response.status}`);
    await mkdir(dir, { recursive: true });
    await writeFile(jar, Buffer.from(await response.arrayBuffer()));
  }
  const sum = createHash('sha256').update(await readFile(jar)).digest('hex');
  if (sum !== TLC.sha256) throw new Error(`${jar} is not TLC ${TLC.version} (sha256 ${sum}); delete it and run again.`);
  return jar;
}

/**
 * One TLC run over the given rules, with the given breaks, in a scratch folder
 * that holds TLC's state files and is removed afterwards.
 * @param {string} java @param {string} jar @param {string[]} rules @param {string[]} breaks
 */
async function run(java, jar, rules, breaks) {
  const dir = await mkdtemp(join(tmpdir(), 'check-captures-'));
  try {
    await copyFile(join(MODEL, 'Captures.tla'), join(dir, 'Captures.tla'));
    const config = (await readFile(join(MODEL, 'Captures.cfg'), 'utf8'))
      .replace(/Breaks = \{\}/, `Breaks = {${breaks.map(name => JSON.stringify(name)).join(', ')}}`)
      .replace(/INVARIANTS[\s\S]*?\n\n/, `INVARIANTS\n${rules.map(rule => `  ${rule}`).join('\n')}\n\n`);
    await writeFile(join(dir, 'Captures.cfg'), config);
    const result = spawnSync(java, ['-XX:+UseParallelGC', '-cp', jar, 'tlc2.TLC', '-workers', 'auto',
      '-metadir', join(dir, 'states'), '-config', 'Captures.cfg', 'Captures.tla'], { cwd: dir, encoding: 'utf8', maxBuffer: 1 << 28 });
    const output = `${result.stdout}${result.stderr}`;
    const broken = output.match(/Error: Invariant (\w+) is violated/)?.[1];
    // The first state is the start, not a step.
    const steps = [...output.matchAll(/^State \d+: <(\w+)/gm)].map(match => match[1]).slice(1);
    const states = output.match(/states generated, ([\d,]+) distinct states found, 0 states left/)?.[1];
    const seconds = output.match(/Finished in (\S+)/)?.[1];
    if (!broken && !/No error has been found/.test(output)) throw new Error(`TLC did not finish:\n${output.slice(-3000)}`);
    return { broken, steps, states, seconds };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** @param {string} rule @param {string[]} steps */
function tell(rule, steps) {
  const [promise, harm] = RULES[/** @type {keyof typeof RULES} */ (rule)];
  console.log(`\nBroke "${rule}": ${promise}\n  Harm: ${harm}\n  A shortest order of steps that breaks it:`);
  steps.forEach((step, index) => console.log(`    ${index + 1}. ${STEPS[/** @type {keyof typeof STEPS} */ (step)] ?? step}`));
}

const java = findJava(), jar = await findTlc();
if (options['self-test']) {
  let missed = 0;
  for (const [name, rule] of Object.entries(BREAKS)) {
    const { broken, steps } = await run(java, jar, [rule], [name]);
    console.log(broken === rule ? `ok    break "${name}" breaks "${rule}" in ${steps.length} steps` : `MISS  break "${name}" did not break "${rule}"`);
    if (broken !== rule) missed++;
  }
  if (missed) { console.error(`${missed} break(s) went unnoticed: the model no longer guards against them.`); process.exit(1); }
  console.log('Every break is caught.');
} else {
  // Check every rule: when one breaks, report it and check the rest without it.
  let rules = Object.keys(RULES), failures = 0;
  while (rules.length) {
    const { broken, steps, states, seconds } = await run(java, jar, rules, options.break);
    if (!broken) {
      console.log(`\nHeld on every order within the bounds (${states} states, ${seconds}): ${rules.join(', ')}.`);
      break;
    }
    tell(broken, steps);
    failures++;
    rules = rules.filter(rule => rule !== broken);
  }
  if (failures) process.exit(1);
}
