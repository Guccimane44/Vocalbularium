// Layout rules (0.16.0 increment B): deterministic checks run on every captured
// screen, each naming the rule it broke and the element that broke it. Each UI
// correction the owner makes adds a rule or a case here, so taste accumulates
// as checks. The screen catalogue (tests/screens/) calls checkLayout on every
// capture; tests/browser/layout-rules.test.mjs proves each rule on fixtures.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { inspect } from './inspect.mjs';
import { ALLOWLIST } from './allowlist.mjs';

export const RULES = Object.freeze({
  overflow: 'text-overflow',
  viewport: 'viewport-overflow',
  target: 'target-size',
  focus: 'focus-visible',
  mirror: 'rtl-mirror',
  english: 'english-string',
  colour: 'token-colour'
});
export { ALLOWLIST };

const root = fileURLToPath(new URL('../../../', import.meta.url));
// The smallest target WCAG 2.2 allows (2.5.8), in CSS pixels.
const MIN_TARGET = 24;
// The page's landmarks and the side of what they stand in where each starts,
// left to right (D14: every surface mirrors). Each is measured at its first
// visible instance.
export const LANDMARKS = Object.freeze([
  { name: 'deck sidebar', selector: '#sidebar', within: 'viewport', side: 'start' },
  { name: 'module window', selector: '.module-window', within: 'viewport', side: 'end' },
  { name: 'card tab', selector: 'article.component .card-tab', within: 'article.component', side: 'start' },
  { name: 'account menu', selector: '.account-panel', within: 'viewport', side: 'start' }
]);

// ---- Design tokens -------------------------------------------------------

