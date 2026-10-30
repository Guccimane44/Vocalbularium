import type { BlockDocument } from '@vocabularium/contracts';
import { contentModule } from './catalog/index.js';
import { parentContentOf, providerCore } from './content.js';
import { plainLines } from './markdown.js';
import { isParentType } from './parents.js';

// A component's spoken parts (D24): what each one says, line by line, and in
// which language. A spoken core says the page's main key, in the language its
// flags name; a spoken facet says each of its lines in its own language. A
// part with nothing to say is left out. The server speaks them once the
// component is published.
export type SpokenPart = Readonly<{ part: string; language: string; lines: readonly string[] }>;

export function spokenParts(moduleType: string, content: BlockDocument, mainKey: string): SpokenPart[] {
  if (!isParentType(moduleType)) return [];
  const data = parentContentOf(content);
  if (!data) return [];
  const module = contentModule(moduleType);
  const parts: SpokenPart[] = [];
  const key = mainKey.trim();
  const core = module.core.spoken?.(providerCore(moduleType, data));
  if (core && key) parts.push({ part: 'core', language: core.language, lines: [key] });
  for (const facet of module.facets) {
    const text = (data.facets as Record<string, string | undefined>)[facet.id];
    const lines = facet.spoken && text ? plainLines(text).map(line => line.trim()).filter(Boolean) : [];
    if (facet.spoken && lines.length) parts.push({ part: facet.id, language: facet.spoken.language, lines });
  }
  return parts;
}
