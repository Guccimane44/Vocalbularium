# Shared UI

## Purpose and status

This specification defines interface rules shared across the extension's views. Release 0.5.1 implements it, including the module window of [D02](../architecture/traceability-map.md#entries) as revised by [D04](../architecture/traceability-map.md#entries). The visual identity is still open: the [vision](../product/vision.md#uiux-direction) calls for a distinctive interface, and the current views, the module window included, are a functional foundation.

## Module window

The **module window** is a panel on the right side of both the page view and deck settings. It lists the Context module, the Text module, and the content modules, each with its label (German explanation, German explanation + examples, Sentence usage, without angle brackets since 0.5.1) and a one-line description of what it contributes. The main key module is always present and is not in the window. Dragging a module from it:

- into deck settings adds an instance to the deck configuration, the template for new pages ([decks and configuration](decks-and-configuration.md#module-window));
- onto a page adds an instance to that page only ([pages and editing](pages-and-editing.md#shaping-a-page)).

While a module is dragged over the list, a floating preview follows the pointer and a line shows where it will land; after the drop, a placeholder holds its place until the module is saved. There is no **Add** button ([D04](../architecture/traceability-map.md#entries)). A module is disabled when the deck or page already holds 12 modules, and the Context module when one is already present; the window says why. On a narrow window the panel moves below the content.

Every drag also works from the keyboard: a window module or a card's drag handle is focusable; Space picks it up, the arrow keys move it through the landing places, Space drops it, and Escape cancels. A drag is announced to screen readers when it starts, moves, and ends. There are no separate move buttons ([D04](../architecture/traceability-map.md#entries)).

Releases 0.5.0 and 0.5.1 build it with today's styling ([plan](../plans/page-owned-modules.md)); the visual identity is a later milestone.

## Appearance

A labeled Light/Dark control in the shared header is available on the sign-in view and every product view. Light is the initial choice. The choice is stored per Chrome installation, separately from account data, and survives logout, closing views, restarting the browser, and updating the extension in place. Other installations can choose differently.

Changing the theme updates every open extension view, dialog, and active capture feedback immediately, without losing drafts, selection, navigation, or dialog state, and without restarting the feedback popup's timer. Browser-owned menus and frames follow Chrome's own appearance.

Both themes keep readable hover and focus states, non-color status cues, and usability in forced-colors mode. Normal text targets 4.5:1 contrast; large text and necessary control, status, and focus cues target 3:1 against adjacent colors.

## List state presentation

Page rows in a deck and entries in Recent captures show their generation outcome with a whole-row tint and an icon with an accessible description: completed is blue-green with a check, loading is amber with a clock, and failed is vermilion with a warning. Rows without a generation outcome stay neutral. These lists show no text badges for generation; the page view shows detailed status. The outcome rules are in [capture and generation](capture-and-generation.md#component-completion-and-failure).

A capture receipt that is still saving shows the loading treatment, labeled **Pending**. A receipt waiting to be saved again shows the failure treatment with "Not saved to your account", the error, and **Try saving again**. That is a save problem, not a generation failure, and color never implies that something was saved.

## Dialogs, menus, and feedback

Confirmation dialogs for retry, deletion, and unsaved changes stay open until the user chooses; they never close on a timer. Menus close after an action, on Escape, on navigation, and on a click outside, and return focus to their trigger. The capture feedback popup is defined in [capture and generation](capture-and-generation.md#capture-feedback-popup).

## Text content

Component content is shown as plain text, preserving line breaks and showing any markup literally. Rich rendering follows [Q13](../architecture/questionnaire/answers/answers-03-frontend.md#q13) and [Q59](../architecture/questionnaire/answers/answers-11-security-privacy.md#q59), which are still `Proposed`.
