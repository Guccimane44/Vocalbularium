import { MODULES } from './modules.js';
import { dialog } from './dialog.js';

const page = type => ({ id: crypto.randomUUID(), modules: type ? [{ id: crypto.randomUUID(), type }] : [] });
export const newDeckDraft = () => ({ name: '', pages: [page('selected'), page('german-examples')] });
const sample = (type, inputType, instance) => {
  const selected = inputType === 'word_phrase' ? '幸福' : '我真的很幸福';
  if (type === 'selected') return selected;
  if (type === 'selected-language') return selected + '\nChinese';
  if (MODULES[type].applies !== inputType) return '';
  if (type === 'sentence-usage') return instance % 2 ? '想到我的家人和朋友，我觉得我真的很幸福。' : '在这个温暖的家里，我真的很幸福。';
  const explanation = '== Chinesisch (幸福, xìngfú) ==\n=== Bedeutungen ===\n: [1] Glück; Glückseligkeit; Wohlbefinden';
  return explanation + (type === 'german-examples' ? '\n=== Beispiele ===\n: [1] 她希望孩子们拥有幸福。\n:: Sie hofft, dass die Kinder Glück haben.' : '');
};

export function configurationView({ app, draft, element, button, send, onSaved, onCancel }) {
  const draw = () => {
    app.replaceChildren(element('p', 'DECK CONFIGURATION', 'eyebrow'), element('h1', draft.deck.id ? 'Shape your deck.' : 'A new collection.'));
    const columns = element('div', undefined, 'configuration');
    const controls = element('section', undefined, 'config-controls');
    const fields = element('fieldset'); fields.disabled = Boolean(draft.saving || draft.pending);
    const name = element('input'); name.id = 'deck-name'; name.value = draft.deck.name;
    const nameLabel = element('label', 'Deck name'); nameLabel.htmlFor = name.id;
    name.oninput = () => { draft.deck.name = name.value; };
    const count = element('select'); count.id = 'page-count';
    for (let i = 1; i <= 4; i++) { const option = element('option', String(i)); option.value = String(i); count.append(option); }
    count.value = String(draft.deck.pages.length);
    const countLabel = element('label', 'Number of pages'); countLabel.htmlFor = count.id;
    count.onchange = () => {
      const target = Number(count.value);
      while (draft.deck.pages.length < target) draft.deck.pages.push(page());
      draft.deck.pages.splice(target); draw();
    };
    fields.append(nameLabel, name, countLabel, count);
    const nav = element('nav', undefined, 'pages'); nav.setAttribute('aria-label', 'Configure pages');
    if (!draft.deck.pages.some(item => item.id === draft.selectedPage)) draft.selectedPage = draft.deck.pages[0].id;
    draft.deck.pages.forEach((item, index) => {
      const tab = button(`Page ${index + 1}`, () => { draft.selectedPage = item.id; draw(); });
      tab.setAttribute('aria-current', String(item.id === draft.selectedPage)); nav.append(tab);
    });
    fields.append(nav);
    const current = draft.deck.pages.find(item => item.id === draft.selectedPage);
    const box = element('section', undefined, 'module-page');
    box.append(element('h2', current === draft.deck.pages[0] ? 'Front page' : `Page ${draft.deck.pages.indexOf(current) + 1}`));
    if (!current.modules.length) box.append(element('p', 'No modules. This page will be empty.', 'muted'));
    current.modules.forEach((module, index) => {
      const block = element('div', undefined, 'module-block');
      const up = button('↑', () => { [current.modules[index - 1], current.modules[index]] = [current.modules[index], current.modules[index - 1]]; draw(); });
      up.disabled = index === 0; up.setAttribute('aria-label', `Move module ${index + 1} up`);
      const down = button('↓', () => { [current.modules[index], current.modules[index + 1]] = [current.modules[index + 1], current.modules[index]]; draw(); });
      down.disabled = index === current.modules.length - 1; down.setAttribute('aria-label', `Move module ${index + 1} down`);
      const remove = button('Remove', () => { current.modules.splice(index, 1); draw(); }); remove.setAttribute('aria-label', `Remove module ${index + 1}`);
      block.append(element('span', MODULES[module.type].label), up, down, remove); box.append(block);
    });
    if (current !== draft.deck.pages[0]) box.append(button('Remove this page', () => { draft.deck.pages = draft.deck.pages.filter(item => item !== current); draw(); }));
    fields.append(box, element('h2', 'Module library', 'section-title'));
    const library = element('div', undefined, 'module-library');
    for (const [type, module] of Object.entries(MODULES)) {
      library.append(button(`Add ${module.label}`, () => { current.modules.push({ id: crypto.randomUUID(), type }); draw(); }));
    }
    fields.append(library); controls.append(fields);
    const actions = element('div', undefined, 'dialog-actions');
    const save = button(draft.pending ? 'Try saving again' : 'Save', saveDraft, 'primary'); save.disabled = Boolean(draft.saving);
    actions.append(button('Cancel', onCancel), save); controls.append(actions);
    if (draft.error) controls.append(element('p', draft.error, 'notice error'));
    const showcase = element('section', undefined, 'showcase');
    showcase.append(element('h2', 'Example previews'), element('p', 'Illustrative samples only. Previews do not create or change cards.', 'muted'));
    const example = element('select'); example.id = 'sample-input';
    for (const [value, label] of [['word_phrase', 'Word / phrase: 幸福'], ['sentence', 'Sentence: 我真的很幸福']]) {
      const option = element('option', label); option.value = value; example.append(option);
    }
    example.value = draft.sampleType ?? 'word_phrase';
    const exampleLabel = element('label', 'Sample input'); exampleLabel.htmlFor = example.id;
    example.onchange = () => { draft.sampleType = example.value; draw(); };
    showcase.append(exampleLabel, example);
    draft.deck.pages.forEach((item, index) => {
      const preview = element('article', undefined, 'preview'); preview.append(element('h3', `Page ${index + 1} · Example`));
      const text = item.modules.map((module, instance) => sample(module.type, draft.sampleType ?? 'word_phrase', instance)).filter(Boolean).join('\n\n');
      preview.append(text ? element('pre', text) : element('p', 'Empty page', 'muted')); showcase.append(preview);
    });
    columns.append(controls, showcase); app.append(columns);
  };
  async function saveDraft() {
    const pending = draft.pending ?? { operationId: crypto.randomUUID(), payload: { deck: structuredClone(draft.deck), basePageIds: draft.basePageIds } };
    draft.pending = pending; draft.saving = true; draft.error = undefined; draw();
    try {
      const next = await send({ type: 'save-deck', ...pending });
      draft.pending = undefined; await onSaved(next);
    } catch (error) {
      if (error.code === 'content_loss') {
        const result = await dialog({ title: 'Delete page content?', message: error.message + ' This includes content saved from other installations.', choices: ['Cancel', 'Confirm'] });
        draft.pending = undefined;
        if (result.choice === 'Confirm') {
          draft.pending = { ...pending, payload: { ...pending.payload, confirmation: error.details.confirmation } };
          draft.saving = false; return saveDraft();
        }
      } else {
        draft.pending = ['invalid', 'front_page', 'deleted', 'replacement'].includes(error.code) ? undefined : pending; draft.error = error.message;
      }
    } finally { draft.saving = false; }
    draw();
  }
  draw();
}
