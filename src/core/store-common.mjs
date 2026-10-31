// @ts-check
// What the store's parts share: its error, cursors and page limits for
// bounded lists, the digest of an operation's payload, and small checks.
import { createHash } from 'node:crypto';
import { isParentType } from '@vocabularium/domain/parents';
/** @typedef {Readonly<{ v: 1; kind: string; sequence: number; key: string | number; id: string }>} Cursor */

export class StoreError extends Error {
  /** @param {string} code @param {string} message @param {Record<string, unknown>} [details] */
  constructor(code, message, details) { super(message); this.code = code; this.details = details; }
}
/** @type {(code: string, message: string) => never} */
export const fail = (code, message) => { throw new StoreError(code, message); };
export const encodeCursor = (/** @type {Cursor} */ value) => Buffer.from(JSON.stringify(value)).toString('base64url');
/** @param {unknown} value @param {string} kind @param {number} sequence @returns {Cursor | null} */
export function decodeCursor(value, kind, sequence) {
  if (!value) return null;
  if (typeof value !== 'string' || value.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(value)) fail('invalid', 'The list cursor is invalid.');
  let cursor;
  try { cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); }
  catch { fail('invalid', 'The list cursor is invalid.'); }
  if (!cursor || cursor.v !== 1 || cursor.kind !== kind || typeof cursor.id !== 'string' ||
    (typeof cursor.key !== 'string' && typeof cursor.key !== 'number') || !Number.isSafeInteger(cursor.sequence)) {
    fail('invalid', 'The list cursor is invalid.');
  }
  if (cursor.sequence !== sequence) fail('stale_cursor', 'The list changed. Start from its first page again.');
  return cursor;
}
/** @param {unknown} value @param {number} fallback @param {number} maximum */
export function pageLimit(value, fallback, maximum) {
  if (value === undefined) return fallback;
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > maximum) fail('invalid', `Choose a page size from 1 to ${maximum}.`);
  return limit;
}
/** @param {unknown} value @returns {unknown} */
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(/** @type {Record<string, unknown>} */ (value)[key])]));
  }
  return value;
}
export const digest = (/** @type {unknown} */ value) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
/** @param {unknown} value @param {string} message */
export function textValue(value, message) {
  if (typeof value !== 'string') fail('invalid', message);
  return value;
}
// A parent module carries its facets (D08); other modules keep their earlier shape.
/** @type {(type: string, facets?: readonly string[] | null) => { facets?: string[] }} */
export const withFacets = (type, facets) => isParentType(type) || facets?.length ? { facets: [...(facets ?? [])] } : {};
