export async function diagnosticSettings({ send, root, navigate }) {
  const section = document.createElement('section');
  const title = document.createElement('h1'); title.textContent = 'Diagnostic logs';
  const description = document.createElement('p');
  description.textContent = 'Logs help investigate captures, generation, and saves. They include captured text, prompts, and generated outputs, and remain until you clear them.';
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  const notice = document.createElement('p'); notice.setAttribute('role', 'alert');
  const form = document.createElement('form');
  const budgetLabel = document.createElement('label'); budgetLabel.textContent = 'Extension buffer budget (MiB)';
  const budget = document.createElement('input'); budget.type = 'number'; budget.min = '0'; budget.max = '1024'; budget.step = '1';
  budgetLabel.append(budget); form.append(budgetLabel);
  const fields = {};
  for (const [key, label] of [['from', 'From (UTC)'], ['to', 'To (UTC)']]) {
    const node = document.createElement('label'); node.textContent = label;
    const input = document.createElement('input'); input.type = 'datetime-local'; input.step = '1'; input.name = key;
    node.append(input); fields[key] = input; form.append(node);
  }
  const range = () => Object.fromEntries(Object.entries(fields).filter(([, input]) => input.value)
    .map(([key, input]) => [key, new Date(input.value + 'Z').toISOString()]));
  const buttons = document.createElement('div'); buttons.className = 'dialog-actions';
  const make = (text, action) => {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = text;
    button.onclick = async () => {
      button.disabled = true; notice.textContent = '';
      try { await action(); } catch (error) { notice.textContent = error.message; } finally { button.disabled = false; }
    };
    buttons.append(button); return button;
  };
  const bytes = value => `${(value / (1024 * 1024)).toFixed(2)} MiB`;
  async function refresh() {
    const value = await send({ type: 'diagnostics-status' });
    budget.value = String(value.local.budgetBytes / (1024 * 1024));
    status.textContent = `Extension buffer: ${bytes(value.local.bytes)} of ${bytes(value.local.budgetBytes)}. ` +
      (value.backend ? `Backend logs: ${bytes(value.backend.bytes)} of ${bytes(value.backend.budgetBytes)}. Content mode: ${value.backend.mode}.` : 'Backend unavailable; central logs cannot currently be managed.');
    const unhealthy = [value.local, value.backend].filter(item => item?.degraded);
    if (unhealthy.length) notice.textContent = 'Logging is degraded. Some diagnostic evidence may be missing. ' + unhealthy.map(item => item.reason).join(', ');
  }
  make('Refresh log status', refresh);
  make('Apply buffer budget', async () => {
    await send({ type: 'diagnostics-configure', budgetBytes: Number(budget.value) * 1024 * 1024 });
    await refresh();
  });
  make('Preview cleanup', async () => {
    const value = await send({ type: 'diagnostics-cleanup', range: range(), preview: true });
    notice.textContent = `${value.backend.count} backend entries (${bytes(value.backend.bytes)}) would be removed. Buffered entries in the same range will also be cleared.`;
  });
  make('Clear selected logs', async () => {
    const { dialog } = await import('./dialog.ts');
    const choice = await dialog({ title: 'Clear diagnostic logs?', message: 'Clear diagnostic history in the selected UTC range? Empty dates select all history up to now. Your kartes, drafts, and pending saves are preserved.', choices: ['Cancel', 'Clear logs'] });
    if (choice.choice !== 'Clear logs') return;
    const value = await send({ type: 'diagnostics-cleanup', range: range() });
    await refresh(); notice.textContent = `Cleared ${value.backend.count} backend entries and ${value.local.count} buffered entries.`;
  });
  make('Clear extension buffer only', async () => {
    const { dialog } = await import('./dialog.ts');
    const choice = await dialog({ title: 'Clear buffered diagnostic logs?', message: 'Clear the selected buffered evidence on this installation? Backend history is preserved.', choices: ['Cancel', 'Clear buffer'] });
    if (choice.choice === 'Clear buffer') { await send({ type: 'diagnostics-local-cleanup', range: range() }); await refresh(); }
  });
  make('Back to decks', () => navigate(''));
  form.append(buttons); section.append(title, description, status, form, notice); root.replaceChildren(section);
  await refresh();
}
