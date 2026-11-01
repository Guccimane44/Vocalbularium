import type { CheckTools } from './define.js';

// Thrown by a check whose tool the caller did not supply; the check is skipped.
export class MissingTool extends Error {}
export function requireTool<K extends keyof CheckTools>(tools: CheckTools, name: K): NonNullable<CheckTools[K]> {
  const tool = tools[name];
  if (!tool) throw new MissingTool(String(name));
  return tool as NonNullable<CheckTools[K]>;
}
