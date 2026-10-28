// What a facet is written with (D11): shape building blocks and markdown
// helpers. Never facets: every module owns its own.
export { list, literal, object, oneOf, optional, text } from './shape.js';
export type { Shape } from './shape.js';
export { defineCore, defineFacet } from './define.js';
export { codeBlock, displayMath, escapeMarkdown, inlineMath, numbered, plainLines, table } from '../markdown.js';
