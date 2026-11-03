// The screen catalogue (0.16.0 increment A): every screen of the extension in a
// fixed state. Each entry opens its screen from the fixture account (`fixtures.mjs`)
// in any interface language: it finds elements by structure, never by their text.
// `phase` orders the run: `signed-out` and `empty` come before the account is filled;
// `languages` limits a screen to the interface languages it can be shown in.
import { GROUPS, STATES } from './fixtures.mjs';

const card = (page, type) => page.locator(`article.component[data-type="${type}"]`);
// Opens the module window's family group holding this element, when it is collapsed.
async function openFamily(page, inside) {
  const group = page.locator('.module-window details').filter({ has: page.locator(inside) });
  if (!await group.evaluate(node => node.open)) await group.locator('summary').click();
}
const sheet = page => page.locator('dialog.about-sheet');

const pageScreens = Object.keys(GROUPS).flatMap(group => STATES.map(state => ({
  name: `page-${group}-${state}`, phase: 'full', route: ({ pages }) => `page/${pages[`${group}-${state}`]}`,
  ready: page => card(page, GROUPS[group][0]).waitFor(),
  // A spoken card has loaded once its players have their length.
  settle: state === 'complete' && ['german', 'pronunciation'].includes(group)
    ? page => page.locator('.clip-player:not([data-state="ready"])').waitFor({ state: 'detached' }) : undefined
})));

export const SCREENS = [
  // Signed out there is no account to give a language: the form is always English (D14).
  { name: 'sign-in', phase: 'signed-out', languages: ['en'], route: () => '', ready: page => page.locator('section.login form').waitFor() },
  { name: 'dashboard-empty', phase: 'empty', route: () => '', ready: page => page.locator('#app h1').first().waitFor() },
  { name: 'dashboard', phase: 'full', route: () => '', ready: page => page.locator('.recent').waitFor() },
  { name: 'account-menu', phase: 'full', route: () => '', ready: page => page.locator('.recent').waitFor(),
    show: async page => { await page.locator('.account-trigger').press('Enter'); await page.locator('.account-panel').waitFor(); } },
  { name: 'language-list', phase: 'full', route: () => '', ready: page => page.locator('.recent').waitFor(),
    show: async page => {
      await page.locator('.account-trigger').press('Enter');
      await page.locator('.language-row').click();
      await page.locator('.language-choice').first().waitFor();
    } },
  { name: 'deck', phase: 'full', route: ({ deckId }) => `deck/${deckId}`, ready: page => page.locator('.page-row').first().waitFor() },
  { name: 'deck-empty', phase: 'full', route: ({ emptyDeckId }) => `deck/${emptyDeckId}`, ready: page => page.locator('#app h1').first().waitFor() },
  { name: 'deck-settings', phase: 'full', route: ({ deckId }) => `configure/${deckId}`, ready: page => page.locator('.module-window').waitFor() },
  { name: 'deck-new', phase: 'full', route: () => 'configure/new', ready: page => page.locator('.module-window').waitFor() },
  ...pageScreens,
  { name: 'page-new', phase: 'full', route: ({ pages }) => `page/${pages.new}`, ready: page => card(page, 'german').waitFor() },
  { name: 'facet-window', phase: 'full', route: ({ pages }) => `page/${pages['german-complete']}`, ready: page => card(page, 'german').waitFor(),
    show: async page => {
      await card(page, 'german').locator('.tab-button').click();
      // The card's actions are Edit, Retry and then Facet.
      await card(page, 'german').locator('.card-actions button').nth(2).click();
      await page.locator('.facet-window').waitFor();
    } },
  { name: 'module-window', phase: 'full', route: ({ pages }) => `page/${pages.new}`, ready: page => page.locator('.module-window').waitFor(),
    show: page => page.locator('.module-window details').evaluateAll(groups => { for (const group of groups) group.open = true; }) },
  { name: 'family-page', phase: 'full', route: ({ pages }) => `page/${pages.new}`, ready: page => page.locator('.module-window').waitFor(),
    show: async page => {
      await page.locator('.module-window details').filter({ has: page.locator('.window-module[data-type="german"]') }).locator('.family-open').click();
      await sheet(page).waitFor();
    } },
  { name: 'module-page', phase: 'full', route: ({ pages }) => `page/${pages.new}`, ready: page => page.locator('.module-window').waitFor(),
    show: async page => {
      await openFamily(page, '.window-module[data-type="german"]');
      await page.locator('.window-module[data-type="german"] .window-about').click();
      await sheet(page).locator('.about-key').waitFor();
    } },
  { name: 'facet-page', phase: 'full', route: ({ pages }) => `page/${pages.new}`, ready: page => page.locator('.module-window').waitFor(),
    show: async page => {
      await openFamily(page, '.window-module[data-type="german"]');
      await page.locator('.window-module[data-type="german"] .window-about').click();
      await sheet(page).locator('.about-row').first().click();
      await sheet(page).locator('.about-applies').waitFor();
    } },
  { name: 'diagnostics', phase: 'full', route: () => 'diagnostics', ready: page => page.locator('section h1').waitFor() }
];
