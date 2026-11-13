// What the real screens on main break today, kept so the rules can fail on
// anything new without changing the product in 0.16.0. Each entry names the
// screen (or '*' for every screen), the rule, the selector checkLayout reports
// and what is wrong; each is a candidate for 0.17.0's refinement. A rule that
// is noisy on correct screens is tightened, never quietened here.
/** @type {readonly import('./index.mjs').AllowEntry[]} */
export const ALLOWLIST = Object.freeze([
  { screen: '*', rule: 'target-size', selector: 'div.card-head > div.card-tab > span.row-menu > button.menu-button',
    description: 'A card tab’s ⋯ menu button is 22 × 28 px, flush against the tab button beside it.' },
  { screen: '*', theme: 'dark', rule: 'token-colour', selector: 'fieldset#theme-control > div.segmented > label',
    description: 'In Moss night the Appearance control’s selected segment keeps the light theme’s shadow, rgba(27, 36, 25, 0.18), not a dark token.' },
  { screen: '*', theme: 'dark', rule: 'token-colour', selector: 'div.card-head > div.card-tab > span.spark > i',
    description: 'In the dark theme a loading card’s spark glows in white, rgb(255, 255, 255), and in light mixes of its family colour, not dark tokens.' },
  { screen: ['family-page', 'module-page', 'facet-page'], rule: 'target-size', selector: 'details.window-family.fam-translation > ul > li.window-module.fam-translation[data-type="chinese"] > button.window-about',
    description: 'In the module window, a module’s About link is 21 px tall, under 24 px, right below the module’s own button.' },
  { screen: ['family-page', 'module-page', 'facet-page'], rule: 'target-size', selector: 'details.window-family.fam-translation > ul > li.window-module.fam-translation[data-type="english"] > button.window-about',
    description: 'In the module window, a module’s About link is 21 px tall, under 24 px, right below the module’s own button.' },
  { screen: ['family-page', 'module-page', 'facet-page'], rule: 'target-size', selector: 'details.window-family.fam-notes > ul > li.window-module.fam-notes[data-type="text"] > button.window-about',
    description: 'In the module window, a module’s About link is 21 px tall, under 24 px, right below the module’s own button.' },
  { screen: ['family-page', 'module-page', 'facet-page'], rule: 'target-size', selector: 'details.window-family.fam-notes > ul > li.window-module.fam-notes[data-type="context"] > button.window-about',
    description: 'In the module window, a module’s About link is 21 px tall, under 24 px, right below the module’s own button.' },
  { screen: 'page-expertise-complete', rule: 'text-overflow', selector: 'div.card-body > div.entry-content > div.md.entry-core > p',
    description: 'On Linux, the Computer science card’s explanation (“\"Hello, world\" is the traditional first program…”) overflows its paragraph instead of wrapping.' }
]);
