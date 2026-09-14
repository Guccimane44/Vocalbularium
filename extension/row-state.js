const labels = { completed: 'Completed', loading: 'Pending: generating', failed: 'Failed' };
const paths = {
  completed: ['M5 12l4 4L19 6'],
  loading: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18', 'M12 7v5l3 2'],
  failed: ['M12 3L2 21h20L12 3Z', 'M12 9v5', 'M12 17v1']
};
export function rowState(row, status, description = labels[status]) {
  row.classList.add('state-row');
  row.dataset.state = labels[status] ? status : 'neutral';
  if (!labels[status]) return null;
  const cue = document.createElement('span'); cue.className = 'state-icon';
  cue.id = `state-${crypto.randomUUID()}`; cue.setAttribute('role', 'img');
  cue.setAttribute('aria-label', description); cue.title = description;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
  for (const data of paths[status]) { const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', data); svg.append(path); }
  cue.append(svg);
  return cue;
}

export function openCardRow(row, entryButton, navigate) {
  const activate = event => {
    const selection = window.getSelection();
    if (event.detail && !selection.isCollapsed && row.contains(selection.anchorNode) && row.contains(selection.focusNode)) return;
    navigate();
  };
  entryButton.onclick = activate;
  row.onclick = event => { if (!event.target.closest('button')) activate(event); };
}
