import { describe, it, expect } from 'vitest';
import { mergeRelations } from './merge';
import { ConfigError } from '../errors';
import type { RelationRule } from '../types';

describe('mergeRelations (§4.4a)', () => {
  it('includes both FE defaults when there is no backend config', () => {
    const { relations, warnings } = mergeRelations();
    const ids = relations.flatMap((r) => r.relationships.map((rel) => rel.id));
    expect(ids).toEqual(['fe.edit-checks-view', 'fe.view-unchecks-edit']);
    expect(warnings).toEqual([]);
  });

  it('lets a backend relationship override an FE default by id', () => {
    const backend: RelationRule[] = [
      {
        sourceId: '$EDIT',
        relationships: [
          { id: 'fe.edit-checks-view', type: 'REQUIRES', targets: ['$VIEW'], restoreCheckedOnSatisfy: false },
        ],
      },
    ];
    const { relations, warnings } = mergeRelations(backend);
    const overriding = relations.flatMap((r) => r.relationships).filter((rel) => rel.id === 'fe.edit-checks-view');
    expect(overriding).toHaveLength(1);
    expect(overriding[0].type).toBe('REQUIRES'); // backend won
    // the other default survives
    const ids = relations.flatMap((r) => r.relationships.map((rel) => rel.id));
    expect(ids).toContain('fe.view-unchecks-edit');
    expect(warnings).toEqual([]);
  });

  it('warns on reserved-namespace squatting', () => {
    const backend: RelationRule[] = [
      { sourceId: '$ACTION', relationships: [{ id: 'fe.made-up', type: 'CASCADES_CHECK', targets: ['$VIEW'] }] },
    ];
    const { warnings } = mergeRelations(backend);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/reserved "fe\.\*" namespace/);
  });

  it('puts FE defaults before backend rules (tie-break order)', () => {
    const backend: RelationRule[] = [
      { sourceId: '$ACTION', relationships: [{ id: 'be.x', type: 'CASCADES_CHECK', targets: ['$VIEW'] }] },
    ];
    const { relations } = mergeRelations(backend);
    const ids = relations.flatMap((r) => r.relationships.map((rel) => rel.id));
    expect(ids.indexOf('fe.edit-checks-view')).toBeLessThan(ids.indexOf('be.x'));
  });

  it('throws on duplicate relationship ids', () => {
    const backend: RelationRule[] = [
      { sourceId: '$ACTION', relationships: [{ id: 'dup', type: 'CASCADES_CHECK', targets: ['$VIEW'] }] },
      { sourceId: '$VIEW', relationships: [{ id: 'dup', type: 'CASCADES_UNCHECK', targets: ['$EDIT'] }] },
    ];
    expect(() => mergeRelations(backend)).toThrow(ConfigError);
    expect(() => mergeRelations(backend)).toThrow(/duplicate relationship id/);
  });
});
