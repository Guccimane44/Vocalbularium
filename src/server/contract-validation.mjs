// @ts-check
import Value from 'typebox/value';
import { PageCapturePayloadSchema } from '@vocabularium/contracts';

/** @param {unknown} value */
export function isCapturePayload(value) {
  return Value.Check(PageCapturePayloadSchema, value);
}
