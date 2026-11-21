# Code standards

These are the rules a change keeps, grouped by area, with what fails when a rule is broken. **Nothing** in the second column means only a reviewer holds the rule, so take extra care there. The rules every change keeps, whatever its area, are still in the [rules table in AGENTS.md](../AGENTS.md#rules-and-what-enforces-them); they move here section by section.

A rule comes here from three places: the owner corrects a mistake, a lesson in [LESSONS.md](../LESSONS.md) is seen on a third separate day, or a review keeps asking for the same thing. When a rule here with **nothing** beside it is broken again, enforce it in the same change at the highest level that works (a design that makes the mistake impossible, then types, then a lint or CI check whose message names the fix, then a test), and show the check failing on the past mistake.

How to describe and review a change to a subsystem is in the [subsystem references](subsystems/README.md#describe-a-prs-change).

## Interface

Each rule is stated in one line; where it needs more, the linked section owns the full rule.

| Rule | Enforced by |
| --- | --- |
| No interface text in code: English strings are in `extension/locales/en/messages.json`, other languages beside them, a module's names in its folder ([interface language](specs/shared-ui.md#interface-language)). | `tests/localisation.test.mjs`; the `english-string` layout rule on every captured screen |
| Arabic mirrors the layout; generated content keeps its own direction, set on the content, never on the card. | `tests/browser/localisation.test.mjs`; the `rtl-mirror` layout rule (`tests/browser/layout-rules.test.mjs`) |
| Colours come from the theme's tokens. Saturated colour means a module family or a status, and a family colour always comes with a name or a text alternative ([visual identity](specs/shared-ui.md#visual-identity)). | the `token-colour` layout rule, for colours outside the tokens; nothing for the meaning of a colour |
| Status is always a word, never colour alone. Completed work shows no status ([list states](specs/shared-ui.md#list-state-presentation)). | nothing |
| Text of any length fits: a main key from one word to a passage, long module names, every interface language. | the `text-overflow` and `viewport-overflow` layout rules on every captured screen |
| Focus is always a visible 2 px ring, and every control is large enough to hit ([appearance](specs/shared-ui.md#appearance)). | the `focus-visible` and `target-size` layout rules |
| Every drag also works from the keyboard (Space, the arrow keys, Space, Escape) and is announced to screen readers. | the drag tests in `tests/browser/`; nothing makes a new drag do it |
| Menus close after an action, on Escape, on navigation and on a click outside, and return the focus to their trigger. Confirmation dialogs never close on a timer ([dialogs](specs/shared-ui.md#dialogs-menus-and-feedback)). | nothing |
| A row that holds a button is not itself one link: its text links, and the button sits beside it. | nothing |
| Things move by transform and opacity only, with the design system's durations; under reduced motion nothing moves ([motion](specs/shared-ui.md#motion)). | nothing for new code |
| A move draws no flicker, jump or flash. A move that slides, adds, deletes or navigates joins the motion catalogue. | `tests/browser/motion.test.mjs`, checked frame by frame by `tests/browser/motion.mjs`, for the moves in its catalogue |
| No font or other asset is loaded from the network; the fonts are bundled. Reading text is never smaller than 16 px. | nothing |
| A changed screen is looked at before it merges, and its [screen reference](screens/README.md) changes with it. | the screens job fails on a changed screen until the PR is labelled `screens-changed` ([screens](guides/screens.md)); nothing for the screen page |

The layout rules run on every screen `npm run screens` captures; `tests/screens/rules/allowlist.mjs` lists what the current screens break today, so only something new fails.
