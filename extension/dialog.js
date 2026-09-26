export function dialog({ title, message, choices, select }) {
  return new Promise(resolve => {
    const modal = document.createElement('dialog');
    const heading = document.createElement('h2'); heading.textContent = title; heading.id = `dialog-${crypto.randomUUID()}`;
    modal.setAttribute('aria-labelledby', heading.id);
    const text = document.createElement('p'); text.textContent = message;
    modal.append(heading, text);
    let input, confirm;
    if (select) {
      const label = document.createElement('label'); label.textContent = select.label;
      input = document.createElement('select');
      for (const option of select.options) { const node = document.createElement('option'); node.value = option.value; node.textContent = option.label; input.append(node); }
      label.append(input); modal.append(label);
      if (select.cursor && select.loadMore) {
        const more = document.createElement('button'); more.textContent = 'Load more decks';
        const error = document.createElement('p'); error.className = 'error'; error.setAttribute('role', 'alert');
        let cursor = select.cursor;
        more.onclick = async () => {
          more.disabled = true; error.textContent = '';
          try {
            const page = await select.loadMore(cursor);
            const known = new Set([...input.options].map(option => option.value));
            for (const option of page.options) {
              if (known.has(option.value)) continue;
              const node = document.createElement('option'); node.value = option.value; node.textContent = option.label; input.append(node);
            }
            cursor = page.nextCursor;
            if (confirm && input.options.length) confirm.disabled = false;
            if (!cursor) more.remove(); else more.disabled = false;
          } catch (cause) { error.textContent = cause.message; more.disabled = false; }
        };
        modal.append(more, error);
      }
    }
    const finish = choice => { modal.close(); modal.remove(); resolve({ choice, value: input?.value }); };
    const actions = document.createElement('div'); actions.className = 'dialog-actions';
    for (const choice of choices) {
      const button = document.createElement('button'); button.textContent = choice; button.onclick = () => finish(choice);
      if (choice === choices.at(-1) && input) { confirm = button; button.disabled = !input.options.length; }
      actions.append(button);
    }
    modal.append(actions);
    modal.oncancel = event => { event.preventDefault(); finish(choices[0]); };
    document.body.append(modal); modal.showModal();
  });
}
