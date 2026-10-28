// Formulas and code on a card (D17, K54): KaTeX renders LaTeX and
// highlight.js colours code, both bundled with the extension. A formula KaTeX
// cannot read shows its LaTeX source instead.
import katex from 'katex';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import python from 'highlight.js/lib/languages/python';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';

for (const [name, language] of Object.entries({ bash, c, cpp, csharp, go, java, javascript, json, python, rust, sql, typescript, xml })) hljs.registerLanguage(name, language);
hljs.registerAliases(['sh', 'shell'], { languageName: 'bash' });
hljs.registerAliases(['js'], { languageName: 'javascript' });
hljs.registerAliases(['ts'], { languageName: 'typescript' });
hljs.registerAliases(['py'], { languageName: 'python' });
hljs.registerAliases(['html'], { languageName: 'xml' });

export function MathBlock({ tex, display }: { tex: string; display: boolean }) {
  let html: string | null = null;
  try { html = katex.renderToString(tex, { displayMode: display, throwOnError: true, output: 'htmlAndMathml' }); }
  catch { html = null; }
  if (html === null) return display ? <pre className="md-math-source" dir="ltr"><code>{tex}</code></pre> : <code className="md-math-source">{tex}</code>;
  return display ? <div className="md-math" dir="ltr" dangerouslySetInnerHTML={{ __html: html }} />
    : <span className="md-math-inline" dir="ltr" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function CodeBlock({ language, text }: { language: string; text: string }) {
  const known = language && hljs.getLanguage(language);
  if (!known) return <pre className="md-code" dir="ltr"><code>{text}</code></pre>;
  return <pre className="md-code" dir="ltr" data-language={language}>
    <code className="hljs" dangerouslySetInnerHTML={{ __html: hljs.highlight(text, { language, ignoreIllegals: true }).value }} /></pre>;
}
