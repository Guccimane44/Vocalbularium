// @ts-check
import Value from 'typebox/value';
import { CapturePayloadSchema } from '@vocabularium/contracts';

/** @typedef {import('@vocabularium/contracts').CapturePayload} CapturePayload */

/** @param {unknown} value @returns {value is CapturePayload} */
export function isCapturePayload(value) {
  return Value.Check(CapturePayloadSchema, value);
}
