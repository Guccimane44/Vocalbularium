# Accounts and synchronization

## Purpose and status

This specification defines sign-in and how saved data synchronizes between Chrome installations. Public accounts, registration, OAuth and passkeys (the owner's answers to Q02 and Q17, 5 October 2026) are still `Proposed`; [current scope](../product/scope.md) records their status.

## Account and sign-in

Vocabularium is account-based. The current build has one built-in owner-test account, `admin` with password `admin`, and no registration. It is one account with one set of decks and pages, not an account per installation: every Chrome installation signed in to the same backend sees the same data.

Clicking the extension button opens the dashboard in a Chrome tab when signed in, or the sign-in view otherwise. Successful sign-in opens the dashboard. A sign-in lasts seven days. **Log out** in the header ends it on that installation; account data and capture are unavailable until the user signs in again. An expired or revoked sign-in returns the user to the sign-in view.

## What the account owns

Decks, their configurations, the default-deck choice, and saved pages belong to the account and persist across closing and reopening Chrome. Unsaved drafts, capture receipts awaiting saving, the theme, and page-list sort orders belong to the installation.

## Browser sessions

Each Chrome installation has one browser session at a time, named by the installation, an epoch that grows each time the browser starts, and a session ID. Opening a new session ends the previous one: any generation that session had in progress is marked failed. A request from an older epoch, or from another session ID at the same epoch, is rejected as `stale_session`, so a browser that has been restarted never sees a reply meant for its earlier run.

## Synchronization

Open views refresh from the account every five seconds, and after each change the installation makes. Other installations' changes appear on the next refresh.

How saves from several installations are ordered, and what a failed save does, is in [capture and save](../subsystems/capture-and-save.md#saving-every-change).

## Save failures and recovery

Moved to [capture and save](../subsystems/capture-and-save.md#saving-every-change).
