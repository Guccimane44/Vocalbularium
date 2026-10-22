// Generates extension/theme.css from extension/design/tokens.json, the
// repository copy of the Vocabularium Sage design-system tokens (D05).
// `node scripts/build-theme.mjs --check` fails when theme.css is out of date.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const SOURCE = resolve('extension/design/tokens.json');
const TARGET = resolve('extension/theme.css');

// Forced-colors mode: system colours for every surface, text and cue, in either
// theme. Its selectors repeat each theme block's, so coming last they win.
const FORCED = {
  Canvas: ['ground', 'sidebar', 'surface', 'surface-hover', 'surface-active', 'highlight', 'highlight-green', 'highlight-blue', 'highlight-pink', 'highlight-orange', 'status-failed-bg',
    'fam-translation-tint', 'fam-expertise-tint', 'fam-meaning-tint', 'fam-usage-tint', 'fam-roots-tint', 'fam-connections-tint', 'fam-sound-tint', 'fam-notes-tint'],
  CanvasText: ['ink', 'ink-soft', 'ink-muted', 'line', 'mark', 'status-busy', 'status-failed',
    'fam-translation', 'fam-expertise', 'fam-meaning', 'fam-usage', 'fam-roots', 'fam-connections', 'fam-sound', 'fam-notes'],
  ButtonText: ['line-control', 'on-ink', 'on-fam-translation', 'on-fam-expertise', 'on-fam-meaning', 'on-fam-usage', 'on-fam-roots', 'on-fam-connections', 'on-fam-sound', 'on-fam-notes'],
  Highlight: ['focus']
};

const value = (entry, theme) => typeof entry.value === 'string' ? entry.value : entry.value[theme] ?? entry.value.light;
const declarations = list => list.map(([name, v]) => `  --${name}: ${v};`).join('\n');

export async function buildTheme() {
  const tokens = JSON.parse(await readFile(SOURCE, 'utf8'));
  const colors = tokens.color.tokens;
  const shadows = tokens.shadow?.tokens ?? [];
  // Each family colour again for swatches, which show the colour itself: forced
  // colours leave these copies alone.
  const swatches = colors.filter(entry => /^fam-[a-z]+$/.test(entry.name)).map(entry => ({ ...entry, name: `${entry.name}-swatch` }));
  const themed = theme => [...colors, ...swatches, ...shadows].map(entry => [entry.name, value(entry, theme)]);
  const fixed = ['spacing', 'radius', 'duration', 'easing', 'layout']
    .flatMap(family => (tokens[family]?.tokens ?? []).map(entry => [entry.name, entry.value]));
  const fonts = Object.entries(tokens.type.families).map(([key, stack]) => [`font-${key}`, stack]);
  const dark = `  color-scheme: dark;\n${declarations(themed('dark'))}`;
  return `/* Vocabularium Sage: generated from extension/design/tokens.json by scripts/build-theme.mjs. Do not edit. */
/* No data-theme follows the system setting; data-theme="light" or "dark" overrides it. */
:root, :host {
  color-scheme: light;
${declarations(themed('light'))}
${declarations(fixed)}
${declarations(fonts)}
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
  :root, :host, :root:not([data-theme="light"]), :host(:not([data-theme="light"])), :root[data-theme="dark"], :host([data-theme="dark"]) {
${Object.entries(FORCED).map(([system, names]) => names.map(name => `    --${name}: ${system};`).join('\n')).join('\n')}
  }
}
`;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('build-theme.mjs')) {
  const css = await buildTheme();
  if (process.argv.includes('--check')) {
    const current = await readFile(TARGET, 'utf8').catch(() => '');
    // A Windows checkout may convert line endings; compare the content only.
    if (current.replaceAll('\r\n', '\n') !== css) throw new Error('extension/theme.css is out of date: run node scripts/build-theme.mjs');
    console.log('extension/theme.css matches the design tokens.');
  } else {
    await writeFile(TARGET, css);
    console.log('Wrote extension/theme.css from the design tokens.');
  }
}
