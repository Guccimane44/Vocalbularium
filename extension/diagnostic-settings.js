import { currentLanguage, t } from './i18n.ts';

export async function diagnosticSettings({ send, root, navigate }) {
  const section = document.createElement('section');
  const title = document.createElement('h1'); title.textContent = t('account.diagnostics');
  const description = document.createElement('p');
  description.textContent = t('diagnostics.description');
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  const notice = document.createElement('p'); notice.setAttribute('role', 'alert');
  const form = document.createElement('form');
  const budgetLabel = document.createElement('label'); budgetLabel.textContent = t('diagnostics.budget');
  const budget = document.createElement('input'); budget.type = 'number'; budget.min = '0'; budget.max = '1024'; budget.step = '1';
  budgetLabel.append(budget); form.append(budgetLabel);
  const fields = {};
  for (const [key, label] of [['from', t('diagnostics.from')], ['to', t('diagnostics.to')]]) {
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
  const bytes = value => t('diagnostics.mebibytes', { value: new Intl.NumberFormat(currentLanguage(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / (1024 * 1024)) });
  async function refresh() {
    const value = await send({ type: 'diagnostics-status' });
    budget.value = String(value.local.budgetBytes / (1024 * 1024));
    status.textContent = t('diagnostics.buffer', { used: bytes(value.local.bytes), budget: bytes(value.local.budgetBytes) }) + ' ' +
      (value.backend ? t('diagnostics.backend', { used: bytes(value.backend.bytes), budget: bytes(value.backend.budgetBytes), mode: value.backend.mode }) : t('diagnostics.backendUnavailable'));
    const unhealthy = [value.local, value.backend].filter(item => item?.degraded);
    if (unhealthy.length) notice.textContent = t('diagnostics.degraded', { reasons: unhealthy.map(item => item.reason).join(', ') });
  }
  make(t('diagnostics.refresh'), refresh);
  make(t('diagnostics.apply'), async () => {
    await send({ type: 'diagnostics-configure', budgetBytes: Number(budget.value) * 1024 * 1024 });
    await refresh();
  });
  make(t('diagnostics.preview'), async () => {
    const value = await send({ type: 'diagnostics-cleanup', range: range(), preview: true });
    notice.textContent = t('diagnostics.previewResult', { count: value.backend.count, size: bytes(value.backend.bytes) });
  });
  make(t('diagnostics.clear'), async () => {
    const { dialog } = await import('./dialog.ts');
    const choice = await dialog({ title: t('diagnostics.clear.title'), message: t('diagnostics.clear.message'), choices: [t('common.cancel'), t('diagnostics.clear.confirm')] });
    if (choice.choice !== t('diagnostics.clear.confirm')) return;
    const value = await send({ type: 'diagnostics-cleanup', range: range() });
    await refresh(); notice.textContent = t('diagnostics.cleared', { backend: value.backend.count, local: value.local.count });
  });
  make(t('diagnostics.clearBuffer'), async () => {
    const { dialog } = await import('./dialog.ts');
    const choice = await dialog({ title: t('diagnostics.clearBuffer.title'), message: t('diagnostics.clearBuffer.message'), choices: [t('common.cancel'), t('diagnostics.clearBuffer.confirm')] });
    if (choice.choice === t('diagnostics.clearBuffer.confirm')) { await send({ type: 'diagnostics-local-cleanup', range: range() }); await refresh(); }
  });
  make(t('diagnostics.back'), () => navigate(''));
  form.append(buttons); section.append(title, description, status, form, notice); root.replaceChildren(section);
  await refresh();
}
