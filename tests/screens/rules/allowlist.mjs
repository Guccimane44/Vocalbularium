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
    description: 'In Moss night the Appearance control’s selected segment keeps the light theme’s shadow, rgba(27, 36, 25, 0.18), not a dark token.' }
]);
