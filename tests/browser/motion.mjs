// What the eye sees during a move, frame by frame. The owner found eleven
// flickers, jumps and flashes by eye between 10 October and 4 November 2026
// (reorder snapping back, a card leaping from the page's foot, an empty deck or
// "Page unavailable" drawn for a moment); a static screenshot never shows them.
// `watchMotion` records every animation frame of a move and `assertSmooth`
// fails on what made each of those wrong. tests/browser/motion.test.mjs runs
// every move in the catalogue through it; a new interaction joins it there.
import assert from 'node:assert/strict';

/**
 * @typedef {{ x: number, y: number }} Point
 * @typedef {{ t: number, rows: Record<string, Point>, flashes: string[] }} Frame
 * @typedef {{ selector: string, text?: string }} Flash
 */

/**
 * Starts recording, from the next frame, where each row is drawn (by its key's
 * text) and which of `flashes` are visible. Recording ends after `frames` frames
 * or at `stop()`, which resolves with the frames.
 * @param {import('playwright').Page} page
 * @param {{ rows: string, key: string, box?: string, flashes?: Flash[], frames?: number }} options
 *   rows: each moving element; key: the child whose text names it; box: the
 *   child that is measured (default: the row itself); flashes: elements that
 *   must never be drawn, optionally only with this text.
 */
export async function watchMotion(page, { rows, key, box, flashes = [], frames = 150 }) {
  await page.evaluate(({ rows, key, box, flashes, frames }) => {
    /** @type {any} */ const scope = window;
    const record = scope.__motion = { frames: [], done: false };
    const visible = (/** @type {Element} */ node) => {
      const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && Number(style.opacity) > 0.05;
    };
    const sample = () => {
      if (record.done) return;
      /** @type {Record<string, { x: number, y: number }>} */
      const seen = {};
      for (const row of document.querySelectorAll(rows)) {
        const name = row.querySelector(key)?.textContent?.trim();
        const measured = box ? row.querySelector(box) : row;
        if (!name || !measured || !visible(measured)) continue;
        const rect = measured.getBoundingClientRect();
        seen[name] = { x: Math.round(rect.x * 10) / 10, y: Math.round(rect.y * 10) / 10 };
      }
      // An element paints something when it holds text, a background, a border or an image; an empty placeholder does not.
      const paints = (/** @type {Element} */ node) => {
        const style = getComputedStyle(node);
        const background = style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent';
        const border = ['Top', 'Right', 'Bottom', 'Left'].some(side => parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0
          && style.getPropertyValue(`border-${side.toLowerCase()}-style`) !== 'none');
        return Boolean(node.textContent?.trim()) || background || border || style.backgroundImage !== 'none' || Boolean(node.querySelector('img, svg'));
      };
      const drawn = flashes.flatMap(flash => [...document.querySelectorAll(flash.selector)]
        .filter(node => visible(node) && paints(node) && (flash.text === undefined || node.textContent?.trim() === flash.text))
        .map(node => `${flash.selector} "${(node.textContent ?? '').trim().slice(0, 60)}"`));
      record.frames.push({ t: Math.round(performance.now()), rows: seen, flashes: drawn });
      if (record.frames.length >= frames) record.done = true; else requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, { rows, key, box, flashes, frames });
  return {
    /** Waits for the recording to fill, then returns it. @returns {Promise<Frame[]>} */
    async finish() {
      await page.waitForFunction(() => /** @type {any} */ (window).__motion.done, null, { timeout: 15000 });
      return page.evaluate(() => /** @type {any} */ (window).__motion.frames);
    },
    /** Ends the recording now and returns it. @returns {Promise<Frame[]>} */
    async stop() {
      return page.evaluate(() => { /** @type {any} */ const record = window.__motion; record.done = true; return record.frames; });
    }
  };
}

/**
 * Fails when, during the recorded frames:
 * - a row moves one way and then back (a reorder snapping back, a flicker);
 * - a row covers more than `jump` pixels and more than 60% of its whole travel
 *   in one frame (it was moved without animation, or leapt from elsewhere);
 * - a row disappears and comes back (drawn twice);
 * - any of the flashes was drawn.
 * `still` names rows that must stay where they are: they may drift at most
 * `stillBy` pixels (a smooth few-pixel settle is invisible).
 * @param {Frame[]} frames @param {{ label: string, jump?: number, tolerance?: number, still?: string[], stillBy?: number }} options
 */
export function assertSmooth(frames, { label, jump = 16, tolerance = 2, still = [], stillBy = 4 }) {
  assert.ok(frames.length > 2, `${label}: frames were recorded`);
  const problems = [];
  const names = new Set(frames.flatMap(frame => Object.keys(frame.rows)));
  for (const name of names) {
    const presence = frames.map(frame => name in frame.rows ? 1 : 0).join('');
    if (/10+1/.test(presence)) problems.push(`${name} disappears and comes back (${presence.replace(/(.)\1+/g, '$1…')})`);
    for (const axis of /** @type {const} */ (['x', 'y'])) {
      const positions = frames.map(frame => frame.rows[name]?.[axis]).filter(value => value !== undefined);
      const moves = positions.slice(1).map((value, index) => value - positions[index]);
      const travel = Math.max(...positions) - Math.min(...positions);
      if (still.includes(name) && travel > stillBy) problems.push(`${name} moves ${Math.round(travel)} px on ${axis} but should stay still (${[...new Set(positions)].join(' → ')})`);
      const forward = moves.some(move => move > tolerance), back = moves.some(move => move < -tolerance);
      if (forward && back) problems.push(`${name} moves both ways on ${axis}: ${moves.filter(move => Math.abs(move) > tolerance).map(Math.round).join(', ')}`);
      const largest = Math.max(0, ...moves.map(Math.abs));
      if (largest > jump && largest > travel * 0.6) problems.push(`${name} leaps ${Math.round(largest)} px on ${axis} in one frame, of ${Math.round(travel)} px in all`);
    }
  }
  for (const flash of new Set(frames.flatMap(frame => frame.flashes))) {
    const drawnIn = frames.filter(frame => frame.flashes.includes(flash)).length;
    problems.push(`${flash} was drawn in ${drawnIn} of ${frames.length} frames`);
  }
  assert.deepEqual(problems, [], `${label}: ${problems.join('; ')}`);
}
