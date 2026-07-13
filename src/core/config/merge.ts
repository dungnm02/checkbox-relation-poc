// §4.4a — merge FE default invariants with backend relations.
//
// Rules:
//  - FE defaults are merged first; backend relations apply on top (declaration order
//    also drives the §4.9 tie-break, so defaults deliberately precede backend).
//  - A backend relationship with the SAME id as an FE default overrides it (drops the default).
//  - A backend relationship in the reserved `fe.*` namespace that overrides no default → warning.
//  - Relationship ids must be globally unique — they are the reasons stored in disabledBy (§4.7).

import { ConfigError } from '../errors';
import type { RelationRule } from '../types';
import { FE_PREFIX, feDefaultRelations } from './defaults';

export interface MergeResult {
  relations: RelationRule[];
  warnings: string[];
}

export function mergeRelations(backend: RelationRule[] = []): MergeResult {
  const defaults = feDefaultRelations();

  const feIds = new Set<string>();
  for (const r of defaults) for (const rel of r.relationships) feIds.add(rel.id);

  const backendIds = new Set<string>();
  for (const r of backend) for (const rel of r.relationships) if (rel.id) backendIds.add(rel.id);

  const warnings: string[] = [];
  for (const id of backendIds) {
    if (id.startsWith(FE_PREFIX) && !feIds.has(id)) {
      warnings.push(
        `backend relationship "${id}" uses the reserved "${FE_PREFIX}*" namespace but overrides no FE default`,
      );
    }
  }

  // Drop FE default relationships overridden by a same-id backend relationship.
  const filteredDefaults: RelationRule[] = [];
  for (const r of defaults) {
    const kept = r.relationships.filter((rel) => !backendIds.has(rel.id));
    if (kept.length) filteredDefaults.push({ ...r, relationships: kept });
  }

  const relations = [...filteredDefaults, ...backend];

  // Global relationship-id uniqueness.
  const seen = new Set<string>();
  for (const r of relations) {
    for (const rel of r.relationships) {
      if (!rel.id) continue; // expandRules reports missing ids with more context
      if (seen.has(rel.id)) throw new ConfigError(`duplicate relationship id "${rel.id}"`);
      seen.add(rel.id);
    }
  }

  return { relations, warnings };
}
