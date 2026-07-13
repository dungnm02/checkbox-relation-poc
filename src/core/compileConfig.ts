// The load-time entry point: BackendConfig → CompiledConfig. Parses ids, merges FE default
// invariants, compiles/validates expressions, builds the AdjacencyIndex, resolves visibility,
// and normalizes per-status trees. Throws (ConfigError/IdParseError) on any invalid config —
// a config typo is a boot error, never a silent runtime no-op (§2).

import { ConfigError } from './errors';
import { collectLeaves, seedInitialState } from './config/seed';
import { mergeRelations } from './config/merge';
import { buildFieldTree, indexCategories, type CategoryDescendants, type UITreeNode } from './config/tree';
import { expandRules } from './expressions/expand';
import { buildAdjacency } from './engine/adjacency';
import { compileVisibility } from './engine/visibility';
import { settleState, type EngineConfig } from './engine/resolveToggle';
import type { BackendConfig, CheckboxState, LeafId, NamedSelector } from './types';

export interface CompiledConfig {
  resourceType: string;
  resourceName: string;
  statuses: string[];
  initialState: CheckboxState;
  engine: EngineConfig;
  treesByStatus: Map<string, UITreeNode[]>;
  categoryIndexByStatus: Map<string, Map<string, CategoryDescendants>>;
  /** ACTION leaf ids per status, in config order (for the flat ACTION table). */
  actionsByStatus: Map<string, LeafId[]>;
  warnings: string[];
}

export function compileConfig(backend: BackendConfig): CompiledConfig {
  const collected = collectLeaves(backend.content);
  const universe = collected.map((l) => l.parsed);
  const seeded = seedInitialState(backend.content);

  const selectors = new Map<string, NamedSelector>();
  for (const s of backend.selectors ?? []) {
    if (selectors.has(s.name)) throw new ConfigError(`duplicate selector name "${s.name}"`);
    selectors.set(s.name, s);
  }

  const { relations, warnings } = mergeRelations(backend.relations);
  const expanded = expandRules(relations, selectors, universe);
  const adjacency = buildAdjacency(expanded);
  const visibility = compileVisibility(backend.visibility, selectors, universe);

  const treesByStatus = new Map<string, UITreeNode[]>();
  const categoryIndexByStatus = new Map<string, Map<string, CategoryDescendants>>();
  const actionsByStatus = new Map<string, LeafId[]>();
  for (const sc of backend.content) {
    const tree = buildFieldTree(sc.status, sc.field);
    treesByStatus.set(sc.status, tree);
    categoryIndexByStatus.set(sc.status, indexCategories(tree));
    actionsByStatus.set(sc.status, sc.action.map((a) => a.id));
  }

  const statuses = backend.statuses.length ? backend.statuses : backend.content.map((c) => c.status);

  const engine: EngineConfig = { adjacency, visibility, leafCount: universe.length };

  // Settle the seeded state to a fixed point so initial locks (REQUIRES/DISABLES/visibility)
  // and invariants hold from the first render.
  const initialState = settleState(seeded, engine);

  return {
    resourceType: backend.resourceType,
    resourceName: backend.resourceName,
    statuses,
    initialState,
    engine,
    treesByStatus,
    categoryIndexByStatus,
    actionsByStatus,
    warnings,
  };
}