const hex = value => {
  const digits = value.slice(1);
  const full = digits.length <= 4 ? [...digits].map(digit => digit + digit).join('') : digits;
  const [r, g, b, a = 255] = full.match(/../g).map(pair => parseInt(pair, 16));
  return { r, g, b, a: a / 255 };
};
// A colour as the CSS writes it or the browser computes it, in sRGB 0–255 with
// its alpha; `mixed` marks the `color(srgb …)` a colour-mix() computes to.
export function parseColour(value) {
  const text = value.trim();
  if (text === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (/^#[0-9a-f]{3,8}$/i.test(text)) return hex(text);
  let match = text.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if (match) return { r: +match[1], g: +match[2], b: +match[3], a: alpha(match[4]) };
  match = text.match(/^color\(srgb\s+([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/);
  if (match) return { r: match[1] * 255, g: match[2] * 255, b: match[3] * 255, a: alpha(match[4]), mixed: true };
  // Linux Chromium computes a colour-mix in OKLab to oklab() or oklch().
  match = text.match(/^ok(lab|lch)\(\s*([-\d.e]+%?)\s+([-\d.e]+)\s+([-\d.e]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/);
  if (match) {
    const lightness = match[2].endsWith('%') ? parseFloat(match[2]) / 100 : +match[2];
    const [a, b] = match[1] === 'lab' ? [+match[3], +match[4]] : [match[3] * Math.cos(match[4] * Math.PI / 180), match[3] * Math.sin(match[4] * Math.PI / 180)];
    return { ...oklabToSrgb(lightness, a, b), a: alpha(match[5]), mixed: true };
  }
  return null;
}
const alpha = value => value === undefined ? 1 : value.endsWith('%') ? parseFloat(value) / 100 : +value;
// OKLab to sRGB 0–255 (Björn Ottosson's matrices), clamped to the gamut.
function oklabToSrgb(lightness, a, b) {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  const gamma = linear => 255 * Math.min(1, Math.max(0, linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055));
  return { r: gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), g: gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: gamma(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s) };
}

let tokenColours;
// Every colour the tokens define, per theme: the colour tokens and the colours
// inside the shadow tokens.
export async function tokenPalette() {
  if (tokenColours) return tokenColours;
  const tokens = JSON.parse(await readFile(`${root}extension/design/tokens.json`, 'utf8'));
  const palette = { light: [], dark: [] };
  for (const theme of ['light', 'dark']) {
    for (const token of tokens.color.tokens) palette[theme].push({ name: token.name, ...hex(token.value[theme]) });
    for (const token of tokens.shadow.tokens) {
      for (const match of token.value[theme].matchAll(/rgba?\([^)]*\)|#[0-9a-f]{3,8}\b/gi)) palette[theme].push({ name: token.name, ...parseColour(match[0]) });
    }
  }
  tokenColours = palette;
  return palette;
}
const near = (a, b) => Math.abs(a.r - b.r) <= 1.5 && Math.abs(a.g - b.g) <= 1.5 && Math.abs(a.b - b.b) <= 1.5;
// Whether a computed colour comes from a token: a token's own colour at any
// opacity, or (for a colour-mix) a point between two tokens.
export function fromTokens(colour, palette) {
  if (colour.a === 0) return true;
  if (palette.some(token => near(colour, token))) return true;
  if (!colour.mixed) return false;
  for (const a of palette) for (const b of palette) {
    const span = [b.r - a.r, b.g - a.g, b.b - a.b];
    const length = span[0] ** 2 + span[1] ** 2 + span[2] ** 2;
    if (!length) continue;
    const t = ((colour.r - a.r) * span[0] + (colour.g - a.g) * span[1] + (colour.b - a.b) * span[2]) / length;
    if (t < 0 || t > 1) continue;
    if (near(colour, { r: a.r + t * span[0], g: a.g + t * span[1], b: a.b + t * span[2] })) return true;
  }
  return false;
}

// ---- Catalogues ----------------------------------------------------------

const catalogues = new Map();
// A language's interface strings: its messages and its modules' names from the
// catalog (D25), as the extension merges them. English names come from the
// module definitions themselves.
export async function catalogue(language) {
  if (catalogues.has(language)) return catalogues.get(language);
  const messages = JSON.parse(await readFile(`${root}extension/locales/${language}/messages.json`, 'utf8'));
  const strings = new Set(Object.values(messages).filter(value => typeof value === 'string'));
  if (language === 'en') {
    const { MODULES, contentModule, isContentModule } = await import('@vocabularium/domain/catalog');
    const { FAMILY_LABELS } = await import('@vocabularium/domain/page-modules');
    for (const label of Object.values(FAMILY_LABELS)) strings.add(label);
    for (const [id, module] of Object.entries(MODULES)) {
      strings.add(module.label);
      strings.add(module.description);
      if (!isContentModule(id)) continue;
      const content = contentModule(id);
      for (const label of Object.values(content.core.labels)) strings.add(label);
      for (const facet of content.facets) strings.add(facet.label);
    }
  } else {
    const { catalogNames } = await import('@vocabularium/domain/about');
    for (const value of Object.values(catalogNames(language))) strings.add(value);
  }
  catalogues.set(language, strings);
  return strings;
}
// An English string as a test of a visible text: whole, or with its
// placeholders standing for anything. Strings with too few letters of their own
// to be recognisably English are left out.
const matchers = new Map();
async function englishMatchers(language) {
  if (matchers.has(language)) return matchers.get(language);
  const english = await catalogue('en'), own = await catalogue(language);
  const list = [];
  for (const string of english) {
    if (own.has(string)) continue;
    const literal = string.replace(/\{[^}]+\}/g, ' ');
    if (!/\p{L}{3}/u.test(literal)) continue;
    const pattern = string.includes('{')
      ? new RegExp(`^${string.split(/\{[^}]+\}/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, ' ')).join('.+')}$`, 'su')
      : null;
    list.push({ string: string.replace(/\s+/g, ' ').trim(), pattern });
  }
  matchers.set(language, list);
  return list;
}
const baseLanguage = language => language === 'zh' ? 'zh-Hans' : language;
const CATALOGUE_LANGUAGES = ['en', 'ar', 'zh-Hans', 'fr', 'ru', 'es'];

// ---- The rules -----------------------------------------------------------

// Where each landmark stands in the page as it is: pass this from the English
// capture of a screen as `english` when checking its Arabic capture.
export async function measureLandmarks(page) {
  const found = await page.evaluate(inspect, { landmarks: LANDMARKS, minTarget: MIN_TARGET });
  return { direction: found.direction, landmarks: found.landmarks };
}

/**
 * Runs every layout rule on the page as it stands and returns what it broke.
 * @param {import('playwright').Page} page
 * @param {{ screen?: string, theme?: 'light' | 'dark', language?: string, english?: Awaited<ReturnType<typeof measureLandmarks>>, allowlist?: readonly AllowEntry[] }} [options]
 * @returns {Promise<{ rule: string, selector: string, message: string }[]>}
 * @typedef {{ screen: string | readonly string[], rule: string, selector: string, description: string, theme?: string, language?: string }} AllowEntry
 */
export async function checkLayout(page, { screen = '', theme, language, english, allowlist = ALLOWLIST } = {}) {
  const found = await page.evaluate(inspect, { landmarks: LANDMARKS, minTarget: MIN_TARGET });
  language ??= await page.evaluate(() => document.documentElement.lang || 'en');
  theme ??= await page.evaluate(() => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  const violations = [];
  const add = (rule, selector, message) => violations.push({ rule, selector, message });

  for (const each of found.overflow) {
    add(RULES.overflow, each.selector, each.kind === 'clipped'
      ? `“${each.text}” is cut off by ${each.clipper ?? 'its own box'} and is not truncated with an ellipsis`
      : `“${each.text}” overflows its box and is not truncated with an ellipsis`);
  }
  for (const each of found.wide) add(RULES.viewport, each.selector, `extends past the viewport (${each.left} to ${each.right} px of ${found.viewport.width} px)`);
  for (const each of found.targets) add(RULES.target, each.selector, `target is ${each.width} × ${each.height} px, under ${MIN_TARGET} × ${MIN_TARGET} px, and too close to another target`);
  for (const each of found.focus) add(RULES.focus, each.selector, 'the focused element shows no outline or shadow');

  // Landmarks: in Arabic, each starts where the English one starts, mirrored;
  // in either direction, each stands on its side of what holds it.
  for (const landmark of LANDMARKS) {
    const [here] = found.landmarks[landmark.name] ?? [];
    if (!here) continue;
    const start = found.direction === 'rtl' ? here.right : here.left, end = found.direction === 'rtl' ? here.left : here.right;
    const [there] = english?.landmarks[landmark.name] ?? [];
    if (found.direction === 'rtl' && there && english.direction === 'ltr') {
      const tolerance = Math.max(8, here.width * 0.05);
      if (Math.abs(start - there.left) > tolerance) {
        add(RULES.mirror, here.selector, `the ${landmark.name} starts ${Math.round(start)} px from the inline start; in English it starts ${Math.round(there.left)} px from it`);
      }
      continue;
    }
    const near = landmark.side === 'start' ? start : end, far = landmark.side === 'start' ? end : start;
    if (near - far > 8) {
      const sides = found.direction === 'rtl' ? { start: 'right', end: 'left' } : { start: 'left', end: 'right' };
      add(RULES.mirror, here.selector, `the ${landmark.name} stands at the ${sides[landmark.side === 'start' ? 'end' : 'start']} (${found.direction}); it belongs at the ${sides[landmark.side]}`);
    }
  }

  // English strings on a screen in another catalogue language.
  const code = baseLanguage(language);
  if (code !== 'en' && CATALOGUE_LANGUAGES.includes(code)) {
    const list = await englishMatchers(code);
    const reported = new Set();
    for (const text of found.texts) {
      if (text.content) continue;
      for (const candidate of [text.own, text.whole]) {
        const hit = list.find(each => each.pattern ? each.pattern.test(candidate) : each.string === candidate);
        if (!hit || reported.has(`${text.selector}\n${hit.string}`)) continue;
        reported.add(`${text.selector}\n${hit.string}`);
        add(RULES.english, text.selector, `shows the English “${hit.string}” on a screen in ${code}`);
        break;
      }
    }
  }

  // Colours: every one from the tokens of the screen's theme.
  if (!found.forced) {
    const palette = (await tokenPalette())[theme] ?? [...(await tokenPalette()).light, ...(await tokenPalette()).dark];
    const reported = new Set();
    for (const each of found.colours) {
      if (/^currentcolor$/i.test(each.value)) continue;
      const colour = parseColour(each.value);
      if (colour && fromTokens(colour, palette)) continue;
      const key = `${each.selector}\n${each.property}\n${each.value}`;
      if (reported.has(key)) continue;
      reported.add(key);
      add(RULES.colour, each.selector, colour ? `${each.property} ${each.value} is not a ${theme} design token` : `${each.property} ${each.value} is not an sRGB colour the rules can check`);
    }
  }

  // The same break in several instances of one element (two cards' tabs) is reported once.
  const seen = new Set();
  return violations.filter(violation => {
    const key = `${violation.rule}\n${violation.selector}\n${violation.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return !allowed(violation, { screen, theme, language }, allowlist);
  });
}

function allowed(violation, { screen, theme, language }, allowlist) {
  return allowlist.some(entry => entry.rule === violation.rule && entry.selector === violation.selector
    && (entry.screen === '*' || [entry.screen].flat().includes(screen))
    && (!entry.theme || entry.theme === theme) && (!entry.language || entry.language === language));
}
