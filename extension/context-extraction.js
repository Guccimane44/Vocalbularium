// Capture with Context: the selection's surrounding block, capped around
// CONTEXT_LIMIT characters (Pages and editing §Context).
export const CONTEXT_LIMIT = 500;

// Runs in the captured page through chrome.scripting, so it must stay
// self-contained. Returns the surrounding text, or null when there is none.
export function surroundingBlock(selectionText, limit) {
  const squash = value => value.replace(/\s+/g, ' ');
  let before, selected, after;
  const field = document.activeElement;
  if (field instanceof HTMLTextAreaElement || (field instanceof HTMLInputElement && ['text', 'search'].includes(field.type))) {
    const start = field.selectionStart ?? 0, end = field.selectionEnd ?? 0;
    [before, selected, after] = [field.value.slice(0, start), field.value.slice(start, end), field.value.slice(end)];
  } else {
    const selection = getSelection();
    if (!selection || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    const blockish = /^(block|list-item|table-cell|table-caption|flex|grid|flow-root)$/;
    let block = range.commonAncestorContainer;
    if (block.nodeType !== Node.ELEMENT_NODE) block = block.parentElement;
    while (block && block !== document.body && !blockish.test(getComputedStyle(block).display)) block = block.parentElement;
    block ??= document.body;
    const part = (from, to) => {
      const piece = document.createRange();
      piece.setStart(...from); piece.setEnd(...to);
      return piece.toString();
    };
    const start = [block, 0], end = [block, block.childNodes.length];
    [before, selected, after] = [part(start, [range.startContainer, range.startOffset]), range.toString(), part([range.endContainer, range.endOffset], end)];
  }
  const raw = squash(selected);
  selected = raw.trim();
  // A selection the menu did not report (another frame, a changed selection) yields no Context.
  if (!selected || selected !== squash(selectionText).trim()) return null;
  // Whitespace trimmed from the selection still separates it from its neighbors.
  before = squash(before + (raw.startsWith(' ') ? ' ' : '')).trimStart();
  after = squash((raw.endsWith(' ') ? ' ' : '') + after).trimEnd();
  // Without surrounding text, or with a selection filling the cap, Context adds nothing.
  if ((!before.trim() && !after.trim()) || selected.length >= limit) return null;
  const budget = Math.max(0, limit - selected.length);
  let tail = Math.min(before.length, Math.ceil(budget / 2));
  const head = Math.min(after.length, budget - tail);
  tail = Math.min(before.length, budget - head);
  const cutBefore = tail < before.length, cutAfter = head < after.length;
  const text = (cutBefore ? '…' : '') + before.slice(before.length - tail) + selected + after.slice(0, head) + (cutAfter ? '…' : '');
  return text.trim() || null;
}

// Context is optional: an unavailable page (restricted, PDF viewer, closed
// tab) captures the selection alone rather than delaying or failing capture.
// A busy page gets CONTEXT_TIMEOUT_MS before capture proceeds without it.
export const CONTEXT_TIMEOUT_MS = 1000;
export async function captureContext(info, tab, scripting = chrome.scripting) {
  let timer;
  try {
    const [result] = await Promise.race([
      scripting.executeScript({
        target: { tabId: tab.id, frameIds: [info.frameId ?? 0] },
        func: surroundingBlock,
        args: [info.selectionText, CONTEXT_LIMIT]
      }),
      new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('Context timed out.')), CONTEXT_TIMEOUT_MS); })
    ]);
    return typeof result?.result === 'string' && result.result ? result.result : undefined;
  } catch { return undefined; } finally { clearTimeout(timer); }
}
