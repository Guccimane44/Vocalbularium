// Buttons with character (0.16.2): keycaps on a ledge — primary in ink,
// secondary on paper, quiet without a frame, danger in the failed colour —
// with a leading icon where it helps.
import test, { createTestApplication } from '../helpers/database.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, signIn } from './helpers.mjs';

test('buttons: New deck, deck settings’ Cancel and Save, and a deletion’s dialog wear the keycap system', { timeout: 60000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-buttons-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  const look = locator => locator.evaluate(node => {
    const css = getComputedStyle(node);
    return { className: node.className, icon: node.querySelector('svg')?.getAttribute('class') ?? null, ledge: /0px 2px 0px/.test(css.boxShadow), radius: css.borderRadius };
  });
  // Sign in leads with its arrow after the label.
  const signInButton = a.page.getByRole('button', { name: 'Sign in', exact: true });
  await signInButton.waitFor();
  assert.deepEqual(await look(signInButton), { className: 'primary', icon: 'button-icon icon-arrow', ledge: true, radius: '12px' });
  await signIn(a.page);

  // Home: New deck, primary with its +.
  const newDeck = a.page.getByRole('button', { name: 'New deck', exact: true });
  assert.deepEqual(await look(newDeck), { className: 'primary', icon: 'button-icon icon-plus', ledge: true, radius: '12px' });

  // Deck settings: a quiet Cancel, then Save with its check.
  await newDeck.click();
  const cancel = a.page.locator('.head-actions').getByRole('button', { name: 'Cancel', exact: true });
  const save = a.page.locator('.head-actions').getByRole('button', { name: 'Save', exact: true });
  assert.deepEqual(await look(cancel), { className: 'quiet', icon: null, ledge: false, radius: '12px' });
  assert.deepEqual(await look(save), { className: 'primary', icon: 'button-icon icon-check', ledge: true, radius: '12px' });
  await cancel.click();

  // Deleting a deck asks with a secondary Cancel and a danger Delete with its trash.
  await a.page.getByRole('group', { name: 'Options for My Deck', exact: true }).getByRole('button', { name: 'Delete deck', exact: true }).click();
  const dialog = a.page.getByRole('dialog');
  assert.deepEqual(await look(dialog.getByRole('button', { name: 'Cancel', exact: true })), { className: '', icon: null, ledge: true, radius: '12px' });
  assert.deepEqual(await look(dialog.getByRole('button', { name: 'Delete deck', exact: true })), { className: 'danger', icon: 'button-icon icon-trash', ledge: true, radius: '12px' });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
});
