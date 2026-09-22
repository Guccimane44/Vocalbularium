// @ts-check

/** @typedef {import('@vocabularium/contracts').ApiFailure} ApiFailure */

/** @param {unknown} value @returns {value is ApiFailure} */
export function isApiFailure(value) {
  return typeof value === 'object' && value !== null &&
    'error' in value && typeof value.error === 'string' &&
    'code' in value && typeof value.code === 'string' &&
    (!('details' in value) || value.details === undefined ||
      (typeof value.details === 'object' && value.details !== null && !Array.isArray(value.details)));
}
