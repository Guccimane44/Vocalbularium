// The layout rules' colour reading (0.16.0 increment B): what counts as a design token.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseColour, fromTokens, tokenPalette, catalogue } from './screens/rules/index.mjs';

test('0.16.0: a computed colour comes from the tokens at any opacity, or from a colour-mix of two', async () => {
  const { light, dark } = await tokenPalette();
  assert.deepEqual(parseColour('rgb(27, 36, 25)'), { r: 27, g: 36, b: 25, a: 1 });
  assert.deepEqual(parseColour('rgba(27, 36, 25, 0.18)'), { r: 27, g: 36, b: 25, a: 0.18 });
  assert.equal(parseColour('#f1db864d').a.toFixed(2), '0.30');
  // Linux Chromium computes a colour-mix in OKLab to oklab() or oklch().
  assert.equal(parseColour('oklab(0 0 0 / 0)').a, 0, 'a transparent OKLab shadow');
  assert.deepEqual(Object.values(parseColour('oklab(1 0 0)')).slice(0, 3).map(Math.round), [255, 255, 255]);
  assert.deepEqual(Object.values(parseColour('oklch(0.6279 0.2577 29.23)')).slice(0, 3).map(Math.round), [255, 0, 0], 'sRGB red');
  assert.equal(parseColour('lab(50 0 0)'), null);
  // ink, and ink at 18%, in Sage; not in Moss night.
  assert.ok(fromTokens(parseColour('rgba(27, 36, 25, 0.18)'), light));
  assert.equal(fromTokens(parseColour('rgba(27, 36, 25, 0.18)'), dark), false);
  assert.ok(fromTokens(parseColour('rgba(0, 0, 0, 0)'), light), 'transparent');
  assert.ok(fromTokens(parseColour('rgba(0, 0, 0, 0.7)'), dark), 'the dark shadow token');
  // color-mix(in srgb, status-failed 35%, status-failed-bg) in Sage, as Chrome computes it.
  const mix = [[0xa0, 0xfb], [0x30, 0xe9], [0x1c, 0xe4]].map(([a, b]) => (a * 0.35 + b * 0.65) / 255);
  assert.ok(fromTokens(parseColour(`color(srgb ${mix.join(' ')})`), light));
  // The same point written as a plain colour is no mix: raw values are not tokens.
  assert.equal(fromTokens(parseColour(`rgb(${mix.map(each => Math.round(each * 255)).join(', ')})`), light), false);
  assert.equal(fromTokens(parseColour('rgb(255, 0, 170)'), light), false);
});

test('0.16.0: the English catalogue holds the interface strings and the catalog’s module names', async () => {
  const english = await catalogue('en'), french = await catalogue('fr');
  for (const string of ['Your decks', 'German', 'Article']) assert.ok(english.has(string), string);
  assert.ok(french.has('Allemand') && french.has('Vos paquets'));
});
