import { buttonIconPaths } from './button-icons.ts';
import type { ButtonIconName } from './button-icons.ts';

// A button's leading icon in React (0.16.2); see button-icons.ts.
export const ButtonIcon = ({ name }: { name: ButtonIconName }) => <svg className={`button-icon icon-${name}`} viewBox="0 0 24 24" fill="none" stroke="currentColor"
  strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{buttonIconPaths(name).map(d => <path key={d} d={d} />)}</svg>;
