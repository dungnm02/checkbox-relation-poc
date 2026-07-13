// §4.3 — expand rules whose sources/targets are expressions into concrete per-leaf rules.
//
// Relative wildcard binding: when a wildcard source expands, each concrete source binds its
// `*` positions; a `*` in a target at the SAME position inherits that bound value, while a
// `*` with no source counterpart fans out over all values. STATUS is special — it ALWAYS
// binds to the source's status, so a relation can never cross statuses (design §1, §4.3).

import { ConfigError } from '../errors';
import { FE_PREFIX } from '../config/defaults';
import type {
  Condition,
  LeafId,
  NamedSelector,
  RelationDefinition,
  RelationRule,
  RelationType,
} from '../types';
import type { ParsedId } from '../grammar/parseId';
import {
  desugar,
  matchUniverse,
  patternMatches,
  segsOf,
  S,
  WILD,
  type Pattern,
} from './pattern';

export interface ResolvedRelationship {
  id: string;
  type: RelationType;
  targetIds: LeafId[];
  priority: number;
  condition?: Condition;
  restoreCheckedOnSatisfy?: boolean;
  forceCheckedValue?: boolean;
}
export interface ExpandedRule {
  sourceId: LeafId;
  ruleId?: string;
  relationships: ResolvedRelationship[];
}

const CASCADE_TYPES = new Set<RelationType>([
  'CASCADES_CHECK',
  'CASCADES_UNCHECK',
  'CASCADES_BOTH',
  'GROUP_ALL',
]);
const SYMMETRY_TYPES = new Set<RelationType>(['MUTUAL_EXCLUSIVE', 'INVERSE', 'BIDIRECTIONAL']);
/** Self-loop (source ∈ targets) is nonsensical for checked-state + symmetry relations. */
const SELF_LOOP_REJECT = new Set<RelationType>([...CASCADE_TYPES, ...SYMMETRY_TYPES]);

/** Resolve a target pattern against one concrete source (relative binding). */
function resolveTargetPattern(sourcePat: Pattern, cs: Pattern, targetPat: Pattern): Pattern {
  const out: Pattern = ['', '', '', ''];
  for (let i = 0; i < 4; i++) {
    if (targetPat[i] !== WILD) {
      if (i === S && targetPat[i] !== cs[S]) {
        throw new ConfigError(
          `relation would cross statuses: source status "${cs[S]}" → target status "${targetPat[i]}" (§4.3)`,
        );
      }
      out[i] = targetPat[i];
    } else if (i === S) {
      out[i] = cs[S]; // status always binds to source
    } else if (sourcePat[i] === WILD) {
      out[i] = cs[i]; // relative inherit
    } else {
      out[i] = WILD; // fan-out
    }
  }
  return out;
}

function flagsFor(def: RelationDefinition): Partial<ResolvedRelationship> {
  if (def.type === 'REQUIRES') {
    return { restoreCheckedOnSatisfy: def.restoreCheckedOnSatisfy ?? false };
  }
  if (
    def.type === 'DISABLES_ON_CHECK' ||
    def.type === 'DISABLES_ON_UNCHECK' ||
    def.type === 'ENABLES_ON_CHECK' ||
    def.type === 'ENABLES_ON_UNCHECK'
  ) {
    return def.forceCheckedValue === undefined ? {} : { forceCheckedValue: def.forceCheckedValue };
  }
  return {};
}

export function expandRules(
  rules: RelationRule[],
  selectors: Map<string, NamedSelector>,
  universe: ParsedId[],
): ExpandedRule[] {
  const expanded: ExpandedRule[] = [];
  const byId = new Map<LeafId, ParsedId>(universe.map((p) => [p.raw, p]));

  for (const rule of rules) {
    const sourcePat = desugar(rule.sourceId, selectors);
    const sources = matchUniverse(sourcePat, universe);
    if (sources.length === 0) {
      // FE defaults are trusted and generic: a resource with no VIEW/EDIT leaves simply has
      // nothing for them to bind to, so they are skipped rather than treated as a config typo.
      if (rule.id?.startsWith(FE_PREFIX)) continue;
      throw new ConfigError(`source "${rule.sourceId}" resolves to zero leaves`);
    }

    // Precompute + standalone-validate each target expression once per relationship.
    for (const def of rule.relationships) {
      if (!def.id) throw new ConfigError(`relationship under source "${rule.sourceId}" is missing an id`);
      if (!def.targets?.length) {
        throw new ConfigError(`relationship "${def.id}" has no targets`);
      }
      for (const ref of def.targets) {
        const tPat = desugar(ref, selectors);
        if (matchUniverse(tPat, universe).length === 0) {
          throw new ConfigError(`target "${ref}" in "${def.id}" resolves to zero leaves`);
        }
      }
    }

    for (const source of sources) {
      const cs = segsOf(byId.get(source)!);
      const relationships: ResolvedRelationship[] = rule.relationships.map((def) => {
        const targetIds = new Set<LeafId>();
        for (const ref of def.targets) {
          const resolved = resolveTargetPattern(sourcePat, cs, desugar(ref, selectors));
          for (const p of universe) {
            if (patternMatches(resolved, p)) targetIds.add(p.raw);
          }
        }
        if (SELF_LOOP_REJECT.has(def.type) && targetIds.has(source)) {
          throw new ConfigError(
            `relationship "${def.id}" is a self-loop on "${source}" (${def.type}, §4.3)`,
          );
        }
        return {
          id: def.id,
          type: def.type,
          targetIds: [...targetIds],
          priority: def.priority ?? 0,
          ...(def.condition !== undefined ? { condition: def.condition } : {}),
          ...flagsFor(def),
        };
      });
      expanded.push({
        sourceId: source,
        ...(rule.id !== undefined ? { ruleId: rule.id } : {}),
        relationships,
      });
    }
  }
  return expanded;
}

export { CASCADE_TYPES, SYMMETRY_TYPES };
