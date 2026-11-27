// @ts-check
// A German word's etymology from the German Wiktionary (v0.17.0 step 3: the
// judge with a reference). Wiktionary is CC BY-SA, read through its MediaWiki
// API, and each word is cached under .data/wiktionary/ so a run asks once. Only
// the German word goes out. DWDS is never fetched: its terms require permission
// for automated queries.
import { mkdir, readFile, writeFile } from 'node:fs/promises';

export const CREDIT = 'Etymologies from de.wiktionary.org, CC BY-SA 4.0.';
const CACHE = '.data/wiktionary/';

/**
 * The "Herkunft" text of every German entry in a page's wikitext, as plain
 * text, or null when there is none.
 * @param {string} wikitext @returns {string | null}
 */
export function herkunft(wikitext) {
  const german = wikitext.split(/^== /m).filter(section => /\{\{Sprache\|Deutsch\}\}/.test(section.split('\n')[0] ?? ''));
  const parts = german.flatMap(section => [...section.matchAll(/\{\{Herkunft\}\}\n([\s\S]*?)(?=\n\{\{|\n==|$)/g)].map(match => plain(match[1] ?? '')));
  const text = parts.filter(part => part && !/^\s*$/.test(part)).join('\n');
  return text || null;
}

/** Wiki markup as plain text. @param {string} text */
function plain(text) {
  return text
    .replace(/<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    // {{Ü|goh|hūs}} writes a word in another language: keep the word.
    .replace(/\{\{Ü[a-z]*\|[^|{}]*\|([^|{}]*)[^{}]*\}\}/g, '$1')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/'''?/g, '')
    .replace(/<[^>]+>/g, '')
    .split('\n').map(line => line.replace(/^:+\s*/, '').trim()).filter(Boolean).join(' ')
    .replace(/\s+([,.;])/g, '$1').trim();
}

/**
 * The etymology of one German word, from the cache or the API. A word with no
 * page, or no German Herkunft, gives null; so does a failed request, which is
 * not cached.
 * @param {string} word @param {typeof fetch} [fetchImpl] @returns {Promise<string | null>}
 */
export async function etymologyOf(word, fetchImpl = fetch) {
  const file = `${CACHE}${encodeURIComponent(word)}.json`;
  try { return JSON.parse(await readFile(file, 'utf8')).etymology; } catch { /* not cached yet */ }
  const url = `https://de.wiktionary.org/w/api.php?action=parse&format=json&formatversion=2&prop=wikitext&redirects=1&page=${encodeURIComponent(word)}`;
  /** @type {Response | undefined} */
  let response;
  // Wikimedia limits the request rate: a 429 says how long to wait, and is tried again up to three times.
  for (let attempt = 0; attempt < 4; attempt++) {
    try { response = await fetchImpl(url, { headers: { 'User-Agent': 'Vocabularium-judge/0.17 (calibration research)' }, signal: AbortSignal.timeout(15000) }); }
    catch { return null; }
    if (response.status !== 429) break;
    await new Promise(resolve => setTimeout(resolve, 1000 * Math.min(60, Number(response?.headers.get('retry-after')) || 20)));
  }
  if (!response?.ok) return null;
  const body = await response.json();
  const etymology = body.error ? null : herkunft(String(body.parse?.wikitext ?? ''));
  await mkdir(CACHE, { recursive: true });
  await writeFile(file, JSON.stringify({ word, etymology, fetched: new Date().toISOString() }) + '\n');
  return etymology;
}
