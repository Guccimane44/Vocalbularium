import { startBackground } from '../background-runtime.js';
import { showFeedback } from '../feedback.js';

export default defineBackground({
  type: 'module',
  main() {
    // WXT must register Chrome listeners synchronously each time the worker starts.
    globalThis.handleCapture = startBackground();
    globalThis.showFeedback = showFeedback;
  }
});
