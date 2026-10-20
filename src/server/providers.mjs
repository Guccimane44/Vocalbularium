import { OpenCodeProvider } from './opencode.mjs';

// The provider is chosen by configuration (D11), one pinned model at a time
// (Q46). OpenCode is the only adapter.
const ADAPTERS = { opencode: OpenCodeProvider };

export function createProvider(name = process.env.GENERATION_PROVIDER ?? 'opencode', options) {
  const Adapter = ADAPTERS[name];
  if (!Adapter) throw new Error(`Unknown generation provider "${name}".`);
  return new Adapter(options);
}
