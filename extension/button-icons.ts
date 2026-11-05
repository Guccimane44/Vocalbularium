// The icons that lead a button's label (0.16.2): + for something new, a check
// to save, an arrow to go on, a trash to delete. Stroke icons in currentColor
// on the 24 px grid, built as DOM so plain scripts can use them too.
const PATHS = {
  plus: ['M12 5v14M5 12h14'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  arrow: ['M5 12h13', 'M13 6l6 6-6 6'],
  trash: ['M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3']
} as const;
export type ButtonIconName = keyof typeof PATHS;
export function buttonIcon(name: ButtonIconName): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.3', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: `button-icon icon-${name}` })) svg.setAttribute(key, value);
  for (const d of PATHS[name]) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d); svg.append(path);
  }
  return svg;
}
export const buttonIconPaths = (name: ButtonIconName): readonly string[] => PATHS[name];
