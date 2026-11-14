// @ts-check
// What the live scripts spend (M7): the service's own list cost of each reply,
// added up on the provider, so a golden run can record each card's cost and
// the judge its total. Replies without a cost count as nothing.
/** @import { Reply } from '../src/server/provider.mjs' */

/** @param {import('../src/server/opencode.mjs').OpenCodeProvider} provider @returns {{ spent: () => number }} */
export function meter(provider) {
  let spent = 0;
  const send = provider.send.bind(provider);
  /** @param {any} request @param {unknown} messages @param {AbortSignal} signal @param {string} sessionId @param {Reply} reply */
  provider.send = async (request, messages, signal, sessionId, reply) => {
    try { await send(request, messages, signal, sessionId, reply); }
    finally { spent += costOf(reply.raw); }
  };
  return { spent: () => spent };
}

/** The list cost, in dollars, of one raw reply. @param {string | undefined} raw */
export function costOf(raw) {
  try { return Number(JSON.parse(raw ?? '').usage?.opencode?.list_cost) || 0; } catch { return 0; }
}

// The judge's model: JUDGE_MODEL, else the generator's (M7). A judge's
// calibration counts only for the model it was made with.
/** @param {Record<string, string | undefined>} env */
export function judgeModel(env) {
  return env.JUDGE_MODEL || env.OPENCODE_MODEL || undefined;
}
