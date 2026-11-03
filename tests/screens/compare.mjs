// Compares two captures of the screen catalogue pixel by pixel and writes the
// report: `report.json` and `index.html`, each screen beside its baseline with a
// diff image and its changed-pixel ratio, and the layout rules each one broke.
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

// A pixel counts as changed past this colour distance (pixelmatch's 0 to 1);
// anti-aliased pixels are left out.
const COLOUR_THRESHOLD = 0.1;

const readPng = async path => PNG.sync.read(await readFile(path));
// Draws an image on a canvas of the given size; the rest stays transparent.
function padded(image, width, height) {
  if (image.width === width && image.height === height) return image;
  const canvas = new PNG({ width, height });
  PNG.bitblt(image, canvas, 0, 0, image.width, image.height, 0, 0);
  return canvas;
}
const readManifest = async directory => JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8').catch(() => '{"captures":[]}'));

// `before` may be missing (no baseline yet): the report then lists the captures alone.
export async function compare({ before, after, report, threshold }) {
  const afterManifest = await readManifest(after);
  const beforeFiles = new Set(before ? await readdir(before).catch(() => []) : []);
  const hasBaseline = beforeFiles.size > 0;
  await mkdir(join(report, 'diff'), { recursive: true });
  await mkdir(join(report, 'baseline'), { recursive: true });
  const screens = [];
  for (const capture of afterManifest.captures) {
    const entry = { ...capture, status: 'unchanged', ratio: 0 };
    screens.push(entry);
    if (capture.error) { entry.status = 'error'; continue; }
    if (!hasBaseline) { entry.status = 'no-baseline'; continue; }
    if (!beforeFiles.has(capture.file)) { entry.status = 'new'; continue; }
    const [a, b] = await Promise.all([readPng(join(before, capture.file)), readPng(join(after, capture.file))]);
    const width = Math.max(a.width, b.width), height = Math.max(a.height, b.height);
    const diff = new PNG({ width, height });
    const changed = pixelmatch(padded(a, width, height).data, padded(b, width, height).data, diff.data, width, height,
      { threshold: COLOUR_THRESHOLD, includeAA: false, alpha: 0.2 });
    entry.ratio = changed / (width * height);
    entry.size = a.width === b.width && a.height === b.height ? null : { before: [a.width, a.height], after: [b.width, b.height] };
    if (!changed && !entry.size) continue;
    entry.status = entry.ratio > threshold || entry.size ? 'changed' : 'noise';
    await writeFile(join(report, 'diff', capture.file), PNG.sync.write(diff));
    await copyFile(join(before, capture.file), join(report, 'baseline', capture.file));
  }
  const captured = new Set(afterManifest.captures.map(capture => capture.file));
  const removed = [...beforeFiles].filter(file => file.endsWith('.png') && !captured.has(file));
  const summary = {
    threshold, hasBaseline, total: screens.length,
    changed: screens.filter(screen => screen.status === 'changed').length,
    new: screens.filter(screen => screen.status === 'new').length,
    removed: removed.length,
    errors: screens.filter(screen => screen.status === 'error').length,
    violations: screens.reduce((sum, screen) => sum + (screen.violations?.length ?? 0), 0),
    rules: afterManifest.rules ?? false,
    maxNoise: Math.max(0, ...screens.filter(screen => screen.status !== 'changed').map(screen => screen.ratio))
  };
  await writeFile(join(report, 'report.json'), JSON.stringify({ summary, screens, removed }, null, 2));
  await writeFile(join(report, 'index.html'), html({ summary, screens, removed, shots: relative(report, after) }));
  return { summary, screens, removed };
}

const escape = text => String(text).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
const percent = ratio => `${(ratio * 100).toFixed(ratio && ratio < 0.0001 ? 4 : 2)}%`;
const ORDER = { error: 0, changed: 1, new: 2, noise: 3, unchanged: 4, 'no-baseline': 4 };

function html({ summary, screens, removed, shots }) {
  const sorted = screens.toSorted((a, b) => (ORDER[a.status] - ORDER[b.status]) || (b.violations?.length ?? 0) - (a.violations?.length ?? 0) || a.file.localeCompare(b.file));
  const image = (src, label) => `<figure><figcaption>${label}</figcaption><a href="${src}"><img loading="lazy" src="${src}" alt="${label}"></a></figure>`;
  const row = screen => {
    const violations = screen.violations?.length ? `<ul class="violations">${screen.violations.map(v =>
      `<li><b>${escape(v.rule)}</b> <code>${escape(v.selector)}</code> ${escape(v.message)}</li>`).join('')}</ul>` : '';
    const figures = screen.status === 'changed' || screen.status === 'noise'
      ? image(`baseline/${screen.file}`, 'Baseline') + image(`${shots}/${screen.file}`, 'This change') + image(`diff/${screen.file}`, 'Diff')
      : screen.status === 'error' ? '' : image(`${shots}/${screen.file}`, 'This change');
    const size = screen.size ? ` · size ${screen.size.before.join('×')} → ${screen.size.after.join('×')}` : '';
    const open = ['error', 'changed', 'new'].includes(screen.status) || screen.violations?.length ? ' open' : '';
    return `<details class="screen ${screen.status}"${open}><summary><span class="file">${escape(screen.file)}</span>
      <span class="status">${screen.status}</span><span class="ratio">${percent(screen.ratio)}${size}</span>
      ${screen.violations?.length ? `<span class="count">${screen.violations.length} layout</span>` : ''}</summary>
      ${screen.error ? `<p class="error">${escape(screen.error)}</p>` : ''}${violations}<div class="figures">${figures}</div></details>`;
  };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Screens report</title><style>
:root { color-scheme: light dark; --line: #8884; --changed: #c0392b; --ok: #2e7d32; --warn: #b26a00; }
body { font: 14px/1.4 system-ui, sans-serif; margin: 0 auto; padding: 16px; max-width: 1600px; background: Canvas; color: CanvasText; }
h1 { font-size: 20px; } .summary { display: flex; flex-wrap: wrap; gap: 8px 24px; margin-bottom: 16px; }
details.screen { border-top: 1px solid var(--line); padding: 6px 0; } summary { cursor: pointer; display: flex; gap: 16px; flex-wrap: wrap; }
.file { font-family: ui-monospace, monospace; min-width: 22em; } .status { min-width: 6em; }
.changed .status, .error .status, .count, .error { color: var(--changed); font-weight: 600; } .new .status { color: var(--warn); } .unchanged .status { color: var(--ok); }
.figures { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; margin-top: 8px; }
figure { margin: 0; } img { width: 100%; height: auto; border: 1px solid var(--line); } figcaption { font-weight: 600; margin-bottom: 4px; }
.violations { margin: 6px 0; } code { font-size: 12px; }
</style></head><body><h1>Screens report</h1><div class="summary">
<span>${summary.total} captures</span><span>${summary.hasBaseline ? `${summary.changed} changed over ${percent(summary.threshold)}` : 'No baseline to compare with'}</span>
<span>${summary.new} new</span><span>${summary.removed} removed</span><span>${summary.errors} failed to capture</span>
<span>${summary.rules ? `${summary.violations} layout violations` : 'Layout rules not present'}</span><span>Largest unflagged change ${percent(summary.maxNoise)}</span></div>
${removed.length ? `<p>Removed: ${removed.map(escape).join(', ')}</p>` : ''}${sorted.map(row).join('\n')}</body></html>`;
}
