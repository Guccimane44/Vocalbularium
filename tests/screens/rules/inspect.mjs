// The in-page half of the layout rules: one self-contained function that
// Playwright serialises into the page, so it may use nothing from outside its
// own body. It measures; the Node half (index.mjs) decides what is allowed.

/**
 * @param {{ landmarks: readonly { name: string, selector: string, within: string, side: 'start' | 'end' }[], minTarget: number }} options
 */
export function inspect({ landmarks, minTarget }) {
  const INTERACTIVE = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="radio"], [role="checkbox"], [role="tab"], [role="switch"], [tabindex]:not([tabindex="-1"])';
  const viewport = { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight };
  const forced = matchMedia('(forced-colors: active)').matches;
  const direction = getComputedStyle(document.documentElement).direction;

  // Every element of the document and its open shadow roots, in document order.
  const elements = [];
  const collect = root => {
    for (const element of root.querySelectorAll('*')) {
      elements.push(element);
      if (element.shadowRoot) collect(element.shadowRoot);
    }
  };
  collect(document);

  const describe = element => {
    const part = node => {
      let text = node.localName;
      if (node.id) return `${text}#${CSS.escape(node.id)}`;
      for (const name of [...node.classList].slice(0, 3)) text += `.${CSS.escape(name)}`;
      for (const attribute of ['data-type', 'data-facet', 'data-language']) {
        const value = node.getAttribute(attribute);
        if (value) text += `[${attribute}="${value}"]`;
      }
      return text;
    };
    const parts = [];
    for (let node = element; node && node.nodeType === 1 && parts.length < 4; node = node.parentElement ?? node.getRootNode().host) {
      parts.unshift(part(node));
      if (node.id || node === document.body) break;
    }
    return parts.join(' > ');
  };
  const style = element => getComputedStyle(element);
  // Shown, and not one of the visually hidden texts kept for screen readers.
  const shown = element => {
    if (!element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    const box = element.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) return false;
    for (let node = element; node; node = node.parentElement) {
      const each = style(node);
      if (each.clip && each.clip !== 'auto' || each.clipPath && each.clipPath !== 'none' && /inset\(50%|circle\(0/.test(each.clipPath)) return false;
      const rect = node.getBoundingClientRect();
      if (rect.width <= 1 && rect.height <= 1 && each.overflow !== 'visible') return false;
    }
    return true;
  };
  const truncated = element => {
    for (let node = element; node; node = node.parentElement) {
      const each = style(node);
      if (each.textOverflow === 'ellipsis' || each.webkitLineClamp && each.webkitLineClamp !== 'none') return true;
      if (each.display !== 'inline' && each.display !== 'contents' && node !== element) break;
    }
    return false;
  };
  // The box a text is measured against: its nearest ancestor that is not inline.
  const blockOf = element => {
    let node = element;
    while (node.parentElement && ['inline', 'contents'].includes(style(node).display)) node = node.parentElement;
    return node;
  };
  // The nearest ancestor that hides what leaves it, or null; a scroll container lets its content scroll.
  const clipperOf = element => {
    for (let node = element.parentElement; node; node = node.parentElement) {
      const each = style(node);
      if (/(auto|scroll)/.test(each.overflowX + each.overflowY)) return { scrolls: true, node };
      if (/(hidden|clip)/.test(each.overflowX + each.overflowY)) return { scrolls: false, node };
    }
    return null;
  };
  const textRects = element => {
    const rects = [];
    for (const node of element.childNodes) {
      if (node.nodeType !== 3 || !/\S/.test(node.textContent)) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) if (rect.width > 0) rects.push(rect);
    }
    return rects;
  };
  const ownText = element => [...element.childNodes].filter(node => node.nodeType === 3).map(node => node.textContent).join('').replace(/\s+/g, ' ').trim();

  const found = { overflow: [], wide: [], targets: [], focus: [], landmarks: {}, texts: [], colours: [], direction, forced, viewport };

  // 1. Text that leaves its box, or that an ancestor cuts off.
  for (const element of elements) {
    if (element.closest('svg, input, textarea, select, script, style, noscript, [contenteditable="true"]')) continue;
    const rects = textRects(element);
    if (!rects.length || !shown(element) || truncated(element)) continue;
    const fontSize = parseFloat(style(element).fontSize) || 16;
    const slack = Math.max(2, fontSize * 0.3);
    const block = blockOf(element);
    const box = block.getBoundingClientRect();
    const clipper = clipperOf(block);
    const text = ownText(element).slice(0, 60);
    const outside = (rect, area, vertical) => rect.left < area.left - 1 || rect.right > area.right + 1
      || vertical && (rect.top < area.top - slack || rect.bottom > area.bottom + slack);
    if (rects.some(rect => outside(rect, box, true))) {
      // A box that scrolls lets its text scroll; one that hides its overflow cuts it off.
      const overflow = style(block).overflowX + style(block).overflowY;
      if (!/(auto|scroll)/.test(overflow)) found.overflow.push({ selector: describe(block), kind: /(hidden|clip)/.test(overflow) ? 'clipped' : 'overflows', text });
      continue;
    }
    if (clipper && !clipper.scrolls && !truncated(clipper.node)) {
      const area = clipper.node.getBoundingClientRect();
      if (rects.some(rect => outside(rect, area, true))) found.overflow.push({ selector: describe(block), kind: 'clipped', clipper: describe(clipper.node), text });
    }
  }

  // 2. Anything past the viewport's inline edges, reported at its outermost element.
  const scrollWidth = document.documentElement.scrollWidth;
  const wide = [];
  for (const element of elements) {
    const box = element.getBoundingClientRect();
    if (box.right <= viewport.width + 1 && box.left >= -1) continue;
    if (!shown(element)) continue;
    const clipper = clipperOf(element);
    if (clipper && clipper.node !== document.body && clipper.node !== document.documentElement) {
      const area = clipper.node.getBoundingClientRect();
      if (area.right <= viewport.width + 1 && area.left >= -1) continue;
    }
    if (wide.some(outer => outer.contains(element))) continue;
    wide.push(element);
    found.wide.push({ selector: describe(element), left: Math.round(box.left), right: Math.round(box.right) });
  }
  if (scrollWidth > viewport.width + 1 && !found.wide.length) found.wide.push({ selector: 'html', left: 0, right: scrollWidth });

  // 3. Targets of at least minTarget × minTarget, or spaced so a circle of that diameter around each touches no other.
  const targets = elements.filter(element => element.matches(INTERACTIVE) && !element.matches(':disabled') && shown(element)).map(element => {
    // A control inside its label is as large as the label.
    const label = element.matches('input') ? element.closest('label') : null;
    const box = (label ?? element).getBoundingClientRect();
    return { element, box };
  });
  // A link inside a sentence is exempt, as WCAG 2.5.8 says.
  const inline = element => element.matches('a') && style(element).display === 'inline' && ownText(element.parentElement ?? element) !== '';
  const centre = box => ({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
  const small = targets.filter(each => (each.box.width < minTarget - 0.5 || each.box.height < minTarget - 0.5) && !inline(each.element));
  for (const each of small) {
    const c = centre(each.box), r = minTarget / 2;
    const crowded = targets.some(other => {
      if (other === each || other.element.contains(each.element) || each.element.contains(other.element)) return false;
      if (small.includes(other)) { const o = centre(other.box); return Math.hypot(o.x - c.x, o.y - c.y) < minTarget; }
      const x = Math.max(other.box.left, Math.min(c.x, other.box.right)), y = Math.max(other.box.top, Math.min(c.y, other.box.bottom));
      return Math.hypot(x - c.x, y - c.y) < r;
    });
    if (crowded) found.targets.push({ selector: describe(each.element), width: Math.round(each.box.width), height: Math.round(each.box.height) });
  }
  // The focused element, when the keyboard put it there, shows a ring or a shadow.
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  if (active && active !== document.body && active.matches(':focus-visible') && shown(active)) {
    const each = style(active);
    const transparent = colour => /^(transparent|rgba\(.*,\s*0\)|color\(.*\/\s*0\))$/.test(colour);
    const ring = each.outlineStyle !== 'none' && parseFloat(each.outlineWidth) >= 1 && !transparent(each.outlineColor);
    const shadow = each.boxShadow !== 'none' && !each.boxShadow.split(/,(?![^(]*\))/).every(part => /(rgba\([^)]*,\s*0\)|transparent)/.test(part));
    if (!ring && !shadow && !forced) found.focus.push({ selector: describe(active) });
  }

  // 4. Where each landmark stands: its box and the box of what it stands in.
  for (const landmark of landmarks) {
    for (const element of document.querySelectorAll(landmark.selector)) {
      if (!shown(element)) continue;
      const within = landmark.within === 'viewport' ? null : element.parentElement?.closest(landmark.within);
      if (landmark.within !== 'viewport' && !within) continue;
      const area = within ? within.getBoundingClientRect() : { left: 0, right: viewport.width };
      const box = element.getBoundingClientRect();
      (found.landmarks[landmark.name] ??= []).push({ selector: describe(element), left: box.left - area.left, right: area.right - box.right, width: area.right - area.left });
      break;
    }
  }

  // 5. Visible texts, whole and per element, for the catalogue rule.
  for (const element of elements) {
    if (element.closest('script, style, noscript, svg')) continue;
    const own = ownText(element);
    if (!/\p{L}{2}/u.test(own) || !shown(element)) continue;
    const whole = element.textContent.replace(/\s+/g, ' ').trim();
    found.texts.push({ selector: describe(element), own, whole, content: element.closest('[data-content], .md, .meaning, .main-key, .entry, .entry-content, .capture-text, .nav-label, .deck h2, .deck-view h1 bdi, .capture-deck, time, .language-name, .language-row-value, .account-name, .account-server, .facet-tab-mark, .facet-tag-mark, .sample-page, .explanation-samples, .explanation-sample, .brand') !== null });
  }

  // 6. Computed colours of what is shown.
  if (!forced) {
    for (const element of elements) {
      if (element.closest('script, style, noscript') || !shown(element)) continue;
      const each = style(element);
      const colours = [];
      if (textRects(element).length) colours.push(['color', each.color]);
      colours.push(['background-color', each.backgroundColor]);
      for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
        if (each[`border${side}Style`] !== 'none' && parseFloat(each[`border${side}Width`]) > 0) colours.push(['border-color', each[`border${side}Color`]]);
      }
      if (each.boxShadow !== 'none') for (const match of each.boxShadow.matchAll(/(rgba?\([^)]*\)|color\([^)]*\)|oklab\([^)]*\)|oklch\([^)]*\)|lab\([^)]*\)|lch\([^)]*\))/g)) colours.push(['box-shadow', match[1]]);
      for (const [property, value] of colours) found.colours.push({ selector: describe(element), property, value });
    }
  }
  return found;
}
