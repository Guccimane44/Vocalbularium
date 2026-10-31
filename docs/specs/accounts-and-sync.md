# Accounts and synchronization

## Purpose and status

This specification defines sign-in and how saved data synchronizes between Chrome installations. Public accounts, registration, OAuth and passkeys ([Q02](../architecture/questionnaire/answers/answers-01-maturity-and-scope.md#q02), [Q17](../architecture/questionnaire/answers/answers-04-identity-sync.md#q17)) are still `Proposed`; [current scope](../product/scope.md) records their status.

## Account and sign-in

Vocabularium is account-based. The current build has one built-in owner-test account, `admin` with password `admin`, and no registration. It is one account with one set of decks and pages, not an account per installation: every Chrome installation signed in to the same backend sees the same data.

Clicking the extension button opens the dashboard in a Chrome tab when signed in, or the sign-in view otherwise. Successful sign-in opens the dashboard. A sign-in lasts seven days. **Log out** in the header ends it on that installation; account data and capture are unavailable until the user signs in again. An expired or revoked sign-in returns the user to the sign-in view.

## What the account owns

Decks, their configurations, the default-deck choice, and saved pages belong to the account and persist across closing and reopening Chrome. Unsaved drafts, capture receipts awaiting saving, the theme, and page-list sort orders belong to the installation.

## Synchronization

Open views refresh from the account every five seconds, and after each change the installation makes. Other installations' changes appear on the next refresh.

A save is never reported as saved before the account has persisted it. Saved changes from several installations are applied in the order they reach the server (FIFO), not in the order editing began or by device clocks. When two installations save different text for the same component, the later arrival becomes its content; there is no merge or conflict dialog. Saves to different components keep both changes, because a save sends only the components that changed. A save for a page, deck, or component that an earlier operation deleted fails instead of recreating it.

FIFO does not override the generation lock: a save that changes a generating component is rejected ([capture and generation](capture-and-generation.md#retry)).

## Save failures and recovery

A failed save keeps the pending change and offers **Try saving again**, which resubmits the same operation. Resubmitting an operation the server already applied returns its original result instead of applying it twice. **Try saving again** never generates content and is distinct from **Retry**. Saves interrupted by the extension worker stopping become available for explicit recovery when it starts again; they are never resubmitted silently. The detailed rules for captures and generation results are in [capture and generation](capture-and-generation.md#saving-and-synchronization-failures).
