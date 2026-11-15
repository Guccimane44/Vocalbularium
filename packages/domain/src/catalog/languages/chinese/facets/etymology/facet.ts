import { defineFacet, escapeMarkdown, hasScript, list, object, text } from '../../../../blocks.js';
import { traditionalIn } from '../../simplified.js';

// Where the Chinese word comes from (0.16.4): the header "源自：古汉语 · 梵语",
// written by the module from the origins, never by the model, then a short
// history. It describes the key when it is Chinese, otherwise the Chinese word
// of its first meaning, `contextual` first. Words and phrases only.
const LABEL = '源自：';
const MAX_TEXT = 200;

export default defineFacet({
  id: 'etymology', label: 'Etymology', abbreviation: 'Et', description: 'Where the Chinese word comes from.',
  applies: ['word_phrase'],
  shape: object({ origins: list(text('the origin'), { name: 'the origins', each: 'Origin' }), text: text('the history') }),
  format: value => `${LABEL}${value.origins.map(origin => escapeMarkdown(origin.trim())).join(' · ')}\n\n${escapeMarkdown(value.text)}`,
  checks: [{
    id: 'chinese-origins', description: 'Each origin is named once, in Chinese characters only, without a middle dot or the label.',
    test: value => {
      const names = value.origins.map(origin => origin.trim());
      const twice = names.find((name, at) => names.indexOf(name) !== at);
      if (twice) return `"${twice}" is named twice`;
      return names.map(name => /[·・•]/.test(name) ? `"${name}" holds a middle dot`
        : /源自/.test(name) ? `"${name}" writes the label itself`
        : !hasScript(name, 'han') || /\p{Script=Latin}|\p{Script=Cyrillic}|\p{Script=Arabic}/u.test(name) ? `"${name}" is not named in Chinese characters`
        : null).find(Boolean) ?? null;
    }
  }, {
    id: 'etymology-text', description: `The history is Chinese, at most ${MAX_TEXT} characters, and does not start with the label.`,
    test: value => !hasScript(value.text, 'han') ? 'the history has no Chinese characters'
      : [...value.text].length > MAX_TEXT ? `the history has ${[...value.text].length} characters, more than ${MAX_TEXT}`
      : /^\s*源自[:：]/.test(value.text) ? 'the history writes the label itself' : null
  }, {
    id: 'simplified', description: 'The origins and the history are written in simplified characters, but for a source form quoted in 「」, such as Japanese 「銀行」.',
    test: value => { const found = traditionalIn([...value.origins, value.text.replace(/「[^」]*」/g, '')].join('')); return found ? `traditional characters: ${found}` : null; }
  }]
});
