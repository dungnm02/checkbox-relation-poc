// §2 AdjacencyIndex — map each node to the relationship effects that must be recomputed
// when that node changes. Trigger sets depend on the relation's direction:
//   - checked-state / disable relations : triggered by the SOURCE
//   - BIDIRECTIONAL                     : triggered by source AND every target (symmetric)
//   - REQUIRES                          : triggered by every TARGET (direction inverted)
//   - any rule with a condition         : also triggered by its condition inputs

import type { LeafId } from '../types';
import type { ExpandedRule, ResolvedRelationship } from '../expressions/expand';
import { conditionIds } from './effects';

export interface TriggerEntry {
  sourceId: LeafId;
  rel: ResolvedRelationship;
  /** Global declaration order, for the §4.9 tie-break. */
  order: number;
}

export interface AdjacencyIndex {
  byTrigger: Map<LeafId, TriggerEntry[]>;
}

function triggersFor(sourceId: LeafId, rel: ResolvedRelationship): LeafId[] {
  const base =
    rel.type === 'REQUIRES'
      ? [...rel.targetIds]
      : rel.type === 'BIDIRECTIONAL'
        ? [sourceId, ...rel.targetIds]
        : [sourceId];
  return [...base, ...conditionIds(rel.condition)];
}

export function buildAdjacency(rules: ExpandedRule[]): AdjacencyIndex {
  const byTrigger = new Map<LeafId, TriggerEntry[]>();
  let order = 0;
  for (const rule of rules) {
    for (const rel of rule.relationships) {
      const entry: TriggerEntry = { sourceId: rule.sourceId, rel, order: order++ };
      const triggers = new Set(triggersFor(rule.sourceId, rel));
      for (const node of triggers) {
        const list = byTrigger.get(node);
        if (list) list.push(entry);
        else byTrigger.set(node, [entry]);
      }
    }
  }
  return { byTrigger };
}
