import { crumbText } from './crumb-text.ts';
import type { Crumb } from './crumb-text.ts';
import { t } from './i18n.ts';

// A view's trail from Home (0.16.2); see crumb-text.ts.
export function Crumbs({ crumbs }: { crumbs: readonly Crumb[] }) {
  return <nav className="crumbs" aria-label={t('nav.breadcrumb')}>
    <ol>{crumbs.map((crumb, index) => {
      const { shown, full } = crumbText(crumb.label);
      const last = index === crumbs.length - 1;
      return <li key={index}>{last || !crumb.go
        ? <span dir="auto" className={crumb.own ? 'crumb-own' : undefined} aria-current={last ? 'page' : undefined} title={shown !== full ? full : undefined}>{shown}</span>
        : <a href="#" dir="auto" className={crumb.own ? 'crumb-own' : undefined} title={shown !== full ? full : undefined} onClick={event => { event.preventDefault(); crumb.go!(); }}>{shown}</a>}</li>;
    })}</ol>
  </nav>;
}
