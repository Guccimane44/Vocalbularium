import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Accessibility (D05, 0.6.0 increment 8): every token pair the interface draws,
// in both themes, from the design tokens themselves. Text needs 4.5:1 (WCAG AA);
// focus rings, control borders, status marks and family shapes need 3:1.
const tokens = JSON.parse(await readFile(new URL('../extension/design/tokens.json', import.meta.url), 'utf8'));
const FAMILIES = ['meaning', 'usage', 'roots', 'connections', 'sound', 'notes'];
const BACKGROUNDS = ['ground', 'sidebar', 'surface', 'surface-hover', 'surface-active'];

const channel = value => { const v = value / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
function rgba(hex) {
  const parts = hex.replace('#', '').match(/../g).map(part => parseInt(part, 16));
  return { rgb: parts.slice(0, 3), alpha: parts.length === 4 ? parts[3] / 255 : 1 };
}
function contrast(theme, foreground, background, under = 'surface') {
  const color = name => tokens.color.tokens.find(entry => entry.name === name).value[theme];
  const base = rgba(color(under)).rgb;
  // A translucent token (the dark highlight) is drawn over a surface.
  const solid = name => { const { rgb, alpha } = rgba(color(name)); return rgb.map((value, index) => value * alpha + base[index] * (1 - alpha)); };
  const luminance = rgb => { const [r, g, b] = rgb.map(channel); return .2126 * r + .7152 * g + .0722 * b; };
  const [high, low] = [luminance(solid(foreground)), luminance(solid(background))].sort((a, b) => b - a);
  return (high + .05) / (low + .05);
}

const TEXT = [
  ...['ink', 'ink-soft', 'ink-muted'].flatMap(ink => [...BACKGROUNDS, 'status-failed-bg'].map(bg => [ink, bg])),
  ...['ground', 'surface', 'status-failed-bg'].map(bg => ['status-failed', bg]),
  ['on-ink', 'ink'],
  ['ink', 'highlight'],
  ...FAMILIES.map(family => [`on-fam-${family}`, `fam-${family}`]),
  // Meaning and example numbers in the family colour on a card.
  ...FAMILIES.map(family => [`fam-${family}`, 'surface'])
];
const SHAPES = [
  ...[...BACKGROUNDS, 'status-failed-bg'].map(bg => ['focus', bg]),
  ...['ground', 'sidebar', 'surface', 'surface-hover'].map(bg => ['line-control', bg]),
  ...['ground', 'surface'].map(bg => ['status-busy', bg]),
  ...FAMILIES.flatMap(family => ['ground', 'sidebar', 'surface'].map(bg => [`fam-${family}`, bg]))
];

for (const theme of ['light', 'dark']) {
  test(`${theme}: text and its backgrounds reach 4.5:1`, () => {
    const failures = TEXT.map(([fg, bg]) => [fg, bg, contrast(theme, fg, bg)]).filter(([, , ratio]) => ratio < 4.5);
    assert.deepEqual(failures.map(([fg, bg, ratio]) => `${fg} on ${bg}: ${ratio.toFixed(2)}`), []);
  });
  test(`${theme}: focus rings, control borders, status marks and family shapes reach 3:1`, () => {
    const failures = SHAPES.map(([fg, bg]) => [fg, bg, contrast(theme, fg, bg)]).filter(([, , ratio]) => ratio < 3);
    assert.deepEqual(failures.map(([fg, bg, ratio]) => `${fg} on ${bg}: ${ratio.toFixed(2)}`), []);
  });
}
