// Generates extension/theme.css from extension/design/tokens.json, the
// repository copy of the Vocabularium Sage design-system tokens (D05).
// `node scripts/build-theme.mjs --check` fails when theme.css is out of date.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const SOURCE = resolve('extension/design/tokens.json');
const TARGET = resolve('extension/theme.css');

// Names the 0.5.2 stylesheets still use, mapped onto the Sage tokens until the
// views are restyled. The test suite checks the contrast of these pairs.
const LEGACY = {
  background: 'ground', text: 'ink', muted: 'ink-muted', border: 'line-control', hover: 'surface-hover',
  primary: 'ink', 'primary-hover': 'ink-soft', 'on-primary': 'on-ink',
  'completed-bg': 'fam-usage-tint', 'completed-cue': 'fam-usage',
  'pending-bg': 'fam-roots-tint', 'pending-cue': 'fam-roots',
  'failed-bg': 'status-failed-bg', 'failed-cue': 'status-failed'
};

// Forced-colors mode: system colours for every surface, text and cue.
const FORCED = {
  Canvas: ['ground', 'sidebar', 'surface', 'surface-hover', 'surface-active', 'highlight', 'status-failed-bg', 'background', 'hover',
    'completed-bg', 'pending-bg', 'failed-bg', 'fam-meaning-tint', 'fam-usage-tint', 'fam-roots-tint', 'fam-connections-tint', 'fam-sound-tint', 'fam-notes-tint'],
  CanvasText: ['ink', 'ink-soft', 'ink-muted', 'line', 'mark', 'status-busy', 'status-failed', 'text', 'muted',
    'completed-cue', 'pending-cue', 'failed-cue', 'fam-meaning', 'fam-usage', 'fam-roots', 'fam-connections', 'fam-sound', 'fam-notes'],
  ButtonText: ['line-control', 'border', 'on-ink', 'on-primary', 'on-fam-meaning', 'on-fam-usage', 'on-fam-roots', 'on-fam-connections', 'on-fam-sound', 'on-fam-notes'],
  ButtonFace: ['primary', 'primary-hover'],
  Highlight: ['focus']
};

const value = (entry, theme) => typeof entry.value === 'string' ? entry.value : entry.value[theme] ?? entry.value.light;
const declarations = list => list.map(([name, v]) => `  --${name}: ${v};`).join('\n');

export async function buildTheme() {
  const tokens = JSON.parse(await readFile(SOURCE, 'utf8'));
  const colors = tokens.color.tokens;
  const shadows = tokens.shadow?.tokens ?? [];
  const themed = theme => [...colors, ...shadows].map(entry => [entry.name, value(entry, theme)]);
  const fixed = ['spacing', 'radius', 'duration', 'easing', 'layout']
    .flatMap(family => (tokens[family]?.tokens ?? []).map(entry => [entry.name, entry.value]));
  const fonts = Object.entries(tokens.type.families).map(([key, stack]) => [`font-${key}`, stack]);
  const legacy = Object.entries(LEGACY).map(([name, target]) => [name, `var(--${target})`]);
  const dark = `  color-scheme: dark;\n${declarations(themed('dark'))}`;
  return `/* Vocabularium Sage: generated from extension/design/tokens.json by scripts/build-theme.mjs. Do not edit. */
/* No data-theme follows the system setting; data-theme="light" or "dark" overrides it. */
:root, :host {
  color-scheme: light;
${declarations(themed('light'))}
${declarations(fixed)}
${declarations(fonts)}
${declarations(legacy)}
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]), :host(:not([data-theme="light"])) {
${dark.replaceAll('\n  ', '\n    ').replace(/^ {2}/, '    ')}
  }
}
:root[data-theme="dark"], :host([data-theme="dark"]) {
${dark}
}
@media (prefers-reduced-motion: reduce) {
  :root, :host {
${(tokens.duration?.tokens ?? []).map(entry => `    --${entry.name}: 0ms;`).join('\n')}
  }
}
@media (forced-colors: active) {
  :root, :host, :root[data-theme="dark"], :host([data-theme="dark"]) {
${Object.entries(FORCED).map(([system, names]) => names.map(name => `    --${name}: ${system};`).join('\n')).join('\n')}
  }
}
`;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('build-theme.mjs')) {
  const css = await buildTheme();
  if (process.argv.includes('--check')) {
    const current = await readFile(TARGET, 'utf8').catch(() => '');
    if (current !== css) throw new Error('extension/theme.css is out of date: run node scripts/build-theme.mjs');
    console.log('extension/theme.css matches the design tokens.');
  } else {
    await writeFile(TARGET, css);
    console.log('Wrote extension/theme.css from the design tokens.');
  }
}
