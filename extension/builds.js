// @ts-check
// The extension and the API it talks to should come from the same commit. When
// they do not, the account menu names both, so a stale extension, an API left
// running from another branch, or an API older than this check shows at once.
/** @typedef {import('@vocabularium/contracts').SourceStamp} SourceStamp */

/** The two short commits when the builds differ; null when they match or the extension's own is unknown (unbundled, as in unit tests). @param {{ extension: SourceStamp, api: SourceStamp | null } | undefined} builds @returns {{ api: string, extension: string } | null} */
export function buildMismatch(builds) {
  if (!builds || builds.extension.commit === 'unknown') return null;
  const api = builds.api?.commit ?? '?';
  if (api === builds.extension.commit) return null;
  const short = (/** @type {string} */ commit) => /^[0-9a-f]{40}$/.test(commit) ? commit.slice(0, 7) : commit;
  return { api: short(api), extension: short(builds.extension.commit) };
}
