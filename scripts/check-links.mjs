// @ts-check
// Checks every relative link and heading anchor in the tracked Markdown
// files, outside docs/history/ (which keeps the links it was written with).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path/posix';

// D35 was drafted on the claude/german-tables branch and links files that
// exist only there (five links to four files); they arrive with the dictionary milestone.
const ALLOWED = new Set([
  'docs/decisions/d35.md -> d32.md',
  'docs/decisions/d35.md -> ../plans/luna-and-dictionary-expansion.md#english-what-can-the-dictionary-fill',
  'docs/decisions/d35.md -> ../plans/english-forms-facet.md',
  'docs/decisions/d35.md -> ../history/evidence/english-wiktionary-coverage.md',
]);

const files = execFileSync('git', ['ls-files', '*.md'], { encoding: 'utf8' })
  .split('\n').filter(file => file && !file.startsWith('docs/history/'));

/** GitHub's heading slug: lower case, punctuation dropped, spaces to hyphens. */
const slug = (/** @type {string} */ heading) => heading.trim().toLowerCase()
  .replace(/<[^>]+>/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*_]/g, '')
  .replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s/g, '-');

/** @type {Map<string, Set<string>>} */
const anchorCache = new Map();
function anchors(/** @type {string} */ file) {
  let set = anchorCache.get(file);
  if (set) return set;
  set = new Set();
  /** @type {Map<string, number>} */
  const seen = new Map();
  for (const line of strip(readFileSync(file, 'utf8')).split('\n')) {
    const heading = line.match(/^#{1,6}\s+(.*?)\s*#*\s*$/);
    if (heading) {
      const base = slug(heading[1]); const count = seen.get(base) ?? 0;
      set.add(count ? `${base}-${count}` : base); seen.set(base, count + 1);
    }
  }
  for (const match of readFileSync(file, 'utf8').matchAll(/<a\s+(?:id|name)="([^"]+)"/g)) set.add(match[1]);
  anchorCache.set(file, set);
  return set;
}

/** Drops fenced code blocks and inline code, where brackets are not links. */
function strip(/** @type {string} */ text) {
  return text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '').replace(/`[^`\n]*`/g, '');
}

const problems = [];
let links = 0;
for (const file of files) {
  for (const match of strip(readFileSync(file, 'utf8')).matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const target = match[1];
    if (/^[a-z][a-z+.-]*:/i.test(target)) continue;
    links++;
    if (ALLOWED.has(`${file} -> ${target}`)) continue;
    const [path, anchor] = target.split('#');
    const resolved = path ? normalize(join(dirname(file), decodeURI(path))) : file;
    if (!existsSync(resolved)) { problems.push(`${file}: missing ${target}`); continue; }
    if (anchor && resolved.endsWith('.md') && statSync(resolved).isFile() && !anchors(resolved).has(decodeURIComponent(anchor))) {
      problems.push(`${file}: no anchor #${anchor} in ${resolved}`);
    }
  }
}
if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`${problems.length} broken links.`);
  process.exit(1);
}
console.log(`Checked ${links} relative links in ${files.length} Markdown files.`);
