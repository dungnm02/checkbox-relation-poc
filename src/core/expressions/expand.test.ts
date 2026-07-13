import { describe, it, expect } from 'vitest';
import { desugar, matchUniverse } from './pattern';
import { expandRules, type ExpandedRule } from './expand';
import { collectLeaves } from '../config/seed';
import { ConfigError } from '../errors';
import type { NamedSelector, RelationRule } from '../types';
import { aiFeatureConfig } from '../../test/fixtures/aiFeature';

const universe = collectLeaves(aiFeatureConfig.content).map((l) => l.parsed);
const noSelectors = new Map<string, NamedSelector>();

function find(rules: ExpandedRule[], sourceId: string): ExpandedRule {
  const r = rules.find((x) => x.sourceId === sourceId);
  if (!r) throw new Error(`no expanded rule for ${sourceId}`);
  return r;
}

describe('pattern matching / aliases (§4.3)', () => {
  it('$VIEW matches every VIEW leaf across statuses', () => {
    const ids = matchUniverse(desugar('$VIEW', noSelectors), universe);
    expect(ids).toHaveLength(6); // 3 fields × 2 statuses
    expect(ids.every((id) => id.includes('/VIEW/'))).toBe(true);
  });

  it('positional wildcard pins status', () => {
    const ids = matchUniverse(desugar('AI_FEATURE/IN_PROGRESS/EDIT/*', noSelectors), universe);
    expect(ids).toHaveLength(3);
    expect(ids.every((id) => id.startsWith('AI_FEATURE/IN_PROGRESS/EDIT/'))).toBe(true);
  });

  it('rejects an unknown alias and unknown selector', () => {
    expect(() => desugar('$NOPE', noSelectors)).toThrow(/unknown expression alias/);
    expect(() => desugar('$SELECTOR(missing)', noSelectors)).toThrow(/unknown \$SELECTOR/);
  });
});

describe('relative binding: $EDIT → $VIEW (§4.4a pivot)', () => {
  const rules: RelationRule[] = [
    {
      id: 'fe.edit-checks-view',
      sourceId: '$EDIT',
      relationships: [{ id: 'fe.edit-checks-view', type: 'CASCADES_CHECK', targets: ['$VIEW'] }],
    },
  ];
  const expanded = expandRules(rules, noSelectors, universe);

  it('expands to one rule per concrete EDIT leaf', () => {
    expect(expanded).toHaveLength(6);
  });

  it('pairs each EDIT with the SAME-path, SAME-status VIEW only', () => {
    const rule = find(expanded, 'AI_FEATURE/IN_PROGRESS/EDIT/properties.name');
    expect(rule.relationships[0].targetIds).toEqual([
      'AI_FEATURE/IN_PROGRESS/VIEW/properties.name',
    ]);
  });
});

describe('validation (§4.3)', () => {
  it('rejects a zero-leaf source', () => {
    const rules: RelationRule[] = [
      { sourceId: 'AI_FEATURE/IN_PROGRESS/ACTION/nonexistent', relationships: [{ id: 'r', type: 'CASCADES_CHECK', targets: ['$VIEW'] }] },
    ];
    expect(() => expandRules(rules, noSelectors, universe)).toThrow(/resolves to zero leaves/);
  });

  it('rejects a cross-status target', () => {
    const rules: RelationRule[] = [
      {
        sourceId: '$EDIT',
        relationships: [
          { id: 'x', type: 'CASCADES_CHECK', targets: ['AI_FEATURE/IN_REVIEW/VIEW/description'] },
        ],
      },
    ];
    expect(() => expandRules(rules, noSelectors, universe)).toThrow(ConfigError);
    expect(() => expandRules(rules, noSelectors, universe)).toThrow(/cross statuses/);
  });

  it('rejects a self-loop for a cascade type', () => {
    const rules: RelationRule[] = [
      { sourceId: '$VIEW', relationships: [{ id: 'sl', type: 'CASCADES_CHECK', targets: ['$VIEW'] }] },
    ];
    expect(() => expandRules(rules, noSelectors, universe)).toThrow(/self-loop/);
  });

  it('resolves $SELECTOR but forbids selector-to-selector', () => {
    const selectors = new Map<string, NamedSelector>([
      ['allEdit', { name: 'allEdit', expression: '$EDIT' }],
      ['chain', { name: 'chain', expression: '$SELECTOR(allEdit)' }],
    ]);
    const ok: RelationRule[] = [
      { sourceId: '$SELECTOR(allEdit)', relationships: [{ id: 'r', type: 'CASCADES_CHECK', targets: ['$VIEW'] }] },
    ];
    expect(expandRules(ok, selectors, universe)).toHaveLength(6);

    const bad: RelationRule[] = [
      { sourceId: '$SELECTOR(chain)', relationships: [{ id: 'r', type: 'CASCADES_CHECK', targets: ['$VIEW'] }] },
    ];
    expect(() => expandRules(bad, selectors, universe)).toThrow(/references another selector/);
  });
});
