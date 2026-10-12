// Render contracts (D05, C17): content stays stored as each module's text; this
// turns that text into structure for reading. A renderer recognises the whole
// component or none of it, and never produces HTML: clients build their own
// elements from the result.

export type EntryHeading = Readonly<{ language: string; key: string | null; pronunciation: string | null }>;
export type Meaning = Readonly<{ number: string; text: string }>;
export type Example = Readonly<{ number: string; sentence: string; translation: string | null }>;
export type Rendered =
  | Readonly<{ kind: 'plain'; text: string }>
  | Readonly<{ kind: 'sentence'; text: string }>
  | Readonly<{ kind: 'entry'; heading: EntryHeading | null; meanings: readonly Meaning[]; examples: readonly Example[] }>;

const HEADING = /^==\s*([^=].*?)\s*==$/;
const SECTION = /^===\s*([^=].*?)\s*===$/;
const NUMBERED = /^:\s*\[(\d+[a-z]?)\]\s*(\S.*)$/;
const TRANSLATION = /^::\s*(\S.*)$/;

// "Chinesisch (幸福, xìngfú)" → language, key and pronunciation.
function heading(text: string): EntryHeading {
  const match = /^(.*?)\s*\((.*)\)$/.exec(text);
  if (!match || !match[1]) return { language: text, key: null, pronunciation: null };
  const [key, ...rest] = match[2].split(',').map(part => part.trim());
  return { language: match[1], key: key || null, pronunciation: rest.join(', ') || null };
}

// "== Language (key, pronunciation) ==", "=== Bedeutungen ===" with numbered
// meanings, and, where allowed, "=== Beispiele ===" with sentence pairs.
function entry(text: string, withExamples: boolean): Rendered | null {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  let index = 0;
  let head: EntryHeading | null = null;
  const top = HEADING.exec(lines[index] ?? '');
  if (top) { head = heading(top[1]); index++; }
  if (SECTION.exec(lines[index] ?? '')?.[1] !== 'Bedeutungen') return null;
  index++;
  const meanings: Meaning[] = [];
  for (let match; index < lines.length && (match = NUMBERED.exec(lines[index])); index++) meanings.push({ number: match[1], text: match[2].trim() });
  if (!meanings.length) return null;
  const examples: Example[] = [];
  if (index < lines.length) {
    if (!withExamples || SECTION.exec(lines[index])?.[1] !== 'Beispiele') return null;
    index++;
    while (index < lines.length) {
      const sentence = NUMBERED.exec(lines[index]);
      if (!sentence) return null;
      const translation = TRANSLATION.exec(lines[index + 1] ?? '');
      examples.push({ number: sentence[1], sentence: sentence[2].trim(), translation: translation ? translation[1].trim() : null });
      index += translation ? 2 : 1;
    }
    if (!examples.length) return null;
  }
  return { kind: 'entry', heading: head, meanings, examples };
}

export function renderContent(moduleType: string, text: string): Rendered {
  const plain: Rendered = { kind: 'plain', text };
  if (!text.trim()) return plain;
  if (moduleType === 'german-explanation') return entry(text, false) ?? plain;
  if (moduleType === 'german-examples') return entry(text, true) ?? plain;
  if (moduleType === 'sentence-usage') return { kind: 'sentence', text: text.trim() };
  return plain;
}

// Splits text around each occurrence of the main key, so a client can emphasise it.
export function emphasise(text: string, key: string): { text: string; key: boolean }[] {
  const needle = key.trim();
  if (!needle) return [{ text, key: false }];
  const parts: { text: string; key: boolean }[] = [];
  const lower = text.toLocaleLowerCase(), target = needle.toLocaleLowerCase();
  let from = 0;
  for (let at = lower.indexOf(target); at >= 0 && target.length === needle.length; at = lower.indexOf(target, from)) {
    if (at > from) parts.push({ text: text.slice(from, at), key: false });
    parts.push({ text: text.slice(at, at + needle.length), key: true });
    from = at + needle.length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), key: false });
  return parts.length ? parts : [{ text, key: false }];
}
