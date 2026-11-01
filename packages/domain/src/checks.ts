import { contentModule, isContentModule } from './catalog/index.js';
import type { CheckTools, CoreValue } from './catalog/define.js';
import { MissingTool } from './catalog/tools.js';
export { MissingTool, requireTool } from './catalog/tools.js';

// A generated card's checks (0.16.0): every check of its core and of each
// facet it has, against the provider's JSON as the shapes passed it. Run by the
// golden sets and the language gate, never when a user generates a page.
export type CheckFailure = Readonly<{ part: string; check: string; message: string }>;
export type CheckOutcome = Readonly<{ failures: readonly CheckFailure[]; ran: number; skipped: readonly string[] }>;

export async function checkCard(type: string, card: Readonly<{ core: CoreValue; facets?: Readonly<Record<string, unknown>> }>, tools: CheckTools = {}): Promise<CheckOutcome> {
  if (!isContentModule(type)) return { failures: [], ran: 0, skipped: [] };
  const module = contentModule(type);
  const failures: CheckFailure[] = [];
  const skipped: string[] = [];
  let ran = 0;
  const parts = [{ id: 'core', value: card.core as unknown, checks: module.core.checks ?? [] },
    ...module.facets.filter(facet => card.facets?.[facet.id] !== undefined && card.facets?.[facet.id] !== null)
      .map(facet => ({ id: facet.id, value: card.facets![facet.id], checks: facet.checks ?? [] }))];
  for (const part of parts) for (const check of part.checks) {
    let message: string | null | undefined;
    try { message = await check.test(part.value, { core: card.core }, tools); }
    catch (error) {
      if (error instanceof MissingTool) { skipped.push(`${part.id}.${check.id}`); continue; }
      message = `the check could not read the part (${(error as Error).message})`;
    }
    ran++;
    if (message) failures.push({ part: part.id, check: check.id, message });
  }
  return { failures, ran, skipped };
}

