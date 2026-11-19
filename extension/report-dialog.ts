// Report a problem (D336): from the account menu, about the page shown (the whole
// page or one of its cards) or the screen. The worker saves it through the API
// with the extension's build; the API adds its own build, the page as it is and,
// when ticked, the last 15 minutes of logs. A notice then offers Undo.
import { t } from './i18n.ts';
import { moduleLabel } from './catalog-text.ts';
import { isContentType } from '@vocabularium/domain/page-modules';
import { BUILD } from './config.js';
import type { Page } from '@vocabularium/contracts';

type Send = (message: { type: string; [field: string]: unknown }) => Promise<any>;

const MAX_TEXT = 2000;
const NOTICE_MS = 10000;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
const check = () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('class', 'report-check');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', 'M5 12l5 5 9-10');
  svg.append(path);
  return svg;
};
const shortBuild = () => `${BUILD.version} · ${/^[0-9a-f]{40}$/.test(BUILD.commit) ? BUILD.commit.slice(0, 7) : BUILD.commit}`;

export function openReport({ send, page, screen }: { send: Send; page?: Page; screen: string }) {
  const operationId = crypto.randomUUID();
  const modal = element('dialog', 'report-dialog');
  const heading = element('h2', undefined, t('report.title')); heading.id = `report-${operationId}`;
  modal.setAttribute('aria-labelledby', heading.id);
  const intro = element('p', 'report-intro', t('report.intro'));

  // About: the whole page and each content card, or the screen.
  const about = element('fieldset', 'report-about');
  about.append(element('legend', undefined, t('report.about')));
  const choices = element('div', 'report-choices');
  const options = page
    ? [{ value: '', label: t('report.wholePage') }, ...page.components.filter(component => isContentType(component.moduleType)).map(component => ({ value: component.id, label: moduleLabel(component.moduleType) }))]
    : [{ value: '', label: t('report.thisScreen') }];
  for (const [index, option] of options.entries()) {
    const label = element('label', 'report-choice');
    const input = element('input'); input.type = 'radio'; input.name = `report-about-${operationId}`; input.value = option.value; input.checked = index === 0;
    label.append(input, check(), element('span', undefined, option.label));
    choices.append(label);
  }
  about.append(choices);

  const what = element('label', 'report-what', t('report.what'));
  const text = element('textarea'); text.rows = 4; text.maxLength = MAX_TEXT; text.required = true;
  what.append(text);

  // What is kept with it.
  const sent = element('div', 'report-sent');
  sent.append(element('p', undefined, t('report.sent')));
  const line = (label: string) => { const row = element('div', 'report-sent-row'); row.append(check(), element('span', undefined, label)); return row; };
  if (page) sent.append(line(t('report.sentPage')));
  sent.append(line(t('report.sentBuild', { build: shortBuild() })));
  const logs = element('label', 'report-sent-row');
  const includeLogs = element('input'); includeLogs.type = 'checkbox'; includeLogs.checked = true;
  logs.append(includeLogs, element('span', undefined, t('report.sentLogs')));
  sent.append(logs);
  const local = element('p', 'report-local', t('report.local'));
  const error = element('p', 'error'); error.setAttribute('role', 'alert');

  const actions = element('div', 'dialog-actions');
  const cancel = element('button', undefined, t('common.cancel')); cancel.type = 'button';
  const save = element('button', 'primary', t('report.save')); save.type = 'button'; save.disabled = true;
  actions.append(cancel, save);
  modal.append(heading, intro, about, what, sent, local, error, actions);

  const close = () => { modal.close(); modal.remove(); };
  text.oninput = () => { save.disabled = !text.value.trim(); };
  cancel.onclick = close;
  modal.addEventListener('cancel', () => modal.remove());
  save.onclick = async () => {
    save.disabled = true; error.textContent = '';
    const componentId = (modal.querySelector<HTMLInputElement>('.report-choice input:checked')?.value) || undefined;
    try {
      // One operation per dialog: saving again after a failure resends the same report.
      const { reportId } = await send({ type: 'report', operationId, text: text.value, screen, pageId: page?.id, componentId, includeLogs: includeLogs.checked });
      close();
      notice(send, reportId);
    } catch (cause) {
      error.textContent = cause instanceof Error ? cause.message : String(cause);
      save.disabled = false;
    }
  };
  document.body.append(modal);
  modal.showModal();
  text.focus();
}

// Report saved, with Undo while it shows.
function notice(send: Send, reportId: string) {
  document.querySelector('.report-notice')?.remove();
  const box = element('div', 'report-notice'); box.setAttribute('role', 'status');
  const words = element('div', 'report-notice-text');
  words.append(element('strong', undefined, t('report.saved')), element('span', undefined, t('report.savedDetail')));
  const undo = element('button', 'quiet', t('report.undo')); undo.type = 'button';
  box.append(check(), words, undo);
  const timer = setTimeout(() => box.remove(), NOTICE_MS);
  undo.onclick = async () => {
    clearTimeout(timer); undo.disabled = true;
    try {
      await send({ type: 'report-undo', operationId: crypto.randomUUID(), reportId });
      words.replaceChildren(element('strong', undefined, t('report.undone')));
      undo.remove();
    } catch (cause) {
      words.replaceChildren(element('strong', undefined, cause instanceof Error ? cause.message : String(cause)));
    }
    setTimeout(() => box.remove(), 4000);
  };
  document.body.append(box);
}
