// @ts-check

/** @typedef {import('@vocabularium/contracts').ApiFailure} ApiFailure */

/** @param {string} error @param {string} code @param {Record<string, unknown>} [details] @returns {ApiFailure} */
export function apiFailure(error, code, details) {
  return { error, code, ...(details ? { details } : {}) };
}
