export function dialog({ title, message, choices, select }) {
  return new Promise(resolve => {
    const modal = document.createElement('dialog');
    const heading = document.createElement('h2'); heading.textContent = title;
    const text = document.createElement('p'); text.textContent = message;
    modal.append(heading, text);
    let input;
    if (select) {
      const label = document.createElement('label'); label.textContent = select.label;
      input = document.createElement('select');
      for (const option of select.options) { const node = document.createElement('option'); node.value = option.value; node.textContent = option.label; input.append(node); }
      label.append(input); modal.append(label);
    }
    const finish = choice => { modal.close(); modal.remove(); resolve({ choice, value: input?.value }); };
    const actions = document.createElement('div'); actions.className = 'dialog-actions';
    for (const choice of choices) { const button = document.createElement('button'); button.textContent = choice; button.onclick = () => finish(choice); actions.append(button); }
    modal.append(actions);
    modal.oncancel = event => { event.preventDefault(); finish(choices[0]); };
    document.body.append(modal); modal.showModal();
  });
}
