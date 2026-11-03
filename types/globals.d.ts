// The globals the extension's JavaScript reads that no module declares.
import type { defineBackground as wxtDefineBackground } from 'wxt/utils/define-background';
import type { startBackground } from '../extension/background-runtime.js';
import type { showFeedback as feedback } from '../extension/feedback.js';

declare global {
  // Replaced by WXT's build (wxt.config.mjs); unset where the source runs unbundled, as in the tests.
  const __VOCABULARIUM_API_URL__: string | undefined;
  // WXT's auto-import in an entrypoint.
  const defineBackground: typeof wxtDefineBackground;
  // What the worker's entrypoint exposes on its global scope.
  var handleCapture: ReturnType<typeof startBackground> | undefined;
  var showFeedback: typeof feedback | undefined;
  // The capture feedback shown in a page (feedback-view.js): its host and its theme listener.
  var vocabulariumFeedback: { host: HTMLElement; listener: (message: { type?: string; theme?: string }, sender: ChromeMessageSender) => void } | undefined;
}
export {};
